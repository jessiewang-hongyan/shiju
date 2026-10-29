import { createIndexedLibrary } from "../../dist/modules/library-index.js";
import { libraryCatalog } from "../../dist/modules/library-loader.js?v=20261028batch5a";
libraryCatalog["song-era"] = { name: "宋", file: "song-era.json" };
import { relevance } from "./relevance.mjs";
export { relevance } from "./relevance.mjs";
export function createStaticSearch({ fetchJSON, normalize, legacy = false }) {
  let config;
  const rawCache = new Map();
  let cachedBytes = 0;
  async function read(url) {
    if (rawCache.has(url)) {
      const raw = rawCache.get(url);
      rawCache.delete(url);
      rawCache.set(url, raw);
      return JSON.parse(raw);
    }
    const value = await fetchJSON(url),
      raw = JSON.stringify(value),
      size = raw.length * 2;
    if (size <= 8e6) {
      while (cachedBytes + size > 8e6 && rawCache.size) {
        const [k, v] = rawCache.entries().next().value;
        cachedBytes -= v.length * 2;
        rawCache.delete(k);
      }
      rawCache.set(url, raw);
      cachedBytes += size;
    }
    return value;
  }
  async function setup() {
    return (config ||= await read("static-data/current.json"));
  }
  async function search({
    q = "",
    scope = "all",
    field = "title-author",
    offset = 0,
    limit = 40,
  }) {
    const conf = await setup(),
      base = "static-data/" + conf.version + "/";
    if (!["title-author", "title", "author", "full"].includes(field))
      throw Error("搜索范围无效");
    const keys = scope === "all" ? Object.keys(conf.catalog) : [scope];
    if (keys.some((k) => !conf.catalog[k])) throw Error("文集无效");
    const query = normalize(q).trim().split(/\s+/).filter(Boolean).join(" ");
    // Per-query parsed postings are released; raw shared cache is bounded.
    const engine = createIndexedLibrary({
      fetch: async (url) => ({ ok: true, json: () => read(url) }),
    });
    const all = [];
    for (const key of keys) {
      const ids = await engine.search(key, query, field);
      if (!ids.length) continue;
      const m = await read(base + key + "/manifest.json");
      const groups = new Map();
      for (const row of ids) {
        const block = Math.floor(row / m.size);
        if (!groups.has(block)) groups.set(block, []);
        groups.get(block).push(row);
      }
      for (const [block, rows] of groups) {
        const ranks = query
          ? await read(base + key + "/" + m.ranks[block])
          : null;
        for (const row of rows)
          all.push({
            key,
            row,
            score: ranks ? relevance(...ranks[row % m.size], query) : [0, 0, 0],
          });
      }
    }
    all.sort(
      (a, b) =>
        a.score[0] - b.score[0] ||
        a.score[1] - b.score[1] ||
        a.score[2] - b.score[2],
    );
    const chosen = all.slice(offset, offset + limit),
      items = [];
    for (const { key, row } of chosen) {
      if (legacy) {
        const [p] = await engine.records(key, [row], field);
        items.push({
          id: key + ":" + row,
          title: p.title || p.label || "无题",
          author: p.author,
          collection: p.collection,
          notice: p.notice || "",
          excerpt: Array.from(p.text.split("\n")[0]).slice(0, 80).join(""),
        });
      } else {
        const m = await read(base + key + "/manifest.json");
        const block = await read(
          base + key + "/" + m.summaries[Math.floor(row / m.size)],
        );
        items.push(block[row % m.size]);
      }
    }
    return {
      version: conf.version,
      total: all.length,
      items,
      nextOffset: offset + limit < all.length ? offset + limit : null,
    };
  }
  async function poem(id, version) {
    const conf = await setup();
    if (version !== conf.version) throw Error("版本已变化，请重新搜索");
    const [key, n] = id.split(":"),
      row = Number(n);
    if (!conf.catalog[key] || !Number.isInteger(row) || row < 0)
      throw Error("原文不存在");
    const base = "static-data/" + conf.version + "/" + key + "/";
    const m = await read(base + "manifest.json");
    if (row >= m.count) throw Error("原文不存在");
    return (await read(base + m.detail[Math.floor(row / m.size)]))[
      row % m.size
    ];
  }
  return { search, poem, setup };
}
