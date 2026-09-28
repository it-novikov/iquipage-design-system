'use strict';
const {escapeHTML:esc,icon}=require('./components.js');
/** Minimal relation map of one object, in the visual language of the workflow graph. Every group is a lane whose label
    names the role of its nodes towards the centre ("Блокируют эту задачу", "Ждут эту задачу"), so a label never reads
    as a statement about a single node. Read-only; the host edits relations and listens for iq-open {id} and
    iq-remove {id, linkId}. Narrow hosts get the same lanes as a list. */
const MAX_CHILDREN=6,NODE_H=76,GAP_X=44,GAP_Y=36,HEAD=30,PAD=8,ROW=8;
function node(value){
 if(!value||typeof value.id!=='string'||typeof value.title!=='string')return null;
 return {id:value.id,key:typeof value.key==='string'?value.key:'',title:value.title,status:typeof value.status==='string'?value.status:'',tone:typeof value.tone==='string'?value.tone:'neutral',icon:typeof value.icon==='string'?value.icon:'checklist',linkId:typeof value.linkId==='string'?value.linkId:'',done:value.done===true};
}
function normalize(v){
 if(!v||typeof v!=='object')return null;
 const center=node(v.center);if(!center)return null;
 const list=items=>(Array.isArray(items)?items:[]).map(node).filter(Boolean).slice(0,40);
 return {center,parent:node(v.parent),dependsOn:list(v.dependsOn),blocks:list(v.blocks),related:list(v.related),children:list(v.children),childrenDone:Number.isFinite(v.childrenDone)?v.childrenDone:null,labels:{center:'Эта задача',blocked:'Заблокирована',...(v.labels&&typeof v.labels==='object'?v.labels:{})}};
}
function lanes(v){
 const openBlockers=v.dependsOn.filter(n=>!n.done).length;
 return {
  parent:{title:v.labels.parent||'Родительская задача',icon:'stack',items:v.parent?[v.parent]:[]},
  dependsOn:{title:v.labels.dependsOn||'Блокируют эту задачу',icon:'lock',tone:openBlockers?'warning':'',items:v.dependsOn,removable:true},
  blocks:{title:v.labels.blocks||'Ждут эту задачу',icon:'clock',items:v.blocks,removable:true},
  related:{title:v.labels.related||'Связанные',icon:'link',items:v.related,removable:true},
  children:{title:v.labels.children||'Подзадачи',icon:'checklist',items:v.children,count:v.childrenDone!==null?`${v.childrenDone} из ${v.children.length}`:''}
 };
}
function card(item,{role='',current=false,removable=false,blocked=false,label}={}){
 const status=item.status?`<span class="rm-node-status" data-tone="${esc(item.tone)}">${item.done?icon('check',12):''}${esc(item.status)}</span>`:'';
 const meta=`<span class="rm-node-meta">${current?`<span class="rm-node-caption">${esc(label.center)}</span>`:`${icon(item.icon,14)}${item.key?`<span class="rm-node-key">${esc(item.key)}</span>`:''}`}${current&&blocked?`<span class="iq-badge soft warning rm-node-flag">${esc(label.blocked)}</span>`:status}</span>`;
 const inner=`${meta}<span class="rm-node-title">${esc(item.title)}</span>`;
 const name=[item.key,item.title,role,item.status].filter(Boolean).join(', ');
 return `<div class="rm-node${current?' rm-current':''}${item.done?' rm-done':''}">${current?`<div class="rm-node-body" aria-current="true">${inner}</div>`:`<button type="button" class="rm-node-body" data-rm-open="${esc(item.id)}" aria-label="${esc(name)}. Открыть">${inner}</button>`}${removable&&item.linkId?`<button type="button" class="rm-remove" data-rm-remove="${esc(item.linkId)}" data-rm-id="${esc(item.id)}" aria-label="Удалить связь с ${esc(item.key||item.title)}">${icon('x',14)}</button>`:''}</div>`;
}
const laneHead=l=>`<p class="iq-rel-lane-head"${l.tone?` data-tone="${l.tone}"`:''}>${icon(l.icon,15)}<span>${esc(l.title)}</span><small>${esc(l.count||String(l.items.length))}</small></p>`;
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
  // Layout uses the content box, so a host may pad the map (for example as an inset panel).
  const inner=()=>{const cs=getComputedStyle(this);return Math.round(this.clientWidth-parseFloat(cs.paddingLeft||'0')-parseFloat(cs.paddingRight||'0'));};
  this._observer=new ResizeObserver(()=>{const w=inner();if(w&&Math.abs(w-this._width)>2){this._width=w;this.render();}});
  this._observer.observe(this);this._width=inner();this.render();
 }
 disconnectedCallback(){this._events?.abort();this._observer?.disconnect();}
 render(){
  const v=this._value;
  if(!v){this.innerHTML='';return;}
  const L=lanes(v),blocked=L.dependsOn.tone==='warning';
  const empty=!v.parent&&!v.dependsOn.length&&!v.blocks.length&&!v.related.length&&!v.children.length;
  this.toggleAttribute('data-empty',empty);
  const removable=!this.hasAttribute('readonly'),width=this._width||this.clientWidth||0,roleOf={parent:'родительская задача',dependsOn:'блокирует эту задачу',blocks:'ждёт эту задачу',related:'связана с этой задачей',children:'подзадача'};
  // Narrow hosts: the same lanes as a list.
  if(width<560){
   this.innerHTML=`<div class="rm-list">${card(v.center,{current:true,blocked,label:v.labels})}${['parent','dependsOn','blocks','related','children'].filter(k=>L[k].items.length).map(k=>`<section class="iq-rel-lane">${laneHead(L[k])}${L[k].items.map(item=>card(item,{role:roleOf[k],removable:removable&&L[k].removable})).join('')}</section>`).join('')}</div>`;
   return;
  }
  const w=Math.min(216,Math.floor((width-2*GAP_X-4*PAD)/3)),lw=w+2*PAD,cx=Math.round((width-w)/2),html=[],paths=[],back=[];
  const laneH=n=>HEAD+n*NODE_H+(n-1)*ROW+PAD;
  const place=(lane,key,x,y)=>{
   back.push(`<section class="iq-rel-lane" style="--x:${x}px;--y:${y}px;--w:${lw}px;--h:${laneH(lane.items.length)}px">${laneHead(lane)}</section>`);
   return lane.items.map((item,i)=>{const nx=x+PAD,ny=y+HEAD+i*(NODE_H+ROW);html.push(`<div class="rm-slot" style="--x:${nx}px;--y:${ny}px;--w:${w}px">${card(item,{role:roleOf[key],removable:removable&&lane.removable})}</div>`);return {item,x:nx,y:ny};});
  };
  let top=0,parentBox=null;
  if(L.parent.items.length){parentBox=place(L.parent,'parent',cx-PAD,0)[0];top=laneH(1)+GAP_Y;}
  // Side lanes: blockers on the left; tasks that wait and related tasks on the right, stacked.
  const leftH=L.dependsOn.items.length?laneH(L.dependsOn.items.length):0;
  const rightLanes=['blocks','related'].filter(k=>L[k].items.length);
  const rightH=rightLanes.reduce((h,k,i)=>h+laneH(L[k].items.length)+(i?16:0),0);
  const band=Math.max(leftH,rightH,NODE_H+24);
  const cy=top+Math.round((band-NODE_H)/2);
  html.push(`<div class="rm-slot" style="--x:${cx}px;--y:${cy}px;--w:${w}px">${card(v.center,{current:true,blocked,label:v.labels})}</div>`);
  if(parentBox)paths.push(`<path d="${curve(cx+w/2,parentBox.y+NODE_H,cx+w/2,cy,true)}" class="rm-edge"/>`);
  if(leftH){const y=top+Math.round((band-leftH)/2);for(const b of place(L.dependsOn,'dependsOn',0,y))paths.push(`<path d="${curve(b.x+w,b.y+NODE_H/2,cx,cy+NODE_H/2,false)}" class="rm-edge${b.item.done?' rm-edge-done':' rm-edge-blocker'}" marker-end="url(#rm-arrow${b.item.done?'':'-warn'})"/>`);}
  let ry=top+Math.round((band-rightH)/2);
  for(const k of rightLanes){for(const b of place(L[k],k,width-lw,ry))paths.push(`<path d="${curve(cx+w,cy+NODE_H/2,b.x,b.y+NODE_H/2,false)}" class="rm-edge${k==='related'?' rm-related':''}" ${k==='blocks'?'marker-end="url(#rm-arrow)"':''}/>`);ry+=laneH(L[k].items.length)+16;}
  let height=top+band;
  if(L.children.items.length){
   const shown=L.children.items.slice(0,MAX_CHILDREN),more=L.children.items.length-shown.length,perRow=3,cells=[...shown,...(more?[null]:[])],rows=Math.ceil(cells.length/perRow);
   const inRow=Math.min(perRow,cells.length),span=inRow*w+(inRow-1)*GAP_X,x0=Math.round((width-span)/2)-PAD,y0=height+GAP_Y;
   const h=HEAD+rows*NODE_H+(rows-1)*ROW+PAD;
   back.push(`<section class="iq-rel-lane" style="--x:${x0}px;--y:${y0}px;--w:${span+2*PAD}px;--h:${h}px">${laneHead(L.children)}</section>`);
   cells.forEach((item,i)=>{const row=Math.floor(i/perRow),count=Math.min(perRow,cells.length-row*perRow),rowSpan=count*w+(count-1)*GAP_X,x=Math.round((width-rowSpan)/2+(i%perRow)*(w+GAP_X)),y=y0+HEAD+row*(NODE_H+ROW);
    if(item){html.push(`<div class="rm-slot" style="--x:${x}px;--y:${y}px;--w:${w}px">${card(item,{role:roleOf.children})}</div>`);paths.push(`<path d="${curve(cx+w/2,cy+NODE_H,x+w/2,y,true)}" class="rm-edge"/>`);}
    else html.push(`<div class="rm-slot rm-more" style="--x:${x}px;--y:${y}px;--w:${w}px"><span>Ещё ${more}</span></div>`);});
   height=y0+h;
  }
  this.innerHTML=`<div class="rm-canvas" style="--h:${Math.ceil(height)}px">${back.join('')}<svg class="rm-edges" width="${width}" height="${Math.ceil(height)}" aria-hidden="true"><defs><marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z"/></marker><marker id="rm-arrow-warn" class="rm-marker-warn" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z"/></marker></defs>${paths.join('')}</svg>${html.join('')}</div>`;
 }
}
function registerRelationMap(){if(!customElements.get('iq-relation-map'))customElements.define('iq-relation-map',IqRelationMap);}
Object.assign(exports,{IqRelationMap,registerRelationMap});
