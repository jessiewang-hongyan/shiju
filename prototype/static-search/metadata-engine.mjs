import { postingRows } from "./posting-codec.mjs";
import { relevance } from "./relevance.mjs";
export function createMetadataSearch({
  fetchJSON,
  normalize,
  getSignal = () => undefined,
}) {
  let config;
  const cache = new Map();
  let bytes = 0;
  async function read(url) {
    const signal = getSignal();
    signal?.throwIfAborted();
    if (cache.has(url)) {
      const s = cache.get(url);
      cache.delete(url);
      cache.set(url, s);
      return JSON.parse(s);
    }
    let data = await fetchJSON(url);
    if (data?.encoding === "gzip-base64-v1") {
      const { unpack } = await import("./unpack.mjs");
      signal?.throwIfAborted();
      data = unpack(data);
    }
    signal?.throwIfAborted();
    const s = JSON.stringify(data),
      size = s.length * 2;
    if (size < 8e6) {
      while (bytes + size > 8e6 && cache.size) {
        const [k, v] = cache.entries().next().value;
        bytes -= v.length * 2;
        cache.delete(k);
      }
      cache.set(url, s);
      bytes += size;
    }
    return data;
  }
  async function setup() {
    return (config ||= await read("static-data/metadata-current.json"));
  }
  async function search({
    q = "",
    scope = "all",
    field = "title-author",
    offset = 0,
    limit = 40,
  }) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 40
    )
      throw Error("分页参数无效");
    const c = await setup();
    if (!["title-author", "title", "author"].includes(field))
      throw Error("仅支持篇名与作者搜索");
    if (scope !== "all" && !c.catalog[scope]) throw Error("文集无效");
    const query = normalize(q).trim().split(/\s+/).filter(Boolean).join(" "),
      words = query.split(/\s+/).filter(Boolean);
    let found = [];
    let directItems = null;
    let preselected = null,
      total;
    if (c.hot?.[query]) {
      const base = "static-data/" + c.version + "/";
      const m = await read(base + c.hot[query]);
      const group = m.fields[field][scope];
      total = group.count;
      preselected = [];
      if (group.preview && offset + limit <= 40) {
        directItems = (await read(base + group.preview)).slice(offset, offset + limit);
      }
      for (
        let page = Math.floor(offset / m.size);
        !directItems && page <= Math.floor(Math.min(offset + limit - 1, total - 1) / m.size);
        page++
      ) {
        const rows = await read(base + group.files[page]);
        for (let j = 0; j < rows.length; j++) {
          const n = page * m.size + j;
          if (n >= offset && n < offset + limit) {
            const [k, row] = rows[j];
            preselected.push({ key: c.keys[k], row });
          }
        }
      }
    } else if (query) {
      const chars = [...new Set(query.replace(/\s/g, ""))];
      let directory = c.chars;
      if (!directory) {
        const counts = field === "author" ? c.authorCharCounts : c.charCounts;
        const totalRecords = Object.values(c.counts).reduce((a, b) => a + b, 0);
        if (counts && (scope === "all" || field === "author" || c.counts[scope] > totalRecords * 0.1)) {
          const prefix = field === "author" ? "a-" : "p-";
          directory = Object.fromEntries(chars.filter(ch => counts[ch]).map(ch => [ch, [counts[ch], prefix + ch.codePointAt(0).toString(16) + ".json"]]));
        } else {
          directory = await read("static-data/" + c.version + "/" + (field === "author" && c.authorCharsFile ? c.authorCharsFile : scope === "all" ? c.charsFile : c.scopeIndexes[scope]));
        }
      }
      if (chars.every((ch) => directory[ch])) {
        chars.sort((a, b) => directory[a][0] - directory[b][0]);
        const candidates = await read(
          "static-data/" + c.version + "/" + directory[chars[0]][1],
        );
        for (const [k, row, title, author] of postingRows(candidates)) {
          const key = c.keys[k];
          if (scope !== "all" && key !== scope) continue;
          const text =
            field === "title"
              ? title
              : field === "author"
                ? author
                : title + " " + author;
          if (words.every((w) => text.includes(w)))
            found.push({ key, row, score: relevance(title, author, query) });
        }
        found.sort(
          (a, b) =>
            a.score[0] - b.score[0] ||
            a.score[1] - b.score[1] ||
            a.score[2] - b.score[2],
        );
      }
    } else {
      total = 0;
      preselected = [];
      for (const key of c.keys) if (scope === "all" || key === scope) {
        const start = Math.max(0, offset - total);
        const end = Math.min(c.counts[key], offset + limit - total);
        for (let row = start; row < end; row++) preselected.push({ key, row });
        total += c.counts[key];
      }
    }
    const chosen = preselected || found.slice(offset, offset + limit),
      items = directItems || [],
      local = new Map();
    async function once(url) {
      if (!local.has(url)) local.set(url, read(url));
      return local.get(url);
    }
    // Eight concurrent block reads, sharing promises within this page.
    async function item({ key, row }) {
      const base = "static-data/" + c.sourceVersion + "/" + key + "/";
      const m = await once(base + "manifest.json");
      return (await once(base + m.summaries[Math.floor(row / m.size)]))[
        row % m.size
      ];
    }
    for (let i = 0; i < chosen.length; i += 8)
      items.push(...(await Promise.all(chosen.slice(i, i + 8).map(item))));
    return {
      version: c.version,
      total: total ?? found.length,
      items,
      nextOffset:
        offset + limit < (total ?? found.length) ? offset + limit : null,
    };
  }
  async function poem(id, version) {
    const c = await setup();
    if (version !== c.version) throw Error("版本已变化，请重新搜索");
    const [key, n] = id.split(":"),
      row = Number(n);
    if (
      !c.catalog[key] ||
      !Number.isInteger(row) ||
      row < 0 ||
      row >= c.counts[key]
    )
      throw Error("原文不存在");
    const base = "static-data/" + c.sourceVersion + "/" + key + "/";
    const m = await read(base + "manifest.json");
    return (await read(base + m.detail[Math.floor(row / m.size)]))[
      row % m.size
    ];
  }
  return { setup, search, poem };
}
