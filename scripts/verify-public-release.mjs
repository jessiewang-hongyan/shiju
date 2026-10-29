import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const expected = JSON.parse(readFileSync("_site/release.json"));
const inventory = JSON.parse(
  readFileSync(
    (process.env.RELEASE_DATA_DIR || ".release-data") + "/body-inventory.json",
  ),
);
const base = process.env.PUBLIC_SITE_URL;
const bodyBase = `https://raw.githubusercontent.com/${expected.data.repository}/${expected.data.commit}/bodies/`;
const results = [];
async function get(url) {
  const start = performance.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, 200, url);
  return { r, start };
}
if (base) {
  const { r } = await get(new URL("release.json", base));
  assert.deepEqual(await r.json(), expected);
  const { r: html } = await get(base);
  const text = await html.text();
  for (const entry of [
    ...text.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g),
  ].map((m) => m[1])) {
    const { r } = await get(new URL(entry, base));
    assert.match(r.headers.get("content-type") || "", /javascript|css/);
    results.push({ entry, status: 200 });
  }
}
const samples = new Map();
for (const [path, hash] of Object.entries(inventory.files)) {
  const key = path.split("/")[1];
  if (!samples.has(key)) samples.set(key, { path, hash });
}
for (const [key, { path, hash }] of samples) {
  const { r, start } = await get(bodyBase + path);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  assert.ok(Array.isArray(JSON.parse(bytes.toString("utf8"))));
  results.push({
    collection: key,
    bytes: bytes.length,
    ms: Math.round(performance.now() - start),
    cors: true,
    sha256: true,
  });
}
const report = {
  passed: true,
  at: new Date().toISOString(),
  site: base || null,
  data: expected.data,
  results,
};
writeFileSync(
  "release-artifacts/public-verification.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
