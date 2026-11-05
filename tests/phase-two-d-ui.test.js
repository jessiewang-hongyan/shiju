import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  createSource,
  createDocument,
} from "../dist/modules/document-model.js";
import { createHistory } from "../dist/modules/document-commands.js";
import { createMultiImage } from "../dist/modules/image-v2.js";
import { createImage } from "../dist/modules/image.js";

// DOM and drawing-command integration only; this is not a browser or pixel test.
test("2D controls, preview isolation, undo, frozen export, retry and blob failure", async () => {
  const dom = new JSDOM(
    readFileSync(new URL("../dist/phase-two.html", import.meta.url), "utf8"),
    { url: "http://localhost/", pretendToBeVisual: true },
  );
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
  };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const timers = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    const t = previous.setTimeout(fn, ms, ...args);
    timers.push(t);
    return t;
  };
  const contexts = [],
    blobs = [],
    downloads = [];
  const nativeCreate = URL.createObjectURL,
    nativeRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:local-test";
  URL.revokeObjectURL = () => {};
  const makeContext = () => {
    const calls = [];
    const ctx = {
      calls,
      font: "23px serif",
      measureText: (text) => ({
        width: Array.from(text).length * 23,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: Array.from(text).length * 23,
        actualBoundingBoxAscent: 20,
        actualBoundingBoxDescent: 3,
      }),
    };
    for (const method of [
      "save",
      "restore",
      "translate",
      "rotate",
      "scale",
      "beginPath",
      "rect",
      "clip",
      "fillRect",
      "strokeRect",
      "moveTo",
      "lineTo",
      "closePath",
      "fill",
      "stroke",
      "fillText",
      "setLineDash",
    ])
      ctx[method] = (...args) => {
        for (const value of args)
          if (typeof value === "number")
            assert.ok(Number.isFinite(value), method + " finite coordinate");
        calls.push([method, ...args]);
      };
    contexts.push(ctx);
    return ctx;
  };
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return (this.ctx ??= makeContext());
  };
  let failBlob = false;
  dom.window.HTMLCanvasElement.prototype.toBlob = function (cb) {
    blobs.push({
      canvas: this,
      width: this.width,
      height: this.height,
      calls: this.ctx.calls,
    });
    cb(failBlob ? null : new Blob(["test"]));
  };
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  const $ = (s) => document.querySelector(s),
    tick = () => new Promise((resolve) => previous.setTimeout(resolve, 35));
  try {
    const sources = await Promise.all(
      ["甲", "乙", "丙"].map((title) =>
        createSource({ title, author: "人", text: "明月松间照" }),
      ),
    );
    const history = createHistory(createDocument(sources));
    for (const s of sources.slice(0, 2))
      history.execute({
        type: "cut",
        origin: { sourceId: s.instanceId, part: "text", offset: 0 },
      });
    history.execute({ type: "field", field: "title", value: "导出前" });
    let renderer, image;
    const editor = {
      get document() {
        return history.document;
      },
      execute(c) {
        history.execute(c);
        renderer.preview();
      },
    };
    const appearance = {
      sourcePaper: "none",
      sourcePaperStrength: 100,
      poemPaper: "none",
      poemPaperStrength: 100,
      exportCollage: true,
      exportRough: false,
      roughStrength: 35,
      handmade: false,
      collageGap: 5,
      getExportColors: () => ({
        "#f7f5ef": "#eeeedd",
        "#343b31": "#222222",
        poemBackground: "#ffffff",
      }),
      setSourceSize: () => {},
    };
    let gate = null,
      rejectFont = false;
    const fonts = {
      loadExportFont: async () => {
        if (rejectFont) throw Error("测试字体加载失败");
        if (gate) await gate;
      },
    };
    const typography = {
      displayText: (t) => t,
      displayTokens: (t) => t,
      mode: "original",
    };
    renderer = createMultiImage({ editor, appearance, typography, fonts });
    image = createImage({
      editor,
      appearance,
      typography,
      fonts,
      renderer,
      storage: { getItem: () => null, setItem: () => {} },
    });
    renderer.preview();
    await tick();
    await tick();
    assert.match($("#multi-preview-status").textContent, /最多预览两行/);
    const original = JSON.stringify(history.document);
    $("#preview-source").value = sources[1].instanceId;
    $("#preview-source").onchange();
    await tick();
    assert.equal(
      JSON.stringify(history.document),
      original,
      "preview choice does not mutate document",
    );
    assert.ok($("#image-layout").parentElement.hidden);
    assert.ok($("#preview-source-row").hidden);
    $("#multi-target").value = "source-only";
    $("#multi-target").onchange();
    await tick();
    assert.ok(!$("#preview-source-row").hidden);
    assert.ok($("#image-panel-gap-row").hidden);
    $("#preview-source").value = sources[2].instanceId;
    $("#preview-source").onchange();
    await renderer.exportImage();
    assert.equal(downloads.pop(), "拾句-丙.png");
    const glyphs = blobs
      .at(-1)
      .calls.filter((c) => c[0] === "fillText")
      .map((c) => c[1]);
    assert.ok(
      glyphs.includes("丙") && !glyphs.includes("甲") && !glyphs.includes("乙"),
    );
    assert.equal(JSON.stringify(history.document), original);
    const warning = $("#size-warning");
    warning.showModal = () => warning.setAttribute("open", "");
    const size = $("#image-size");
    size.max = "50000";
    size.value = "50000";
    await renderer.exportImage();
    assert.ok(warning.open);
    warning.removeAttribute("open");
    assert.ok(!$("#export").disabled);
    assert.equal(downloads.length, 0);
    size.value = "23";
    $("#multi-target").value = "poem-only";
    $("#multi-target").onchange();
    await tick();
    let release;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    const pending = renderer.exportImage();
    assert.ok($("#export").disabled);
    history.execute({ type: "field", field: "title", value: "导出后" });
    history.execute({ type: "remove", id: sources[0].instanceId });
    renderer.preview();
    await tick();
    assert.ok(
      $("#export").disabled,
      "preview cannot re-enable export mid-flight",
    );
    gate = null;
    release();
    await pending;
    await tick();
    assert.equal(downloads.at(-1), "拾句-导出前.png");
    assert.ok(
      blobs.at(-1).calls.some((c) => c[0] === "fillText" && c[1] === "导出前"),
    );
    assert.ok(
      !blobs.at(-1).calls.some((c) => c[0] === "fillText" && c[1] === "导出后"),
    );
    assert.equal(blobs.at(-1).canvas.width, 1);
    assert.ok(!$("#export").disabled);
    rejectFont = true;
    await renderer.exportImage();
    assert.match($("#toast").textContent, /字体加载失败/);
    assert.ok(!$("#colors-export").disabled);
    assert.equal(downloads.length, 1);
    rejectFont = false;
    failBlob = true;
    await renderer.exportImage();
    assert.match($("#toast").textContent, /图片生成失败/);
    assert.equal(blobs.at(-1).canvas.width, 1);
    assert.ok(!$("#export").disabled);
    failBlob = false;
    await renderer.exportImage();
    assert.equal(downloads.length, 2);
    assert.equal(downloads.at(-1), "拾句-导出后.png");
    history.execute({ type: "remove", id: sources[1].instanceId });
    renderer.preview();
    await tick();
    assert.ok(!$("#image-layout").parentElement.hidden);
    assert.ok($("#multi-target-row").hidden);
    assert.ok(!$("#image-panel-gap-row").hidden);
  } finally {
    timers.forEach(clearTimeout);
    URL.createObjectURL = nativeCreate;
    URL.revokeObjectURL = nativeRevoke;
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
