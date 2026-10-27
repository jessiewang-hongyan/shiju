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
  handmadePlacement,
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
      "rect",
      "clip",
      "scale",
      "drawImage",
      "createPattern",
      "clearRect",
      "fillRect",
      "strokeRect",
      "save",
      "translate",
      "rotate",
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
  assert.equal($("#image-preview").height, 180);
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
        r.calls.some((c) => c[0] === "fillText" && c[1] === "山居秋暝") &&
        !r.calls.some(
          (c) =>
            c[0] === "fillText" &&
            /原诗 · 摘取后|新诗 · 重新排列|拾自《/.test(c[1]),
        ),
    ),
  );
  input("#poem-title", "长标题".repeat(20));
  await $("#export").onclick();
  assert.equal(downloads.length, 7);
  assert(
    records
      .filter((r) => !r.canvas.id)
      .every(
        (r) =>
          !r.calls.some(
            (c) =>
              c[0] === "fillText" &&
              /原诗 · 摘取后|新诗 · 重新排列|拾自《/.test(c[1]),
          ),
      ),
  );
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

test("traditional font hint is optional and converts through the existing script control", async () => {
  const x = setup();
  x.w.eval(readFileSync("dist/vendor/opencc/opencc.js", "utf8"));
  globalThis.OpenCC = x.w.OpenCC;
  // Use an empty manifest to isolate the prompt from font network requests.
  const oldFetch = globalThis.fetch,
    oldFontFace = globalThis.FontFace;
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  globalThis.FontFace = class {};
  document.fonts = { load: async () => [] };
  try {
    for (const key of ["chenyu", "bakudai"]) {
      x.input("#export-font", key, "change");
      assert.equal(x.$("#font-traditional-hint").hidden, false);
      assert.equal(x.typography.mode, "original");
    }
    const pending = x.$("#font-to-traditional").onclick();
    document.querySelector('script[src="vendor/opencc/opencc.js"]').onload();
    await pending;
    assert.equal(x.typography.mode, "traditional");
    assert.equal(x.$("#script-mode").value, "traditional");
    assert.equal(x.$("#font-traditional-hint").hidden, true);
    assert.equal(x.typography.displayText("渔间"), "漁間");
    await x.typography.setMode("original");
    x.input("#export-font", "songti", "change");
    assert.equal(x.$("#font-traditional-hint").hidden, true);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.FontFace = oldFontFace;
    x.close();
  }
});

test("all four image layouts position source, poem, background and signature consistently", async () => {
  const x = setup();
  x.$("#source-poem button").click();
  x.input("#poem-title", "新作");
  for (const layout of [
    "source-left",
    "source-right",
    "source-top",
    "source-bottom",
  ]) {
    x.input(
      "#image-orientation",
      ["source-top", "source-bottom"].includes(layout)
        ? "portrait"
        : "landscape",
      "change",
    );
    x.input("#image-layout", layout, "change");
    assert.equal(localStorage.getItem("shiju-image-layout"), layout);
    const vertical = ["source-top", "source-bottom"].includes(layout);
    assert.equal(x.$("#image-preview").width, vertical ? 500 : 1020);
    assert.equal(x.$("#image-preview").height, vertical ? 380 : 180);
    for (const collage of [true, false]) {
      x.input("#export-collage", collage, "change");
      await x.$("#export").onclick();
      const { calls, canvas } = x.records.filter((r) => !r.canvas.id).at(-1);
      const source = calls.find(
        (c) => c[0] === "fillText" && c[1] === "山居秋暝",
      );
      const poem = calls.find((c) => c[0] === "fillText" && c[1] === "新作");
      const signature = calls.find(
        (c) => c[0] === "fillText" && c[1].startsWith("— "),
      );
      const panel = calls.filter((c) => c[0] === "fillRect")[2];
      assert.equal(panel[1], poem[2] - 40);
      assert(signature[2] > poem[2] && signature[2] < panel[1] + panel[3]);
      assert(signature[3] > poem[3] && signature[3] < panel[2] + panel[4]);
      assert(panel[2] + panel[4] <= canvas.height - 120);
      if (vertical) {
        assert.equal(source[2], poem[2]);
        assert.equal(source[3] < poem[3], layout === "source-top");
      } else {
        assert.equal(source[2] < poem[2], layout === "source-left");
        assert(panel[2] >= 190);
      }
      assert(
        calls.every(
          (c) =>
            c[0] !== "fillText" ||
            (Number.isFinite(c[2]) && c[3] >= 0 && c[3] < canvas.height),
        ),
      );
    }
  }
  x.close();
});

test("collage spacing preserves connected cuts, wraps with gaps and changes exported positions", async () => {
  const chars = [
    { c: "明", id: 0 },
    { c: "月", id: 1 },
    { c: "清", id: 5 },
  ];
  const rows = new Map([
    [0, 0],
    [1, 0],
    [5, 0],
  ]);
  const spaced = wrapCells(chars, 10, 0.5, rows);
  assert.deepEqual(
    spaced[0].map((t) => t.gapBefore),
    [0, 0, 0.5],
  );
  assert.equal(paperRuns(spaced[0], () => true, rows)[1].offset, 2.5);
  const wrapped = wrapCells(chars, 3, 0.5, rows);
  assert.equal(wrapped.length, 2);
  assert.equal(wrapped[1][0].gapBefore, 0);
  const x = setup();
  const buttons = x.w.document.querySelectorAll("#source-poem button");
  buttons[0].click();
  buttons[2].click();
  x.$("#export-collage").checked = true;
  x.$("#export-collage").onchange({ target: x.$("#export-collage") });
  x.input("#image-size", "23");
  const positions = [];
  for (const gap of [0, 24]) {
    x.input("#collage-gap-value", String(gap));
    assert.equal(x.appearance.collageGap, gap);
    assert.equal(x.$("#collage-gap").value, String(gap));
    await x.$("#export").onclick();
    const output = x.records.filter((r) => !r.canvas.id).at(-1);
    positions.push(
      output.calls
        .filter((c) => c[0] === "fillText" && c[1] === "新")
        .at(-1)[2],
    );
  }
  assert.equal(positions[1] - positions[0], 24);
  assert.equal(x.w.localStorage.getItem("shiju-collage-gap"), "24");
  x.close();
});

test("handmade collage rotates each connected piece once and persists the optional setting", async () => {
  const x = setup();
  const buttons = x.w.document.querySelectorAll("#source-poem button");
  buttons[0].click();
  buttons[1].click();
  buttons[3].click();
  x.$("#export-collage").checked = true;
  x.$("#export-collage").onchange({ target: x.$("#export-collage") });
  const poses = [];
  for (const enabled of [true, true, false]) {
    x.$("#export-handmade").checked = enabled;
    x.$("#export-handmade").onchange({ target: x.$("#export-handmade") });
    await x.$("#export").onclick();
    const out = x.records.filter((r) => !r.canvas.id).at(-1);
    const rotations = out.calls
      .filter((c) => c[0] === "rotate")
      .map((c) => c[1]);
    assert.equal(rotations.length, enabled ? 2 : 0);
    assert(rotations.every((angle) => Math.abs(angle) <= 0.075));
    poses.push(rotations);
  }
  assert.deepEqual(poses[0], poses[1]);
  assert.notEqual(poses[0][0], poses[0][1]);
  assert.equal(x.w.localStorage.getItem("shiju-handmade"), "false");
  x.close();
});

test("handmade strengths control independent bounded per-piece amplitudes and persist", () => {
  const zero = handmadePlacement(3, 40, 40, 0, 0);
  assert.equal(Math.abs(zero.angle), 0);
  assert.equal(Math.abs(zero.dy), 0);
  for (let id = 0; id < 30; id++) {
    const low = handmadePlacement(id, 40, 40, 25, 25);
    const high = handmadePlacement(id, 40, 40, 50, 50);
    assert(Math.abs(high.angle - low.angle * 2) < 1e-10);
    assert(Math.abs(high.dy - low.dy * 2) < 1e-10);
    const verticalOnly = handmadePlacement(id, 40, 40, 0, 100);
    assert.equal(Math.abs(verticalOnly.angle), 0);
    assert(Math.abs(verticalOnly.dy) <= 9.6);
  }
  const x = setup();
  x.input("#handmade-tilt-value", "0");
  x.input("#handmade-drift", "100");
  assert.equal(x.appearance.handmadeTilt, 0);
  assert.equal(x.appearance.handmadeDrift, 100);
  assert.equal(x.$("#handmade-tilt").value, "0");
  assert.equal(x.$("#handmade-drift-value").value, "100");
  assert.equal(x.w.localStorage.getItem("shiju-handmade-drift"), "100");
  x.close();
});

test("paper choices are independent, persisted and reset without changing poem content", async () => {
  const x = setup();
  x.w.HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/png;base64,test";
  try {
    const before = JSON.stringify(x.editor.state);
    x.$("#source-paper").value = "gold";
    await x.$("#source-paper").onchange({ target: x.$("#source-paper") });
    assert.equal(x.appearance.sourcePaper, "gold");
    assert.equal(x.$("#source-background-row").hidden, true);
    assert.equal(x.$("#background-hex").disabled, true);
    assert.equal(x.$("#background-presets").hidden, true);
    assert.equal(x.$("#poem-background-row").hidden, false);
    assert.equal(x.appearance.poemPaper, "none");
    assert.equal(x.w.localStorage.getItem("shiju-paper-source"), "gold");
    x.$("#poem-paper").value = "gold";
    await x.$("#poem-paper").onchange({ target: x.$("#poem-paper") });
    assert.equal(x.appearance.poemPaper, "gold");
    assert.equal(x.$("#poem-background-row").hidden, true);
    assert.equal(x.$("#collage-background-hex").disabled, true);
    x.$("#source-paper").value = "none";
    await x.$("#source-paper").onchange({ target: x.$("#source-paper") });
    assert.equal(x.$("#source-background-row").hidden, false);
    assert.equal(x.$("#background-hex").disabled, false);
    assert.equal(x.$("#poem-background-row").hidden, true);
    assert.equal(JSON.stringify(x.editor.state), before);
    x.$("#colors-reset").click();
    assert.equal(x.appearance.sourcePaper, "none");
    assert.equal(x.appearance.poemPaper, "none");
    assert.equal(x.w.localStorage.getItem("shiju-paper-source"), "none");
    assert.equal(x.$("#poem-background-row").hidden, false);
    assert.equal(x.$("#collage-background-hex").disabled, false);
  } finally {
    x.close();
  }
});

test("single-panel exports omit the other section and use only the visible content height", async () => {
  const x = setup();
  x.input("#poem-title", "独立集句");
  x.$("#source-poem button").click();
  for (const layout of ["poem-only", "source-only"]) {
    x.input(
      "#image-orientation",
      ["source-top", "source-bottom"].includes(layout)
        ? "portrait"
        : "landscape",
      "change",
    );
    x.input("#image-layout", layout, "change");
    assert.equal(localStorage.getItem("shiju-image-layout"), layout);
    assert.equal(x.$("#image-preview").width, 500);
    assert.equal(x.$("#image-preview").height, 180);
    assert.equal(
      x.$("#image-preview").getAttribute("aria-label"),
      layout === "source-only"
        ? "当前挖空原文预览，最多两行"
        : "当前集句预览，最多两行",
    );
    const preview = x.records.find((r) => r.canvas.id === "image-preview");
    assert(preview);
    await x.$("#export").onclick();
    const { calls, canvas } = x.records.filter((r) => !r.canvas.id).at(-1);
    const texts = calls.filter((c) => c[0] === "fillText").map((c) => c[1]);
    assert.equal(texts.includes("山居秋暝"), layout === "source-only");
    assert.equal(texts.includes("独立集句"), layout === "poem-only");
    assert.equal(
      texts.some((t) => t.startsWith("— ")),
      layout === "poem-only",
    );
    assert.equal(canvas.width / canvas.height, 4 / 3);
    assert(
      calls.every(
        (c) => c[0] !== "fillText" || (c[3] >= 0 && c[3] < canvas.height),
      ),
    );
  }
  x.close();
});

test("source-only export works without picked characters", async () => {
  const x = setup();
  x.input("#image-layout", "source-only", "change");
  await x.$("#export").onclick();
  const output = x.records.filter((r) => !r.canvas.id).at(-1);
  assert(output.calls.some((c) => c[0] === "fillText" && c[1] === "山居秋暝"));
  assert(
    !output.calls.some(
      (c) => c[0] === "fillText" && String(c[1]).startsWith("— "),
    ),
  );
  x.close();
});

test("orientation filters layouts, maps the current pair, and exports both single panels at the chosen ratio", async () => {
  const x = setup();
  x.$("#source-poem button").click();
  for (const orientation of ["portrait", "landscape"]) {
    x.input("#image-orientation", orientation, "change");
    const portrait = orientation === "portrait";
    assert.equal(localStorage.getItem("shiju-image-orientation"), orientation);
    const allowed = [...x.$("#image-layout").options]
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    assert.deepEqual(
      allowed,
      portrait
        ? ["source-top", "source-bottom", "poem-only", "source-only"]
        : ["source-left", "source-right", "poem-only", "source-only"],
    );
    for (const layout of allowed) {
      x.input("#image-layout", layout, "change");
      await x.$("#export").onclick();
      const canvas = x.downloads.at(-1);
      assert.equal(canvas.width / canvas.height, portrait ? 3 / 4 : 4 / 3);
      assert.equal(canvas.width, portrait ? 1080 : 1440);
    }
  }
  x.close();
});

test("long original grows the page without changing orientation or clipping text", async () => {
  const x = setup({
    source: {
      title: "长篇验收",
      author: "",
      text: "明月松间照，清泉石上流。\n".repeat(80),
    },
    title: "",
    signature: "",
    tokens: [],
  });
  x.input("#image-layout", "source-only", "change");
  for (const direction of ["portrait", "landscape"]) {
    x.input("#image-orientation", direction, "change");
    await x.$("#export").onclick();
    const { canvas, calls } = x.records.filter((r) => !r.canvas.id).at(-1);
    assert.equal(
      canvas.width / canvas.height,
      direction === "portrait" ? 3 / 4 : 4 / 3,
    );
    assert(canvas.width > (direction === "portrait" ? 1080 : 1440));
    assert(
      calls
        .filter((c) => c[0] === "fillText")
        .every(
          (c) =>
            c[2] >= 0 &&
            c[2] < canvas.width &&
            c[3] >= 0 &&
            c[3] < canvas.height,
        ),
    );
  }
  x.close();
});

test("collage gaps move connected pieces without stretching their internal letter spacing", async () => {
  const rows = new Map([
    [0, 0],
    [5, 0],
    [6, 0],
    [7, 0],
  ]);
  const tokens = [
    { c: "甲", id: 0 },
    { c: "明", id: 5 },
    { c: "月", id: 6 },
    { c: "松", id: 7 },
  ];
  const wrapped = wrapCells(tokens, 4, 0.5, rows);
  assert.deepEqual(
    wrapped.map((line) => line.map((t) => t.c).join("")),
    ["甲", "明月松"],
  );
  assert(wrapped[1].every((t) => t.gapBefore === 0));
  const x = setup();
  const buttons = x.w.document.querySelectorAll("#source-poem button");
  for (const i of [0, 2, 3]) buttons[i].click();
  x.input("#export-collage", true, "change");
  x.input("#export-handmade", false, "change");
  const offsets = [];
  for (const gap of [0, 24]) {
    x.input("#collage-gap-value", String(gap));
    await x.$("#export").onclick();
    const calls = x.records.filter((r) => !r.canvas.id).at(-1).calls;
    const pos = (ch) =>
      calls.filter((c) => c[0] === "fillText" && c[1] === ch).at(-1)[2];
    offsets.push([pos("新") - pos("空"), pos("雨") - pos("新")]);
  }
  assert(offsets[1][0] > offsets[0][0]);
  assert.equal(offsets[1][1], offsets[0][1]);
  x.close();
});

test("module padding and gap control actual export geometry and persist", async () => {
  const x = setup();
  x.$("#source-poem button").click();
  x.input("#poem-title", "留白验收");
  for (const orientation of ["landscape", "portrait"]) {
    x.input("#image-orientation", orientation, "change");
    x.input(
      "#image-layout",
      orientation === "portrait" ? "source-top" : "source-left",
      "change",
    );
    for (const [padding, gap] of [
      [0, 0],
      [80, 100],
      [120, 160],
    ]) {
      x.input("#image-padding-value", String(padding));
      x.input("#image-panel-gap-value", String(gap));
      assert.equal(x.$("#image-padding").value, String(padding));
      assert.equal(localStorage.getItem("shiju-image-panel-gap"), String(gap));
      await x.$("#export").onclick();
      const { canvas, calls } = x.records.filter((r) => !r.canvas.id).at(-1);
      const panels = calls.filter(
        (c) => c[0] === "fillRect" && c[2] >= 190 && c[3] > 200,
      );
      const sourceTitle = calls.find(
        (c) => c[0] === "fillText" && c[1] === "山居秋暝",
      );
      const poemTitle = calls.find(
        (c) => c[0] === "fillText" && c[1] === "留白验收",
      );
      const source = panels.find(
        (c) =>
          c[1] === sourceTitle[2] - padding &&
          c[2] === sourceTitle[3] - padding - 30,
      );
      const poem = panels.find(
        (c) =>
          c[1] === poemTitle[2] - padding &&
          c[2] === poemTitle[3] - padding - 46,
      );
      assert(source);
      assert(poem);
      if (orientation === "portrait")
        assert.equal(poem[2] - (source[2] + source[4]), gap);
      else assert.equal(poem[1] - (source[1] + source[3]), gap);
      assert(
        calls
          .filter((c) => c[0] === "fillText")
          .every(
            (c) =>
              c[2] >= 0 &&
              c[2] < canvas.width &&
              c[3] >= 0 &&
              c[3] < canvas.height,
          ),
      );
    }
  }
  x.input("#image-layout", "poem-only", "change");
  assert(x.$("#image-panel-gap").disabled);
  assert(x.$("#image-panel-gap-row").hidden);
  x.input("#image-layout", "source-only", "change");
  assert(x.$("#image-panel-gap-row").hidden);
  x.input("#image-layout", "source-bottom", "change");
  assert.equal(x.$("#image-panel-gap-row").hidden, false);
  x.$("#colors-reset").click();
  assert.equal(x.$("#image-padding-value").value, "40");
  assert.equal(x.$("#image-panel-gap-value").value, "40");
  x.close();
});

test("title and author picks keep occurrence IDs, return independently, undo and survive reload", () => {
  let x = setup();
  x.$("#source-title button").click();
  x.$('#source-author button[aria-label="摘取：王"]').click();
  x.$('#source-poem button[aria-label="摘取：山"]').click();
  assert.equal(x.editor.textOf(), "山王山");
  assert.equal(new Set(x.editor.state.tokens.map((t) => t.id)).size, 3);
  assert.equal(x.editor.state.tokens[2].id, 1); // Existing body IDs stay unchanged.
  const saved = JSON.parse(x.w.localStorage.getItem("shiju-draft"));
  x.close();
  x = setup(saved);
  assert.equal(
    x.$("#source-title button").getAttribute("aria-label"),
    "归还：山",
  );
  x.$("#source-title button").click();
  assert.equal(x.editor.textOf(), "王山");
  assert(x.$('#source-poem button[aria-label="归还：山"]'));
  x.$("#undo").click();
  assert.equal(x.editor.textOf(), "山王山");
  x.$('#source-author button[aria-label="归还：王"]').click();
  assert.equal(x.editor.textOf(), "山山");
  x.close();
});

test("metadata holes export with body picks and remain available for single-poem paper crops", async () => {
  const x = setup();
  x.$("#source-title button").click();
  x.$('#source-title button[aria-label="摘取：居"]').click();
  x.$('#source-author button[aria-label="摘取：维"]').click();
  x.input("#export-collage", true, "change");
  x.input("#export-rough", true, "change");
  x.w.HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/png;base64,test";
  x.$("#source-paper").value = "gold";
  await x.$("#source-paper").onchange({ target: x.$("#source-paper") });
  for (const layout of [
    "source-left",
    "source-right",
    "source-top",
    "source-bottom",
    "source-only",
    "poem-only",
  ]) {
    x.input(
      "#image-orientation",
      layout.includes("left") || layout.includes("right")
        ? "landscape"
        : "portrait",
      "change",
    );
    x.input("#image-layout", layout, "change");
    await x.$("#export").onclick();
    const output = x.records.find((r) => r.canvas === x.downloads.at(-1));
    assert(output);
    const text = output.calls
      .filter((c) => c[0] === "fillText")
      .map((c) => c[1]);
    assert.equal(text.includes("山居秋暝"), false);
    assert.equal(text.includes("居"), layout !== "source-only");
    assert.equal(text.includes("维"), layout !== "source-only");
    if (layout !== "source-only")
      assert(
        output.calls.some(
          (c) => c[0] === "scale" && Number.isFinite(c[1]) && c[1] !== 1,
        ),
      );
  }
  x.close();
});
