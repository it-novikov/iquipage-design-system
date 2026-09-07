import dep0 from './advanced-core.js';
import dep1 from './components.js';
const exports={};
const deps={"./advanced-core.js":dep0,"./components.js":dep1};
(function(exports,require){
 'use strict';
const {escape:esc,clone}=require('./advanced-core.js'),{icon}=require('./components.js');
let serial=0;
function optionList(value){
 if(!Array.isArray(value))throw new TypeError('options должен быть массивом');
 if(value.length>10000)throw new RangeError('Не более 10 000 результатов в одном списке.');
 const seen=new Set();
 return value.map(o=>{
  if(!o||typeof o.value!=='string'||!o.value.trim()||typeof o.label!=='string'||!o.label.trim()||seen.has(o.value))throw new TypeError('Опции: уникальные value и непустые label');
  seen.add(o.value);return{value:o.value,label:o.label,description:String(o.description||''),disabled:!!o.disabled};
 });
}
/** Editable combobox. Input, popup footer and their focus are stable during requests. */
class IqRemoteCombobox extends HTMLElement {
 static formAssociated=true;
 static get observedAttributes(){return ['label','disabled','readonly','placeholder','value','required']}
 constructor(){
  super();this.uid='iq-remote-'+(++serial);this._options=[];this._selected=null;this._value='';
  this.query='';this.requestId=0;this.active=-1;this.open=false;this.loading=false;this.error='';
  this.nextCursor=null;this.provider=null;this.controlled=false;this.debounce=180;this._append=false;
  this.composing=false;this._fieldDisabled=false;try{this.internals=this.attachInternals()}catch{}
 }
 attributeChangedCallback(name,old,value){
  if(old===value)return;
  if(name==='value'){this.value=value||'';return}
  if(this.disabled||this.readonly)this.close();
  if(this.isConnected){this.syncAttributes();this.syncValue()}
 }
 get disabled(){return this.hasAttribute('disabled')||this._fieldDisabled}
 set disabled(v){this.toggleAttribute('disabled',!!v)}
 get readonly(){return this.hasAttribute('readonly')}
 set readonly(v){this.toggleAttribute('readonly',!!v)}
 get value(){return this._value}
 set value(value){
  this._value=String(value??'');
  if(!this._value)this._selected=null;
  else if(this._selected?.value!==this._value)this._selected=this._options.find(o=>o.value===this._value)||{value:this._value,label:this._value};
  this.syncValue();
 }
 get selectedOption(){return this._selected?clone(this._selected):null}
 set selectedOption(value){
  if(value===null){this.value='';return}
  this._selected=optionList([value])[0];this._value=this._selected.value;this.syncValue();
 }
 get options(){return clone(this._options)}
 set options(value){const parsed=optionList(value);this.abort?.abort();this.requestId++;clearTimeout(this.timer);this._options=parsed;this.nextCursor=null;this.error='';this.active=-1;this.loading=false;this.paintList()}
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();this.render();
  const on=(t,fn,target=this)=>target.addEventListener(t,fn,{signal:this.events.signal});
  on('compositionstart',()=>this.composing=true);
  on('compositionend',()=>{this.composing=false;this.onInput()});
  on('input',e=>{if(e.target===this.input&&!this.composing)this.onInput()});
  on('focusin',e=>{if(e.target===this.input&&!this.open&&!this._focusSuppressed)this.openList()});
  on('keydown',e=>this.keys(e));
  on('pointerdown',e=>{if(e.target.closest('[data-option],[data-remote-more],[data-remote-retry]'))e.preventDefault()});
  on('click',e=>{
   const item=e.target.closest('[data-option]');
   if(item){this.choose(+item.dataset.option);return}
   if(e.target.closest('[data-remote-clear]')){this.change(null);this.close();this._focusSuppressed=true;this.input.focus({preventScroll:true});this._focusSuppressed=false;return}
   if(e.target.closest('[data-remote-retry]'))this.request(this._append);
   if(e.target.closest('[data-remote-more]')&&!this.loading)this.request(true);
  });
  on('pointerdown',e=>{if(!this.contains(e.target))this.close()},document);
  on('focusout',()=>{
   clearTimeout(this.blurTimer);
   this.blurTimer=setTimeout(()=>{if(this.isConnected&&!this.contains(document.activeElement))this.close()},0);
  });
  on('scroll',()=>{if(this.open)this.place()},window);
  on('resize',()=>{if(this.open)this.place()},window);
  this.initialValue=this.getAttribute('value')||this._value;this.initialOption=this.selectedOption;
  this.syncValue();
 }
 disconnectedCallback(){this.events?.abort();this.close();this.input=null}
 formDisabledCallback(v){this._fieldDisabled=v;if(v)this.close();this.syncAttributes()}
 formResetCallback(){this.close();this._selected=this.initialOption;this.value=this.initialValue||''}
 formStateRestoreCallback(v){this.value=String(v||'')}
 get validity(){return this.internals?.validity}checkValidity(){return this.internals?.checkValidity()??true}
 reportValidity(){return this.internals?.reportValidity()??true}
 emit(type,detail,cancelable=false){return this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true,cancelable}))}
 render(){
  this.innerHTML=`<div class="iq-remote-control"><label for="${this.uid}"></label><div class="iq-remote-input">${icon('search',18)}<input id="${this.uid}" type="text" role="combobox" aria-autocomplete="list" aria-controls="${this.uid}-list" aria-expanded="false" autocomplete="off" spellcheck="false"><button type="button" class="iq-remote-clear" data-remote-clear aria-label="Очистить выбор">${icon('x',16)}</button></div><div class="iq-remote-popup" popover="manual" hidden><div class="iq-remote-results" id="${this.uid}-list" role="listbox"></div><div class="iq-remote-foot"><span class="iq-remote-status" role="status" aria-live="polite"></span><button type="button" class="iq-btn secondary sm" data-remote-retry hidden>Повторить ${icon('refresh',16)}</button><button type="button" class="iq-btn ghost sm" data-remote-more hidden>Загрузить ещё ${icon('down',16)}</button></div></div></div>`;
  this.input=this.querySelector('input');this.popup=this.querySelector('.iq-remote-popup');
  this.list=this.querySelector('[role=listbox]');this.statusEl=this.querySelector('.iq-remote-status');
  this.more=this.querySelector('[data-remote-more]');this.retry=this.querySelector('[data-remote-retry]');
  this.syncAttributes();
 }
 syncAttributes(){
  if(!this.input)return;const label=this.getAttribute('label')||'Поиск и выбор';
  this.querySelector('label').textContent=label;this.list?.setAttribute('aria-label',label);
  this.input.placeholder=this.getAttribute('placeholder')||'Введите для поиска…';this.input.disabled=this.disabled;
  this.input.readOnly=this.readonly;this.input.setAttribute('aria-required',String(this.hasAttribute('required')));
  const clear=this.querySelector('[data-remote-clear]');clear.disabled=this.disabled||this.readonly;
 }
 syncValue(){
  if(this.input&&!this.open)this.input.value=this._selected?.label||'';
  this.internals?.setFormValue(this._value);
  if(this.hasAttribute('required')&&!this._value&&this.input)this.internals?.setValidity({valueMissing:true},'Выберите значение.',this.input);
  else this.internals?.setValidity({});
  this.paintList();
 }
 openList(){
  if(this.disabled||this.readonly||!this.input)return;
  this.open=true;this.query='';this.active=-1;this.request(false);
 }
 onInput(){
  if(this.disabled||this.readonly)return;
  this.abort?.abort();this.requestId++;this.query=this.input.value;this.open=true;this.active=-1;
  this.nextCursor=null;this._options=[];this.error='';this.loading=true;clearTimeout(this.timer);
  this.timer=setTimeout(()=>this.request(false),Math.min(1000,Math.max(0,Number(this.debounce)||0)));this.paintList();
 }
 paintList(){
  if(!this.isConnected||!this.input)return;
  this.input.setAttribute('aria-expanded',String(this.open));this.input.setAttribute('aria-busy',String(this.loading));
  this.querySelector('[data-remote-clear]').hidden=!this._value||this.readonly;
  this.list.innerHTML=this._options.map((o,i)=>`<div role="option" id="${this.uid}-opt-${i}" data-option="${i}" aria-selected="${o.value===this._value}" aria-disabled="${o.disabled}" class="iq-remote-option${i===this.active?' active':''}"><span><b>${esc(o.label)}</b>${o.description?`<small>${esc(o.description)}</small>`:''}</span><span class="iq-remote-check">${o.value===this._value?icon('check',18):''}</span></div>`).join('');
  this.updateActive(false);
  this.statusEl.textContent=this.loading?(this._append?'Загружаем следующую страницу…':'Ищем…'):this.error||(!this._options.length?'Ничего не найдено. Измените запрос.':`Найдено: ${this._options.length}`);
  this.statusEl.classList.toggle('iq-pro-error',!!this.error);
  this.popup.classList.toggle('has-results',this._options.length>0);
  const focused=document.activeElement;
  this.retry.hidden=!this.error||this.loading;this.more.hidden=this.nextCursor==null||!!this.error||(!this._options.length&&this.loading);this.more.disabled=false;this.more.setAttribute('aria-disabled',String(this.loading));
  if((focused===this.more&&this.more.hidden)||(focused===this.retry&&this.retry.hidden)){
   // Move before hiding the focused action. Never reconstruct the input to update a result.
   if(this.open)this.input.focus({preventScroll:true});
  }
  if(this.open){
   this.popup.hidden=false;
   try{if(this.popup.showPopover&&!this.popup.matches(':popover-open'))this.popup.showPopover()}catch{}
   this.place();
  }else{
   try{if(this.popup.hidePopover&&this.popup.matches(':popover-open'))this.popup.hidePopover()}catch{}
   this.popup.hidden=true;
  }
 }
 place(){
  if(!this.open||!this.popup||!this.input)return;
  const r=this.querySelector('.iq-remote-input').getBoundingClientRect(),vv=window.visualViewport;
  const vw=vv?.width||innerWidth,vh=vv?.height||innerHeight,ox=vv?.offsetLeft||0,oy=vv?.offsetTop||0;
  const width=Math.min(Math.max(r.width,280),vw-24),left=Math.max(ox+12,Math.min(r.left,ox+vw-width-12));
  const below=oy+vh-r.bottom-20,above=r.top-oy-20,preferred=Math.min(360,this.list.scrollHeight+70);
  const up=below<preferred&&above>below,available=Math.max(70,up?above:below);
  const height=Math.min(360,available);
  Object.assign(this.popup.style,{position:'fixed',margin:'0',inset:'auto',left:left+'px',width:width+'px',maxHeight:height+'px'});
  this.list.style.maxHeight=Math.max(0,height-72)+'px';
  if(up){this.popup.style.top='auto';this.popup.style.bottom=Math.max(12,innerHeight-r.top+8)+'px'}
  else{this.popup.style.bottom='auto';this.popup.style.top=(r.bottom+8)+'px'}
 }
 updateActive(scroll=true){
  this.list?.querySelectorAll('[data-option]').forEach((el,i)=>el.classList.toggle('active',i===this.active));
  if(this.open&&this.active>=0&&this._options[this.active]){
   this.input.setAttribute('aria-activedescendant',`${this.uid}-opt-${this.active}`);
   if(scroll){const el=this.list.children[this.active];if(el){const top=el.offsetTop,bottom=top+el.offsetHeight;if(top<this.list.scrollTop)this.list.scrollTop=top;else if(bottom>this.list.scrollTop+this.list.clientHeight)this.list.scrollTop=bottom-this.list.clientHeight}}
  }else this.input?.removeAttribute('aria-activedescendant');
 }
 async request(append=false){
  if(this.disabled||this.readonly||!this.isConnected)return;
  if(append&&(this.nextCursor==null||this.loading))return;
  clearTimeout(this.timer);this.abort?.abort();this.abort=new AbortController();
  const signal=this.abort.signal,id=++this.requestId,cursor=append?this.nextCursor:null;
  this.open=true;this.loading=true;this.error='';if(!append){this._options=[];this.nextCursor=null}this._append=append;this.active=-1;this.paintList();
  const detail={query:this.query,cursor,requestId:id,signal};this.emit('iq-query',detail);
  if(typeof this.provider!=='function')return;
  try{const result=await this.provider(detail);if(!signal.aborted)this.setResult(result,id)}
  catch(e){if(!signal.aborted)this.setError(e?.message||'Поиск временно недоступен.',id)}
 }
 setResult(result,id=this.requestId){
  if(id!==this.requestId||!this.isConnected||this.abort?.signal.aborted)return false;
  const opts=optionList(result?.options);
  if(this._append){const map=new Map(this._options.map(o=>[o.value,o]));opts.forEach(o=>map.set(o.value,o));this._options=[...map.values()]}else this._options=opts;
  this.nextCursor=result.nextCursor??null;this.loading=false;this.error='';this.active=-1;
  const updated=this._options.find(o=>o.value===this._value);if(updated)this._selected=updated;
  this.paintList();return true;
 }
 setError(message,id=this.requestId){if(id!==this.requestId||!this.isConnected||this.abort?.signal.aborted)return false;this.loading=false;this.error=String(message);this.paintList();return true}
 close(){
  this.open=false;this.active=-1;this.loading=false;clearTimeout(this.timer);clearTimeout(this.blurTimer);this.abort?.abort();this.requestId++;
  if(this.input)this.input.value=this._selected?.label||'';this.paintList();
 }
 choose(index){
  const option=this._options[index];if(!option||option.disabled||this.disabled||this.readonly||this.loading&&!this._append)return;
  this.change(option);this.close();
  // The input normally never lost DOM focus while choosing.
 }
 change(option){
  if(this.disabled||this.readonly)return;
  const detail={value:option?.value||'',option:option?clone(option):null,previous:this._value};
  const allowed=this.emit('iq-change-request',detail,true);
  if(allowed&&!this.controlled){this._selected=option;this._value=detail.value;this.syncValue();this.emit('iq-change',detail)}
 }
 keys(e){
  if(e.isComposing||this.composing)return;
  if(e.key==='Escape'&&this.open){e.stopPropagation();e.preventDefault();this.close();this._focusSuppressed=true;this.input?.focus({preventScroll:true});this._focusSuppressed=false;return}
  if(e.target!==this.input)return;
  if(e.key==='Enter'&&this.open){e.preventDefault();if(this.active>=0)this.choose(this.active);return}
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!this.open){e.preventDefault();this.openList();return}
  if(!this.open||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  if(['Home','End'].includes(e.key)&&!e.altKey)return; // keep normal text editing.
  e.preventDefault();const enabled=this._options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);if(!enabled.length)return;
  const n=enabled.indexOf(this.active);
  const next=e.key==='Home'?0:e.key==='End'?enabled.length-1:e.key==='ArrowDown'?Math.min(n+1,enabled.length-1):n<0?enabled.length-1:Math.max(0,n-1);
  this.active=enabled[next];this.updateActive();
 }
}
class IqTagInput extends HTMLElement {
 static formAssociated=true;
 static get observedAttributes(){return ['disabled','readonly','label','max','maxlength','required']}
 constructor(){
  super();this._value=[];this.controlled=false;this.error='';this.uid='iq-tags-'+(++serial);this._formDisabled=false;
  this.pending=false;this.pendingOperation=null;this.epoch=0;try{this.internals=this.attachInternals()}catch{}
 }
 get max(){const n=Number(this.getAttribute('max')??20);return Number.isInteger(n)&&n>=0?n:20}
 get maxLength(){const n=Number(this.getAttribute('maxlength')??40);return Number.isInteger(n)&&n>0?n:40}
 get disabled(){return this.hasAttribute('disabled')||this._formDisabled}
 set disabled(v){this.toggleAttribute('disabled',!!v)}
 get readonly(){return this.hasAttribute('readonly')}
 set readonly(v){this.toggleAttribute('readonly',!!v)}
 get value(){return [...this._value]}
 set value(value){
  if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>this.maxLength)||new Set(value.map(v=>v.trim())).size!==value.length||value.length>this.max)throw new TypeError('Метки: уникальные непустые строки в пределах лимита.');
  const pending=this.pendingOperation;this._value=value.map(v=>v.trim());this.error='';this.pending=false;this.pendingOperation=null;this.epoch++;
  if(pending?.kind==='add'&&this._value.includes(pending.value)&&this.input)this.input.value='';
  this.internals?.setFormValue(JSON.stringify(this._value));this.paint();
 }
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();this.render();this.initialValue=this.value;
  const signal=this.events.signal;
  this.addEventListener('keydown',e=>{
   if(e.target!==this.input||e.isComposing)return;
   if(e.key==='Enter'||e.key===','){e.preventDefault();if(this.input.value.trim())this.add(this.input.value)}
   else if(e.key==='Backspace'&&!this.input.value&&this._value.length){e.preventDefault();this.remove(this._value.at(-1))}
  },{signal});
  this.addEventListener('input',e=>{if(e.target===this.input&&this.error){this.error='';this.paint()}},{signal});
  this.addEventListener('click',e=>{
   const remove=e.target.closest('[data-tag-remove]');
   if(remove){this.remove(this._value[+remove.dataset.tagRemove]);this.input?.focus()}
   if(e.target.closest('[data-tag-add]'))this.add(this.input.value);
   if(e.target.closest('[data-tag-cancel]')){this.epoch++;this.pending=false;this.pendingOperation=null;this.paint();this.input?.focus()}
  },{signal});
  this.paint();
 }
 disconnectedCallback(){this.events?.abort();this.epoch++;this.pending=false;this.pendingOperation=null}
 attributeChangedCallback(){if(this.isConnected)this.paint()}
 formDisabledCallback(v){this._formDisabled=v;this.paint()}
 formResetCallback(){this.value=this.initialValue||[];if(this.input)this.input.value=''}
 formStateRestoreCallback(v){try{this.value=JSON.parse(v)}catch{this.value=[]}}
 render(){
  this.innerHTML=`<label class="iq-pro-field" for="${this.uid}"><span data-tags-label></span></label><div class="iq-tag-field"><div class="iq-tag-values"></div><input id="${this.uid}" type="text" aria-describedby="${this.uid}-help" placeholder="Добавить метку" autocomplete="off"><button type="button" class="iq-btn ghost sm" data-tag-add aria-label="Добавить метку">${icon('plus',18)}</button></div><div class="iq-tag-bottom"><span class="iq-tag-help" id="${this.uid}-help" role="status" aria-live="polite"></span><button type="button" class="iq-btn ghost sm" data-tag-cancel hidden>Отменить</button></div>`;
  this.input=this.querySelector('input');
 }
 paint(){
  if(!this.isConnected||!this.input)return;
  const locked=this.disabled||this.readonly||this.pending;
  this.querySelector('[data-tags-label]').textContent=this.getAttribute('label')||'Метки';
  this.querySelector('.iq-tag-field').classList.toggle('disabled',this.disabled);
  this.querySelector('.iq-tag-field').classList.toggle('invalid',!!this.error);
  this.input.disabled=this.disabled;this.input.readOnly=this.readonly||this.pending;
  this.input.setAttribute('aria-invalid',String(!!this.error));
  this.input.placeholder=this.readonly?(this._value.length?'':'Нет меток'):this._value.length>=this.max?'Лимит достигнут':'Добавить метку';
  this.querySelector('[data-tag-add]').disabled=locked||this._value.length>=this.max;
  this.querySelector('[data-tag-add]').hidden=this.readonly;
  this.querySelector('[data-tag-cancel]').hidden=!this.pending;
  this.querySelector('.iq-tag-values').innerHTML=this._value.map((v,i)=>`<span class="iq-tag-token"><span>${esc(v)}</span>${this.readonly?'':`<button type="button" data-tag-remove="${i}" aria-label="Удалить метку ${esc(v)}" ${locked?'disabled':''}>${icon('x',14)}</button>`}</span>`).join('');
  const help=this.querySelector('.iq-tag-help');
  help.textContent=this.error||(this.pending?'Ожидаем подтверждения…':this.readonly?`${this._value.length} меток. Только чтение.`:`${this._value.length} из ${this.max}. Enter — добавить.`);
  help.classList.toggle('iq-pro-error',!!this.error);
  if(this.hasAttribute('required')&&!this._value.length)this.internals?.setValidity({valueMissing:true},'Добавьте хотя бы одну метку.',this.input);
  else this.internals?.setValidity({});
 }
 change(next,operation){
  if(this.disabled||this.readonly||this.pending)return false;
  const id=++this.epoch;let settled=false;this.pending=!!this.controlled;this.pendingOperation=operation;
  const detail={value:[...next],previous:this.value,operation,
   accept:()=>{if(settled||id!==this.epoch||!this.isConnected)return false;settled=true;this.value=next;this.emit('iq-change',detail);return true},
   reject:message=>{if(settled||id!==this.epoch||!this.isConnected)return false;settled=true;this.pending=false;this.pendingOperation=null;this.error=String(message||'Изменение не принято.');this.paint();return true}};
  const allowed=this.emit('iq-change-request',detail,true);
  if(allowed&&!this.controlled&&!settled){this.value=next;this.emit('iq-change',detail)}
  else if(!allowed&&id===this.epoch){this.pending=false;this.pendingOperation=null}
  this.paint();return allowed;
 }
 emit(type,detail,cancelable=false){return this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true,cancelable}))}
 add(value){
  if(this.disabled||this.readonly||this.pending)return;
  const v=String(value).trim();
  this.error=!v?'Введите метку.':v.length>this.maxLength?`Не более ${this.maxLength} символов.`:this._value.includes(v)?'Такая метка уже есть.':this._value.length>=this.max?`Можно добавить не более ${this.max} меток.`:'';
  if(!this.error)this.change([...this._value,v],{kind:'add',value:v});this.paint();
 }
 remove(value){if(this.disabled||this.readonly||this.pending||!this._value.includes(value))return;this.error='';this.change(this._value.filter(v=>v!==value),{kind:'remove',value})}
}
Object.assign(exports,{IqRemoteCombobox,IqTagInput,optionList});


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
