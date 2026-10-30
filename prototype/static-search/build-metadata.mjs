import { dictionaryPosting } from './posting-codec.mjs';
import { unpack } from './unpack.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { relevance } from './relevance.mjs';
import { createHash } from 'node:crypto';
const root = process.env.STATIC_DATA || '/tmp/shiju-static-search';
const source = JSON.parse(readFileSync(root + '/current.json'));
const deduplicate = process.env.DEDUP_POSTINGS === '1';
const version = createHash('sha256').update(source.version).update(String(deduplicate)).update(readFileSync(new URL('./posting-codec.mjs', import.meta.url))).update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0,20);
const base=root+'/'+version;mkdirSync(base,{recursive:true});
const keys=Object.keys(source.catalog),entries=[],postings=new Map(),counts={},scoped=Object.fromEntries(keys.map(k=>[k,{}]));
for(const [k,key] of keys.entries()){
 const rows=JSON.parse(readFileSync((process.env.SEARCH_DATA||'/tmp/shiju-search-normalized')+'/'+source.catalog[key].file.replace('.json','.rank')));
 counts[key]=rows.length;
 rows.forEach(([title,author],row)=>{const id=entries.length;entries.push([k,row,title,author]);for(const char of new Set(title+author)){if(/\s/u.test(char))continue;if(!postings.has(char))postings.set(char,[]);postings.get(char).push(id);}});
}
let bytes=0;const saved=new Set();
function save(data,packed=true,preferredName){
 function encode(value) {
  let raw=JSON.stringify(value);
  if(packed && Buffer.byteLength(raw)>512){const encoded=JSON.stringify({encoding:'gzip-base64-v1',data:gzipSync(raw,{level:9}).toString('base64')});if(encoded.length<Buffer.byteLength(raw))raw=encoded;}
  return raw;
 }
 let raw=encode(data);
 if(deduplicate && Array.isArray(data) && data.length && Array.isArray(data[0]) && data[0].length===4 && typeof data[0][2]==='string') {
  for(const titles of [false,true]) { const candidate=encode(dictionaryPosting(data,titles)); if(Buffer.byteLength(candidate)<Buffer.byteLength(raw))raw=candidate; }
 }
 const file=preferredName || createHash('sha256').update(raw).digest('hex').slice(0,20)+'.json';
 if(!saved.has(file)){writeFileSync(base+'/'+file,raw);bytes+=Buffer.byteLength(raw);saved.add(file);}return file;
}
const chars={},authorChars={},hot={},summaryCache=new Map();
function summary([k,row]){
 const key=keys[k],dir=root+'/'+source.version+'/'+key+'/';
 let collection=summaryCache.get(key);
 if(!collection){const m=JSON.parse(readFileSync(dir+'manifest.json'));collection=m.summaries.flatMap(f=>unpack(JSON.parse(readFileSync(dir+f)))).map(({body,...p})=>p);summaryCache.set(key,collection);}
 return collection[row];
}
for(const [char,ids] of postings){
 const rows=ids.map(i=>entries[i]);const file=save(rows,true,'p-'+char.codePointAt(0).toString(16)+'.json');chars[char]=[ids.length,file];
 const authorRows=rows.filter(row=>row[3].includes(char));
 if(authorRows.length)authorChars[char]=[authorRows.length,save(authorRows,true,'a-'+char.codePointAt(0).toString(16)+'.json')];
 const byCollection=new Map();for(const row of rows){if(!byCollection.has(row[0]))byCollection.set(row[0],[]);byCollection.get(row[0]).push(row);}
 for(const [k,subset]of byCollection)scoped[keys[k]][char]=[subset.length,rows.length>1000&&subset.length<=rows.length*0.1?save(subset):file];
 if(ids.length>=10000){
  const ordered=rows.slice().sort((a,b)=>{const x=relevance(a[2],a[3],char),y=relevance(b[2],b[3],char);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];});
  const manifest={size:256,fields:{}};
  for(const field of ['title-author','title','author']){
   const byScope={all:[]};for(const key of keys)byScope[key]=[];
   for(const [k,row,title,author]of ordered){if(field==='title'&&!title.includes(char)||field==='author'&&!author.includes(char))continue;byScope.all.push([k,row]);byScope[keys[k]].push([k,row]);}
   const scopes={};for(const [scope,selected]of Object.entries(byScope)){const files=[];for(let i=0;i<selected.length;i+=256)files.push(save(selected.slice(i,i+256)));scopes[scope]={count:selected.length,files,preview:save(selected.slice(0,40).map(summary))};}manifest.fields[field]=scopes;
  }
  hot[char]=save(manifest);
 }
}
const charsFile=save(chars),authorCharsFile=save(authorChars),scopeIndexes=Object.fromEntries(keys.map(k=>[k,save(scoped[k])]));
const charCounts=Object.fromEntries(Object.entries(chars).map(([ch,v])=>[ch,v[0]])),authorCharCounts=Object.fromEntries(Object.entries(authorChars).map(([ch,v])=>[ch,v[0]]));
const config={format:2,...(deduplicate?{postingEncoding:"local-dictionary-v1"}:{}),charCounts,authorCharCounts,version,sourceVersion:source.version,catalog:source.catalog,keys,counts,charsFile,authorCharsFile,scopeIndexes,hot,bytes};
writeFileSync(base+'/catalog.json',JSON.stringify(config));writeFileSync(root+'/metadata-current.json',JSON.stringify(config));
console.log(JSON.stringify({version,records:entries.length,files:saved.size,bytes}));
