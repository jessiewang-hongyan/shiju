import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createMetadataSearch } from "../static-search/metadata-engine.mjs";
import { normalize } from "../static-search/search-converter.mjs";
const c = JSON.parse(readFileSync("prototype/release/package-inventory.json")),
  base = "http://127.0.0.1:4184/shiju/";
let files = 0,
  imports = 0;
for (const f of c.inventory) {
  const b = readFileSync(join(c.out, f.path));
  assert.equal(createHash("sha256").update(b).digest("hex"), f.sha256);
  assert.ok(!/^data\//.test(f.path));
  assert.ok(!/^fonts\/[^/]+\.(ttf|woff2)$/.test(f.path));
  if (/\.(js|mjs)$/.test(f.path)) {
    const s = b.toString();
    assert.ok(!s.includes("/prototype/"), f.path);
    for (const m of s.matchAll(
      /(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g,
    )) {
      const p = resolve(c.out, dirname(f.path), m[1].split("?")[0]);
      assert.ok(existsSync(p), f.path + " -> " + m[1]);
      imports++;
    }
  }
  files++;
}
let at = 0;
await Promise.all(
  Array.from({ length: 24 }, async () => {
    while (at < c.inventory.length) {
      const f = c.inventory[at++];
      const r = await fetch(base + f.path, { method: "HEAD" });
      assert.equal(r.status, 200, f.path);
      if (/\.(js|mjs)$/.test(f.path))
        assert.equal(r.headers.get("content-type"), "text/javascript");
    }
  }),
);
const config = JSON.parse(
  readFileSync(join(c.out, "static-data/metadata-current.json")),
);
for (const k of ["kangxi", "chenyu", "wenkai", "huiwen", "bakudai"]) {
  const m = JSON.parse(
    readFileSync(join(c.out, "fonts/" + k + "/manifest.json")),
  );
  for (const part of m) assert.ok(existsSync(join(c.out, "fonts", part.file)));
}
for (const key of config.keys) {
  const p = "static-data/" + config.sourceVersion + "/" + key + "/";
  const m = JSON.parse(readFileSync(join(c.out, p + "manifest.json")));
  assert.ok(!m.ranks);
  for (const f of [...m.summaries, ...m.detail])
    assert.ok(existsSync(join(c.out, p + f)));
}
const urls = [];
const engine = createMetadataSearch({
  normalize,
  fetchJSON: async (path) => {
    urls.push(path);
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    return r.json();
  },
});
for (const q of ["赤壁赋", "其", "歐陽修"]) {
  const a = await engine.search({
    q,
    scope: q === "歐陽修" ? "song-era" : "all",
    field: q === "歐陽修" ? "author" : "title-author",
  });
  assert.equal(a.total, { 赤壁赋: 62, 其: 144468, 歐陽修: 1253 }[q]);
  assert.equal(a.items.length, 40);
  const p = await engine.poem(a.items[0].id, a.version);
  assert.ok(p.text);
}
assert.equal(
  (await fetch("http://127.0.0.1:4184/static-data/metadata-current.json"))
    .status,
  404,
);
writeFileSync(
  "prototype/release/verification.json",
  JSON.stringify(
    {
      pass: true,
      files,
      imports,
      HTTP: "all inventory paths HEAD 200; root data deliberately 404",
      searches: 3,
      fonts: 5,
      date: "2026-10-29",
    },
    null,
    2,
  ),
);
console.log("PASS", files, "files", imports, "imports");
