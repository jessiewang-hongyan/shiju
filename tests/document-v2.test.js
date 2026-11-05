import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  createSource,
  createDocument,
  validateDocument,
  cloneDocument,
  usedPositions,
  digest,
} from "../dist/modules/document-model.js";
import {
  migrateLegacyDocument,
  legacyBackupOf,
  captureLegacy,
} from "../dist/modules/document-migrations.js";
import {
  openDocumentRepository,
  ConflictError,
} from "../dist/modules/document-storage.js";
const legacy = () => ({
  source: { title: "月题", author: "月人", text: "月𠮷□月\n" },
  tokens: [
    { c: "月", id: 0 },
    { c: "𠮷", id: 1 },
    { c: "□", id: 2 },
    { c: "月", id: 6 },
    { c: "人", id: 10 },
    { c: "——", id: null },
  ],
  title: "",
  signature: "署名",
  id: 123,
});
function memory(data = {}) {
  const m = new Map(Object.entries(data));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i],
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
  };
}
const storage = () =>
  memory({
    "shiju-draft": JSON.stringify(legacy()),
    "shiju-collection": JSON.stringify([legacy()]),
    "shiju-source-size": "15",
    "shiju-theme": "night",
  });
async function repo(options = {}) {
  return openDocumentRepository({
    indexedDB: new IDBFactory(),
    name: "test",
    ...options,
  });
}
test("V2 migration preserves all regions, Unicode, missing marks, old IDs and order", async () => {
  const old = legacy(),
    doc = await migrateLegacyDocument(old, "draft");
  assert.deepEqual(legacyBackupOf(doc), old);
  assert.deepEqual(doc, await migrateLegacyDocument(old, "draft"));
  assert.deepEqual(
    doc.tokens.map((t) => t.origin?.part ?? null),
    ["text", "text", "text", "title", "author", null],
  );
  assert.deepEqual(
    doc.tokens.map((t) => t.origin?.offset ?? null),
    [0, 1, 2, 0, 1, null],
  );
  assert.equal(usedPositions(doc).size, 5);
  assert.equal(doc.title, "");
  assert.equal(doc.signature, "署名");
  const excerpt = legacy();
  excerpt.source.excerpt = { start: 2, end: 3, originalTitle: "全文" };
  assert.equal(
    (await migrateLegacyDocument(excerpt, "e")).sources[0].selection
      .bodyStartCodePoint,
    null,
  );
  const noTitle = legacy();
  noTitle.source = { text: "月" };
  noTitle.tokens = [{ c: "月", id: 0 }];
  assert.equal(
    (await migrateLegacyDocument(noTitle, "no")).sources[0].snapshot.title,
    "",
  );
});
test("V2 identities distinguish catalog records and keep source references stable", async () => {
  const snap = { title: "月", author: "人", text: "月月" };
  const a = await createSource(snap, {
    catalog: {
      provider: "p",
      collection: "c",
      recordId: "1",
      dataCommit: "old",
    },
  });
  const same = await createSource(snap, {
    catalog: {
      provider: "p",
      collection: "c",
      recordId: "1",
      dataCommit: "new",
    },
  });
  const b = await createSource(snap, {
    catalog: { provider: "p", collection: "c", recordId: "2" },
  });
  assert.equal(a.workKey, same.workKey);
  assert.notEqual(a.instanceId, same.instanceId);
  assert.throws(() => createDocument([a, same]));
  const doc = createDocument([a, b]);
  doc.tokens = [a, b].map((s, i) => ({
    tokenId: String(i),
    kind: "cut",
    raw: "月",
    origin: { sourceId: s.instanceId, part: "text", offset: 0 },
  }));
  assert.equal(usedPositions(doc).size, 2);
  doc.sources.reverse();
  validateDocument(doc);
  doc.tokens.push({ ...doc.tokens[0], tokenId: "duplicate" });
  assert.throws(() => validateDocument(doc), /twice/);
  const c = await createSource({ ...snap, text: "月\r\n月" }),
    d = await createSource({ ...snap, text: "月\n月" });
  assert.equal(c.workKey, d.workKey);
});
test("V2 rejects corrupt positions, text mismatch, future schema and stale export IDs", async () => {
  for (const id of [-1, 5, 8, 100, 0.5]) {
    const old = legacy();
    old.tokens = [{ c: "月", id }];
    await assert.rejects(migrateLegacyDocument(old, "bad"));
  }
  const old = legacy();
  old.tokens[0].c = "日";
  await assert.rejects(migrateLegacyDocument(old, "bad"));
  const doc = await migrateLegacyDocument(legacy(), "good");
  doc.schemaVersion = 3;
  assert.throws(() => validateDocument(doc));
  doc.schemaVersion = 2;
  doc.imageSettings.sourceOrder.ids = ["gone"];
  assert.throws(() => validateDocument(doc));
});
test("V2 initialization is isolated, idempotent and keeps an exact raw backup", async () => {
  const r = await repo(),
    s = storage(),
    before = captureLegacy(s),
    record = await r.initialize(s);
  assert.deepEqual(await r.initialize(s), record);
  assert.deepEqual(await r.readBackup(await digest(before)), before);
  assert.deepEqual(captureLegacy(s), before);
  assert.equal(record.workspace.saved.length, 1);
  assert.equal(
    record.workspace.draft.imageSettings.legacyPreferences["shiju-theme"],
    undefined,
  );
  r.close();
});
test("V2 malformed legacy data stops migration after recoverable backup", async () => {
  const r = await repo(),
    s = storage();
  s.setItem("shiju-collection", "[broken");
  const raw = captureLegacy(s);
  await assert.rejects(r.initialize(s), { name: "MigrationError" });
  assert.equal(await r.read(), null);
  assert.deepEqual(await r.readBackup(await digest(raw)), raw);
  s.setItem("shiju-collection", "[]");
  assert.equal((await r.initialize(s)).revision, 1);
  r.close();
});
test("V2 transaction failures and silent dropped writes never report success", async () => {
  const r = await repo(),
    record = await r.initialize(storage()),
    original = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Full", "QuotaExceededError");
    };
    await assert.rejects(r.commit(record, 1), { name: "QuotaExceededError" });
    assert.deepEqual(await r.read(), record);
    await assert.rejects(r.backup({ newBackup: true }), {
      name: "QuotaExceededError",
    });
    IDBObjectStore.prototype.put = function () {
      return this.get("missing");
    };
    await assert.rejects(r.commit(record, 1), /verification/);
    assert.deepEqual(await r.read(), record);
    await assert.rejects(r.backup({ dropped: true }), /verification/);
  } finally {
    IDBObjectStore.prototype.put = original;
    r.close();
  }
  await assert.rejects(repo({ indexedDB: null }), /unavailable/);
});
test("V2 concurrent connections reject stale writers; reload preserves winner", async () => {
  const indexedDB = new IDBFactory(),
    a = await repo({ indexedDB }),
    b = await repo({ indexedDB });
  const first = await a.initialize(storage());
  const x = cloneDocument(first),
    y = cloneDocument(first);
  x.workspace.draft.title = "甲";
  y.workspace.draft.title = "乙";
  const results = await Promise.allSettled([a.commit(x, 1), b.commit(y, 1)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    results.find((r) => r.status === "rejected").reason instanceof
      ConflictError,
  );
  const current = await b.read();
  assert.equal(current.revision, 2);
  assert.equal(current.workspace.draft.title, "甲");
  a.close();
  b.close();
});
test("V2 old-page edits import only explicitly as saved copies and deduplicate", async () => {
  const r = await repo(),
    s = storage(),
    first = await r.initialize(s);
  const old = legacy();
  old.title = "旧页新作";
  s.setItem("shiju-draft", JSON.stringify(old));
  assert.equal(await r.legacyChanged(s), true);
  assert.deepEqual((await r.read()).workspace.draft, first.workspace.draft);
  const imported = await r.importLegacyChanges(s, 1);
  assert.equal(imported.workspace.saved.length, 2);
  assert.equal(imported.workspace.draft.title, "");
  assert.equal(await r.legacyChanged(s), false);
  assert.equal((await r.importLegacyChanges(s, 2)).workspace.saved.length, 2);
  r.close();
});
test("V2 backup restores exact content and preserves the previous record", async () => {
  const r = await repo(),
    first = await r.initialize(storage()),
    backup = await r.exportBackup();
  const changed = cloneDocument(first);
  changed.workspace.draft.title = "新作";
  const second = await r.commit(changed, 1);
  const restored = await r.restoreBackup(backup, 2);
  assert.deepEqual(restored.workspace, first.workspace);
  assert.equal(restored.revision, 3);
  assert.deepEqual(await r.readBackup(await digest({ previousV2: second })), {
    previousV2: second,
  });
  await assert.rejects(r.restoreBackup(backup, 1), ConflictError);
  await assert.rejects(r.restoreBackup('{"version":3}', 3));
  r.close();
});
test("V2 corrupt persisted records never fall back to or overwrite legacy", async () => {
  const indexedDB = new IDBFactory(),
    r = await repo({ indexedDB });
  await r.initialize(storage());
  r.close();
  const db = await new Promise((resolve) => {
    const q = indexedDB.open("test", 2);
    q.onsuccess = () => resolve(q.result);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put({ formatVersion: 99 }, "current");
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
  db.close();
  const again = await repo({ indexedDB });
  await assert.rejects(again.initialize(storage()), /corrupt/);
  again.close();
});
test("V2 interrupted initial commit retries without duplicate documents", async () => {
  const r = await repo(),
    s = storage(),
    raw = captureLegacy(s),
    original = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "workspace") throw Error("interrupted");
      return original.apply(this, args);
    };
    await assert.rejects(r.initialize(s), /interrupted/);
    assert.equal(await r.read(), null);
    assert.deepEqual(await r.readBackup(await digest(raw)), raw);
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.equal((await r.initialize(s)).workspace.saved.length, 1);
  r.close();
});
test("V2 conflict-copy recovery keeps the current draft and local unsaved work", async () => {
  const r = await repo(),
    first = await r.initialize(storage()),
    local = cloneDocument(first.workspace.draft);
  local.title = "未保存的本地创作";
  const saved = await r.saveConflictCopy(local, 1);
  assert.equal(saved.workspace.draft.title, "");
  assert.equal(saved.workspace.saved.at(-1).title, local.title);
  assert.notEqual(saved.workspace.saved.at(-1).documentId, local.documentId);
  await assert.rejects(r.saveConflictCopy(local, 1), ConflictError);
  r.close();
});
test("V2 simultaneous initialization has a single committed migration", async () => {
  const indexedDB = new IDBFactory(),
    a = await repo({ indexedDB }),
    b = await repo({ indexedDB }),
    s = storage();
  const records = await Promise.all([a.initialize(s), b.initialize(s)]);
  assert.deepEqual(records[0], records[1]);
  assert.equal(records[0].revision, 1);
  assert.equal(records[0].workspace.saved.length, 1);
  a.close();
  b.close();
});
test("V2 backup failure prevents first migration; draft mutation during migration is detected", async () => {
  const r = await repo(),
    s = storage(),
    original = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function () {
      throw Error("backup unavailable");
    };
    await assert.rejects(r.initialize(s), /backup unavailable/);
    assert.equal(await r.read(), null);
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  const get = s.getItem;
  let draftReads = 0;
  s.getItem = (k) => {
    if (k === "shiju-draft" && ++draftReads === 2) {
      const changed = legacy();
      changed.title = "changed";
      s.setItem(k, JSON.stringify(changed));
    }
    return get(k);
  };
  await assert.rejects(r.initialize(s), ConflictError);
  assert.equal(await r.read(), null);
  assert.equal((await r.initialize(s)).workspace.draft.title, "changed");
  r.close();
});
