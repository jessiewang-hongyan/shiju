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

// Keep source typography and cell geometry when moving a character into the poem.
export function sourceMetrics(tokens, source, bodySize, bodyStep, factor = 1) {
  const parts = sourceParts(source).map((p) => ({
    ...p,
    end: p.start + Array.from(p.text).length,
  }));
  return tokens.map((t) => {
    const part = parts.find(
      (p) => Number.isInteger(t.id) && t.id >= p.start && t.id < p.end,
    );
    const size =
      part?.key === "title"
        ? 30 * factor
        : part?.key === "author"
          ? 15 * factor
          : bodySize;
    const step =
      part?.key === "title"
        ? 34 * factor
        : part?.key === "author"
          ? 19 * factor
          : bodyStep;
    return {
      ...t,
      fontSize: size,
      cellStep: step,
      units: ((t.c === " " ? 0.5 : Array.from(t.c).length) * step) / bodyStep,
    };
  });
}
