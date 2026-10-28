import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { libraryCatalog } from "../dist/modules/library-loader.js";
test("all bundled collections preserve every poem, order and metadata across batches", () => {
  for (const entry of Object.values(libraryCatalog)) {
    const base = "dist/data/parts/" + entry.file.replace(".json", "") + "/";
    const manifest = JSON.parse(readFileSync(base + "manifest.json"));
    const result = manifest.flatMap((part) => {
      const bytes = readFileSync(base + part.file);
      const rows = JSON.parse(bytes);
      assert.equal(rows.length, part.count);
      assert(bytes.length <= 200000);
      return rows;
    });
    assert.deepEqual(
      result,
      JSON.parse(readFileSync("dist/data/" + entry.file)),
    );
  }
});
test("all font manifests reference present WOFF2 shards and unique code points", () => {
  for (const key of ["kangxi", "huiwen", "bakudai", "chenyu", "wenkai"]) {
    const manifest = JSON.parse(
      readFileSync("dist/fonts/" + key + "/manifest.json"),
    );
    const codes = new Set();
    for (const part of manifest) {
      const path = "dist/fonts/" + part.file;
      assert(existsSync(path));
      assert.equal(readFileSync(path).subarray(0, 4).toString(), "wOF2");
      for (const code of part.codes) {
        assert(!codes.has(code));
        codes.add(code);
      }
    }
    assert.equal(
      codes.size,
      {
        wenkai: 46926,
        kangxi: 25375,
        huiwen: 14070,
        bakudai: 24495,
        chenyu: 10137,
      }[key],
    );
  }
});

test("batch one keeps source references and lacunae while separating reviewed inline notes", () => {
  const load = (name) => JSON.parse(readFileSync(`dist/data/${name}.json`));
  const guwen = load("guwen");
  assert.equal(guwen.length, 222);
  assert.equal(
    guwen.reduce((n, p) => n + p.provenance.separatedNotes.length, 0),
    33,
  );
  assert(!guwen.find((p) => p.title === "前赤壁賦").text.includes("一作"));
  assert(guwen.find((p) => p.title === "莊辛論倖臣").text.includes("(魚卷)"));
  for (const [key, count] of [
    ["youmengying", 219],
    ["shenglv", 30],
    ["nantang", 45],
  ])
    assert.equal(load(key).length, count);
  assert(
    load("youmengying").every(
      (p) =>
        p.title === "" && p.author === "" && p.label && p.provenance.pointer,
    ),
  );
  assert.equal(
    load("nantang").reduce(
      (n, p) => n + [...p.text].filter((c) => c === "□").length,
      0,
    ),
    12,
  );
});
