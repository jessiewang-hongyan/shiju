import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {unpack} from '../prototype/static-search/unpack.mjs';
import {postingRows} from '../prototype/static-search/posting-codec.mjs';
const [before,after,output]=process.argv.slice(2),read=p=>JSON.parse(readFileSync(p));
const ca=read(before+'/static-data/metadata-current.json'),cb=read(after+'/static-data/metadata-current.json');
assert.deepEqual(cb.keys,ca.keys);assert.deepEqual(cb.counts,ca.counts);
const a=before+'/static-data/'+ca.version+'/',b=after+'/static-data/'+cb.version+'/';
const decode=(root,file)=>unpack(read(root+file));
const pairs=new Set(),formats={}, stats={files:0,entries:0,beforeBytes:0,afterBytes:0};
function compareFile(fa,fb) {
 const id=fa+':'+fb;if(pairs.has(id))return;pairs.add(id);
 const old=decode(a,fa), current=decode(b,fb), iterator=postingRows(current);
 for(const expected of old){assert.deepEqual(iterator.next().value,expected);stats.entries++;}
 assert.equal(iterator.next().done,true);
 stats.files++;stats.beforeBytes+=readFileSync(a+fa).length;stats.afterBytes+=readFileSync(b+fb).length;
 const format=Array.isArray(current)?'rows':current.posting;formats[format]=(formats[format]||0)+1;
}
function compareDirectory(da,db){assert.deepEqual(Object.keys(db),Object.keys(da));for(const ch of Object.keys(da)){assert.equal(da[ch][0],db[ch][0]);compareFile(da[ch][1],db[ch][1]);}}
compareDirectory(decode(a,ca.charsFile),decode(b,cb.charsFile));
compareDirectory(decode(a,ca.authorCharsFile),decode(b,cb.authorCharsFile));
for(const key of ca.keys)compareDirectory(decode(a,ca.scopeIndexes[key]),decode(b,cb.scopeIndexes[key]));
assert.deepEqual(cb.hot,ca.hot); // Hot pages and first-page summaries remain content-identical.
const result={passed:true,...stats,formats};writeFileSync(output,JSON.stringify(result,null,2));console.log(result);
