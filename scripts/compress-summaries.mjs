// Produce a fresh dataset; preserve body IDs and index ordering.
import { readFileSync, writeFileSync, mkdirSync, cpSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { unpack } from '../prototype/static-search/unpack.mjs';
const read = p => JSON.parse(readFileSync(p));
const save = (p, v) => writeFileSync(p, JSON.stringify(v));
const hash = raw => createHash('sha256').update(raw).digest('hex').slice(0, 20);
export function compressCollection(dir) {
  const manifest = read(dir + '/manifest.json');
  const oldFiles = manifest.summaries;
  let before = 0, after = 0;
  manifest.summaries = oldFiles.map(file => {
    const original = readFileSync(dir + '/' + file);
    const rows = unpack(JSON.parse(original));
    const plain = JSON.stringify(rows);
    const packed = JSON.stringify({ encoding: 'gzip-base64-v1', data: gzipSync(plain, { level: 9 }).toString('base64') });
    const raw = Buffer.byteLength(packed) < Buffer.byteLength(plain) ? packed : plain;
    const name = hash(raw) + '.json';
    writeFileSync(dir + '/' + name, raw);
    before += original.length; after += Buffer.byteLength(raw);
    return name;
  });
  save(dir + '/manifest.json', manifest);
  for (const file of new Set(oldFiles)) if (!manifest.summaries.includes(file)) unlinkSync(dir + '/' + file);
  return { before, after, files: manifest.summaries.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg || !outputArg) throw Error('Usage: node scripts/compress-summaries.mjs INPUT NEW_OUTPUT');
  const input = resolve(inputArg), out = resolve(outputArg);
  mkdirSync(out, { recursive: false });
  cpSync(input, out, { recursive: true });
  const config = read(out + '/static-data/metadata-current.json');
  const root = out + '/static-data/';
  const results = {};
  for (const key of config.keys) results[key] = compressCollection(root + config.sourceVersion + '/' + key);
  const digest = hash(JSON.stringify(config.keys.map(key => readFileSync(root + config.sourceVersion + '/' + key + '/manifest.json', 'utf8'))));
  const sourceVersion = config.sourceVersion + '-summaries-' + digest;
  renameSync(root + config.sourceVersion, root + sourceVersion);
  const indexVersion = hash(config.version + sourceVersion);
  renameSync(root + config.version, root + indexVersion);
  config.version = indexVersion;
  config.sourceVersion = sourceVersion;
  for (const key of config.keys) {
    const p = root + sourceVersion + '/' + key + '/manifest.json';
    const manifest = read(p); manifest.body.version = indexVersion; save(p, manifest);
  }
  const inventory = read(out + '/body-inventory.json');
  inventory.indexVersion = indexVersion; save(out + '/body-inventory.json', inventory);
  config.summaryEncoding = 'gzip-base64-v1';
  save(root + 'metadata-current.json', config);
  save(root + config.version + '/catalog.json', config);
  save(root + 'current.json', { version: sourceVersion, catalog: config.catalog });
  save(out + '/summary-compression.json', { sourceVersion, collections: results });
  console.log(JSON.stringify({ out, sourceVersion, before: Object.values(results).reduce((n,r)=>n+r.before,0), after: Object.values(results).reduce((n,r)=>n+r.after,0) }));
}
