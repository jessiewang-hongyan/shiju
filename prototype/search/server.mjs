import http from "node:http";
import { Worker } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { gzipSync } from "node:zlib";
import { libraryCatalog } from "../../dist/modules/library-loader.js";
const dist = fileURLToPath(new URL("../../dist", import.meta.url));
const song = process.env.SONG_DATA ? resolve(process.env.SONG_DATA) : null;
const searchData = resolve(
  process.env.SEARCH_DATA || "/tmp/shiju-search-normalized",
);
const catalog = {
  ...libraryCatalog,
  ...(song ? { "song-era": { name: "宋", file: "song-era.json" } } : {}),
};
const hash = createHash("sha256");
hash.update(readFileSync(searchData + "/version"));
hash.update("normalized-title-rank-v1");
const collections = Object.entries(catalog).map(([key, v]) => {
  const folder = key === "song-era" ? song : dist + "/data";
  const m = readFileSync(
    `${folder}/search/${v.file.replace(".json", "")}/metadata/manifest-v2.json`,
  );
  hash.update(m);
  hash.update(
    readFileSync(
      `${folder}/search/${v.file.replace(".json", "")}/manifest-v2.json`,
    ),
  );
  return { key, name: v.name, count: JSON.parse(m).count };
});
const version = hash.digest("hex").slice(0, 20);
const secret = randomBytes(32);
const sign = (s) => createHmac("sha256", secret).update(s).digest("base64url");
const cursorFor = (signature, offset) => {
  const p = Buffer.from(
    JSON.stringify({ signature, offset, version }),
  ).toString("base64url");
  return p + "." + sign(p);
};
let worker,
  busy = false,
  current = null;
const queue = [];
function spawn() {
  worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    workerData: { dist, song, searchData },
    resourceLimits: { maxOldGenerationSizeMb: 384 },
  });
  worker.on("error", () => {
    if (current) {
      clearTimeout(current.timer);
      current.reject(Error("worker"));
      current = null;
    }
    busy = false;
  });
  worker.on("exit", () => {
    if (current) {
      clearTimeout(current.timer);
      current.reject(Error("worker"));
      current = null;
    }
    busy = false;
    spawn();
    pump();
  });
  worker.on("message", (value) => {
    if (!current) return;
    clearTimeout(current.timer);
    value.failure ? current.reject(Error("data")) : current.resolve(value);
    current = null;
    busy = false;
    pump();
  });
}
function pump() {
  if (busy || !queue.length) return;
  busy = true;
  current = queue.shift();
  current.timer = setTimeout(() => worker.terminate(), 30000);
  worker.postMessage(current.job);
}
function run(job) {
  if (queue.length >= 16) return Promise.reject(Error("busy"));
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject });
    pump();
  });
}
spawn();
function fail(status, code, message) {
  throw Object.assign(Error(message), { status, code });
}
const server = http.createServer(async (req, res) => {
  function send(status, value) {
    const raw = Buffer.from(JSON.stringify(value));
    const zipped = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Accept-Encoding",
      ...(status === 503 ? { "Retry-After": "2" } : {}),
      ...(zipped ? { "Content-Encoding": "gzip" } : {}),
    });
    res.end(zipped ? gzipSync(raw) : raw);
  }
  try {
    if (req.method !== "GET") fail(405, "method", "仅支持 GET");
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/editor") {
      res.writeHead(302, { Location: "/editor/" });
      res.end();
      return;
    }
    if (u.pathname.startsWith("/editor/")) {
      const name = decodeURIComponent(u.pathname.slice(8)) || "index.html";
      const path = resolve(dist, name);
      if (!path.startsWith(dist + sep) || name.startsWith("data/"))
        fail(404, "not_found", "文件不存在");
      let content;
      try {
        content = readFileSync(path);
      } catch {
        fail(404, "not_found", "文件不存在");
      }
      if (name === "index.html")
        content = Buffer.from(
          content
            .toString()
            .replace(
              "<head>",
              '<head><meta name="shiju-search-service" content="local">',
            ),
        );
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
      return;
    }
    if (u.pathname === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(readFileSync(new URL("./index.html", import.meta.url)));
      return;
    }
    if (u.pathname === "/api/catalog") {
      send(200, {
        version,
        collections,
        total: collections.reduce((n, c) => n + c.count, 0),
      });
      return;
    }
    if (u.pathname === "/api/search") {
      const q = (u.searchParams.get("q") || "").trim(),
        field = u.searchParams.get("field") || "title-author",
        scope = u.searchParams.get("scope") || "all",
        limit = Number(u.searchParams.get("limit") || 20);
      if (
        Array.from(q).length > 120 ||
        !["title-author", "title", "author", "full"].includes(field) ||
        !(scope === "all" || Object.hasOwn(catalog, scope)) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 40
      )
        fail(400, "parameters", "搜索条件无效");
      const signature = JSON.stringify([q, field, scope, limit]);
      let offset = 0;
      if (u.searchParams.has("cursor")) {
        try {
          const [payload, sig, ...extra] = u.searchParams
            .get("cursor")
            .split(".");
          const expected = Buffer.from(sign(payload));
          const actual = Buffer.from(sig || "");
          if (
            extra.length ||
            actual.length !== expected.length ||
            !timingSafeEqual(actual, expected)
          )
            throw Error();
          const c = JSON.parse(Buffer.from(payload, "base64url"));
          if (
            c.version !== version ||
            c.signature !== signature ||
            !Number.isSafeInteger(c.offset) ||
            c.offset < 0
          )
            throw Error();
          offset = c.offset;
        } catch {
          fail(409, "cursor", "分页已失效，请重新搜索");
        }
      }
      const result = await run({
        kind: "search",
        q,
        field,
        keys: scope === "all" ? Object.keys(catalog) : [scope],
        limit,
        offset,
      });
      const { nextOffset, ...data } = result;
      send(200, {
        version,
        ...data,
        nextCursor:
          nextOffset === null ? null : cursorFor(signature, nextOffset),
      });
      return;
    }
    if (u.pathname.startsWith("/api/poems/")) {
      if (u.searchParams.get("version") !== version)
        fail(409, "version", "数据版本已变化，请重新搜索");
      const id = decodeURIComponent(u.pathname.slice(11));
      const match = /^([a-z-]+):(\d+)$/.exec(id);
      const entry = match && collections.find((c) => c.key === match[1]);
      const row = match ? Number(match[2]) : -1;
      if (!entry || !Number.isSafeInteger(row) || row >= entry.count)
        fail(404, "not_found", "原文不存在");
      send(200, {
        version,
        id,
        ...(await run({ kind: "poem", key: entry.key, row })),
      });
      return;
    }
    fail(404, "not_found", "接口不存在");
  } catch (e) {
    send(
      e.status || 503,
      e.status
        ? { error: { code: e.code, message: e.message } }
        : {
            error: { code: "unavailable", message: "服务暂不可用，请稍后重试" },
          },
    );
  }
});
server.listen(Number(process.env.PORT || 4180), "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}`,
      version,
      records: collections.reduce((n, c) => n + c.count, 0),
    }),
  ),
);
