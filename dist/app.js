'use strict';
const $=s=>document.querySelector(s);
let scriptMode='original',converterPromise,scriptConverters;
function loadConverters(){
 if(!converterPromise)converterPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='vendor/opencc/opencc.js';
  script.onload=()=>{try{scriptConverters={simplified:OpenCC.Converter({from:'t',to:'cn'}),traditional:OpenCC.Converter({from:'cn',to:'t'})};resolve()}catch(e){converterPromise=null;reject(e)}};
  script.onerror=()=>{script.remove();converterPromise=null;reject(new Error('转换字典加载失败，请重试'))};document.head.append(script);
 });return converterPromise;
}
function displayText(text){
 const convert=scriptConverters?.[scriptMode];if(!convert)return text;
 const result=convert(text);
 // Retain one code point per source position, even for unexpected dictionary expansions.
 return Array.from(result).length===Array.from(text).length?result:Array.from(text).map(c=>{const value=convert(c);return Array.from(value).length===1?value:c}).join('');
}
function displayTokens(tokens){const chars=Array.from(displayText(tokens.map(t=>t.c).join('')));let offset=0;return tokens.map(t=>({...t,c:chars.slice(offset,offset+=Array.from(t.c).length).join('')}))}
$('#script-mode').onchange=async()=>{
 const control=$('#script-mode'),next=control.value;control.disabled=true;
 try{if(next!=='original')await loadConverters();scriptMode=next;render();$('#script-note').textContent=next==='original'?'保留原有字形。':'显示与图片导出同步转换；多音多义字请核对。'}catch(e){control.value=scriptMode;toast(e.message||'转换失败，请重试')}finally{control.disabled=false}
};
function syncFontNote(){$('#font-note').hidden=$('#export-font').value!=='kangxi'}
$('#export-font').onchange=()=>{syncFontNote();updateFontPreview()};
function setSourceSize(value,save=false){
 const size=Number(value);if(!Number.isInteger(size)||size<5||size>25)return;
 document.documentElement.style.setProperty('--source-size',size+'px');
 $('#source-size').value=size;$('#source-size-value').value=size;$('#source-size').setAttribute('aria-valuetext',size+' 像素');$('#source-size-minus').disabled=size===5;$('#source-size-plus').disabled=size===25;
 if(save)try{localStorage.setItem('shiju-source-size',String(size))}catch{}
}
setSourceSize(23);try{const size=localStorage.getItem('shiju-source-size');if(size!==null)setSourceSize(size)}catch{}
$('#source-size').oninput=e=>setSourceSize(e.target.value,true);
$('#source-size-reset').onclick=()=>setSourceSize(23,true);
$('#source-size-minus').onclick=()=>setSourceSize(Number($('#source-size').value)-1,true);
$('#source-size-plus').onclick=()=>setSourceSize(Number($('#source-size').value)+1,true);
$('#source-size-value').oninput=e=>{if(e.target.value!=='')setSourceSize(e.target.value,true)};
$('#source-size-value').onblur=e=>{const value=e.target.value;setSourceSize(value===''?Number($('#source-size').value):Math.max(5,Math.min(25,Math.round(Number(value)))),true)};
$('#source-size-value').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur()}};
const poems=[
 {title:'山居秋暝',author:'唐 · 王维',text:'空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。\n竹喧归浣女，莲动下渔舟。\n随意春芳歇，王孙自可留。'},
 {title:'饮酒·其五',author:'晋 · 陶渊明',text:'结庐在人境，而无车马喧。\n问君何能尔？心远地自偏。\n采菊东篱下，悠然见南山。\n山气日夕佳，飞鸟相与还。\n此中有真意，欲辨已忘言。'},
 {title:'春江花月夜（节选）',author:'唐 · 张若虚',text:'春江潮水连海平，海上明月共潮生。\n滟滟随波千万里，何处春江无月明！\n江流宛转绕芳甸，月照花林皆似霰。\n空里流霜不觉飞，汀上白沙看不见。\n江天一色无纤尘，皎皎空中孤月轮。\n江畔何人初见月？江月何年初照人？'},
 {title:'定风波·莫听穿林打叶声',author:'宋 · 苏轼',text:'莫听穿林打叶声，何妨吟啸且徐行。\n竹杖芒鞋轻胜马，谁怕？\n一蓑烟雨任平生。\n料峭春风吹酒醒，微冷，\n山头斜照却相迎。\n回首向来萧瑟处，归去，\n也无风雨也无晴。'},
 {title:'声声慢·寻寻觅觅',author:'宋 · 李清照',text:'寻寻觅觅，冷冷清清，凄凄惨惨戚戚。\n乍暖还寒时候，最难将息。\n三杯两盏淡酒，怎敌他、晚来风急！\n雁过也，正伤心，却是旧时相识。\n满地黄花堆积。憔悴损，如今有谁堪摘？\n守着窗儿，独自怎生得黑！\n梧桐更兼细雨，到黄昏、点点滴滴。\n这次第，怎一个愁字了得！'},
 {title:'短歌行',author:'魏 · 曹操',text:'对酒当歌，人生几何！\n譬如朝露，去日苦多。\n慨当以慷，忧思难忘。\n何以解忧？唯有杜康。\n青青子衿，悠悠我心。\n但为君故，沉吟至今。\n呦呦鹿鸣，食野之苹。\n我有嘉宾，鼓瑟吹笙。\n明明如月，何时可掇？\n忧从中来，不可断绝。\n越陌度阡，枉用相存。\n契阔谈讌，心念旧恩。\n月明星稀，乌鹊南飞。\n绕树三匝，何枝可依？\n山不厌高，海不厌深。\n周公吐哺，天下归心。'},
 {title:'静夜思',author:'唐 · 李白',text:'床前明月光，疑是地上霜。\n举头望明月，低头思故乡。'},
 {title:'行香子·树绕村庄',author:'宋 · 秦观',text:'树绕村庄，水满陂塘。\n倚东风、豪兴徜徉。\n小园几许，收尽春光。\n有桃花红，李花白，菜花黄。\n远远围墙，隐隐茅堂。\n飏青旗、流水桥旁。\n偶然乘兴，步过东冈。\n正莺儿啼，燕儿舞，蝶儿忙。'}
];
const isLetter=c=>/[\p{L}\p{N}]/u.test(c);
let state={source:poems[0],tokens:[],title:'',signature:''},history=[],selected=-1,dragged=-1;
let saved=[];try{saved=JSON.parse(localStorage.getItem('shiju-collection')||'[]');if(!Array.isArray(saved))saved=[];const draft=JSON.parse(localStorage.getItem('shiju-draft'));if(draft&&draft.source&&typeof draft.source.text==='string'&&Array.isArray(draft.tokens))state=draft;}catch{}
let toastTimer;function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000)}
function persist(){try{localStorage.setItem('shiju-draft',JSON.stringify(state));return true}catch{toast('浏览器存储不可用，请导出图片保存作品');return false}}
function snapshot(){history.push(JSON.stringify(state));if(history.length>100)history.shift()}
function mutate(fn){snapshot();fn();selected=-1;render();persist()}
function textOf(s=state){return s.tokens.map(t=>t.c).join('')}
function pickedCount(){return state.tokens.filter(t=>t.id!==null).length}
function render(){
 $('#source-title').textContent=displayText(state.source.title);$('#source-author').textContent=displayText(state.source.author);$('#poem-title').value=displayText(state.title);$('#signature').value=displayText(state.signature);
 const used=new Set(state.tokens.filter(t=>t.id!==null).map(t=>t.id));const root=$('#source-poem');root.replaceChildren();let line=document.createElement('div');line.className='source-line';root.append(line);
 Array.from(displayText(state.source.text)).forEach((c,id)=>{if(c==='\n'){line=document.createElement('div');line.className='source-line';root.append(line);return}if(!isLetter(c)){const el=document.createElement('span');el.className='source-punctuation';el.textContent=c;line.append(el);return}const b=document.createElement('button');b.className='char'+(used.has(id)?' picked':'');b.textContent=c;b.setAttribute('aria-label',used.has(id)?'归还：'+c:'摘取：'+c);b.title=used.has(id)?'点击归还“'+c+'”':'点击摘取“'+c+'”';b.onclick=()=>{const index=state.tokens.findIndex(t=>t.id===id);if(index>=0)removeToken(index);else mutate(()=>state.tokens.push({c:Array.from(state.source.text)[id],id}))};line.append(b)});
 const total=Array.from(state.source.text).filter(isLetter).length;$('#source-count').textContent=`${used.size} / ${total} 字已选`;$('#picked-count').textContent=`已选 ${used.size} 字`;$('#empty-hint').hidden=state.tokens.length>0;$('#undo').disabled=history.length===0;$('#clear').disabled=state.tokens.length===0;$('#saved-count').textContent=saved.length;
 const out=$('#new-poem');out.replaceChildren();displayTokens(state.tokens).forEach((t,i)=>{const el=document.createElement('span');el.className='poem-token'+(t.c==='\n'?' break-token':'')+(selected===i?' selected':'');el.textContent=t.c==='\n'?'↵':t.c===' '?'\u00a0':t.c;el.tabIndex=0;el.draggable=true;el.setAttribute('role','button');el.setAttribute('aria-label',`${t.c==='\n'?'换行':t.c}，点选调整，双击归还`);el.onclick=()=>selectToken(i);el.ondblclick=()=>removeToken(i);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectToken(i)}};el.ondragstart=e=>{dragged=i;e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move'};el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();if(dragged>=0&&dragged!==i)mutate(()=>{const t=state.tokens.splice(dragged,1)[0];state.tokens.splice(i,0,t)});dragged=-1};el.ondragend=()=>dragged=-1;out.append(el);if(t.c==='\n')out.append(document.createElement('br'))});$('#selection-tools').hidden=true;
}
function selectToken(i){selected=i;document.querySelectorAll('.poem-token').forEach((e,j)=>e.classList.toggle('selected',j===i));const el=document.querySelectorAll('.poem-token')[i];if(!el)return;const r=el.getBoundingClientRect(),bar=$('#selection-tools');bar.hidden=false;bar.style.left=Math.max(8,Math.min(innerWidth-155,r.left-40))+'px';bar.style.top=Math.max(8,r.top-50)+'px';$('#move-left').disabled=i===0;$('#move-right').disabled=i===state.tokens.length-1}
function removeToken(i){mutate(()=>state.tokens.splice(i,1))}
function moveToken(delta){if(selected<0||selected+delta<0||selected+delta>=state.tokens.length)return;const a=selected,b=a+delta;mutate(()=>{[state.tokens[a],state.tokens[b]]=[state.tokens[b],state.tokens[a]]});selectToken(b)}
$('#move-left').onclick=()=>moveToken(-1);$('#move-right').onclick=()=>moveToken(1);$('#return-char').onclick=()=>{if(selected>=0)removeToken(selected)};
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('#undo').click()}if(selected>=0){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveToken(e.key==='ArrowLeft'?-1:1)}else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();removeToken(selected)}}});
addEventListener('scroll',()=>$('#selection-tools').hidden=true,{passive:true});addEventListener('resize',()=>$('#selection-tools').hidden=true);
$('#undo').onclick=()=>{if(history.length){state=JSON.parse(history.pop());selected=-1;render();persist()}};
$('#clear').onclick=()=>{if(state.tokens.length&&confirm('清空诗笺，并把字归还原诗？可通过撤销恢复。'))mutate(()=>state.tokens=[])};
$('#newline').onclick=()=>mutate(()=>state.tokens.push({c:'\n',id:null}));$('#space').onclick=()=>mutate(()=>state.tokens.push({c:' ',id:null}));
$('#punctuation').onclick=()=>{const options=['，','。','、','？','！','；','：','——','……'];const menu=document.createElement('dialog');menu.className='punctuation-menu';const heading=document.createElement('div');heading.className='dialog-heading';heading.textContent='添加标点';const close=document.createElement('button');close.className='close';close.textContent='×';close.onclick=()=>menu.close();heading.append(close);menu.append(heading);options.forEach(c=>{const b=document.createElement('button');b.textContent=c;b.style.cssText='font-size:25px;padding:15px';b.onclick=()=>{mutate(()=>state.tokens.push({c,id:null}));menu.close()};menu.append(b)});menu.onclose=()=>menu.remove();document.body.append(menu);menu.showModal()};
for(const field of ['title','signature']){$('#'+(field==='title'?'poem-title':'signature')).addEventListener('input',e=>{state[field]=e.target.value;persist()})}
$('#today').textContent=new Date().toLocaleDateString('zh-CN').replaceAll('/','.');
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
const libraryCatalog={shijing:{name:'诗经',file:'shijing.json'},chuci:{name:'楚辞',file:'chuci.json'},'han-yuefu':{name:'汉乐府',file:'han-yuefu.json'},han:{name:'汉诗',file:'han.json'},weijin:{name:'魏晋诗',file:'weijin.json'},tang:{name:'唐诗',file:'tang.json'},song:{name:'宋词',file:'song-ci.json'},yuan:{name:'元曲',file:'yuan.json'}};
const libraryCache=new Map(),libraryPending=new Map(),libraryErrors=new Set();
const libraryComplete=new Set(),libraryManifests=new Map(),libraryParts=new Map();
let libraryLimit=40,previewPoem=null,libraryActive=0;
const libraryQueue=[];
function scopeKeys(){const scope=$('#library-scope').value;return scope==='selected'?[]:scope==='all'?Object.keys(libraryCatalog):[scope]}
function libraryRequest(task){return new Promise((resolve,reject)=>{libraryQueue.push({task,resolve,reject});pumpLibraryQueue()})}
function pumpLibraryQueue(){while(libraryActive<2&&libraryQueue.length){const job=libraryQueue.shift();libraryActive++;job.task().then(job.resolve,job.reject).finally(()=>{libraryActive--;pumpLibraryQueue()})}}
async function fetchLibraryJSON(url,valid){
 return libraryRequest(async()=>{
  for(let attempt=0;attempt<3;attempt++){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('load');const data=await response.json();if(!valid(data))throw new Error('format');return data}
   catch(error){if(attempt===2)throw error}
   finally{clearTimeout(timer)}
   await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
 });
}
async function loadLibraryCollection(key){
 if(libraryComplete.has(key))return;
 if(libraryPending.has(key))return libraryPending.get(key);
 libraryErrors.delete(key);
 const task=(async()=>{try{
  const base='data/parts/'+libraryCatalog[key].file.replace('.json','')+'/';
  if(!libraryManifests.has(key))libraryManifests.set(key,await fetchLibraryJSON(base+'manifest.json',data=>Array.isArray(data)&&data.length>0&&data.every(p=>/^[a-f0-9]+\.json$/.test(p.file)&&Number.isInteger(p.count)&&p.count>0)));
  const manifest=libraryManifests.get(key);
  if(!libraryParts.has(key))libraryParts.set(key,new Map());
  const parts=libraryParts.get(key);
  // Preserve completed batches, original order and available poems on failure.
  for(let i=0;i<manifest.length;i++){
   if(parts.has(i))continue;
   const data=await fetchLibraryJSON(base+manifest[i].file,data=>Array.isArray(data)&&data.length===manifest[i].count&&data.every(p=>typeof p.title==='string'&&typeof p.author==='string'&&typeof p.text==='string'));
   parts.set(i,data);libraryCache.set(key,manifest.flatMap((_,index)=>parts.get(index)||[]));renderLibrary();
  }
  libraryComplete.add(key);
 }catch{libraryErrors.add(key)}})();
 libraryPending.set(key,task);renderLibrary();await task;libraryPending.delete(key);renderLibrary();
}
async function loadLibrary(){await Promise.all(scopeKeys().map(loadLibraryCollection));renderLibrary()}
$('#help').onclick=()=>$('#help-dialog').showModal();$('#choose').onclick=()=>{$('#picker').showModal();renderLibrary();loadLibrary()};
$('#library-retry').onclick=loadLibrary;
$('#library-scope').onchange=()=>{libraryLimit=40;renderLibrary();loadLibrary()};
$('#library-more').onclick=()=>{libraryLimit+=40;renderLibrary()};
$('#preview-back').onclick=()=>$('#poem-preview').close();
function previewLines(){return previewPoem?previewPoem.text.split('\n'):[]}
function excerptBounds(){
 const count=previewLines().length;if(!$('#excerpt-enabled').checked)return {start:1,end:count,valid:true};
 const start=Number($('#excerpt-start').value),end=Number($('#excerpt-end').value);
 return {start,end,valid:Number.isInteger(start)&&Number.isInteger(end)&&start>=1&&end>=start&&end<=count};
}
function updateExcerpt(){
 const lines=previewLines(),{start,end,valid}=excerptBounds(),partial=$('#excerpt-enabled').checked;
 $('#excerpt-range').hidden=!partial;$('#preview-use').disabled=!valid;
 $('#excerpt-status').textContent=!valid?`请输入 1–${lines.length} 之间的段落序号，结束段不能早于起始段。`:partial?`已选第 ${start}–${end} 段，共 ${lines.slice(start-1,end).join('\n').replace(/\s/g,'').length} 字符`:`全文，共 ${lines.length} 段`;
 $('#excerpt-status').classList.toggle('range-error',!valid);
 document.querySelectorAll('#preview-text .preview-line').forEach((el,i)=>{el.classList.toggle('outside-excerpt',partial&&valid&&(i<start-1||i>end-1));el.classList.toggle('inside-excerpt',partial&&valid&&i>=start-1&&i<end)});
}
function openPoemPreview(p){
 previewPoem=p;$('#preview-title').textContent=displayText(p.title);$('#preview-author').textContent=displayText([p.author,p.collection].filter(Boolean).join(' · '));
 const lines=previewLines(),root=$('#preview-text');root.replaceChildren();
 lines.forEach((line,i)=>{const el=document.createElement('div');el.className='preview-line';const num=document.createElement('span');num.className='line-number';num.textContent=i+1;num.setAttribute('aria-hidden','true');const text=document.createElement('span');text.textContent=displayText(line)||' ';el.append(num,text);root.append(el)});
 $('#excerpt-enabled').checked=false;$('#excerpt-start').value=1;$('#excerpt-end').value=Math.min(8,lines.length);$('#excerpt-start').max=lines.length;$('#excerpt-end').max=lines.length;
 const replacing=!!(state.tokens.length||state.title);$('#preview-warning').hidden=!replacing;$('#preview-use').textContent=replacing?'确认替换原文':'确认使用';updateExcerpt();$('#poem-preview').showModal();root.scrollTop=0;
}
$('#excerpt-enabled').onchange=updateExcerpt;
for(const id of ['excerpt-start','excerpt-end']){$('#'+id).oninput=updateExcerpt;$('#'+id).onchange=()=>{const range=excerptBounds();if(range.valid)document.querySelectorAll('#preview-text .preview-line')[range.start-1]?.scrollIntoView({block:'start'})}}
$('#preview-use').onclick=()=>{
 if(!previewPoem)return;const range=excerptBounds();if(!range.valid)return;
 const lines=previewLines(),partial=$('#excerpt-enabled').checked&&(range.start!==1||range.end!==lines.length);
 const source=partial?{...previewPoem,title:previewPoem.title+'（节选）',author:previewPoem.author+` · 第 ${range.start}–${range.end} 段`,text:lines.slice(range.start-1,range.end).join('\n'),excerpt:{originalTitle:previewPoem.title,originalAuthor:previewPoem.author,start:range.start,end:range.end,total:lines.length}}:previewPoem;
 if(!Array.from(source.text).some(isLetter)){toast('这部分没有可选取的文字，请调整范围');return}
 if(changeSource(source,true)){$('#poem-preview').close();toast('已选择《'+source.title+'》');$('#source-title').scrollIntoView({block:'start'});}
};
function changeSource(source,confirmed=false){if(!confirmed&&(state.tokens.length||state.title)&&!confirm('更换诗材会清空当前诗笺。确定开始新诗吗？（可撤销恢复）'))return;mutate(()=>{state={source,tokens:[],title:'',signature:state.signature}});$('#picker').close();return true}
function renderLibrary(){
 const q=$('#search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),scope=$('#library-scope').value;
 const keys=scopeKeys(),loading=keys.some(k=>libraryPending.has(k)),failed=keys.filter(k=>libraryErrors.has(k));
 const items=[...(scope==='selected'||scope==='all'?poems:[]),...keys.flatMap(k=>libraryCache.get(k)||[])];
 const matches=items.filter(p=>{const text=(p.title+' '+p.author+' '+p.text).toLocaleLowerCase();return q.every(word=>text.includes(word))});
 const list=$('#poem-list');list.replaceChildren();
 const loaded=keys.reduce((n,k)=>n+(libraryCache.get(k)?.length||0),0);
 $('#library-status').textContent=loading?`正在加载文集…已载入 ${loaded.toLocaleString()} 篇，可先选用`:failed.length?`${failed.map(k=>libraryCatalog[k].name).join('、')}未加载完整，已载入内容仍可选用`: `${matches.length.toLocaleString()} 篇`;
 $('#library-retry').disabled=loading;
 $('#library-retry').hidden=!failed.length;
 matches.slice(0,libraryLimit).forEach(p=>{const b=document.createElement('button');b.className='poem-choice';const title=document.createElement('b');title.textContent=displayText(p.title);const author=document.createElement('small');author.textContent=displayText(p.author);const preview=document.createElement('p');preview.textContent=displayText(p.text.split('\n')[0]);b.append(title,author,preview);b.onclick=()=>openPoemPreview(p);list.append(b)});
 $('#library-more').hidden=matches.length<=libraryLimit;
 if(!matches.length&&!loading&&!failed.length)list.textContent='没有找到匹配的原文，可以换个关键词或粘贴原文。';
}
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{libraryLimit=40;renderLibrary()},150)};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#library-tab').hidden=b.dataset.tab!=='library';$('#custom-tab').hidden=b.dataset.tab!=='custom'});
$('#custom-tab').onsubmit=e=>{e.preventDefault();const text=$('#custom-text').value.trim();if(!Array.from(text).some(isLetter)){toast('请添加至少一个可以摘取的字');return}openPoemPreview({title:$('#custom-title').value.trim()||'无题',author:$('#custom-author').value.trim()||'自选诗材',text})};
$('#save').onclick=()=>{if(!pickedCount()){toast('请先从原文中选字');return}const item={...JSON.parse(JSON.stringify(state)),id:Date.now()};const next=[item,...saved];try{localStorage.setItem('shiju-collection',JSON.stringify(next));saved=next;$('#saved-count').textContent=saved.length;toast('已存入诗集')}catch{toast('存储空间不足，请导出图片保存')}};
function renderSaved(){const list=$('#saved-list');list.replaceChildren();if(!saved.length){list.textContent='暂无保存的作品。';return}saved.forEach(s=>{const d=document.createElement('div');d.className='saved-item';const h=document.createElement('h3');h.textContent=displayText(s.title.trim());h.hidden=!s.title.trim();const p=document.createElement('pre');p.textContent=displayText(textOf(s));const label=document.createElement('p');label.className='dialog-note';label.textContent='拾自《'+displayText(s.source.title)+'》 · '+new Date(s.id).toLocaleDateString('zh-CN');const open=document.createElement('button');open.textContent='继续创作 ↗';open.onclick=()=>{if(state.tokens.length&&!confirm('载入这首作品，替换当前诗笺？可撤销恢复。'))return;mutate(()=>{state=JSON.parse(JSON.stringify(s));delete state.id});$('#collection-dialog').close()};const del=document.createElement('button');del.textContent='删除';del.onclick=()=>{if(!confirm('从诗集中删除这首作品？'))return;const next=saved.filter(x=>x.id!==s.id);try{localStorage.setItem('shiju-collection',JSON.stringify(next));saved=next;$('#saved-count').textContent=saved.length;renderSaved()}catch{toast('删除失败，请重试')}};d.append(h,label,p,open,del);list.append(d)})}
$('#collection').onclick=()=>{renderSaved();$('#collection-dialog').showModal()};
// Lay out both original and new poem first, so exports grow to fit every line.
function wrapCells(chars,maxUnits){const lines=[[]];let units=0;for(const t of chars){if(t.c==='\n'){lines.push([]);units=0;continue}const w=t.c===' '?0.5:Array.from(t.c).length;if(units+w>maxUnits&&lines.at(-1).length){lines.push([]);units=0}lines.at(-1).push({...t,w});units+=w}return lines}
const songtiFamily='"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif';
const exportFonts={kangxi:{family:'Kangxi',label:'康熙字典体',file:'kangxi.woff2'},huiwen:{family:'Huiwen',label:'汇文明朝体',file:'huiwen.woff2'}};
const fontPromises=new Map(),fontManifests=new Map();
function fontText(){return displayText(state.source.text+' '+state.source.title+' '+state.title+' '+state.signature)+' '+displayTokens(state.tokens).map(t=>t.c).join('')+'拾句拾自集句原诗摘取后新诗重新排列从旧诗里拾一首新诗字句有来处诗意无边界拾句的人';}
async function loadExportFont(key){
 const font=exportFonts[key];if(!font)return;
 if(typeof FontFace==='undefined'||!document.fonts)throw new Error('当前浏览器不支持自定义字体，请更新 Safari 后重试');
 if(!fontManifests.has(key))fontManifests.set(key,(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{const response=await fetch('fonts/'+key+'/manifest.json',{signal:controller.signal});if(!response.ok)throw new Error('manifest');return await response.json()}finally{clearTimeout(timer)}
 })().catch(e=>{fontManifests.delete(key);throw e}));
 try{
  const manifest=await fontManifests.get(key),codes=new Set(Array.from(fontText(),c=>c.codePointAt(0)));
  const needed=manifest.filter(part=>part.codes.some(code=>codes.has(code)));
  // Keep mobile network and decoding concurrency bounded; reuse previously loaded shards.
  let next=0;
  await Promise.all(Array.from({length:Math.min(3,needed.length)},async()=>{while(next<needed.length){const part=needed[next++],cacheKey=part.file;
   if(!fontPromises.has(cacheKey))fontPromises.set(cacheKey,(async()=>{
    const face=new FontFace(font.family,'url("fonts/'+part.file+'") format("woff2")',{style:'normal',weight:'400',unicodeRange:part.codes.map(c=>'U+'+c.toString(16)).join(',')});
    let timer;try{await Promise.race([face.load(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),60000)})]);document.fonts.add(face)}finally{clearTimeout(timer)}
   })().catch(e=>{fontPromises.delete(cacheKey);throw e}));
   await fontPromises.get(cacheKey);
  }}));
  await document.fonts.load('24px "'+font.family+'"',fontText());
 }catch{throw new Error(font.label+'加载失败，请检查网络并点击重试')}
}
// A source position always produces the same torn outline, even after reordering.
function paperEdgePoints(id,strength=35,width=1,height=1){
 let seed=(Number(id)+1)*2654435761>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const points=[],steps=36;const short=Math.min(width,height);
 for(let side=0;side<4;side++)for(let i=0;i<steps;i++){const t=i/steps,d=(.01+random()*(.012+strength/100*.065))*short;points.push(side===0?[t,d/height]:side===1?[1-d/width,t]:side===2?[1-t,1-d/height]:[d/width,1-t])}
 return points;
}
// Group by source occurrence, never by character value. Wrapped source rows remain separate cuts.
function paperRuns(line,eligible,sourceRows){
 const runs=[];let offset=0;
 for(const token of line){const width=token.w??1,last=runs.at(-1),previous=last?.tokens.at(-1);
  const join=eligible(token)&&previous&&eligible(previous)&&Number.isInteger(token.id)&&token.id===previous.id+1&&(!sourceRows||sourceRows.get(token.id)===sourceRows.get(previous.id));
  if(join){last.tokens.push(token);last.width+=width}else runs.push({tokens:[token],offset,width});offset+=width;
 }return runs;
}
// Center the visible glyph, rather than its font baseline, inside a paper tile.
function paintCenteredGlyph(ctx,text,x,y,w,h){
 ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';
 const m=ctx.measureText(text),size=parseFloat(ctx.font)||h;
 const left=Number.isFinite(m.actualBoundingBoxLeft)?m.actualBoundingBoxLeft:0;
 const right=Number.isFinite(m.actualBoundingBoxRight)?m.actualBoundingBoxRight:m.width;
 const ascent=Number.isFinite(m.actualBoundingBoxAscent)?m.actualBoundingBoxAscent:size*.8;
 const descent=Number.isFinite(m.actualBoundingBoxDescent)?m.actualBoundingBoxDescent:size*.2;
 ctx.fillText(text,x+w/2+(left-right)/2,y+h/2+(ascent-descent)/2);ctx.restore();
}
function paintPaperRect(ctx,x,y,w,h,id,rough){
 if(!rough){ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);return}
 const intensity=Number(rough)/100,unit=Math.min(w,h)/42;const points=paperEdgePoints(id,rough,w,h);ctx.save();ctx.beginPath();points.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](x+u*w,y+v*h));ctx.closePath();ctx.fill();
 // Translucent strands follow the same seeded edge on the cutout and its hole.
 const ink=ctx.strokeStyle;ctx.strokeStyle=ctx.fillStyle;ctx.lineJoin='round';ctx.lineWidth=(.8+intensity*2)*unit;ctx.globalAlpha=.3+intensity*.35;ctx.stroke();
 points.forEach(([u,v],i)=>{const side=Math.floor(i/(points.length/4)),n=side===0?[0,-1]:side===1?[1,0]:side===2?[0,1]:[-1,0],r=((i*17+Number(id)*7)%23)/23;const len=(.4+intensity*(1.5+r*4))*unit;ctx.globalAlpha=.25+intensity*.45;ctx.lineWidth=(.2+intensity*.4+r*.2)*unit;ctx.strokeStyle=i%3===0?ink:ctx.fillStyle;ctx.beginPath();ctx.moveTo(x+u*w-n[0]*unit,y+v*h-n[1]*unit);ctx.lineTo(x+u*w+n[0]*len-n[1]*(r-.5)*len*.7,y+v*h+n[1]*len+n[0]*(r-.5)*len*.7);ctx.stroke();
 if(intensity>.5&&i%2===0){ctx.globalAlpha=.2+intensity*.25;ctx.lineWidth=.25*unit;ctx.beginPath();ctx.moveTo(x+u*w+n[0]*len*.4,y+v*h+n[1]*len*.4);ctx.lineTo(x+u*w+n[0]*len-n[1]*unit,y+v*h+n[1]*len+n[0]*unit);ctx.stroke()}
 });ctx.restore();
}
let fontPreviewVersion=0;
async function updateFontPreview(){
 const version=++fontPreviewVersion,key=$('#export-font').value,status=$('#font-preview-status');
 status.onclick=null;status.textContent=key==='songti'?'':'正在按需加载字体，首次使用请稍候…';
 try{if(exportFonts[key])await loadExportFont(key);if(version!==fontPreviewVersion)return;status.textContent='';drawImagePreview()}catch(e){if(version===fontPreviewVersion){status.textContent=(e.message||'字体加载失败')+'（点击重试）';status.onclick=updateFontPreview}}
}
function drawImagePreview(){
 const c=$('#image-preview'),ctx=c.getContext('2d'),colors=getExportColors(),font=exportFonts[$('#export-font').value],family=(font?'"'+font.family+'",':'')+songtiFamily;
 const size=Number($('#image-size').value),px=size*1.5,step=px+9,rough=exportCollage&&exportRough?roughStrength:0,maxUnits=Math.floor(460/step);
 const used=new Set(state.tokens.filter(t=>Number.isInteger(t.id)).map(t=>t.id));
 const source=wrapCells(Array.from(displayText(state.source.text)).map((ch,id)=>({c:ch,id,hole:used.has(id)})),maxUnits);
 const result=wrapCells(displayTokens(state.tokens),maxUnits),sourceRows=new Map();source.forEach((line,row)=>line.forEach(t=>sourceRows.set(t.id,row)));
 const selected=t=>Number.isInteger(t.id);
 ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle=colors.poemBackground;ctx.fillRect(0,0,500,180);ctx.fillStyle=colors['#f7f5ef'];ctx.fillRect(0,180,500,180);
 for(const [label,lines,top,isSource] of [['集句',result,0,false],['原文',source,180,true]]){
  ctx.fillStyle=colors['#343b31'];ctx.font='12px sans-serif';ctx.fillText(label,20,top+23);
  if(lines.length>2){ctx.textAlign='right';ctx.fillText('仅预览前两行',480,top+23);ctx.textAlign='left'}
  if(!isSource&&!state.tokens.length){ctx.fillText('尚未选字',20,top+70);continue}
  ctx.font=px+'px '+family;
  lines.slice(0,2).forEach((line,row)=>{const y=top+48+row*58;
   for(const run of paperRuns(line,isSource?t=>t.hole:selected,sourceRows)){const token=run.tokens[0];if(isSource?!token.hole:!exportCollage||!selected(token))continue;
    ctx.fillStyle=isSource?colors['#edf0e4']:colors['#f7f5ef'];ctx.strokeStyle=colors['#bfc8b0'];ctx.setLineDash(isSource&&!rough?[3,4]:[]);paintPaperRect(ctx,18+run.offset*step,y,step*run.width-3,step-3,token.id,rough);ctx.setLineDash([]);
   }
   let x=20;for(const token of line){ctx.fillStyle=colors['#343b31'];if(isSource){if(!token.hole)ctx.fillText(token.c,x,y+px)}else if(exportCollage&&selected(token))paintCenteredGlyph(ctx,token.c,x-2,y,step-3,step-3);else ctx.fillText(token.c,x,y+px);x+=step*token.w}
  });
 }
 c.setAttribute('aria-label','当前集句与挖空原文预览，各最多两行');
}
function setImageSize(value){const n=Math.round(Number(value));if(!Number.isFinite(n)||n<5||n>25)return;$('#image-size').value=n;$('#image-size-range').value=n;drawImagePreview();try{localStorage.setItem('shiju-image-size',n)}catch{}}
$('#image-size').oninput=e=>{if(e.target.value)setImageSize(e.target.value)};
$('#image-size').onblur=e=>setImageSize(Math.max(5,Math.min(25,Number(e.target.value)||23)));
$('#image-size-range').oninput=e=>setImageSize(e.target.value);
$('#image-size-minus').onclick=()=>setImageSize(Number($('#image-size').value)-1);
$('#image-size-plus').onclick=()=>setImageSize(Number($('#image-size').value)+1);
async function exportImage(){if(!pickedCount()){toast('请先从原文中选字');return}const colors=getExportColors(),collage=exportCollage,rough=exportCollage&&exportRough?roughStrength:0;const scale=Number($('#image-size').value)/23,bodySize=38*scale,advance=46*scale,lineHeight=64*scale;const button=$('#export');const fontKey=$('#export-font').value,font=exportFonts[fontKey];const fontFamily=(font?'"'+font.family+'",':'')+songtiFamily;button.disabled=true;try{if(font){button.textContent='正在加载字体…';await loadExportFont(fontKey)}button.textContent='正在生成图片…';const used=new Set(state.tokens.filter(t=>t.id!==null).map(t=>t.id));const source=wrapCells(Array.from(displayText(state.source.text)).map((c,id)=>({c,id,hole:used.has(id)})),Math.floor(560/advance));const result=wrapCells(displayTokens(state.tokens),Math.floor(540/advance));const height=Math.max(1060,400+source.length*lineHeight,400+result.length*lineHeight);if(height>24000)throw new Error('作品太长，请分为较短的篇章导出');const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前浏览器不支持图片导出');ctx.fillStyle=colors['#f7f5ef'];ctx.fillRect(0,0,1440,height);ctx.fillStyle=colors['#b95437'];ctx.fillRect(64,58,49,53);ctx.font='32px '+fontFamily;ctx.fillStyle=colors['#fffefb'];ctx.fillText('拾',72,96);ctx.fillStyle=colors['#343b31'];ctx.font='26px '+fontFamily;ctx.fillText('拾句',130,95);ctx.font='14px sans-serif';ctx.fillStyle=colors['#969b8b'];ctx.fillText('从旧诗里，拾一首新诗。',1040,95);ctx.strokeStyle=colors['#dfe2d5'];ctx.beginPath();ctx.moveTo(64,142);ctx.lineTo(1376,142);ctx.stroke();ctx.fillStyle=colors.poemBackground;ctx.fillRect(754,190,622,height-310);ctx.fillStyle=colors['#87917b'];ctx.font='14px sans-serif';ctx.fillText('01   原诗 · 摘取后',85,219);ctx.fillText('02   新诗 · 重新排列',794,229);
 function drawWrappedTitle(text,x,y,width,size=30){ctx.font=size+'px '+fontFamily;let str='';let row=0;for(const c of Array.from(text)){if(ctx.measureText(str+c).width>width){ctx.fillText(str,x,y+row*(size+10));str=c;row++}else str+=c}ctx.fillText(str,x,y+row*(size+10));return y+row*(size+10)}
 ctx.fillStyle=colors['#343b31'];const sy=drawWrappedTitle(displayText(state.source.title),85,280,560);ctx.font='15px sans-serif';ctx.fillStyle=colors['#929985'];ctx.fillText(displayText(state.source.author),85,sy+32);ctx.fillStyle=colors['#343b31'];const ny=drawWrappedTitle(displayText(state.title.trim()),794,290,540,46);
 // Titles can take multiple lines; reserve the extra rows in layout by limiting canvas text area through dynamic extension.
 const sourceStart=sy+93,newStart=state.title.trim()?ny+80:290;const need=Math.max(sourceStart+source.length*lineHeight+150,newStart+result.length*lineHeight+210,height);
 if(need>height){canvas.height=need;return await exportWithHeight(need)}
 paintBody(ctx,source,result,sourceStart,newStart,height);download(canvas);
 function paintBody(ctx,source,result,sourceStart,newStart,h){
 const sourceRows=new Map();source.forEach((line,row)=>line.forEach(t=>sourceRows.set(t.id,row)));
 const selected=t=>Number.isInteger(t.id);ctx.font=bodySize+'px '+fontFamily;
 source.forEach((line,row)=>{const y=sourceStart+row*lineHeight;
  for(const run of paperRuns(line,t=>t.hole,sourceRows)){const x=85+run.offset*advance,t=run.tokens[0];
   if(t.hole){ctx.fillStyle=colors['#edf0e4'];ctx.strokeStyle=colors['#bfc8b0'];ctx.setLineDash(rough?[]:[3,4]);paintPaperRect(ctx,x+2,y-bodySize*.87,advance*run.width-4,advance-4,t.id,rough);ctx.setLineDash([])}else{ctx.fillStyle=colors['#5d6754'];ctx.fillText(t.c,x,y)}
  }
 });
 result.forEach((line,row)=>{const y=newStart+row*lineHeight;
  if(collage)for(const run of paperRuns(line,selected,sourceRows)){const t=run.tokens[0];if(!selected(t))continue;ctx.fillStyle=colors['#f7f5ef'];ctx.strokeStyle=mixColors(colors['#343b31'],colors['#f7f5ef'],.16);ctx.lineWidth=1;paintPaperRect(ctx,793+run.offset*advance,y-bodySize*.87,advance*run.width-4,advance-4,t.id,rough)}
  let x=794;for(const t of line){ctx.fillStyle=colors['#343b31'];if(collage&&selected(t))paintCenteredGlyph(ctx,t.c,x-1,y-bodySize*.87,advance-4,advance-4);else ctx.fillText(t.c,x,y);x+=advance*t.w}
 });ctx.font='20px '+fontFamily;ctx.fillStyle=colors['#7e886e'];ctx.textAlign='right';ctx.fillText('— '+displayText(state.signature||'拾句的人'),1336,h-180);ctx.textAlign='left';ctx.strokeStyle=colors['#dfe2d5'];ctx.beginPath();ctx.moveTo(64,h-90);ctx.lineTo(1376,h-90);ctx.stroke();ctx.font='14px sans-serif';ctx.fillStyle=colors['#959e89'];ctx.fillText('字句有来处，诗意无边界。',64,h-50);ctx.textAlign='right';ctx.fillText(`拾自《${displayText(state.source.title)}》 · 已拾 ${pickedCount()} 字`,1376,h-50);ctx.textAlign='left'}
 async function exportWithHeight(h){canvas.height=h;ctx.fillStyle=colors['#f7f5ef'];ctx.fillRect(0,0,1440,h);ctx.fillStyle=colors.poemBackground;ctx.fillRect(754,190,622,h-310);ctx.fillStyle=colors['#b95437'];ctx.font='32px '+fontFamily;ctx.fillText('拾句',64,95);ctx.fillStyle=colors['#87917b'];ctx.font='14px sans-serif';ctx.fillText('01   原诗 · 摘取后',85,219);ctx.fillText('02   新诗 · 重新排列',794,229);ctx.fillStyle=colors['#343b31'];drawWrappedTitle(displayText(state.source.title),85,280,560);drawWrappedTitle(displayText(state.title.trim()),794,290,540,46);ctx.font='15px sans-serif';ctx.fillStyle=colors['#929985'];ctx.fillText(displayText(state.source.author),85,sy+32);paintBody(ctx,source,result,sourceStart,newStart,h);download(canvas)}
 function download(c){c.toBlob(blob=>{if(!blob){toast('生成图片失败，请尝试更短的诗材');return}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`拾句-${(state.title.trim()||'集句').replace(/[\\/:*?"<>|]/g,'')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('图片已生成，包含挖空原诗与新诗')},'image/png')}
 }catch(e){toast(e.message||'导出失败，请稍后重试')}finally{button.disabled=false;button.textContent='保存图片'}}
$('#export').onclick=exportImage;render();


const colorPresets={cream:{bg:'#f5f0e6',fg:'#453e34'},green:{bg:'#e8efe5',fg:'#344535'},gray:{bg:'#25282b',fg:'#d9d7d0'}};
const nightPresets={gray:{bg:'#1c1e20',fg:'#d8d6d0'},blue:{bg:'#192630',fg:'#d3dde3'},warm:{bg:'#29231e',fg:'#e0d5c3'}};
const validHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
let exportPalette=null,nightPreset='gray',exportCollage=false,exportRough=false,roughStrength=35,collageBackground='#ffffff';
try{const strength=Number(localStorage.getItem('shiju-rough-strength'));if(Number.isInteger(strength)&&strength>=1&&strength<=100)roughStrength=strength;exportRough=localStorage.getItem('shiju-export-rough')==='true';exportCollage=localStorage.getItem('shiju-export-collage')==='true';const bg=localStorage.getItem('shiju-collage-background');if(validHex(bg))collageBackground=bg}catch{}
$('#rough-strength').oninput=e=>{roughStrength=Math.max(1,Math.min(100,Number(e.target.value)||35));syncColorControls();try{localStorage.setItem('shiju-rough-strength',String(roughStrength))}catch{}};
$('#export-rough').onchange=e=>{exportRough=e.target.checked;syncColorControls();try{localStorage.setItem('shiju-export-rough',String(exportRough))}catch{}};
$('#export-collage').onchange=e=>{exportCollage=e.target.checked;syncColorControls();try{localStorage.setItem('shiju-export-collage',String(exportCollage))}catch{}};
try{const p=JSON.parse(localStorage.getItem('shiju-export-colors')||'null');if(p&&validHex(p.bg)&&validHex(p.fg))exportPalette={bg:p.bg,fg:p.fg};const n=localStorage.getItem('shiju-night-preset');if(Object.hasOwn(nightPresets,n))nightPreset=n}catch{}
function mixColors(a,b,weight){return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*weight+parseInt(b.slice(i,i+2),16)*(1-weight)).toString(16).padStart(2,'0')).join('')}
function applyTheme(dark){
 const root=document.documentElement,p=nightPresets[nightPreset];root.dataset.theme=dark?'dark':'light';root.toggleAttribute('data-night-colors',dark);root.removeAttribute('data-custom-colors');root.style.colorScheme=dark?'dark':'light';
 const values={'--custom-bg':p.bg,'--custom-fg':p.fg,'--custom-muted':mixColors(p.fg,p.bg,.74),'--custom-line':mixColors(p.fg,p.bg,.28),'--custom-hover':mixColors(p.fg,p.bg,.12),'--custom-control':'#deded8','--custom-control-text':'#202320'};
 for(const [key,value] of Object.entries(values))root.style.setProperty(key,value);
 $('#theme-toggle').setAttribute('aria-pressed',String(dark));$('#theme-toggle').textContent=dark?'夜览 · 开':'夜览';$('#theme-toggle').title='夜览设置';$('#night-enabled').checked=dark;
 document.querySelectorAll('[data-night]').forEach(b=>b.setAttribute('aria-pressed',String(dark&&b.dataset.night===nightPreset)));
 document.querySelector('meta[name="theme-color"]').content=dark?p.bg:'#fafafa';
}
function persistNight(){try{localStorage.setItem('shiju-theme',document.documentElement.dataset.theme);localStorage.setItem('shiju-night-preset',nightPreset)}catch{toast('已切换，当前浏览器无法保存偏好')}}
$('#theme-toggle').onclick=()=>$('#night-dialog').showModal();
$('#night-enabled').onchange=e=>{applyTheme(e.target.checked);persistNight()};
document.querySelectorAll('[data-night]').forEach(b=>b.onclick=()=>{nightPreset=b.dataset.night;applyTheme(true);persistNight()});
$('#night-done').onclick=()=>$('#night-dialog').close();
function persistColors(){try{localStorage.setItem('shiju-export-colors',JSON.stringify(exportPalette))}catch{toast('配色已更新，当前浏览器无法保存偏好')}}
function syncColorControls(){
 const p=exportPalette||{bg:'#f7f5ef',fg:'#343b31'};
 document.querySelectorAll('[data-preset]').forEach(b=>{const preset=colorPresets[b.dataset.preset];b.setAttribute('aria-pressed',String(p.bg.toLowerCase()===preset.bg&&p.fg.toLowerCase()===preset.fg))});
 $('#background-color').value=p.bg;$('#background-hex').value=p.bg;$('#text-color').value=p.fg;$('#text-hex').value=p.fg;
 $('#colors-mode').textContent='仅用于导出图片，不改变页面或夜览配色。';$('#background-hex').setCustomValidity('');$('#text-hex').setCustomValidity('');
 const sample=$('#export-color-sample'),colors=getExportColors();sample.style.backgroundColor=colors.poemBackground;sample.style.color=p.fg;sample.style.setProperty('--tile-bg',colors['#f7f5ef']);sample.style.setProperty('--tile-edge',mixColors(p.fg,colors['#f7f5ef'],.16));sample.classList.toggle('collage',exportCollage);$('#export-collage').checked=exportCollage;$('#collage-background-controls').hidden=!exportCollage;$('#collage-background-color').value=collageBackground;$('#collage-background-hex').value=collageBackground;$('#collage-background-hex').setCustomValidity('');
 const rough=exportCollage&&exportRough?roughStrength:0;$('#export-rough').checked=exportRough;$('#rough-hole-preview').hidden=!rough;$('#rough-strength-controls').hidden=!rough;$('#rough-strength').value=roughStrength;$('#rough-strength-value').textContent=roughStrength+'%';$('#rough-strength').setAttribute('aria-valuetext',roughStrength+'%');
 drawImagePreview();
 const clip=i=>'polygon('+paperEdgePoints(i).map(([x,y])=>`${x*100}% ${y*100}%`).join(',')+')';
 sample.querySelectorAll('p>span').forEach((span,i)=>span.style.clipPath=rough?clip(i):'');
 $('#rough-hole-preview').style.backgroundColor=colors['#f7f5ef'];$('#rough-hole-preview').style.color=p.fg;
 $('#rough-hole-preview').querySelectorAll('i').forEach((el,i)=>{el.style.clipPath=rough?clip(i):'';el.style.backgroundColor=colors['#edf0e4']});
}
function setCollageBackground(value){if(!validHex(value))return;collageBackground=value.toLowerCase();syncColorControls();try{localStorage.setItem('shiju-collage-background',collageBackground)}catch{}}
$('#collage-background-color').oninput=e=>setCollageBackground(e.target.value);
$('#collage-background-hex').oninput=e=>{const value=e.target.value.trim();e.target.setCustomValidity(validHex(value)?'':'请输入 #RRGGBB 格式的色值');if(validHex(value))setCollageBackground(value)};
function setCustomColor(key,value){if(!validHex(value))return;exportPalette={...(exportPalette||{bg:'#f7f5ef',fg:'#343b31'}),[key]:value.toLowerCase()};syncColorControls();persistColors()}
for(const [id,key] of [['background','bg'],['text','fg']]){
 $('#'+id+'-color').oninput=e=>setCustomColor(key,e.target.value);
 $('#'+id+'-hex').oninput=e=>{const value=e.target.value.trim();e.target.setCustomValidity(validHex(value)?'':'请输入 #RRGGBB 格式的色值');if(validHex(value))setCustomColor(key,value)};
}
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{exportPalette={...colorPresets[b.dataset.preset]};syncColorControls();persistColors()});
$('#colors-open').onclick=()=>{syncColorControls();$('#colors-dialog').showModal();updateFontPreview()};
$('#colors-done').onclick=()=>{if(!$('#background-hex').reportValidity()||!$('#text-hex').reportValidity()||(exportCollage&&!$('#collage-background-hex').reportValidity()))return;$('#colors-dialog').close()};
$('#colors-reset').onclick=()=>{exportPalette=null;setCollageBackground('#ffffff');persistColors()};
function getExportColors(){
 const originals=['#343b31','#f7f5ef','#b95437','#fffefb','#969b8b','#dfe2d5','#87917b','#929985','#edf0e4','#bfc8b0','#5d6754','#7e886e','#959e89'];const colors=Object.fromEntries(originals.map(c=>[c,c]));const p=exportPalette;colors.poemBackground=exportCollage?collageBackground:colors['#fffefb'];if(!p)return colors;
 for(const c of originals)colors[c]=p.fg;
 for(const c of ['#f7f5ef','#fffefb'])colors[c]=p.bg;
 for(const c of ['#dfe2d5','#bfc8b0'])colors[c]=mixColors(p.fg,p.bg,.28);
 colors['#edf0e4']=mixColors(p.fg,p.bg,.1);colors.poemBackground=exportCollage?collageBackground:p.bg;return colors;
}
applyTheme(document.documentElement.dataset.theme==='dark');syncColorControls();

try{setImageSize(Number(localStorage.getItem('shiju-image-size'))||23)}catch{}
