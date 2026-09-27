'use strict';
const {escapeHTML:esc,icon}=require('./components.js');
/** Minimal relation map of one object, in the visual language of the workflow graph: the current object in the
    centre, its parent above, children below, what it depends on to the left, what it blocks and relates to on the right.
    Read-only; the host edits relations and listens for iq-open {id} and iq-remove {id, linkId}. Narrow hosts get a list. */
const groups=[['parent','Родитель'],['dependsOn','Зависит от'],['blocks','Блокирует'],['related','Связана с'],['children','Подзадачи']];
const MAX_CHILDREN=6,NODE_H=64,GAP_X=44,GAP_Y=40,CAPTION=22;
function node(value){
 if(!value||typeof value.id!=='string'||typeof value.title!=='string')return null;
 return {id:value.id,key:typeof value.key==='string'?value.key:'',title:value.title,status:typeof value.status==='string'?value.status:'',tone:typeof value.tone==='string'?value.tone:'neutral',icon:typeof value.icon==='string'?value.icon:'checklist',linkId:typeof value.linkId==='string'?value.linkId:''};
}
function normalize(v){
 if(!v||typeof v!=='object')return null;
 const center=node(v.center);if(!center)return null;
 const list=items=>(Array.isArray(items)?items:[]).map(node).filter(Boolean).slice(0,40);
 return {center,parent:node(v.parent),dependsOn:list(v.dependsOn),blocks:list(v.blocks),related:list(v.related),children:list(v.children),childrenDone:Number.isFinite(v.childrenDone)?v.childrenDone:null};
}
function card(item,{current=false,removable=false,x=0,y=0,w=0}={}){
 const inner=`<span class="rm-node-meta">${icon(item.icon,15)}${item.key?`<span class="rm-node-key">${esc(item.key)}</span>`:''}${item.status?`<span class="rm-node-status" data-tone="${esc(item.tone)}">${esc(item.status)}</span>`:''}</span><span class="rm-node-title">${esc(item.title)}</span>`;
 const style=w?` style="--x:${x}px;--y:${y}px;--w:${w}px"`:'';
 return `<div class="rm-node${current?' rm-current':''}"${style}>${current?`<div class="rm-node-body" aria-current="true">${inner}</div>`:`<button type="button" class="rm-node-body" data-rm-open="${esc(item.id)}" aria-label="Открыть ${esc([item.key,item.title].filter(Boolean).join(' '))}">${inner}</button>`}${removable&&item.linkId?`<button type="button" class="rm-remove" data-rm-remove="${esc(item.linkId)}" data-rm-id="${esc(item.id)}" aria-label="Удалить связь с ${esc(item.key||item.title)}">${icon('x',14)}</button>`:''}</div>`;
}
function curve(x1,y1,x2,y2,vertical){
 if(vertical){const b=Math.max(16,Math.abs(y2-y1)*.5);return `M${x1} ${y1}C${x1} ${y1+b},${x2} ${y2-b},${x2} ${y2}`;}
 const d=x2>=x1?1:-1,b=Math.max(20,Math.abs(x2-x1)*.5);return `M${x1} ${y1}C${x1+d*b} ${y1},${x2-d*b} ${y2},${x2} ${y2}`;
}
class IqRelationMap extends HTMLElement {
 constructor(){super();this._value=null;this._width=0;this._events=null;this._observer=null;}
 get value(){return this._value?structuredClone(this._value):null;}
 set value(v){this._value=normalize(v);if(this.isConnected)this.render();}
 connectedCallback(){
  if(Object.prototype.hasOwnProperty.call(this,'value')){const v=this.value;delete this.value;this.value=v;}
  this._events?.abort();this._events=new AbortController();
  this.addEventListener('click',event=>{
   const remove=event.target.closest('[data-rm-remove]');
   if(remove){this.dispatchEvent(new CustomEvent('iq-remove',{bubbles:true,detail:{id:remove.dataset.rmId,linkId:remove.dataset.rmRemove}}));return;}
   const open=event.target.closest('[data-rm-open]');
   if(open)this.dispatchEvent(new CustomEvent('iq-open',{bubbles:true,detail:{id:open.dataset.rmOpen}}));
  },{signal:this._events.signal});
  this._observer=new ResizeObserver(()=>{const w=Math.round(this.clientWidth);if(w&&Math.abs(w-this._width)>2){this._width=w;this.render();}});
  this._observer.observe(this);this._width=Math.round(this.clientWidth);this.render();
 }
 disconnectedCallback(){this._events?.abort();this._observer?.disconnect();}
 render(){
  const v=this._value;
  if(!v){this.innerHTML='';return;}
  const empty=!v.parent&&!v.dependsOn.length&&!v.blocks.length&&!v.related.length&&!v.children.length;
  this.toggleAttribute('data-empty',empty);
  const removable=!this.hasAttribute('readonly');
  const width=this._width||this.clientWidth||0;
  // Narrow hosts: grouped list with the same cards.
  if(width<560){
   this.innerHTML=`<div class="rm-list">${groups.filter(([k])=>k==='parent'?v.parent:v[k].length).map(([k,label])=>`<section class="rm-list-group"><p class="rm-caption">${label}${k==='children'&&v.childrenDone!==null?` <span>${v.childrenDone} из ${v.children.length}</span>`:''}</p>${(k==='parent'?[v.parent]:v[k]).map(item=>card(item,{removable:removable&&['dependsOn','blocks','related'].includes(k)})).join('')}</section>`).join('')}</div>`;
   return;
  }
  const w=Math.min(216,Math.floor((width-2*GAP_X)/3)),cx=Math.round((width-w)/2),left=0,right=width-w;
  const side=[...v.blocks.map(x=>['blocks',x]),...v.related.map(x=>['related',x])];
  // Right column: "Блокирует" then "Связана с", each group with its own caption.
  const sideY=[];let cursor=0;side.forEach(([kind],i)=>{if(i>0&&kind!==side[i-1][0])cursor+=CAPTION;sideY.push(cursor);cursor+=NODE_H+16;});
  const sideH=side.length?cursor-16:0,leftH=v.dependsOn.length?v.dependsOn.length*(NODE_H+16)-16:0;
  const topY=v.parent?CAPTION+NODE_H+GAP_Y:0;
  const bandH=Math.max(sideH,leftH,NODE_H);
  const centerY=topY+CAPTION+Math.max(0,(bandH-NODE_H)/2);
  const html=[],paths=[];
  const captions=[];
  if(v.parent){html.push(card(v.parent,{x:cx,y:CAPTION,w}));captions.push([cx,0,'Родитель']);paths.push(`<path d="${curve(cx+w/2,CAPTION+NODE_H,cx+w/2,centerY,true)}" class="rm-edge"/>`);}
  html.push(card(v.center,{current:true,x:cx,y:centerY,w}));
  const stack=(items,x,kind)=>items.forEach((item,i)=>{
   const y=topY+CAPTION+i*(NODE_H+16);
   html.push(card(item,{x,y,w,removable}));
   if(kind==='dependsOn')paths.push(`<path d="${curve(x+w,y+NODE_H/2,cx,centerY+NODE_H/2,false)}" class="rm-edge" marker-end="url(#rm-arrow)"/>`);
   else paths.push(`<path d="${curve(cx+w,centerY+NODE_H/2,x,y+NODE_H/2,false)}" class="rm-edge${kind==='related'?' rm-related':''}" ${kind==='blocks'?'marker-end="url(#rm-arrow)"':''}/>`);
  });
  if(v.dependsOn.length){captions.push([left,topY,'Зависит от']);stack(v.dependsOn,left,'dependsOn');}
  if(side.length){
   captions.push([right,topY,v.blocks.length?'Блокирует':'Связана с']);
   side.forEach(([kind,item],i)=>{const y=topY+CAPTION+sideY[i];html.push(card(item,{x:right,y,w,removable}));
    if(v.blocks.length&&kind==='related'&&i===v.blocks.length)captions.push([right,y-CAPTION,'Связана с']);
    paths.push(`<path d="${curve(cx+w,centerY+NODE_H/2,right,y+NODE_H/2,false)}" class="rm-edge${kind==='related'?' rm-related':''}" ${kind==='blocks'?'marker-end="url(#rm-arrow)"':''}/>`);});
  }
  let height=Math.max(centerY+NODE_H,topY+CAPTION+bandH);
  if(v.children.length){
   const shown=v.children.slice(0,MAX_CHILDREN),more=v.children.length-shown.length,perRow=3,rows=Math.ceil((shown.length+(more?1:0))/perRow);
   const childTop=height+GAP_Y;captions.push([0,childTop,`Подзадачи${v.childrenDone!==null?` ${v.childrenDone} из ${v.children.length}`:''}`]);
   const cells=[...shown.map(x=>['node',x]),...(more?[['more',more]]:[])];
   cells.forEach(([type,item],i)=>{
    const row=Math.floor(i/perRow),inRow=Math.min(perRow,cells.length-row*perRow),col=i%perRow;
    const span=inRow*w+(inRow-1)*GAP_X,x=Math.round((width-span)/2+col*(w+GAP_X)),y=childTop+CAPTION+row*(NODE_H+16);
    if(type==='node'){html.push(card(item,{x,y,w}));paths.push(`<path d="${curve(cx+w/2,centerY+NODE_H,x+w/2,y,true)}" class="rm-edge"/>`);}
    else html.push(`<div class="rm-node rm-more" style="--x:${x}px;--y:${y}px;--w:${w}px"><span>Ещё ${item}</span></div>`);
   });
   height=childTop+CAPTION+rows*NODE_H+(rows-1)*16;
  }
  this.innerHTML=`<div class="rm-canvas" style="--h:${Math.ceil(height)}px"><svg class="rm-edges" width="${width}" height="${Math.ceil(height)}" aria-hidden="true"><defs><marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z"/></marker></defs>${paths.join('')}</svg>${captions.map(([x,y,text])=>`<p class="rm-caption" style="--x:${x}px;--y:${y}px">${esc(text)}</p>`).join('')}${html.join('')}</div>`;
 }
}
function registerRelationMap(){if(!customElements.get('iq-relation-map'))customElements.define('iq-relation-map',IqRelationMap);}
Object.assign(exports,{IqRelationMap,registerRelationMap});
