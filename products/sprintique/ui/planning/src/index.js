import {quickFieldDialog} from './quick-field.js';
import {orderDialog} from './order-dialog.js';
import {TableWindow} from '@iquipage/web/work-list';
import {lastChildren,plural} from './markup.js';
import {loadingMarkup} from '../../src/loading.js';
import {mountPlanningDrag} from './row-interactions.js';
import {filterDialog} from './filter-dialog.js';
import {mountTemporalView} from './temporal-view.js';
import {groupHeader} from './group-header.js';
import {closeReleaseDialog,editReleaseDialog,historyDialog,bulkDialog} from './release-dialogs.js';
import {registerCore,ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {PlanningController} from './controller.js';
import {groupBody,rowMarkup} from './markup.js';
import {moveDialog,operationDialog} from './dialog.js';
/** Reusable planning view. Production host supplies an approved SDK projection adapter. */
function scrollParent(node){
  for(let el=node.parentElement;el;el=el.parentElement){const y=getComputedStyle(el).overflowY;if(y==='auto'||y==='scroll')return el;}
  return document.scrollingElement;
}
export async function mountPlanning(root,{adapter,project,onOpenTask,onCreateTask,onCreateRelease,onOpenBoard,viewState={}}) {
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер Планирования.');registerCore();
  root.classList.add('planning-root');
  let deadlineMode=['timeline','dates'].includes(viewState.deadlineMode)?viewState.deadlineMode:(['timeline','dates'].includes(viewState.mode)?viewState.mode:'timeline');
  let viewMode='list',temporal=null,switching=false,dragging=false,refreshAfterDrag=false;
  let disposed=false,modal=null,opening=false,selectionShift=false,scroll,scrollRoot;
  let refreshTimer=null,refreshing=false,refreshAgain=false;
  const nodes=new Map(),abort=new AbortController(),signal=abort.signal;
  const controller=new PlanningController({adapter,projectId:project.id,onChange:render});
  if(viewState.filters)Object.assign(controller.filters,viewState.filters,{query:''});
  if(Array.isArray(viewState.collapsed))controller.collapsed=new Set(viewState.collapsed);
  root.innerHTML=`<section class="planning-view"><header class="sq-page-heading pn-head"><h1>Планирование</h1><div class="sq-page-tools">${ui.btn('Новый релиз','secondary','plus','data-new-release')}${ui.btn('Новая задача','primary','plus','data-new-task')}</div></header>
    <div class="pn-views-row"><div class="iq-segmented pn-view-switch" role="group" aria-label="Вид планирования"><button type="button" data-view="list" aria-pressed="true">${icon('list',16)}<span>Список</span></button><button type="button" data-view="timeline" aria-pressed="false">${icon('chart',16)}<span>Гант</span></button><button type="button" data-view="dates" aria-pressed="false">${icon('calendar',16)}<span>Календарь</span></button></div>
    <div class="iq-segmented pn-archive-switch" role="group" aria-label="Какие релизы показать" data-archive-switch><button type="button" data-history="current" aria-pressed="true">Текущие</button><button type="button" data-history="closed" aria-pressed="false">${icon('folder',16)}<span>Архив</span></button></div></div><div class="pn-toolbar">
    <div class="iq-segmented pn-readiness" role="group" aria-label="Готовность задач" data-readiness>${[['all','Все'],['draft','Черновики'],['ready','Готовы к работе']].map(([v,l])=>`<button type="button" data-preparation-value="${v}" aria-pressed="${controller.filters.preparation===v}">${l}</button>`).join('')}</div>
    <div class="pn-toolbar-end"><span data-sort-menu></span>${ui.btn('Фильтры','ghost sm','filter','data-filter-conditions')}${ui.btn('Сбросить фильтры','ghost sm','x','data-clear-conditions hidden')}</div></div>
    <div class="pn-selection" data-bulk hidden><span data-selection-summary></span>${ui.btn('Выбрать все по условиям','ghost sm','','data-all-matching')}<div class="row">${ui.btn('В релиз…','secondary sm','box','data-move')}${ui.btn('Подготовить','secondary sm','check','data-prepare')}${ui.btn('Порядок…','ghost sm','list','data-order hidden')}${ui.menu(ui.btn('Ещё','ghost sm','down'),[{label:'Назначить исполнителя',action:'bulk-owner'},{label:'Изменить приоритет',action:'bulk-priority'},{label:'Изменить срок',action:'bulk-due'},{label:'Добавить тег',action:'bulk-tags'},{label:'Выбрать с подзадачами',action:'select-descendants'},{label:'Взять без релиза',action:'take'},{label:'Вернуть на уточнение',action:'unprepare'}])}${ui.btn('Снять выделение','ghost sm','','data-clear')}</div></div>
    <div data-error role="alert" hidden></div><p class="sr-only" role="status" data-live></p>
    <div class="pn-scroll" tabindex="-1" aria-label="Релизы и бэклог"><div data-groups></div><div data-tail></div></div><div class="pn-temporal" data-temporal hidden></div></section>`;
  const page=root.firstElementChild,groupsRoot=root.querySelector('[data-groups]'),tail=root.querySelector('[data-tail]');
  scroll=root.querySelector('.pn-scroll');
  // Phones scroll the page, not a nested list box; windowing and lazy loading follow whichever element scrolls.
  const pageScroll=typeof matchMedia==='function'&&matchMedia('(max-width:640px)').matches;
  root.querySelector('.planning-view').toggleAttribute('data-page-scroll',pageScroll);
  scrollRoot=pageScroll?scrollParent(root)||scroll:scroll;
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&!controller.loading&&!controller.error){const id=entry.target.dataset.group;void controller.rows(id);}},{root:scrollRoot===document.scrollingElement?null:scrollRoot,rootMargin:'240px'}):null;
  const focusKey=()=>document.activeElement?.closest('[data-focus]')?.dataset.focus;
  const restoreFocus=key=>{if(key&&!root.contains(document.activeElement))root.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.focus({preventScroll:true});};
  const SORTS={planned:'Вручную',priority:'По приоритету',date:'По сроку'};
  /** Sorting is a ghost button with the current order, the same as on the board. */
  function renderSort(locked){
    const slot=root.querySelector('[data-sort-menu]'),current=controller.filters.sort in SORTS?controller.filters.sort:'planned',key=current+locked;
    if(slot.dataset.key===key)return;slot.dataset.key=key;
    slot.innerHTML=ui.menu(`<button type="button" class="iq-btn ghost sm" aria-label="Сортировка: ${SORTS[current]}" ${locked?'disabled':''}>${icon('sort',17)}<span>${SORTS[current]}</span></button>`,Object.entries(SORTS).map(([id,label])=>({label,...(id===current?{glyph:'check'}:{}),action:'planning-sort:'+id})));
  }
  function render() {
    if(disposed)return;const oldFocus=focusKey(),top=scrollRoot?.scrollTop||0;
    const error=root.querySelector('[data-error]');error.hidden=!controller.error;
    error.innerHTML=controller.error?ui.alert('Не удалось обновить Планирование',esc(controller.error),'danger')+ui.btn('Повторить загрузку','secondary sm','refresh','data-refresh'):'';
    const locked=controller.loading||!!controller.error||opening||!!modal;
    root.querySelector('[data-new-release]').disabled=locked||!controller.capabilities.createRelease;
    root.querySelector('[data-new-task]').disabled=locked||!controller.capabilities.createTask;
    const conditions=Number(!!controller.filters.owner)+Number(!!controller.filters.releaseId)+(controller.filters.tagIds?.length||0);
    root.querySelector('[data-filter-conditions]').disabled=locked||!adapter.options;
    const filterButton=root.querySelector('[data-filter-conditions]');filterButton.setAttribute('aria-label','Фильтры'+(conditions?`, выбрано условий: ${conditions}`:''));
    filterButton.querySelector('.pn-filter-count')?.remove();if(conditions)filterButton.insertAdjacentHTML('beforeend',`<span class="pn-filter-count" aria-hidden="true">${conditions}</span>`);
    root.querySelector('[data-filter-conditions]').setAttribute('aria-pressed',String(conditions>0));
    root.querySelector('[data-clear-conditions]').hidden=!conditions;
    const ids=new Set(controller.groups.map(g=>g.id));for(const [id,n] of nodes)if(!ids.has(id)){observer?.unobserve(n.element);n.window?.destroy();n.element.remove();nodes.delete(id);}
    let previous=null;
    for(const group of controller.groups){
      let node=nodes.get(group.id);
      if(!node){const element=document.createElement('section');element.className='pn-group iq-reveal';element.dataset.group=group.id;element.dataset.workGroup=group.id;element.setAttribute('aria-label',group.title);
        element.innerHTML='<header class="pn-group-header" data-work-dropzone></header><div class="pn-group-body"></div>';node={element,head:element.firstElementChild,body:element.lastElementChild,headerKey:'',bodyKey:''};nodes.set(group.id,node);observer?.observe(element);}
      const before=previous?previous.nextElementSibling:groupsRoot.firstElementChild;
      if(before!==node.element)groupsRoot.insertBefore(node.element,before);previous=node.element;
      const canSelect=!!controller.capabilities.selection&&group.rows.some(r=>r.selectable&&!r.contextOnly)&&!group.folded;
      const hk=JSON.stringify([group.title,group.total,group.matched,group.done,group.folded,group.state,group.plannedStart,group.plannedEnd,group.format,controller.capabilities,locked,canSelect]);
      if(hk!==node.headerKey){node.headerKey=hk;node.head.innerHTML=groupHeader(group,{capabilities:controller.capabilities,locked,onOpenBoard,canSelect});}

      const bk=JSON.stringify([!!group.rows.length,group.busy,group.error,group.loaded,group.nextCursor,controller.filters,controller.capabilities.createTask]);
      node.group=group;node.locked=locked;
      if(bk!==node.bodyKey){
        node.window?.destroy();node.window=null;node.rowRef=null;node.bodyKey=bk;node.body.innerHTML=groupBody(group,controller,true);
        const body=node.body.querySelector('[data-window-body]');
        if(body)node.window=new TableWindow({body,scrollRoot,columns:4,estimate:56,key:row=>row.id,
          markup:row=>rowMarkup(row,group.id,controller.collapsed.has(row.taskId),!!(controller.capabilities.move||controller.capabilities.reorder),!!controller.capabilities.bulk,lastChildren(group.rows)),
          decorate:(element,row)=>{
            for(const control of element.querySelectorAll('[data-select],[data-disclose],[data-work-drag]'))control.disabled=node.locked||node.group.busy||control.matches('[data-select]')&&!!controller.selection.snapshot;
            for(const control of element.querySelectorAll('[data-quick-edit]'))control.disabled=node.locked||node.group.busy||!controller.capabilities.bulk||row.contextOnly||!row.selectable||(control.dataset.quickEdit==='owner'?row.ownerId===undefined||!adapter.options:row.dueValue===undefined);
            const check=element.querySelector('[data-select]');if(check)check.checked=controller.selection.ids.has(row.taskId);
            element.dataset.selected=String(!!check?.checked);
          }});
      }
      node.body.hidden=group.folded;node.element.dataset.pending=String(group.busy);node.body.setAttribute('aria-busy',String(group.busy));
      const windowed=group.rows.length>100||controller.groups.reduce((sum,g)=>sum+g.rows.length,0)>200;
      if(node.window&&(node.rowRef!==group.rows||node.windowed!==windowed||node.collapsedRef!==String([...controller.collapsed]))){node.rowRef=group.rows;node.windowed=windowed;node.collapsedRef=String([...controller.collapsed]);node.window.setRows(group.rows,windowed);}
      node.window?.refresh();
    }
    const summary=controller.selection.summary(controller.visibleRows());
    const bulk=root.querySelector('[data-bulk]');bulk.hidden=summary.total===0||viewMode!=='list';
    root.querySelector('[data-selection-summary]').textContent=`Выбрано ${summary.total} ${plural(summary.total,'задача','задачи','задач')}${summary.snapshot?', включая все задачи по условиям':summary.hidden?`, из них скрыто фильтром: ${summary.hidden}`:''}`;
    const visible=controller.visibleRows(),selected=visible.filter(r=>controller.selection.ids.has(r.taskId));
    // Each group's header checkbox selects its shown tasks (checked / mixed / empty).
    for(const box of root.querySelectorAll('[data-select-group]')){const rows=visible.filter(r=>controller.groups.find(g=>g.id===box.dataset.selectGroup)?.rows.includes(r)),picked=rows.filter(r=>controller.selection.ids.has(r.taskId)).length;box.checked=rows.length>0&&picked===rows.length;box.indeterminate=picked>0&&picked<rows.length;box.disabled=locked||!!summary.snapshot;}
    for(const checkbox of root.querySelectorAll('[data-select]')){checkbox.checked=controller.selection.ids.has(checkbox.dataset.select);checkbox.closest('tr').dataset.selected=String(checkbox.checked);}
    root.querySelector('[data-move]').disabled=locked||!controller.capabilities.move;
    root.querySelector('[data-prepare]').disabled=locked||!controller.capabilities.prepare;
    root.querySelector('[data-order]').hidden=summary.total!==1||!!summary.snapshot||controller.filters.sort!=='planned'||!controller.capabilities.reorder;
    root.querySelector('[data-order]').disabled=locked;
    // After a manual pick, the bar offers the whole result set, including groups and pages not loaded yet.
    root.querySelector('[data-all-matching]').hidden=!controller.capabilities.selection||controller.filters.history==='closed'||!!summary.snapshot;
    root.querySelector('[data-all-matching]').disabled=locked;
    for(const b of root.querySelectorAll('[data-history]'))b.setAttribute('aria-pressed',String(b.dataset.history===(controller.filters.history==='closed'?'closed':'current')));
    root.querySelector('[data-archive-switch]').hidden=viewMode!=='list';
    for(const b of root.querySelectorAll('[data-preparation-value]')){b.setAttribute('aria-pressed',String(b.dataset.preparationValue===controller.filters.preparation));b.disabled=locked;}
    renderSort(locked);
    root.querySelector('[data-live]').textContent=controller.message;
    tail.innerHTML=controller.loading?loadingMarkup('Загружаем релизы…',{rows:3}):controller.nextCursor?ui.btn('Показать ещё релизы','secondary sm','down','data-more-groups'):!controller.groups.length&&!controller.error?ui.empty('Начните с ближайшего результата','Создайте задачу или релиз. Обязательных дат и оценок нет.',''):'';
    if(scrollRoot)scrollRoot.scrollTop=top;restoreFocus(oldFocus);
    if(viewMode==='list'&&!controller.loading&&!controller.error)queueMicrotask(()=>{if(disposed)return;const bounds=scrollRoot.getBoundingClientRect();let budget=3;for(const group of controller.groups){const el=nodes.get(group.id)?.element;if(!el||group.folded||group.loaded||group.busy||group.error)continue;const rect=el.getBoundingClientRect();if(rect.bottom>=bounds.top-100&&rect.top<bounds.bottom+100&&budget-->0)void controller.rows(group.id);}});
    viewState.filters={...controller.filters};viewState.collapsed=[...controller.collapsed];
  }
  async function setView(next,force=false) {
    if(disposed||dragging||switching||opening||modal||!['list','timeline','dates'].includes(next)||next===viewMode&&!force)return;
    if(temporal&&!temporal.readyToLeave()){controller.message='Примените или отмените изменение плана перед переходом.';render();return;}
    if(next!=='list'&&(!controller.capabilities.timeline||!adapter.timeline)){controller.message='Планирование по времени не подключено приложением.';render();return;}
    switching=true;
    try {
      temporal?.destroy();temporal=null;viewMode=next;viewState.mode=next;
      if(next!=='list'){deadlineMode=next;viewState.deadlineMode=next;}
      const target=root.querySelector('[data-temporal]');scroll.hidden=next!=='list';target.hidden=next==='list';
      for(const b of root.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===next));
      if(next!=='list')temporal=await mountTemporalView(target,{adapter,projectId:project.id,mode:next,filters:{...controller.filters,history:'current'},capabilities:controller.capabilities,onOpenTask,onChanged:changed,viewState:viewState.temporal||(viewState.temporal={})});
    }catch(error){controller.message=error.message;}finally{switching=false;render();}
  }
  async function changeFilters(values) {
    if(temporal&&!temporal.readyToLeave()){controller.message='Сначала примените или отмените изменение плана.';render();return;}
    await controller.filter(values);if(viewMode!=='list')await setView(viewMode,true);
  }
  // Success is a DS toast (itself a status region); the sr-only live line stays for load and error states.
  async function changed(result){notify({tone:'success',message:result?.message||'Изменение сохранено.'});controller.clear();await controller.load();}
  // Data stays current without a refresh button: events arriving during a dialog are applied when it closes.
  let refreshAfterModal=false;
  function released(){modal=null;opening=false;render();if(refreshAfterModal){refreshAfterModal=false;void refreshFromEvent();}}
  async function action(fn){if(dragging||opening||modal||controller.loading||controller.error)return;opening=true;render();try{modal=await fn();if(disposed)modal?.close?.();}catch(error){controller.message=error.message;released();}finally{opening=false;render();}}
  function operation(intent,title){return operationDialog({adapter,projectId:project.id,intent,title,onCommitted:changed,onClose:released});}
  
  root.addEventListener('click',event=>{
    const b=event.target.closest('button,input');if(!b||b.disabled||dragging)return;
    const group=b.closest('[data-group]')?.dataset.group;
    if(b.matches('[data-view]'))return void setView(b.dataset.view);
    if(b.matches('[data-filter-conditions]'))return void action(()=>filterDialog({adapter,projectId:project.id,filters:controller.filters,onApply:async values=>{await changeFilters(values);},onClose:()=>{released();if(viewMode!=='list')void setView(viewMode,true);}}));
    if(b.matches('[data-clear-conditions]'))return void changeFilters({owner:'',releaseId:'',tagIds:[],tagMode:'any'});
    if(b.matches('[data-select]')){controller.toggle(b.dataset.select,event.shiftKey||selectionShift);selectionShift=false;return;}
    if(b.matches('[data-select-group]'))return controller.all(b.dataset.selectGroup);
    if(b.matches('[data-clear]'))return controller.clear();
    if(b.matches('[data-fold]'))return controller.fold(group);
    if(b.matches('[data-disclose]'))return void controller.disclose(group,b.dataset.disclose);
    if(b.matches('[data-load],[data-retry-rows]'))return void controller.rows(group,{force:true});
    if(b.matches('[data-more-rows]'))return void controller.rows(group,{append:true});
    if(b.matches('[data-more-groups]'))return void controller.load({append:true});
    if(b.matches('[data-history]'))return void controller.filter({history:b.dataset.history});
    if(b.matches('[data-preparation-value]'))return void changeFilters({preparation:b.dataset.preparationValue});
    if(b.matches('[data-all-matching]'))return void controller.selectSnapshot();
    if(b.matches('[data-close-release]'))return void action(()=>closeReleaseDialog({adapter,projectId:project.id,groupId:group,onCommitted:changed,onClose:released}));
    if(b.matches('[data-quick-edit]')&&controller.capabilities.bulk){const row=controller.groups.flatMap(g=>g.rows).find(r=>r.taskId===b.dataset.fieldTask);if(row)return void action(()=>quickFieldDialog({adapter,projectId:project.id,row,field:b.dataset.quickEdit,revision:controller.revision,onChanged:changed,onClose:released}));}
    if(b.matches('[data-open]'))return void action(()=>onOpenTask(b.dataset.open,{onChanged:changed,onClose:released}));
    if(b.matches('[data-new-task],[data-add]'))return void action(()=>onCreateTask({groupId:group||'backlog',onChanged:changed,onClose:released}));
    if(b.matches('[data-new-release]'))return void action(()=>onCreateRelease({onChanged:changed,onClose:released}));
    if(b.matches('[data-board]'))return void onOpenBoard?.(group);
    if(b.matches('[data-start]'))return void action(()=>operation({kind:'start',groupId:group},'Начать релиз'));
    if(b.matches('[data-prepare]'))return void action(()=>operation({kind:'prepare',...controller.selectedIntent()},'Подготовить задачи'));
    if(b.matches('[data-order]'))return void action(()=>orderDialog({adapter,projectId:project.id,taskId:[...controller.selection.ids][0],onCommitted:changed,onClose:released}));
    if(b.matches('[data-move]'))return void action(()=>moveDialog({adapter,projectId:project.id,selection:controller.selectedIntent(),count:controller.selection.summary(controller.visibleRows()).total,taskIds:[...controller.selection.ids],onCommitted:changed,onClose:released}));
  },{signal});
  root.addEventListener('iq-action',event=>{
    if(opening||modal||controller.loading||controller.error)return;
    const name=event.detail.action,groupId=event.target.closest('[data-group]')?.dataset.group;
    const base={adapter,projectId:project.id,groupId,onCommitted:changed,onClose:released};
    if(name==='release-edit'&&controller.capabilities.editRelease)void action(()=>editReleaseDialog(base));
    if(name==='release-close'&&controller.capabilities.close)void action(()=>closeReleaseDialog(base));
    if(name==='release-cancel'&&controller.capabilities.cancel)void action(()=>closeReleaseDialog({...base,cancel:true}));
    if(name==='release-history')void action(()=>historyDialog(base));
    if(name.startsWith('planning-sort:')){void changeFilters({sort:name.slice(14)});return;}
    if(name.startsWith('bulk-')&&controller.capabilities.bulk)void action(()=>bulkDialog({...base,selection:controller.selectedIntent(),field:name.slice(5)}));
    if(name==='select-descendants'&&controller.capabilities.selection&&!controller.selection.snapshot)void controller.selectSnapshot([...controller.selection.ids]);
    if(['take','unprepare'].includes(name)&&controller.capabilities.prepare)void action(()=>operation({kind:name,...controller.selectedIntent()},name==='take'?'Взять без релиза':'Вернуть на уточнение'));
  },{signal});
  root.addEventListener('keydown',e=>{selectionShift=e.shiftKey;},{signal});root.addEventListener('keyup',()=>{selectionShift=false;},{signal});
  async function refreshFromEvent(){
    refreshTimer=null;if(disposed)return;
    if(dragging){refreshAfterDrag=true;return;}
    if(modal||opening){refreshAfterModal=true;return;}
    if(refreshing){refreshAgain=true;return;}refreshing=true;
    try{do{refreshAgain=false;await Promise.all([controller.load(),temporal?.reload()]);}while(refreshAgain&&!disposed&&!modal&&!opening&&!dragging);}
    finally{refreshing=false;}
  }
  const unsubscribe=adapter.subscribe?.(()=>{if(refreshTimer===null)refreshTimer=setTimeout(()=>void refreshFromEvent(),0);});
  // A tab coming back to the foreground re-reads the plan in case the live stream was interrupted.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&refreshTimer===null)refreshTimer=setTimeout(()=>void refreshFromEvent(),0);},{signal});
  const stopDrag=mountPlanningDrag(root,scrollRoot,controller,{
    locked:()=>disposed||viewMode!=='list'||opening||!!modal||controller.loading||!!controller.error,
    onState:active=>{dragging=active;if(!active&&refreshAfterDrag){refreshAfterDrag=false;void refreshFromEvent();}},
    onDrop:intent=>void action(()=>operation(intent,intent.kind==='reorder'?'Порядок задач':'Изменение состава'))
  });
  await controller.load();
  if(viewState.mode&&viewState.mode!=='list')await setView(viewState.mode);
  if(viewState.scrollTop)scroll.scrollTop=viewState.scrollTop;
  return {reload:()=>controller.load(),controller,readyToLeave:()=>!dragging&&!opening&&!modal&&!switching&&(!temporal||temporal.readyToLeave()),
    destroy({force=false}={}){if(disposed)return;if(temporal&&!temporal.destroy({force}))return false;if(force)modal?.element?.close(true);viewState.scrollTop=scroll.scrollTop;disposed=true;clearTimeout(refreshTimer);observer?.disconnect();unsubscribe?.();stopDrag();for(const node of nodes.values())node.window?.destroy();abort.abort();controller.destroy();if(root.firstElementChild===page){root.classList.remove('planning-root');page.remove();}}};
}
