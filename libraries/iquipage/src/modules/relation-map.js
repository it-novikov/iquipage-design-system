'use strict';
const {escapeHTML:esc,icon}=require('./components.js');
/** Relation map of one object («Ступица», vnext.26): what blocks it on the left, what waits for it and what is related on
    the right, the parent above, subtasks as a tree below. The edges of a side bundle into one trunk and the trunk carries
    the words («блокирует», «блокируют · 1 из 3 открыта», «ждут», «связана», «входит в», «подзадачи · 2 из 4»), so no
    column heading takes room. Where both sides are present and the words would squeeze the nodes, the trunks rise over
    the centre and the words sit above them. Read-only; the host edits relations and listens for iq-open {id} and
    iq-remove {id, linkId}. */
const MAX_CHILDREN=8,RUN=16,GAP=44,RAISED_RUN=12,RAISED_GAP=48,MIN_SIDE=220,LIFT=18,RAIL=10;
const ROLE={parent:'родительская задача',dependsOn:'блокирует эту задачу',blocks:'ждёт эту задачу',related:'связана с этой задачей',children:'подзадача'};
function item(value){
 if(!value||typeof value.id!=='string'||typeof value.title!=='string')return null;
 return {id:value.id,key:typeof value.key==='string'?value.key:'',title:value.title,status:typeof value.status==='string'?value.status:'',tone:typeof value.tone==='string'?value.tone:'neutral',icon:typeof value.icon==='string'?value.icon:'checklist',linkId:typeof value.linkId==='string'?value.linkId:'',done:value.done===true};
}
function normalize(v){
 if(!v||typeof v!=='object')return null;
 const center=item(v.center);if(!center)return null;
 const list=items=>(Array.isArray(items)?items:[]).map(item).filter(Boolean).slice(0,40);
 const labels=v.labels&&typeof v.labels==='object'?Object.fromEntries(Object.entries(v.labels).filter(([,text])=>typeof text==='string'&&text)):{};
 return {center,parent:item(v.parent),dependsOn:list(v.dependsOn),blocks:list(v.blocks),related:list(v.related),children:list(v.children),childrenDone:Number.isFinite(v.childrenDone)?v.childrenDone:null,labels:{center:'Эта задача',...labels}};
}
/** The words on the edges; labels.<group> replaces the verb of that group. */
function words(v){
 const L=v.labels,n=v.dependsOn.length,open=v.dependsOn.filter(x=>!x.done).length,many=(count,one,more)=>count===1?one:more;
 const state=n===1?(open?'':'закрыта'):open?`${open} из ${n} открыт${open===1?'а':'ы'}`:'все закрыты';
 return {
  dependsOn:{text:L.dependsOn||many(n,'блокирует','блокируют'),state,tone:open?'warning':'success'},
  blocks:{text:L.blocks||many(v.blocks.length,'ждёт','ждут')},
  related:{text:L.related||many(v.related.length,'связана','связаны')},
  parent:{text:L.parent||'входит в'},
  children:{text:L.children||'подзадачи'}
 };
}
/** Task state as a shape, not only a colour: an empty ring (to do), a half-filled ring (in work), a filled disc with a check (done). */
function stateGlyph(value){
 const state=value.done?'done':value.tone==='neutral'?'todo':'doing';
 const shape=state==='done'?'<circle cx="8" cy="8" r="7"/><path d="m5 8.2 2 2 4-4"/>':state==='todo'?'<circle cx="8" cy="8" r="6"/>':'<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z"/>';
 return `<svg class="rm-state" data-state="${state}" data-tone="${value.done?'success':esc(value.tone)}" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${shape}</svg>`;
}
function node(value,{role,removable=false,blocker=false,row=false}){
 const kind=value.icon==='stack'?'epic':value.icon==='bug'?'bug':'',open=blocker&&!value.done;
 const meta=`${stateGlyph(value)}${kind?`<span class="rm-node-kind">${icon(value.icon,14)}</span>`:''}${value.key?`<span class="rm-node-key">${esc(value.key)}</span>`:''}${open?`<span class="rm-node-lock">${icon('lock',12)}</span>`:''}`;
 const title=`<span class="rm-node-title">${esc(value.title)}</span>`,status=value.status?`<span class="rm-node-status">${esc(value.status)}</span>`:'';
 const name=[value.key,value.title,role,value.status].filter(Boolean).join(', ');
 const remove=removable&&value.linkId?`<button type="button" class="rm-remove" data-rm-remove="${esc(value.linkId)}" data-rm-id="${esc(value.id)}" aria-label="Удалить связь с ${esc(value.key||value.title)}">${icon('x',14)}</button>`:'';
 return `<div class="rm-node${value.done?' is-done':''}${open?' is-open':''}"${row?' data-shape="row"':''}${kind?` data-kind="${kind}"`:''}><button type="button" class="rm-node-body" data-rm-open="${esc(value.id)}" aria-label="${esc(name)}. Открыть">${row?`<span class="rm-node-meta">${meta}${title}${status}</span>`:`<span class="rm-node-meta">${meta}${status}</span>${title}`}</button>${remove}</div>`;
}
const word=(key,text,tone)=>text?`<span class="rm-word" data-for="${key}"${tone?` data-tone="${tone}"`:''}>${esc(text)}</span>`:'';
const r2=n=>Math.round(n*2)/2;
/** A horizontal S-curve: it leaves and arrives level, so bundled branches merge smoothly into their trunk. */
function curve(x1,y1,x2,y2){
 if(Math.abs(y2-y1)<1)return `M${r2(x1)} ${r2(y1)}H${r2(x2)}`;
 const b=Math.max(6,Math.abs(x2-x1)*.5),d=x2>=x1?1:-1;
 return `M${r2(x1)} ${r2(y1)}C${r2(x1+d*b)} ${r2(y1)},${r2(x2-d*b)} ${r2(y2)},${r2(x2)} ${r2(y2)}`;
}
const ARROW={right:(x,y)=>`M${r2(x)} ${r2(y)}l-7 -4v8z`,down:(x,y)=>`M${r2(x)} ${r2(y)}l-4 -7h8z`,up:(x,y)=>`M${r2(x)} ${r2(y)}l-4 7h8z`};
class IqRelationMap extends HTMLElement {
 constructor(){super();this._value=null;this._width=0;this._height=0;this._events=null;this._observer=null;this._frame=0;}
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
  // Edges follow the measured layout: redraw when the host is resized or the webfont changes line breaks.
  this._observer=new ResizeObserver(()=>{cancelAnimationFrame(this._frame);this._frame=requestAnimationFrame(()=>{if(Math.abs(this.clientWidth-this._width)>1||Math.abs(this.clientHeight-this._height)>1)this.layout();});});
  this._observer.observe(this);
  document.fonts?.ready.then(()=>{if(this.isConnected)this.layout();});
  this.render();
 }
 disconnectedCallback(){this._events?.abort();this._observer?.disconnect();cancelAnimationFrame(this._frame);}
 render(){
  const v=this._value;
  const empty=!v||!v.parent&&!v.dependsOn.length&&!v.blocks.length&&!v.related.length&&!v.children.length;
  this.toggleAttribute('data-empty',!!v&&empty);
  if(empty){this.innerHTML='';return;}
  const removable=!this.hasAttribute('readonly'),W=words(v);
  const left=v.dependsOn.length>0,right=v.blocks.length+v.related.length>0,sides=left&&right?'both':left?'left':right?'right':'none';
  const blockers=[...v.dependsOn].sort((a,b)=>(a.done?1:0)-(b.done?1:0));
  const group=(key,items,opts={})=>items.length?`<div class="rm-group" data-group="${key}">${items.map(x=>node(x,{role:ROLE[key],removable,...opts})).join('')}</div>`:'';
  const shown=v.children.slice(0,MAX_CHILDREN),more=v.children.length-shown.length,done=v.childrenDone===null?null:Math.min(Math.max(0,v.childrenDone),v.children.length);
  const tree=shown.length?`<div class="rm-tree"><p class="rm-tree-head" aria-hidden="true"><span>${esc(W.children.text)}</span>${done!==null?`<small>${done} из ${v.children.length}</small><span class="iq-progress"><span></span></span>`:''}</p><div class="rm-tree-nodes">${shown.map(x=>node(x,{role:ROLE.children,row:true})).join('')}</div>${more?`<p class="rm-tree-more">ещё ${more}</p>`:''}</div>`:'';
  this.innerHTML=`<div class="rm-graph"><svg class="rm-edges" aria-hidden="true" focusable="false"></svg>`
   +(v.parent?`<div class="rm-parent" data-sides="${sides}">${node(v.parent,{role:ROLE.parent,row:true})}</div>`:'')
   +`<div class="rm-band" data-sides="${sides}">${left?`<div class="rm-side" data-side="left">${group('dependsOn',blockers,{blocker:true})}</div>`:''}`
   +`<div class="rm-hub"><div class="rm-current" aria-current="true"><span class="rm-current-caption">${esc(v.labels.center)}</span>${v.center.key?`<span class="rm-current-key">${esc(v.center.key)}</span>`:''}</div></div>`
   +`${right?`<div class="rm-side" data-side="right">${group('blocks',v.blocks)}${group('related',v.related)}</div>`:''}</div>${tree}`
   +`<div class="rm-words" aria-hidden="true">${left?word('dependsOn',W.dependsOn.text,W.dependsOn.tone)+word('dependsOn-state',W.dependsOn.state,W.dependsOn.tone):''}${v.blocks.length?word('blocks',W.blocks.text):''}${v.related.length?word('related',W.related.text):''}${v.parent?word('parent',W.parent.text):''}</div></div>`;
  const bar=this.querySelector('.rm-tree-head .iq-progress');
  if(bar)bar.style.setProperty('--progress',`${Math.round(done/v.children.length*100)}%`);
  this.layout();
 }
 /** Sizes the gaps from the words, picks inline or raised words, then draws the edges by measurement. */
 layout(){
  this._width=this.clientWidth;this._height=this.clientHeight;
  const g=this.querySelector('.rm-graph');if(!g||!g.clientWidth)return;
  const band=g.querySelector('.rm-band'),hub=g.querySelector('.rm-current'),sides=band.dataset.sides;
  const w=key=>g.querySelector(`.rm-word[data-for="${key}"]`),size=el=>el?{w:el.offsetWidth,h:el.offsetHeight}:{w:0,h:0};
  const verb=w('dependsOn'),state=w('dependsOn-state'),upper=w('blocks')||w('related'),lower=w('blocks')&&w('related');
  for(const el of g.querySelectorAll('.rm-word'))el.style.maxWidth='';
  // Inline: each gap is as wide as its words. Raised: the gaps shrink and the words move over the centre.
  const gapL=Math.max(GAP,Math.ceil(RUN+Math.max(size(verb).w,size(state).w)+18)),gapR=Math.max(GAP,Math.ceil(RUN+Math.max(size(w('blocks')).w,size(w('related')).w)+18));
  const raised=sides==='both'&&(band.clientWidth-hub.offsetWidth-gapL-gapR)/2<MIN_SIDE;
  g.toggleAttribute('data-raised',raised);
  band.style.setProperty('--rm-gap-l',`${raised?RAISED_GAP:gapL}px`);band.style.setProperty('--rm-gap-r',`${raised?RAISED_GAP:gapR}px`);
  let rise=0,fall=0;
  if(raised){
   // The words over the centre stop short of its axis, where the parent edge rises.
   const room=`${Math.floor(hub.offsetWidth/2+RAISED_GAP-RAISED_RUN-8)}px`;
   for(const el of [verb,state,upper,lower])if(el)el.style.maxWidth=room;
   rise=Math.ceil(Math.max(size(verb).h+size(state).h,size(upper).h)+LIFT+6);fall=lower?Math.ceil(size(lower).h+LIFT+6):0;
  }
  band.style.setProperty('--rm-rise',`${rise}px`);band.style.setProperty('--rm-fall',`${fall}px`);
  this.draw(g,raised);
  this._width=this.clientWidth;this._height=this.clientHeight;
 }
 draw(g,raised){
  const R=g.getBoundingClientRect(),svg=g.querySelector('.rm-edges'),out=[];
  const box=el=>{const r=el.getBoundingClientRect(),x=r.left-R.left,y=r.top-R.top;return {x,y,r:x+r.width,b:y+r.height,cx:x+r.width/2,cy:y+r.height/2};};
  const path=(d,tone)=>out.push(`<path class="rm-edge" d="${d}"${tone?` data-tone="${tone}"`:''}/>`);
  const arrow=(dir,x,y,tone)=>out.push(`<path class="rm-arrow" d="${ARROW[dir](x,y)}"${tone?` data-tone="${tone}"`:''}/>`);
  const word=key=>g.querySelector(`.rm-word[data-for="${key}"]`);
  const place=(el,x,y)=>{if(el){el.style.left=`${r2(x)}px`;el.style.top=`${r2(y)}px`;}};
  const nodes=key=>[...g.querySelectorAll(`[data-group="${key}"]>.rm-node`)].map(el=>({b:box(el),tone:el.classList.contains('is-done')?'done':el.classList.contains('is-open')?'open':''}));
  const c=box(g.querySelector('.rm-current'));
  // Blockers → this task.
  const L=nodes('dependsOn');
  if(L.length){
   const trunk=L.some(n=>n.tone==='open')?'open':'done',verb=word('dependsOn'),state=word('dependsOn-state'),vh=verb.offsetHeight,sh=state?.offsetHeight||0;
   const jx=Math.max(...L.map(n=>n.b.r))+(raised?RAISED_RUN:RUN);
   if(!raised){
    const ty=c.cy,tip=c.x-2,single=L.length===1,start=single?L[0].b.r:jx;
    if(single)path(curve(L[0].b.r,L[0].b.cy,tip-6,ty),trunk);
    else{L.forEach(n=>path(curve(n.b.r,n.b.cy,jx,ty),n.tone));path(`M${r2(jx)} ${r2(ty)}H${r2(tip-6)}`,trunk);}
    arrow('right',tip,ty,trunk);
    const mid=(start+c.x)/2;
    place(verb,mid-verb.offsetWidth/2,ty-4-vh);if(state)place(state,mid-state.offsetWidth/2,ty+4);
   }else{
    const yt=c.y-LIFT,ex=c.x+14;
    L.forEach(n=>path(curve(n.b.r,n.b.cy,jx,yt),n.tone));
    path(`M${r2(jx)} ${r2(yt)}H${r2(ex-8)}Q${r2(ex)} ${r2(yt)} ${r2(ex)} ${r2(yt+8)}V${r2(c.y-7)}`,trunk);
    arrow('down',ex,c.y-1,trunk);
    place(state,jx+2,yt-4-sh);place(verb,jx+2,yt-4-sh-vh);
   }
  }
  // This task → tasks that wait for it; this task — related tasks.
  const groups=['blocks','related'].map(key=>({key,list:nodes(key)})).filter(x=>x.list.length);
  groups.forEach(({key,list},i)=>{
   const tone=key==='related'?'related':'',arrowed=key==='blocks',label=word(key),lw=label.offsetWidth,lh=label.offsetHeight;
   const jx=Math.min(...list.map(n=>n.b.x))-(raised?RAISED_RUN:RUN),end=n=>n.b.x-(arrowed?7:1);
   const branch=(x,y)=>list.forEach(n=>{path(curve(x,y,end(n),n.b.cy),tone);if(arrowed)arrow('right',n.b.x-1,n.b.cy,tone);});
   if(!raised){
    const ty=groups.length===2?c.cy+(i?7:-7):c.cy,single=list.length===1;
    if(single)branch(c.r,ty);
    else{path(`M${r2(c.r)} ${r2(ty)}H${r2(jx)}`,tone);branch(jx,ty);}
    const mid=(c.r+(single?list[0].b.x:jx))/2;
    place(label,mid-lw/2,i?ty+4:ty-4-lh);
   }else{
    const up=i===0,ex=c.r-14,yt=up?c.y-LIFT:c.b+LIFT;
    path(`M${r2(ex)} ${r2(up?c.y:c.b)}V${r2(up?yt+8:yt-8)}Q${r2(ex)} ${r2(yt)} ${r2(ex+8)} ${r2(yt)}H${r2(jx)}`,tone);
    branch(jx,yt);
    place(label,jx-2-lw,up?yt-4-lh:yt+4);
   }
  });
  // This task is part of the parent.
  const parent=g.querySelector('.rm-parent>.rm-node');
  if(parent){
   const p=box(parent),x=Math.min(Math.max(c.cx,p.x+16),p.r-16);
   path(Math.abs(x-c.cx)<1?`M${r2(c.cx)} ${r2(c.y)}V${r2(p.b+7)}`:`M${r2(c.cx)} ${r2(c.y)}C${r2(c.cx)} ${r2((c.y+p.b)/2)},${r2(x)} ${r2((c.y+p.b)/2)},${r2(x)} ${r2(p.b+7)}`,'');
   arrow('up',x,p.b+1,'');
   place(word('parent'),x+6,p.b+4);
  }
  // Subtasks hang on a rail at the left edge.
  const tree=g.querySelector('.rm-tree');
  if(tree){
   const head=box(tree.querySelector('.rm-tree-head')),rows=[...tree.querySelectorAll('.rm-tree-nodes>.rm-node')].map(box),last=rows[rows.length-1],y=head.y-8,r=8;
   path(`M${r2(c.cx)} ${r2(c.b)}V${r2(y-r)}Q${r2(c.cx)} ${r2(y)} ${r2(c.cx-r)} ${r2(y)}H${RAIL+r}Q${RAIL} ${r2(y)} ${RAIL} ${r2(y+r)}V${r2(last.cy)}H${r2(last.x)}`,'');
   rows.slice(0,-1).forEach(n=>path(`M${RAIL} ${r2(n.cy)}H${r2(n.x)}`,''));
  }
  svg.setAttribute('width',String(g.offsetWidth));svg.setAttribute('height',String(g.offsetHeight));
  svg.innerHTML=out.join('');
 }
}
function registerRelationMap(){if(!customElements.get('iq-relation-map'))customElements.define('iq-relation-map',IqRelationMap);}
// relationWords and relationNode are internal; core.js exports only the element and its registration.
Object.assign(exports,{IqRelationMap,registerRelationMap,relationWords:words,relationNode:node});
