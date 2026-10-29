import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { splitBodies } from "./blocks.mjs";
const build = JSON.parse(readFileSync("prototype/remote-body/build.json")),
  inv = JSON.parse(readFileSync("prototype/release/package-inventory.json"));
const c = JSON.parse(
  readFileSync(inv.out + "/static-data/metadata-current.json"),
);
let total = 0,
  summaryExtra = 0;
const examples = [];
for (const key of c.keys) {
  const prefix = "/static-data/" + c.sourceVersion + "/" + key + "/";
  const old = JSON.parse(readFileSync(inv.out + prefix + "manifest.json")),
    m = JSON.parse(readFileSync(build.site + prefix + "manifest.json"));
  const original = old.detail.flatMap((f) =>
    JSON.parse(readFileSync(inv.out + prefix + f)),
  );
  const summaries = m.summaries.flatMap((f) => {
    const rows = JSON.parse(readFileSync(build.site + prefix + f));
    return rows.map((r) => {
      const b = typeof r.body === "number" ? rows[r.body].body : r.body;
      return { ...r, body: { ...b, file: m.body.prefix + b.hash + ".json" } };
    });
  });
  const blocks = new Map();
  for (let i = 0; i < original.length; i++) {
    const b = summaries[i].body;
    if (!blocks.has(b.file))
      blocks.set(b.file, JSON.parse(readFileSync(build.data + "/" + b.file)));
    assert.deepEqual(blocks.get(b.file)[i - b.start], original[i]);
    total++;
  }
  for (let i = 0; i < old.summaries.length; i++)
    summaryExtra +=
      gzipSync(readFileSync(build.site + prefix + m.summaries[i])).length -
      gzipSync(readFileSync(inv.out + prefix + old.summaries[i])).length;
  if (["chuci", "guwen", "song-era"].includes(key)) {
    const b = summaries[0].body,
      oldBody = readFileSync(inv.out + prefix + old.detail[0]),
      newBody = readFileSync(build.data + "/" + b.file);
    examples.push({
      key,
      oldBytes: oldBody.length,
      newBytes: newBody.length,
      oldGzip: gzipSync(oldBody).length,
      newGzip: gzipSync(newBody).length,
      summaryExtraGzip:
        gzipSync(readFileSync(build.site + prefix + m.summaries[0])).length -
        gzipSync(readFileSync(inv.out + prefix + old.summaries[0])).length,
      file: b.file,
    });
  }
}
for (const b of splitBodies([{ text: "甲".repeat(20000) }, { text: "乙" }]))
  assert.ok(Buffer.byteLength(b.text) <= 32768 || b.count === 1);
function size(dir) {
  return readdirSync(dir).reduce((n, f) => {
    const p = dir + "/" + f;
    return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
  }, 0);
}
const report = {
  poemsVerified: total,
  siteBytes: size(build.site),
  summaryExtraGzipAll: summaryExtra,
  examples,
};
writeFileSync(
  "prototype/remote-body/comparison.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
