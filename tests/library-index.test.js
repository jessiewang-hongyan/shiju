import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createIndexedLibrary } from "../dist/modules/library-index.js";
import { libraryCatalog } from "../dist/modules/library-loader.js";
const read = (url) => JSON.parse(readFileSync("dist/" + url, "utf8"));
const localFetch = async (url) => ({ ok: true, json: async () => read(url) });

test("positional index equals exact full scan across all collections; records preserve provenance", async () => {
  const index = createIndexedLibrary({ fetch: localFetch });
  for (const [key, { file }] of Object.entries(libraryCatalog)) {
    const rows = read("data/" + file);
    for (const query of [
      "",
      "月",
      "明月",
      "清泉",
      "王维 明月",
      "□□",
      "第 1",
      "不存在xyz",
      "。",
      "ab",
    ]) {
      const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const expected = rows.flatMap((p, i) =>
        words.every((w) =>
          [p.title, p.label, p.collection, p.sourceWork, p.author, p.text]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(w),
        )
          ? [i]
          : [],
      );
      const ids = await index.search(key, query);
      assert.deepEqual(ids, expected, key + ":" + query);
      assert.deepEqual(
        await index.records(key, ids.slice(0, 3)),
        ids.slice(0, 3).map((i) => rows[i]),
      );
    }
  }
});
test("cold Tang search fetches only required buckets and visible source shards, with reduced compressed bytes", async () => {
  const urls = [];
  const index = createIndexedLibrary({
    fetch: async (url) => {
      urls.push(url);
      return localFetch(url);
    },
  });
  const ids = await index.search("tang", "明月");
  assert.equal(ids.length, 957);
  assert(!urls.some((u) => u.startsWith("data/parts/")));
  await index.records("tang", ids.slice(0, 40));
  const transferred = urls.reduce(
    (n, u) => n + gzipSync(readFileSync("dist/" + u)).length,
    0,
  );
  const manifest = read("data/parts/tang/manifest.json");
  const full = manifest.reduce(
    (n, p) =>
      n + gzipSync(readFileSync("dist/data/parts/tang/" + p.file)).length,
    0,
  );
  assert(transferred < full * 0.3, `${transferred} vs ${full}`);
  console.log(
    JSON.stringify({
      query: "明月",
      results: ids.length,
      requests: urls.length,
      gzipBytes: transferred,
      previousGzipBytes: full,
    }),
  );
  const before = urls.length;
  await index.search("tang", "明月");
  await index.records("tang", ids.slice(0, 40));
  assert.equal(urls.length, before);
});
test("failed index requests recover and malformed source never becomes selectable", async () => {
  let broken = true,
    calls = 0;
  const index = createIndexedLibrary({
    fetch: async (url) => {
      calls++;
      if (broken) throw Error("offline");
      return localFetch(url);
    },
  });
  await assert.rejects(index.search("nantang", "□"));
  assert.equal(calls, 3);
  broken = false;
  assert((await index.search("nantang", "□")).length > 0);
  const bad = createIndexedLibrary({
    fetch: async (url) =>
      url.startsWith("data/parts/")
        ? { ok: true, json: async () => ({ bad: true }) }
        : localFetch(url),
  });
  await assert.rejects(bad.records("nantang", [0]), /source format/);
});

test("three metadata modes match independent field scans across every collection", async () => {
  const urls = [];
  const index = createIndexedLibrary({
    fetch: async (url) => {
      urls.push(url);
      return localFetch(url);
    },
  });
  for (const [key, { file }] of Object.entries(libraryCatalog)) {
    const rows = read("data/" + file);
    for (const field of ["title-author", "title", "author"]) {
      for (const q of [
        "",
        "月",
        "王维",
        "王维 明月",
        "第 1",
        "下卷",
        "□□",
        "不存在xyz",
      ]) {
        const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const expected = rows.flatMap((p, i) => {
          const title = p.title || p.label || "";
          const text = (
            field === "title"
              ? title
              : field === "author"
                ? p.author
                : title + " " + p.author
          ).toLocaleLowerCase();
          return words.every((w) => text.includes(w)) ? [i] : [];
        });
        assert.deepEqual(
          await index.search(key, q, field),
          expected,
          `${key} ${field} ${q}`,
        );
      }
    }
    assert.deepEqual(await index.records(key, [0], "title-author"), [rows[0]]);
  }
  assert(
    urls.every((u) => u.includes("/metadata/") || u.startsWith("data/parts/")),
    "no full-text index requests",
  );
});
test("cold title/author search transfers less index data and mode changes do not reuse wrong results", async () => {
  const bytes = async (field) => {
    const urls = [];
    const index = createIndexedLibrary({
      fetch: async (url) => {
        urls.push(url);
        return localFetch(url);
      },
    });
    const ids = await index.search("tang", "王维", field);
    const size = urls.reduce(
      (n, u) => n + gzipSync(readFileSync("dist/" + u)).length,
      0,
    );
    return { size, ids };
  };
  const metadata = await bytes("title-author"),
    full = await bytes("full");
  assert(metadata.size < full.size * 0.6);
  console.log(
    JSON.stringify({
      keyword: "王维",
      metadataIndexGzip: metadata.size,
      fullIndexGzip: full.size,
    }),
  );
  const index = createIndexedLibrary({ fetch: localFetch });
  const author = await index.search("tang", "王维", "author");
  const title = await index.search("tang", "王维", "title");
  assert.notDeepEqual(author, title);
  assert.deepEqual(await index.search("tang", "王维", "author"), author);
});
