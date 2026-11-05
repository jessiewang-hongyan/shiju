import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  createSource,
  createDocument,
  cloneDocument,
  usedPositions,
} from "../dist/modules/document-model.js";
import {
  applyCommand,
  createHistory,
} from "../dist/modules/document-commands.js";
import {
  openDocumentRepository,
  ConflictError,
} from "../dist/modules/document-storage.js";
import { createDraftSession } from "../dist/modules/draft-session.js";
import { createMultiEditor } from "../dist/modules/editor-v2.js";
import { createTypography } from "../dist/modules/typography.js";
import { initUI } from "../dist/modules/ui.js";
import { initLibrary } from "../dist/modules/library.js";
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => {
  const t = nativeTimeout(fn, ms, ...args);
  if (ms >= 1500) t.unref();
  return t;
};
const emptyStorage = { length: 0, key: () => null, getItem: () => null };
async function fixture() {
  return createDocument(
    await Promise.all(
      ["甲", "乙", "丙"].map((title) =>
        createSource({ title, author: "月人", text: "月𠮷□月\n第二段" }),
      ),
    ),
  );
}
test("2B three-source cut/return, clear, reorder and remove are atomic and undoable", async () => {
  const initial = await fixture(),
    h = createHistory(initial);
  for (const s of initial.sources)
    h.execute({
      type: "cut",
      origin: { sourceId: s.instanceId, part: "text", offset: 0 },
    });
  assert.equal(usedPositions(h.document).size, 3);
  const before = h.document,
    id = initial.sources[1].instanceId;
  h.execute({ type: "remove", id }, { activeSourceId: id });
  assert.equal(h.document.tokens.length, 2);
  assert.equal(h.undo().activeSourceId, id);
  assert.deepEqual(h.document.sources, before.sources);
  assert.deepEqual(h.document.tokens, before.tokens);
  h.execute({ type: "reorder", id, delta: -1 });
  assert.equal(h.document.sources[0].instanceId, id);
  assert.equal(h.document.tokens[1].origin.sourceId, id);
  h.execute({ type: "insert", text: "——" });
  h.execute({ type: "clear" });
  assert.equal(h.document.sources.length, 3);
  assert.equal(h.document.tokens.length, 0);
  h.undo();
  assert.equal(h.document.tokens.at(-1).raw, "——");
  h.execute({ type: "return", id: h.document.tokens[0].tokenId });
  assert.equal(h.document.tokens.filter((t) => t.origin).length, 2);
});
test("2B history shares immutable source snapshots and retains at most 100 steps", async () => {
  const initial = await fixture(),
    h = createHistory(initial);
  for (let i = 0; i < 130; i++) h.execute({ type: "insert", text: "。" });
  assert.equal(h.length, 100);
  assert.equal(h.document.sources, initial.sources);
  for (let i = 0; i < 100; i++) h.undo();
  assert.equal(h.document.tokens.length, 30);
  assert.equal(h.document.sources, initial.sources);
});
test("2B excerpt editing is blocked while used and reference identity survives allowed changes", async () => {
  let doc = await fixture();
  const s = doc.sources[0],
    snapshot = { ...s.snapshot, text: "第二段" };
  doc = applyCommand(doc, {
    type: "cut",
    origin: { sourceId: s.instanceId, part: "title", offset: 0 },
  });
  assert.throws(
    () =>
      applyCommand(doc, {
        type: "excerpt",
        id: s.instanceId,
        snapshot,
        selection: null,
      }),
    /归还/,
  );
  doc = applyCommand(doc, { type: "clear" });
  doc = applyCommand(doc, {
    type: "excerpt",
    id: s.instanceId,
    snapshot,
    selection: null,
    originalSnapshot: s.snapshot,
  });
  assert.equal(doc.sources[0].instanceId, s.instanceId);
  assert.equal(doc.sources[0].originalSnapshot.text, s.snapshot.text);
});
test("2B each draft save writes only one document plus metadata, never a saved work", async () => {
  const r = await openDocumentRepository({ indexedDB: new IDBFactory() }),
    first = await r.initialize(emptyStorage),
    doc = await fixture();
  let result = await r.saveDraft(doc, first.revision);
  for (let i = 0; i < 100; i++) result = await r.addSaved(doc, result.revision);
  const writes = [],
    original = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function (value, key) {
      writes.push({ store: this.name, key });
      return original.call(this, value, key);
    };
    const saved = await r.saveDraft({ ...doc, title: "新题" }, result.revision);
    assert.deepEqual(
      writes.map((w) => w.store),
      ["documents", "workspace"],
    );
    assert.equal((await r.readDraft()).document.title, "新题");
    const full = await r.read();
    assert.equal(full.workspace.saved.length, 100);
    assert.ok(full.workspace.saved.every((d) => d.title === ""));
    await r.saveView("tab", { activeSourceId: doc.sources[1].instanceId });
    assert.equal((await r.readDraft()).revision, saved.revision);
  } finally {
    IDBObjectStore.prototype.put = original;
    r.close();
  }
});
test("2B DB upgrade preserves the old workspace and backup in one transaction", async () => {
  const indexedDB = new IDBFactory();
  const document = await fixture(),
    old = {
      formatVersion: 2,
      revision: 4,
      writerId: "old",
      imports: [],
      legacyFingerprint: "x",
      workspace: { draft: document, saved: [], view: {} },
    };
  const db = await new Promise((resolve) => {
    const q = indexedDB.open("upgrade", 1);
    q.onupgradeneeded = () => {
      q.result.createObjectStore("workspace");
      q.result.createObjectStore("backups");
    };
    q.onsuccess = () => resolve(q.result);
  });
  await new Promise((resolve) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(old, "current");
    tx.oncomplete = resolve;
  });
  db.close();
  const r = await openDocumentRepository({ indexedDB, name: "upgrade" });
  assert.deepEqual((await r.readDraft()).document, document);
  assert.deepEqual(await r.readBackup("before-storage-v2"), {
    previousV2: old,
  });
  assert.equal((await r.read()).revision, 4);
  r.close();
});
test("2B save queue preserves rapid edits and blocks stale writes on conflict", async () => {
  let resolveFirst,
    attempts = 0;
  const writes = [],
    r = {
      saveDraft: async (doc, rev) => {
        writes.push(doc.title);
        if (!attempts++) await new Promise((r) => (resolveFirst = r));
        return { revision: rev + 1 };
      },
    };
  const session = createDraftSession(r, 1);
  const first = session.enqueue({ title: "a" });
  session.enqueue({ title: "b" });
  session.enqueue({ title: "c" });
  resolveFirst();
  await first;
  assert.deepEqual(writes, ["a", "c"]);
  assert.equal(session.revision, 3);
  r.saveDraft = async () => {
    throw new ConflictError();
  };
  await session.enqueue({ title: "unsaved" });
  assert.equal(session.blocked, true);
  await session.enqueue({ title: "latest" });
  assert.equal(session.pending.title, "latest");
  await assert.rejects(session.flush());
});
async function setup() {
  const dom = new JSDOM(readFileSync("dist/phase-two.html", "utf8"), {
      url: "http://local/",
    }),
    w = dom.window;
  for (const key of ["document", "localStorage", "innerWidth"])
    globalThis[key] = w[key];
  globalThis.confirm = () => true;
  globalThis.requestAnimationFrame = (fn) => fn();
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  initUI();
  const saves = [],
    editor = createMultiEditor({
      document: await fixture(),
      typography: createTypography(),
      onSave: (d) => saves.push(d),
    });
  editor.render();
  return { dom, w, editor, saves, $: (s) => w.document.querySelector(s) };
}
test("2B editor tabs, provenance, hidden-source return, removal undo, keyboard and empty state", async () => {
  const x = await setup();
  try {
    const ids = x.editor.document.sources.map((s) => s.instanceId);
    x.$("#source-poem .char").click();
    x.editor.switchSource(ids[1]);
    x.$("#source-poem .char").click();
    assert.equal(x.editor.document.tokens.length, 2);
    assert.equal(x.$("#new-poem").children.length, 2);
    const n = x.editor.historyLength;
    x.$("[role=tab][aria-selected=true]").dispatchEvent(
      new x.w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(x.editor.activeSource.instanceId, ids[2]);
    assert.equal(x.editor.historyLength, n);
    x.$(".poem-token").click();
    x.$("#locate-source").click();
    assert.equal(x.editor.activeSource.instanceId, ids[0]);
    assert.ok(x.$(".origin-highlight"));
    x.editor.switchSource(ids[2]);
    x.$(".poem-token").dispatchEvent(
      new x.w.MouseEvent("dblclick", { bubbles: true }),
    );
    assert.equal(x.editor.document.tokens.length, 1);
    assert.equal(x.editor.activeSource.instanceId, ids[2]);
    x.editor.switchSource(ids[1]);
    x.$("#source-options").click();
    assert.equal(x.$("#source-excerpt").disabled, true);
    x.$("#source-remove").click();
    assert.equal(x.editor.document.tokens.length, 0);
    x.$("#undo").click();
    assert.equal(x.editor.document.tokens.length, 1);
    assert.equal(x.editor.activeSource.instanceId, ids[1]);
    for (const id of ids) x.editor.execute({ type: "remove", id });
    assert.equal(x.$("#source-empty").hidden, false);
    assert.equal(x.$("#source-options").disabled, true);
    x.$("#undo").click();
    assert.equal(x.editor.document.sources.length, 1);
  } finally {
    x.dom.window.close();
  }
});
test("2B custom search dialog adds and deduplicates without clearing current poem; excerpt can be revised", async () => {
  const x = await setup();
  try {
    initLibrary({ editor: x.editor, typography: createTypography() });
    x.$("#source-poem .char").click();
    x.$("#picker").showModal();
    x.$("#custom-title").value = "自定";
    x.$("#custom-author").value = "";
    x.$("#custom-text").value = "第一段\n第二段\n第三段";
    x.$("#custom-tab").dispatchEvent(
      new x.w.Event("submit", { cancelable: true }),
    );
    x.$("#excerpt-enabled").checked = true;
    x.$("#excerpt-start").value = "2";
    x.$("#excerpt-end").value = "2";
    await x.$("#preview-use").onclick();
    assert.equal(x.editor.document.sources.length, 4);
    assert.equal(x.editor.document.tokens.length, 1);
    assert.equal(x.editor.activeSource.snapshot.text, "第二段");
    assert.equal(x.editor.activeSource.selection.bodyStartCodePoint, 4);
    x.$("#source-options").click();
    x.$("#source-excerpt").click();
    await new Promise((r) => setTimeout(r, 0));
    assert.match(x.$("#preview-text").textContent, /第一段/);
    x.$("#excerpt-enabled").checked = false;
    await x.$("#preview-use").onclick();
    assert.equal(x.editor.activeSource.snapshot.text, "第一段\n第二段\n第三段");
    x.$("#picker").showModal();
    x.$("#custom-tab").dispatchEvent(
      new x.w.Event("submit", { cancelable: true }),
    );
    await x.$("#preview-use").onclick();
    assert.equal(x.editor.document.sources.length, 4);
  } finally {
    x.dom.window.close();
  }
});
test("2B closed preview cannot add a pending async source", async () => {
  const x = await setup();
  try {
    x.$("#picker").showModal();
    x.$("#poem-preview").showModal();
    const pending = x.editor.changeSource({
      title: "迟到",
      author: "",
      text: "月",
    });
    x.$("#picker").close();
    assert.equal(await pending, false);
    assert.equal(x.editor.document.sources.length, 3);
  } finally {
    x.dom.window.close();
  }
});
test("2B queued collection writes do not race rapid edits", async () => {
  let release;
  const calls = [];
  const session = createDraftSession(
    {
      saveDraft: async (doc, revision) => {
        calls.push(["draft", doc.title, revision]);
        return { revision: revision + 1 };
      },
    },
    1,
  );
  const operation = session.perform(async (revision) => {
    calls.push(["collection", revision]);
    await new Promise((r) => (release = r));
    return { revision: revision + 1 };
  });
  await new Promise((r) => setTimeout(r, 0));
  session.enqueue({ title: "while saving" });
  release();
  await operation;
  await session.flush();
  assert.deepEqual(calls, [
    ["collection", 1],
    ["draft", "while saving", 2],
  ]);
  assert.equal(session.revision, 3);
});

test("2B keyboard movement retains token focus", async () => {
  const x = await setup();
  try {
    x.$("#source-poem .char").click();
    x.$("#source-poem .char:not(.used)")?.click();
    x.$("#space").click();
    const token = x.$(".poem-token");
    const id = token.dataset.tokenId;
    token.dispatchEvent(
      new x.w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(x.w.document.activeElement.dataset.tokenId, id);
  } finally {
    x.dom.window.close();
  }
});

test("2B ordinary undo preserves current preferences; undo opening a work restores its prior preferences", async () => {
  const doc = await fixture();
  const history = createHistory(doc);
  history.execute({ type: "field", field: "title", value: "before" });
  history.setPreferences({ "shiju-source-size": "14" });
  history.undo();
  assert.equal(
    history.document.imageSettings.preferences["shiju-source-size"],
    "14",
  );
  const other = await fixture();
  other.imageSettings.preferences = { "shiju-source-size": "25" };
  history.execute({ type: "restore", document: other });
  assert.equal(
    history.document.imageSettings.preferences["shiju-source-size"],
    "25",
  );
  history.undo();
  assert.equal(
    history.document.imageSettings.preferences["shiju-source-size"],
    "14",
  );
});
