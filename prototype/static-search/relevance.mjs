export function relevance(title, author, query) {
  const words = query.split(/\s+/).filter(Boolean);
  if (!words.length) return [0, 0, 0];
  const hits = words.filter((w) => title.includes(w));
  if (title === query) return [0, 0, 0];
  if (hits.length === words.length) return [1, Array.from(title).length, 0];
  if (hits.length) return [2, -hits.length, Array.from(title).length];
  if (words.every((w) => author.includes(w))) return [3, 0, 0];
  return [4, 0, 0];
}
