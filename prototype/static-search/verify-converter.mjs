import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { normalize as compact } from "./search-converter.mjs";
import { normalize as reference } from "../search/normalize.mjs";
const c = JSON.parse(readFileSync("/tmp/shiju-static-search/current.json"));
let checked = 0;
function verify(s) {
  assert.equal(compact(s), reference(s), s);
  checked++;
}
for (const [key, v] of Object.entries(c.catalog)) {
  const p =
    key === "song-era"
      ? "/tmp/shiju-song-eval/song-era.json"
      : "dist/data/" + v.file;
  for (const row of JSON.parse(readFileSync(p))) {
    verify(row.title);
    verify(row.author);
  }
}
const ctx = {};
runInNewContext(readFileSync("dist/vendor/opencc/opencc.js", "utf8"), ctx);
for (const group of [
  ...ctx.OpenCC.Locale.configs.t2s.normalizationChain,
  ...ctx.OpenCC.Locale.configs.t2s.conversionChain,
])
  for (const dict of group)
    for (const entry of dict.split("|")) {
      const s = entry.split(" ")[0];
      verify(s);
      verify("甲" + s + "乙");
    }
for (const s of [
  "蘇轼 赤壁賦",
  "歐陽修",
  "神豈",
  "𠮷𠀀ABC",
  "乾坤頭髮發展",
  "皇后後來",
  "臺灣台灣",
  "",
  null,
])
  verify(s);
writeFileSync(
  "prototype/static-search/verification-converter.json",
  JSON.stringify(
    {
      checked,
      pass: true,
      reference:
        "bundled OpenCC t→cn, all corpus title/author strings plus every dictionary entry and context",
    },
    null,
    2,
  ),
);
console.log("PASS", checked);
