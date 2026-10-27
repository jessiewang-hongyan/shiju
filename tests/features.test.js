import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createStore } from "../dist/modules/storage.js";
import { createEditor } from "../dist/modules/editor.js";
import { initCollection } from "../dist/modules/collection.js";
import { initLibrary } from "../dist/modules/library.js";
import {
  createTypography,
  initTypography,
} from "../dist/modules/typography.js";
import { createFontLoader } from "../dist/modules/fonts.js";
import { createAppearance } from "../dist/modules/appearance.js";
import { createImage } from "../dist/modules/image.js";
import { initUI } from "../dist/modules/ui.js";
import { poems } from "../dist/modules/poems.js";
import {
  wrapCells,
  paperRuns,
  paperEdgePoints,
  paintCenteredGlyph,
} from "../dist/modules/image-drawing.js";
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => {
  const timer = nativeTimeout(fn, ms, ...args);
  if (ms >= 3000) timer.unref();
  return timer;
};
const html = readFileSync("dist/index.html", "utf8");
function setup(draft) {
  const dom = new JSDOM(html, {
      url: "https://example.test/shiju/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  for (const key of ["document", "localStorage", "innerWidth", "OpenCC"])
    globalThis[key] = w[key];
  globalThis.addEventListener = w.addEventListener.bind(w);
  globalThis.confirm = () => true;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const records = [],
    downloads = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    if (this._ctx) return this._ctx;
    const calls = [];
    records.push({ canvas: this, calls });
    const ctx = {
      measureText: (t) => ({
        width: Array.from(t).length * 20,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 20,
        actualBoundingBoxAscent: 18,
        actualBoundingBoxDescent: 2,
      }),
    };
    for (const method of [
      "clearRect",
      "fillRect",
      "strokeRect",
      "save",
      "restore",
      "beginPath",
      "closePath",
      "fill",
      "stroke",
      "lineTo",
      "moveTo",
      "setLineDash",
      "fillText",
    ])
      ctx[method] = (...args) =>
        calls.push([method, ...args, ctx.fillStyle, ctx.font]);
    return (this._ctx = ctx);
  };
  w.HTMLCanvasElement.prototype.toBlob = function (cb) {
    downloads.push(this);
    cb(new Blob(["png"]));
  };
  w.HTMLAnchorElement.prototype.click = function () {};
  if (draft) w.localStorage.setItem("shiju-draft", JSON.stringify(draft));
  initUI();
  const store = createStore(poems[0]),
    typography = createTypography(),
    editor = createEditor({ store, typography });
  initLibrary({ editor, typography });
  initCollection({ editor, store, typography });
  const fonts = createFontLoader({ getState: () => editor.state, typography });
  let image;
  const appearance = createAppearance({
    drawImagePreview: () => image?.drawImagePreview(),
    updateFontPreview: () => image?.updateFontPreview(),
    onSourceSizeChange: (size) => image?.setImageSize(size),
  });
  image = createImage({ editor, typography, fonts, appearance });
  initTypography({ typography, onChange: editor.render });
  editor.render();
  appearance.init();
  const $ = (s) => w.document.querySelector(s);
  const input = (s, value, type = "input") => {
    const el = $(s);
    if (typeof value === "boolean") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new w.Event(type, { bubbles: true }));
  };
  return {
    w,
    $,
    input,
    store,
    editor,
    typography,
    image,
    appearance,
    records,
    downloads,
    close: () => w.close(),
  };
}
test("editor: occurrence IDs, return holes, reorder, drag, newline/space/punctuation, undo, empty title and persisted draft", () => {
  const x = setup({
      source: { title: "重复字", author: "测试", text: "明明月\n清泉" },
      tokens: [],
      title: "",
      signature: "",
    }),
    { $, input, editor, w } = x;
  assert.equal($("#poem-title").value, "");
  const buttons = () => [...w.document.querySelectorAll("#source-poem button")];
  buttons()[0].click();
  buttons()[1].click();
  assert.deepEqual(
    editor.state.tokens.map((t) => t.id),
    [0, 1],
  );
  buttons()[0].click();
  assert.deepEqual(
    editor.state.tokens.map((t) => t.id),
    [1],
  );
  $("#undo").click();
  assert.deepEqual(
    editor.state.tokens.map((t) => t.id),
    [0, 1],
  );
  $("#new-poem [role=button]").click();
  $("#move-right").click();
  assert.deepEqual(
    editor.state.tokens.map((t) => t.id),
    [1, 0],
  );
  $("#undo").click();
  let tokens = [...w.document.querySelectorAll(".poem-token")];
  tokens[0].ondragstart({ dataTransfer: { setData() {} } });
  tokens[1].ondrop({ preventDefault() {} });
  assert.deepEqual(
    editor.state.tokens.map((t) => t.id),
    [1, 0],
  );
  $("#newline").click();
  $("#space").click();
  $("#punctuation").click();
  [...w.document.querySelectorAll(".punctuation-menu button")]
    .find((b) => b.textContent === "，")
    .click();
  assert.equal(editor.textOf(), "明明\n ，");
  input("#poem-title", "新诗");
  input("#signature", "署名");
  assert.equal(JSON.parse(w.localStorage.getItem("shiju-draft")).title, "新诗");
  $("#clear").click();
  assert.equal(editor.pickedCount(), 0);
  $("#undo").click();
  assert.equal(editor.pickedCount(), 2);
  x.close();
});
test("collection: save, restore, delete; persisted drafts survive reload; storage errors are recoverable", () => {
  const x = setup(),
    { $, store, editor } = x;
  $("#source-poem button").click();
  $("#save").click();
  assert.equal(store.model.saved.length, 1);
  const draft = JSON.parse(localStorage.getItem("shiju-draft"));
  $("#clear").click();
  $("#collection").click();
  $("#saved-list button").click();
  assert.equal(editor.pickedCount(), 1);
  $("#collection").click();
  [...document.querySelectorAll("#saved-list button")]
    .find((b) => b.textContent === "删除")
    .click();
  assert.equal(store.model.saved.length, 0);
  const restored = createStore(poems[0], {
    getItem: (key) => (key === "shiju-draft" ? JSON.stringify(draft) : "[]"),
  });
  assert.deepEqual(restored.model.state, draft);
  const bad = createStore(poems[0], {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("full");
    },
  });
  assert.equal(bad.model.state.title, "");
  assert.throws(() => bad.saveCollection([draft]));
  assert.deepEqual(bad.model.saved, []);
  x.close();
});
test("custom source and excerpt validation/confirmation preserve exact consecutive lines", async () => {
  const x = setup(),
    { $, input, editor, w } = x;
  $("#choose").click();
  await Promise.resolve();
  await Promise.resolve();
  $("[data-tab=custom]").click();
  input("#custom-title", "自选");
  input("#custom-author", "作者");
  input("#custom-text", "第一段\n第二段\n第三段");
  $("#custom-tab").dispatchEvent(new w.Event("submit", { cancelable: true }));
  input("#excerpt-enabled", true, "change");
  input("#excerpt-start", "3");
  input("#excerpt-end", "2");
  assert($("#preview-use").disabled);
  input("#excerpt-start", "2");
  input("#excerpt-end", "3");
  assert(!$("#preview-use").disabled);
  $("#preview-use").click();
  assert.equal(editor.state.source.text, "第二段\n第三段");
  assert.equal(editor.state.source.excerpt.start, 2);
  assert.equal(editor.state.source.title, "自选（节选）");
  x.close();
});
test("appearance: separate night/export colors, size bounds, collage, roughness and current two-line preview", () => {
  const x = setup(),
    { $, input, appearance, records } = x;
  $("#source-poem button").click();
  $("#colors-open").click();
  assert($("#colors-dialog").open);
  input("#source-size-value", "5");
  assert.equal($("#source-size").value, "5");
  assert.equal($("#image-size").value, "5");
  assert($("#source-size-minus").disabled);
  input("#source-size-value", "25");
  assert($("#source-size-plus").disabled);
  $("#source-size-reset").click();
  assert.equal($("#source-size").value, "23");
  input("#image-size", "5");
  $("#image-size-minus").click();
  assert.equal($("#image-size").value, "5");
  input("#image-size", "25");
  $("#image-size-plus").click();
  assert.equal($("#image-size").value, "25");
  assert.equal($("#source-size-value").value, "25");
  $("[data-preset=green]").click();
  input("#export-collage", true, "change");
  input("#export-rough", true, "change");
  input("#rough-strength", "90");
  assert.equal(appearance.roughStrength, 90);
  input("#collage-background-hex", "#fff000");
  assert.equal(appearance.getExportColors().poemBackground, "#fff000");
  const colors = JSON.stringify(appearance.getExportColors());
  $("[data-night=blue]").click();
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(JSON.stringify(appearance.getExportColors()), colors);
  input("#background-hex", "bad");
  assert(!$("#background-hex").checkValidity());
  input("#background-hex", "#123456");
  assert($("#background-hex").checkValidity());
  assert.equal(appearance.getExportColors()["#f7f5ef"], "#123456");
  assert(records[0].calls.some((c) => c[0] === "fillText" && c[1] === "空"));
  assert.equal($("#image-preview").height, 360);
  assert(records[0].calls.some((c) => c[1] === "仅预览前两行"));
  x.close();
});
test("real OpenCC conversion retains source positions and supports original/simplified/traditional", async () => {
  const x = setup(),
    { typography, w } = x;
  w.eval(readFileSync("dist/vendor/opencc/opencc.js", "utf8"));
  globalThis.OpenCC = w.OpenCC;
  const pending = typography.setMode("traditional");
  document.querySelector('script[src="vendor/opencc/opencc.js"]').onload();
  await pending;
  assert.equal(typography.displayText("汉诗风"), "漢詩風");
  const tokens = typography.displayTokens([
    { id: 0, c: "汉" },
    { id: null, c: "——" },
    { id: 1, c: "诗" },
  ]);
  assert.deepEqual(
    tokens.map((t) => t.id),
    [0, null, 1],
  );
  assert.equal(tokens[1].c, "——");
  await typography.setMode("simplified");
  assert.equal(typography.displayText("漢詩風"), "汉诗风");
  await typography.setMode("original");
  assert.equal(typography.displayText("漢"), "漢");
  x.close();
});
test("image export contains source and composition; blank/long titles, all sizes and collage render", async () => {
  const x = setup(),
    { $, input, records, downloads } = x;
  $("#source-poem button").click();
  for (const size of [5, 14, 25]) {
    input("#image-size", String(size));
    for (const collage of [false, true]) {
      input("#export-collage", collage, "change");
      input("#export-rough", true, "change");
      await $("#export").onclick();
    }
  }
  assert.equal(downloads.length, 6);
  assert(downloads.every((c) => c.width === 1440 && c.height >= 1060));
  const output = records.filter((r) => !r.canvas.id);
  assert(
    output.every(
      (r) =>
        r.calls.some(
          (c) => c[0] === "fillText" && c[1] === "01   原诗 · 摘取后",
        ) && r.calls.some((c) => c[1] === "02   新诗 · 重新排列"),
    ),
  );
  input("#poem-title", "长标题".repeat(20));
  await $("#export").onclick();
  assert.equal(downloads.length, 7);
  assert(!$("#export").disabled);
  x.close();
});
test("paper geometry joins only adjacent source positions in same row and order; glyph ink is centered", () => {
  const cells = [
    { c: "明", id: 0 },
    { c: "月", id: 1 },
    { c: "松", id: 2 },
    { c: "\n", id: null },
    { c: "间", id: 4 },
  ];
  assert.equal(wrapCells(cells, 2).length, 3);
  const eligible = (t) => Number.isInteger(t.id),
    rows = new Map([
      [0, 0],
      [1, 0],
      [2, 1],
    ]);
  assert.deepEqual(
    paperRuns(cells.slice(0, 3), eligible, rows).map((r) => r.tokens.length),
    [2, 1],
  );
  assert.equal(paperRuns([cells[1], cells[0]], eligible, rows).length, 2);
  assert.deepEqual(paperEdgePoints(3, 90), paperEdgePoints(3, 90));
  assert.notDeepEqual(paperEdgePoints(3, 90), paperEdgePoints(3, 10));
  let ink;
  paintCenteredGlyph(
    {
      font: "20px serif",
      save() {},
      restore() {},
      measureText: () => ({
        actualBoundingBoxLeft: 2,
        actualBoundingBoxRight: 18,
        actualBoundingBoxAscent: 17,
        actualBoundingBoxDescent: 3,
      }),
      fillText: (_s, x, y) => (ink = [x, y]),
    },
    "明",
    0,
    0,
    40,
    40,
  );
  assert.deepEqual(ink, [12, 27]);
});
// Browser download URLs normally expire after a minute. Do not keep Node alive for those timers.

test("empty-state guards, keyboard movement/deletion, double-click return and typing focus", async () => {
  const x = setup(),
    { $, w, editor } = x;
  $("#save").click();
  assert.equal(x.store.model.saved.length, 0);
  await $("#export").onclick();
  assert.equal(x.downloads.length, 0);
  [...document.querySelectorAll("#source-poem button")]
    .slice(0, 2)
    .forEach((b) => b.click());
  $("#new-poem [role=button]").click();
  document.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  assert.deepEqual(
    editor.state.tokens.map((t) => t.id),
    [1, 0],
  );
  $("#poem-title").dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
  );
  assert.equal(editor.pickedCount(), 2);
  document.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
  );
  assert.equal(editor.pickedCount(), 1);
  $("#new-poem [role=button]").dispatchEvent(
    new w.MouseEvent("dblclick", { bubbles: true }),
  );
  assert.equal(editor.pickedCount(), 0);
  $("#undo").click();
  assert.equal(editor.pickedCount(), 1);
  x.close();
});

test("long source extends image; excessive length fails gracefully and restores export button", async () => {
  const source = {
    title: "长文",
    author: "测试",
    text: Array(30).fill("明月清泉").join("\n"),
  };
  const x = setup({
    source,
    tokens: [{ c: "明", id: 0 }],
    title: "",
    signature: "",
  });
  await x.$("#export").onclick();
  assert(x.downloads[0].height > 1060);
  x.editor.changeSource(
    { ...source, text: Array(1000).fill("明月").join("\n") },
    true,
  );
  x.$("#source-poem button").click();
  await x.$("#export").onclick();
  assert.equal(x.downloads.length, 1);
  assert.match(x.$("#toast").textContent, /作品太长/);
  assert(!x.$("#export").disabled);
  x.close();
});

test("source size controls the actual exported font size in both poem sections", async () => {
  const x = setup();
  x.$("#source-poem button").click();
  for (const size of [5, 14, 25]) {
    x.input("#source-size-value", String(size));
    await x.$("#export").onclick();
    const output = x.records.filter((r) => !r.canvas.id).at(-1);
    const glyphs = output.calls.filter(
      (c) => c[0] === "fillText" && ["空", "山"].includes(c[1]),
    );
    assert(glyphs.length >= 2);
    assert(
      glyphs.every(
        (c) => Math.abs(parseFloat(c.at(-1)) - (38 * size) / 23) < 1e-8,
      ),
    );
  }
  x.close();
});
