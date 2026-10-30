import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createStore} from '../dist/modules/storage.js';
import {initReleaseUpdate} from '../prototype/static-search/release-update.mjs';
const source={title:'自定义□',author:'作者',text:'山□水\n月',notice:'第 1–2 段'};
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('checkpoint preserves custom text, gaps, source IDs, title, signature and saved poems across refresh',()=>{
 const storage=memory(),a=createStore(source,storage);
 a.model.state={source,tokens:[{id:0,c:'山'},{id:1,c:'□'},{id:null,c:'\n'}],title:'题目',signature:'署名'};
 a.saveCollection([{...a.model.state,id:123}]);
 // A different tab saved another poem; checkpoint must not overwrite it.
 const more=[...a.model.saved,{...a.model.state,id:456}];storage.setItem('shiju-collection',JSON.stringify(more));
 a.checkpoint();const b=createStore({},storage);
 assert.deepEqual(b.model.state,a.model.state);assert.deepEqual(b.model.saved,more);
});
test('update notice is explicit; no automatic reload; save failure prevents navigation',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://example.test/shiju/',pretendToBeVisual:true}),win=dom.window;
 let version='a'.repeat(16),reloads=0,fail=false,fetches=0;
 const ui=initReleaseUpdate({store:{checkpoint(){if(fail)throw Error('quota');}},document:win.document,window:win,currentRuntime:version,manifestURL:'https://example.test/shiju/release.json',fetcher:async()=>{fetches++;return {ok:true,json:async()=>({runtime:version})};},reload:()=>reloads++});
 await new Promise(r=>setImmediate(r));assert.equal(win.document.querySelector('aside').hidden,true);
 version='b'.repeat(16);await ui.check();assert.equal(reloads,0);assert.equal(win.document.querySelector('aside').hidden,false);
 fail=true;win.document.querySelector('button').click();assert.equal(reloads,0);assert.match(win.document.body.textContent,/未能确认/);
 fail=false;win.document.querySelector('button').click();assert.equal(reloads,1);
 ui.dispose();await ui.check();assert.equal(fetches,2);win.close();
});
test('offline or malformed manifest does not suggest an update; modal notice remains reachable',async()=>{
 const dom=new JSDOM('<body><dialog open></dialog></body>',{pretendToBeVisual:true}),win=dom.window;
 let result='offline';const ui=initReleaseUpdate({store:{checkpoint(){}},document:win.document,window:win,currentRuntime:'a'.repeat(16),fetcher:async()=>{if(result==='offline')throw Error('offline');return {ok:true,json:async()=>({runtime:result})};}});
 await new Promise(r=>setImmediate(r));assert.equal(win.document.querySelector('aside').hidden,true);
 result='bad';await ui.check();assert.equal(win.document.querySelector('aside').hidden,true);
 result='b'.repeat(16);await ui.check();assert.ok(win.document.querySelector('dialog aside'));
 win.document.querySelector('dialog').removeAttribute('open');await ui.check();assert.equal(win.document.querySelector('aside').parentElement,win.document.body);
 ui.dispose();win.close();
});
test('blocked storage, silent discarded writes and corrupt collection stop checkpoint',()=>{
 for(const storage of [{getItem:()=>null,setItem:()=>{throw Error('blocked');}},{getItem:()=>null,setItem:()=>{}}])assert.throws(()=>createStore(source,storage).checkpoint());
 const storage=memory();storage.setItem('shiju-collection','bad');assert.throws(()=>createStore(source,storage).checkpoint());
});
test('formal build rejects compatibility retirement before writing output',async()=>{
 const {execFileSync}=await import('node:child_process');
 const {mkdtempSync,existsSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'shiju-retire-guard-'));
 try {
   const env={...process.env,RELEASE_LEGACY_MODE:'retire-preview',RELEASE_OUT:root+'/site'};
   delete env.RELEASE_PREVIEW_BODY_BASE;
   assert.throws(()=>execFileSync(process.execPath,['scripts/build-release.mjs'],{env,stdio:'pipe'}),/local-preview only/);
   assert.equal(existsSync(root+'/site'),false);
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('formal pinned policy rejects corrupted compatibility inventory before creating output',async()=>{
 const {execFileSync}=await import('node:child_process');
 const {mkdtempSync,writeFileSync,existsSync,rmSync,mkdirSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'shiju-policy-'));
 try {
   const runtime='a'.repeat(16),folder='compatibility/'+runtime;
   mkdirSync(root+'/'+folder,{recursive:true});
   writeFileSync(root+'/'+folder+'/inventory.json','{}');
   writeFileSync(root+'/compatibility-policy.json',JSON.stringify({schema:1,mode:'retain-current',retiredLegacy:'e231436',retainedRuntime:runtime,retainedDirectory:folder,inventory:folder+'/inventory.json',inventorySha256:'0'.repeat(64)}));
   const env={...process.env,RELEASE_DATA_DIR:root,RELEASE_OUT:root+'/site'};
   delete env.RELEASE_LEGACY_MODE; delete env.RELEASE_RETAIN_SITE;
   assert.throws(()=>execFileSync(process.execPath,['scripts/build-release.mjs'],{env,stdio:'pipe'}),/Compatibility inventory mismatch/);
   assert.equal(existsSync(root+'/site'),false);
 } finally {rmSync(root,{recursive:true,force:true});}
});
