import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { relevance } from "./relevance.mjs";
import { createHash } from "node:crypto";
const root = process.env.STATIC_DATA || "/tmp/shiju-static-search";
const source = JSON.parse(readFileSync(root + "/current.json"));
const version = createHash("sha256")
  .update(source.version)
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex")
  .slice(0, 20);
const base = root + "/" + version;
mkdirSync(base, { recursive: true });
const keys = Object.keys(source.catalog),
  entries = [],
  postings = new Map(),
  counts = {};
for (const [k, key] of keys.entries()) {
  const rows = JSON.parse(
    readFileSync(
      "/tmp/shiju-search-normalized/" +
        source.catalog[key].file.replace(".json", ".rank"),
    ),
  );
  counts[key] = rows.length;
  rows.forEach(([title, author], row) => {
    const id = entries.length;
    entries.push([k, row, title, author]);
    for (const char of new Set(title + author)) {
      if (/\s/u.test(char)) continue;
      if (!postings.has(char)) postings.set(char, []);
      postings.get(char).push(id);
    }
  });
}
let bytes = 0;
const chars = {}, hot = {};
function save(data){ const raw=JSON.stringify(data);const file=createHash("sha256").update(raw).digest("hex").slice(0,20)+".json";writeFileSync(base+"/"+file,raw);return file;}
for (const [char, ids] of postings) {
  const raw = JSON.stringify(ids.map((i) => entries[i]));
  const file =
    createHash("sha256").update(raw).digest("hex").slice(0, 20) + ".json";
  writeFileSync(base + "/" + file, raw);
  bytes += Buffer.byteLength(raw);
  chars[char] = [ids.length, file];
  if(ids.length>=10000){
    const ordered=ids.map(i=>entries[i]).sort((a,b)=>{const x=relevance(a[2],a[3],char),y=relevance(b[2],b[3],char);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];});
    const manifest={size:256,fields:{}};
    for(const field of ['title-author','title','author']){
      const byScope={all:[]};for(const key of keys)byScope[key]=[];
      for(const [k,row,title,author]of ordered){if(field==='title'&&!title.includes(char)||field==='author'&&!author.includes(char))continue;byScope.all.push([k,row]);byScope[keys[k]].push([k,row]);}
      const scopes={};for(const [scope,rows]of Object.entries(byScope)){const files=[];for(let i=0;i<rows.length;i+=256)files.push(save(rows.slice(i,i+256)));scopes[scope]={count:rows.length,files};}manifest.fields[field]=scopes;
    }
    hot[char]=save(manifest);
  }
}
const config = {
  version,
  sourceVersion: source.version,
  catalog: source.catalog,
  keys,
  counts,
  chars,
  hot,
  bytes,
};
writeFileSync(base + "/catalog.json", JSON.stringify(config));
writeFileSync(root + "/metadata-current.json", JSON.stringify(config));
console.log(
  JSON.stringify({
    version,
    records: entries.length,
    files: postings.size,
    bytes,
  }),
);
