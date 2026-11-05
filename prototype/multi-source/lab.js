import {
  createSource,
  createDocument,
  cloneDocument,
  newIdentity,
} from "../../dist/modules/document-model.js";
import {
  openDocumentRepository,
  ConflictError,
} from "../../dist/modules/document-storage.js";
const output = document.querySelector("#report"),
  status = document.querySelector("#status"),
  button = document.querySelector("#run");
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const memory = (data = {}) => {
  const map = new Map(Object.entries(data));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
};
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
async function measure(fn) {
  const start = performance.now();
  const result = await fn();
  return { result, ms: +(performance.now() - start).toFixed(2) };
}
let report;
button.onclick = async () => {
  button.disabled = true;
  document.querySelector("#download").disabled = true;
  const name = "shiju-2a-lab-" + newIdentity(),
    opened = [];
  report = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    notes:
      "3 samples per capacity row; includes validation/clone/readback. No rendering, export, or real-device memory measurement.",
    functional: [],
    capacity: [],
  };
  const record = (name) => {
    report.functional.push({ name, result: "pass" });
    output.textContent = JSON.stringify(report, null, 2);
  };
  try {
    status.textContent = "验证迁移、并发与恢复…";
    const a = await openDocumentRepository({ name }),
      b = await openDocumentRepository({ name });
    opened.push(a, b);
    const legacy = {
      source: { title: "月", author: "人", text: "月𠮷□" },
      tokens: [{ c: "𠮷", id: 1 }],
      title: "",
      signature: "署名",
    };
    const store = memory({
      "shiju-draft": JSON.stringify(legacy),
      "shiju-collection": "[]",
    });
    const first = await a.initialize(store);
    assert(
      first.workspace.draft.tokens[0].origin.offset === 1,
      "Unicode provenance",
    );
    assert(
      JSON.stringify(await a.initialize(store)) === JSON.stringify(first),
      "Idempotence",
    );
    record("native migration / idempotence / Unicode");
    const x = cloneDocument(first),
      y = cloneDocument(first);
    x.workspace.draft.title = "甲";
    y.workspace.draft.title = "乙";
    const race = await Promise.allSettled([a.commit(x, 1), b.commit(y, 1)]);
    assert(
      race.filter((x) => x.status === "fulfilled").length === 1,
      "CAS single winner",
    );
    assert(
      race.find((x) => x.status === "rejected").reason instanceof ConflictError,
      "CAS error",
    );
    record("two native connections / conflict detection");
    let current = await a.read();
    current = await b.saveConflictCopy(y.workspace.draft, current.revision);
    assert(current.workspace.saved.length === 1, "Conflict copy");
    record("explicit conflict copy");
    legacy.title = "旧页面继续创作";
    store.setItem("shiju-draft", JSON.stringify(legacy));
    assert(await a.legacyChanged(store), "Legacy detect");
    const before = current.workspace.draft;
    current = await a.importLegacyChanges(store, current.revision);
    assert(
      JSON.stringify(current.workspace.draft) === JSON.stringify(before),
      "No overwrite",
    );
    assert(current.workspace.saved.length === 2, "Old copy");
    record("old-page isolation / explicit import");
    const backup = await a.exportBackup();
    const saved = cloneDocument(current.workspace);
    current = await a.commit(
      { ...current, workspace: { ...current.workspace, draft: null } },
      current.revision,
    );
    current = await a.restoreBackup(backup, current.revision);
    assert(
      JSON.stringify(current.workspace) === JSON.stringify(saved),
      "Restore",
    );
    record("JSON backup / restore");
    for (const length of [80, 3000])
      for (const count of [1, 3, 5, 10]) {
        status.textContent = `测量 ${count} 篇 × ${length} 字…`;
        const sources = [];
        for (let i = 0; i < count; i++)
          sources.push(
            await createSource(
              {
                title: "篇" + i,
                author: "作者",
                text: "",
              },
              {
                catalog: {
                  provider: "lab",
                  collection: "fixture",
                  recordId: String(i),
                },
              },
            ),
          );
        // Build by code points; UTF-16 slicing would split the supplementary character.
        for (const source of sources)
          source.snapshot.text = Array.from(
            "月𠮷山水□".repeat(Math.ceil(length / 5)),
          )
            .slice(0, length)
            .join("");
        const doc = createDocument(sources);
        doc.tokens = sources.flatMap((s) =>
          Array.from(s.snapshot.text)
            .slice(0, Math.min(100, length))
            .map((raw, offset) => ({
              tokenId: newIdentity(),
              kind: "cut",
              raw,
              origin: { sourceId: s.instanceId, part: "text", offset },
            })),
        );
        await sample(a, doc, 0, count, length);
        if (count === 10 && length === 3000)
          for (const copies of [10, 50, 100])
            await sample(a, doc, copies, count, length);
      }
    report.storageEstimate = navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null;
    report.result = "pass";
    status.textContent = "实验完成";
  } catch (error) {
    report.result = "failed";
    report.error = String(error.stack || error);
    status.textContent = "实验失败，请查看记录";
  } finally {
    for (const repo of opened) repo.close();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
    button.disabled = false;
    output.textContent = JSON.stringify(report, null, 2);
    document.querySelector("#download").disabled = false;
  }
};
async function sample(repo, doc, copies, count, length) {
  const workspace = {
    draft: doc,
    saved: Array.from({ length: copies }, () => ({
      ...cloneDocument(doc),
      documentId: newIdentity(),
    })),
    view: {},
  };
  const text = JSON.stringify(workspace),
    writes = [],
    reads = [],
    draftWrites = [],
    draftReads = [],
    serializes = [];
  for (let i = 0; i < 3; i++) {
    const old = await repo.read();
    serializes.push((await measure(() => JSON.stringify(workspace))).ms);
    writes.push(
      (await measure(() => repo.commit({ ...old, workspace }, old.revision)))
        .ms,
    );
    reads.push((await measure(() => repo.read())).ms);
  }
  for (let i = 0; i < 3; i++) {
    const current = await repo.readDraft();
    draftWrites.push(
      (await measure(() => repo.saveDraft(doc, current.revision))).ms,
    );
    draftReads.push((await measure(() => repo.readDraft())).ms);
  }
  const key = "shiju-2a-lab-capacity-" + newIdentity();
  let localStorageResult;
  try {
    const timed = await measure(() => localStorage.setItem(key, text));
    assert(localStorage.getItem(key) === text, "LocalStorage readback");
    localStorageResult = { writeMs: timed.ms, result: "pass" };
  } catch (e) {
    localStorageResult = { result: e.name };
  } finally {
    localStorage.removeItem(key);
  }
  report.capacity.push({
    sources: count,
    codePointsPerSource: length,
    savedCopies: copies,
    utf8Bytes: new TextEncoder().encode(text).length,
    utf16EstimatedBytes: text.length * 2,
    serializeMedianMs: median(serializes),
    writeMedianMs: median(writes),
    readMedianMs: median(reads),
    draftWriteMedianMs: median(draftWrites),
    draftReadMedianMs: median(draftReads),
    samples: { writes, reads, draftWrites, draftReads },
    legacyFullSnapshotHistory100Bytes:
      new TextEncoder().encode(JSON.stringify(doc)).length * 100,
    localStorage: localStorageResult,
  });
  output.textContent = JSON.stringify(report, null, 2);
  await new Promise((r) => setTimeout(r, 0));
}
document.querySelector("#download").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "shiju-2a-capacity.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
