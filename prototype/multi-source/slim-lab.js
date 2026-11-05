const frame=document.querySelector('iframe'),rep=document.querySelector('#report');
document.querySelector('#run').onclick=async e=>{
 e.target.disabled=true;const rows=[];try{
 await fetch('/switch',{method:'POST',body:'rc'});const loaded=new Promise(r=>frame.addEventListener('load',r,{once:true}));frame.src='/shiju/';await loaded;
 const release=await(await fetch('/shiju/release.json')).json();if(release.compatibilityMode!=='local-retirement-audit')throw Error('不是精简候选');
 const {staticRequest}=await import('/shiju/'+release.modules+'/search/transport.mjs');
 const req=async path=>(await staticRequest(path)).json();
 const samples=await(await fetch('/slim-cases.json')).json();const catalog=await req('/api/catalog');
 if(catalog.collections.length!==samples.length||catalog.collections.some(c=>!samples.some(s=>s.key===c.key)))throw Error('文集范围不一致');
 for(const s of samples){const row={name:s.name,key:s.key,title:s.title,id:s.id};rows.push(row);
 try{const search=await req('/api/search?'+new URLSearchParams({scope:s.key,field:'title',q:s.title,limit:'40'}));row.hits=search.total;
 if(!search.items.some(v=>v.id===s.id)||search.items.some(v=>!v.id.startsWith(s.key+':')))throw Error('错库或缺少目标');
 const {poem}=await req('/api/poems/'+encodeURIComponent(s.id)+'?version='+search.version);row.codePoints=Array.from(poem.text).length;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(poem.text))),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==s.hash||(poem.title||poem.label)!==s.title||!row.codePoints)throw Error('题目或正文不符');row.pass=true;
 }catch(err){row.error=String(err)}rep.textContent=JSON.stringify(rows,null,2);}
 }catch(err){rows.push({error:String(err)})}rep.textContent=JSON.stringify({rows,finished:true},null,2)
};
document.querySelector('#regression').onclick=async()=>{
 const out=document.querySelector('#regression-report'),rows=[],$=s=>frame.contentDocument.querySelector(s);
 const wait=async(fn)=>{const start=Date.now();while(Date.now()-start<20000){if(fn())return;await new Promise(r=>setTimeout(r,50))}throw Error('等待超时')};
 const state=()=>({title:$('#poem-title').value,poem:$('#new-poem').textContent,origins:[...frame.contentDocument.querySelectorAll('#new-poem [data-origin]')].map(e=>e.dataset.origin),tabs:$('#source-tabs').textContent});
 const input=(s,v)=>{const el=$(s);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
 const capture=async(selector)=>{const p=frame.contentWindow.HTMLAnchorElement.prototype,old=p.click;try{return await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('下载未生成')),20000);p.click=function(){clearTimeout(t);resolve(this.href)};$(selector).click()})}finally{p.click=old}};
 try{
 const before=state();if(before.origins.length<2)throw Error('需先准备多原文');
 const raw=await(await fetch(await capture('#backup-download'))).text();const parsed=JSON.parse(raw);
 rows.push({step:'完整备份',sources:parsed.record.workspace.draft.sources.length});
 input('#poem-title','恢复前临时标题');await new Promise(r=>setTimeout(r,600));
 const win=frame.contentWindow,dt=new win.DataTransfer();dt.items.add(new win.File([raw],'backup.json',{type:'application/json'}));
 $('#backup-restore').files=dt.files;$('#backup-restore').dispatchEvent(new win.Event('change'));
 await wait(()=>$('#backup-choice').open);$('#backup-item').value='';$('#backup-choice button[value=use]').click();
 await wait(()=>$('.confirm-work[open]'));$('.confirm-work button:last-child').click();
 await wait(()=>$('#poem-title')?.value===before.title&&$('#save-status')?.textContent.includes('已保存'));
 if(JSON.stringify(state())!==JSON.stringify(before))throw Error('恢复不一致');
 rows.push({step:'完整工作区恢复',pass:true,state:state()});
 $('#colors-open').click();await wait(()=>$('#multi-target'));
 for(const [mode,label] of [['poem','仅集句'],['source','指定原文']]){
 const select=$('#multi-target');const option=[...select.options].find(o=>o.textContent.includes(label));if(!option)throw Error('缺少导出模式');
 input('#multi-target',option.value);
 if(mode==='source')input('#preview-source',$('#preview-source').options[1].value);
 const url=await capture('#colors-export'),blob=await(await fetch(url)).blob();
 const img=new Image();img.src=URL.createObjectURL(blob);await img.decode();
 img.style.maxWidth='650px';document.querySelector('#images').append(img);
 const a=document.createElement('a');a.href=img.src;a.download=mode+'.png';a.textContent=label+' PNG';document.querySelector('#images').append(a);
 rows.push({step:label+' PNG',type:blob.type,bytes:blob.size,width:img.naturalWidth,height:img.naturalHeight,pass:blob.type==='image/png'&&img.naturalWidth>0});
 }
 }catch(e){rows.push({error:String(e)})}out.textContent=JSON.stringify({rows,finished:true},null,2)
};
