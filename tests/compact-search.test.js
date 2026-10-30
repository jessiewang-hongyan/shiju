import { postingRows } from '../prototype/static-search/posting-codec.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {createMetadataSearch} from '../prototype/static-search/metadata-engine.mjs';
import {relevance} from '../prototype/static-search/relevance.mjs';
import {unpack} from '../prototype/static-search/unpack.mjs';
import {unpack as bundledUnpack} from '../prototype/static-search/unpack-bundled.mjs';
for (const dedup of ['0','1']) test('compact indexes preserve ranking, fields, scopes and pages, dedup='+dedup,async()=>{
 const root=mkdtempSync(join(tmpdir(),'shiju-compact-'));const data=root+'/static-data',ranks=root+'/ranks';mkdirSync(data);mkdirSync(ranks);
 const write=(p,v)=>writeFileSync(p,JSON.stringify(v));const records=[];const catalog={a:{name:'甲',file:'a.json'},b:{name:'乙',file:'b.json'},small:{name:'小集',file:'small.json'}};
 try{
 for(const [k,key]of ['a','b','small'].entries()){
  const dir=data+'/source/'+key;mkdirSync(dir,{recursive:true});const rows=[],summaries=[];
  for(let i=0;i<(key==='small'?5:5100);i++){const title='其诗'+i+(key==='small'?'𠮷':''),author=i<800?'欧阳修':'张三';rows.push([title,author]);records.push({key,row:i,title,author,k});}
  for(let i=0;i<rows.length;i+=128){const name=i+'.json';summaries.push(name);write(dir+'/'+name,rows.slice(i,i+128).map(([title,author],j)=>({id:key+':'+(i+j),title,author,excerpt:'原文摘要□',notice:'保留缺文'})));}
  write(dir+'/manifest.json',{count:rows.length,size:128,summaries});write(ranks+'/'+key+'.rank',rows);
 }
 write(data+'/current.json',{version:'source',catalog});execFileSync(process.execPath,['prototype/static-search/build-metadata.mjs'],{env:{...process.env,STATIC_DATA:data,SEARCH_DATA:ranks,DEDUP_POSTINGS:dedup}});
 const requested=[];const engine=createMetadataSearch({normalize:s=>s,fetchJSON:async p=>{requested.push(p);return JSON.parse(readFileSync(root+'/'+p));}});const c=await engine.setup();assert.equal(c.format,2);assert.equal(c.chars,undefined);
 for(const scope of ['all','a','b','small'])for(const field of ['title-author','title','author'])for(const q of ['其','欧阳修','诗10','其 欧阳修','𠮷','不存在','']){
  const expected=records.filter(r=>(scope==='all'||scope===r.key)&&q.split(' ').filter(Boolean).every(w=>(field==='title'?r.title:field==='author'?r.author:r.title+' '+r.author).includes(w))).sort((a,b)=>{if(!q)return 0;const x=relevance(a.title,a.author,q),y=relevance(b.title,b.author,q);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];});
  for(const offset of [0,20,40,250,expected.length]){const result=await engine.search({q,scope,field,offset});assert.equal(result.total,expected.length);assert.deepEqual(result.items.map(p=>p.id),expected.slice(offset,offset+40).map(p=>p.key+':'+p.row));}
 }
 const coldRequests=[];const cold=createMetadataSearch({normalize:s=>s,fetchJSON:async p=>{coldRequests.push(p);return JSON.parse(readFileSync(root+'/'+p));}});
 await cold.search({q:'欧阳修',scope:'a',field:'author'});
 assert.ok(!coldRequests.some(p=>p.endsWith(c.charsFile)),'scoped search never downloads global directory');
 const directory=unpack(JSON.parse(readFileSync(data+'/'+c.version+'/'+c.scopeIndexes.a)));
 const candidates=unpack(JSON.parse(readFileSync(data+'/'+c.version+'/'+directory['欧'][1])));assert.ok([...postingRows(candidates)].some(r=>r[0]===0));
 const authors=unpack(JSON.parse(readFileSync(data+'/'+c.version+'/'+c.authorCharsFile))); const authorCandidates=unpack(JSON.parse(readFileSync(data+'/'+c.version+'/'+authors['欧'][1]))); assert.ok([...postingRows(authorCandidates)].every(r=>r[3].includes('欧')));
 coldRequests.length=0;await cold.search({q:'其',scope:'all'});assert.ok(!coldRequests.some(p=>p.includes('/source/')),'hot first page uses bundled summaries');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('packed Unicode payload decodes without native DecompressionStream, and corrupt data rejects',()=>{
 const value=[['渔間𠮷□',42]],packed={encoding:'gzip-base64-v1',data:gzipSync(JSON.stringify(value)).toString('base64')};
 assert.deepEqual(unpack(packed),value);assert.deepEqual(bundledUnpack(packed),value);assert.throws(()=>unpack({...packed,data:'broken'}));
});
test('legacy uncompressed metadata remains searchable with the new reader',async()=>{
 const files={
  'static-data/metadata-current.json':{version:'old',sourceVersion:'source',keys:['a'],catalog:{a:{name:'甲'}},counts:{a:1},chars:{山:[1,'山.json']}},
  'static-data/old/山.json':[[0,0,'山居','王维']],
  'static-data/source/a/manifest.json':{size:128,summaries:['p.json']},
  'static-data/source/a/p.json':[{id:'a:0',title:'山居',author:'王维'}],
 };
 const engine=createMetadataSearch({normalize:s=>s,fetchJSON:async p=>{assert.ok(files[p],p);return files[p];}});
 const result=await engine.search({q:'山'});assert.equal(result.total,1);assert.equal(result.items[0].id,'a:0');
});
