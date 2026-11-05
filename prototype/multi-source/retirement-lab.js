const frame=document.querySelector('iframe'),report=document.querySelector('#report'),$=s=>frame.contentDocument.querySelector(s);
const wait=async(fn,msg)=>{const start=Date.now();while(Date.now()-start<18000){if(fn())return;await new Promise(r=>setTimeout(r,50))}throw Error('超时：'+msg)};
async function change(mode){if(!(await fetch('/switch',{method:'POST',body:mode})).ok)throw Error('切换失败')}
const fresh=async()=>{const p=new Promise(r=>frame.addEventListener('load',r,{once:true}));frame.src='/shiju/';await p;await wait(()=>$('#source-poem button'),'启动')};
const input=(s,value,event='input')=>{const el=$(s);el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}))};
const title=()=>$('#poem-title').value,poem=()=>$('#new-poem').textContent;
const search=async()=>{$('#choose').click();input('#search','关雎');input('#library-scope','shijing','change');await wait(()=>$('#poem-list .poem-choice b')?.textContent.includes('关雎')||!$('#library-retry').hidden,'搜索');return $('#poem-list .poem-choice b')?.textContent||$('#library-status').textContent};
const cleared=()=>!$('#library-retry').hidden;
document.querySelector('#run').onclick=async e=>{e.target.disabled=true;const rows=[];const log=(action,observation)=>{rows.push({action,observation});report.textContent=JSON.stringify(rows,null,2)};const assert=(x,m)=>{if(!x)throw Error(m)};
try{
// Older generation has no notifier. Test cold Worker requests in an already-loaded document.
await change('earlier');await fresh();$('#source-poem button').click();input('#poem-title','早期草稿');const original=poem();await change('rc');
const err=await search();assert(cleared(),'本应缺少旧索引');log('15a 常驻页面切包后的首次搜索',err);$('#picker').close();
await fresh();await wait(()=>$('#save-status')?.textContent.includes('已保存'),'旧页升级');assert(title()==='早期草稿'&&poem()===original,'早期草稿丢失');log('15a 手动刷新到二期','原题和已摘字保留');
// Return to actual previous production archive and keep its page alive across the next switch.
await change('old');await fresh();input('#poem-title','当前一期在途');await change('rc');
const hit=await search();assert(!cleared()&&hit.includes('关雎'),'7aa 旧页搜索失败');log('7aa 常驻页面切包后搜索',hit);$('#picker').close();frame.contentWindow.dispatchEvent(new Event('focus'));
const aside=()=>$('aside[aria-label="页面更新"]');await wait(()=>aside()&&!aside().hidden,'更新提示');assert(title()==='当前一期在途','意外刷新');log('旧页提示更新','保留编辑，不自动刷新');
aside().querySelector('button').click();await wait(()=>$('#save-status')?.textContent.includes('已保存'),'保存并更新');await wait(()=>$('#legacy-changed')&&!$('#legacy-changed').hidden,'识别旧页修改');log('保存并更新','二期保留原草稿，并识别新的旧版修改');$('#import-legacy').click();await wait(()=>$('#legacy-changed').hidden,'导入');
input('#poem-title','二期回退检查');await wait(()=>$('#save-status').textContent.includes('已保存'),'二期落盘');
assert((await search()).includes('关雎')&&!cleared(),'候选索引失败');$('#picker').close();log('精简候选搜索','关雎');
await change('old');await fresh();assert(title()==='当前一期在途','保存并更新未落盘');assert((await search()).includes('关雎')&&!cleared(),'回退包搜索失败');$('#picker').close();log('独立一期归档回退','旧草稿及搜索恢复');
const restored=await fetch('/shiju/static-data/config-92e9af008a108b43e4b9.json');assert(restored.ok,'旧配置未恢复');
await change('rc');await fresh();await wait(()=>$('#save-status')?.textContent.includes('已保存'),'再升级');assert(title()==='二期回退检查','二期草稿丢失');assert((await fetch('/shiju/static-data/config-92e9af008a108b43e4b9.json')).status===404,'候选误带旧配置');log('再升级','二期草稿恢复，旧配置回退包 200／候选 404');
}catch(error){log('验收错误',String(error))}
report.textContent=JSON.stringify({rows,finished:true},null,2)};
