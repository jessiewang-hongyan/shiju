import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { libraryCatalog } from "../dist/modules/library-loader.js";
const report = JSON.parse(readFileSync("docs/batch-5a-audit.json", "utf8"));
test("5A source hashes, counts, gaps, row pointers and original categories remain intact", () => {
  assert.equal(
    report.reduce((n, r) => n + r.count, 0),
    71163,
  );
  assert.equal(libraryCatalog.yuan.name, "元曲");
  for (const r of report) {
    assert.equal(libraryCatalog[r.key].name, r.category);
    const raw = readFileSync(`dist/data/${r.key}.json`);
    assert.equal(
      createHash("sha256").update(raw).digest("hex"),
      r.outputSha256,
    );
    const rows = JSON.parse(raw);
    assert.equal(rows.length, r.count);
    assert.equal(rows.filter((p) => p.notice).length, r.gapRecords);
    rows.forEach((p, i) => {
      assert.equal(p.provenance.pointer, i + 1);
      assert.equal(p.provenance.sha256, r.source.sha256);
      assert.equal(p.provenance.commit, r.source.commit);
      assert.equal(p.collection, r.category);
      assert(p.title && p.author && p.text);
      assert.equal(
        Boolean(p.notice),
        /[□■〓�]/u.test(p.title + p.author + p.text + p.provenance.dynasty),
      );
    });
  }
});
