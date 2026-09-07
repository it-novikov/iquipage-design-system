import dep0 from './whiteboard-core.js';
import dep1 from './whiteboard-experience-core.js';
import dep2 from './whiteboard-shapes.js';
import dep3 from './whiteboard-routing.js';
import dep4 from './components.js';
import dep5 from './icons.js';
const exports={};
const deps={"./whiteboard-core.js":dep0,"./whiteboard-experience-core.js":dep1,"./whiteboard-shapes.js":dep2,"./whiteboard-routing.js":dep3,"./components.js":dep4,"./icons.js":dep5};
(function(exports,require){
'use strict';
/** 05.7 interaction surface. Installed after studio; it reuses the board's history,
 * permissions, atomic commit and text editor. No application data or network here.
 */
const B=require('./whiteboard-core.js');
const U=require('./whiteboard-experience-core.js');
const Shapes=require('./whiteboard-shapes.js');
const R=require('./whiteboard-routing.js');
const {icon,escapeHTML:esc}=require('./components.js');
const glyphs=require('./icons.js').glyphs;
const SOURCED={
 minus:'<path d="M5 12h14"/>',
 fit:'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
 plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
 undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
 redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
 connect:'<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>'
};
function dockIcon(key){return `<svg class="wb-dock-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SOURCED[key]||glyphs[key]||glyphs.box}</svg>`;}
function shapePreview(id){const [w,h]=Shapes.shapeDefinition(id).size,z=Math.min(76/w,50/h),x=(100-w*z)/2,y=(70-h*z)/2;return `<svg class="wb-library-shape" viewBox="0 0 100 70" width="52" height="38" aria-hidden="true"><g transform="translate(${x} ${y}) scale(${w*z/100} ${h*z/100})">${Shapes.face(id,w,h)}</g></svg>`;}
const names={sticky:'Заметка',text:'Текст',task:'Действие',frame:'Область',image:'Изображение'};
const noteEntries=[
 ['sticky','Заметка','Идея, вопрос, наблюдение','sticky','sand'],
 ['text','Текст','Заголовок или пояснение','text','neutral'],
 ['task','Действие','Договорённость и ответственный','checklist','mint'],
 ['frame','Область','Объединить несколько объектов','board','neutral']
];
function installWorkshop(Klass){
 const prev={};for(const key of ['initDOM','listen','render','renderLibrary','renderSelection','click','action','setTool','moveConnector','updateViewport','disconnectedCallback'])prev[key]=Klass.prototype[key];
 Object.assign(Klass.prototype,{
  initDOM(){
   prev.initDOM.call(this);if(this.shell.dataset.workshop)return;this.shell.dataset.workshop='057';
   this.libraryQuery='';
   this.libraryEl.querySelector('header').innerHTML=`<div><h3>Добавить на доску</h3><p>Выберите объект и место для него</p></div><button type="button" class="wb-button wb-icon-button" data-wb-action="library-toggle" aria-label="Скрыть библиотеку">${icon('x',18)}</button>`;
   this.libraryEl.querySelector('.wb-library-categories').innerHTML=[['notes','Записи'],['shapes','Фигуры'],['media','Файлы']].map(([id,label])=>`<button type="button" data-library-category="${id}" aria-pressed="${id==='notes'}">${label}</button>`).join('');
   const categories=this.libraryEl.querySelector('.wb-library-categories');
   categories.insertAdjacentHTML('beforebegin',`<label class="wb-library-search">${icon('search',16)}<input type="search" aria-label="Поиск объектов" placeholder="Найти объект…" autocomplete="off"></label>`);
   this.libraryEl.querySelector('.wb-library-tip').textContent='Нажмите на объект и разместите его на доске. Escape — отменить.';
   const dock=this.shell.querySelector('.wb-dock');
   dock.querySelector('[data-wb-action=library-toggle]').innerHTML=dockIcon('plus')+'<span>Объекты</span>';
   for(const [key,symbol] of [['select','cursor'],['hand','hand'],['connect','connect']]){
    const button=dock.querySelector(`[data-tool="${key}"]`);button.innerHTML=dockIcon(symbol);button.dataset.tip={select:'Выбрать',hand:'Переместить доску',connect:'Соединить объекты'}[key];button.dataset.shortcut={select:'V',hand:'H',connect:'C'}[key];
   }
   for(const key of ['undo','redo'])dock.querySelector(`[data-wb-action=${key}]`).innerHTML=dockIcon(key);
   for(const [action,key]of [['zoom-in','plus'],['zoom-out','minus'],['fit','fit']]){const b=this.shell.querySelector('.wb-zoom [data-wb-action='+action+']');b.innerHTML=dockIcon(key);b.dataset.tip=b.getAttribute('aria-label');}
   for(const el of dock.querySelectorAll('button'))el.dataset.tip ||= el.getAttribute('aria-label');
   const tip=document.createElement('div');tip.className='wb-overlay-tip';tip.id=this.uid+'-tip';tip.setAttribute('role','tooltip');tip.hidden=true;this.shell.append(tip);this.tipEl=tip;
   this.renderLibrary();
  },
  listen(){
   prev.listen.call(this);const signal=this.events.signal;
   this.addEventListener('input',e=>{if(e.target.matches('.wb-library-search input')){this.libraryQuery=e.target.value;this.renderLibrary();}},{signal});
   const tipTarget=e=>e.target.closest('.wb-dock button,.wb-zoom button,.wb-md-tools button,.wb-alignment button');
   this.addEventListener('pointerover',e=>{
    if(e.pointerType==='touch')return;
    if(e.target.closest('.wb-overlay-tip')){clearTimeout(this.tipHideTimer);return;}
    const button=tipTarget(e);if(!button||button.contains(e.relatedTarget))return;
    this.hideTip();this.tipTimer=setTimeout(()=>this.showTip(button),400);
   },{signal});
   this.addEventListener('pointerout',e=>{
    const button=tipTarget(e),tip=e.target.closest('.wb-overlay-tip');
    if(!button&&!tip)return;
    if(button?.contains(e.relatedTarget)||this.tipEl?.contains(e.relatedTarget)||this.tipAnchor?.contains(e.relatedTarget))return;
    clearTimeout(this.tipTimer);clearTimeout(this.tipHideTimer);
    // A short crossing grace period makes the tooltip itself hoverable.
    this.tipHideTimer=setTimeout(()=>this.hideTip(),160);
   },{signal});
   this.addEventListener('focusin',e=>{const b=tipTarget(e);if(b&&b.matches(':focus-visible'))this.showTip(b);},{signal});
   this.addEventListener('focusout',()=>this.hideTip(),{signal});
   this.addEventListener('pointerdown',()=>this.hideTip(),{signal,capture:true});
   document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&this.tipEl&&!this.tipEl.hidden){this.hideTip();e.preventDefault();e.stopImmediatePropagation();}
   },{signal,capture:true});
   window.addEventListener('resize',()=>this.hideTip(),{signal});
   document.addEventListener('scroll',()=>this.hideTip(),{signal,capture:true,passive:true});
   this.addEventListener('change',e=>{if(e.target.matches('[data-edge-property]'))this.updateSelectedEdge(e.target.dataset.edgeProperty,e.target.value);},{signal});
   this.addEventListener('iq-change',e=>{if(e.target===this&&e.detail.reason==='capture-batch')this.sheetDrafts.cards=null;},{signal});
   this.addEventListener('dragstart',e=>{const el=e.target.closest('[data-library-item]');if(!el||this.locked)return;e.dataTransfer.setData('application/x-iquipage-tool',JSON.stringify({type:el.dataset.libraryItem,shape:el.dataset.shape}));e.dataTransfer.effectAllowed='copy';this.hideTip();},{signal});
   this.stage.addEventListener('dragover',e=>{if(!this.locked&&e.dataTransfer.types.includes('application/x-iquipage-tool')){e.preventDefault();e.dataTransfer.dropEffect='copy';}},{signal});
   this.stage.addEventListener('drop',e=>{const raw=e.dataTransfer.getData('application/x-iquipage-tool');if(!raw||this.locked)return;e.preventDefault();try{const item=JSON.parse(raw);if(!['sticky','text','task','shape','frame'].includes(item.type))return;const p=this.point(e);if(item.shape)this.shape=item.shape;this.add(item.type,p.x,p.y);}catch{this.announce('Не удалось добавить объект.');}},{signal});
  },
  showTip(button){
   if(!button.isConnected||button.disabled||this.gesture||this._edgeDrag||!this.tipEl)return;
   const text=button.dataset.tip||button.getAttribute('aria-label');if(!text)return;
   this.hideTip();this.tipAnchor=button;
   const ids=new Set((button.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(this.tipEl.id);
   button.setAttribute('aria-describedby',[...ids].join(' '));
   const label=document.createElement('span');label.textContent=text;this.tipEl.replaceChildren(label);
   if(button.dataset.shortcut){const key=document.createElement('kbd');key.textContent=button.dataset.shortcut;this.tipEl.append(key);}
   const root=this.shell.getBoundingClientRect(),r=button.getBoundingClientRect(),scale=root.width/this.shell.offsetWidth||1;
   const originX=root.left+this.shell.clientLeft*scale,originY=root.top+this.shell.clientTop*scale;
   const left=Math.max(8,(8-originX)/scale),right=Math.min(this.shell.clientWidth-8,(innerWidth-originX-8)/scale);
   this.tipEl.style.maxWidth=Math.max(60,right-left)+'px';this.tipEl.hidden=false;
   this.tipEl.style.left='0px';this.tipEl.style.top='0px';
   const t=this.tipEl.getBoundingClientRect(),w=t.width/scale,h=t.height/scale;
   const topLimit=Math.max(8,(8-originY)/scale),bottomLimit=Math.min(this.shell.clientHeight-8,(innerHeight-originY-8)/scale);
   const above=(r.top-originY)/scale-h-10,below=(r.bottom-originY)/scale+10;
   this.tipEl.style.left=Math.max(left,Math.min(right-w,(r.left+r.width/2-originX)/scale-w/2))+'px';
   this.tipEl.style.top=Math.max(topLimit,Math.min(bottomLimit-h,above>=topLimit?above:below))+'px';
  },
  hideTip(){
   clearTimeout(this.tipTimer);clearTimeout(this.tipHideTimer);
   if(this.tipAnchor&&this.tipEl){const ids=(this.tipAnchor.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==this.tipEl.id);if(ids.length)this.tipAnchor.setAttribute('aria-describedby',ids.join(' '));else this.tipAnchor.removeAttribute('aria-describedby');}
   this.tipAnchor=null;if(this.tipEl)this.tipEl.hidden=true;
  },
  disconnectedCallback(){this.hideTip();prev.disconnectedCallback.call(this);},
  updateViewport(emit){this.hideTip();prev.updateViewport.call(this,emit);if(this.stage)this.stage.style.setProperty('--wb-inv-zoom',String(1/this.viewport.zoom));for(const c of this.edgeHandleLayer?.children||[]){c.setAttribute('r',String(8/this.viewport.zoom));c.style.strokeWidth=String(2/this.viewport.zoom);}},
  render(){prev.render.call(this);if(!this.libraryEl)return;this.libraryEl.querySelectorAll('[data-library-item]').forEach(b=>b.disabled=this.locked);},
  renderLibrary(){
   if(!this.libraryEl)return;
   this.libraryEl.querySelectorAll('[data-library-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.libraryCategory===this.libraryCategory)));
   const query=(this.libraryQuery||'').toLocaleLowerCase('ru').trim(),match=s=>!query||s.toLocaleLowerCase('ru').includes(query);
   const card=([type,label,description,glyph,color])=>`<button type="button" class="wb-library-item" draggable="${type!=='image'}" data-library-item="${type}" aria-pressed="${this.tool===type}" ${this.locked?'disabled':''}><span class="wb-library-preview" data-tone="${color}">${icon(glyph,20)}</span><span><b>${label}</b><small>${description}</small></span></button>`;
   let html='';
   if(this.libraryCategory==='notes'){
    html=noteEntries.filter(n=>match(n.join(' '))).map(card).join('');
    if(!query||match('Несколько заметок'))html+=`<button type="button" class="wb-library-batch" data-wb-action="bulk" ${this.locked?'disabled':''}>${icon('plus',18)}<span><b>Несколько заметок</b><small>Каждая мысль — отдельная карточка</small></span></button>`;
   }else if(this.libraryCategory==='shapes'){
    for(const group of ['Основные','Данные','Действия','Переходы']){
     const options=Object.values(Shapes.SHAPE_DEFS).filter(d=>d.group===group&&match(d.label+' '+d.group));if(!options.length)continue;
     html+=`<section class="wb-library-family"><h4>${group}</h4><div class="wb-shape-grid">${options.map(d=>`<button type="button" draggable="true" class="wb-library-item wb-shape-choice" data-library-item="shape" data-shape="${d.id}" aria-pressed="${this.tool==='shape'&&this.shape===d.id}" ${this.locked?'disabled':''}>${shapePreview(d.id)}<b>${d.label}</b></button>`).join('')}</div></section>`;
    }
   }else{
    if(match('Изображение PNG JPEG WebP'))html=card(['image','Изображение','PNG, JPEG, WebP · с устройства','image','sky']);
    html+='<p class="wb-library-format-note">Изображение остаётся в документе доски. Файлы из приватных систем подключает приложение.</p>';
   }
   this.libraryEl.querySelector('.wb-library-items').innerHTML=html||'<p class="wb-library-no-results">Ничего не найдено. Попробуйте другое название.</p>';
  },
  click(e){
   if(e.target.closest('[data-library-category]')){this.libraryQuery='';const input=this.libraryEl.querySelector('input');if(input)input.value='';}
   const edge=e.target.closest('[data-edge-style]');if(edge){this.updateSelectedEdge('style',edge.dataset.edgeStyle);return;}
   prev.click.call(this,e);
  },
  setTool(t){this.hideTip();prev.setTool.call(this,t);},
  renderSelection(){
   prev.renderSelection.call(this);if(!this.context)return;const snapshot=this.data;for(const p of this.objectsEl.querySelectorAll('[data-port]')){const o=snapshot.objects.find(o=>o.id===p.dataset.portObject);if(!o)continue;const a=R.anchor(o,p.dataset.port);Object.assign(p.style,{left:(a.x-o.x-14)+'px',top:(a.y-o.y-14)+'px',right:'auto',bottom:'auto'});}for(const c of this.edgeHandleLayer?.children||[]){c.setAttribute('r',String(8/this.viewport.zoom));c.style.strokeWidth=String(2/this.viewport.zoom);}const edge=this.data.connections.find(e=>this.selection.includes(e.id));
   if(edge&&!this.editing){
    this.context.innerHTML=`<span class="wb-selection-count">Связь</span><div class="wb-edge-style-group" role="group" aria-label="Маршрут связи">${[['elbow','Угловая'],['curve','Плавная'],['straight','Прямая']].map(([id,label])=>`<button type="button" class="wb-button" data-edge-style="${id}" aria-pressed="${edge.style===id}" ${this.locked?'disabled':''}>${label}</button>`).join('')}</div><button type="button" class="wb-button" data-wb-action="edge-label" ${this.locked?'disabled':''}>${icon('text',16)}<span>${edge.label?'Изменить подпись':'Подпись'}</span></button><button type="button" class="wb-button" data-wb-action="edge-edit" ${this.locked?'disabled':''}>${icon('sliders',16)}<span>Параметры</span></button><button type="button" class="wb-button wb-icon-button" data-wb-action="delete" aria-label="Удалить связь" ${this.locked?'disabled':''}>${icon('trash',16)}</button>`;
   }
  },
  updateSelectedEdge(property,value){
   if(this.locked)return;const next=this.data,edge=next.connections.find(e=>this.selection.includes(e.id));if(!edge)return;
   if(property==='style'&&['elbow','curve','straight'].includes(value))edge.style=value;else return;
   this.commit(next,'connection-style');
  },
  action(id,el){
   if(id==='edge-label'){const edge=this.data.connections.find(e=>this.selection.includes(e.id));if(!edge||this.locked)return;
    this.openSheet('Подпись связи',`<label>Что означает переход<input name="label" value="${esc(edge.label)}" maxlength="240" placeholder="Например, данные проверены"></label>`,form=>{const next=this.data,n=next.connections.find(e=>e.id===edge.id);if(!n)throw new Error('Связь уже удалена');n.label=form.elements.label.value;return this.commit(next,'connection-label');},'Сохранить');return;}
   if(id==='bulk'){this.openBulk();return;}
   prev.action.call(this,id,el);
  },
  moveConnector(e){
   const g=this._edgeDrag;if(!g||g.pointerId!==e.pointerId)return;
   if(Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>4)g.moved=true;
   this.linkPoint=this.point(e);const scene=this.data,source=g.source||scene.connections.find(c=>c.id===g.edgeId)?.[g.end==='from'?'to':'from'];
   // Snap to a visible side with a screen-space tolerance, independent of zoom.
   let best=null;const tolerance=24/this.viewport.zoom;
   for(const n of scene.objects){if(n.id===source||['frame','drawing'].includes(n.type)||B.isLocked(scene,n)||this.locked)continue;const p=this.linkPoint;
    const contains=p.x>=n.x&&p.x<=n.x+n.width&&p.y>=n.y&&p.y<=n.y+n.height;
    for(const side of ['top','right','bottom','left']){const a=R.anchor(n,side),distance=Math.hypot(a.x-p.x,a.y-p.y);if((contains||distance<=tolerance)&&(!best||distance<best.distance))best={id:n.id,side,distance};}
   }
   g.target=best?.id;g.targetPort=best?.side||'auto';
   for(const node of this.objectsEl.children)node.classList.toggle('is-link-target',node.dataset.object===best?.id);
   if(!this.linkFrame)this.linkFrame=requestAnimationFrame(()=>{this.linkFrame=0;this.drawLinkPreview();});
  },
  openBulk(){
   if(this.locked)return;require('./components.js').registerComponents();const areaId=U.commonArea(this.data,this.selection)||this.activeArea||'';
   const areas=this.data.objects.filter(o=>o.type==='frame'&&!B.isLocked(this.data,o));
   const draft=this.sheetDrafts.cards||{values:['','',''],area:areaId,color:this.color};if(draft.area&&!areas.some(a=>a.id===draft.area))draft.area='';this.sheetDrafts.cards=draft;
   const dialog=this.openSheet('Несколько заметок',`<p>Одна карточка — одна мысль. Enter — следующая карточка, Shift+Enter — строка внутри неё.</p><iq-select name="area" label="Разместить" options="${esc(JSON.stringify([{value:'',label:'На свободном месте доски'},...areas.map(o=>({value:o.id,label:o.text||'Область'}))]))}"></iq-select><div class="wb-capture-rows"></div><button type="button" class="wb-button wb-capture-add">${icon('plus',18)}Ещё карточка</button><details class="wb-capture-import"><summary>Есть готовый список? Вставить текст</summary><label>Текст для разбивки<textarea name="importText" rows="3" placeholder="Вставьте список или несколько абзацев"></textarea></label><label>Границы карточек<select name="split"><option value="line">Каждая строка</option><option value="paragraph">Пустая строка между абзацами</option></select></label><button type="button" class="wb-button" data-capture-split>Разобрать на карточки</button></details><div class="wb-capture-summary" role="status"></div>`,form=>{
    const lines=draft.values.map(v=>v.trim()).filter(Boolean);if(!lines.length)throw new Error('Напишите хотя бы одну мысль.');
    if(draft.area&&!this.data.objects.some(o=>o.id===draft.area&&o.type==='frame'&&!B.isLocked(this.data,o)))throw new Error('Выбранная область недоступна. Выберите другое место.');
    const p=this.center(),result=U.appendNotes(this.data,lines,{areaId:draft.area,origin:{x:p.x-240,y:p.y-140},color:draft.color});
    // Match the renderer, not the estimated number of characters, before one atomic commit.
    for(const id of result.ids){const o=result.value.objects.find(n=>n.id===id);result.value=U.resizeText(result.value,id,o.text,this.measureText(o,o.text));}
    if(!this.commit(result.value,'capture-batch'))return false;
    this.select(result.ids);this.focusObjects(result.ids);this.announce(`Добавлено заметок: ${lines.length}. Действие можно отменить.`);
   },'Добавить заметки');
   dialog.classList.add('wb-capture-sheet');const rows=dialog.querySelector('.wb-capture-rows'),select=dialog.querySelector('iq-select[name=area]'),summary=dialog.querySelector('.wb-capture-summary'),submit=dialog.querySelector('[type=submit]');
   select.value=draft.area;select.addEventListener('iq-change',()=>{draft.area=select.value;sync();});
   const save=()=>{draft.values=[...rows.querySelectorAll('textarea')].map(t=>t.value);this.sheetDrafts.cards=draft;};
   const sync=()=>{const n=draft.values.filter(v=>v.trim()).length;submit.disabled=!n;submit.innerHTML=n?`Добавить ${n}${n%10===1&&n%100!==11?' заметку':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?' заметки':' заметок'} ${icon('check',16)}`:'Добавить заметки '+icon('check',16);summary.textContent=n?`${n} ${n%10===1&&n%100!==11?'карточка':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'карточки':'карточек'}. ${draft.area?'В выбранную область.':'На свободное место доски.'} Пустые карточки не добавляются.`:'Заполните одну или несколько карточек.';dialog.querySelector('.wb-capture-add').disabled=draft.values.length>=100;};
   // Preserve paragraphs in capture as well as in the eventual canvas note.
   const grow=field=>{field.style.height='auto';const h=Math.max(52,field.scrollHeight);field.style.height=Math.min(224,h)+'px';field.style.overflowY=h>224?'auto':'hidden';};
   const render=()=>{
    rows.innerHTML=draft.values.map((v,i)=>`<div class="wb-capture-row"><label><span>Мысль ${String(i+1).padStart(2,'0')}</span><textarea rows="2" maxlength="10000" placeholder="Запишите мысль…" aria-label="Мысль ${i+1}">${esc(v)}</textarea></label><div class="wb-capture-row-actions"><button type="button" class="wb-button wb-icon-button" data-capture-up="${i}" aria-label="Переместить мысль ${i+1} выше" ${i===0?'disabled':''}>${icon('arrowUp',14)}</button><button type="button" class="wb-button wb-icon-button" data-capture-remove="${i}" aria-label="Удалить мысль ${i+1}">${icon('x',16)}</button></div></div>`).join('');rows.querySelectorAll('textarea').forEach(grow);sync();
   };
   rows.oninput=e=>{if(e.target instanceof HTMLTextAreaElement)grow(e.target);save();sync();};rows.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.isComposing){e.preventDefault();const index=[...rows.querySelectorAll('textarea')].indexOf(e.target);if(index<0)return;save();if(index===draft.values.length-1&&draft.values.length<100){draft.values.push('');render();}rows.querySelectorAll('textarea')[Math.min(index+1,draft.values.length-1)]?.focus();}};
   rows.onclick=e=>{const rm=e.target.closest('[data-capture-remove]'),up=e.target.closest('[data-capture-up]');if(!rm&&!up)return;save();const i=Number(rm?.dataset.captureRemove??up.dataset.captureUp);if(rm){draft.values.splice(i,1);if(!draft.values.length)draft.values.push('');}else if(i>0)[draft.values[i-1],draft.values[i]]=[draft.values[i],draft.values[i-1]];render();rows.querySelectorAll('textarea')[Math.max(0,i-(up?1:0))]?.focus();};
   dialog.querySelector('.wb-capture-add').onclick=()=>{save();if(draft.values.length>=100)return;draft.values.push('');render();rows.querySelectorAll('textarea')[draft.values.length-1]?.focus();};
   dialog.querySelector('[data-capture-split]').onclick=()=>{
    save();const text=dialog.querySelector('[name=importText]').value,mode=dialog.querySelector('[name=split]').value;const parts=text.split(mode==='paragraph'?/\n\s*\n/:/\r?\n/).map(t=>t.trim()).filter(Boolean);const values=[...draft.values.filter(v=>v.trim()),...parts];
    if(values.length>100||values.some(v=>v.length>10000)){summary.textContent='До 100 карточек, каждая до 10 000 знаков. Сократите список.';return;}
    draft.values=values.length?values:[''];dialog.querySelector('details').open=false;render();
   };
   render();
  }
 });
}
exports.installWorkshop=installWorkshop;

})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
