import test from "node:test";
import assert from "node:assert/strict";
import { createLibrarySearch } from "../dist/modules/library-search.js";

test("cached search preserves substring AND semantics, refinements, deletion and scope changes", () => {
  const search = createLibrarySearch();
  const a = {
    title: "明月",
    author: "甲",
    text: "清泉石上流 □□",
    collection: "唐诗",
  };
  const b = {
    title: "明",
    author: "乙",
    text: "山间",
    label: "第 1 则",
    sourceWork: "原书",
  };
  const rows = [a, b];
  assert.equal(search("a", rows, ""), rows);
  const results = search("a", rows, "明");
  assert.deepEqual(results, rows);
  assert.equal(search("a", rows, "明"), results);
  assert.deepEqual(search("a", rows, "明月 清泉"), [a]);
  assert.deepEqual(search("a", rows, "明"), rows);
  assert.deepEqual(search("a", rows, "原书 第 1"), [b]);
  assert.deepEqual(search("a", rows, "□□"), [a]);
  assert.deepEqual(search("a", rows, "唐诗 甲"), [a]);
  assert.deepEqual(search("b", [b], "明月"), []);
  assert.deepEqual(search("a", [b, a], "明"), [b, a]);
  assert.deepEqual(search("a", rows, "不存在"), []);
  assert.deepEqual(search("a", rows, ""), rows);
});

test("all deployed records match the previous full scan for representative queries", async () => {
  const { readFile } = await import("node:fs/promises");
  const { libraryCatalog } = await import("../dist/modules/library-loader.js");
  const search = createLibrarySearch();
  for (const [key, { file }] of Object.entries(libraryCatalog)) {
    const rows = JSON.parse(
      await readFile(new URL("../dist/data/" + file, import.meta.url)),
    );
    for (const q of [
      "",
      "月",
      "明月",
      "李 白",
      "清泉",
      "第 1",
      "□□",
      "不存在xyz",
    ]) {
      const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const expected = rows.filter((p) =>
        words.every((word) =>
          [p.title, p.label, p.collection, p.sourceWork, p.author, p.text]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(word),
        ),
      );
      assert.deepEqual(search(key, rows, q), expected, `${key}: ${q}`);
    }
  }
});
