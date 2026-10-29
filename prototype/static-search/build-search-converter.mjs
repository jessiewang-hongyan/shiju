import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const ctx = {};
runInNewContext(readFileSync("dist/vendor/opencc/opencc.js", "utf8"), ctx);
const config = ctx.OpenCC.Locale.configs.t2s;
if (config.segmentation)
  throw Error("Re-evaluate segmented conversion before rebuilding");
const text = `// Generated from bundled OpenCC; t -> cn only. Do not edit by hand.\n// Original licenses: ../../dist/vendor/opencc/LICENSE and THIRD_PARTY_LICENSES.md\nconst r=(s,i)=>s.codePointAt(i)>65535?2:1;\n${String(ctx.OpenCC.Trie)}\nconst groups=${JSON.stringify([...config.normalizationChain, ...config.conversionChain])};\nconst chain=groups.map(g=>{const trie=new t();trie.loadDictGroup(g);return trie;});\nexport const normalize=text=>chain.reduce((s,trie)=>trie.convert(s),String(text||'')).normalize('NFC').toLocaleLowerCase();\n`;
writeFileSync("prototype/static-search/search-converter.mjs", text);
console.log(Buffer.byteLength(text));
