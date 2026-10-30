import { unpack } from '../prototype/static-search/unpack.mjs';
// Verify imported bodies against original audited input and search against a linear oracle.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { normalize } from "../prototype/search/normalize.mjs";
const [data, site, input] = process.argv.slice(2).map((p) => resolve(p));
const read = (p) => JSON.parse(readFileSync(p));
const c = read(data + "/static-data/metadata-current.json"),
  audit = read(input + "/audit.json");
for (const { key, count } of audit) {
  const original = read(input + "/" + key + ".json"),
    dir = data + "/static-data/" + c.sourceVersion + "/" + key,
    m = read(dir + "/manifest.json");
  assert.equal(m.count, count);
  const reconstructed = [];
  let lastHash = "";
  for (const file of m.summaries)
    for (const item of unpack(read(dir + "/" + file))) {
      if (typeof item.body === "number" || item.body.hash === lastHash)
        continue;
      reconstructed.push(
        ...read(data + "/bodies/" + m.body.prefix + item.body.hash + ".json"),
      );
      lastHash = item.body.hash;
    }
  assert.deepEqual(
    reconstructed,
    original,
    key + ": original text, gaps and provenance",
  );
}
const fixtures = [
  ["赤壁赋", "all", "title-author"],
  ["赤壁賦", "all", "title"],
  ["其", "all", "title-author"],
  ["歐陽修", "song-era", "author"],
  ["唐寅", "ming-era", "author"],
  ["纳兰性德", "qing-era", "author"],
  ["納蘭性德", "qing-era", "author"],
  ["钱谦益", "ming-qing", "author"],
  ["桃花庵歌", "ming-era", "title"],
];
const ranks = new Map(
  c.keys.map((key) => [
    key,
    read(data + "/ranks/" + c.catalog[key].file.replace(".json", ".rank")),
  ]),
);
for (const f of fixtures) {
  const [query, scope, field] = f,
    q = normalize(query);
  let n = 0;
  for (const [key, rows] of ranks) {
    if (scope !== "all" && scope !== key) continue;
    for (const [title, author] of rows)
      if (
        (field === "title"
          ? title
          : field === "author"
            ? author
            : title + " " + author
        ).includes(q)
      )
        n++;
  }
  assert.ok(n > 0, query);
  f.push(n);
}
const path = input + "/search-fixtures.json";
writeFileSync(path, JSON.stringify(fixtures, null, 2));
execFileSync(
  process.execPath,
  ["--max-old-space-size=4096", "scripts/verify-release.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RELEASE_DATA_DIR: data,
      RELEASE_OUT: site,
      RELEASE_SEARCH_FIXTURES: path,
      RELEASE_VERIFICATION: input + "/verification.json",
    },
  },
);
console.log(JSON.stringify({ originalBodiesEqual: true, fixtures }));
