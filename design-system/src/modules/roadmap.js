 'use strict';
const C=require('./advanced-core.js');
const {IqDataSurface,button,ib}=require('./advanced-base.js');
const {icon}=require('./components.js'),U=require('./ui.js');
const fmt=(v)=>C.dateLabel(v,{day:'numeric',month:'short'});
const relationNames={FS:'Конец → начало',SS:'Начало → начало',FF:'Конец → конец',SF:'Начало → конец'};
class IqRoadmap extends IqDataSurface {
 constructor(){
  super();this.session=new C.EditSession({revision:0,rows:[],dependencies:[]});this.rangeStart='';this.rangeEnd='';
  this._collapsed=new Set();this.scale='fit';this.today=new Date().toISOString().slice(0,10);this.selectedDependency='';this._scroll=0;this._scrollTop=0;this._width=1000;
 }
 get scale(){return this._scale||'fit'}
 set scale(value){if(!['fit','day','week','month'].includes(value))throw new TypeError('Масштаб: fit, day, week или month');this.cancelGesture?.();this._scale=value;this.schedule()}
 get today(){return this._today||new Date().toISOString().slice(0,10)}
 set today(value){if(!Number.isFinite(C.day(value)))throw new TypeError('today: корректная дата YYYY-MM-DD');this._today=value;this.schedule()}
 get collapsedIds(){return [...this._collapsed]}
 set collapsedIds(value){if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw new TypeError('collapsedIds: массив ID');this._collapsed=new Set(value);this.schedule()}
 get selection(){return this.selectedDependency?{kind:'dependency',id:this.selectedDependency}:this.selectedId?{kind:'row',id:this.selectedId}:null}
 set selection(v){if(v===null){this.selectedId='';this.selectedDependency=''}else if(v.kind==='row'&&this.session.value.rows.some(r=>r.id===v.id)){this.selectedId=v.id;this.selectedDependency=''}else if(v.kind==='dependency'&&this.session.value.dependencies.some(r=>r.id===v.id)){this.selectedId='';this.selectedDependency=v.id}else throw new TypeError('Неизвестный выбор плана');this.schedule()}
 visibleRows(){const rows=this.session.value.rows,byParent=new Map();for(const r of rows){const p=r.parentId||'';if(!byParent.has(p))byParent.set(p,[]);byParent.get(p).push(r)}const out=[];const walk=(parent,depth)=>{for(const row of byParent.get(parent)||[]){out.push({...row,_depth:depth,_children:(byParent.get(row.id)||[]).length});if(!this._collapsed.has(row.id))walk(row.id,depth+1)}};walk('',0);return out}
 rowName(r){const children=r._children||0,selected=this.selectedId===r.id,kind={goal:'Цель',epic:'Эпик',task:'Задача',milestone:'Веха'}[r.kind];return `<div class="rm-label-cell" style="--rm-indent:${Math.min(r._depth||0,6)}">${children?`<button type="button" class="rm-collapse" data-pro-action="collapse-row" data-row="${C.escape(r.id)}" aria-label="${this._collapsed.has(r.id)?'Развернуть':'Свернуть'} ${C.escape(r.title)}" aria-expanded="${!this._collapsed.has(r.id)}">${icon(this._collapsed.has(r.id)?'chevron':'down',14)}</button>`:'<span class="rm-collapse-space"></span>'}<button type="button" class="rm-label" data-rm-select="${C.escape(r.id)}" data-focus-key="label-${C.escape(r.id)}" aria-pressed="${selected}"><span><b>${C.escape(r.title)}</b><small>${kind} / ${r.start?fmt(r.start)+(r.kind==='milestone'?'':' — '+fmt(r.end)):'Даты не заданы'}${r.blocked?' / Заблокировано':r.readonly?' / Только чтение':''}</small></span></button></div>`}
 validate(value){return C.validateRoadmap(value)}
 conflicts(){return C.roadmapConflicts(this.session.value)}
 set range(v){
  if(!v||!Number.isFinite(C.day(v.start))||!Number.isFinite(C.day(v.end))||C.day(v.end)<C.day(v.start)||C.day(v.end)-C.day(v.start)>730)throw new TypeError('Диапазон: от 1 до 731 дней');
  this.cancelGesture?.();this.rangeStart=v.start;this.rangeEnd=v.end;this.schedule();
 }
 get range(){return{start:this.rangeStart,end:this.rangeEnd}}
 start(){
  const signal=this.events.signal;
  this.addEventListener('keydown',e=>this.keys(e),{signal});
  this.addEventListener('pointerdown',e=>this.beginPointer(e),{signal});
  this.addEventListener('click',e=>{
   if(this.ignoreClick){this.ignoreClick=false;return}
   const row=e.target.closest('[data-rm-select]');
   if(row){this.selectedId=row.dataset.rmSelect;this.selectedDependency='';this.emit('iq-selection',{id:this.selectedId,kind:'row'});this.schedule()}
   const edge=e.target.closest('[data-rm-edge]');
   if(edge){this.selectedDependency=edge.dataset.rmEdge;this.selectedId='';this.emit('iq-selection',{id:this.selectedDependency,kind:'dependency'});this.schedule()}
  },{signal});
  this.resizeObserver=new ResizeObserver(([entry])=>{const w=Math.round(entry.contentRect.width);if(w>0&&w!==this._width){this._width=w;this.cancelGesture?.();this.schedule()}});
  this.resizeObserver.observe(this);
 }
 bounds(){
  const rows=this.session.value.rows.filter(r=>r.start!=null&&r.end!=null),lo=rows.length?Math.min(...rows.map(r=>C.day(r.start))):C.day(this.today),hi=rows.length?Math.max(...rows.map(r=>C.day(r.end))):lo+27;
  const start=Number.isFinite(C.day(this.rangeStart))?C.day(this.rangeStart):lo-2;
  const end=Number.isFinite(C.day(this.rangeEnd))?C.day(this.rangeEnd):Math.min(start+730,Math.max(start+13,hi+3));
  const count=end-start+1,name=this._width<900?260:296,available=Math.max(280,this._width-name-2);
  const px=this.scale==='fit'?Math.max(5,available/count):({day:56,week:30,month:12}[this.scale]||30);
  return{start,end,count,px,name,width:Math.max(available,count*px)};
 }
 rowLayout(d,b){
  const canvas=IqRoadmap.measureCanvas||(IqRoadmap.measureCanvas=document.createElement('canvas')),ctx=canvas.getContext('2d');
  ctx.font='500 14px '+getComputedStyle(this).fontFamily;
  let top=0;
  return this.visibleRows().map(row=>{
   const usable=Math.max(96,b.name-58-Math.min(row._depth||0,6)*16);
   let lines=1,line='';
   for(const word of row.title.split(/\s+/)){
    const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>usable){
     if(line)lines++;
     // Long unbroken identifiers wrap too.
     const wide=ctx.measureText(word).width;
     if(wide>usable)lines+=Math.floor(wide/usable);
     line=word;
    }else line=test;
   }
   const height=Math.max(76,lines*20+48),item={row,top,height,center:top+height/2};top+=height;return item;
  });
 }
 render(){
  const old=this.querySelector('.rm-scroll');if(old){this._scroll=old.scrollLeft;this._scrollTop=old.scrollTop}
  const d=this.session.value,b=this.bounds(),s=d.rows.find(r=>r.id===this.selectedId),disabled=this.locked?'disabled':'';
  this.classList.add('iq-pro-host');
  this.innerHTML=`<section class="iq-pro iq-roadmap" aria-label="План длительностей и зависимостей">
   <header class="iq-pro-toolbar"><div class="iq-pro-heading"><span class="iq-pro-eyebrow">ПЛАН ВЫПУСКА</span><h3>${C.escape(d.title||'Длительности и зависимости')}</h3><span class="iq-pro-subtitle">${fmt(C.iso(b.start))} — ${C.dateLabel(C.iso(b.end),{day:'numeric',month:'long',year:'numeric'})}</span></div><div class="iq-pro-actions">
    <div class="iq-pro-range">${ib('Предыдущий диапазон','prev-range','left')}${button('Сегодня','today')}${ib('Следующий диапазон','next-range','chevron')}</div>
    <div class="iq-pro-segment" role="group" aria-label="Масштаб плана">${[['fit','Обзор'],['day','Дни'],['week','Недели'],['month','Месяцы']].map(([id,label])=>button(label,'scale','',`data-scale="${id}" aria-pressed="${this.scale===id}"`)).join('')}</div>
   </div></header>
   ${this.readonly&&this.state==='ready'?'<div class="iq-pro-readonly">'+icon('lock',16)+'Только чтение. Просмотр интервалов и связей доступен.</div>':''}
   ${this.stateMarkup('план')}${this.state==='ready'?(d.rows.length?this.timeline(d,b)+this.agenda(d):'<div class="iq-pro-state">'+icon('calendar',28)+'<h3>План ещё не составлен</h3><p>Добавьте задачи с датами начала и завершения.</p></div>'):''}
   ${this.state==='ready'&&s?this.inspector(s,d,disabled):''}
   ${this.state==='ready'&&this.selectedDependency?this.edgeInspector(d,disabled):''}
   ${this.issue&&!this.session.dirty?`<p class="iq-pro-error iq-pro-inline-error" role="alert">${C.escape(this.issue)}</p>`:''}${this.dock()}
   <footer class="iq-pro-foot"><span>${icon('link',16)}${d.dependencies.length} связей</span><span>${this.readonly?'Изменение дат недоступно':'Выберите интервал, чтобы изменить даты и связи.'}</span>${ib('Отменить последнее применение','undo','undo',this.session.history.length&&!this.locked&&!this.session.dirty?'':'disabled')}</footer>
  </section>`;
  const scroll=this.querySelector('.rm-scroll');if(scroll){scroll.scrollLeft=this._scroll;scroll.scrollTop=this._scrollTop}
 }
 timeline(d,b){
  const rows=this.rowLayout(d,b),byId=new Map(rows.map(r=>[r.row.id,r])),height=rows.at(-1).top+rows.at(-1).height;
  const conflicts=this.conflicts(),bad=new Set(conflicts.map(c=>c.id));
  const months=[];let t=b.start;while(t<=b.end){const dt=new Date(t*C.DAY);dt.setUTCDate(1);dt.setUTCMonth(dt.getUTCMonth()+1);const next=dt.getTime()/C.DAY;
   months.push(`<span style="left:${(t-b.start)*b.px}px;width:${(Math.min(next,b.end+1)-t)*b.px}px">${C.dateLabel(C.iso(t),{month:'long',year:'numeric'})}</span>`);t=next}
  const tickStep=b.px>=48?1:b.px>=20?3:7,ticks=[];
  for(t=b.start;t<=b.end;t+=tickStep){const x=(t-b.start)*b.px;if(x>b.width-36)continue;ticks.push(`<span style="left:${x}px">${C.dateLabel(C.iso(t),{day:'numeric'})}</span>`)}
  const edges=d.dependencies.map(dep=>{
   const a=byId.get(dep.from),z=byId.get(dep.to);if(!a||!z||!a.row.start||!z.row.start)return '';
   const endpoint=(item,kind)=>kind==='F'?(C.day(item.row.end)-b.start+1)*b.px-4:(C.day(item.row.start)-b.start)*b.px+4;
   const x1=endpoint(a,dep.type[0]),x2=endpoint(z,dep.type[1]);
   if(x1<0||x1>b.width||x2<0||x2>b.width)return '';
   const y1=a.center,y2=z.center,sgn=dep.type[0]==='F'?1:-1,turn=Math.min(b.width-3,Math.max(3,x1+12*sgn));
   const path=`M${x1} ${y1}H${turn}V${y2}H${x2}`;
   return `<g class="rm-dependency ${bad.has(dep.id)?'has-error':''} ${this.selectedDependency===dep.id?'selected':''}" data-rm-edge="${C.escape(dep.id)}" data-focus-key="dependency-${C.escape(dep.id)}" role="button" tabindex="0" aria-label="${C.escape(a.row.title+' → '+z.row.title+'. '+relationNames[dep.type]+(bad.has(dep.id)?'. Конфликт дат':''))}"><path class="rm-edge-hit" d="${path}"/><path class="rm-edge-line" d="${path}" marker-end="url(#${this.uid}-arrow)"/></g>`;
  }).join('');
  const todayX=(C.day(this.today)-b.start+.5)*b.px,hasToday=todayX>=0&&todayX<=b.width;
  return `<div class="rm-scroll" tabindex="0" aria-label="Временная шкала. Прокрутка доступна внутри плана."><div class="rm-sheet" style="--rm-width:${b.width}px;--rm-day:${b.px}px;--rm-name:${b.name}px">
   <div class="rm-head"><div class="rm-name-head"><span>Задачи и вехи</span><small>${d.rows.length} в плане</small></div><div class="rm-ruler"><div class="rm-months">${months.join('')}</div><div class="rm-days">${ticks.join('')}</div>${hasToday?`<span class="rm-today-cap" style="left:${Math.min(b.width-40,Math.max(24,todayX))}px" title="${fmt(this.today)}">Сегодня</span>`:''}</div></div>
   <div class="rm-body"><svg class="rm-links" width="${b.width}" height="${height}" aria-label="Зависимости"><defs><marker id="${this.uid}-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="context-stroke"/></marker></defs>${edges}</svg>${hasToday?`<div class="rm-today" style="left:calc(var(--rm-name) + ${todayX}px)" aria-hidden="true"></div>`:''}
   ${rows.map(({row:r,height})=>{
    const start=(C.day(r.start)-b.start)*b.px,end=(C.day(r.end)-b.start+1)*b.px,left=Math.max(0,start),right=Math.min(b.width,end),width=Math.max(2,right-left-8);
    const visible=!!r.start&&end>0&&start<b.width,selected=this.selectedId===r.id,locked=this.locked||r.readonly||r.blocked;
    return `<div class="rm-row ${selected?'selected':''}" style="height:${height}px">${this.rowName(r)}
    <div class="rm-lane">${visible?`<button type="button" class="rm-bar ${r.kind==='milestone'?'is-milestone':''} ${r.status==='done'?'is-done':''} ${r.blocked?'is-blocked':''}" data-rm-select="${C.escape(r.id)}" data-rm-bar="${C.escape(r.id)}" data-focus-key="bar-${C.escape(r.id)}" style="left:${left+4}px;width:${r.kind==='milestone'?Math.min(24,b.px-2):width}px" aria-label="${C.escape(r.title+', '+fmt(r.start)+' — '+fmt(r.end))}" aria-pressed="${selected}">${r.kind==='milestone'?'<span class="rm-diamond"></span>':`<span class="rm-bar-progress" style="transform:scaleX(${(r.progress||0)/100})"></span>${!locked?'<span class="rm-handle start" data-resize="start" aria-hidden="true"></span>':''}<span class="rm-bar-label">${width>64?C.day(r.end)-C.day(r.start)+1+' дн.':''}</span>${!locked?'<span class="rm-handle end" data-resize="end" aria-hidden="true"></span>':''}`}</button>`:`<span class="rm-outside">${r.start?'Вне выбранного диапазона':'Даты не заданы'}</span>`}</div></div>`;
   }).join('')}</div></div></div>`;
 }
 agenda(d){return `<div class="rm-agenda" aria-label="Интервалы задач"><p class="iq-pro-subtitle">Начало и завершение работы</p>${this.visibleRows().map(r=>`<button type="button" style="padding-left:${16+(r._depth||0)*14}px" class="rm-agenda-row" data-rm-select="${C.escape(r.id)}" data-focus-key="agenda-${C.escape(r.id)}" aria-pressed="${this.selectedId===r.id}"><span class="rm-label-icon">${icon(r.kind==='milestone'?'flag':r.blocked||r.readonly?'lock':'calendar',18)}</span><span><b>${C.escape(r.title)}</b><small>${fmt(r.start)}${r.kind==='milestone'?'':' — '+fmt(r.end)}</small>${d.dependencies.filter(e=>e.to===r.id).map(e=>`<small>${relationNames[e.type]}: ${C.escape(d.rows.find(x=>x.id===e.from).title)}</small>`).join('')}${r.blocked?'<small>Заблокировано</small>':r.readonly?'<small>Только чтение</small>':''}</span>${icon('chevron',16)}</button>`).join('')}</div>`}
 inspector(r,d,disabled){
  const locked=!!disabled||r.blocked||r.readonly;
  return `<section class="iq-pro-inspector" aria-label="Изменение интервала"><div class="iq-pro-inspector-title"><div><span class="iq-pro-eyebrow">${r.kind==='milestone'?'ВЕХА':'СВОЙСТВА ИНТЕРВАЛА'}</span><h4>${C.escape(r.title)}</h4></div><div class="iq-pro-actions">${button('Открыть объект','open-row','upRight')}${ib('Закрыть свойства','deselect','x')}</div></div>${r.blocked||r.readonly?`<p class="iq-pro-readonly">${icon('lock',16)}${C.escape(r.blockReason||'Этот интервал защищён от изменения.')}</p>`:''}
   <div class="rm-edit-fields"><iq-date-field label="${r.kind==='milestone'?'Дата вехи':'Начало'}" value="${r.start||''}" data-rm-date="start" ${locked?'disabled':''}></iq-date-field>${r.kind!=='milestone'?`<iq-date-field label="Завершение" value="${r.end||''}" data-rm-date="end" ${locked?'disabled':''}></iq-date-field>`:''}${button('Показать изменение','dates','arrow',locked?'disabled':'')}</div>
   <div class="iq-pro-actions rm-move-actions">${button('На день раньше','shift','left',`data-days="-1" ${locked||!r.start?'disabled':''}`)}${button('На день позже','shift','chevron',`data-days="1" ${locked||!r.start?'disabled':''}`)}</div>
   <details class="rm-link-editor"><summary>Зависимости ${icon('down',16)}</summary><div class="rm-link-fields">${U.select('Следующая задача',d.rows.filter(x=>x.id!==r.id&&!x.blocked&&!x.readonly).map(x=>({value:x.id,label:x.title})),'data-rm-target '+(locked?'disabled':''))}${U.select('Условие',[...Object.entries(relationNames)].map(([value,label])=>({value,label})),'value="FS" data-rm-type '+(locked?'disabled':''))}${button('Добавить связь','add-link','link',locked?'disabled':'')}</div>
   ${d.dependencies.filter(e=>e.from===r.id||e.to===r.id).map(e=>`<div class="rm-link-row"><span><b>${C.escape(d.rows.find(x=>x.id===e.from).title)}</b><small>${relationNames[e.type]} — ${C.escape(d.rows.find(x=>x.id===e.to).title)}</small></span>${ib('Удалить связь '+e.id,'remove-link','x',`data-edge-id="${C.escape(e.id)}" ${locked?'disabled':''}`)}</div>`).join('')}</details></section>`;
 }
 edgeInspector(d,disabled){
  const edge=d.dependencies.find(e=>e.id===this.selectedDependency);if(!edge)return '';
  const a=d.rows.find(r=>r.id===edge.from),b=d.rows.find(r=>r.id===edge.to),conflict=this.conflicts().find(c=>c.id===edge.id);
  return `<section class="iq-pro-inspector"><div class="iq-pro-inspector-title"><div><span class="iq-pro-eyebrow">ЗАВИСИМОСТЬ</span><h4>${C.escape(a.title)} → ${C.escape(b.title)}</h4></div>${ib('Закрыть свойства','deselect','x')}</div><p class="${conflict?'iq-pro-error':'iq-pro-subtitle'}">${C.escape(conflict?.message||relationNames[edge.type]+'. Даты не пересчитываются автоматически.')}</p>${button('Удалить зависимость','remove-link','trash',`data-edge-id="${C.escape(edge.id)}" ${disabled||a.readonly||a.blocked||b.readonly||b.blocked?'disabled':''}`)}</section>`;
 }
 action(action,el){
  if(this.baseAction(action))return;
  if(action==='collapse-row'){this._collapsed.has(el.dataset.row)?this._collapsed.delete(el.dataset.row):this._collapsed.add(el.dataset.row);this.emit('iq-collapse',{ids:this.collapsedIds});this.schedule();return}
  if(action==='open-row'){this.emit('iq-open',{kind:'row',id:this.selectedId});return}
  const b=this.bounds(),r=this.session.value.rows.find(r=>r.id===this.selectedId);
  if(action==='scale'){this.cancelGesture?.();this.scale=el.dataset.scale;this.schedule();return}
  if(action==='prev-range'||action==='next-range'){const k=action==='next-range'?1:-1;this.range={start:C.iso(b.start+b.count*k),end:C.iso(b.end+b.count*k)};return}
  if(action==='today'){const n=C.day(this.today);this.range={start:C.iso(n-3),end:C.iso(n+27)};return}
  if(action==='deselect'){this.selectedId='';this.selectedDependency='';this.issue='';this.schedule();return}
  if(!r&&action!=='remove-link')return;
  if(action==='shift'&&r.start)this.editRow(r,C.addDays(r.start,+el.dataset.days),C.addDays(r.end,+el.dataset.days),'move');
  if(action==='dates'){const start=this.querySelector('[data-rm-date="start"]').value,end=r.kind==='milestone'?start:this.querySelector('[data-rm-date="end"]').value;this.editRow(r,start,end,'resize')}
  if(action==='add-link'&&!this.locked&&!r.readonly&&!r.blocked){const next=this.data,to=this.querySelector('[data-rm-target]').value,type=this.querySelector('[data-rm-type]').value;if(!to)return;next.dependencies.push({id:C.newId('link'),from:r.id,to,type,lagDays:0});this.preview(next,{kind:'connect',from:r.id,to})}
  if(action==='remove-link'&&!this.locked){const edge=this.session.value.dependencies.find(e=>e.id===el.dataset.edgeId);if(!edge)return;if(this.session.value.rows.some(r=>[edge.from,edge.to].includes(r.id)&&(r.readonly||r.blocked))){this.issue='Связь с защищённой задачей нельзя удалить.';this.schedule();return}const next=this.data;next.dependencies=next.dependencies.filter(e=>e.id!==edge.id);this.selectedDependency='';this.preview(next,{kind:'disconnect',id:edge.id})}
 }
 editRow(r,start,end,kind){
  if(this.locked||r.readonly||r.blocked)return false;
  const next=this.data;Object.assign(next.rows.find(x=>x.id===r.id),{start,end});
  try{return this.preview(next,{kind,id:r.id,start,end})}catch(e){this.issue=e.message;this.schedule();return false}
 }
 keys(e){
  if(e.key==='Escape'){
   if(this.cancelGesture){e.preventDefault();e.stopPropagation();this.cancelGesture();return}
   if(this.session.dirty){e.preventDefault();e.stopPropagation();this.baseAction('cancel')}return;
  }
  const edge=e.target.closest('[data-rm-edge]');
  if(edge&&['Enter',' '].includes(e.key)){e.preventDefault();this.selectedDependency=edge.dataset.rmEdge;this.selectedId='';this.emit('iq-selection',{kind:'dependency',id:this.selectedDependency});this.schedule();return}
  const bar=e.target.closest('[data-rm-bar]');if(!bar)return;const r=this.session.value.rows.find(r=>r.id===bar.dataset.rmBar);
  if(e.key==='Enter'&&this.session.dirty){e.preventDefault();this.requestCommit();return}
  if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();this.selectedId=r.id;const n=(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?7:1);
  if(e.altKey&&r.kind!=='milestone')this.editRow(r,r.start,C.addDays(r.end,n),'resize');else this.editRow(r,C.addDays(r.start,n),C.addDays(r.end,n),'move');
 }
 beginPointer(e){
  const bar=e.target.closest('[data-rm-bar]');if(!bar||this.locked||e.button!==0)return;
  const r=this.session.value.rows.find(r=>r.id===bar.dataset.rmBar);if(r.readonly||r.blocked)return;
  this.cancelGesture?.();
  const resize=e.target.dataset.resize,initialX=e.clientX,b=this.bounds(),scroll=this.querySelector('.rm-scroll'),initialScroll=scroll.scrollLeft,epoch=this.session.base.revision;
  let delta=0,moved=false,ghost=null;this.gesture=new AbortController();const signal=this.gesture.signal;
  const cleanup=()=>{this.gesture?.abort();this.gesture=null;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;ghost?.remove();bar.classList.remove('is-moving');this.cancelGesture=null};
  this.cancelGesture=cleanup;
  window.addEventListener('pointermove',ev=>{
   if(ev.pointerId!==e.pointerId||Math.abs(ev.clientX-initialX)<4&&!moved)return;
   moved=true;ev.preventDefault();delta=Math.round((ev.clientX-initialX+scroll.scrollLeft-initialScroll)/b.px);
   if(resize==='start')delta=Math.min(delta,C.day(r.end)-C.day(r.start));
   if(resize==='end')delta=Math.max(delta,C.day(r.start)-C.day(r.end));
   if(!ghost){ghost=bar.cloneNode(true);ghost.classList.add('rm-ghost');ghost.removeAttribute('data-rm-bar');ghost.removeAttribute('data-rm-select');ghost.removeAttribute('data-focus-key');ghost.tabIndex=-1;ghost.setAttribute('aria-hidden','true');bar.parentNode.append(ghost);bar.classList.add('is-moving')}
   if(this.frame)cancelAnimationFrame(this.frame);
   this.frame=requestAnimationFrame(()=>{
    if(!ghost)return;
    if(resize==='end')ghost.style.width=Math.max(2,bar.offsetWidth+delta*b.px)+'px';
    else if(resize==='start'){ghost.style.transform=`translateX(${delta*b.px}px)`;ghost.style.width=Math.max(2,bar.offsetWidth-delta*b.px)+'px'}
    else ghost.style.transform=`translateX(${delta*b.px}px)`;
   });
  },{signal,passive:false});
  window.addEventListener('pointerup',ev=>{
   if(ev.pointerId!==e.pointerId)return;cleanup();
   if(moved&&delta&&epoch===this.session.base.revision&&!this.locked){
    this.ignoreClick=true;setTimeout(()=>this.ignoreClick=false,0);this.selectedId=r.id;
    this.editRow(r,resize==='end'?r.start:C.addDays(r.start,delta),resize==='start'?r.end:C.addDays(r.end,delta),resize?'resize':'move');
   }
  },{signal});
  window.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&this.cancelGesture){ev.preventDefault();ev.stopPropagation();this.cancelGesture()}},{signal,capture:true});
  window.addEventListener('pointercancel',cleanup,{signal,once:true});
 }
}
require('./capabilities.js').installRoadmap(IqRoadmap);
exports.IqRoadmap=IqRoadmap;

