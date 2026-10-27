import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
const files = [
  "dist/app.js",
  ...readdirSync("dist/modules")
    .filter((f) => f.endsWith(".js"))
    .map((f) => "dist/modules/" + f),
];
const graph = new Map();
for (const file of files) {
  execFileSync(process.execPath, ["--check", file]);
  const imports = [
    ...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g),
  ].map((m) => resolve(dirname(file), m[1].split(/[?#]/)[0]));
  for (const path of imports)
    if (!existsSync(path))
      throw new Error(`Missing import: ${file} -> ${path}`);
  graph.set(resolve(file), imports);
}
function visit(file, path = []) {
  if (path.includes(file))
    throw new Error(`Circular imports: ${[...path, file].join(" -> ")}`);
  for (const next of graph.get(file) || []) visit(next, [...path, file]);
}
for (const file of graph.keys()) visit(file);
console.log(
  `PASS: ${files.length} modules parse, all imports exist, no circular imports`,
);
