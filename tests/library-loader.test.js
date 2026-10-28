import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibraryLoader,
  libraryCatalog,
} from "../dist/modules/library-loader.js";
const poem = { title: "诗", author: "作者", text: "原文" };
const fastTimer = (fn, ms) => setTimeout(fn, ms === 30000 ? 100 : 1);
test("partial results, retries, deduplication, resumable loading and global concurrency", async () => {
  let active = 0,
    peak = 0,
    broken = true;
  const requests = [],
    snapshots = [];
  const loader = createLibraryLoader({
    setTimeout: fastTimer,
    onChange: () => snapshots.push(loader.cache.get("tang")?.length || 0),
    fetch: async (url) => {
      requests.push(url);
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((r) => setTimeout(r, 2));
        if (broken && url.endsWith("/b.json")) throw Error("offline");
        return {
          ok: true,
          json: async () =>
            url.endsWith("manifest.json")
              ? [
                  { file: "a.json", count: 1 },
                  { file: "b.json", count: 1 },
                ]
              : [poem],
        };
      } finally {
        active--;
      }
    },
  });
  await Promise.all([loader.load(["tang"]), loader.load(["tang"])]);
  assert.equal(loader.cache.get("tang").length, 1);
  assert(loader.errors.has("tang"));
  assert(snapshots.includes(1));
  assert.equal(requests.filter((u) => u.endsWith("/a.json")).length, 1);
  assert.equal(requests.filter((u) => u.endsWith("/b.json")).length, 3);
  broken = false;
  await loader.load(["tang"]);
  assert.equal(loader.cache.get("tang").length, 2);
  assert(loader.complete.has("tang"));
  await loader.load(["tang"]);
  assert.equal(requests.filter((u) => u.endsWith("/a.json")).length, 1);
  assert.equal(requests.filter((u) => u.endsWith("/b.json")).length, 4);
  await loader.load(Object.keys(libraryCatalog));
  assert.equal(peak, 2);
  assert.equal(loader.complete.size, Object.keys(libraryCatalog).length);
  assert.equal(loader.errors.size, 0);
});
test("HTTP error, malformed data and timeout do not become cached successes", async () => {
  for (const mode of ["http", "format", "timeout"]) {
    let calls = 0;
    const loader = createLibraryLoader({
      setTimeout: fastTimer,
      fetch: async (_url, { signal }) => {
        calls++;
        if (mode === "timeout")
          return new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(Error("timeout"))),
          );
        return { ok: mode !== "http", json: async () => ({ bad: true }) };
      },
    });
    await loader.load(["shijing"]);
    assert(loader.errors.has("shijing"));
    assert.equal(loader.complete.size, 0);
    assert.equal(calls, 3);
  }
});

test("single collection loads concurrently, preserves order and continues after a failed shard", async () => {
  let active = 0,
    peak = 0;
  const loader = createLibraryLoader({
    setTimeout: fastTimer,
    fetch: async (url) => {
      if (url.endsWith("manifest.json"))
        return {
          ok: true,
          json: async () => [
            { file: "a.json", count: 1 },
            { file: "b.json", count: 1 },
            { file: "c.json", count: 1 },
          ],
        };
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((r) =>
          setTimeout(r, url.endsWith("a.json") ? 15 : 1),
        );
        if (url.endsWith("b.json")) throw Error("offline");
        return {
          ok: true,
          json: async () => [
            { ...poem, title: url.endsWith("a.json") ? "first" : "last" },
          ],
        };
      } finally {
        active--;
      }
    },
  });
  await loader.load(["tang"]);
  assert.equal(peak, 2);
  assert.deepEqual(
    loader.cache.get("tang").map((p) => p.title),
    ["first", "last"],
  );
  assert(loader.errors.has("tang"));
  assert(!loader.complete.has("tang"));
});
