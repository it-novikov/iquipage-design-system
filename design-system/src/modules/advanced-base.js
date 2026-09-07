 'use strict';
const C=require('./advanced-core.js'),{icon}=require('./components.js');
let serial=0;
function button(label,action,glyph='',extra='',role='secondary'){
 return `<button type="button" class="iq-btn ${role} sm" data-pro-action="${action}" ${extra}><span>${C.escape(label)}</span>${glyph?icon(glyph,16):''}</button>`;
}
function ib(label,action,glyph,extra=''){
 return `<button type="button" class="iq-btn ghost sm icon-only" aria-label="${C.escape(label)}" title="${C.escape(label)}" data-pro-action="${action}" ${extra}>${icon(glyph,18)}</button>`;
}
function focusSignature(el) {
 if(!el)return null;
 const keys=['focusKey','graphField','rmDate','proAction','rmSelect','nodeId','edgeId','rmEdge'];
 for(const k of keys)if(el.dataset?.[k])return{k,value:el.dataset[k],tag:el.tagName,scale:el.dataset.scale,view:el.dataset.view,kind:el.dataset.kind,node:el.dataset.node,days:el.dataset.days,edge:el.dataset.edge};
 if(el.id)return{id:el.id};
 return null;
}
class IqDataSurface extends HTMLElement {
 static get observedAttributes(){return ['readonly','state']}
 constructor(){
  super();this.uid='iq-pro-'+(++serial);this._state='ready';this._readonly=false;this.controlled=false;
  this.pending=false;this.requestEpoch=0;this.issue='';this.selectedId='';this.disposed=false;
 }
 get data(){return this.session?C.clone(this.session.value):null}
 set data(value){
  const parsed=this.validate(value);
  this.cancelGesture?.();this.gesture?.abort();this.gesture=null;if(this.frame)cancelAnimationFrame(this.frame);
  if(this.session){const clean=this.session.load(parsed);if(!clean&&this.pending){this.pending=false;this.invalidateRequest()}}
  else this.session=new C.EditSession(parsed);
  const current=this.session.value;const ids=(current.rows||current.nodes||[]).filter(x=>!x.archived).map(x=>x.id);if(this.selectedId&&!ids.includes(this.selectedId))this.selectedId='';
  if(this.selectedEdge&&!(current.edges||[]).some(x=>x.id===this.selectedEdge&&ids.includes(x.source)&&ids.includes(x.target)))this.selectedEdge='';
  if(this.selectedDependency&&!(current.dependencies||[]).some(x=>x.id===this.selectedDependency))this.selectedDependency='';
  this.schedule();
 }
 get state(){return this.getAttribute('state')||this._state}
 set state(value){
  if(!['ready','loading','error','empty','blocked'].includes(value))throw new TypeError('Неизвестное состояние');
  this._state=value;this.setAttribute('state',value);this.schedule();
 }
 get readonly(){return this._readonly||this.hasAttribute('readonly')}
 set readonly(v){this._readonly=!!v;this.toggleAttribute('readonly',!!v);this.schedule()}
 attributeChangedCallback(){if(this.locked){this.cancelGesture?.();this.gesture?.abort();this.gesture=null}this.schedule()}
 get locked(){return this.readonly||this.pending||this.state!=='ready'||!!this.session?.conflict}
 connectedCallback(){
  this.disposed=false;this.events?.abort();this.events=new AbortController();
  this.addEventListener('click',e=>{
   const b=e.target.closest('[data-pro-action]');
   if(!b||!this.contains(b)||b.disabled||b.getAttribute('aria-disabled')==='true')return;
   try{this.action(b.dataset.proAction,b,e)}catch(error){this.issue=error.message||String(error);this.schedule()}
  },{signal:this.events.signal});
  this.start?.();this.schedule();
 }
 invalidateRequest(){this.requestEpoch++;this.commitAbort?.abort()}
 disconnectedCallback(){
  this.disposed=true;this.invalidateRequest();this.pending=false;this.events?.abort();this.resizeObserver?.disconnect();
  this.cancelGesture?.();this.gesture?.abort();if(this.frame)cancelAnimationFrame(this.frame);this.cleanup?.();
 }
 schedule(){if(this._queued)return;this._queued=true;queueMicrotask(()=>{this._queued=false;if(this.isConnected&&!this.disposed)this.draw()})}
 emit(type,detail={},cancelable=false){return this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true,cancelable}))}
 draw(){
  const active=this.contains(document.activeElement)?document.activeElement:null,signature=focusSignature(active);
  const selection=active&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
  const opens=[...this.querySelectorAll('details[open]')].map(d=>d.className);
  const preserve=this.issue?[...this.querySelectorAll('[data-graph-field]')].map(el=>[el.dataset.graphField,el.value]):[];
  this.render();
  for(const name of opens)for(const d of this.querySelectorAll('details'))if(d.className===name)d.open=true;
  for(const[key,val]of preserve){const el=[...this.querySelectorAll('[data-graph-field]')].find(e=>e.dataset.graphField===key);if(el&&!el.disabled&&!el.closest('[hidden]'))el.value=val}
  if(signature){
   const next=[...this.querySelectorAll('*')].find(e=>{
    if(signature.id)return e.id===signature.id;
    return e.tagName===signature.tag&&e.dataset?.[signature.k]===signature.value&&(!signature.scale||e.dataset.scale===signature.scale)&&(!signature.view||e.dataset.view===signature.view)&&(!signature.kind||e.dataset.kind===signature.kind)&&(!signature.node||e.dataset.node===signature.node)&&(!signature.days||e.dataset.days===signature.days)&&(!signature.edge||e.dataset.edge===signature.edge);
   });
   if(next&&!next.disabled&&!next.closest('[hidden]')){next.focus({preventScroll:true});if(selection&&next.setSelectionRange)try{next.setSelectionRange(...selection)}catch{}}
  }
 }
 preview(next,operation){
  if(this.locked)return false;
  this.session.preview(this.validate(next),operation);this.issue='';
  this.emit('iq-preview',{value:this.data,baseRevision:this.session.base.revision,operation});this.schedule();return true;
 }
 requestCommit(){
  if(this.locked||!this.session?.dirty)return false;
  const conflicts=this.conflicts?.()||[];
  if(conflicts.length){this.issue=conflicts.map(x=>x.message).join(' ');this.schedule();return false}
  const proposed=this.data,previous=C.clone(this.session.base),operation=this.session.operation,epoch=++this.requestEpoch;
  this.commitAbort?.abort();this.commitAbort=new AbortController();let handled=false;
  const canSettle=()=>!handled&&epoch===this.requestEpoch&&!this.disposed&&!this.session.conflict;
  const detail={value:proposed,previous,baseRevision:previous.revision,operation,signal:this.commitAbort.signal,
   accept:value=>{if(!canSettle())return false;const parsed=this.validate(value);handled=true;this.accept(parsed);return true},
   reject:message=>{if(!canSettle())return false;handled=true;this.reject(message);return true}};
  this.pending=!!this.controlled;
  const allowed=this.emit('iq-change-request',detail,true);
  if(!handled&&!this.controlled&&allowed){handled=true;const value=this.session.commit();this.emit('iq-change',{value:C.clone(value),operation});this.issue=''}
  if(!allowed&&!handled)this.pending=false;this.schedule();return true;
 }
 accept(value){this.session.accept(this.validate(value));this.pending=false;this.issue='';this.emit('iq-change',{value:this.data});this.schedule()}
 reject(message='Не удалось применить изменения. Черновик сохранён.'){this.pending=false;this.issue=String(message);this.schedule()}
 baseAction(action){
  switch(action){
   case'apply':this.requestCommit();return true;
   case'cancel':this.invalidateRequest();this.session?.cancel();this.issue='';this.pending=false;this.emit('iq-cancel');this.schedule();return true;
   case'reload':case'reapply':
    this.invalidateRequest();this.pending=false;
    try{const backup=this.session.draft&&C.clone(this.session.draft),remote=this.session.remote&&C.clone(this.session.remote),previous=C.clone(this.session.base);
      this.session.resolve(action==='reload'?'reload':'reapply');
      try{this.validate(this.session.value)}catch(err){this.session.base=previous;this.session.remote=remote;this.session.draft=backup;throw err}
      this.issue='';this.emit('iq-conflict-resolved',{strategy:action,value:this.data})
    }catch(err){this.issue=err.message}
    this.schedule();return true;
   case'undo':if(!this.locked&&!this.session?.dirty&&this.session?.history.length)this.preview({...C.clone(this.session.history.at(-1)),revision:this.session.base.revision},{kind:'undo'});return true;
   case'retry':this.emit('iq-retry');return true;
   default:return false;
  }
 }
 stateMarkup(label){
  if(this.state==='ready')return '';
  const labels={loading:['Загружаем '+label,'Данные появятся после загрузки.'],error:['Не удалось загрузить '+label,'Проверьте подключение и повторите запрос.'],empty:['Пока нет данных','Добавьте первые объекты, чтобы начать работу.'],blocked:['Доступ ограничен','Изменения доступны только участникам с правом редактирования.']};
  const x=labels[this.state]||labels.error;
  return `<div class="iq-pro-state is-${this.state}" role="${this.state==='error'?'alert':'status'}" ${this.state==='loading'?'aria-busy="true"':''}><span class="iq-pro-state-icon">${icon(this.state==='error'?'xCircle':this.state==='blocked'?'lock':this.state==='loading'?'refresh':'folder',24)}</span><h3>${x[0]}</h3><p>${x[1]}</p>${this.state==='error'?button('Повторить','retry','refresh'):''}</div>`;
 }
 dock(){
  const s=this.session;if(!s)return '';
  const visible=s.dirty||this.pending||s.conflict;
  return `<div class="iq-pro-dock" ${visible?'':'hidden'}><div class="iq-pro-draft"><span class="iq-pro-dot"></span><div><b>${this.pending?'Сохраняем изменения':s.conflict?'Получена новая версия':'Изменения не применены'}</b><small ${this.issue?'role="alert"':''}>${C.escape(this.issue||(s.conflict?'Черновик сохранён. Загрузите новую версию или перенесите свои правки.':this.pending?'Можно отменить ожидание. Черновик не считается сохранённым.':'Проверьте результат и примените или отмените правки.'))}</small></div></div><div class="iq-pro-actions">${s.conflict?button('Загрузить новую','reload')+button('Перенести мои правки','reapply','','','primary'):button(this.pending?'Отменить ожидание':'Отменить','cancel')+button(this.pending?'Сохранение…':'Применить','apply','check',this.pending||this.readonly||this.state!=='ready'||!s.dirty?'disabled':'','primary')}</div></div>`;
 }
}
Object.assign(exports,{IqDataSurface,button,ib});

