import { sourceParts } from "./source-parts.js";
import {
  assertJSON,
  cloneDocument,
  digest,
  validateDocument,
  validateWorkspace,
} from "./document-model.js";
export class MigrationError extends Error {
  constructor(issues) {
    super("Legacy migration requires recovery");
    this.name = "MigrationError";
    this.issues = issues;
  }
}
export function captureLegacy(storage) {
  const preferences = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (
      /^shiju-(source-size$|image-|export-|paper-|collage-|rough-|handmade|font|script)/.test(
        key,
      )
    )
      preferences[key] = storage.getItem(key);
  }
  return {
    draft: storage.getItem("shiju-draft"),
    collection: storage.getItem("shiju-collection"),
    preferences: Object.fromEntries(
      Object.entries(preferences).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
export async function migrateLegacyDocument(legacy, key, preferences = {}) {
  assertJSON(legacy);
  if (
    !legacy ||
    typeof legacy.source?.text !== "string" ||
    !Array.isArray(legacy.tokens)
  )
    throw Error("Invalid legacy document");
  const snapshot = cloneDocument({ title: "", author: "", ...legacy.source });
  if (
    typeof snapshot.title !== "string" ||
    typeof snapshot.author !== "string" ||
    (legacy.title !== undefined && typeof legacy.title !== "string") ||
    (legacy.signature !== undefined && typeof legacy.signature !== "string")
  )
    throw Error("Invalid legacy text fields");
  const hash = await digest([key, legacy]),
    sourceId = "source-" + hash;
  const parts = sourceParts(snapshot);
  const tokens = legacy.tokens.map((token, index) => {
    if (!token || typeof token.c !== "string" || !token.c)
      throw Error(`Invalid token ${index}`);
    const result = { tokenId: `token-${hash}-${index}`, raw: token.c };
    if (token.id === null) return { ...result, kind: "insert", origin: null };
    const part = parts.find(
      (p) =>
        Number.isSafeInteger(token.id) &&
        token.id >= p.start &&
        token.id < p.start + Array.from(p.text).length,
    );
    if (!part) throw Error(`Invalid legacy position ${index}`);
    return {
      ...result,
      kind: "cut",
      origin: { sourceId, part: part.key, offset: token.id - part.start },
    };
  });
  const excerpt = snapshot.excerpt;
  const doc = {
    schemaVersion: 2,
    documentId: "legacy-" + hash,
    revision: 0,
    title: legacy.title ?? "",
    signature: legacy.signature ?? "",
    sources: [
      {
        instanceId: sourceId,
        workKey: "legacy-snapshot:" + (await digest(snapshot)),
        snapshot,
        provenance: { kind: "legacy", identityConfidence: "snapshot-only" },
        selection: excerpt
          ? {
              startParagraph: excerpt.start,
              endParagraph: excerpt.end,
              bodyStartCodePoint: null,
            }
          : null,
        paperOverride: null,
        paperSeed: "paper-" + hash,
      },
    ],
    tokens,
    imageSettings: {
      sourceDefaults: {},
      poemPaper: {},
      sourceSelection: { mode: "used", ids: [] },
      sourceOrder: { mode: "tabs", ids: [] },
      collageSeed: "collage-" + hash,
      legacyPreferences: cloneDocument(preferences),
    },
    migration: {
      legacyKey: key,
      legacyDocument: cloneDocument(legacy),
      settingsOrigin: "current-browser-preferences-not-historical",
    },
  };
  return validateDocument(doc);
}
export async function prepareLegacyMigration(raw) {
  assertJSON(raw);
  const workspace = { draft: null, saved: [], view: {} },
    issues = [],
    imports = [];
  async function convert(item, key) {
    try {
      const doc = await migrateLegacyDocument(item, key, raw.preferences);
      imports.push(await digest(item));
      return doc;
    } catch (e) {
      issues.push({ key, message: e.message });
      return null;
    }
  }
  if (raw.draft !== null) {
    try {
      workspace.draft = await convert(JSON.parse(raw.draft), "shiju-draft");
    } catch (e) {
      issues.push({ key: "shiju-draft", message: e.message });
    }
  }
  if (raw.collection !== null) {
    try {
      const items = JSON.parse(raw.collection);
      if (!Array.isArray(items))
        throw Error("Legacy collection is not an array");
      for (let i = 0; i < items.length; i++) {
        const doc = await convert(items[i], `shiju-collection:${i}`);
        if (doc) workspace.saved.push(doc);
      }
    } catch (e) {
      issues.push({ key: "shiju-collection", message: e.message });
    }
  }
  if (issues.length) throw new MigrationError(issues);
  validateWorkspace(workspace);
  return {
    workspace,
    imports: [...new Set(imports)],
    fingerprint: await digest(raw),
  };
}
// Preserve the original legacy payload, including saved-item IDs and unknown fields.
export function legacyBackupOf(doc) {
  validateDocument(doc);
  if (!doc.migration?.legacyDocument)
    throw Error("Not a migrated legacy document");
  return cloneDocument(doc.migration.legacyDocument);
}
