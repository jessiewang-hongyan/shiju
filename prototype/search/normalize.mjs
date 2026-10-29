import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const context = {};
runInNewContext(
  readFileSync(
    new URL("../../dist/vendor/opencc/opencc.js", import.meta.url),
    "utf8",
  ),
  context,
);
const convert = context.OpenCC.Converter({ from: "t", to: "cn" });
export const normalize = (text) =>
  convert(String(text || ""))
    .normalize("NFC")
    .toLocaleLowerCase();
export function relevance(title, author, query) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [0, 0, 0];
  const hits = words.filter((w) => title.includes(w));
  if (title === query.trim()) return [0, 0, 0];
  if (hits.length === words.length) return [1, Array.from(title).length, 0];
  if (hits.length) return [2, -hits.length, Array.from(title).length];
  if (words.every((w) => author.includes(w))) return [3, 0, 0];
  return [4, 0, 0];
}
export const compareScore = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
