import { libraryCatalog } from "./library-loader.js?v=20261028search1";

// Exact substring search via UTF-16 positions; full source shards are only
// fetched for visible results. Hash URLs keep indexes and source versions paired.
export function createIndexedLibrary({ fetch = globalThis.fetch } = {}) {
  const cache = new Map();
  const searches = new Map();
  const queue = [];
  let active = 0;
  function request(url) {
    if (cache.has(url)) return cache.get(url);
    const task = new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          for (let attempt = 0; ; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
              const response = await fetch(url, { signal: controller.signal });
              if (!response.ok) throw Error("load");
              resolve(await response.json());
              break;
            } catch (error) {
              if (attempt === 2) throw error;
            } finally {
              clearTimeout(timer);
            }
          }
        } catch (error) {
          cache.delete(url);
          reject(error);
        } finally {
          active--;
          pump();
        }
      });
      pump();
    });
    cache.set(url, task);
    return task;
  }
  function pump() {
    while (active < 4 && queue.length) {
      active++;
      queue.shift()();
    }
  }
  function stem(key) {
    return libraryCatalog[key].file.replace(".json", "");
  }
  async function manifest(key) {
    const url = `data/search/${stem(key)}/manifest.json`;
    const m = await request(url);
    if (
      !m ||
      m.version !== 1 ||
      !Array.isArray(m.offsets) ||
      m.offsets.length !== m.count ||
      !m.offsets.every(
        (p, i) =>
          Number.isSafeInteger(p) && p >= 0 && (!i || p > m.offsets[i - 1]),
      ) ||
      !Array.isArray(m.buckets) ||
      m.buckets.length !== 64 ||
      !Array.isArray(m.parts) ||
      !m.buckets.every((p) => /^[a-f0-9]+\.json$/.test(p)) ||
      !m.parts.every(
        (p) =>
          p &&
          /^[a-f0-9]+\.json$/.test(p.file) &&
          Number.isInteger(p.count) &&
          p.count > 0,
      ) ||
      m.parts.reduce((n, p) => n + p.count, 0) !== m.count
    ) {
      cache.delete(url);
      throw Error("index format");
    }
    return m;
  }
  function recordAt(offsets, position) {
    let lo = 0,
      hi = offsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid] <= position) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }
  function search(key, query) {
    const signature = query
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
    const previous = searches.get(key);
    if (previous?.signature === signature) return previous.task;
    const task = find(key, signature).catch((error) => {
      if (searches.get(key)?.task === task) searches.delete(key);
      throw error;
    });
    searches.set(key, { signature, task });
    return task;
  }
  async function find(key, query) {
    const m = await manifest(key);
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return Array.from({ length: m.count }, (_, i) => i);
    const units = [
      ...new Set(words.flatMap((w) => w.split("").map((c) => c.charCodeAt(0)))),
    ];
    const bucketIds = [...new Set(units.map((c) => c % 64))];
    const buckets = new Map(
      await Promise.all(
        bucketIds.map(async (id) => {
          const url = `data/search/${stem(key)}/${m.buckets[id]}`;
          const bucket = await request(url);
          if (
            !bucket ||
            Array.isArray(bucket) ||
            typeof bucket !== "object" ||
            !Object.values(bucket).every(
              (list) =>
                Array.isArray(list) &&
                list.every(
                  (p, i) =>
                    Number.isSafeInteger(p) &&
                    p >= 0 &&
                    (!i || p > list[i - 1]),
                ),
            )
          ) {
            cache.delete(url);
            throw Error("index bucket format");
          }
          return [id, bucket];
        }),
      ),
    );
    const postings = (unit) => buckets.get(unit % 64)[unit] || [];
    let matches;
    for (const word of words) {
      const chars = word.split("").map((c) => c.charCodeAt(0));
      const lists = chars.map(postings);
      let anchor = 0;
      for (let i = 1; i < lists.length; i++)
        if (lists[i].length < lists[anchor].length) anchor = i;
      function contains(list, value) {
        let lo = 0,
          hi = list.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (list[mid] < value) lo = mid + 1;
          else hi = mid;
        }
        return list[lo] === value;
      }
      const found = new Set();
      for (const p of lists[anchor]) {
        const start = p - anchor;
        if (lists.every((list, i) => i === anchor || contains(list, start + i)))
          found.add(recordAt(m.offsets, start));
      }
      matches = matches
        ? new Set([...matches].filter((id) => found.has(id)))
        : found;
      if (!matches.size) break;
    }
    return [...matches].sort((a, b) => a - b);
  }
  async function records(key, ids) {
    const m = await manifest(key);
    let start = 0;
    const ranges = m.parts.map((p) => {
      const r = { ...p, start };
      start += p.count;
      return r;
    });
    const selected = ids.map((id) => {
      const part = ranges.find((p) => id >= p.start && id < p.start + p.count);
      if (!part) throw Error("record range");
      return { part, id };
    });
    const parts = new Map(
      await Promise.all(
        [...new Set(selected.map((x) => x.part))].map(async (p) => {
          const url = `data/parts/${stem(key)}/${p.file}`;
          const data = await request(url);
          if (
            !Array.isArray(data) ||
            data.length !== p.count ||
            !data.every(
              (row) =>
                row &&
                typeof row.title === "string" &&
                typeof row.author === "string" &&
                typeof row.text === "string",
            )
          ) {
            cache.delete(url);
            throw Error("source format");
          }
          return [p.file, data];
        }),
      ),
    );
    return selected.map(
      ({ part, id }) => parts.get(part.file)[id - part.start],
    );
  }
  return { search, records };
}
