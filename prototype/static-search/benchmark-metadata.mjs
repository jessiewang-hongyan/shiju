import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { resolveAsset } from "./server.mjs";
import { createStaticSearch } from "./engine.mjs";
import { createMetadataSearch } from "./metadata-engine.mjs";
import { normalize } from "../search/normalize.mjs";
const scenarios = [
  ["明月", "song-era", "title-author"],
  ["苏轼", "song-era", "author"],
  ["赤壁赋", "all", "title-author"],
  ["赤壁賦", "all", "title"],

  ["春", "song-era", "title-author"],
  ["不存在xyz", "all", "title-author"],
  ["", "all", "title-author"],
  ["明月", "all", "title-author"],
];
const [mode, index] = process.argv.slice(2);
if (!mode) {
  const results = [];
  for (let i = 0; i < scenarios.length; i++) {
    for (const m of ["static", "metadata", "service"]) {
      const child = spawnSync(
        process.execPath,
        ["--expose-gc", import.meta.filename, m, String(i)],
        { encoding: "utf8", maxBuffer: 5e6 },
      );
      if (child.status) throw Error(child.stderr || child.stdout);
      results.push(JSON.parse(child.stdout));
      console.log(
        m,
        scenarios[i].join("/"),
        results.at(-1).cold.ms.toFixed(0) + "ms",
        Math.round(results.at(-1).cold.gzipBytes / 1024) + "KB",
      );
    }
  }
  const comparisons = scenarios.map((s, i) => {
    const rows = results.filter((r) => r.scenario === i);
    for (const r of rows) assert.deepEqual(r.ids, rows[0].ids);
    assert.equal(rows[0].total, rows[1].total);
    assert.equal(rows[1].total, rows[2].total);
    return { scenario: s, correct: true };
  });
  writeFileSync(
    "prototype/static-search/benchmark-metadata.json",
    JSON.stringify(
      {
        date: "2026-10-29",
        note: "Node client harness; CPU/disk loopback, no WAN simulation; gzip level 6 payload excludes JS/bootstrap/TLS. Memory is Node client proxy, not browser measurement. legacy is normalized/ranked controlled baseline, not unchanged production.",
        results,
        comparisons,
      },
      null,
      2,
    ),
  );
  process.exit();
}
const [q, scope, field] = scenarios[Number(index)],
  logs = [];
let peak = 0,
  compressionMs = 0;
function gz(raw) {
  const t = performance.now();
  const size = gzipSync(raw, { level: 6 }).length;
  compressionMs += performance.now() - t;
  return size;
}
const engine = (
  mode === "metadata" ? createMetadataSearch : createStaticSearch
)({
  normalize,
  legacy: mode === "legacy",
  fetchJSON: async (url) => {
    const raw = readFileSync(resolveAsset("/" + url));
    logs.push({ url, raw: raw.length, gzip: gz(raw) });
    return JSON.parse(raw);
  },
});
global.gc();
const initial = process.memoryUsage().heapUsed;
const sampler = setInterval(
  () => (peak = Math.max(peak, process.memoryUsage().heapUsed)),
  5,
);
async function call(offset = 0) {
  if (mode !== "service") return engine.search({ q, scope, field, offset });
  const url =
    "http://127.0.0.1:4180/api/search?" +
    new URLSearchParams({ q, scope, field, limit: "40" });
  const response = await fetch(url);
  if (!response.ok) throw Error("API " + response.status);
  const raw = await response.text();
  logs.push({ url, raw: Buffer.byteLength(raw), gzip: gz(raw) });
  return JSON.parse(raw);
}
async function measured() {
  const before = logs.length,
    beforeCompression = compressionMs;
  const start = performance.now();
  const result = await call();
  const ms = performance.now() - start - (compressionMs - beforeCompression);
  peak = Math.max(peak, process.memoryUsage().heapUsed);
  const rows = logs.slice(before);
  return {
    result,
    stats: {
      ms,
      requests: rows.length,
      gzipBytes: rows.reduce((n, r) => n + r.gzip, 0),
      rawBytes: rows.reduce((n, r) => n + r.raw, 0),
      bodyRequests: rows.filter((r) => r.url.includes("data/parts/")).length,
    },
  };
}
const cold = await measured(),
  warm = await measured();
assert.deepEqual(cold.result.items, warm.result.items);
global.gc();
const retained = process.memoryUsage().heapUsed - initial;
clearInterval(sampler);
const memory = {
  initialHeap: initial,
  retainedHeapDelta: retained,
  observedPeakHeapDelta: peak - initial,
  rssHighWater: process.resourceUsage().maxRSS * 1024,
};
let detail = null;
if (cold.result.items.length) {
  const item = cold.result.items[0],
    before = logs.length,
    start = performance.now();
  let poem;
  if (mode === "service") {
    const response = await fetch(
      "http://127.0.0.1:4180/api/poems/" +
        encodeURIComponent(item.id) +
        "?version=" +
        cold.result.version,
    );
    assert.equal(response.status, 200);
    const raw = await response.text();
    poem = JSON.parse(raw).poem;
    logs.push({
      url: "detail",
      raw: Buffer.byteLength(raw),
      gzip: gzipSync(raw).length,
    });
  } else poem = await engine.poem(item.id, cold.result.version);
  const detailMs = performance.now() - start;
  const [key, row] = item.id.split(":");
  const conf = JSON.parse(
    readFileSync("/tmp/shiju-static-search/current.json"),
  );
  const path =
    key === "song-era"
      ? "/tmp/shiju-song-eval/song-era.json"
      : "dist/data/" + conf.catalog[key].file;
  assert.deepEqual(poem, JSON.parse(readFileSync(path))[Number(row)]);
  detail = {
    ms: detailMs,
    gzipBytes: logs.slice(before).reduce((n, r) => n + r.gzip, 0),
    correct: true,
  };
}
console.log(
  JSON.stringify({
    scenario: Number(index),
    mode,
    q,
    scope,
    field,
    total: cold.result.total,
    ids: cold.result.items.map((i) => i.id),
    cold: cold.stats,
    warm: warm.stats,
    memory,
    detail,
  }),
);
