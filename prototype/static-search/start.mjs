import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
try {
  const r = await fetch("http://127.0.0.1:4181/static-data/current.json");
  if (r.ok) {
    console.log("http://127.0.0.1:4181/");
    process.exit();
  }
} catch {}
const fd = openSync("/tmp/shiju-static-search.log", "a");
const child = spawn(process.execPath, ["prototype/static-search/server.mjs"], {
  cwd: new URL("../../", import.meta.url).pathname,
  detached: true,
  stdio: ["ignore", fd, fd],
});
child.unref();
closeSync(fd);
console.log(JSON.stringify({ pid: child.pid, url: "http://127.0.0.1:4181/" }));
