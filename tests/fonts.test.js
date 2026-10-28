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

test("author and both titles request their own shards after script conversion", async () => {
  let author = "顾";
  const loaded = [],
    checkedTexts = [];
  globalThis.document = {
    fonts: {
      add: (f) => loaded.push(f.url),
      load: async (_, text) => checkedTexts.push(text),
    },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () =>
      [..."顧峰嵐趙龘"].map((c) => ({
        file: `${c}.woff2`,
        codes: [c.codePointAt(0)],
      })),
  });
  globalThis.FontFace = class {
    constructor(_, url) {
      this.url = url;
    }
    async load() {
      return this;
    }
  };
  const loader = createFontLoader({
    getState: () => ({
      source: { text: "月", title: "峰", author },
      title: "岚",
      signature: "",
      tokens: [],
    }),
    typography: {
      displayText: (text) =>
        text
          .replaceAll("顾", "顧")
          .replaceAll("岚", "嵐")
          .replaceAll("赵", "趙"),
      displayTokens: (t) => t,
    },
  });
  await loader.loadExportFont("wenkai");
  for (const c of "顧峰嵐")
    assert(loaded.some((url) => url.includes(c + ".woff2")));
  assert.equal(loaded.length, 3);
  assert(checkedTexts[0].includes("顧"));
  author = "赵";
  await loader.loadExportFont("wenkai");
  assert.equal(loaded.length, 4);
  assert(loaded.at(-1).includes("趙.woff2"));
  author = undefined;
  await loader.loadExportFont("wenkai");
  assert(!checkedTexts.at(-1).includes("undefined"));
  assert.equal(loaded.length, 4);
});
