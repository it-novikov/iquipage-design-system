import dep0 from './advanced-core.js';
import dep1 from './advanced-base.js';
import dep2 from './components.js';
import dep3 from './ui.js';
import dep4 from './capabilities.js';
const exports={};
const deps={"./advanced-core.js":dep0,"./advanced-base.js":dep1,"./components.js":dep2,"./ui.js":dep3,"./capabilities.js":dep4};
(function(exports,require){
'use strict';
const C=require('./advanced-core.js'),{IqDataSurface,button,ib}=require('./advanced-base.js'),{icon}=require('./components.js'),U=require('./ui.js');
const kinds={note:{label:'Заметка',icon:'text'},task:{label:'Задача',icon:'checkCircle'},checklist:{label:'Чек-лист',icon:'checklist'},media:{label:'Материал',icon:'image'},group:{label:'Группа',icon:'folder'}};
const relations={relates:'Связано с',depends:'Предшествует',supports:'Подтверждает'};
function descendants(nodes,id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const n of nodes)if(n.parentId&&ids.has(n.parentId)&&!ids.has(n.id)){ids.add(n.id);changed=true}}return ids}
function edgeGeometry(s,t,offset=0){
 const sx=s.x+s.width/2,sy=s.y+s.height/2,tx=t.x+t.width/2,ty=t.y+t.height/2;
 const horizontal=Math.abs(tx-sx)>=Math.abs(ty-sy)*.75;
 const forward=horizontal?tx>=sx:ty>=sy;
 const sourceSide=horizontal?(forward?'right':'left'):(forward?'bottom':'top');
 const targetSide=horizontal?(forward?'left':'right'):(forward?'top':'bottom');
 const x1=horizontal?(forward?s.x+s.width:s.x):sx,y1=horizontal?sy:(forward?s.y+s.height:s.y);
 const x2=horizontal?(forward?t.x:t.x+t.width):tx,y2=horizontal?ty:(forward?t.y:t.y+t.height);
 const dir=forward?1:-1,bend=Math.max(24,Math.min(140,Math.abs(horizontal?x2-x1:y2-y1)*.5));
 const path=horizontal?`M${x1} ${y1}C${x1+dir*bend} ${y1},${x2-dir*bend} ${y2},${x2} ${y2}`:`M${x1} ${y1}C${x1} ${y1+dir*bend},${x2} ${y2-dir*bend},${x2} ${y2}`;
 return{path,x:(x1+x2)/2+(horizontal?0:18),y:(y1+y2)/2+(horizontal?-12:0),sourceSide,targetSide};
}
class IqGraph extends IqDataSurface{
 static get observedAttributes(){return [...super.observedAttributes,'mode']}
 constructor(){super();this.session=new C.EditSession({revision:0,nodes:[],edges:[]});this._viewport={x:30,y:30,zoom:.85};this._presence=[];this.selectedEdge='';this.linkFrom='';this.showArchive=false;this.listMode=false;this.fitted=false;this.width=0;this.panMode=false;this.fullscreen=false;this.libraryOpen=false}
 get selection(){return this.selectedEdge?{kind:'edge',id:this.selectedEdge}:this.selectedId?{kind:'node',id:this.selectedId}:null}
 set selection(v){this._ensureSelection=false;if(v===null){this.selectedId='';this.selectedEdge='';this.schedule();return}if(!v||!['node','edge'].includes(v.kind)||!this.session.value[v.kind==='node'?'nodes':'edges'].some(x=>x.id===v.id))throw new TypeError('Выбор должен ссылаться на существующий объект или связь');this.selectedId=v.kind==='node'?v.id:'';this.selectedEdge=v.kind==='edge'?v.id:'';this.schedule()}
 get viewport(){return {...this._viewport}}
 set viewport(v){if(!v||![v.x,v.y,v.zoom].every(Number.isFinite)||v.zoom<.25||v.zoom>2)throw new TypeError('Обзор: конечные x/y, zoom от .25 до 2');this._viewport={x:v.x,y:v.y,zoom:v.zoom};this.fitted=true;if(this.isConnected)this.applyViewport(false)}
 cleanup(){cancelAnimationFrame(this.selectFrame)}
 validate(value){const d=C.graphData(value);if(d.nodes.length>400||d.edges.length>1200)throw new RangeError('Лимит поверхности: 400 узлов и 1200 связей');return d}
 set presence(value){if(!Array.isArray(value))throw new TypeError('presence должен быть массивом');this._presence=value.map((p,i)=>{if(!p||typeof p.label!=='string'||p.cursor&&![p.cursor.x,p.cursor.y].every(Number.isFinite))throw new TypeError('Участнику нужны label и корректные координаты');return C.clone({...p,id:String(p.id??i)})});this.schedule()}get presence(){return C.clone(this._presence)}
 get mode(){return this.getAttribute('mode')==='workflow'?'workflow':'map'}
 set mode(value){if(!['map','workflow'].includes(value))throw new TypeError('mode: map или workflow');this.setAttribute('mode',value)}
 start(){const signal=this.events.signal;this.addEventListener('pointerdown',e=>this.beginPointer(e),{signal});this.addEventListener('keydown',e=>this.keys(e),{signal});this.addEventListener('click',e=>{if(this.ignoreClick){this.ignoreClick=false;return}const card=e.target.closest('[data-node-id]');if(card&&!e.target.closest('button,input,a,textarea'))this.select(card.dataset.nodeId);const edge=e.target.closest('[data-edge-id]');if(edge&&!e.target.closest('[data-pro-action]')){this.selectedEdge=edge.dataset.edgeId;this.selectedId='';this.emit('iq-selection',{kind:'edge',id:this.selectedEdge});this.schedule()}},{signal});
 this.addEventListener('change',e=>{const c=e.target.closest('[data-check-item]');if(c&&!this.locked){const n=this.data.nodes.find(n=>n.id===c.dataset.node);if(!n||!this.can('editContent',n,'items'))return;const next=this.data;next.nodes.find(x=>x.id===n.id).items[+c.dataset.checkItem].checked=c.checked;this.preview(next,{kind:'check',id:n.id,index:+c.dataset.checkItem})}},{signal});
 this.addEventListener('wheel',e=>{if(!e.target.closest('.graph-canvas')||!(e.ctrlKey||e.metaKey))return;e.preventDefault();this.zoom(e.deltaY>0?-.1:.1,e.clientX,e.clientY)},{signal,passive:false});
 this.addEventListener('error',e=>{if(e.target.matches?.('.graph-node img')){const img=e.target;const fallback=img.nextElementSibling;if(fallback){img.hidden=true;fallback.hidden=false}}},{signal,capture:true});
 this.resizeObserver=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width||0;if(Math.abs(width-this.width)>1){this.width=width;if(width>0&&!this.fitted)requestAnimationFrame(()=>this.fit());}});this.resizeObserver.observe(this);
 }
 ensureVisible(n,notify=true){const c=this.querySelector('.graph-canvas');if(!c?.clientWidth)return;let z=this.viewport.zoom;if(n.width*z>c.clientWidth-40)z=Math.max(.25,(c.clientWidth-40)/n.width);this._viewport.zoom=z;let left=n.x*z+this.viewport.x,top=n.y*z+this.viewport.y;if(left<20)this._viewport.x+=20-left;else if(left+n.width*z>c.clientWidth-20)this._viewport.x-=left+n.width*z-c.clientWidth+20;if(top<20)this._viewport.y+=20-top;else if(top+n.height*z>c.clientHeight-70)this._viewport.y-=top+n.height*z-c.clientHeight+70;this.applyViewport(notify)}
 select(id){
 this.issue='';this._ensureSelection=true;this.selectedId=id;this.selectedEdge='';this.emit('iq-selection',{kind:'node',id});this.schedule();
 if(this.clientWidth<=680){cancelAnimationFrame(this.selectFrame);this.selectFrame=requestAnimationFrame(()=>{
  if(!this.isConnected||this.disposed||this.selectedId!==id)return;
  const panel=this.querySelector('.graph-inspector'),heading=panel?.querySelector('h4');
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
  panel?.scrollIntoView({block:'start',behavior:'instant'});
 })}
}
 nodes(){return this.session.value.nodes.filter(n=>!n.archived)}
 bounds(){const nodes=this.nodes();if(!nodes.length)return{x:0,y:0,width:800,height:500};const x=Math.min(...nodes.map(n=>n.x)),y=Math.min(...nodes.map(n=>n.y)),right=Math.max(...nodes.map(n=>n.x+n.width)),bottom=Math.max(...nodes.map(n=>n.y+n.height));return{x,y,width:right-x,height:bottom-y}}
 fit(){const el=this.querySelector('.graph-canvas');if(!el||!el.clientWidth)return;const b=this.bounds(),zoom=Math.min(1,Math.max(.25,Math.min((el.clientWidth-56)/b.width,(el.clientHeight-126)/b.height)));this.viewport={x:(el.clientWidth-b.width*zoom)/2-b.x*zoom,y:Math.max(38,(el.clientHeight-86-b.height*zoom)/2)-b.y*zoom,zoom};this.fitted=true;this.applyViewport()}
 applyViewport(notify=true){const world=this.querySelector('.graph-world');if(world)world.style.transform=`translate(${this.viewport.x}px,${this.viewport.y}px) scale(${this.viewport.zoom})`;const value=this.querySelector('[data-zoom-value]');if(value)value.textContent=Math.round(this.viewport.zoom*100)+'%';this.drawMinimap();if(notify)this.emit('iq-viewport',{...this._viewport})}
 zoom(amount,cx,cy){const el=this.querySelector('.graph-canvas');if(!el)return;const rect=el.getBoundingClientRect(),old=this.viewport.zoom,z=Math.max(.25,Math.min(2,old+amount)),x=cx==null?rect.width/2:cx-rect.left,y=cy==null?rect.height/2:cy-rect.top;this.viewport={zoom:z,x:x-(x-this.viewport.x)*z/old,y:y-(y-this.viewport.y)*z/old};this.applyViewport()}
 // Keep unsubmitted inspector fields when only the toolbar/view arrangement changes.
 // An authoritative model update or explicit preview invalidates the old field snapshot.
 draw(){
  const old=this.querySelector('.graph-inspector');
  const selectors=['[data-graph-field]','[data-graph-items]','[data-graph-edge-label]','[data-graph-target]','[data-graph-kind]'];
  const fields=old?selectors.flatMap(sel=>[...old.querySelectorAll(sel)].map((el,i)=>({sel,i,value:el.value}))):[];
  const before=old?._modelSignature;
  super.draw();
  const panel=this.querySelector('.graph-inspector');
  const entity=this.selectedEdge?this.session.value.edges.find(e=>e.id===this.selectedEdge):this.session.value.nodes.find(n=>n.id===this.selectedId);
  const signature=entity?JSON.stringify(entity):'';
  if(panel&&before===signature)for(const f of fields){const el=panel.querySelectorAll(f.sel)[f.i];if(el&&!el.disabled&&!el.closest('[hidden]')&&el.value!==f.value)el.value=f.value}
  if(panel)panel._modelSignature=signature;
 }
 render(){
  const d=this.session.value,disabled=this.locked?'disabled':'',selected=d.nodes.find(n=>n.id===this.selectedId),edge=d.edges.find(e=>e.id===this.selectedEdge);
  const workflow=this.mode==='workflow',visible=this.nodes();
  this.classList.add('iq-pro-host');
  this.innerHTML=`<section class="iq-pro iq-graph graph-studio ${workflow?'is-workflow':'is-map'} ${this.listMode?'force-list':''} ${this.fullscreen?'is-expanded':''}" aria-label="${workflow?'Граф процесса':'Карта идей'}">
   <header class="iq-pro-toolbar graph-studio-header"><div class="iq-pro-heading"><span class="iq-pro-eyebrow">${workflow?'ПОРЯДОК РАБОТЫ':'ПРОСТРАНСТВО РЕШЕНИЙ'}</span><h3>${C.escape(d.title||(workflow?'Рабочий процесс':'Карта идей'))}</h3><span class="iq-pro-subtitle">${workflow?'Проследите путь от запроса до результата.':'Соберите основания, свяжите выводы, определите следующий шаг.'}</span></div>
    <div class="iq-pro-actions"><div class="iq-pro-segment graph-view-switch" role="group" aria-label="Представление">${button(workflow?'Схема':'Холст','view','','data-view="map" aria-pressed="'+!this.listMode+'"')}${button('Список','view','','data-view="list" aria-pressed="'+this.listMode+'"')}</div>${ib('Упорядочить объекты','layout','grid',disabled)}${ib(this.fullscreen?'Свернуть карту':'Развернуть карту','expand',this.fullscreen?'collapse':'expand')}</div>
   </header>
   ${this.readonly&&this.state==='ready'?'<div class="iq-pro-readonly">'+icon('lock',16)+'Только чтение. Объекты и связи доступны для просмотра.</div>':''}${this.stateMarkup(workflow?'процесс':'карту')}
   ${this.state==='ready'?`<div class="graph-workbench ${this.libraryOpen?'library-open':''}">
    <nav class="graph-toolrail" aria-label="Инструменты карты">${ib('Добавить объект','library','plus',`aria-expanded="${!!this.libraryOpen}"`)}${ib('Выбрать объект','select-tool','upRight',`aria-pressed="${!this.panMode}"`)}${ib('Переместить холст','pan','grip',`aria-pressed="${this.panMode}"`)}<span class="graph-rail-divider"></span>${ib('Отменить последнее применение','undo','undo',this.session.history.length&&!this.locked&&!this.session.dirty?'':'disabled')}${ib('Архив объектов','archive','folder',`aria-expanded="${this.showArchive}"`)}</nav>
    ${this.libraryOpen?this.libraryMarkup(workflow,disabled):''}
    <div class="graph-body ${selected||edge?'has-inspector':''}"><div class="graph-main">
     <div class="graph-canvas ${this.panMode?'is-panning':''} ${this.linkFrom?'is-linking':''}" tabindex="0" aria-label="${workflow?'Схема процесса':'Холст идей'}. Стрелки перемещают обзор. Выберите объект для редактирования.">
      <div class="graph-world">${this.edgeSVG(d)}${visible.slice().sort((a,b)=>(a.kind==='group'?-1:0)-(b.kind==='group'?-1:0)).map(n=>this.nodeMarkup(n)).join('')}${this._presence.filter(p=>p.cursor).map((p,i)=>`<span class="graph-cursor presence-${i%4}" style="left:${p.cursor.x}px;top:${p.cursor.y}px">${icon('upRight',18)}<b>${C.escape(p.label)}</b></span>`).join('')}</div>
      ${!visible.length?`<div class="graph-empty iq-pro-state">${icon(workflow?'link':'text',28)}<h3>${workflow?'Начните с первого этапа':'Какая идея требует решения?'}</h3><p>Кнопка «Добавить объект» открывает доступные типы. Все изменения можно отменить.</p></div>`:''}
      <div class="graph-canvas-caption"><span>${visible.filter(n=>n.kind!=='group').length} объектов</span><span>${d.edges.filter(e=>visible.some(n=>n.id===e.source)&&visible.some(n=>n.id===e.target)).length} связей</span></div>
      <div class="graph-viewport-controls" aria-label="Масштаб и обзор">${ib('Уменьшить','zoom-out','minus')}<span data-zoom-value>${Math.round(this.viewport.zoom*100)}%</span>${ib('Увеличить','zoom-in','plus')}<span class="graph-control-divider"></span>${ib('Показать всю карту','fit','expand')}${ib('Показать выбранный объект','locate','expand',selected?'':'disabled')}</div>
      <button type="button" class="graph-minimap" aria-label="Миникарта. Нажмите, чтобы центрировать обзор" data-pro-action="minimap"></button>
      ${this.linkFrom?`<div class="graph-link-notice" role="status"><span>${icon('link',16)} Выберите вход другого объекта</span>${button('Отменить','cancel-link')}</div>`:''}
     </div>${this.textAlternative(d)}
     ${this.showArchive?`<section class="graph-archive-list" aria-label="Архив"><div class="graph-section-heading"><h4>Архив</h4>${ib('Закрыть архив','archive','x')}</div>${d.nodes.some(n=>n.archived)?d.nodes.filter(n=>n.archived).map(n=>`<div><span>${C.escape(this.visibleNode(n).title)}</span>${button('Вернуть','restore','',`data-node="${C.escape(n.id)}" ${disabled}`)}</div>`).join(''):'<p class="iq-pro-subtitle">Архив пуст. Удалённые с холста объекты можно будет восстановить здесь.</p>'}</section>`:''}
    </div>${selected?this.inspector(selected):edge?this.edgeInspector(edge):''}</div>
   </div>`:''}
   ${this.issue&&!this.session.dirty?`<p class="iq-pro-error iq-pro-inline-error" role="alert">${C.escape(this.issue)}</p>`:''}${this.dock()}
   <footer class="iq-pro-foot graph-studio-footer"><span>${icon('info',15)}${this.linkFrom?'Связь появится после выбора второго объекта.':'Выберите объект или связь, чтобы открыть свойства.'}</span><details class="graph-keyboard-help"><summary>Управление ${icon('chevron',14)}</summary><div>Перенос — за заголовок. Масштаб — Ctrl/⌘ + колесо. Alt + стрелки — двигать объект; Alt + Shift + стрелки — менять размер. Escape — отменить. В списке все действия доступны без перетаскивания.</div></details></footer>
  </section>`;
  this._nodeEls=new Map([...this.querySelectorAll('[data-node-id]')].map(e=>[e.dataset.nodeId,e]));
  this._edgeEls=new Map([...this.querySelectorAll('.graph-edge')].map(e=>[e.dataset.edgeId,e]));this._miniDirty=true;
  this.applyViewport(false);if(selected&&this._ensureSelection){this._ensureSelection=false;this.ensureVisible(selected)}if(!this.fitted)requestAnimationFrame(()=>this.fit());
 }
 libraryMarkup(workflow,disabled){
  const types=workflow?[['note','Запрос','Точка входа в процесс','text'],['task','Действие','Работа с понятным результатом','checkCircle'],['checklist','Проверка','Критерии и решение о переходе','checklist'],['media','Материал','Документ или изображение','file'],['group','Группа','Объединение этапов','folder']]:Object.entries(kinds).map(([key,v])=>[key,v.label,{note:'Мысль, вопрос или гипотеза',task:'Следующий практический шаг',checklist:'Что должно быть проверено',media:'Изображение с пояснением',group:'Общий контекст объектов'}[key],v.icon]);
  return `<aside class="graph-library" aria-label="Добавить объект"><div class="graph-section-heading"><h4>Добавить</h4>${ib('Закрыть библиотеку','library','x')}</div><p class="iq-pro-subtitle">Объект появится в центре текущего обзора.</p>${types.map(([key,label,sub,glyph])=>`<button type="button" class="graph-library-item" data-pro-action="add" data-kind="${key}" ${disabled}><span class="graph-type-icon type-${key}">${icon(glyph,18)}</span><span><b>${label}</b><small>${sub}</small></span>${icon('plus',15)}</button>`).join('')}</aside>`;
 }
 nodeMarkup(n){
  const workflow=this.mode==='workflow',selected=this.selectedId===n.id,lock=this.locked||!this.can('move',n),presence=this._presence.filter(p=>p.editingNodeId===n.id);
  const out=this.session.value.edges.find(e=>e.source===n.id),into=this.session.value.edges.find(e=>e.target===n.id);
  const outTarget=out&&this.session.value.nodes.find(x=>x.id===out.target),inSource=into&&this.session.value.nodes.find(x=>x.id===into.source);
  const outSide=outTarget?edgeGeometry(n,outTarget).sourceSide:'right',inSide=inSource?edgeGeometry(inSource,n).targetSide:'left';
  const roleLabel=workflow?({note:'Запрос',task:'Действие',checklist:'Проверка',media:'Материал',group:'Этапы'}[n.kind]):kinds[n.kind].label;
  const state=n.status==='error'?`<span class="graph-node-state">${icon('xCircle',14)} Требует проверки</span>`:n.status==='done'?`<span class="graph-node-state is-done">${icon('check',14)} Готово</span>`:'';
  let content='';
  if(n.kind==='checklist')content=`<div class="graph-checklist">${(n.items||[]).map((item,i)=>`<label><input type="checkbox" data-check-item="${i}" data-focus-key="check-${C.escape(n.id)}-${i}" data-node="${C.escape(n.id)}" ${item.checked?'checked':''} ${lock?'disabled':''}><span>${C.escape(item.label)}</span></label>`).join('')}</div>`;
  else if(n.kind==='media'){const url=C.safeMedia(n.url);content=url?`<div class="graph-image-frame"><img draggable="false" src="${C.escape(url)}" alt="${C.escape(n.alt||n.title)}" loading="lazy"><span class="graph-media-empty" hidden>${icon('image',24)}Изображение недоступно</span></div>`:`<div class="graph-media-empty">${icon('image',24)}<span>Добавьте изображение<br>через свойства объекта</span></div>`}
  else if(n.kind!=='group')content=`<p>${C.escape(n.text||'Добавьте содержание в свойствах объекта.')}</p>`;
  return `<article class="graph-node is-${n.kind} ${selected?'is-selected':''} ${n.status==='error'?'is-error':''} ${n.status==='disabled'?'is-disabled':''}" data-node-id="${C.escape(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px" tabindex="0" role="group" data-focus-key="node-${C.escape(n.id)}" aria-label="${C.escape(roleLabel+': '+n.title)}" ${selected?'aria-current="true"':''}>
   <div class="graph-node-head" data-node-drag="${C.escape(n.id)}"><span><span class="graph-type-icon type-${n.kind}">${icon(kinds[n.kind].icon,16)}</span>${roleLabel}</span>${n.readonly?icon('lock',14):`<button type="button" class="graph-node-more" data-pro-action="select-node" data-node="${C.escape(n.id)}" aria-label="Свойства: ${C.escape(n.title)}">${icon('more',16)}</button>`}</div>
   <div class="graph-node-content"><h4>${C.escape(n.title)}</h4>${content}</div>${state}
   ${presence.length?`<span class="graph-edit-presence">${icon('users',14)}${C.escape(presence[0].label)} редактирует</span>`:''}
   ${n.kind!=='group'?`<button type="button" class="graph-port in side-${inSide}" aria-label="Вход: ${C.escape(n.title)}" data-pro-action="port-in" data-node="${C.escape(n.id)}" ${lock||this.linkFrom&&(this.linkFrom===n.id||this.session.value.edges.some(e=>e.source===this.linkFrom&&e.target===n.id))?'disabled':''}></button><button type="button" class="graph-port out side-${outSide}" aria-label="Связать: ${C.escape(n.title)}" data-pro-action="port-out" data-node="${C.escape(n.id)}" ${lock?'disabled':''}></button>`:''}
   ${selected&&!lock?`<span class="graph-resize" data-node-resize="${C.escape(n.id)}" aria-hidden="true"></span>`:''}</article>`;
 }
 edgeSVG(d){
 const nodes=this.nodes(),by=new Map(nodes.map(n=>[n.id,n])),b=this.bounds();
 return `<svg class="graph-edges" width="${Math.max(1600,b.x+b.width+300)}" height="${Math.max(1000,b.y+b.height+200)}" aria-label="Связи объектов"><defs><marker id="${this.uid}-edge" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="context-stroke"/></marker></defs>${d.edges.map((e,i)=>{
 const s=by.get(e.source),t=by.get(e.target);if(!s||!t)return '';
 const pos=edgeGeometry(s,t,i),label=e.label||relations[e.kind],short=label.length>30?label.slice(0,29)+'…':label;
 return `<g class="graph-edge ${e.status==='error'?'has-error':''} ${e.disabled?'is-disabled':''} ${this.selectedEdge===e.id?'selected':''}" role="button" tabindex="0" data-focus-key="edge-${C.escape(e.id)}" data-edge-id="${C.escape(e.id)}" aria-label="${C.escape(s.title+' → '+t.title+': '+label)}"><title>${C.escape(label)}</title><path class="graph-edge-hit" d="${pos.path}"/><path class="graph-edge-line" d="${pos.path}" marker-end="url(#${this.uid}-edge)"/><text x="${pos.x}" y="${pos.y}" text-anchor="middle">${C.escape(short)}</text></g>`;
 }).join('')}</svg>`;
 }
 drawMinimap(){
 const el=this.querySelector('.graph-minimap'),canvas=this.querySelector('.graph-canvas');if(!el||!canvas)return;
 const b=this.bounds(),v=this.viewport,pad=40;
 this._miniBounds={x:b.x-pad,y:b.y-pad,width:b.width+pad*2,height:b.height+pad*2};
 if(this._miniDirty||!el.firstElementChild){
  el.innerHTML=`<svg viewBox="${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}" preserveAspectRatio="none" aria-hidden="true">${this.nodes().map(n=>`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12" class="${n.id===this.selectedId?'selected':''}"/>`).join('')}<rect class="graph-minimap-view"/></svg>`;
  this._miniDirty=false;
 }
 const rect=el.querySelector('.graph-minimap-view');for(const[k,val]of Object.entries({x:-v.x/v.zoom,y:-v.y/v.zoom,width:canvas.clientWidth/v.zoom,height:canvas.clientHeight/v.zoom}))rect?.setAttribute(k,String(val));
 }
 textAlternative(d){return `<div class="graph-list" aria-label="Текстовая альтернатива графа"><p class="iq-pro-subtitle">Все объекты и направленные связи. Редактирование не требует перетаскивания.</p>${!this.nodes().length?'<div class="iq-pro-state"><h3>Пока нет объектов</h3><p>Добавьте заметку или задачу кнопками выше.</p></div>':''}${this.nodes().map(n=>`<div class="graph-list-item"><button type="button" data-pro-action="select-node" data-node="${C.escape(n.id)}" aria-pressed="${this.selectedId===n.id}">${icon(kinds[n.kind].icon,18)}<span><small>${kinds[n.kind].label}</small><b>${C.escape(n.title)}</b></span>${icon('chevron',16)}</button>${d.edges.filter(e=>e.source===n.id&&this.nodes().some(t=>t.id===e.target)).map(e=>`<button type="button" class="graph-text-edge" data-pro-action="select-edge" data-edge="${C.escape(e.id)}">${icon('arrow',14)}${C.escape(e.label||relations[e.kind])}: ${C.escape(d.nodes.find(x=>x.id===e.target)?.title||'')}</button>`).join('')}</div>`).join('')}</div>`}
 inspector(n){
 const disabled=this.locked||!this.can('move',n)?'disabled':'';
 const field=(label,key,value,type='text')=>`<label class="iq-pro-field"><span>${label}</span><input type="${type}" data-focus-key="field-${key}" data-graph-field="${key}" value="${C.escape(value)}" ${disabled} ${type==='number'?'step="1"':''}></label>`;
 const body=n.kind==='media'?field('Изображение по HTTPS','url',n.url||'')+field('Описание изображения','alt',n.alt||n.title):
 n.kind==='checklist'?`<label class="iq-pro-field"><span>Пункты проверки</span><textarea data-graph-items data-focus-key="items" rows="4" ${disabled}>${C.escape((n.items||[]).map(x=>(x.checked?'[x] ':'[ ] ')+x.label).join('\n'))}</textarea><small>Каждый пункт с новой строки. [x] — выполнено.</small></label>`:
 n.kind==='group'?'':`<label class="iq-pro-field"><span>Содержание</span><textarea rows="4" data-focus-key="field-text" data-graph-field="text" ${disabled}>${C.escape(n.text||'')}</textarea></label>`;
 return `<aside class="graph-inspector iq-pro-inspector" aria-label="Свойства объекта"><div class="iq-pro-inspector-title"><div><span class="iq-pro-eyebrow">СВОЙСТВА</span><h4>${kinds[n.kind].label}</h4></div>${ib('Закрыть свойства объекта','deselect','x')}</div>${!this.can('move',n)?'<p class="iq-pro-readonly">'+icon('lock',16)+'Этот объект защищён от изменений.</p>':''}
 ${field('Название','title',n.title)}${body}
 <details class="graph-geometry-section"><summary>Положение и размер ${icon('down',16)}</summary><div class="graph-geometry">${field('X','x',n.x,'number')}${field('Y','y',n.y,'number')}${field('Ширина','width',n.width,'number')}${field('Высота','height',n.height,'number')}</div></details>
 ${button('Показать изменение','edit-node','arrow',disabled)}
 <details class="graph-connect-form"><summary>Связать с объектом ${icon('down',16)}</summary>${U.select('К объекту',this.session.value.nodes.filter(x=>x.id!==n.id&&!x.archived&&!x.readonly&&x.status!=='disabled').map(x=>({value:x.id,label:x.title})),'data-graph-target '+disabled)}${U.select('Значение',Object.entries(relations).map(([value,label])=>({value,label})),'value="relates" data-graph-kind '+disabled)}${button('Создать связь','connect','link',disabled)}</details>
 <div class="graph-inspector-end">${button('Переместить в архив','archive-node','folder',disabled)}</div></aside>`;
 }
 edgeInspector(e){const disabled=this.locked||e.disabled?'disabled':'';return `<aside class="graph-inspector iq-pro-inspector"><div class="iq-pro-inspector-title"><h4>Связь</h4>${ib('Закрыть свойства связи','deselect','x')}</div><p>${C.escape(e.source)} → ${C.escape(e.target)}</p><label class="iq-pro-field"><span>Подпись связи</span><input data-focus-key="edge-label" data-graph-edge-label value="${C.escape(e.label||'')}" ${disabled}></label>${button('Изменить подпись','edit-edge','',disabled)}${button('Удалить связь','delete-edge','trash',disabled)}${e.status==='error'?'<p class="iq-pro-error">Проверьте отношение между объектами.</p>':''}</aside>`}
 action(action,el,event){if(this.baseAction(action))return;const n=this.session.value.nodes.find(n=>n.id===this.selectedId);switch(action){case'library':this.libraryOpen=!this.libraryOpen;this.schedule();return;case'select-tool':this.panMode=false;this.schedule();return;case'locate':if(n)this.ensureVisible(n);return;case'expand':this.fullscreen=!this.fullscreen;this.schedule();requestAnimationFrame(()=>this.fit());return;case'view':this.listMode=el.dataset.view==='list';this.schedule();return;case'zoom-in':this.zoom(.15);return;case'zoom-out':this.zoom(-.15);return;case'fit':this.fit();return;case'pan':this.panMode=!this.panMode;this.schedule();return;case'pan-left':this._viewport.x+=90;this.applyViewport();return;case'pan-right':this._viewport.x-=90;this.applyViewport();return;case'pan-up':this._viewport.y+=90;this.applyViewport();return;case'pan-down':this._viewport.y-=90;this.applyViewport();return;case'archive':this.showArchive=!this.showArchive;this.schedule();return;case'minimap':{const rect=el.getBoundingClientRect(),b=this._miniBounds,canvas=this.querySelector('.graph-canvas');const x=event.detail?(event.clientX-rect.left)/rect.width:.5,y=event.detail?(event.clientY-rect.top)/rect.height:.5;this._viewport.x=canvas.clientWidth/2-(b.x+b.width*x)*this.viewport.zoom;this._viewport.y=canvas.clientHeight/2-(b.y+b.height*y)*this.viewport.zoom;this.applyViewport();return}case'select-node':this.select(el.dataset.node);return;case'select-edge':this.selectedEdge=el.dataset.edge;this.selectedId='';this.schedule();return;case'deselect':this.selectedId='';this.selectedEdge='';this.schedule();return;case'cancel-link':this.linkFrom='';this.schedule();return;case'port-out':if(!this.locked){this.issue='';this.linkFrom=el.dataset.node;this.schedule()}return;case'port-in':if(this.linkFrom){this.connect(this.linkFrom,el.dataset.node,this.mode==='workflow'?'depends':'relates');this.linkFrom='';this.schedule()}return}
 if(this.locked)return;
 if(action==='add'){const kind=el.dataset.kind,next=this.data,id=C.newId('node');next.nodes.push({id,kind,title:'Новая '+(kind==='task'?'задача':kind==='note'?'заметка':kind==='group'?'группа':kind==='media'?'иллюстрация':'проверка'),x:Math.round(((this.querySelector('.graph-canvas')?.clientWidth||600)/2-this.viewport.x)/this.viewport.zoom-140),y:Math.round(((this.querySelector('.graph-canvas')?.clientHeight||500)/2-this.viewport.y)/this.viewport.zoom-100),width:kind==='group'?640:280,height:kind==='group'?350:200,...(kind==='checklist'?{items:[{label:'Первый критерий',checked:false}]}:{})});this.libraryOpen=false;this.selectedId=id;this.preview(next,{kind:'create',id});return}
 if(action==='layout'){try{this.preview(C.layoutGraph(this.data),{kind:'layout'});this.fitted=false}catch(e){this.issue=e.message;this.schedule()}return}
 if(action==='restore'){const next=this.data,obj=next.nodes.find(x=>x.id===el.dataset.node);if(obj&&this.can('restore',obj)){obj.archived=false;for(const child of next.nodes)if(child.archivedByGroup===obj.id){child.archived=false;delete child.archivedByGroup}this.preview(next,{kind:'restore',id:obj.id})}return}
 if(action==='delete-edge'){const next=this.data,e=next.edges.find(e=>e.id===this.selectedEdge);if(e&&!e.disabled&&!next.nodes.some(n=>[e.source,e.target].includes(n.id)&&(!this.can('connect',n)))){next.edges=next.edges.filter(x=>x.id!==e.id);this.selectedEdge='';this.preview(next,{kind:'disconnect',id:e.id})}return}
 if(action==='edit-edge'){const next=this.data,e=next.edges.find(e=>e.id===this.selectedEdge);if(e&&!e.disabled&&!next.nodes.some(n=>[e.source,e.target].includes(n.id)&&(!this.can('connect',n)))){e.label=this.querySelector('[data-graph-edge-label]').value.trim();this.preview(next,{kind:'edge-label',id:e.id})}return}
 if(!n)return;
 if(action==='connect'){this.connect(n.id,this.querySelector('[data-graph-target]').value,this.querySelector('[data-graph-kind]').value);return}
 if(action==='edit-node'){const next=this.data,target=next.nodes.find(x=>x.id===n.id);for(const input of this.querySelectorAll('[data-graph-field]')){const key=input.dataset.graphField;target[key]=['x','y','width','height'].includes(key)?Number(input.value):input.value.trim()}const checklist=this.querySelector('[data-graph-items]');if(checklist)target.items=checklist.value.split('\n').filter(s=>s.trim()).map(s=>({label:s.replace(/^\s*(?:-\s*)?\[[ xX]\]\s*/,'').trim(),checked:/^\s*(?:-\s*)?\[[xX]\]/.test(s)}));if(target.url&&!C.safeMedia(target.url)){this.issue='Разрешено только изображение по HTTPS, локальный blob или растровый data URL.';this.schedule();return}try{this.preview(next,{kind:'edit',id:n.id})}catch(e){this.issue=e.message;this.schedule()}return}
 if(action==='archive-node'){
  const next=this.data,ids=descendants(next.nodes,n.id);
  if(next.nodes.some(x=>ids.has(x.id)&&(!this.can('archive',x)))){this.issue='В группе есть защищённые объекты. Перемещение в архив недоступно.';this.schedule();return}
  for(const x of next.nodes)if(ids.has(x.id)&&!x.archived){x.archived=true;if(x.id!==n.id)x.archivedByGroup=n.id}
  this.selectedId='';this.preview(next,{kind:'archive',id:n.id});
 }
 }
 connect(from,to,kind){if(this.locked||!from||!to)return;const next=this.data,a=next.nodes.find(n=>n.id===from),b=next.nodes.find(n=>n.id===to);if(!a||!b||!this.can('connect',a)||!this.can('connect',b))return;if(from===to||next.edges.some(e=>e.source===from&&e.target===to)){this.issue='Выберите другой объект: такая связь уже существует или ведёт к себе.';this.schedule();return}next.edges.push({id:C.newId('edge'),source:from,target:to,kind});this.preview(next,{kind:'connect',source:from,target:to})}
 keys(e){if(e.key==='Escape'){if(this.libraryOpen){e.preventDefault();e.stopPropagation();this.libraryOpen=false;this.schedule();queueMicrotask(()=>this.querySelector('[data-pro-action=library]')?.focus({preventScroll:true}));return}if(this.cancelGesture){e.preventDefault();e.stopPropagation();this.cancelGesture();return}if(this.linkFrom){this.linkFrom='';this.schedule();return}if(this.session.dirty){e.preventDefault();e.stopPropagation();this.baseAction('cancel');return}if(this.fullscreen){e.preventDefault();this.fullscreen=false;this.schedule()}return}
 if(e.target.closest('input,textarea,iq-select,button'))return;const card=e.target.closest('[data-node-id]'),edge=e.target.closest('[data-edge-id]');if(edge&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this.selectedEdge=edge.dataset.edgeId;this.selectedId='';this.schedule();return}
 if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(this.session.dirty&&e.ctrlKey)this.requestCommit();else this.select(card.dataset.nodeId);return}
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
 const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(card&&e.altKey){e.preventDefault();const next=this.data,n=next.nodes.find(n=>n.id===card.dataset.nodeId);if(this.locked||!this.can(e.shiftKey?'resize':'move',n))return;const children=descendants(next.nodes,n.id);if(next.nodes.some(x=>children.has(x.id)&&(!this.can(e.shiftKey?'resize':'move',x))))return;this.selectedId=n.id;if(e.shiftKey){n.width=Math.max(180,n.width+delta[0]);n.height=Math.max(100,n.height+delta[1])}else{n.x+=delta[0];n.y+=delta[1];if(n.kind==='group')next.nodes.filter(x=>x.id!==n.id&&children.has(x.id)).forEach(x=>{x.x+=delta[0];x.y+=delta[1]})}this.preview(next,{kind:e.shiftKey?'resize':'move',id:n.id});return}
 if(card){e.preventDefault();const n=this.nodes().find(n=>n.id===card.dataset.nodeId),candidates=this.nodes().filter(x=>x.id!==n.id&&(delta[0]?(x.x-n.x)*delta[0]>0:(x.y-n.y)*delta[1]>0)).sort((a,b)=>Math.hypot(a.x-n.x,a.y-n.y)-Math.hypot(b.x-n.x,b.y-n.y));if(candidates[0]){const target=[...this.querySelectorAll('[data-node-id]')].find(el=>el.dataset.nodeId===candidates[0].id);if(target){this.ensureVisible(candidates[0]);target.focus({preventScroll:true})}}return}
 if(e.target.classList.contains('graph-canvas')){e.preventDefault();this._viewport.x-=delta[0]*4;this._viewport.y-=delta[1]*4;this.applyViewport()}
 }
 liveEdges(data,changedIds){
  const nodes=new Map(data.nodes.map(n=>[n.id,n]));
  for(const [i,e]of data.edges.entries()){
   if(!changedIds.has(e.source)&&!changedIds.has(e.target))continue;
   const source=nodes.get(e.source),target=nodes.get(e.target);
   const el=this._edgeEls?.get(e.id);if(!el||!source||!target)continue;
   const pos=edgeGeometry(source,target,i);el.querySelectorAll('path').forEach(p=>p.setAttribute('d',pos.path));
   el.querySelector('text').setAttribute('x',pos.x);el.querySelector('text').setAttribute('y',pos.y);
   for(const [id,action,side] of [[e.source,'port-out',pos.sourceSide],[e.target,'port-in',pos.targetSide]]){const node=this._nodeEls?.get(id),port=node?.querySelector('[data-pro-action="'+action+'"]');if(port){for(const x of ['top','bottom','left','right'])port.classList.toggle('side-'+x,x===side)}}
  }
 }
 beginPointer(e){
  if(e.button!==0||!e.target.closest('.graph-canvas')||e.target.closest('button,input,a,.graph-minimap,.graph-node-content'))return;
  const resize=e.target.closest('[data-node-resize]'),drag=e.target.closest('[data-node-drag]');
  const id=resize?.dataset.nodeResize||drag?.dataset.nodeDrag,pan=this.panMode||(!id&&!e.target.closest('[data-node-id],[data-edge-id]'));
  if(!pan&&!id)return;
  const node=id?this.session.value.nodes.find(n=>n.id===id):null;
  const affected=pan?new Set():descendants(this.session.value.nodes,id);
  if(!pan&&(this.locked||this.session.value.nodes.some(n=>affected.has(n.id)&&(!this.can(resize?'resize':'move',n)))))return;
  this.cancelGesture?.();e.preventDefault();
  const initial={x:e.clientX,y:e.clientY,view:{...this.viewport}},zoom=this.viewport.zoom,base=this.data,epoch=this.session.base.revision;
  let dx=0,dy=0,moved=false;this.gesture=new AbortController();const signal=this.gesture.signal;
  const nextData=()=>{
   const next=C.clone(base);
   for(const n of next.nodes)if(affected.has(n.id)){
    if(resize&&n.id===id){n.width=Math.max(180,Math.round(n.width+dx/zoom));n.height=Math.max(100,Math.round(n.height+dy/zoom))}
    else if(!resize){n.x=Math.round(n.x+dx/zoom);n.y=Math.round(n.y+dy/zoom)}
   }
   return next;
  };
  const cleanup=(cancel=false)=>{
   this.gesture?.abort();this.gesture=null;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.cancelGesture=null;
   if(cancel){this.viewport=initial.view;this.schedule()}
  };
  this.cancelGesture=()=>cleanup(true);
  window.addEventListener('pointermove',ev=>{
   if(ev.pointerId!==e.pointerId)return;dx=ev.clientX-initial.x;dy=ev.clientY-initial.y;if(Math.abs(dx)+Math.abs(dy)<4&&!moved)return;
   moved=true;if(this.frame)cancelAnimationFrame(this.frame);
   this.frame=requestAnimationFrame(()=>{
    if(pan){this.viewport={...initial.view,x:initial.view.x+dx,y:initial.view.y+dy};this.applyViewport();return}
    const preview=nextData();
    for(const id2 of affected){const el=this._nodeEls?.get(id2);if(!el)continue;el.classList.add('dragging');
     if(resize&&id2===id){const n=preview.nodes.find(n=>n.id===id);el.style.width=n.width+'px';el.style.height=n.height+'px'}
     else if(!resize)el.style.transform=`translate(${dx/zoom}px,${dy/zoom}px)`;
    }
    this.liveEdges(preview,affected);
   });
  },{signal});
  window.addEventListener('pointerup',ev=>{
   if(ev.pointerId!==e.pointerId)return;cleanup();
   if(moved){this.ignoreClick=true;setTimeout(()=>this.ignoreClick=false,0)}
   if(moved&&!pan&&epoch===this.session.base.revision&&!this.locked){
    this.selectedId=id;try{this.preview(nextData(),{kind:resize?'resize':'move',id})}catch(err){this.issue=err.message;this.schedule()}
   }else if(!pan)this.select(id);
  },{signal});
  window.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&this.cancelGesture){ev.preventDefault();ev.stopPropagation();this.cancelGesture()}},{signal,capture:true});
  window.addEventListener('pointercancel',()=>cleanup(true),{signal,once:true});
 }
}
require('./capabilities.js').installGraph(IqGraph);
Object.assign(exports,{IqGraph,graphKinds:kinds,graphRelations:relations,edgeGeometry,descendants});


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
