import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { createJobQueue } from "../static-search/jobs.mjs";
import { createRemoteReader } from "./reader.mjs";
const b = JSON.parse(readFileSync("prototype/remote-body/build.json")),
  d = JSON.parse(readFileSync(b.inventory));
const file = Object.keys(d.files)[0];
const replies = [],
  started = [],
  aborts = [];
let done;
const complete = new Promise((r) => (done = r));
const reader = createRemoteReader({
  cryptoAPI: webcrypto,
  cacheStorage: undefined,
});
const q = createJobQueue(
  async (job, signal) => {
    started.push(job.ticket);
    try {
      const data = await reader(
        file,
        d.indexVersion,
        {
          version: d.indexVersion,
          hash: d.files[file],
          baseURL: d.baseURL + (job.slow ? "weak/" : ""),
        },
        signal,
      );
      return { result: data.length };
    } catch (e) {
      if (e.name === "AbortError") aborts.push(job.ticket);
      throw e;
    }
  },
  (m) => {
    replies.push(m);
    if (m.ticket === 3) done();
  },
);
const start = performance.now();
q.receive({ ticket: 1, slow: true });
q.receive({ ticket: 2, slow: true });
await new Promise((r) => setTimeout(r, 50));
q.receive({ kind: "cancel", ticket: 2 });
q.receive({ kind: "cancel", ticket: 1 });
q.receive({ ticket: 3 });
await Promise.race([
  complete,
  new Promise((_, reject) =>
    setTimeout(() => reject(Error("New task blocked")), 3000).unref(),
  ),
]);
assert.deepEqual(started, [1, 3]);
assert.deepEqual(aborts, [1]);
assert.equal(replies.length, 1);
assert.ok(replies[0].result > 0);
const report = {
  passed: true,
  started,
  aborted: aborts,
  replied: replies.map((x) => x.ticket),
  elapsedMs: Math.round(performance.now() - start),
  simulation:
    "Postman /weak/ 400kbps + 600ms; cancel after 50ms, new request normal speed",
};
writeFileSync(
  "prototype/remote-body/cancel-result.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
