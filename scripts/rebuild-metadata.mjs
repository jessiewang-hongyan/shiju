// Rebuild title/author indexes in a fresh candidate, retaining immutable body IDs.
import {readFileSync,writeFileSync,mkdirSync,cpSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const [inputArg,outArg]=process.argv.slice(2),input=resolve(inputArg),out=resolve(outArg);
const read=p=>JSON.parse(readFileSync(p)),save=(p,v)=>writeFileSync(p,JSON.stringify(v));
const c=read(input+'/static-data/metadata-current.json');mkdirSync(out,{recursive:false});mkdirSync(out+'/static-data');
for(const name of ['bodies','ranks','licenses','body-inventory.json','import-audit.json','source-catalog-inventory.json'])cpSync(input+'/'+name,out+'/'+name,{recursive:true});
cpSync(input+'/static-data/'+c.sourceVersion,out+'/static-data/'+c.sourceVersion,{recursive:true});
save(out+'/static-data/current.json',{version:c.sourceVersion,catalog:c.catalog});
execFileSync(process.execPath,['--max-old-space-size=4096','prototype/static-search/build-metadata.mjs'],{stdio:'inherit',env:{...process.env,STATIC_DATA:out+'/static-data',SEARCH_DATA:out+'/ranks'}});
const config=read(out+'/static-data/metadata-current.json');
// A changed manifest must never reuse the URL seen by an already-open page.
const sourceVersion=c.sourceVersion+'-index-'+config.version;
renameSync(out+'/static-data/'+c.sourceVersion,out+'/static-data/'+sourceVersion);
config.sourceVersion=sourceVersion;
if(c.summaryEncoding) config.summaryEncoding=c.summaryEncoding;
save(out+'/static-data/metadata-current.json',config);
save(out+'/static-data/'+config.version+'/catalog.json',config);
save(out+'/static-data/current.json',{version:sourceVersion,catalog:c.catalog});
for(const key of c.keys){const p=out+'/static-data/'+sourceVersion+'/'+key+'/manifest.json',m=read(p);m.body.version=config.version;save(p,m);}
const inventory=read(out+'/body-inventory.json');inventory.indexVersion=config.version;save(out+'/body-inventory.json',inventory);
console.log(out);
