import { createRemoteReader } from "./reader.mjs";
import { readFileSync, existsSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
const build = JSON.parse(readFileSync("prototype/remote-body/build.json"));
const d = JSON.parse(readFileSync(build.inventory));
const path = Object.keys(d.files)[0],
  version = d.indexVersion;
let calls = 0;
const fetcher = (...a) => {
  calls++;
  return fetch(...a);
};
const opts = {
  fetcher,
  cryptoAPI: webcrypto,
  cacheStorage: undefined,
};
const desc = { version, baseURL: d.baseURL, hash: d.files[path] };
const reader = createRemoteReader(opts),
  result = await reader(path, version, desc);
assert.deepEqual(result, JSON.parse(readFileSync(build.data + "/" + path)));
assert.equal(calls, 1);
await reader(path, version, desc);
assert.equal(calls, 1);
for (const [mode, message] of [
  ["missing", "404"],
  ["fail503", "503"],
  ["corrupt", "校验失败"],
  ["slow", "超时"],
]) {
  const r = createRemoteReader({
    ...opts,
    timeout: mode === "slow" ? 100 : 12000,
  });
  await assert.rejects(
    () => r(path, version, { ...desc, baseURL: d.baseURL + mode + "/" }),
    new RegExp(message),
  );
  // Repeating a failed operation must make another network request, not cache failure.
  const before = calls;
  await assert.rejects(() =>
    r(path, version, { ...desc, baseURL: d.baseURL + mode + "/" }),
  );
  assert.ok(calls > before);
}
await assert.rejects(
  () =>
    createRemoteReader({
      ...opts,
    })(path, "wrong", desc),
  /版本不一致/,
);
const records = new Map();
const cache = {
  match: async (k) => records.get(k)?.clone(),
  put: async (k, v) => records.set(k, v.clone()),
  keys: async () => [...records.keys()],
  delete: async (k) => records.delete(k),
};
const cachedOpts = { ...opts, cacheStorage: { open: async () => cache } };
await createRemoteReader(cachedOpts)(path, version, desc);
let before = calls;
await createRemoteReader(cachedOpts)(path, version, desc);
assert.equal(calls - before, 0);
records.set(new URL(path, d.baseURL).href, new Response("[]"));
before = calls;
await createRemoteReader(cachedOpts)(path, version, desc);
assert.equal(calls - before, 1);
for (const [p, hash] of Object.entries(d.files)) {
  assert.equal(existsSync(build.site + "/static-data/" + p), false);
  assert.equal(
    createHash("sha256")
      .update(readFileSync(build.data + "/" + p))
      .digest("hex"),
    hash,
  );
}
console.log(
  JSON.stringify(
    {
      passed: true,
      blocksVerified: Object.keys(d.files).length,
      sample: path,
      sampleBytes: readFileSync(build.data + "/" + path).length,
      sampleGzip: gzipSync(readFileSync(build.data + "/" + path)).length,
      descriptorGzip: 0,
      httpCalls: calls,
    },
    null,
    2,
  ),
);
