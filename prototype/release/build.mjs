import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
const data = "/tmp/shiju-static-search",
  c = JSON.parse(readFileSync(data + "/metadata-current.json"));
const out = resolve(
  process.env.RELEASE_OUT || "/tmp/shiju-release-" + Date.now(),
);
mkdirSync(out, { recursive: false });
const copied = new Set();
function copy(src, dst) {
  if (copied.has(dst)) return;
  copied.add(dst);
  mkdirSync(dirname(join(out, dst)), { recursive: true });
  cpSync(src, join(out, dst));
}
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f),
      r = relative("dist", p);
    if (r === "data") continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (!/^fonts\/[^/]+\.(ttf|woff2)$/.test(r)) copy(p, r);
  }
}
walk("dist");
for (const f of readdirSync("dist/data").filter((f) => /^LICENSE/i.test(f)))
  copy("dist/data/" + f, "licenses/" + f);
for (const f of [
  "transport.mjs",
  "worker.mjs",
  "jobs.mjs",
  "metadata-engine.mjs",
  "relevance.mjs",
  "search-converter.mjs",
])
  copy("prototype/static-search/" + f, "modules/search/" + f);
function modify(p, fn) {
  writeFileSync(join(out, p), fn(readFileSync(join(out, p), "utf8")));
}
modify("modules/search/transport.mjs", (s) =>
  s.replace(
    '"/prototype/static-search/worker.mjs"',
    'new URL("./worker.mjs", import.meta.url)',
  ),
);
modify("modules/search/worker.mjs", (s) =>
  s.replace(
    'fetch("/" + url, { signal: activeSignal })',
    'fetch(new URL("../../" + url, import.meta.url), { signal: activeSignal })',
  ),
);
modify("modules/search/search-converter.mjs", (s) =>
  s.replaceAll("../../dist/vendor/", "../../vendor/"),
);
modify("modules/fonts.js", (s) =>
  s.replace(
    /file: "(?:wenkai.ttf|kangxi.woff2|chenyu.ttf|bakudai.woff2|huiwen.woff2)",?/g,
    "",
  ),
);
modify("index.html", (s) =>
  s
    .replace(
      "<head>",
      '<head><meta name="shiju-search-service" content="static">',
    )
    .replace(/\s*<option value="full">[^<]*<\/option>/, ""),
);
modify(
  "app.js",
  (s) =>
    'import { staticRequest } from "./modules/search/transport.mjs";\n' +
    s.replace(
      "initLibrary({ editor, typography })",
      "initLibrary({ editor, typography, searchRequest: staticRequest })",
    ),
);
function datum(p) {
  copy(data + "/" + p, "static-data/" + p);
}
datum("metadata-current.json");
for (const [, f] of Object.values(c.chars)) datum(c.version + "/" + f);
for (const f of Object.values(c.hot)) {
  datum(c.version + "/" + f);
  const m = JSON.parse(readFileSync(data + "/" + c.version + "/" + f));
  for (const scopes of Object.values(m.fields))
    for (const group of Object.values(scopes))
      for (const file of group.files) datum(c.version + "/" + file);
}
for (const k of c.keys) {
  const p = c.sourceVersion + "/" + k + "/";
  const m = JSON.parse(readFileSync(data + "/" + p + "manifest.json"));
  for (const f of [...m.summaries, ...m.detail]) datum(p + f); // Drop unused ranking pointers too.
  delete m.ranks;
  mkdirSync(join(out, "static-data", p), { recursive: true });
  writeFileSync(
    join(out, "static-data", p, "manifest.json"),
    JSON.stringify(m),
  );
  copied.add("static-data/" + p + "manifest.json");
}
writeFileSync(join(out, ".nojekyll"), "");
copied.add(".nojekyll");
writeFileSync(
  join(out, "licenses/SEARCH-CONVERTER.md"),
  "Search-only t→cn converter derived from bundled OpenCC. Code and dictionaries retain their original licenses; see ../vendor/opencc/LICENSE, Apache-2.0.txt and THIRD_PARTY_LICENSES.md. Corpus licenses are included alongside this file.\n",
);
copied.add("licenses/SEARCH-CONVERTER.md");
const files = [...copied].sort().map((path) => {
  const b = readFileSync(join(out, path));
  return {
    path,
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
  };
});
const report = {
  out,
  version: c.version,
  sourceVersion: c.sourceVersion,
  files: files.length,
  bytes: files.reduce((n, f) => n + f.bytes, 0),
  inventory: files,
};
writeFileSync(
  "prototype/release/package-inventory.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ out, files: report.files, bytes: report.bytes }));
