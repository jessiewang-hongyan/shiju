import { validateDocument, newIdentity, originKey } from "./document-model.js";
// Immutable command results share source snapshots and untouched arrays with history.
export function applyCommand(doc, command) {
  let next = { ...doc, revision: doc.revision + 1 };
  const source = (id) => {
    const s = doc.sources.find((s) => s.instanceId === id);
    if (!s) throw Error("原文不存在");
    return s;
  };
  switch (command.type) {
    case "add":
      if (doc.sources.some((s) => s.workKey === command.source.workKey))
        return doc;
      next.sources = [...doc.sources, command.source];
      break;
    case "remove":
      source(command.id);
      next.sources = doc.sources.filter((s) => s.instanceId !== command.id);
      next.tokens = doc.tokens.filter((t) => t.origin?.sourceId !== command.id);
      next.imageSettings = { ...doc.imageSettings };
      for (const key of ["sourceOrder", "sourceSelection"])
        next.imageSettings[key] = {
          ...doc.imageSettings[key],
          ids: doc.imageSettings[key].ids.filter((id) => id !== command.id),
        };
      break;
    case "reorder": {
      const i = doc.sources.findIndex((s) => s.instanceId === command.id),
        j = i + command.delta;
      if (i < 0 || j < 0 || j >= doc.sources.length) return doc;
      next.sources = [...doc.sources];
      [next.sources[i], next.sources[j]] = [next.sources[j], next.sources[i]];
      break;
    }
    case "export-settings":
      next.imageSettings = { ...doc.imageSettings, ...command.value };
      break;
    case "paper": {
      const old = source(command.id);
      if (JSON.stringify(old.paperOverride) === JSON.stringify(command.value))
        return doc;
      next.sources = doc.sources.map((s) =>
        s.instanceId === command.id
          ? { ...s, paperOverride: command.value ? { ...command.value } : null }
          : s,
      );
      break;
    }
    case "excerpt": {
      source(command.id);
      if (doc.tokens.some((t) => t.origin?.sourceId === command.id))
        throw Error("请先归还这篇原文已摘取的字");
      next.sources = doc.sources.map((s) =>
        s.instanceId === command.id
          ? {
              ...s,
              snapshot: command.snapshot,
              selection: command.selection,
              originalSnapshot:
                command.originalSnapshot ?? s.originalSnapshot ?? null,
            }
          : s,
      );
      break;
    }
    case "cut": {
      const s = source(command.origin.sourceId);
      if (
        doc.tokens.some(
          (t) => t.origin && originKey(t.origin) === originKey(command.origin),
        )
      )
        return doc;
      const raw = Array.from(s.snapshot[command.origin.part] || "")[
        command.origin.offset
      ];
      next.tokens = [
        ...doc.tokens,
        {
          tokenId: newIdentity(),
          kind: "cut",
          raw,
          origin: { ...command.origin },
        },
      ];
      break;
    }
    case "return":
      next.tokens = doc.tokens.filter((t) => t.tokenId !== command.id);
      if (next.tokens.length === doc.tokens.length) return doc;
      break;
    case "insert":
      next.tokens = [
        ...doc.tokens,
        {
          tokenId: newIdentity(),
          kind: "insert",
          raw: command.text,
          origin: null,
        },
      ];
      break;
    case "move": {
      const from = doc.tokens.findIndex((t) => t.tokenId === command.id),
        to = command.to;
      if (from < 0 || to < 0 || to >= doc.tokens.length || to === from)
        return doc;
      next.tokens = [...doc.tokens];
      next.tokens.splice(to, 0, next.tokens.splice(from, 1)[0]);
      break;
    }
    case "clear":
      if (!doc.tokens.length) return doc;
      next.tokens = [];
      break;
    case "field":
      if (!["title", "signature"].includes(command.field))
        throw Error("Invalid field");
      if (doc[command.field] === command.value) return doc;
      next[command.field] = command.value;
      break;
    case "restore":
      next = {
        ...command.document,
        documentId: doc.documentId,
        revision: doc.revision + 1,
      };
      break;
    default:
      throw Error("Unknown command");
  }
  if (next.imageSettings.sourceOrder.mode === "manual") {
    validateDocument(next);
    const selected = next.imageSettings.sourceSelection;
    const used = new Set(next.tokens.map((t) => t.origin?.sourceId));
    const eligible = next.sources
      .filter((s) =>
        selected.mode === "used"
          ? used.has(s.instanceId)
          : selected.ids.includes(s.instanceId),
      )
      .map((s) => s.instanceId);
    const order = next.imageSettings.sourceOrder.ids.filter((id) =>
      eligible.includes(id),
    );
    const added = eligible.filter((id) => !order.includes(id));
    if (
      added.length ||
      order.length !== next.imageSettings.sourceOrder.ids.length
    )
      next.imageSettings = {
        ...next.imageSettings,
        sourceOrder: {
          ...next.imageSettings.sourceOrder,
          ids: [...order, ...added],
        },
      };
  }
  return validateDocument(next);
}
export function createHistory(initial, { limit = 100 } = {}) {
  let current = validateDocument(initial),
    past = [];
  return {
    get document() {
      return current;
    },
    get length() {
      return past.length;
    },
    execute(command, view = {}) {
      const next = applyCommand(current, command);
      if (next === current) return false;
      past.push({ document: current, view: { ...view }, type: command.type });
      if (past.length > limit) past.shift();
      current = next;
      return true;
    },
    undo() {
      const old = past.pop();
      if (!old) return null;
      const preferences = current.imageSettings.preferences;
      current = { ...old.document, revision: current.revision + 1 };
      if (old.type !== "restore" && preferences)
        current = {
          ...current,
          imageSettings: { ...current.imageSettings, preferences },
        };
      return old.view;
    },
    setPreferences(preferences) {
      current = {
        ...current,
        revision: current.revision + 1,
        imageSettings: {
          ...current.imageSettings,
          preferences: { ...preferences },
        },
      };
    },
    reset(document) {
      current = validateDocument(document);
      past = [];
    },
  };
}
