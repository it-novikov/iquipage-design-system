'use strict';
const B=require('./whiteboard-core.js');
// Predictable placement and organization are model operations, not DOM patches.
function estimatedLines(text,capacity){
 let total=0;
 for(const paragraph of String(text||'').split('\n')){
  let used=0,lines=1;
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   let length=Array.from(word).length;
   if(used&&used+1+length>capacity){lines++;used=0;}
   if(length>capacity){lines+=Math.floor((length-1)/capacity);length=((length-1)%capacity)+1;}
   used+=(used?1:0)+length;
  }
  total+=lines;
 }
 return total;
}
function textHeight(o){
 if(!['sticky','task','text','shape'].includes(o.type)||o.autoHeight===false)return o.height;
 const inset=o.type==='shape'&&o.shape==='diamond'?.46:o.type==='shape'&&o.shape==='ellipse'?.7:1;
 const width=Math.max(80,(o.width-40)*inset),font=o.type==='text'?24:16,chars=Math.max(8,Math.floor(width/(font*.54)));
 const plain=String(o.text||'').replace(/[#*~`]/g,'');
 const lines=estimatedLines(plain,chars),body=lines*(font*1.5);
 const pad=o.type==='task'?88:o.type==='text'?16:40;
 const h=(body+pad)/(o.type==='shape'&&o.shape==='diamond'?.5:o.type==='shape'&&o.shape==='ellipse'?.72:1);
 return Math.min(1800,Math.max(o.minHeight|| (o.type==='text'?64:o.type==='shape'?112:o.height||164),Math.ceil(h/4)*4));
}
function resizeText(scene,id,text,measuredHeight){
 const next=B.clone(scene),o=next.objects.find(o=>o.id===id);if(!o)return next;
 const oldBottom=o.y+o.height; o.text=String(text).slice(0,10000);o.height=Number.isFinite(measuredHeight)?Math.max(o.minHeight||32,Math.min(4000,measuredHeight)):textHeight(o);
 const delta=o.y+o.height-oldBottom;
 if(o.parentId&&delta){const siblings=next.objects.filter(n=>n.parentId===o.parentId&&n.id!==id&&n.type!=='frame'&&Math.abs(n.x-o.x)<8&&n.y>=oldBottom-1).sort((a,b)=>a.y-b.y);let bottom=o.y+o.height;for(const n of siblings){n.y=Math.max(bottom+24,n.y+delta);bottom=n.y+n.height;}growParents(next,id);if(siblings.length)growParents(next,siblings.at(-1).id);}
 return B.validateBoard(next);
}
function linesFrom(text){const lines=String(text).split(/\r?\n|\t/).map(s=>s.trim()).filter(Boolean);if(lines.length>100)throw new RangeError('Можно добавить до 100 заметок за один раз.');if(lines.some(x=>x.length>10000))throw new RangeError('Одна заметка может содержать до 10 000 знаков.');return lines;}
function commonArea(scene,ids){const selected=scene.objects.filter(o=>ids.includes(o.id));if(selected.length===1&&selected[0].type==='frame')return selected[0].id;const parent=selected[0]?.parentId;return parent&&selected.every(o=>o.parentId===parent)?parent:null;}
function overlaps(a,b,gap=20){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
function growParents(scene,id){let o=scene.objects.find(o=>o.id===id),n=0;while(o?.parentId&&n++<scene.objects.length){const f=scene.objects.find(f=>f.id===o.parentId);if(!f||f.locked)break;f.width=Math.max(f.width,o.x+o.width-f.x+24);f.height=Math.max(f.height,o.y+o.height-f.y+24);o=f;}return scene;}
function appendNotes(scene,lines,{areaId=null,origin={x:40,y:40},color='sand',type='sticky'}={}){
 if(!Array.isArray(lines)||!lines.length)throw new RangeError('Добавьте хотя бы одну мысль.');if(lines.length>100)throw new RangeError('Можно добавить до 100 заметок.');
 const next=B.clone(scene),area=next.objects.find(o=>o.id===areaId&&o.type==='frame');
 if(area&&B.isLocked(next,area))throw new Error('Область зафиксирована. Сначала разблокируйте её.');
 const peers=area?next.objects.filter(o=>o.parentId===area.id&&o.type===type).sort((a,b)=>a.y-b.y):[];
 const peer=peers[0];const ids=[],width=peer?peer.width:area?Math.max(160,Math.min(240,area.width-48)):240;
 const x=peer?peer.x:area?area.x+24:origin.x,y=area?area.y+Math.max(76,(area.headerHeight||56)+20):origin.y;
 if(peer)color=peer.color;
 const cols=area?Math.max(1,Math.floor((area.width-28)/(width+20))):Math.min(3,lines.length);
 for(const line of lines){const o=B.createObject(type,x,y,String(line),color);o.width=width;o.minHeight=peer?.minHeight||Math.min(peer?.height||152,240);o.height=textHeight(o);o.align=peer?.align||'left';o.valign=peer?.valign||'top';if(area)o.parentId=area.id;
 let found=false;for(let row=0;row<2000&&!found;row++){for(let col=0;col<cols&&!found;col++){o.x=x+col*(width+20);o.y=y+row*20;found=!next.objects.some(other=>other.type!=='frame'&&other.type!=='drawing'&&overlaps(o,other,16));}}
 if(!found)throw new RangeError('Не найдено свободного места. Создайте новую область.');next.objects.push(o);ids.push(o.id);
 if(area){area.width=Math.max(area.width,o.width+48);area.height=Math.max(area.height,o.y+o.height-area.y+24);growParents(next,area.id);}
 }
 return {value:B.validateBoard(next),ids};
}
function moveToArea(scene,ids,areaId){
 const next=B.clone(scene),area=next.objects.find(o=>o.id===areaId&&o.type==='frame');
 if(!area||B.isLocked(next,area))throw new Error('Выберите доступную область.');
 const chosen=next.objects.filter(o=>ids.includes(o.id)&&o.type!=='frame');
 if(!chosen.length)throw new Error('Сначала выберите заметки или блоки.');if(chosen.some(o=>B.isLocked(next,o)))throw new Error('В выделении есть зафиксированные объекты.');
 const chosenIds=new Set(chosen.map(o=>o.id));const others=next.objects.filter(o=>o.parentId===areaId&&!chosenIds.has(o.id));
 let y=Math.max(area.y+Math.max(76,(area.headerHeight||56)+20),...others.map(o=>o.y+o.height+20));
 for(const o of chosen){o.parentId=area.id;o.x=area.x+24;o.y=y;y+=o.height+20;area.width=Math.max(area.width,o.width+48);}
 area.height=Math.max(area.height,y-area.y+4);growParents(next,area.id);return B.validateBoard(next);
}
function organize(scene,ids,kind='grid'){
 const chosen=scene.objects.filter(o=>ids.includes(o.id)&&o.type!=='frame'&&!B.isLocked(scene,o));if(chosen.length<2)return B.clone(scene);
 const next=kind==='left'||kind==='top'?B.align(scene,ids,kind):B.tidy(scene,ids,kind==='column'?1:kind==='row'?chosen.length:undefined);
 // Tidy does not silently eject notes from their semantic group.
 for(const old of chosen){const o=next.objects.find(n=>n.id===old.id);if(old.parentId){o.parentId=old.parentId;growParents(next,o.id);}}
 return B.validateBoard(next);
}
function summarize(scene){const parts=['# '+scene.title,''];const walk=parent=>{for(const o of scene.objects.filter(n=>(n.parentId||'')===parent)){if(o.type==='frame'){parts.push('## '+o.text,'');walk(o.id);}else if(o.type==='task')parts.push(`- [${o.done?'x':' '}] ${o.text}${o.owner?' — '+o.owner:''}`);else if(o.text)parts.push('- '+o.text.replace(/\n/g,'\n  '));}parts.push('');};walk('');if(scene.connections.length){parts.push('## Связи','');for(const e of scene.connections){const a=scene.objects.find(o=>o.id===e.from),b=scene.objects.find(o=>o.id===e.to);parts.push(`- ${a?.text||e.from} → ${b?.text||e.to}${e.label?' ('+e.label+')':''}`)}}return parts.join('\n');}
Object.assign(exports,{resizeText,textHeight,linesFrom,commonArea,appendNotes,moveToArea,organize,summarize,growParents});
