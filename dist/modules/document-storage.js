import {
  cloneDocument,
  validateWorkspace,
  assertJSON,
  digest,
  validateDocument,
  newIdentity,
} from "./document-model.js";
import {
  captureLegacy,
  prepareLegacyMigration,
} from "./document-migrations.js";
export class ConflictError extends Error {
  constructor() {
    super("Workspace changed; reload or save a separate copy");
    this.name = "ConflictError";
  }
}
function validateRecord(record) {
  if (
    !record ||
    record.formatVersion !== 2 ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    typeof record.writerId !== "string" ||
    !Array.isArray(record.imports) ||
    !record.imports.every((v) => typeof v === "string") ||
    typeof record.legacyFingerprint !== "string"
  )
    throw Error("Unsupported or corrupt V2 workspace");
  assertJSON(record);
  validateWorkspace(record.workspace);
  return record;
}
function pack(record) {
  return {
    ...record,
    storageVersion: 2,
    workspace: {
      ...record.workspace,
      draft: record.workspace.draft?.documentId ?? null,
      saved: record.workspace.saved.map((d) => d.documentId),
    },
  };
}
function validateMeta(meta) {
  if (
    !meta ||
    meta.storageVersion !== 2 ||
    meta.formatVersion !== 2 ||
    !Number.isSafeInteger(meta.revision) ||
    meta.revision < 1 ||
    !meta.workspace ||
    !Array.isArray(meta.workspace.saved) ||
    !Array.isArray(meta.imports) ||
    typeof meta.legacyFingerprint !== "string"
  )
    throw Error("Unsupported or corrupt V2 workspace");
  const ids = [meta.workspace.draft, ...meta.workspace.saved].filter(
    (x) => x !== null,
  );
  if (
    ids.some((x) => typeof x !== "string" || !x) ||
    new Set(ids).size !== ids.length
  )
    throw Error("Corrupt document references");
  assertJSON(meta);
  return meta;
}
export async function openDocumentRepository({
  indexedDB = globalThis.indexedDB,
  name = "shiju-v2",
  writerId = globalThis.crypto.randomUUID(),
  onVersionChange = () => {},
} = {}) {
  if (!indexedDB) throw Error("IndexedDB unavailable");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result,
        tx = request.transaction;
      if (!db.objectStoreNames.contains("workspace"))
        db.createObjectStore("workspace");
      if (!db.objectStoreNames.contains("backups"))
        db.createObjectStore("backups");
      db.createObjectStore("documents");
      db.createObjectStore("views");
      const old = tx.objectStore("workspace").get("current");
      old.onsuccess = () => {
        if (!old.result) return;
        try {
          const record = validateRecord(old.result);
          tx.objectStore("backups").put(
            { previousV2: record },
            "before-storage-v2",
          );
          for (const doc of [
            record.workspace.draft,
            ...record.workspace.saved,
          ].filter(Boolean))
            tx.objectStore("documents").put(doc, doc.documentId);
          tx.objectStore("workspace").put(pack(record), "current");
        } catch {
          tx.abort();
        }
      };
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(Error("Database upgrade blocked; close older tabs"));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
  db.onversionchange = () => {
    db.close();
    onVersionChange();
  };
  function transact(stores, mode, work) {
    return new Promise((resolve, reject) => {
      let result, failure;
      const tx = db.transaction(stores, mode);
      const fail = (e) => {
        failure = e;
        tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure || tx.error || Error("Storage transaction aborted"));
      tx.onerror = () => {};
      try {
        work(
          tx,
          (v) => {
            result = v;
          },
          fail,
        );
      } catch (e) {
        fail(e);
      }
    });
  }
  async function read() {
    return transact(
      ["workspace", "documents"],
      "readonly",
      (tx, done, fail) => {
        const req = tx.objectStore("workspace").get("current");
        req.onsuccess = () => {
          if (!req.result) return done(null);
          try {
            const meta = validateMeta(req.result),
              ids = [meta.workspace.draft, ...meta.workspace.saved].filter(
                Boolean,
              ),
              docs = new Map();
            const finish = () => {
              try {
                done(
                  validateRecord({
                    ...meta,
                    workspace: {
                      ...meta.workspace,
                      draft: meta.workspace.draft
                        ? docs.get(meta.workspace.draft)
                        : null,
                      saved: meta.workspace.saved.map((id) => docs.get(id)),
                    },
                  }),
                );
              } catch (e) {
                fail(e);
              }
            };
            if (!ids.length) return finish();
            for (const id of ids) {
              const q = tx.objectStore("documents").get(id);
              q.onsuccess = () => {
                docs.set(id, q.result);
                if (docs.size === ids.length) finish();
              };
            }
          } catch (e) {
            fail(e);
          }
        };
      },
    );
  }
  async function readDraft() {
    return transact(
      ["workspace", "documents"],
      "readonly",
      (tx, done, fail) => {
        const q = tx.objectStore("workspace").get("current");
        q.onsuccess = () => {
          try {
            const meta = validateMeta(q.result);
            if (!meta.workspace.draft)
              return done({ revision: meta.revision, document: null });
            const d = tx.objectStore("documents").get(meta.workspace.draft);
            d.onsuccess = () => {
              try {
                done({
                  revision: meta.revision,
                  document: cloneDocument(validateDocument(d.result)),
                });
              } catch (e) {
                fail(e);
              }
            };
          } catch (e) {
            fail(e);
          }
        };
      },
    );
  }
  function verifiedPut(store, value, key, done, fail) {
    const expected = JSON.stringify(value);
    store.put(value, key);
    const verify = store.get(key);
    verify.onsuccess = () =>
      JSON.stringify(verify.result) === expected
        ? done()
        : fail(Error("Save verification failed"));
  }
  async function editRecord(expectedRevision, transform) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw Error("Expected revision required");
    return transact(
      ["workspace", "documents"],
      "readwrite",
      (tx, done, fail) => {
        const store = tx.objectStore("workspace"),
          req = store.get("current");
        req.onsuccess = () => {
          try {
            const old = req.result ? validateMeta(req.result) : null;
            if ((old?.revision ?? 0) !== expectedRevision)
              throw new ConflictError();
            const next = transform(
              cloneDocument(old),
              tx.objectStore("documents"),
              fail,
            );
            next.revision = expectedRevision + 1;
            next.writerId = writerId;
            validateMeta(next);
            verifiedPut(
              store,
              next,
              "current",
              () => done(cloneDocument(next)),
              fail,
            );
          } catch (e) {
            fail(e);
          }
        };
      },
    );
  }
  async function saveDraft(document, expectedRevision) {
    validateDocument(document);
    const copy = cloneDocument(document);
    const meta = await editRecord(expectedRevision, (old, docs, fail) => {
      if (!old) throw Error("Workspace not initialized");
      if (old.workspace.saved.includes(copy.documentId))
        throw Error("Draft must not overwrite a saved work");
      if (old.workspace.draft && old.workspace.draft !== copy.documentId)
        docs.delete(old.workspace.draft);
      verifiedPut(docs, copy, copy.documentId, () => {}, fail);
      old.workspace.draft = copy.documentId;
      return old;
    });
    return { revision: meta.revision, document: copy };
  }
  async function addSaved(document, expectedRevision) {
    validateDocument(document);
    const copy = {
      ...cloneDocument(document),
      documentId: newIdentity(),
      revision: 0,
      savedAt: Date.now(),
    };
    const meta = await editRecord(expectedRevision, (old, docs, fail) => {
      if (!old) throw Error("Workspace not initialized");
      verifiedPut(docs, copy, copy.documentId, () => {}, fail);
      old.workspace.saved.push(copy.documentId);
      return old;
    });
    return { revision: meta.revision, document: copy };
  }
  async function removeSaved(id, expectedRevision) {
    const meta = await editRecord(expectedRevision, (old, docs) => {
      if (!old?.workspace.saved.includes(id)) throw Error("Saved work missing");
      old.workspace.saved = old.workspace.saved.filter((x) => x !== id);
      docs.delete(id);
      return old;
    });
    return meta.revision;
  }
  async function saveView(key, value) {
    assertJSON(value);
    return transact(["views"], "readwrite", (tx, done, fail) =>
      verifiedPut(tx.objectStore("views"), value, key, done, fail),
    );
  }
  async function readView(key) {
    return transact(["views"], "readonly", (tx, done) => {
      const q = tx.objectStore("views").get(key);
      q.onsuccess = () => done(q.result ?? {});
    });
  }
  async function backup(raw) {
    assertJSON(raw);
    const fingerprint = await digest(raw),
      expected = JSON.stringify(raw);
    await transact(["backups"], "readwrite", (tx, done, fail) => {
      const store = tx.objectStore("backups"),
        req = store.get(fingerprint);
      req.onsuccess = () => {
        try {
          if (
            req.result !== undefined &&
            JSON.stringify(req.result) !== expected
          )
            return fail(Error("Backup fingerprint collision"));
          if (req.result === undefined)
            store.put(cloneDocument(raw), fingerprint);
          const verify = store.get(fingerprint);
          verify.onsuccess = () =>
            JSON.stringify(verify.result) === expected
              ? done(fingerprint)
              : fail(Error("Backup verification failed"));
        } catch (e) {
          fail(e);
        }
      };
    });
    return fingerprint;
  }
  async function commit(next, expectedRevision) {
    assertJSON(next);
    validateWorkspace(next.workspace);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw Error("Expected revision required");
    const record = validateRecord({
      ...cloneDocument(next),
      formatVersion: 2,
      storageVersion: 2,
      revision: expectedRevision + 1,
      writerId,
    });
    await editRecord(expectedRevision, (_old, docs, fail) => {
      docs.clear();
      for (const doc of [
        record.workspace.draft,
        ...record.workspace.saved,
      ].filter(Boolean))
        verifiedPut(docs, doc, doc.documentId, () => {}, fail);
      return pack(record);
    });
    return record;
  }
  async function initialize(storage) {
    const existing = await read();
    if (existing) return existing;
    const raw = captureLegacy(storage);
    await backup(raw);
    const prepared = await prepareLegacyMigration(raw);
    if ((await digest(captureLegacy(storage))) !== prepared.fingerprint)
      throw new ConflictError();
    try {
      return await commit(
        { ...prepared, legacyFingerprint: prepared.fingerprint },
        0,
      );
    } catch (e) {
      if (e instanceof ConflictError) return read();
      throw e;
    }
  }
  async function legacyChanged(storage) {
    const record = await read();
    return (
      !!record &&
      record.legacyFingerprint !== (await digest(captureLegacy(storage)))
    );
  }
  async function importLegacyChanges(storage, expectedRevision) {
    const record = await read();
    if (!record || record.revision !== expectedRevision)
      throw new ConflictError();
    const raw = captureLegacy(storage);
    await backup(raw);
    const prepared = await prepareLegacyMigration(raw);
    const known = new Set(record.imports),
      copies = [];
    for (const doc of [
      prepared.workspace.draft,
      ...prepared.workspace.saved,
    ].filter(Boolean)) {
      const fingerprint = await digest(doc.migration.legacyDocument);
      if (!known.has(fingerprint)) {
        known.add(fingerprint);
        copies.push(doc);
      }
    }
    if ((await digest(captureLegacy(storage))) !== prepared.fingerprint)
      throw new ConflictError();
    return commit(
      {
        ...record,
        workspace: {
          ...record.workspace,
          saved: [...record.workspace.saved, ...copies],
        },
        imports: [...known],
        legacyFingerprint: prepared.fingerprint,
      },
      expectedRevision,
    );
  }
  // Conflict recovery is explicit: retain the winning draft and save local work separately.
  async function saveConflictCopy(document, expectedRevision) {
    validateDocument(document);
    const record = await read();
    if (!record || record.revision !== expectedRevision)
      throw new ConflictError();
    await addSaved(document, expectedRevision);
    return read();
  }
  async function exportBackup() {
    const record = await read();
    if (!record) throw Error("No workspace");
    return JSON.stringify(
      { backupFormat: "shiju-v2", version: 1, record },
      null,
      2,
    );
  }
  async function restoreBackup(text, expectedRevision) {
    const data = JSON.parse(text);
    if (data.backupFormat !== "shiju-v2" || data.version !== 1)
      throw Error("Unsupported backup format");
    validateRecord(data.record);
    const prior = await read();
    if ((prior?.revision ?? 0) !== expectedRevision) throw new ConflictError();
    if (prior) await backup({ previousV2: prior });
    return commit(data.record, expectedRevision);
  }
  async function readBackup(fingerprint) {
    return transact(["backups"], "readonly", (tx, done) => {
      const req = tx.objectStore("backups").get(fingerprint);
      req.onsuccess = () => done(req.result ?? null);
    });
  }
  return {
    read,
    readDraft,
    saveDraft,
    addSaved,
    removeSaved,
    saveView,
    readView,
    commit,
    initialize,
    backup,
    saveConflictCopy,
    readBackup,
    legacyChanged,
    importLegacyChanges,
    exportBackup,
    restoreBackup,
    close: () => db.close(),
  };
}
