import { createHash } from "node:crypto";
import { splitBodies } from "./blocks.mjs";
import {
  readFileSync,
  writeFileSync,
  cpSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
const inv = JSON.parse(
    readFileSync("prototype/release/package-inventory.json"),
  ),
  config = JSON.parse(
    readFileSync(inv.out + "/static-data/metadata-current.json"),
  );
const root = "/tmp/shiju-remote-" + Date.now(),
  site = root + "/site",
  data = root + "/data";
mkdirSync(site, { recursive: true });
mkdirSync(data, { recursive: true });
const details = new Set();
for (const key of config.keys) {
  const p = "static-data/" + config.sourceVersion + "/" + key + "/";
  const m = JSON.parse(readFileSync(inv.out + "/" + p + "manifest.json"));
  for (const f of m.detail) details.add(p + f);
}
const descriptor = {
  indexVersion: config.version,
  sourceVersion: config.sourceVersion,
  baseURL: "http://127.0.0.1:4186/data/",
  files: {},
};
let bodyBytes = 0,
  siteBytes = 0;
for (const row of inv.inventory) {
  const body = details.has(row.path),
    dest = join(body ? data : site, body ? row.path.slice(12) : row.path);
  if (body) continue;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(inv.out, row.path), dest);
  if (!body) siteBytes += row.bytes;
}
cpSync(
  "prototype/remote-body/reader.mjs",
  site + "/modules/search/remote-reader.mjs",
);
const targetBytes = 32768;
const bodyVersion = config.sourceVersion + "-b32k-v1";
const stats = [];
for (const key of config.keys) {
  const prefix = "static-data/" + config.sourceVersion + "/" + key + "/";
  const m = JSON.parse(readFileSync(inv.out + "/" + prefix + "manifest.json"));
  const poems = m.detail.flatMap((f) =>
    JSON.parse(readFileSync(inv.out + "/" + prefix + f)),
  );
  m.body = {
    version: config.version,
    baseURL: descriptor.baseURL,
    prefix: bodyVersion + "/" + key + "/",
  };
  const mapping = [];
  for (const block of splitBodies(poems, targetBytes)) {
    const file = bodyVersion + "/" + key + "/" + block.hash + ".json";
    const dest = join(data, file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, block.text);
    for (let i = 0; i < block.count; i++)
      mapping[block.start + i] = { start: block.start, file, hash: block.hash };
    descriptor.files[file] = block.hash;
    bodyBytes += Buffer.byteLength(block.text);
    stats.push({ bytes: Buffer.byteLength(block.text), count: block.count });
  }
  m.summaries = m.summaries.map((f, page) => {
    const rows = JSON.parse(readFileSync(inv.out + "/" + prefix + f));
    const refs = new Map();
    for (let i = 0; i < rows.length; i++) {
      const b = mapping[page * m.size + i];
      if (refs.has(b.hash)) rows[i].body = refs.get(b.hash);
      else {
        refs.set(b.hash, i);
        rows[i].body = { start: b.start, hash: b.hash };
      }
    }
    const text = JSON.stringify(rows),
      name =
        createHash("sha256").update(text).digest("hex").slice(0, 20) + ".json";
    unlinkSync(site + "/" + prefix + f);
    writeFileSync(site + "/" + prefix + name, text);
    return name;
  });
  delete m.detail;
  writeFileSync(site + "/" + prefix + "manifest.json", JSON.stringify(m));
}
// Test inventory only; never shipped to the website or fetched by its worker.
writeFileSync(root + "/body-inventory.json", JSON.stringify(descriptor));
cpSync("dist/modules/library-service.js", site + "/modules/library-service.js");
cpSync("dist/style.css", site + "/style.css");
const ep = site + "/modules/search/metadata-engine.mjs";
let e = readFileSync(
  "prototype/static-search/metadata-engine.mjs",
  "utf8",
).replace(
  "  getSignal = () => undefined,",
  "  getSignal = () => undefined,\n  fetchDetail,",
);
const old =
  "return (await read(base + m.detail[Math.floor(row / m.size)]))[\n      row % m.size\n    ];";
if (!e.includes(old)) throw Error("Body adapter patch no longer matches");
e = e.replace(
  old,
  `const summaries=await read(base+m.summaries[Math.floor(row/m.size)]);
    const ref=summaries[row%m.size].body;
    const block=typeof ref==='number'?summaries[ref].body:ref;
    if(!block)throw Error('原文不存在');
    return (await fetchDetail(m.body.prefix+block.hash+'.json',c.version,{...m.body,hash:block.hash}))[row-block.start];`,
);
writeFileSync(ep, e);
const wp = site + "/modules/search/worker.mjs";
cpSync("prototype/static-search/jobs.mjs", site + "/modules/search/jobs.mjs");
writeFileSync(
  site + "/modules/search/transport.mjs",
  readFileSync("prototype/static-search/transport.mjs", "utf8").replace(
    '"/prototype/static-search/worker.mjs"',
    'new URL("./worker.mjs", import.meta.url)',
  ),
);
let w = readFileSync("prototype/static-search/worker.mjs", "utf8").replace(
  'fetch("/" + url, { signal: activeSignal })',
  'fetch(new URL("../../" + url, import.meta.url), { signal: activeSignal })',
);
w =
  'import {createRemoteReader} from "./remote-reader.mjs";\nconst remoteRead=createRemoteReader({});\n' +
  w;
w = w.replace(
  "  normalize,",
  "  normalize,\n  fetchDetail: (path, version, descriptor) => remoteRead(path, version, descriptor, activeSignal),",
);
writeFileSync(wp, w);
for (const name of ["LICENSE-poetry.txt", "LICENSE-Werneror.txt"])
  cpSync(inv.out + "/licenses/" + name, data + "/" + name);
const report = {
  root,
  site,
  data,
  bodyBytes,
  siteBytesBeforeDescriptor: siteBytes,
  descriptorBytes: 0,
  targetBytes,
  detailBlocks: stats.length,
  oversizedSinglePoems: stats.filter((b) => b.bytes > targetBytes).length,
  maxBlockBytes: Math.max(...stats.map((b) => b.bytes)),
  inventory: root + "/body-inventory.json",
  indexVersion: config.version,
};
writeFileSync(
  "prototype/remote-body/build.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
