// Dictionaries are local to each shard: decoding never needs another request.
export function dictionaryPosting(rows, titles = true) {
  const authors = [], authorIds = new Map(), names = [], titleIds = new Map(), groups = [];
  const intern = (value, map, list) => {
    if (!map.has(value)) { map.set(value, list.length); list.push(value); }
    return map.get(value);
  };
  let group, previous = 0;
  for (const [collection, row, title, author] of rows) {
    if (!group || group[0] !== collection) { group = [collection, []]; groups.push(group); previous = 0; }
    group[1].push([row - previous, titles ? intern(title, titleIds, names) : title, intern(author, authorIds, authors)]);
    previous = row;
  }
  return { posting: titles ? 'dictionary-v1' : 'authors-v1', authors, ...(titles ? { titles: names } : {}), groups };
}
export function* postingRows(value) {
  if (Array.isArray(value)) { yield* value; return; }
  if (!['dictionary-v1', 'authors-v1'].includes(value?.posting)) throw Error('Invalid posting format');
  for (const [collection, rows] of value.groups) {
    let row = 0;
    for (const [delta, title, author] of rows) {
      row += delta;
      yield [collection, row, value.posting === 'dictionary-v1' ? value.titles[title] : title, value.authors[author]];
    }
  }
}
