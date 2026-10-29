import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, webcrypto } from "node:crypto";
import assert from "node:assert/strict";
const out = resolve(process.env.RELEASE_OUT || "_site"),
  dataset = resolve(process.env.RELEASE_DATA_DIR || ".release-data");
const release = JSON.parse(readFileSync(out + "/release.json")),
  c = JSON.parse(readFileSync(out + "/" + release.config));
const bodyBase = `https://raw.githubusercontent.com/${release.data.repository}/${release.data.commit}/bodies/`;
let files = 0,
  imports = 0,
  bytes = 0,
  rows = 0;
const bodyCache = new Map();
function walk(d) {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const p of walk(out)) {
  files++;
  bytes += statSync(p).size;
  if (/\.(js|mjs|html|css)$/.test(p)) {
    const s = readFileSync(p, "utf8");
    assert.ok(!/https?:\/\/(?:127\.0\.0\.1|localhost)/.test(s), p);
    if (/\.(js|mjs)$/.test(p))
      for (const m of s.matchAll(
        /(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g,
      )) {
        assert.ok(
          existsSync(resolve(dirname(p), m[1].split("?")[0])),
          p + " -> " + m[1],
        );
        imports++;
      }
  }
}
for (const entry of [
  "app.js",
  "style.css",
  "modules/library.js",
  "data/parts/guwen/manifest.json",
])
  assert.ok(existsSync(out + "/" + entry), "Missing legacy URL: " + entry);
for (const key of ["kangxi", "chenyu", "wenkai", "huiwen", "bakudai"])
  for (const part of JSON.parse(
    readFileSync(out + "/fonts/" + key + "/manifest.json"),
  ))
    assert.ok(existsSync(out + "/fonts/" + part.file));
const inv = JSON.parse(readFileSync(dataset + "/body-inventory.json"));
for (const [file, hash] of Object.entries(inv.files)) {
  const raw = readFileSync(dataset + "/bodies/" + file);
  assert.equal(createHash("sha256").update(raw).digest("hex"), hash);
}
for (const key of c.keys) {
  const dir = out + "/static-data/" + c.sourceVersion + "/" + key + "/";
  const m = JSON.parse(readFileSync(dir + "manifest.json"));
  assert.equal(m.body.baseURL, bodyBase);
  assert.equal(m.body.version, c.version);
  assert.equal(m.detail, undefined);
  for (const f of m.summaries) {
    const page = JSON.parse(readFileSync(dir + f));
    for (const item of page) {
      const b =
        typeof item.body === "number" ? page[item.body].body : item.body;
      assert.ok(b && b.hash);
      assert.ok(inv.files[m.body.prefix + b.hash + ".json"] === b.hash);
      rows++;
    }
  }
}
assert.equal(
  rows,
  Object.values(c.counts).reduce((a, b) => a + b, 0),
);
for (const [, f] of Object.values(c.chars))
  assert.ok(existsSync(out + "/static-data/" + c.version + "/" + f));
for (const f of Object.values(c.hot)) {
  const m = JSON.parse(
    readFileSync(out + "/static-data/" + c.version + "/" + f),
  );
  for (const scopes of Object.values(m.fields))
    for (const group of Object.values(scopes))
      for (const file of group.files)
        assert.ok(existsSync(out + "/static-data/" + c.version + "/" + file));
}
const { createMetadataSearch } = await import(
  pathToFileURL(out + "/" + release.modules + "/search/metadata-engine.mjs")
);
const { normalize } = await import(
  pathToFileURL(out + "/" + release.modules + "/search/search-converter.mjs")
);
const { createRemoteReader } = await import(
  pathToFileURL(out + "/" + release.modules + "/search/remote-reader.mjs")
);
const reader = createRemoteReader({
  cryptoAPI: webcrypto,
  cacheStorage: undefined,
  fetcher: async (url) => {
    assert.ok(url.startsWith(bodyBase));
    return new Response(
      readFileSync(dataset + "/bodies/" + url.slice(bodyBase.length)),
    );
  },
});
let detailRequests = 0;
const engine = createMetadataSearch({
  normalize,
  fetchJSON: async (p) => JSON.parse(readFileSync(out + "/" + p)),
  fetchDetail: (...a) => {
    detailRequests++;
    return reader(...a);
  },
});
for (const [q, scope, field, total] of [
  ["赤壁赋", "all", "title-author", 62],
  ["赤壁賦", "all", "title", 62],
  ["其", "all", "title-author", 144468],
  ["歐陽修", "song-era", "author", 1253],
]) {
  const before = detailRequests;
  const a = await engine.search({ q, scope, field });
  assert.equal(a.total, total);
  assert.equal(detailRequests, before);
  assert.equal(a.items.length, 40);
  const p = await engine.poem(a.items[0].id, a.version);
  assert.ok(p.text);
  const next = await engine.search({ q, scope, field, offset: 40 });
  assert.ok(next.items.length);
  assert.notEqual(next.items[0].id, a.items[0].id);
}
await assert.rejects(() => engine.poem("guwen:0", "wrong"));
for (const name of [
  "LICENSE-poetry.txt",
  "LICENSE-Werneror.txt",
  "SEARCH-CONVERTER.md",
])
  assert.ok(existsSync(out + "/licenses/" + name));
const result = {
  passed: true,
  files,
  bytes,
  imports,
  poems: rows,
  bodyBlocks: Object.keys(inv.files).length,
  runtime: release.runtime,
  dataCommit: release.data.commit,
  mode: "Local files plus real production engine; remote data fetch mapped to pinned local checkout",
};
writeFileSync(
  "release-artifacts/production-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
