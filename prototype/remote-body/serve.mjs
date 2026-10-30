import http from "node:http";
import { readFileSync, statSync, appendFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const conf = JSON.parse(readFileSync("prototype/remote-body/build.json")),
  root = resolve(process.env.SHIJU_PREVIEW_ROOT || conf.site),
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
  .createServer(async (req, res) => {
    res.on("close", () => {
      if (!res.writableFinished)
        appendFileSync(
          "/tmp/shiju-remote-requests.log",
          JSON.stringify({ path: req.url, event: "client-aborted" }) + "\n",
        );
    });
    try {
      const url = new URL(req.url, "http://local");
      if (url.pathname === "/shiju") {
        res.writeHead(302, { Location: "/shiju/" });
        res.end();
        return;
      }
      const isBody =
        url.pathname.startsWith("/bodies/") && process.env.SHIJU_PREVIEW_BODIES;
      if (!isBody && !url.pathname.startsWith("/shiju/"))
        throw Error("outside prefix");
      const control = process.env.SHIJU_PREVIEW_CONTROL
        ? JSON.parse(readFileSync(process.env.SHIJU_PREVIEW_CONTROL))
        : {};
      const servingRoot = isBody
        ? resolve(process.env.SHIJU_PREVIEW_BODIES)
        : control.useAlternate && process.env.SHIJU_PREVIEW_ALTERNATE_ROOT
          ? resolve(process.env.SHIJU_PREVIEW_ALTERNATE_ROOT)
          : root;
      const name =
        decodeURIComponent(url.pathname.slice(isBody ? 8 : 7)) || "index.html";
      const p = resolve(servingRoot, name);
      if (!p.startsWith(servingRoot + sep) || !statSync(p).isFile())
        throw Error("missing");
      const type = types[extname(p)] || "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "no-store");
      appendFileSync(
        "/tmp/shiju-remote-requests.log",
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
      if (control.failJSON && extname(p) === ".json") {
        res.writeHead(503);
        res.end("{}");
        return;
      }
      let raw = readFileSync(p);
      // Local migration acceptance only: simulate a newer release announcement.
      if (name === "release.json" && /^[a-f0-9]{16}$/.test(control.releaseRuntime || ""))
        raw = Buffer.from(JSON.stringify({ ...JSON.parse(raw), runtime: control.releaseRuntime }));
      const delay = Number(process.env.SHIJU_PREVIEW_DELAY_MS || 0);
      if (delay && extname(p) === ".json")
        await new Promise((resolve) => setTimeout(resolve, delay));
      const wire = /gzip/.test(req.headers["accept-encoding"] || "")
        ? gzipSync(raw)
        : raw;
      if (control.latency || control.kbps)
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            (control.latency || 0) +
              (control.kbps ? (wire.length * 8) / control.kbps : 0),
          ),
        );
      if (/gzip/.test(req.headers["accept-encoding"] || "")) {
        res.setHeader("Content-Encoding", "gzip");
        res.end(gzipSync(raw));
      } else res.end(raw);
    } catch {
      appendFileSync(
        "/tmp/shiju-remote-requests.log",
        JSON.stringify({ method: req.method, path: req.url, status: 404 }) +
          "\n",
      );
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.SHIJU_PREVIEW_PORT || 4185), "127.0.0.1", () =>
    console.log("Preview ready"),
  );
