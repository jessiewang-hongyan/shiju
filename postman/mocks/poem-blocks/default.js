const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  zlib = require("zlib");
const build = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "prototype/remote-body/build.json"),
    ),
  ),
  root = build.data;
http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    let name = decodeURIComponent(
      new URL(req.url, "http://local").pathname,
    ).replace(/^\//, "");
    if (name.startsWith("fail503/")) {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    if (name.startsWith("missing/")) {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    if (name.startsWith("corrupt/")) {
      res.end("[]");
      return;
    }
    const weak = name.startsWith("weak/");
    if (weak) name = name.slice(5);
    const slow = name.startsWith("slow/");
    if (slow) name = name.slice(5);
    const p = path.resolve(root, name);
    if (!p.startsWith(path.resolve(root) + path.sep)) {
      res.writeHead(501);
      res.end("{}");
      return;
    }
    try {
      const raw = fs.readFileSync(p);
      if (weak) {
        const zipped = zlib.gzipSync(raw);
        res.setHeader("Content-Encoding", "gzip");
        setTimeout(() => res.end(zipped), 600 + zipped.length / 50);
      } else if (slow) setTimeout(() => res.end(raw), 300);
      else res.end(raw);
    } catch {
      res.writeHead(404);
      res.end("{}");
    }
  })
  .listen(process.env.PORT);
