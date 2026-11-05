// Run the regular local editor on 4200 first. A fresh OS-assigned port isolates browser storage.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
const bodies = resolve("release-artifacts/migration-data-candidate/bodies");
let mode = "online",
  epoch = 0,
  trace = [];
const server = http.createServer(async (req, res) => {
  const origin = "http://127.0.0.1:" + server.address().port;
  if (req.headers.host !== new URL(origin).host) {
    res.writeHead(403).end();
    return;
  }
  const path = new URL(req.url, origin).pathname;
  if (path === "/__network") {
    if (req.method !== "POST" || req.headers.origin !== origin) {
      res.writeHead(403).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    if (["online", "slow", "offline"].includes(body)) {
      mode = body;
      epoch++;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ mode, trace }));
    return;
  }
  const event = { path, time: Date.now(), mode, result: "pending" };
  trace.push(event);
  const start = epoch;
  try {
    if (mode === "slow") await new Promise((r) => setTimeout(r, 900));
    if (mode === "offline" || (event.mode === "slow" && start !== epoch)) {
      event.result = "disconnected";
      res.destroy();
      return;
    }
    let bytes, type;
    if (path.startsWith("/__bodies/")) {
      const file = resolve(bodies, path.slice(10));
      if (!file.startsWith(bodies + sep)) throw Error("invalid path");
      bytes = await readFile(file);
      type = "application/json";
    } else {
      const r = await fetch("http://127.0.0.1:4200" + path);
      if (!r.ok) {
        event.result = r.status;
        res.writeHead(r.status).end();
        return;
      }
      type = r.headers.get("content-type");
      bytes = Buffer.from(await r.arrayBuffer());
      if (path.startsWith("/static-data/") && path.endsWith("/manifest.json")) {
        const json = JSON.parse(bytes);
        if (json.body?.baseURL) {
          json.body.baseURL = origin + "/__bodies/";
          bytes = Buffer.from(JSON.stringify(json));
        }
      }
    }
    event.result = 200;
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(bytes);
  } catch (error) {
    event.result = 500;
    res.writeHead(500).end(String(error));
  }
});
server.listen(0, "127.0.0.1", () =>
  console.log(
    "http://127.0.0.1:" +
      server.address().port +
      "/prototype/multi-source/network-lab.html",
  ),
);
