// Each case gets an isolated Node process; maxRSS includes transient allocations.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [mode, ...args] = process.argv.slice(2);
if (mode === '--case') {
  const [siteArg, queryJSON] = args, site = resolve(siteArg), query=JSON.parse(queryJSON);
  const release=JSON.parse(readFileSync(site+'/release.json'));
  const moduleRoot=site+'/'+release.modules+'/search/';
  const {createMetadataSearch}=await import(pathToFileURL(moduleRoot+'metadata-engine.mjs'));
  const {normalize}=await import(pathToFileURL(moduleRoot+'search-converter.mjs'));
  let requests=0, rawBytes=0;
  const engine=createMetadataSearch({normalize,fetchJSON:async path=>{requests++;const raw=readFileSync(site+'/'+path);rawBytes+=raw.length;return JSON.parse(raw);}});
  global.gc();const before=process.memoryUsage();
  const start=performance.now();const result=await engine.search(query);const coldMs=performance.now()-start;
  const after=process.memoryUsage();global.gc();const retained=process.memoryUsage();
  const coldRequests=requests, coldBytes=rawBytes;
  const warmStart=performance.now();const warm=await engine.search(query);const warmMs=performance.now()-warmStart;
  assert.deepEqual(warm,result);
  console.log(JSON.stringify({query,total:result.total,ids:result.items.map(x=>x.id),coldMs,warmMs,coldRequests,coldBytes,warmRequests:requests-coldRequests,before,after,retained,maxRSSBytes:process.resourceUsage().maxRSS*1024}));
} else {
  const [baseline,candidate,output]=[mode,...args];
  if(!output)throw Error('Usage: BASELINE_SITE CANDIDATE_SITE OUTPUT');
  const cases=[{q:'赤壁赋',scope:'all',field:'title-author'},{q:'歐陽修',scope:'song-era',field:'author'},{q:'其',scope:'all',field:'title-author'},{q:'其一',scope:'all',field:'title'},{q:'唐寅',scope:'ming-era',field:'author'},{q:'山',scope:'all',field:'title'}];
  const rows=[];
  for(const query of cases)for(let run=1;run<=3;run++){
    const pair={query,run};
    for(const [name,site] of [['baseline',baseline],['candidate',candidate]])pair[name]=JSON.parse(execFileSync(process.execPath,['--expose-gc',process.argv[1],'--case',site,JSON.stringify(query)],{maxBuffer:1e7}));
    assert.equal(pair.baseline.total,pair.candidate.total);assert.deepEqual(pair.baseline.ids,pair.candidate.ids);
    rows.push(pair);
  }
  writeFileSync(output,JSON.stringify({note:'Isolated Node processes, local files, no network. RSS includes runtime; retained heap after GC includes decoded string cache. Not mobile browser memory.',rows},null,2));console.log('Memory and result comparison passed:',rows.length);
}
