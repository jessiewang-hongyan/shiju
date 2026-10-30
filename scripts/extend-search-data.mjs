import { unpack } from '../prototype/static-search/unpack.mjs';
// Extend a pinned dataset with audited collections; never mutate the base dataset.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { normalize } from "../prototype/search/normalize.mjs";
import { splitBodies } from "../prototype/remote-body/blocks.mjs";
const [base, input, outArg] = process.argv.slice(2),
  out = resolve(outArg);
const read = (p) => JSON.parse(readFileSync(p));
const save = (p, v) => writeFileSync(p, JSON.stringify(v));
const hash = (s) => createHash("sha256").update(s).digest("hex");
const old = read(base + "/static-data/metadata-current.json"),
  audit = read(input + "/audit.json");
const sourceVersion =
  hash(old.sourceVersion + JSON.stringify(audit)).slice(0, 20) + "-remote-v2";
mkdirSync(out, { recursive: false });
mkdirSync(out + "/static-data");
mkdirSync(out + "/ranks");
cpSync(base + "/bodies", out + "/bodies", { recursive: true });
cpSync(base + "/licenses", out + "/licenses", { recursive: true });
cpSync(
  "docs/source-catalog-inventory.json",
  out + "/source-catalog-inventory.json",
);
const catalog = { ...old.catalog },
  inv = read(base + "/body-inventory.json");
for (const key of old.keys) {
  const src = base + "/static-data/" + old.sourceVersion + "/" + key,
    dest = out + "/static-data/" + sourceVersion + "/" + key;
  cpSync(src, dest, { recursive: true });
  const m = read(dest + "/manifest.json");
  const ranks = m.summaries.flatMap((file) =>
    unpack(read(dest + "/" + file)).map((p) => [
      normalize(p.title),
      normalize(p.author),
    ]),
  );
  save(out + "/ranks/" + catalog[key].file.replace(".json", ".rank"), ranks);
}
for (const a of audit) {
  const { key, name } = a,
    rows = read(input + "/" + key + ".json");
  catalog[key] = { name, file: key + ".json" };
  const dest = out + "/static-data/" + sourceVersion + "/" + key,
    prefix = sourceVersion + "/" + key + "/";
  mkdirSync(dest, { recursive: true });
  mkdirSync(out + "/bodies/" + prefix, { recursive: true });
  const blocks = splitBodies(rows),
    refs = [];
  for (const b of blocks) {
    writeFileSync(out + "/bodies/" + prefix + b.hash + ".json", b.text);
    inv.files[prefix + b.hash + ".json"] = b.hash;
    for (let i = 0; i < b.count; i++)
      refs.push({ start: b.start, hash: b.hash });
  }
  const m = {
    count: rows.length,
    size: 128,
    summaries: [],
    body: { version: "pending", baseURL: "@BODY_BASE_URL@", prefix },
  };
  for (let i = 0; i < rows.length; i += 128) {
    const seen = new Map();
    const page = rows.slice(i, i + 128).map((p, j) => {
      const ref = refs[i + j];
      let body = ref;
      if (seen.has(ref.hash)) body = seen.get(ref.hash);
      else seen.set(ref.hash, j);
      return {
        id: key + ":" + (i + j),
        title: p.title || p.label || "无题",
        author: p.author,
        collection: p.collection,
        notice: p.notice,
        excerpt: Array.from(p.text.split("\n")[0]).slice(0, 80).join(""),
        body,
      };
    });
    const raw = JSON.stringify(page),
      file = hash(raw).slice(0, 20) + ".json";
    writeFileSync(dest + "/" + file, raw);
    m.summaries.push(file);
  }
  save(dest + "/manifest.json", m);
  save(
    out + "/ranks/" + key + ".rank",
    rows.map((p) => [normalize(p.title), normalize(p.author)]),
  );
  console.log(key, rows.length);
}
save(out + "/static-data/current.json", { version: sourceVersion, catalog });
execFileSync(
  process.execPath,
  ["--max-old-space-size=4096", "prototype/static-search/build-metadata.mjs"],
  {
    env: {
      ...process.env,
      STATIC_DATA: out + "/static-data",
      SEARCH_DATA: out + "/ranks",
    },
    stdio: "inherit",
  },
);
const config = read(out + "/static-data/metadata-current.json");
for (const key of config.keys) {
  const path =
      out + "/static-data/" + sourceVersion + "/" + key + "/manifest.json",
    m = read(path);
  m.body.version = config.version;
  save(path, m);
}
inv.indexVersion = config.version;
inv.sourceVersion = sourceVersion;
save(out + "/body-inventory.json", inv);
save(out + "/import-audit.json", audit);
console.log(
  JSON.stringify({
    out,
    collections: config.keys.length,
    records: Object.values(config.counts).reduce((a, b) => a + b, 0),
  }),
);
