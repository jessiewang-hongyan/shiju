import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createIndexedLibrary } from "../../dist/modules/library-index.js";
const source = readFileSync(
  new URL("../../dist/modules/library-index.js", import.meta.url),
  "utf8",
);
const ref = source.match(/from "(.+library-loader\.js[^"]*)"/)[1];
const { libraryCatalog } = await import(
  new URL(ref, new URL("../../dist/modules/library-index.js", import.meta.url))
);
if (workerData.song)
  libraryCatalog["song-era"] = { name: "宋", file: "song-era.json" };
import { normalize, relevance, compareScore } from "./normalize.mjs";
const ranks = new Map();
const cache = new Map();
let bytes = 0;
const fetchLocal = async (url) => ({
  ok: true,
  json: async () =>
    JSON.parse(
      await readFile(
        url.startsWith("data/search/")
          ? workerData.searchData + "/" + url.replace(/^data\//, "")
          : url.includes("/song-era/")
            ? workerData.song + "/" + url.replace(/^data\//, "")
            : workerData.dist + "/" + url,
        "utf8",
      ),
    ),
});
parentPort.on("message", async (job) => {
  try {
    const engine = createIndexedLibrary({ fetch: fetchLocal });
    if (job.kind === "poem") {
      const rows = await engine.records(job.key, [job.row], "title-author");
      parentPort.postMessage({ poem: rows[0] });
      return;
    }
    const query = normalize(job.q)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
    const signature = JSON.stringify([query, job.field, job.keys]);
    let matches = cache.get(signature);
    if (matches) {
      cache.delete(signature);
      cache.set(signature, matches);
    } else {
      matches = [];
      for (const key of job.keys) {
        const ids = await engine.search(key, query, job.field);
        if (!ranks.has(key))
          ranks.set(
            key,
            JSON.parse(
              await readFile(
                workerData.searchData +
                  "/" +
                  libraryCatalog[key].file.replace(".json", ".rank"),
                "utf8",
              ),
            ),
          );
        const titles = ranks.get(key);
        for (const row of ids)
          matches.push({
            key,
            row,
            score: relevance(titles[row][0], titles[row][1], query),
          });
      }
      matches.sort((a, b) => compareScore(a.score, b.score));
      matches = matches.map(({ key, row }) => ({ key, row }));
      const size = matches.length * 64 + 256;
      if (size <= 8e6) {
        while (cache.size && (bytes + size > 8e6 || cache.size >= 64)) {
          const [k, v] = cache.entries().next().value;
          bytes -= v.length * 64 + 256;
          cache.delete(k);
        }
        cache.set(signature, matches);
        bytes += size;
      }
    }
    const total = matches.length;
    const page = matches.slice(job.offset, job.offset + job.limit);
    const bodies = new Map();
    for (const key of new Set(page.map((p) => p.key))) {
      const ids = page.filter((p) => p.key === key).map((p) => p.row);
      const rows = await engine.records(key, ids, job.field);
      rows.forEach((p, i) => bodies.set(key + ":" + ids[i], p));
    }
    const items = page.map(({ key, row }) => {
      const id = key + ":" + row,
        p = bodies.get(id);
      return {
        id,
        title: p.title || p.label || "无题",
        author: p.author,
        collection: p.collection,
        notice: p.notice || "",
        excerpt: Array.from(p.text.split("\n")[0]).slice(0, 80).join(""),
      };
    });
    parentPort.postMessage({
      total,
      items,
      nextOffset:
        job.offset + items.length < total ? job.offset + items.length : null,
    });
  } catch {
    parentPort.postMessage({ failure: true });
  }
});
