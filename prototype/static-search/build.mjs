import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { libraryCatalog } from "../../dist/modules/library-loader.js";
const root = process.env.STATIC_DATA || "/tmp/shiju-static-search";
const song = process.env.SONG_DATA || "/tmp/shiju-song-eval";
const normalized = process.env.SEARCH_DATA || "/tmp/shiju-search-normalized";
const version = createHash("sha256")
  .update(readFileSync(normalized + "/version"))
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex")
  .slice(0, 20);
const base = root + "/" + version;
mkdirSync(base, { recursive: true });
const catalog = {
  ...libraryCatalog,
  "song-era": { name: "宋", file: "song-era.json" },
};
let bytes = { ranks: 0, summaries: 0, detail: 0 };
for (const [key, entry] of Object.entries(catalog)) {
  const rows = JSON.parse(
    readFileSync((key === "song-era" ? song : "dist/data") + "/" + entry.file),
  );
  const ranks = JSON.parse(
    readFileSync(normalized + "/" + entry.file.replace(".json", ".rank")),
  );
  const manifest = {
    count: rows.length,
    size: 128,
    ranks: [],
    summaries: [],
    detail: [],
  };
  mkdirSync(base + "/" + key, { recursive: true });
  function part(kind, value) {
    const raw = JSON.stringify(value);
    const name =
      createHash("sha256").update(raw).digest("hex").slice(0, 20) + ".json";
    writeFileSync(base + "/" + key + "/" + name, raw);
    bytes[kind] += Buffer.byteLength(raw);
    return name;
  }
  for (let i = 0; i < rows.length; i += 128) {
    manifest.ranks.push(part("ranks", ranks.slice(i, i + 128)));
    manifest.summaries.push(
      part(
        "summaries",
        rows.slice(i, i + 128).map((p, j) => ({
          id: key + ":" + (i + j),
          title: p.title || p.label || "无题",
          author: p.author,
          collection: p.collection,
          notice: p.notice || "",
          excerpt: Array.from(p.text.split("\n")[0]).slice(0, 80).join(""),
        })),
      ),
    );
    // Compact detail blocks; only opened works need these, never search lists.
    manifest.detail.push(part("detail", rows.slice(i, i + 128)));
  }
  writeFileSync(base + "/" + key + "/manifest.json", JSON.stringify(manifest));
}
writeFileSync(
  base + "/catalog.json",
  JSON.stringify({ version, catalog, bytes }),
);
writeFileSync(
  root + "/current.json",
  JSON.stringify({ version, catalog, bytes }),
);
console.log(JSON.stringify({ root, version, bytes }));
