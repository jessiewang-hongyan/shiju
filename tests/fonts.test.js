import test from "node:test";
import assert from "node:assert/strict";
import { createFontLoader } from "../dist/modules/fonts.js";
test("font shards: select needed characters, retry failure, reuse cache and load newly added characters", async () => {
  let text = "明",
    fail = true,
    attempts = [];
  const added = [];
  globalThis.document = {
    fonts: { add: (face) => added.push(face), load: async () => [] },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      { file: "test/a.woff2", codes: [..."明"].map((c) => c.codePointAt(0)) },
      { file: "test/b.woff2", codes: ["月".codePointAt(0)] },
      { file: "test/c.woff2", codes: ["龘".codePointAt(0)] },
    ],
  });
  globalThis.FontFace = class {
    constructor(name, url, options) {
      Object.assign(this, { name, url, options });
    }
    async load() {
      attempts.push(this.url);
      if (fail) {
        fail = false;
        throw Error("network");
      }
      return this;
    }
  };
  const loader = createFontLoader({
    getState: () => ({
      source: { text, title: "" },
      title: "",
      signature: "",
      tokens: [],
    }),
    typography: { displayText: (t) => t, displayTokens: (t) => t },
  });
  await assert.rejects(loader.loadExportFont("kangxi"), /加载失败/);
  await loader.loadExportFont("kangxi");
  await loader.loadExportFont("kangxi");
  assert.equal(attempts.length, 2);
  assert.equal(added.length, 1);
  text = "明月";
  await loader.loadExportFont("kangxi");
  assert.equal(attempts.length, 3);
  assert.equal(added.length, 2);
  assert(added[0].options.unicodeRange.startsWith("U+"));
  assert(!attempts.some((x) => x.includes("c.woff2")));
});
