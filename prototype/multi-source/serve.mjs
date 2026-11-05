// Local-only static overlay: current release search assets + working editor modules.
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const repo = process.cwd(),
  release = resolve(repo, "release-artifacts/migration-final-site");
const manifest = JSON.parse(readFileSync(resolve(release, "release.json")));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
http
  .createServer((req, res) => {
    try {
      const path = decodeURIComponent(
          new URL(req.url, "http://local").pathname,
        ),
        name = path === "/" ? "phase-two.html" : path.slice(1);
      let file = resolve(repo, "dist", name);
      if (path.startsWith("/modules/search/"))
        file = resolve(
          release,
          manifest.modules,
          "search",
          path.slice("/modules/search/".length),
        );
      else if (path.startsWith("/prototype/")) file = resolve(repo, name);
      else if (!existsSync(file)) file = resolve(release, name);
      if (!file.startsWith(repo + sep) || !statSync(file).isFile())
        throw Error("missing");
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 4200), "127.0.0.1", () =>
    console.log("2B local editor: http://127.0.0.1:4200/"),
  );
