import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolveAsset } from "./server.mjs";
import { createStaticSearch } from "./engine.mjs";
import { normalize } from "../search/normalize.mjs";
const logs = [];
const engine = createStaticSearch({
  normalize,
  fetchJSON: async (u) => {
    logs.push(u);
    return JSON.parse(readFileSync(resolveAsset("/" + u)));
  },
});
let assertions = 0;
for (const [q, scope, field] of [
  ["赤壁赋", "all", "title-author"],
  ["蘇轼 赤壁赋", "all", "title-author"],
  ["歐陽修", "song-era", "author"],
  ["■", "yuan-era", "full"],
  ["清風", "guwen", "full"],
  ["明月", "song-era", "title"],
]) {
  const before = logs.length;
  const a = await engine.search({ q, scope, field });
  const params = new URLSearchParams({ q, scope, field, limit: "40" });
  const b = await (
    await fetch("http://127.0.0.1:4180/api/search?" + params)
  ).json();
  assert.equal(a.total, b.total);
  assert.deepEqual(a.items, b.items);
  assertions += 2;
  assert.ok(!logs.slice(before).some((u) => u.includes("data/parts/")));
  assertions++;
  if (field !== "full") {
    assert.ok(
      logs
        .slice(before)
        .filter((u) => u.startsWith("data/search/"))
        .every((u) => u.includes("/metadata/")),
    );
    assertions++;
  }
  if (b.nextCursor) {
    const next = await engine.search({ q, scope, field, offset: 40 });
    params.set("cursor", b.nextCursor);
    const expected = await (
      await fetch("http://127.0.0.1:4180/api/search?" + params)
    ).json();
    assert.deepEqual(next.items, expected.items);
    assertions++;
  }
  if (a.items.length) {
    const id = a.items[0].id;
    const p = await engine.poem(id, a.version);
    const expected = await (
      await fetch(
        "http://127.0.0.1:4180/api/poems/" +
          encodeURIComponent(id) +
          "?version=" +
          b.version,
      )
    ).json();
    assert.deepEqual(p, expected.poem);
    assertions++;
  }
}
await assert.rejects(() => engine.poem("guwen:0", "wrong"));
assertions++;
writeFileSync(
  "prototype/static-search/verification.json",
  JSON.stringify(
    {
      date: "2026-10-29",
      assertions,
      pass: true,
      cases: 6,
      checks:
        "first and second pages, counts, source equality, mixed scripts, lacuna, full text, metadata-only index requests, no bodies during search, version mismatch",
    },
    null,
    2,
  ),
);
console.log("PASS", assertions);
