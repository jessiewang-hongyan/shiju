// Assemble deployable data plus an immutable snapshot of the supported prior runtime.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,cpSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [inputArg,priorArg,inventoryArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: DATA PREVIOUS_SITE PREVIOUS_INVENTORY NEW_OUTPUT');
const input=resolve(inputArg),prior=resolve(priorArg),out=resolve(outArg),read=p=>JSON.parse(readFileSync(p));
mkdirSync(out,{recursive:true});assert.ok(readdirSync(out).every(f=>f==='.git'),'Output must be empty apart from .git');
for(const name of ['bodies','static-data','licenses','body-inventory.json','source-catalog-inventory.json','import-audit.json'])cpSync(input+'/'+name,out+'/'+name,{recursive:true});
const release=read(prior+'/release.json'),inventory=read(resolve(inventoryArg));
assert.equal(inventory.version,release.runtime);assert.match(release.runtime,/^[a-f0-9]{16}$/);
const folder='compatibility/'+release.runtime,files=[];
for(const f of inventory.files)if((f.path.startsWith('static-data/')&&!['static-data/current.json','static-data/metadata-current.json'].includes(f.path))||f.path.startsWith(release.modules+'/')||f.path===`app-${release.runtime}.js`||f.path===`style-${release.runtime}.css`||f.path==='release.json'){
 const raw=readFileSync(prior+'/'+f.path);assert.equal(createHash('sha256').update(raw).digest('hex'),f.sha256);
 const destination=out+'/'+folder+'/'+f.path;mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,raw);files.push(f);
}
const raw=JSON.stringify({runtime:release.runtime,files});writeFileSync(out+'/'+folder+'/inventory.json',raw);
writeFileSync(out+'/compatibility-policy.json',JSON.stringify({schema:1,mode:'retain-current',retiredLegacy:'e231436',retainedRuntime:release.runtime,retainedDirectory:folder,inventory:folder+'/inventory.json',inventorySha256:createHash('sha256').update(raw).digest('hex'),sourceApplicationCommit:'bc2917bc829afa4b9c21afef3cd29fb17dbb76b1',sourceData:release.data},null,2));
cpSync('release-artifacts/ming-qing-input/search-fixtures.json',out+'/search-fixtures.json');
writeFileSync(out+'/README.md','# 拾句数据：迁移候选\n\n本提交是候选数据，不代表网页已部署。包含 22 库及明、清、明末清初新增内容，篇名／作者静态索引采用分片内去重。正文按 SHA-256 寻址。\n\ncompatibility-policy.json 固定暂时支持的旧页面资源，来源应用提交和旧正文 pin 见该文件。来源许可见 licenses/；保留原库文字、缺文和原有记录，不增补近现代作品。\n');
console.log(JSON.stringify({out,retainedRuntime:release.runtime,retainedFiles:files.length,inventorySha256:createHash('sha256').update(raw).digest('hex')}));
