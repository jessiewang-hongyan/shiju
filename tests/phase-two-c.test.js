import test from "node:test";
import assert from "node:assert/strict";
import {
  createSource,
  createDocument,
  originKey,
  validateDocument,
} from "../dist/modules/document-model.js";
import {
  applyCommand,
  createHistory,
} from "../dist/modules/document-commands.js";
import {
  resolveSourcePaper,
  validPaperOverride,
  canJoinOrigins,
  groupSourcePieces,
  pieceSeed,
} from "../dist/modules/source-paper.js";
import {
  createLayoutCache,
  fillSourceParts,
} from "../dist/modules/source-layout.js";
import { JSDOM } from "jsdom";

test("2C paper overrides follow defaults, preserve independent colors, validate, and undo atomically", async () => {
  const a = await createSource({ title: "甲", author: "人", text: "明月" }),
    b = await createSource({ title: "乙", author: "人", text: "明月" });
  const h = createHistory(createDocument([a, b]));
  const defaults = {
    sourcePaper: "gold",
    sourcePaperStrength: 120,
    getExportColors: () => ({ "#f7f5ef": "#ffffff" }),
  };
  assert.equal(resolveSourcePaper(a, defaults).key, "gold");
  const override = { key: "cloud-dark", background: "#aabbcc", strength: 180 };
  h.execute({ type: "paper", id: a.instanceId, value: override });
  defaults.sourcePaper = "lokta";
  assert.deepEqual(
    resolveSourcePaper(h.document.sources[0], defaults),
    override,
  );
  assert.equal(
    resolveSourcePaper(h.document.sources[1], defaults).key,
    "lokta",
  );
  const originalSeed = a.paperSeed;
  h.execute({ type: "remove", id: a.instanceId });
  h.undo();
  assert.deepEqual(h.document.sources[0].paperOverride, override);
  assert.equal(h.document.sources[0].paperSeed, originalSeed);
  h.execute({ type: "paper", id: a.instanceId, value: null });
  assert.equal(
    resolveSourcePaper(h.document.sources[0], defaults).key,
    "lokta",
  );
  h.undo();
  assert.deepEqual(h.document.sources[0].paperOverride, override);
  for (const bad of [
    {},
    { ...override, key: "unknown" },
    { ...override, strength: 201 },
    { ...override, background: "url(x)" },
    { ...override, strength: 1.2 },
  ]) {
    assert.equal(validPaperOverride(bad), false);
    assert.throws(
      () =>
        applyCommand(h.document, {
          type: "paper",
          id: a.instanceId,
          value: bad,
        }),
      /settings/,
    );
  }
  validateDocument(JSON.parse(JSON.stringify(h.document)));
});
function arrangement() {
  const origin = (offset, sourceId = "a", part = "text") => ({
    sourceId,
    part,
    offset,
  });
  const layouts = new Map(
    ["a", "b"].map((id) => [
      id,
      {
        cells: new Map(
          Array.from({ length: 5 }, (_, i) => [
            originKey(origin(i, id)),
            {
              x: (i % 3) * 20,
              y: Math.floor(i / 3) * 30,
              width: 20,
              height: 30,
            },
          ]),
        ),
      },
    ]),
  );
  layouts.get("a").cells.set(originKey(origin(1, "a", "title")), {
    x: 20,
    y: 0,
    width: 20,
    height: 30,
  });
  const item = (o, left = 0, top = 0) => ({
    origin: o,
    left,
    top,
    width: 20,
    height: 30,
  });
  return { origin, layouts, item };
}
test("2C contiguous pieces require same instance, part, original row and target row, with inserts as barriers", () => {
  const { origin: o, layouts, item: i } = arrangement();
  assert.equal(canJoinOrigins(o(0), o(1), layouts), true);
  for (const [a, b] of [
    [o(0), o(1, "b")],
    [o(0), o(1, "a", "title")],
    [o(1), o(0)],
    [o(0), o(2)],
    [o(2), o(3)],
  ])
    assert.equal(canJoinOrigins(a, b, layouts), false);
  assert.equal(groupSourcePieces([i(o(0)), i(o(1), 20)], layouts)[0].width, 40);
  assert.equal(
    groupSourcePieces([i(o(0)), i(null, 20), i(o(1), 40)], layouts).length,
    2,
  );
  assert.equal(groupSourcePieces([i(o(0)), i(o(1), 0, 30)], layouts).length, 2);
  assert.equal(groupSourcePieces([i(o(0)), i(o(1), 28)], layouts).length, 2);
  assert.equal(
    groupSourcePieces([i(o(0)), i(o(1, "b"), 20)], layouts).length,
    2,
  );
});
test("2C paper seed is stable across snapshots and distinct across source / part / position", async () => {
  const a = await createSource({ title: "明月", author: "明", text: "明月" });
  const o = { sourceId: a.instanceId, part: "text", offset: 0 };
  const seed = pieceSeed(a, o);
  assert.equal(pieceSeed(JSON.parse(JSON.stringify(a)), o), seed);
  assert.notEqual(pieceSeed({ ...a, paperSeed: "different" }, o), seed);
  assert.notEqual(pieceSeed(a, { ...o, part: "title" }), seed);
  assert.notEqual(pieceSeed(a, { ...o, offset: 1 }), seed);
});
test("2C layout cache invalidates signatures, prunes removed sources and never retains more than its budget", () => {
  const c = createLayoutCache(2);
  let count = 0;
  const measure = () => ({ value: ++count });
  const one = c.get("a", "font1:width400:size23", measure);
  assert.equal(c.get("a", "font1:width400:size23", measure), one);
  for (const key of [
    "font2:width400:size23",
    "font2:width390:size23",
    "font2:width390:size14",
    "traditional",
  ])
    c.get("a", key, measure);
  assert.equal(count, 5);
  c.get("b", "x", measure);
  c.get("c", "x", measure);
  assert.equal(c.size, 2);
  c.prune(new Set(["c"]));
  assert.equal(c.size, 1);
  c.clear();
  assert.equal(c.size, 0);
});
test("2C measurement markup retains source region and non-BMP offsets without picked-state layout dependency", async () => {
  const w = new JSDOM(
    '<div id="title"></div><div id="author"></div><div id="text"></div>',
  ).window;
  globalThis.document = w.document;
  try {
    const s = await createSource({
      title: "题",
      author: "人",
      text: "月𠮷□，\n明月",
    });
    fillSourceParts(
      s,
      Object.fromEntries(
        ["title", "author", "text"].map((k) => [
          k,
          w.document.getElementById(k),
        ]),
      ),
      { displayText: (t) => t },
    );
    assert.equal(w.document.querySelectorAll(".char").length, 7);
    assert.equal(
      w.document.querySelector("#text .char:nth-child(2)").textContent,
      "𠮷",
    );
    assert.equal(
      w.document.querySelector("#text .char:nth-child(3)").dataset.origin,
      originKey({ sourceId: s.instanceId, part: "text", offset: 2 }),
    );
    assert.equal(w.document.querySelectorAll("#text .source-line").length, 2);
  } finally {
    w.close();
    delete globalThis.document;
  }
});

test("2C paper form commits once, and failed or cancelled loading preserves the saved override", async () => {
  const w = new JSDOM(
    `<dialog id="source-menu"><input id="source-paper-follow" type="checkbox"><select id="source-paper-kind"></select><div id="source-paper-override"></div><div id="source-paper-bg-row"></div><input id="source-paper-bg" type="color"><div id="source-paper-amount-row"></div><input id="source-paper-amount" type="range" min="0" max="200"><input id="source-paper-amount-value" type="number"><p id="source-paper-status"></p><button id="source-paper-apply"></button><button id="source-paper-reset"></button></dialog><select id="source-paper"><option value="none">纯色</option><option value="gold">金</option></select>`,
  ).window;
  globalThis.document = w.document;
  try {
    const { initSourcePaperSettings } = await import(
      "../dist/modules/source-paper-settings.js"
    );
    const source = await createSource({ title: "甲", author: "", text: "月" }),
      history = createHistory(createDocument([source]));
    const $ = (id) => w.document.getElementById(id);
    let show,
      release,
      failure = false;
    $("source-menu").close = () =>
      $("source-menu").dispatchEvent(new w.Event("close"));
    initSourcePaperSettings({
      editor: {
        setSourceMenuHandler: (fn) => (show = fn),
        execute: (c) => history.execute(c),
      },
      appearance: {
        sourcePaper: "none",
        sourcePaperStrength: 100,
        getExportColors: () => ({ "#f7f5ef": "#ffffff" }),
      },
      refresh: () => {},
      load: () =>
        failure
          ? Promise.reject(Error("offline"))
          : new Promise((r) => (release = r)),
    });
    show(source);
    $("source-paper-follow").checked = false;
    $("source-paper-kind").value = "gold";
    for (const n of [20, 70, 180]) {
      $("source-paper-amount-value").value = n;
      $("source-paper-amount-value").oninput();
    }
    assert.equal(history.length, 0);
    const pending = $("source-paper-apply").onclick();
    release();
    await pending;
    assert.equal(history.length, 1);
    assert.equal(history.document.sources[0].paperOverride.strength, 180);
    show(history.document.sources[0]);
    failure = true;
    $("source-paper-amount").value = 50;
    await $("source-paper-apply").onclick();
    assert.equal(history.document.sources[0].paperOverride.strength, 180);
    assert.match($("source-paper-status").textContent, /失败/);
    failure = false;
    const cancelled = $("source-paper-apply").onclick();
    $("source-menu").close();
    release();
    await cancelled;
    assert.equal(history.length, 1);
    assert.equal(history.document.sources[0].paperOverride.strength, 180);
  } finally {
    w.close();
    delete globalThis.document;
  }
});
