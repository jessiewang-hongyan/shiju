import { readFileSync, writeFileSync } from "node:fs";
import { createRemoteReader } from "./reader.mjs";
import { webcrypto } from "node:crypto";
const b = JSON.parse(readFileSync("prototype/remote-body/build.json")),
  d = JSON.parse(readFileSync(b.inventory));
const comparison = JSON.parse(
  readFileSync("prototype/remote-body/comparison.json"),
);
const results = [];
for (const x of comparison.examples) {
  const reader = createRemoteReader({
    cryptoAPI: webcrypto,
    cacheStorage: undefined,
  });
  const start = performance.now();
  await reader(x.file, d.indexVersion, {
    version: d.indexVersion,
    hash: d.files[x.file],
    baseURL: d.baseURL + "weak/",
  });
  results.push({
    collection: x.key,
    newMeasuredMs: Math.round(performance.now() - start),
    oldTransferModelMs: Math.round(1200 + (144306 + x.oldGzip) / 50),
    newTransferModelMs: Math.round(600 + x.newGzip / 50),
    oldRequests: 2,
    newRequests: 1,
    oldGzipBytes: 144306 + x.oldGzip,
    newGzipBytes: x.newGzip,
    summaryExtraGzip: x.summaryExtraGzip,
  });
}
writeFileSync(
  "prototype/remote-body/weak-result.json",
  JSON.stringify(
    {
      conditions:
        "Local HTTP simulation: 400 kbps / 600 ms per request; gzip. Post-search body stage only. Old figures are transfer model, not live measurement.",
      results,
    },
    null,
    2,
  ),
);
console.log(results);
