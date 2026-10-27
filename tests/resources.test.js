import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { libraryCatalog } from "../dist/modules/library-loader.js";
test("all eight bundled collections preserve every poem, order and metadata across batches", () => {
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
test("both font manifests reference present WOFF2 shards and unique code points", () => {
  for (const key of ["kangxi", "huiwen"]) {
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
    assert.equal(codes.size, key === "kangxi" ? 25375 : 14070);
  }
});
