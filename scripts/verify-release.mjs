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
const bodyBase = release.data.preview
  ? release.data.baseURL
  : `https://raw.githubusercontent.com/${release.data.repository}/${release.data.commit}/bodies/`;
let files = 0,
  imports = 0,
  bytes = 0,
  rows = 0;
const unpack = c.format === 2 ? (await import(pathToFileURL(out + "/" + release.modules + "/search/unpack.mjs"))).unpack : value => value;
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
  if (["retire-preview", "retain-current"].includes(release.compatibilityMode)) assert.ok(!existsSync(out + "/" + entry), "Unexpected retired URL: " + entry);
  else assert.ok(existsSync(out + "/" + entry), "Missing legacy URL: " + entry);
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
  bodyCache.clear();
  let collectionRows = 0;
  for (const f of m.summaries) {
    const page = unpack(JSON.parse(readFileSync(dir + f)));
    for (const item of page) {
      const b =
        typeof item.body === "number" ? page[item.body].body : item.body;
      assert.ok(b && b.hash);
      assert.ok(inv.files[m.body.prefix + b.hash + ".json"] === b.hash);
      const path = m.body.prefix + b.hash + ".json";
      if (!bodyCache.has(path))
        bodyCache.set(
          path,
          JSON.parse(readFileSync(dataset + "/bodies/" + path)),
        );
      const row = Number(item.id.slice(item.id.lastIndexOf(":") + 1));
      assert.equal(item.id, key + ":" + collectionRows++);
      const poem = bodyCache.get(path)[row - b.start];
      assert.ok(poem && poem.text);
      assert.equal(item.title, poem.title || poem.label || "无题");
      assert.equal(item.author, poem.author);
      rows++;
    }
  }
  assert.equal(collectionRows, m.count);
}
assert.equal(
  rows,
  Object.values(c.counts).reduce((a, b) => a + b, 0),
);
const indexRoot = out + "/static-data/" + c.version + "/";
const indexRead = f => unpack(JSON.parse(readFileSync(indexRoot + f)));
const directories = c.chars ? [c.chars] : [indexRead(c.charsFile), ...(c.authorCharsFile ? [indexRead(c.authorCharsFile)] : []), ...Object.values(c.scopeIndexes).map(indexRead)];
for (const directory of directories) for (const [, file] of Object.values(directory)) assert.ok(existsSync(indexRoot + file));
for (const f of Object.values(c.hot)) {
  const m = indexRead(f);
  for (const scopes of Object.values(m.fields)) for (const group of Object.values(scopes)) {
    for (const file of group.files) assert.ok(existsSync(indexRoot + file));
    if (group.preview) {
      const preview = indexRead(group.preview);
      assert.equal(preview.length, Math.min(40, group.count));
      const pairs = group.count ? indexRead(group.files[0]).slice(0, 40) : [];
      assert.deepEqual(preview.map(p => p.id), pairs.map(([k,row]) => c.keys[k] + ":" + row));
    }
  }
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
const fixturesPath = process.env.RELEASE_SEARCH_FIXTURES || (existsSync(dataset + "/search-fixtures.json") ? dataset + "/search-fixtures.json" : null);
const fixtures = fixturesPath
  ? JSON.parse(readFileSync(fixturesPath))
  : [
      ["赤壁赋", "all", "title-author", 62],
      ["赤壁賦", "all", "title", 62],
      ["其", "all", "title-author", 144468],
      ["歐陽修", "song-era", "author", 1253],
    ];
for (const [q, scope, field, total] of fixtures) {
  const before = detailRequests;
  const a = await engine.search({ q, scope, field });
  assert.equal(a.total, total);
  assert.equal(detailRequests, before);
  assert.equal(a.items.length, Math.min(40, total));
  const p = await engine.poem(a.items[0].id, a.version);
  assert.ok(p.text);
  const next = await engine.search({ q, scope, field, offset: 40 });
  assert.equal(next.items.length, Math.min(40, Math.max(0, total - 40)));
  if (next.items.length) assert.notEqual(next.items[0].id, a.items[0].id);
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
  process.env.RELEASE_VERIFICATION ||
    "release-artifacts/production-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
