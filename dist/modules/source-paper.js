import { paperKeys } from "./paper-materials.js?v=20261028paperstrength2";

export function validPaperOverride(value) {
  return (
    value === null ||
    (!!value &&
      paperKeys.includes(value.key) &&
      /^#[0-9a-f]{6}$/i.test(value.background) &&
      Number.isInteger(value.strength) &&
      value.strength >= 0 &&
      value.strength <= 200)
  );
}
export function resolveSourcePaper(source, appearance) {
  const colors = appearance.getExportColors();
  return (
    source.paperOverride || {
      key: appearance.sourcePaper,
      background: colors["#f7f5ef"],
      strength: appearance.sourcePaperStrength,
    }
  );
}
export function pieceSeed(source, origin) {
  let value = 2166136261;
  for (const c of `${source.paperSeed}:${origin.part}:${origin.offset}`)
    value = Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0;
  return value;
}
export function canJoinOrigins(a, b, layouts) {
  if (
    !a ||
    !b ||
    a.sourceId !== b.sourceId ||
    a.part !== b.part ||
    b.offset !== a.offset + 1
  )
    return false;
  const layout = layouts.get(a.sourceId);
  const x = layout?.cells.get(JSON.stringify([a.sourceId, a.part, a.offset]));
  const y = layout?.cells.get(JSON.stringify([b.sourceId, b.part, b.offset]));
  return (
    !!x && !!y && Math.abs(x.y - y.y) < 1 && Math.abs(x.x + x.width - y.x) < 2
  );
}
// Include inserted tokens as barriers, and require target visual-row adjacency.
export function groupSourcePieces(items, layouts) {
  const runs = [];
  let previous = null;
  for (const item of items) {
    const last = runs.at(-1);
    if (
      item.origin &&
      previous?.origin &&
      last &&
      canJoinOrigins(previous.origin, item.origin, layouts) &&
      Math.abs(item.top - previous.top) < 1 &&
      Math.abs(item.left - (previous.left + previous.width)) < 2
    ) {
      last.items.push(item);
      last.width = item.left + item.width - last.left;
    } else if (item.origin) runs.push({ ...item, items: [item] });
    previous = item;
  }
  return runs;
}
