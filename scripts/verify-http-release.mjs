import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const inv = JSON.parse(
    readFileSync("release-artifacts/production-inventory.json"),
  ),
  base = process.env.VERIFY_URL || "http://127.0.0.1:4188/shiju/";
let i = 0;
await Promise.all(
  Array.from({ length: 20 }, async () => {
    while (i < inv.files.length) {
      const f = inv.files[i++];
      const r = await fetch(base + f.path, { method: "HEAD" });
      assert.equal(r.status, 200, f.path);
      if (/\.(mjs|js)$/.test(f.path))
        assert.ok(/javascript/.test(r.headers.get("content-type")), f.path);
    }
  }),
);
writeFileSync(
  "release-artifacts/production-http-verification.json",
  JSON.stringify({ passed: true, base, files: inv.files.length }),
);
console.log("HTTP paths verified:", inv.files.length);
