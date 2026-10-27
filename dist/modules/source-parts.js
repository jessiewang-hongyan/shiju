// Body IDs stay unchanged so existing drafts and saved poems remain compatible.
// A separator ID keeps different source sections from joining into one paper strip.
export function sourceParts(source) {
  const text = source.text || "",
    title = source.title || "",
    author = source.author || "";
  return [
    { key: "title", text: title, start: Array.from(text).length + 1 },
    {
      key: "author",
      text: author,
      start: Array.from(text).length + Array.from(title).length + 2,
    },
    { key: "text", text, start: 0 },
  ];
}
export function partCells(part, displayText, used = new Set()) {
  return Array.from(displayText(part.text)).map((c, index) => ({
    c,
    id: part.start + index,
    hole: used.has(part.start + index),
  }));
}
