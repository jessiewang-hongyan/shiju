import test from "node:test";
import assert from "node:assert/strict";
import {
  paintPaperCrop,
  paintPaperField,
  paperCSS,
} from "../dist/modules/paper-materials.js";
import { paintPaperRect } from "../dist/modules/image-drawing.js";
function context() {
  const calls = [];
  return {
    calls,
    save() {
      calls.push(["save"]);
    },
    restore() {
      calls.push(["restore"]);
    },
    translate(...a) {
      calls.push(["translate", ...a]);
    },
    scale(...a) {
      calls.push(["scale", ...a]);
    },
    fillRect(...a) {
      calls.push(["fillRect", ...a]);
    },
    strokeRect() {},
    rotate() {},
    beginPath() {
      calls.push(["beginPath"]);
    },
    rect(...a) {
      calls.push(["rect", ...a]);
    },
    clip() {
      calls.push(["clip"]);
    },
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
  };
}
test("crop maps original coordinates into independently sized destination without changing the source field", () => {
  const ctx = context();
  paintPaperCrop(
    ctx,
    "none",
    "#eee",
    { x: 20, y: 30, width: 600, height: 20000 },
    { x: 120, y: 1030, width: 80, height: 40 },
    { x: 300, y: 100, width: 160, height: 80 },
  );
  assert.deepEqual(ctx.calls.slice(1, 4), [
    ["translate", 300, 100],
    ["scale", 2, 2],
    ["translate", -120, -1030],
  ]);
  assert.ok(
    ctx.calls.some(
      (c) =>
        JSON.stringify(c) === JSON.stringify(["fillRect", 20, 30, 600, 20000]),
    ),
  );
});
test("texture painter is clipped to the same paper mask, including rough edges", () => {
  for (const rough of [0, 100]) {
    const ctx = context();
    paintPaperRect(ctx, 0, 0, 100, 40, 7, rough, () =>
      ctx.calls.push(["texture"]),
    );
    assert.ok(
      ctx.calls.findIndex((c) => c[0] === "clip") <
        ctx.calls.findIndex((c) => c[0] === "texture"),
    );
  }
});
test("plain paper remains available without loading images or allocating a long bitmap", () => {
  const ctx = context();
  paintPaperField(ctx, "none", "#fff", {
    x: 0,
    y: 0,
    width: 100,
    height: 24000,
  });
  assert.deepEqual(ctx.calls, [["fillRect", 0, 0, 100, 24000]]);
  assert.equal(paperCSS("none").backgroundImage, "none");
});

// A procedural material resolves synchronously inside its loader; it must still publish a drawable cache entry.
test("procedural paper is drawable after loading and reused on later loads", async () => {
  const { loadPaper, getPaper } = await import(
    "../dist/modules/paper-materials.js"
  );
  const ctx = context();
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ctx,
      toDataURL: () => "data:image/png;base64,test",
    }),
  };
  try {
    const paper = await loadPaper("gold");
    assert.equal(getPaper("gold"), paper);
    assert.equal(await loadPaper("gold"), paper);
    assert.ok(paper.tile);
  } finally {
    globalThis.document = previous;
  }
});
