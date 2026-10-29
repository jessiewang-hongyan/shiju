import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createMetadataSearch } from "./metadata-engine.mjs";
import { createStaticSearch } from "./engine.mjs";
import { normalize } from "./search-converter.mjs";
import { resolveAsset } from "./server.mjs";
const fetchJSON = async (u) => JSON.parse(readFileSync(resolveAsset("/" + u)));
let assertions = 0;
const cases = [];
for (const q of ["其", "春", "一", "二", "其 春", "赤壁賦"])
  for (const field of ["title-author", "title", "author"]) {
    const scope = q === "春" ? "song-era" : "all";
    const logs = [];
    const actual = createMetadataSearch({
        normalize,
        fetchJSON: async (u) => {
          logs.push(u);
          return fetchJSON(u);
        },
      }),
      expected = createStaticSearch({ normalize, fetchJSON });
    for (const offset of [0, 40, 250]) {
      const a = await actual.search({ q, scope, field, offset }),
        b = await expected.search({ q, scope, field, offset });
      assert.equal(a.total, b.total);
      assert.deepEqual(a.items, b.items);
      assert.equal(a.nextOffset, b.nextOffset);
      assertions += 3;
    }
    if (["其", "春", "一", "二"].includes(q)) {
      const conf = await actual.setup();
      assert.ok(!logs.some((u) => u.endsWith(conf.chars[normalize(q)][1])));
      assertions++;
    }
    cases.push({ q, scope, field });
  }
writeFileSync(
  "prototype/static-search/verification-hot.json",
  JSON.stringify({ pass: true, assertions, cases }, null, 2),
);
console.log("PASS", assertions);
