// Cache normalized fields once per record, and reuse results for pagination.
// Source objects remain untouched: title, gaps and provenance stay exact.
export function createLibrarySearch() {
  const texts = new WeakMap();
  const scopes = new Map();
  function searchable(poem, field) {
    if (field !== "full") {
      const title = poem.title || poem.label || "";
      return (
        field === "title"
          ? title
          : field === "author"
            ? poem.author || ""
            : title + " " + (poem.author || "")
      ).toLocaleLowerCase();
    }
    if (!texts.has(poem))
      texts.set(
        poem,
        [
          poem.title,
          poem.label,
          poem.collection,
          poem.sourceWork,
          poem.author,
          poem.text,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase(),
      );
    return texts.get(poem);
  }
  return function search(key, items, query, field = "full") {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const signature = JSON.stringify(words);
    key += ":" + field;
    const previous = scopes.get(key);
    if (previous?.items === items && previous.signature === signature)
      return previous.matches;
    // Longer queries can only narrow earlier results. Deleting/changing words
    // must search the full scope again.
    const candidates =
      previous?.items === items &&
      previous.words.every((old) => words.some((word) => word.includes(old)))
        ? previous.matches
        : items;
    const matches = words.length
      ? candidates.filter((poem) =>
          words.every((word) => searchable(poem, field).includes(word)),
        )
      : items;
    scopes.set(key, { items, words, signature, matches });
    return matches;
  };
}
