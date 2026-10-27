const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const app=readFileSync('dist/app.js','utf8');
const loader=app.slice(app.indexOf('const libraryCatalog='),app.indexOf("$('#help').onclick"));
const poem=n=>({title:n,author:'作者',text:'原文'});
let active=0,peak=0,broken=true,requests=[],snapshots=[];
const scope={value:'tang'};
const sandbox={AbortController,console,Map,Set,Promise,
 setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?1000:1),clearTimeout,
 $:()=>scope,renderLibrary:()=>snapshots.push(vm.runInContext("libraryCache.get('tang')?.length||0",context)),
 fetch:async(url,{signal})=>{requests.push(url);active++;peak=Math.max(peak,active);
  try{await new Promise(r=>setTimeout(r,2));
   if(broken&&url.endsWith('/b.json'))throw new Error('offline');
   return {ok:true,json:async()=>url.endsWith('manifest.json')?[{file:'a.json',count:1},{file:'b.json',count:1}]:[poem(url)]};
  }finally{active--}
 }
};
const context=vm.createContext(sandbox);vm.runInContext(loader,context);
(async()=>{
 await vm.runInContext('Promise.all([loadLibrary(),loadLibrary()])',context);
 assert.equal(vm.runInContext("libraryCache.get('tang').length",context),1);
 assert.equal(vm.runInContext("libraryErrors.has('tang')",context),true);
 assert.equal(requests.filter(u=>u.endsWith('/a.json')).length,1);
 assert.equal(requests.filter(u=>u.endsWith('/b.json')).length,3);
 assert(snapshots.includes(1),'partial results must be visible');
 broken=false;await vm.runInContext('loadLibrary()',context);
 assert.equal(vm.runInContext("libraryCache.get('tang').length",context),2);
 assert.equal(vm.runInContext("libraryComplete.has('tang')",context),true);
 assert.equal(requests.filter(u=>u.endsWith('/a.json')).length,1,'retry preserves successful batch');
 await vm.runInContext('loadLibrary()',context);
 assert.equal(requests.filter(u=>u.endsWith('/b.json')).length,4,'complete collection is cached');
 scope.value='all';await vm.runInContext('loadLibrary()',context);
 assert.equal(peak,2,'global concurrency bounded at two');
 assert.equal(vm.runInContext('libraryComplete.size',context),8);
 assert.equal(vm.runInContext('libraryErrors.size',context),0);
 console.log('PASS: partial results, auto/manual retry, deduplication, caching, all 8 collections and global concurrency (without AbortSignal.timeout)');
})().catch(e=>{console.error(e);process.exitCode=1});
