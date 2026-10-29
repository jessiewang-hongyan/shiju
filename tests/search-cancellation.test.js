import test from "node:test";
import assert from "node:assert/strict";
import { createJobQueue } from "../prototype/static-search/jobs.mjs";
import { createMetadataSearch } from "../prototype/static-search/metadata-engine.mjs";
const tick = () => new Promise((r) => setImmediate(r));
test("cancel aborts active work, drops queued work and keeps newest result", async () => {
  const started = [],
    replies = [];
  let aborted = false;
  const q = createJobQueue(
    async (d, signal) => {
      started.push(d.ticket);
      if (d.ticket === 1)
        await new Promise((resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(signal.reason);
            },
            { once: true },
          ),
        );
      return { result: d.ticket };
    },
    (m) => replies.push(m),
  );
  q.receive({ ticket: 1 });
  q.receive({ ticket: 2 });
  q.receive({ kind: "cancel", ticket: 2 });
  q.receive({ kind: "cancel", ticket: 1 });
  q.receive({ ticket: 3 });
  await tick();
  assert.equal(aborted, true);
  assert.deepEqual(started, [1, 3]);
  assert.deepEqual(replies, [{ ticket: 3, result: 3 }]);
  q.receive({ kind: "cancel", ticket: 99 });
  q.receive({ ticket: 4 });
  await tick();
  assert.equal(replies.at(-1).result, 4);
});
test("canceled downloads never enter cache; successful cached setup survives cancellation", async () => {
  let controller = new AbortController(),
    calls = 0,
    finish;
  const engine = createMetadataSearch({
    normalize: (s) => s,
    getSignal: () => controller.signal,
    fetchJSON: () => {
      calls++;
      return new Promise((r) => (finish = r));
    },
  });
  const old = engine.setup();
  controller.abort();
  finish({ version: "old" });
  await assert.rejects(old, { name: "AbortError" });
  controller = new AbortController();
  const fresh = engine.setup();
  finish({ version: "new" });
  assert.equal((await fresh).version, "new");
  controller.abort();
  controller = new AbortController();
  assert.equal((await engine.setup()).version, "new");
  assert.equal(calls, 2);
});
test("transport propagates abort to Worker without terminating its caches", async () => {
  const saved = { Worker: globalThis.Worker, location: globalThis.location };
  let instance;
  globalThis.location = { origin: "http://test" };
  globalThis.Worker = class {
    constructor() {
      instance = this;
      this.messages = [];
    }
    postMessage(m) {
      this.messages.push(m);
    }
    terminate() {
      throw Error("Must retain Worker");
    }
  };
  try {
    const { staticRequest } = await import(
      "../prototype/static-search/transport.mjs?cancel-test"
    );
    const c = new AbortController();
    const p = staticRequest("/api/search?q=old", { signal: c.signal });
    const ticket = instance.messages[0].ticket;
    c.abort();
    await assert.rejects(p, { name: "AbortError" });
    assert.deepEqual(instance.messages[1], { kind: "cancel", ticket });
    const next = staticRequest("/api/search?q=new");
    const t = instance.messages.at(-1).ticket;
    instance.onmessage({ data: { ticket, result: { items: ["stale"] } } });
    instance.onmessage({
      data: { ticket: t, result: { items: ["new"], nextOffset: null } },
    });
    assert.deepEqual((await (await next).json()).items, ["new"]);
  } finally {
    globalThis.Worker = saved.Worker;
    globalThis.location = saved.location;
  }
});
