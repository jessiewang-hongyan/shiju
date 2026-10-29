import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { createMetadataSearch } from "./metadata-engine.mjs";
import { resolveAsset } from "./server.mjs";
import { normalize } from "./search-converter.mjs";
import { createShaper } from "./network-shaper.mjs";
const profiles = [
  { name: "moderate-4g", kbps: 1600, rtt: 150 },
  { name: "weak-4g", kbps: 800, rtt: 300 },
  { name: "slow-3g", kbps: 400, rtt: 600 },
];
const cases = [
  { q: "赤壁赋", scope: "all", field: "title-author" },
  { q: "苏轼", scope: "song-era", field: "author" },
  { q: "春", scope: "song-era", field: "title-author" },
  { q: "其", scope: "all", field: "title-author" },
];
const opencc = gzipSync(
  readFileSync("prototype/static-search/search-converter.mjs"),
).length;
const results = [];
for (const profile of profiles) {
  for (const query of cases) {
    const wire = createShaper(profile),
      log = [];
    const e = createMetadataSearch({
      normalize,
      fetchJSON: async (url) => {
        const raw = readFileSync(resolveAsset("/" + url)),
          bytes = gzipSync(raw).length;
        await wire.transfer(bytes);
        log.push({ url, bytes });
        return JSON.parse(raw);
      },
    });
    async function measure(fn) {
      const t = performance.now(),
        n = log.length;
      const result = await fn();
      return {
        result,
        ms: performance.now() - t,
        requests: log.length - n,
        bytes: log.slice(n).reduce((n, r) => n + r.bytes, 0),
      };
    }
    const catalog = await measure(() => e.search({ q: "", scope: "all" }));
    const cold = await measure(async () => {
      await wire.transfer(opencc);
      log.push({ url: "search-converter.mjs", bytes: opencc });
      return e.search(query);
    });
    const warm = await measure(() => e.search(query));
    assert.deepEqual(cold.result, warm.result);
    const next = await measure(() => e.search({ ...query, offset: 40 }));
    const detail = await measure(() =>
      e.poem(cold.result.items[0].id, cold.result.version),
    );
    assert.ok(detail.result.text);
    const row = {
      profile,
      query,
      total: cold.result.total,
      catalog,
      cold,
      warm,
      next,
      detail,
    };
    for (const k of ["catalog", "cold", "warm", "next", "detail"])
      delete row[k].result;
    results.push(row);
    console.log(
      profile.name,
      query.q,
      Math.round(cold.ms) + "ms",
      cold.requests + " requests",
    );
  }
}
writeFileSync(
  "prototype/static-search/benchmark-weak-optimized.json",
  JSON.stringify(
    {
      date: "2026-10-29",
      note: "Real engine with timed shared aggregate gzip transfer simulation. Desktop CPU, no browser/device CPU, TLS, loss, cache persistence or radio scheduling. Catalog browse precedes cold query; cold includes compact t-to-cn converter transfer. Not a real phone measurement.",
      results,
    },
    null,
    2,
  ),
);
