import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const root = "/tmp/shiju-static-search",
  c = JSON.parse(readFileSync(root + "/metadata-current.json"));
const groups = {};
const paths = new Set();
function add(group, path) {
  if (paths.has(path)) return;
  paths.add(path);
  const raw = readFileSync(path);
  (groups[group] ||= []).push({
    path,
    bytes: raw.length,
    gzip: gzipSync(raw).length,
  });
}
function walk(group, dir, filter = () => true) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (!filter(p)) continue;
    if (statSync(p).isDirectory()) walk(group, p, filter);
    else add(group, p);
  }
}
walk("editor-and-fonts", "dist", (p) => p !== "dist/data");
add("directory", root + "/metadata-current.json");
for (const [, file] of Object.values(c.chars))
  add("candidate-shards", root + "/" + c.version + "/" + file);
for (const file of Object.values(c.hot || {})) {
  add("hot-pages", root + "/" + c.version + "/" + file);
  const m = JSON.parse(readFileSync(root + "/" + c.version + "/" + file));
  for (const scopes of Object.values(m.fields))
    for (const group of Object.values(scopes))
      for (const f of group.files)
        add("hot-pages", root + "/" + c.version + "/" + f);
}
for (const key of c.keys) {
  const base = root + "/" + c.sourceVersion + "/" + key + "/";
  const m = JSON.parse(readFileSync(base + "manifest.json"));
  add("source-manifests", base + "manifest.json");
  for (const f of m.summaries) add("summaries", base + f);
  for (const f of m.detail) add("details", base + f);
}
for (const f of [
  "transport.mjs",
  "worker.mjs",
  "metadata-engine.mjs",
  "relevance.mjs",
  "search-converter.mjs",
])
  add("search-runtime", "prototype/static-search/" + f);
const summary = Object.fromEntries(
  Object.entries(groups).map(([k, rows]) => [
    k,
    {
      files: rows.length,
      bytes: rows.reduce((s, r) => s + r.bytes, 0),
      gzip: rows.reduce((s, r) => s + r.gzip, 0),
    },
  ]),
);
const all = Object.values(groups).flat(),
  total = {
    files: all.length,
    bytes: all.reduce((s, r) => s + r.bytes, 0),
    gzip: all.reduce((s, r) => s + r.gzip, 0),
  };
const old = [];
function oldWalk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) oldWalk(p);
    else old.push(statSync(p).size);
  }
}
oldWalk("dist/data");
writeFileSync(
  "prototype/static-search/package-audit.json",
  JSON.stringify(
    {
      date: "2026-10-29",
      version: c.version,
      sourceVersion: c.sourceVersion,
      note: "Required file inventory, not a deployable archive. Excludes old dist/data, ranking blocks, historical generations, build/test scripts. Editor references must be packaged/rewritten for deployment. gzip sum assumes all assets individually gzip encoded; not Pages disk quota.",
      summary,
      total,
      oldDataBytes: old.reduce((a, b) => a + b, 0),
      naiveAppendBytes: total.bytes + old.reduce((a, b) => a + b, 0),
      largest: all.sort((a, b) => b.bytes - a.bytes).slice(0, 15),
      files: all,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      summary,
      total,
      naiveAppendBytes: total.bytes + old.reduce((a, b) => a + b, 0),
    },
    null,
    2,
  ),
);
