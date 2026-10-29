import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { createShaper } from "../prototype/static-search/network-shaper.mjs";
const out = resolve(process.env.RELEASE_OUT || "_site"),
  data = resolve(process.env.RELEASE_DATA_DIR || ".release-data");
const release = JSON.parse(readFileSync(out + "/release.json"));
const modulePath = out + "/" + release.modules + "/search/";
const { createMetadataSearch } = await import(
  pathToFileURL(modulePath + "metadata-engine.mjs")
);
const { normalize } = await import(
  pathToFileURL(modulePath + "search-converter.mjs")
);
const { createRemoteReader } = await import(
  pathToFileURL(modulePath + "remote-reader.mjs")
);
const base = `https://raw.githubusercontent.com/${release.data.repository}/${release.data.commit}/bodies/`;
const cases = [
  { q: "赤壁赋", scope: "all", field: "title-author" },
  { q: "歐陽修", scope: "song-era", field: "author" },
  { q: "其", scope: "all", field: "title-author" },
];
const rows = [];
for (const profile of [
  { kbps: 1600, rtt: 150 },
  { kbps: 400, rtt: 600 },
])
  for (const query of cases)
    for (let run = 1; run <= 3; run++) {
      const wire = createShaper(profile),
        log = [];
      async function file(path) {
        const raw = readFileSync(path),
          bytes = gzipSync(raw).length;
        await wire.transfer(bytes);
        log.push({ bytes, path });
        return raw;
      }
      const reader = createRemoteReader({
        cryptoAPI: webcrypto,
        cacheStorage: undefined,
        fetcher: async (url) => {
          assert.ok(url.startsWith(base));
          return new Response(
            await file(data + "/bodies/" + url.slice(base.length)),
          );
        },
      });
      const engine = createMetadataSearch({
        normalize,
        fetchJSON: async (p) => JSON.parse(await file(out + "/" + p)),
        fetchDetail: reader,
      });
      async function measure(fn) {
        const start = performance.now(),
          index = log.length;
        const result = await fn();
        return {
          result,
          ms: Math.round(performance.now() - start),
          requests: log.length - index,
          bytes: log.slice(index).reduce((n, r) => n + r.bytes, 0),
        };
      }
      const catalog = await measure(() =>
        engine.search({ q: "", scope: "all" }),
      );
      const cold = await measure(async () => {
        await file(modulePath + "search-converter.mjs");
        return engine.search(query);
      });
      const warm = await measure(() => engine.search(query));
      assert.deepEqual(cold.result, warm.result);
      const detail = await measure(() =>
        engine.poem(cold.result.items[0].id, cold.result.version),
      );
      assert.ok(detail.result.text);
      const row = {
        profile,
        query,
        run,
        total: cold.result.total,
        catalog,
        cold,
        warm,
        detail,
      };
      for (const key of ["catalog", "cold", "warm", "detail"])
        delete row[key].result;
      rows.push(row);
      console.log(
        JSON.stringify({
          profile,
          query,
          run,
          cold: cold.ms,
          detail: detail.ms,
        }),
      );
    }
writeFileSync(
  "release-artifacts/production-performance.json",
  JSON.stringify(
    {
      runtime: release.runtime,
      note: "Production engine; local pinned bytes with shared aggregate gzip transfer simulation. Three runs per case. Desktop CPU; no browser startup, TLS, radio, packet loss or real mobile hardware. Catalog precedes cold query, which includes converter bytes.",
      rows,
    },
    null,
    2,
  ),
);
