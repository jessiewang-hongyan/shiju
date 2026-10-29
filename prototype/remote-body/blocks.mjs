import { createHash } from "node:crypto";
// Keep a poem intact even when that single poem exceeds the byte budget.
export function splitBodies(poems, target = 32768) {
  const blocks = [];
  let rows = [],
    bytes = 2,
    start = 0;
  function flush() {
    if (!rows.length) return;
    const text = JSON.stringify(rows);
    blocks.push({
      start,
      count: rows.length,
      text,
      hash: createHash("sha256").update(text).digest("hex"),
    });
    start += rows.length;
    rows = [];
    bytes = 2;
  }
  for (const poem of poems) {
    const n = Buffer.byteLength(JSON.stringify(poem));
    if (rows.length && bytes + n + 1 > target) flush();
    bytes += n + (rows.length ? 1 : 0);
    rows.push(poem);
  }
  flush();
  return blocks;
}
