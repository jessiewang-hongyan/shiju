import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { libraryCatalog } from "../../dist/modules/library-loader.js";
import { normalize } from "./normalize.mjs";
const out = resolve(process.env.SEARCH_DATA || "/tmp/shiju-search-normalized");
const song = process.env.SONG_DATA;
const catalog = {
  ...libraryCatalog,
  ...(song ? { "song-era": { file: "song-era.json" } } : {}),
};
mkdirSync(out, { recursive: true });
const stamp = createHash("sha256");
for (const [key, { file }] of Object.entries(catalog)) {
  const root = key === "song-era" ? song : "dist/data";
  const raw = readFileSync(root + "/" + file);
  stamp.update(raw);
  const records = JSON.parse(raw).map((p) =>
    Object.fromEntries(
      ["title", "label", "author", "collection", "sourceWork", "text"]
        .filter((k) => p[k] !== undefined)
        .map((k) => [k, normalize(p[k])]),
    ),
  );
  writeFileSync(out + "/" + file, JSON.stringify(records));
  const stem = file.replace(".json", "");
  mkdirSync(out + "/parts/" + stem, { recursive: true });
  copyFileSync(
    root + "/parts/" + stem + "/manifest.json",
    out + "/parts/" + stem + "/manifest.json",
  );
  writeFileSync(
    out + "/" + stem + ".rank",
    JSON.stringify(
      records.map((p) => [p.title || p.label || "", p.author || ""]),
    ),
  );
  console.log(key, records.length);
}
const code = readFileSync("scripts/build-search-index.py", "utf8").replace(
  "ROOT = Path(__file__).resolve().parents[1] / 'dist/data'",
  "ROOT = Path(" + JSON.stringify(out) + ")",
);
const result = spawnSync("python3", ["-c", code], { stdio: "inherit" });
if (result.status) process.exit(result.status);
writeFileSync(out + "/version", stamp.digest("hex"));
