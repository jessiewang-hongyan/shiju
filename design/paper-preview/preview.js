const samples = document.querySelector('#samples');
const slider = document.querySelector('#intensity');
const motif = document.querySelector('#motif');
const variants = [
 {name:'十竹斋笺纸',note:'花瓶水盂笺 · Rijksmuseum · Public Domain',file:'assets/ten-bamboo.jpg',url:'https://id.rijksmuseum.nl/200404652'},
 {name:'手工纤维纸',note:'Lokta 纸照片 · prabhasp · CC0 · 已提亮',file:'assets/lokta.jpg',url:'https://github.com/prabhasp/ali-khasro'},
 {name:'仿洒金纸',note:'原创程序纹理 · 纤维与金箔碎片 · 非扫描'}
];
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function gold(){const c=canvas(840,590),x=c.getContext('2d'),r=random(31);x.fillStyle='#e5d7b8';x.fillRect(0,0,840,590);for(let i=0;i<38000;i++){x.strokeStyle=`rgba(98,77,38,${r()*.075})`;const a=r()*840,b=r()*590;x.beginPath();x.moveTo(a,b);x.lineTo(a+2+r()*16,b+r()*3-1.5);x.stroke()}for(let i=0;i<800;i++){
 // Many fine specks, fewer broad flakes; independent shape, angle and size.
 const a=r()*840,b=r()*590,kind=r();
 const size=kind<.78 ? .35+r()*1.3 : kind<.96 ? 1.8+r()*3.5 : 5.5+r()*8;
 const count=7+Math.floor(r()*8),rotation=r()*Math.PI*2,aspect=.35+r()*.65;
 x.save();x.translate(a,b);x.rotate(rotation);x.fillStyle=['#c4a45c','#ac873e','#d9bd72','#edd89b'][i%4];x.beginPath();
 for(let j=0;j<count;j++){const angle=j/count*Math.PI*2,rad=size*(.45+r()*.55);const px=Math.cos(angle)*rad,py=Math.sin(angle)*rad*aspect;j?x.lineTo(px,py):x.moveTo(px,py)}
 x.closePath();x.fill();x.restore();
 }return c}
function tear(x,w,h,seed){const r=random(seed);x.beginPath();x.moveTo(0,2);for(let a=0;a<=w;a+=3)x.lineTo(a,r()*2.7);for(let b=0;b<=h;b+=3)x.lineTo(w-r()*2.7,b);for(let a=w;a>=0;a-=3)x.lineTo(a,h-r()*2.7);for(let b=h;b>=0;b-=3)x.lineTo(r()*2.7,b);x.closePath()}
function text(x,s,a,b,size){x.fillStyle='#30372b';x.font=`${size}px "Songti SC",SimSun,serif`;x.textBaseline='middle';x.fillText(s,a,b)}
for(const [index,v] of variants.entries()){
 const article=document.createElement('article');article.innerHTML=`<h2>${v.name}</h2><small>${v.url?`<a href="${v.url}" target="_blank" rel="noreferrer">${v.note}</a>`:v.note}</small>`;
 const c=canvas(840,1060);c.setAttribute('aria-label',v.name+'集句与挖空原文预览');article.append(c);const btn=document.createElement('button');btn.textContent='保存预览 PNG';article.append(btn);samples.append(article);
 try{let img;if(v.file){img=new Image();img.src=v.file;await img.decode()}else img=gold();
 const material=canvas(840,590),m=material.getContext('2d');
 const paint=()=>{m.fillStyle='#f6efdf';m.fillRect(0,0,840,590);m.save();m.globalAlpha=Number(slider.value)/100;if(index===1)m.filter='brightness(1.65) sepia(0.18)';m.drawImage(img,0,0,840,590);m.restore();const x=c.getContext('2d');x.fillStyle='#fcfbf7';x.fillRect(0,0,840,1060);x.drawImage(material,0,470);
 // Source line positions are also the crop positions for the removed strips.
 const strips=[motif.checked ? {s:'随意春芳歇',sx:70,sy:474,dx:90,dy:114,angle:-.015} : {s:'明月松间照',sx:125,sy:194,dx:90,dy:114,angle:-.015},{s:'清泉石上流',sx:425,sy:194,dx:90,dy:237,angle:.012}];
 if(motif.checked)for(let i=0;i<5;i++)text(x,'明月松间照'[i],140+i*47,699,44);
 text(x,'空山新雨后，天气晚来秋。',125,610,43);
 for(const t of strips){const w=260,h=68;x.save();x.translate(t.dx,t.dy);x.rotate(t.angle);x.shadowColor='#4b452728';x.shadowBlur=4;x.shadowOffsetY=3;tear(x,w,h,72);x.fillStyle='#e5dbc3';x.fill();x.shadowColor='transparent';x.clip();x.drawImage(material,t.sx,t.sy,w,h,0,0,w,h);for(let i=0;i<t.s.length;i++)text(x,t.s[i],15+i*47,35,44);x.restore();
 x.save();x.translate(t.sx,470+t.sy);tear(x,w,h,72);x.fillStyle='#fcfbf7';x.fill();x.restore();}
 text(x,'，',389,698,42);text(x,'。',692,698,42);
 text(x,'竹喧归浣女，莲动下渔舟。',125,784,43);
 if(!motif.checked)for(let i=0;i<5;i++)text(x,'随意春芳歇'[i],85+i*47,979,44);
 text(x,'，王孙自可留。',334,979,43);
 };v.paint=paint;paint();btn.onclick=()=>{const a=document.createElement('a');a.download=`拾句-${v.name}-预览.png`;a.href=c.toDataURL('image/png');a.click();document.querySelector('#status').textContent=`已生成${v.name}预览图片。`};
 }catch(e){btn.disabled=true;const p=document.createElement('p');p.textContent='素材加载失败，请刷新后重试。';article.append(p);document.querySelector('#status').textContent=e.message}
}
slider.addEventListener('input',()=>{document.querySelector('#amount').value=slider.value+'%';variants.forEach(v=>v.paint?.())});

motif.addEventListener('change',()=>variants.forEach(v=>v.paint?.()));
