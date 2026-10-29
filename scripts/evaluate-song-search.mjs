/** Isolated production-engine benchmark. node --expose-gc scripts/evaluate-song-search.mjs DATA FIELD QUERY [all] */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const engineSource = readFileSync(new URL('../dist/modules/library-index.js', import.meta.url), 'utf8');
const catalogImport = engineSource.match(/from "(.+library-loader\.js[^"]*)"/)[1];
const { libraryCatalog } = await import(new URL(catalogImport, new URL('../dist/modules/library-index.js', import.meta.url)));
import { createIndexedLibrary } from '../dist/modules/library-index.js';
const [root, field, query, scope='song']=process.argv.slice(2);
libraryCatalog['song-era']={name:'宋',file:'song-era.json'};
const keys=scope==='all'?Object.keys(libraryCatalog):['song-era'];
const resolve=u=>u.includes('/song-era/')?root+'/'+u.replace(/^data\//,''):'dist/'+u;
const logs=[];let fetchParseMs=0,peakHeap=0;
const sample=()=>{peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed)};
global.gc();const initial=process.memoryUsage();
const lib=createIndexedLibrary({fetch:async url=>{
 const t=performance.now();const raw=readFileSync(resolve(url));const parsed=JSON.parse(raw);fetchParseMs+=performance.now()-t;
 logs.push({url,bytes:raw.length});sample();return {ok:true,json:async()=>parsed};
}});
const t=performance.now();const ids=await Promise.all(keys.map(k=>lib.search(k,query,field)));const searchMs=performance.now()-t;sample();
const searchRequests=logs.length;const sourceT=performance.now();
let left=40;const visible=[];
for(let i=0;i<keys.length&&left;i++){const chosen=ids[i].slice(0,left);if(chosen.length)visible.push(...await lib.records(keys[i],chosen,field));left-=chosen.length;}
const sourceMs=performance.now()-sourceT;sample();const coldRequests=logs.length;const coldLogs=[...logs];
const sameT=performance.now();await Promise.all(keys.map(k=>lib.search(k,query,field)));const cachedMs=performance.now()-sameT;
assert.equal(logs.length,coldRequests);
// Re-evaluate original query with warmed buckets, not the identical-query shortcut.
await Promise.all(keys.map(k=>lib.search(k,'不存在xyz',field)));
const warmT=performance.now();await Promise.all(keys.map(k=>lib.search(k,query,field)));const warmMs=performance.now()-warmT;sample();
const sessionQueries = scope === 'session' ? ['苏轼','陆游','黄庭坚','杨万里','王安石','欧阳修','范成大','朱熹','李清照','辛弃疾','水调歌头','念奴娇','春','夏','秋','冬','山','水','风','花','雪','月','雨','竹','松','梅','江','湖','海','舟','云','天','日','夜','客','归','梦','酒','故人','西湖'] : [];
const sessionT = performance.now();
for (const q of sessionQueries) {const found=await lib.search('song-era',q,field);await lib.records('song-era',found.slice(0,40),field);sample();}
const sessionMs=performance.now()-sessionT;
global.gc();const retained=process.memoryUsage();const rssHighWaterBytes=process.resourceUsage().maxRSS*1024;
const words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
let expectedVisible=[];
for(let i=0;i<keys.length;i++){
 const key=keys[i],p=key==='song-era'?root+'/song-era.json':'dist/data/'+libraryCatalog[key].file;
 const rows=JSON.parse(readFileSync(p));
 const expected=rows.flatMap((r,j)=>{
 const title=r.title||r.label||'', author=r.author||'';
 const text=field==='full'?[r.title,r.label,r.collection,r.sourceWork,r.author,r.text].filter(Boolean).join(' '):field==='title'?title:field==='author'?author:title+' '+author;
 return words.every(w=>text.toLocaleLowerCase().includes(w))?[j]:[];
 });assert.deepEqual(ids[i],expected,key+':'+query);
 expectedVisible.push(...expected.slice(0,40-expectedVisible.length).map(j=>rows[j]));
}
assert.deepEqual(visible,expectedVisible);
const gz=logs=>logs.reduce((n,l)=>n+gzipSync(readFileSync(resolve(l.url)),{level:6}).length,0);
console.log(JSON.stringify({field,query,scope,results:ids.reduce((n,a)=>n+a.length,0),visible:visible.length,searchMs,sourceMs,cachedMs,warmMs,fetchParseMs,searchRequests,requests:coldRequests,indexBytes:coldLogs.slice(0,searchRequests).reduce((n,l)=>n+l.bytes,0),indexGzipBytes:gz(coldLogs.slice(0,searchRequests)),totalGzipBytes:gz(coldLogs),initialHeap:initial.heapUsed,retainedHeapDelta:retained.heapUsed-initial.heapUsed,observedPeakHeap:peakHeap,rssHighWaterBytes,sessionQueries:sessionQueries.length,sessionMs,sessionRequests:logs.length,sessionRawBytes:logs.reduce((n,l)=>n+l.bytes,0),correct:true}));
