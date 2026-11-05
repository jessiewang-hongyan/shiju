import { validPaperOverride } from "./source-paper.js";
// V2 documents are isolated from V1 localStorage and consumed by the local phase-two editor.
export const cloneDocument = (value) => JSON.parse(JSON.stringify(value));
export function assertJSON(value, path = "$", parents = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (
    typeof value !== "object" ||
    parents.has(value) ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  )
    throw Error(`Invalid JSON at ${path}`);
  if (Array.isArray(value) && Object.keys(value).length !== value.length)
    throw Error(`Sparse or decorated array at ${path}`);
  parents.add(value);
  for (const [key, item] of Object.entries(value))
    assertJSON(item, `${path}.${key}`, parents);
  parents.delete(value);
}
const requireValue = (ok, message) => {
  if (!ok) throw Error(message);
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const id = (x) => typeof x === "string" && x.length > 0;
export const originKey = ({ sourceId, part, offset }) =>
  JSON.stringify([sourceId, part, offset]);
export async function digest(value) {
  const bytes = new globalThis.TextEncoder().encode(JSON.stringify(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export const newIdentity = () => globalThis.crypto.randomUUID();
export function defaultImageSettings() {
  return {
    sourceDefaults: {},
    poemPaper: {},
    sourceSelection: { mode: "used", ids: [] },
    sourceOrder: { mode: "tabs", ids: [] },
    collageSeed: newIdentity(),
  };
}
export async function createSource(
  snapshot,
  { catalog = null, selection = null } = {},
) {
  assertJSON(snapshot);
  requireValue(typeof snapshot.text === "string", "Source text required");
  const workKey = catalog
    ? JSON.stringify([
        "catalog",
        catalog.provider,
        catalog.collection,
        catalog.recordId,
      ])
    : "custom:" +
      (await digest(
        ["title", "author", "text"].map((k) =>
          (snapshot[k] || "").replace(/\r\n?/g, "\n"),
        ),
      ));
  if (catalog)
    requireValue(
      ["provider", "collection", "recordId"].every((k) => id(catalog[k])),
      "Complete catalog identity required",
    );
  return {
    instanceId: newIdentity(),
    workKey,
    snapshot: cloneDocument({ title: "", author: "", ...snapshot }),
    provenance: catalog ? cloneDocument(catalog) : { kind: "custom" },
    selection: cloneDocument(selection),
    paperOverride: null,
    paperSeed: newIdentity(),
  };
}
export function createDocument(sources = []) {
  const doc = {
    schemaVersion: 2,
    documentId: newIdentity(),
    revision: 0,
    title: "",
    signature: "",
    sources: cloneDocument(sources),
    tokens: [],
    imageSettings: defaultImageSettings(),
  };
  validateDocument(doc);
  return doc;
}
export function validateDocument(doc) {
  assertJSON(doc);
  requireValue(
    object(doc) && doc.schemaVersion === 2,
    "Unsupported document version",
  );
  requireValue(
    id(doc.documentId) &&
      Number.isSafeInteger(doc.revision) &&
      doc.revision >= 0,
    "Invalid document identity/revision",
  );
  requireValue(
    typeof doc.title === "string" && typeof doc.signature === "string",
    "Invalid title/signature",
  );
  requireValue(
    Array.isArray(doc.sources) && Array.isArray(doc.tokens),
    "Invalid document lists",
  );
  const sources = new Map(),
    works = new Set();
  for (const s of doc.sources) {
    requireValue(
      object(s) && id(s.instanceId) && !sources.has(s.instanceId),
      "Duplicate/invalid source identity",
    );
    requireValue(
      id(s.workKey) && !works.has(s.workKey),
      "Duplicate/invalid source work",
    );
    requireValue(
      object(s.snapshot) &&
        ["title", "author", "text"].every(
          (k) => typeof s.snapshot[k] === "string",
        ),
      "Invalid source snapshot",
    );
    requireValue(
      id(s.paperSeed) &&
        object(s.provenance) &&
        validPaperOverride(s.paperOverride),
      "Invalid source settings",
    );
    if (s.selection !== null) {
      const r = s.selection;
      requireValue(
        object(r) &&
          Number.isSafeInteger(r.startParagraph) &&
          r.startParagraph >= 1 &&
          Number.isSafeInteger(r.endParagraph) &&
          r.endParagraph >= r.startParagraph &&
          (r.bodyStartCodePoint === null ||
            (Number.isSafeInteger(r.bodyStartCodePoint) &&
              r.bodyStartCodePoint >= 0)),
        "Invalid source selection",
      );
    }
    sources.set(
      s.instanceId,
      Object.fromEntries(
        ["title", "author", "text"].map((k) => [k, Array.from(s.snapshot[k])]),
      ),
    );
    works.add(s.workKey);
  }
  const tokens = new Set(),
    used = new Set();
  for (const t of doc.tokens) {
    requireValue(
      object(t) &&
        id(t.tokenId) &&
        !tokens.has(t.tokenId) &&
        typeof t.raw === "string" &&
        t.raw.length > 0,
      "Invalid/duplicate token",
    );
    tokens.add(t.tokenId);
    if (t.kind === "insert") {
      requireValue(t.origin === null, "Inserted token has origin");
      continue;
    }
    requireValue(
      t.kind === "cut" && object(t.origin),
      "Invalid token kind/origin",
    );
    const o = t.origin,
      source = sources.get(o.sourceId);
    requireValue(
      source &&
        ["title", "author", "text"].includes(o.part) &&
        Number.isSafeInteger(o.offset) &&
        o.offset >= 0 &&
        source[o.part][o.offset] === t.raw,
      "Source position/text mismatch",
    );
    const key = originKey(o);
    requireValue(!used.has(key), "Source position used twice");
    used.add(key);
  }
  const settings = doc.imageSettings;
  requireValue(
    object(settings) &&
      object(settings.sourceDefaults) &&
      object(settings.poemPaper) &&
      id(settings.collageSeed),
    "Invalid image settings",
  );
  requireValue(
    settings.sourceGap === undefined ||
      (Number.isInteger(settings.sourceGap) &&
        settings.sourceGap >= 0 &&
        settings.sourceGap <= 160),
    "Invalid source gap",
  );
  for (const [key, modes] of [
    ["sourceSelection", ["used", "manual"]],
    ["sourceOrder", ["tabs", "manual"]],
  ]) {
    const v = settings[key];
    requireValue(
      object(v) &&
        modes.includes(v.mode) &&
        Array.isArray(v.ids) &&
        new Set(v.ids).size === v.ids.length &&
        v.ids.every((x) => sources.has(x)),
      "Invalid export source references",
    );
  }
  return doc;
}
export function usedPositions(doc) {
  validateDocument(doc);
  return new Set(
    doc.tokens.filter((t) => t.kind === "cut").map((t) => originKey(t.origin)),
  );
}
export function validateWorkspace(workspace) {
  requireValue(
    object(workspace) &&
      Array.isArray(workspace.saved) &&
      object(workspace.view),
    "Invalid workspace",
  );
  const ids = new Set();
  for (const doc of [workspace.draft, ...workspace.saved].filter(
    (d) => d !== null,
  )) {
    validateDocument(doc);
    requireValue(!ids.has(doc.documentId), "Duplicate document identity");
    ids.add(doc.documentId);
  }
  requireValue(workspace.draft !== undefined, "Missing draft");
  assertJSON(workspace);
  return workspace;
}
