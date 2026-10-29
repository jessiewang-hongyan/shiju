import http from "node:http";
import { readFileSync, statSync, appendFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const conf = JSON.parse(
    readFileSync("prototype/release/package-inventory.json"),
  ),
  root = resolve(conf.out),
  types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".md": "text/plain",
  };
http
  .createServer((req, res) => {
    try {
      const url = new URL(req.url, "http://local");
      if (url.pathname === "/shiju") {
        res.writeHead(302, { Location: "/shiju/" });
        res.end();
        return;
      }
      if (!url.pathname.startsWith("/shiju/")) throw Error("outside prefix");
      const name = decodeURIComponent(url.pathname.slice(7)) || "index.html";
      const p = resolve(root, name);
      if (!p.startsWith(root + sep) || !statSync(p).isFile())
        throw Error("missing");
      const type = types[extname(p)] || "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "no-store");
      appendFileSync(
        "/tmp/shiju-release-requests.log",
        JSON.stringify({
          method: req.method,
          path: url.pathname,
          status: 200,
        }) + "\n",
      );
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const raw = readFileSync(p);
      if (/gzip/.test(req.headers["accept-encoding"] || "")) {
        res.setHeader("Content-Encoding", "gzip");
        res.end(gzipSync(raw));
      } else res.end(raw);
    } catch {
      appendFileSync(
        "/tmp/shiju-release-requests.log",
        JSON.stringify({ method: req.method, path: req.url, status: 404 }) +
          "\n",
      );
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4184, "127.0.0.1", () => console.log("http://127.0.0.1:4184/shiju/"));
