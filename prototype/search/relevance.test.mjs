import test from "node:test";
import assert from "node:assert/strict";
import { normalize, relevance, compareScore } from "./normalize.mjs";
test("normalize mixed and traditional text without modifying source", () => {
  assert.equal(normalize("前赤壁賦 蘇軾"), normalize("前赤壁赋 苏轼"));
  assert.equal(normalize("蘇轼 赤壁赋"), normalize("苏軾 赤壁賦"));
  assert.equal(normalize("□□■〓�"), "□□■〓�");
});
test("exact titles then shortest containing titles, stable ties, body last", () => {
  const titles = [
    "读赤壁赋前后二首",
    "前赤壁赋",
    "赤壁赋",
    "后赤壁赋",
    "苏子瞻醉写赤壁赋",
    "其他",
  ];
  const ranked = titles
    .map((title) => ({ title, score: relevance(title, "", "赤壁赋") }))
    .sort((a, b) => compareScore(a.score, b.score))
    .map((x) => x.title);
  assert.deepEqual(ranked, [
    "赤壁赋",
    "前赤壁赋",
    "后赤壁赋",
    "读赤壁赋前后二首",
    "苏子瞻醉写赤壁赋",
    "其他",
  ]);
  assert.deepEqual(relevance("任何题名", "苏轼", "苏轼"), [3, 0, 0]);
  assert.deepEqual(relevance("任何题名", "任意", ""), [0, 0, 0]);
});
test("real API returns both Su Shi works first and identical script variants", async () => {
  const base = process.env.SEARCH_URL || "http://127.0.0.1:4180";
  const query = async (q, scope = "all") => {
    const r = await fetch(
      base + "/api/search?" + new URLSearchParams({ q, scope, limit: 40 }),
    );
    assert.equal(r.status, 200);
    return r.json();
  };
  const a = await query("赤壁赋"),
    b = await query("赤壁賦");
  assert.deepEqual(
    a.items.map((x) => x.id),
    b.items.map((x) => x.id),
  );
  assert.equal(a.total, b.total);
  assert.deepEqual(
    a.items.slice(0, 2).map((x) => x.title),
    ["前赤壁賦", "後赤壁賦"],
  );
  assert(a.items.slice(0, 2).every((x) => x.author.includes("蘇軾")));
  const mixed = await query("蘇轼 赤壁赋");
  assert.deepEqual(
    mixed.items.slice(0, 2).map((x) => x.id),
    a.items.slice(0, 2).map((x) => x.id),
  );
  const scoped = await query("赤壁赋", "song-era");
  assert(scoped.items.every((x) => x.id.startsWith("song-era:")));
  const r = await fetch(
    base +
      "/api/poems/" +
      encodeURIComponent(a.items[0].id) +
      "?version=" +
      a.version,
  );
  const detail = await r.json();
  assert.equal(detail.poem.title, "前赤壁賦");
  assert(detail.poem.text.includes("壬戌之秋"));
});
