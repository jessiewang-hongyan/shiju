import {
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
const pin = JSON.parse(readFileSync("release-data.json"));
if (!/^[a-f0-9]{40}$/.test(pin.commit))
  throw Error("Pin data to a full commit");
const dataset = resolve(process.env.RELEASE_DATA_DIR || ".release-data"),
  out = resolve(process.env.RELEASE_OUT || "_site");
mkdirSync(out, { recursive: false });
function copyTree(src, dest, filter = () => true) {
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(src)) {
    const p = join(src, f);
    if (!filter(p)) continue;
    if (statSync(p).isDirectory()) copyTree(p, join(dest, f), filter);
    else cpSync(p, join(dest, f));
  }
}
copyTree("dist", out, (p) => {
  const r = relative("dist", p);
  return r !== "data" && !/^fonts\/[^/]+\.(ttf|woff2)$/.test(r);
});
cpSync(dataset + "/static-data", out + "/static-data", { recursive: true });
cpSync(dataset + "/licenses", out + "/licenses", { recursive: true });
const base = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}/bodies/`;
const config = JSON.parse(
  readFileSync(out + "/static-data/metadata-current.json"),
);
for (const key of config.keys) {
  const p =
    out + "/static-data/" + config.sourceVersion + "/" + key + "/manifest.json";
  const m = JSON.parse(readFileSync(p));
  if (m.body.baseURL !== "@BODY_BASE_URL@")
    throw Error("Unexpected data contract");
  m.body.baseURL = base;
  writeFileSync(p, JSON.stringify(m));
}
const configText = JSON.stringify(config),
  configName =
    "config-" +
    createHash("sha256").update(configText).digest("hex").slice(0, 20) +
    ".json";
writeFileSync(out + "/static-data/" + configName, configText);
unlinkSync(out + "/static-data/metadata-current.json");
mkdirSync(out + "/modules/search", { recursive: true });
for (const f of [
  "jobs.mjs",
  "worker.mjs",
  "transport.mjs",
  "metadata-engine.mjs",
  "relevance.mjs",
  "search-converter.mjs",
])
  cpSync("prototype/static-search/" + f, out + "/modules/search/" + f);
cpSync(
  "prototype/remote-body/reader.mjs",
  out + "/modules/search/remote-reader.mjs",
);
function edit(path, fn) {
  writeFileSync(out + "/" + path, fn(readFileSync(out + "/" + path, "utf8")));
}
function replaceRequired(s, a, b) {
  if (!s.includes(a))
    throw Error("Runtime transformation no longer matches: " + a);
  return s.replace(a, b);
}
edit("modules/search/metadata-engine.mjs", (s) => {
  s = replaceRequired(
    s,
    "  getSignal = () => undefined,",
    "  getSignal = () => undefined,\n  fetchDetail,",
  );
  s = replaceRequired(
    s,
    "static-data/metadata-current.json",
    "static-data/" + configName,
  );
  return replaceRequired(
    s,
    "return (await read(base + m.detail[Math.floor(row / m.size)]))[\n      row % m.size\n    ];",
    `const rows=await read(base+m.summaries[Math.floor(row/m.size)]);const ref=rows[row%m.size].body;const block=typeof ref==='number'?rows[ref].body:ref;if(!block)throw Error('原文不存在');return (await fetchDetail(m.body.prefix+block.hash+'.json',c.version,{...m.body,hash:block.hash}))[row-block.start];`,
  );
});
edit(
  "modules/search/worker.mjs",
  (s) =>
    'import {createRemoteReader} from "./remote-reader.mjs";\nconst remoteRead=createRemoteReader({});\n' +
    replaceRequired(
      replaceRequired(
        s,
        'fetch("/" + url, { signal: activeSignal })',
        'fetch(new URL("../../" + url, import.meta.url), { signal: activeSignal })',
      ),
      "  normalize,",
      "  normalize,\n  fetchDetail:(path,version,descriptor)=>remoteRead(path,version,descriptor,activeSignal),",
    ),
);
edit("modules/search/transport.mjs", (s) =>
  replaceRequired(
    s,
    '"/prototype/static-search/worker.mjs"',
    'new URL("./worker.mjs", import.meta.url)',
  ),
);
edit("modules/search/search-converter.mjs", (s) =>
  s.replaceAll("../../dist/vendor/", "../../vendor/"),
);
edit("modules/fonts.js", (s) =>
  s.replace(
    /file: "(?:wenkai.ttf|kangxi.woff2|chenyu.ttf|bakudai.woff2|huiwen.woff2)",?/g,
    "",
  ),
);
edit(
  "app.js",
  (s) =>
    'import {staticRequest} from "./modules/search/transport.mjs";\n' +
    replaceRequired(
      s,
      "initLibrary({ editor, typography })",
      "initLibrary({ editor, typography, searchRequest: staticRequest })",
    ),
);
edit("index.html", (s) =>
  s
    .replace(
      "<head>",
      '<head><meta name="shiju-search-service" content="static">',
    )
    .replace(/\s*<option value="full">[^<]*<\/option>/, ""),
);
// Version the runtime and entry assets; old cached HTML never mixes new modules.
function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}
const hash = createHash("sha256");
for (const p of [
  ...walk(out + "/modules"),
  out + "/app.js",
  out + "/style.css",
])
  hash.update(relative(out, p)).update(readFileSync(p));
const version = hash.digest("hex").slice(0, 16),
  modules = "modules-" + version;
renameSync(out + "/modules", out + "/" + modules);
edit("app.js", (s) => s.replaceAll("./modules/", "./" + modules + "/"));
renameSync(out + "/app.js", out + "/app-" + version + ".js");
renameSync(out + "/style.css", out + "/style-" + version + ".css");
edit("index.html", (s) =>
  s
    .replace(/app\.js\?[^"']+/g, "app-" + version + ".js")
    .replace(/style\.css\?[^"']+/g, "style-" + version + ".css"),
);
// First migration: keep URLs used by cached HTML and already-open legacy tabs.
// These assets are not referenced by the new entry point.
for (const name of ["app.js", "style.css", "modules", "data"])
  cpSync("dist/" + name, out + "/" + name, { recursive: true });
writeFileSync(out + "/.nojekyll", "");
writeFileSync(
  out + "/licenses/SEARCH-CONVERTER.md",
  "Search converter derives from bundled OpenCC. See ../vendor/opencc/LICENSE and THIRD_PARTY_LICENSES.md. Original licenses apply.\n",
);
writeFileSync(
  out + "/release.json",
  JSON.stringify(
    {
      runtime: version,
      data: pin,
      config: "static-data/" + configName,
      modules,
      legacyCompatibility: "e231436",
    },
    null,
    2,
  ),
);
const inventory = walk(out).map((p) => {
  const b = readFileSync(p);
  return {
    path: relative(out, p),
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
  };
});
mkdirSync("release-artifacts", { recursive: true });
writeFileSync(
  "release-artifacts/production-inventory.json",
  JSON.stringify(
    {
      out,
      version,
      files: inventory,
      bytes: inventory.reduce((n, f) => n + f.bytes, 0),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    out,
    version,
    files: inventory.length,
    bytes: inventory.reduce((n, f) => n + f.bytes, 0),
  }),
);
