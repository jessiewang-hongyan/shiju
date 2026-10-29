import { normalize, relevance, compareScore } from "./normalize.mjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const base = process.env.SEARCH_URL || "http://127.0.0.1:4180";
const song = process.env.SONG_DATA || "/tmp/shiju-song-eval";
const catalog = await (await fetch(base + "/api/catalog")).json();
assert.equal(catalog.total, 443692);
assert.equal(catalog.collections.length, 19);
const { libraryCatalog } = await import("../../dist/modules/library-loader.js");
const data = new Map(
  catalog.collections.map((c) => [
    c.key,
    JSON.parse(
      readFileSync(
        c.key === "song-era"
          ? song + "/song-era.json"
          : "dist/data/" + libraryCatalog[c.key].file,
      ),
    ),
  ]),
);
const normalized = new Map(
  [...data].map(([key, rows]) => [
    key,
    rows.map((r) =>
      Object.fromEntries(
        ["title", "label", "author", "collection", "sourceWork", "text"].map(
          (k) => [k, normalize(r[k])],
        ),
      ),
    ),
  ]),
);
const records = [];
let assertions = 0;
async function request(path) {
  const t = performance.now();
  const r = await fetch(base + path);
  const text = await r.text();
  return {
    status: r.status,
    value: JSON.parse(text),
    ms: performance.now() - t,
    bytes: Buffer.byteLength(text),
    gzipBytes: gzipSync(text).length,
  };
}
const scenarios = [
  ...["title-author", "full"].flatMap((field) =>
    ["苏轼", "陆游", "春", "水调歌头", "明月", "山 水", "不存在xyz", ""].map(
      (q) => ({ field, q, scope: "song-era" }),
    ),
  ),
  { field: "title", q: "水调歌头", scope: "song-era" },
  { field: "author", q: "苏轼", scope: "song-era" },
  { field: "title-author", q: "苏轼", scope: "all" },
  { field: "full", q: "明月", scope: "all" },
  { field: "full", q: "■", scope: "yuan-era" },
  ...["赤壁赋", "赤壁賦", "蘇轼 赤壁赋", "蘇軾"].map((q) => ({
    field: "title-author",
    q,
    scope: "all",
  })),
];
for (const scenario of scenarios) {
  const { q, field, scope } = scenario;
  const query = normalize(q).trim().split(/\s+/).filter(Boolean).join(" ");
  const words = query.split(/\s+/).filter(Boolean);
  const expected = [];
  for (const [key, rows] of data) {
    if (scope !== "all" && key !== scope) continue;
    rows.forEach((original, i) => {
      const r = normalized.get(key)[i];
      const title = r.title || r.label || "",
        author = r.author || "";
      const text =
        field === "full"
          ? [r.title, r.label, r.collection, r.sourceWork, r.author, r.text]
              .filter(Boolean)
              .join(" ")
          : field === "title"
            ? title
            : field === "author"
              ? author
              : title + " " + author;
      if (words.every((w) => text.toLocaleLowerCase().includes(w)))
        expected.push({
          id: key + ":" + i,
          poem: original,
          score: relevance(title, author, query),
        });
    });
  }
  expected.sort((a, b) => compareScore(a.score, b.score));
  const params = new URLSearchParams({ ...scenario, limit: 40 });
  const result = await request("/api/search?" + params);
  assert.equal(result.status, 200);
  assert.equal(result.value.total, expected.length);
  assert.deepEqual(
    result.value.items.map((x) => x.id),
    expected.slice(0, 40).map((x) => x.id),
  );
  assert(
    result.value.items.every(
      (x) => !("text" in x) && Array.from(x.excerpt).length <= 80,
    ),
  );
  assertions += 4;
  if (result.value.nextCursor) {
    params.set("cursor", result.value.nextCursor);
    const next = await request("/api/search?" + params);
    assert.equal(next.status, 200);
    assert.deepEqual(
      next.value.items.map((x) => x.id),
      expected.slice(40, 80).map((x) => x.id),
    );
    assertions += 2;
    params.set("q", q + "different");
    assert.equal((await request("/api/search?" + params)).status, 409);
    assertions++;
  }
  if (expected.length) {
    const detail = await request(
      "/api/poems/" +
        encodeURIComponent(expected[0].id) +
        "?version=" +
        catalog.version,
    );
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.value.poem, expected[0].poem);
    assertions += 2;
  }
  records.push({
    ...scenario,
    total: expected.length,
    ms: result.ms,
    bytes: result.bytes,
    gzipBytes: result.gzipBytes,
  });
  console.log(
    field,
    q || "(empty)",
    scope,
    expected.length,
    Math.round(result.ms) + "ms",
  );
}
for (const [path, status] of [
  ["/api/search?field=oops", 400],
  ["/api/search?scope=oops", 400],
  ["/api/search?limit=41", 400],
  ["/api/search?cursor=fake", 409],
  ["/api/search?q=" + "a".repeat(121), 400],
  ["/api/poems/song-era:0?version=stale", 409],
  ["/api/poems/song-era:9999999?version=" + catalog.version, 404],
  ["/api/poems/__proto__:0?version=" + catalog.version, 404],
  ["/missing", 404],
]) {
  const r = await request(path);
  assert.equal(r.status, status);
  assert(r.value.error.code);
  assertions += 2;
}
assert.equal(
  (await fetch(base + "/api/search", { method: "POST" })).status,
  405,
);
assertions++;
const bursts = await Promise.all(
  Array.from({ length: 40 }, (_, i) =>
    request(
      "/api/search?scope=song-era&field=full&q=" +
        encodeURIComponent("春 " + i),
    ),
  ),
);
assert(bursts.some((r) => r.status === 503));
assert(bursts.every((r) => [200, 503].includes(r.status)));
assert.equal((await request("/api/search?scope=song-era&q=苏轼")).status, 200);
assertions += 3;
writeFileSync(
  "prototype/search/verification.json",
  JSON.stringify(
    {
      date: "2026-10-29",
      base,
      version: catalog.version,
      records: catalog.total,
      assertions,
      scenarios: records,
      overload503: bursts.filter((r) => r.status === 503).length,
      notes:
        "Real loopback HTTP; sequential measurements include warm caches, not cold Internet or iPhone performance.",
    },
    null,
    2,
  ) + "\n",
);
console.log("PASS", assertions, "assertions");
