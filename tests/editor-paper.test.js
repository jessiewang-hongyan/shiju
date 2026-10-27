import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  groupPaperRects,
  initEditorPaper,
} from "../dist/modules/editor-paper.js";

test("editor paper joins only consecutive source occurrences on the same source and display row, without inserted gaps", () => {
  const item = (id, left, top = 0) => ({
    id,
    left,
    top,
    width: 20,
    height: 30,
  });
  const rows = new Map([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 30],
  ]);
  assert.equal(groupPaperRects([item(0, 0), item(1, 20)], rows)[0].width, 40);
  for (const pair of [
    [item(1, 0), item(0, 20)],
    [item(0, 0), item(2, 20)],
    [item(0, 0), item(1, 40)],
    [item(0, 0), item(1, 0, 30)],
    [item(2, 0), item(3, 20)],
  ]) {
    assert.equal(groupPaperRects(pair, rows).length, 2);
  }
});

test("editor paper follows settings, redraws after returns, and leaves interactive text intact", async () => {
  const dom = new JSDOM(
    '<div id="source-poem"><button class="char picked" data-source-id="0">明</button><button class="char picked" data-source-id="1">月</button></div><div id="new-poem"><span class="poem-token" data-source-id="0">明</span><span class="poem-token" data-source-id="1">月</span></div>',
  );
  const w = dom.window;
  globalThis.document = w.document;
  globalThis.window = w;
  let pending;
  w.requestAnimationFrame = (fn) => {
    pending = fn;
  };
  const calls = [];
  w.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args) =>
            calls.push([key, ...args]),
        set: () => true,
      },
    );
  const roots = [...w.document.querySelectorAll("#source-poem, #new-poem")];
  for (const root of roots) {
    root.getBoundingClientRect = () => ({ left: 0, top: 0 });
    [...root.children].forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: i * 20,
        top: 0,
        width: 20,
        height: 30,
      });
    });
  }
  const appearance = {
    exportCollage: true,
    exportRough: false,
    roughStrength: 80,
  };
  const paper = initEditorPaper({ appearance });
  pending();
  assert.equal(w.document.querySelectorAll("canvas").length, 2);
  assert.equal(roots[1].textContent, "明月");
  assert.ok(calls.some((c) => c[0] === "fillRect"));
  calls.length = 0;
  appearance.exportRough = true;
  paper.refresh();
  pending();
  assert.ok(calls.some((c) => c[0] === "lineTo"));
  roots[1].querySelector('[data-source-id="1"]').remove();
  await Promise.resolve();
  pending();
  assert.equal(roots[1].querySelector("canvas").width, 60);
  appearance.exportCollage = false;
  paper.refresh();
  pending();
  assert.equal(w.document.querySelectorAll("canvas").length, 0);
  assert.equal(roots[0].classList.contains("editor-collage"), false);
  paper.dispose();
  dom.window.close();
  delete globalThis.document;
  delete globalThis.window;
});
