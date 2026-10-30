import {
  readFileSync,
  existsSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
const pin = JSON.parse(readFileSync(process.env.RELEASE_DATA_PIN || "release-data.json"));
if (!/^[a-f0-9]{40}$/.test(pin.commit))
  throw Error("Pin data to a full commit");
const dataset = resolve(process.env.RELEASE_DATA_DIR || ".release-data"),
  out = resolve(process.env.RELEASE_OUT || "_site");
const policyPath = join(dataset, "compatibility-policy.json");
const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath)) : null;
const legacyMode = process.env.RELEASE_LEGACY_MODE || policy?.mode || "keep";
let retainSite = process.env.RELEASE_RETAIN_SITE;
if (legacyMode === "retain-current") {
  if (policy?.schema !== 1 || policy.mode !== "retain-current" || policy.retiredLegacy !== "e231436" || !/^[a-f0-9]{16}$/.test(policy.retainedRuntime) || policy.retainedDirectory !== "compatibility/" + policy.retainedRuntime || policy.inventory !== policy.retainedDirectory + "/inventory.json")
    throw Error("Invalid immutable compatibility policy");
  if (retainSite) throw Error("Do not override pinned compatibility snapshot");
  retainSite = join(dataset, policy.retainedDirectory);
  const raw = readFileSync(join(dataset, policy.inventory));
  if (createHash("sha256").update(raw).digest("hex") !== policy.inventorySha256) throw Error("Compatibility inventory mismatch");
  const saved = JSON.parse(raw);
  if (saved.runtime !== policy.retainedRuntime) throw Error("Compatibility runtime mismatch");
  for (const f of saved.files) {
    if (typeof f.path !== "string" || f.path.split("/").includes("..") || f.path.startsWith("/")) throw Error("Invalid compatibility path");
    if (createHash("sha256").update(readFileSync(join(retainSite, f.path))).digest("hex") !== f.sha256) throw Error("Compatibility file mismatch: " + f.path);
  }
}
if (!["keep", "retire-preview", "retain-current"].includes(legacyMode)) throw Error("Invalid compatibility mode");
if (legacyMode === "retire-preview" && !process.env.RELEASE_PREVIEW_BODY_BASE) throw Error("Legacy retirement is local-preview only pending migration acceptance");
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
const previewBase = process.env.RELEASE_PREVIEW_BODY_BASE;
if (
  previewBase &&
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(previewBase)
)
  throw Error("Preview body base must be localhost");
const base =
  previewBase ||
  `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}/bodies/`;
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
  "release-update.mjs",
  "jobs.mjs",
  "worker.mjs",
  "transport.mjs",
  "metadata-engine.mjs",
  "relevance.mjs",
  "search-converter.mjs",
])
  cpSync("prototype/static-search/" + f, out + "/modules/search/" + f);
cpSync("prototype/static-search/unpack-bundled.mjs", out + "/modules/search/unpack.mjs");
cpSync("prototype/static-search/vendor", out + "/modules/search/vendor", { recursive: true });
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
  // Inline the small reader so dictionary postings add no bootstrap request.
  const codec = readFileSync("prototype/static-search/posting-codec.mjs", "utf8");
  s = replaceRequired(s, 'import { postingRows } from "./posting-codec.mjs";', codec.slice(codec.indexOf("export function* postingRows")).replace("export function*", "function*"));
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
    'import {initReleaseUpdate} from "./modules/search/release-update.mjs";\nimport {staticRequest} from "./modules/search/transport.mjs";\n' +
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
edit("app.js", s => s + "\ninitReleaseUpdate({store});\n");
edit("modules/search/transport.mjs", s => s.replace('data.error ? p.reject(Error(data.error)) : p.resolve(data.result);', 'if(data.error){windowError();p.reject(Error(data.error));}else p.resolve(data.result);') + '\nfunction windowError(){globalThis.dispatchEvent?.(new Event("shiju-search-error"));}\n');
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
if (legacyMode === "keep") for (const name of ["app.js", "style.css", "modules", "data"])
  cpSync("dist/" + name, out + "/" + name, { recursive: true });
// Preserve the exact versioned resources of the saved current production release.
let retainedRuntime;
if (retainSite) {
  const previous = resolve(retainSite);
  const prior = JSON.parse(readFileSync(previous + "/release.json"));
  if (!/^[a-f0-9]{16}$/.test(prior.runtime) || prior.modules !== "modules-" + prior.runtime)
    throw Error("Invalid retained runtime");
  retainedRuntime = prior.runtime;
  if (policy && retainedRuntime !== policy.retainedRuntime) throw Error("Retained snapshot runtime mismatch");
  for (const name of ["app-"+prior.runtime+".js", "style-"+prior.runtime+".css", prior.modules, "static-data"]) {
    const src = previous + "/" + name;
    const paths = statSync(src).isDirectory() ? walk(src) : [src];
    for (const path of paths) {
      const rel = relative(previous, path);
      // Mutable discovery files belong to the new release; old runtimes pin hashed config URLs.
      if (["static-data/current.json", "static-data/metadata-current.json"].includes(rel)) continue;
      const destination = out + "/" + rel;
      if (existsSync(destination)) {
        if (!readFileSync(destination).equals(readFileSync(path))) throw Error("Retained URL collision: " + rel);
      } else { mkdirSync(dirname(destination), { recursive: true }); cpSync(path, destination); }
    }
  }
}

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
      compactIndex: config.format === 2,
      compactSummaries: config.summaryEncoding === "gzip-base64-v1",
      data: previewBase ? { preview: true, baseURL: previewBase } : pin,
      config: "static-data/" + configName,
      modules,
      legacyCompatibility: legacyMode === "keep" ? "e231436" : null,
      compatibilityMode: legacyMode,
      retainedRuntime,
      compatibilityPolicySHA256: policy ? createHash("sha256").update(readFileSync(policyPath)).digest("hex") : undefined,
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
const siteBytes = inventory.reduce((n, f) => n + f.bytes, 0);
// Use a conservative decimal 1 GB ceiling; local previews may exceed it for audits.
if (!previewBase && siteBytes > 1_000_000_000)
  throw Error(`发布包 ${siteBytes} B 超过 1 GB，停止发布；请先精简资源。`);
mkdirSync("release-artifacts", { recursive: true });
writeFileSync(
  process.env.RELEASE_INVENTORY ||
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
