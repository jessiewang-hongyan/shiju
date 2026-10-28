export const libraryCatalog = {
  guwen: { name: "古文观止", file: "guwen.json" },
  youmengying: { name: "幽梦影", file: "youmengying.json" },
  shenglv: { name: "声律启蒙", file: "shenglv.json" },
  nantang: { name: "南唐二主词", file: "nantang.json" },
  shijing: { name: "诗经", file: "shijing.json" },
  chuci: { name: "楚辞", file: "chuci.json" },
  "han-yuefu": { name: "汉乐府", file: "han-yuefu.json" },
  han: { name: "汉诗", file: "han.json" },
  weijin: { name: "魏晋诗", file: "weijin.json" },
  tang: { name: "唐诗", file: "tang.json" },
  song: { name: "宋词", file: "song-ci.json" },
  yuan: { name: "元曲", file: "yuan.json" },
};

export function createLibraryLoader({
  onChange = () => {},
  fetch = globalThis.fetch,
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
} = {}) {
  const libraryCache = new Map(),
    libraryPending = new Map(),
    libraryErrors = new Set();
  const libraryComplete = new Set(),
    libraryManifests = new Map(),
    libraryParts = new Map();
  let libraryActive = 0;
  const libraryQueue = [];
  function libraryRequest(task) {
    return new Promise((resolve, reject) => {
      libraryQueue.push({ task, resolve, reject });
      pumpLibraryQueue();
    });
  }
  function pumpLibraryQueue() {
    while (libraryActive < 2 && libraryQueue.length) {
      const job = libraryQueue.shift();
      libraryActive++;
      job
        .task()
        .then(job.resolve, job.reject)
        .finally(() => {
          libraryActive--;
          pumpLibraryQueue();
        });
    }
  }
  async function fetchLibraryJSON(url, valid) {
    return libraryRequest(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error("load");
          const data = await response.json();
          if (!valid(data)) throw new Error("format");
          return data;
        } catch (error) {
          if (attempt === 2) throw error;
        } finally {
          clearTimeout(timer);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
      }
    });
  }
  async function loadLibraryCollection(key) {
    if (libraryComplete.has(key)) return;
    if (libraryPending.has(key)) return libraryPending.get(key);
    libraryErrors.delete(key);
    const task = (async () => {
      try {
        const base =
          "data/parts/" + libraryCatalog[key].file.replace(".json", "") + "/";
        if (!libraryManifests.has(key))
          libraryManifests.set(
            key,
            await fetchLibraryJSON(
              base + "manifest.json",
              (data) =>
                Array.isArray(data) &&
                data.length > 0 &&
                data.every(
                  (p) =>
                    /^[a-f0-9]+\.json$/.test(p.file) &&
                    Number.isInteger(p.count) &&
                    p.count > 0,
                ),
            ),
          );
        const manifest = libraryManifests.get(key);
        if (!libraryParts.has(key)) libraryParts.set(key, new Map());
        const parts = libraryParts.get(key);
        // Preserve completed batches, original order and available poems on failure.
        for (let i = 0; i < manifest.length; i++) {
          if (parts.has(i)) continue;
          const data = await fetchLibraryJSON(
            base + manifest[i].file,
            (data) =>
              Array.isArray(data) &&
              data.length === manifest[i].count &&
              data.every(
                (p) =>
                  typeof p.title === "string" &&
                  typeof p.author === "string" &&
                  typeof p.text === "string",
              ),
          );
          parts.set(i, data);
          libraryCache.set(
            key,
            manifest.flatMap((_, index) => parts.get(index) || []),
          );
          onChange();
        }
        libraryComplete.add(key);
      } catch {
        libraryErrors.add(key);
      }
    })();
    libraryPending.set(key, task);
    onChange();
    await task;
    libraryPending.delete(key);
    onChange();
  }
  async function load(keys) {
    await Promise.all(keys.map(loadLibraryCollection));
    onChange();
  }
  return {
    load,
    cache: libraryCache,
    pending: libraryPending,
    errors: libraryErrors,
    complete: libraryComplete,
  };
}
