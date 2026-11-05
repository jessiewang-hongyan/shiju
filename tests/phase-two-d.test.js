import test from "node:test";
import assert from "node:assert/strict";
import {
  createSource,
  createDocument,
  originKey,
} from "../dist/modules/document-model.js";
import {
  applyCommand,
  createHistory,
} from "../dist/modules/document-commands.js";
import { exportSources, layoutImage } from "../dist/modules/image-layout-v2.js";
import {
  captureImage,
  neededFontText,
  prepareImage,
} from "../dist/modules/image-v2.js";
const appearance = {
  sourcePaper: "none",
  sourcePaperStrength: 100,
  poemPaper: "none",
  poemPaperStrength: 100,
  exportCollage: true,
  exportRough: true,
  roughStrength: 35,
  handmade: true,
  handmadeTilt: 50,
  handmadeDrift: 50,
  collageGap: 0,
  getExportColors: () => ({
    "#f7f5ef": "#ffeecc",
    "#343b31": "#222222",
    poemBackground: "#ffffff",
  }),
};
const typography = { displayText: (x) => x };
const controls = {
  font: "songti",
  size: 23,
  padding: 40,
  panelGap: 40,
  sourceGap: 40,
  portrait: false,
  layout: "source-left",
};
async function fixture() {
  const sources = await Promise.all(
    ["甲", "乙", "丙"].map((title) =>
      createSource({
        title,
        author: "作者",
        text: "明月松间照\n清泉石上流□𠮷",
      }),
    ),
  );
  let doc = createDocument(sources);
  for (const source of sources.slice(0, 2))
    for (const offset of [0, 1])
      doc = applyCommand(doc, {
        type: "cut",
        origin: { sourceId: source.instanceId, part: "text", offset },
      });
  return doc;
}
const capture = (doc, options = {}) =>
  captureImage(doc, appearance, typography, { ...controls, ...options });
test("2D automatic/manual selection, custom append, remove and undo retain export references", async () => {
  let doc = await fixture();
  assert.equal(exportSources(doc).length, 2);
  const h = createHistory(doc);
  h.execute({
    type: "export-settings",
    value: {
      sourceOrder: {
        mode: "manual",
        ids: [doc.sources[1].instanceId, doc.sources[0].instanceId],
      },
    },
  });
  h.execute({
    type: "cut",
    origin: { sourceId: doc.sources[2].instanceId, part: "text", offset: 0 },
  });
  assert.deepEqual(
    exportSources(h.document).map((s) => s.snapshot.title),
    ["乙", "甲", "丙"],
  );
  h.execute({ type: "remove", id: doc.sources[1].instanceId });
  assert.equal(exportSources(h.document).length, 2);
  h.undo();
  assert.deepEqual(
    exportSources(h.document).map((s) => s.snapshot.title),
    ["乙", "甲", "丙"],
  );
  h.execute({
    type: "export-settings",
    value: {
      sourceSelection: { mode: "manual", ids: [doc.sources[2].instanceId] },
    },
  });
  assert.equal(exportSources(h.document)[0].snapshot.title, "丙");
  assert.throws(() =>
    applyCommand(doc, { type: "export-settings", value: { sourceGap: 161 } }),
  );
});
test("2D all eight permitted orientation/layout combinations fit complete panels and preserve order", async () => {
  const doc = await fixture();
  for (const portrait of [false, true])
    for (const layout of portrait
      ? ["source-top", "source-bottom", "source-only", "poem-only"]
      : ["source-left", "source-right", "source-only", "poem-only"]) {
      const out = layoutImage(capture(doc, { portrait, layout }));
      assert.equal(
        out.panels.filter((p) => p.kind === "source").length,
        layout === "poem-only" ? 0 : 2,
      );
      assert.equal(
        out.panels.filter((p) => p.kind === "poem").length,
        layout === "source-only" ? 0 : 1,
      );
      for (const p of out.panels) {
        assert.ok(p.x + p.layout.width <= out.width);
        assert.ok(p.y + p.height <= out.height);
        assert.equal(p.height, p.layout.height);
      }
      assert.ok(
        Math.abs(out.height / out.width - (portrait ? 4 / 3 : 3 / 4)) < 0.002,
      );
    }
});
test("2D unselected source still supplies poem crops, source-only can include unused work, empty selection gives actionable error", async () => {
  let doc = await fixture();
  doc = applyCommand(doc, {
    type: "export-settings",
    value: {
      sourceSelection: { mode: "manual", ids: [doc.sources[2].instanceId] },
    },
  });
  let out = layoutImage(capture(doc));
  assert.equal(out.layouts.size, 3);
  assert.equal(
    out.panels.filter((p) => p.kind === "source")[0].layout.source.snapshot
      .title,
    "丙",
  );
  out = layoutImage(capture(doc, { layout: "source-only" }));
  assert.equal(out.layouts.size, 1);
  assert.ok(
    !neededFontText(capture(doc, { layout: "source-only" })).includes("甲"),
  );
  doc = applyCommand(doc, {
    type: "export-settings",
    value: { sourceSelection: { mode: "manual", ids: [] } },
  });
  assert.throws(() => layoutImage(capture(doc)), /至少一篇/);
  assert.equal(
    layoutImage(capture(doc, { layout: "poem-only" })).panels.length,
    1,
  );
});
test("2D snapshot is isolated before asynchronous font/paper work; failures propagate without mutation", async () => {
  const doc = await fixture();
  const snap = capture(doc);
  doc.title = "后来修改";
  doc.sources[0].snapshot.text = "不同";
  appearance.collageGap = 100;
  assert.notEqual(snap.title, doc.title);
  assert.equal(snap.sources[0].display.text, "明月松间照\n清泉石上流□𠮷");
  assert.equal(snap.settings.gap, 0);
  appearance.collageGap = 0;
  await assert.rejects(
    prepareImage(
      snap,
      {
        loadExportFont: async () => {
          throw Error("font failure");
        },
      },
      { load: async () => {} },
    ),
    /font failure/,
  );
  await assert.rejects(
    prepareImage(
      snap,
      { loadExportFont: async () => {} },
      {
        load: async () => {
          throw Error("paper failure");
        },
      },
    ),
    /paper failure/,
  );
  let requested;
  await prepareImage(
    snap,
    {
      loadExportFont: async (key, text) => {
        requested = text;
      },
    },
    { load: async () => {} },
  );
  assert.ok(requested.includes("甲"));
  assert.ok(requested.includes("乙"));
  assert.ok(!requested.includes("丙"));
});
test("2D joined glyph distances are unaffected by block gaps; metadata keeps original sizes and Unicode offsets", async () => {
  let doc = await fixture();
  for (const part of ["title", "author"])
    doc = applyCommand(doc, {
      type: "cut",
      origin: { sourceId: doc.sources[0].instanceId, part, offset: 0 },
    });
  let snap = capture(doc),
    a = layoutImage(snap);
  snap.settings.gap = 20;
  const b = layoutImage(snap);
  const row = (out) =>
    out.panels.find((p) => p.kind === "poem").layout.lines[0].cells;
  assert.equal(
    row(a)[1].left - row(a)[0].left,
    row(b)[1].left - row(b)[0].left,
  );
  assert.ok(row(b)[2].left > row(a)[2].left);
  const src = b.layouts.get(doc.sources[0].instanceId);
  assert.equal(
    src.cells.get(
      originKey({
        sourceId: doc.sources[0].instanceId,
        part: "title",
        offset: 0,
      }),
    ).fontSize,
    30,
  );
  assert.equal(
    src.cells.get(
      originKey({
        sourceId: doc.sources[0].instanceId,
        part: "author",
        offset: 0,
      }),
    ).fontSize,
    15,
  );
  assert.equal([...src.cells.values()].at(-1).c, "𠮷");
});
test("2D long text stays complete, preview is separate, extreme size rejects before bitmap allocation", async () => {
  const source = await createSource({
    title: "长篇",
    author: "人",
    text: "明月".repeat(1500),
  });
  let doc = createDocument([source]);
  doc = applyCommand(doc, {
    type: "export-settings",
    value: { sourceSelection: { mode: "manual", ids: [source.instanceId] } },
  });
  const snap = capture(doc, { layout: "source-only", portrait: true });
  const full = layoutImage(snap),
    preview = layoutImage(snap, { preview: true });
  assert.equal(
    [...full.layouts.values()][0].lines
      .flatMap((l) => l.cells)
      .filter((t) => t.origin.part === "text").length,
    3000,
  );
  assert.ok(full.height > preview.height);
  snap.settings.size = 100000;
  assert.throws(() => layoutImage(snap), /超限/);
});

test("2D multi-character punctuation preserves its full advance", async () => {
  let doc = await fixture();
  doc = applyCommand(doc, { type: "insert", text: "——" });
  const out = layoutImage(capture(doc));
  const t = out.panels
    .find((p) => p.kind === "poem")
    .layout.lines.flatMap((l) => l.cells)
    .at(-1);
  assert.equal(t.width, 92);
});

test("2D newly reselected sources append to custom order; source selection is undoable", async () => {
  let doc = await fixture();
  const ids = doc.sources.map((s) => s.instanceId);
  const h = createHistory(doc);
  h.execute({
    type: "export-settings",
    value: {
      sourceSelection: { mode: "manual", ids },
      sourceOrder: { mode: "manual", ids: [ids[1], ids[0], ids[2]] },
    },
  });
  h.execute({
    type: "export-settings",
    value: { sourceSelection: { mode: "manual", ids: [ids[0], ids[2]] } },
  });
  h.execute({
    type: "export-settings",
    value: { sourceSelection: { mode: "manual", ids } },
  });
  assert.deepEqual(
    exportSources(h.document).map((s) => s.instanceId),
    [ids[0], ids[2], ids[1]],
  );
  h.undo();
  assert.deepEqual(
    exportSources(h.document).map((s) => s.instanceId),
    [ids[0], ids[2]],
  );
});

test("2D source preview shows body or cut metadata instead of hiding the holes behind headings", async () => {
  let doc = await fixture();
  let out = layoutImage(capture(doc), { preview: true });
  assert.equal(
    out.panels.find((p) => p.kind === "source").layout.previewLines[0].cells[0]
      .origin.part,
    "text",
  );
  doc = applyCommand(doc, {
    type: "cut",
    origin: { sourceId: doc.sources[0].instanceId, part: "author", offset: 0 },
  });
  out = layoutImage(capture(doc), { preview: true });
  const source = out.panels.find((p) => p.kind === "source");
  assert.equal(source.layout.previewLines[0].cells[0].origin.part, "author");
  assert.ok(source.layout.previewLines.length <= 2);
});

test("2D gradual reflow fits three 3000-character landscape sources before the size guard", async () => {
  const sources = await Promise.all(
    Array.from({ length: 3 }, (_, i) =>
      createSource({
        title: "长文" + i,
        author: "测试",
        text: "明月松间照清泉石上流".repeat(300),
      }),
    ),
  );
  let doc = createDocument(sources);
  for (const s of sources)
    doc = applyCommand(doc, {
      type: "cut",
      origin: { sourceId: s.instanceId, part: "text", offset: 0 },
    });
  const out = layoutImage(capture(doc));
  assert.ok(out.width * out.height <= 64000000);
  assert.equal(out.panels.filter((p) => p.kind === "source").length, 3);
});
