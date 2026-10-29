import http from "node:http";
import { createShaper } from "./network-shaper.mjs";
import { readFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const repo = resolve("."),
  root = process.env.STATIC_DATA || "/tmp/shiju-static-search",
  normalized = process.env.SEARCH_DATA || "/tmp/shiju-search-normalized",
  song = process.env.SONG_DATA || "/tmp/shiju-song-eval";
export function resolveAsset(url) {
  let name = decodeURIComponent(url.split("?")[0]);
  let base = repo;
  if (name === "/") name = "/prototype/static-search/index.html";
  if (name.startsWith("/editor/")) {
    base = repo + "/dist";
    name = name.slice(8) || "index.html";
  } else if (name.startsWith("/static-data/")) {
    base = root;
    name = name.slice(13);
  } else if (name.startsWith("/data/search/")) {
    base = normalized;
    name = name.slice(6);
  } else if (name.startsWith("/data/parts/song-era/")) {
    base = song;
    name = name.slice(6);
  } else if (name.startsWith("/data/")) {
    base = repo + "/dist";
    name = name.slice(1);
  } else {
    if (
      !name.startsWith("/dist/modules/") &&
      !name.startsWith("/dist/vendor/opencc/") &&
      !name.startsWith("/prototype/static-search/")
    )
      throw Error("not found");
    name = name.slice(1);
  }
  const path = resolve(base, name);
  if (!path.startsWith(resolve(base) + sep)) throw Error("not found");
  return path;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT || 4181);
  const shaper = process.env.WEAK_KBPS
    ? createShaper({
        kbps: Number(process.env.WEAK_KBPS),
        rtt: Number(process.env.WEAK_RTT || 300),
      })
    : null;
  http
    .createServer(async (req, res) => {
      try {
        let raw = readFileSync(resolveAsset(req.url));
        if (req.url.split("?")[0] === "/editor/")
          raw = Buffer.from(
            raw
              .toString()
              .replace(
                "<head>",
                '<head><meta name="shiju-search-service" content="static">',
              ),
          );
        if (req.url.split("?")[0] === "/editor/app.js")
          raw = Buffer.from(
            'import { staticRequest } from "/prototype/static-search/transport.mjs";\n' +
              raw
                .toString()
                .replace(
                  "initLibrary({ editor, typography })",
                  "initLibrary({ editor, typography, searchRequest: staticRequest })",
                ),
          );
        const compressed = /gzip/.test(req.headers["accept-encoding"] || "");
        const type =
          {
            ".html": "text/html",
            ".mjs": "text/javascript",
            ".js": "text/javascript",
            ".json": "application/json",
            ".css": "text/css",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".jpg": "image/jpeg",
          }[extname(req.url.split("?")[0])] || "text/html";
        const payload = compressed ? gzipSync(raw) : raw;
        if (shaper) await shaper.transfer(payload.length);
        res.writeHead(200, {
          "Content-Type": type + "; charset=utf-8",
          "Cache-Control": "no-store",
          ...(compressed ? { "Content-Encoding": "gzip" } : {}),
        });
        res.end(payload);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    })
    .listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
}
