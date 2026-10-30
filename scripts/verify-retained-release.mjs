import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
const [oldArg,siteArg,dataArg,report]=process.argv.slice(2),old=resolve(oldArg),site=resolve(siteArg),data=resolve(dataArg);
const read=p=>JSON.parse(readFileSync(p));
const oldRelease=read(old+'/release.json'),release=read(site+'/release.json');
assert.equal(release.retainedRuntime,oldRelease.runtime);
const inventory=read(process.env.RETAINED_INVENTORY || 'release-artifacts/production-inventory.json');
assert.equal(inventory.version || inventory.runtime,oldRelease.runtime);
let retainedFiles=0,retainedBytes=0;
for(const f of inventory.files)if((f.path.startsWith('static-data/')&&!['static-data/current.json','static-data/metadata-current.json'].includes(f.path))||f.path.startsWith(oldRelease.modules+'/')||f.path===`app-${oldRelease.runtime}.js`||f.path===`style-${oldRelease.runtime}.css`){
 const bytes=readFileSync(site+'/'+f.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,f.path);retainedFiles++;retainedBytes+=bytes.length;
}
const root=site+'/'+oldRelease.modules+'/search/';
const {createMetadataSearch}=await import(pathToFileURL(root+'metadata-engine.mjs'));
const {normalize}=await import(pathToFileURL(root+'search-converter.mjs'));
const {createRemoteReader}=await import(pathToFileURL(root+'remote-reader.mjs'));
const base=`https://raw.githubusercontent.com/${oldRelease.data.repository}/${oldRelease.data.commit}/bodies/`;
const reader=createRemoteReader({cryptoAPI:webcrypto,cacheStorage:undefined,fetcher:async url=>{assert.ok(url.startsWith(base));return new Response(readFileSync(data+'/bodies/'+url.slice(base.length)));}});
const engine=createMetadataSearch({normalize,fetchJSON:async p=>read(site+'/'+p),fetchDetail:reader});
const results=[];
for(const [q,scope,field,count]of [['赤壁赋','all','title-author',62],['赤壁賦','all','title',62],['其','all','title-author',144468],['歐陽修','song-era','author',1253]]){
 const found=await engine.search({q,scope,field});assert.equal(found.total,count);const poem=await engine.poem(found.items[0].id,found.version);assert.ok(poem.text);results.push({q,total:found.total,opened:found.items[0].id});
}
const result={passed:true,retainedRuntime:oldRelease.runtime,retainedFiles,retainedBytes,results,note:'Exact saved production assets, old engine running against candidate paths; pinned body requests mapped to locally verified bodies.'};writeFileSync(report,JSON.stringify(result,null,2));console.log(result);
