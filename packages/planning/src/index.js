import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {PlanningController} from './controller.js';
import {groupBody} from './markup.js';
import {moveDialog,operationDialog} from './dialog.js';
/** Reusable planning view. Production host supplies an approved SDK projection adapter. */
export async function mountPlanning(root,{adapter,project,onOpenTask,onCreateTask,onCreateRelease,onOpenBoard,viewState={}}) {
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер Планирования.');registerCore();
  root.classList.add('planning-root');
  let disposed=false,modal=null,opening=false,searchTimer=null,selectionShift=false,queryInput,scroll;
  const nodes=new Map(),abort=new AbortController(),signal=abort.signal;
  const controller=new PlanningController({adapter,projectId:project.id,onChange:render});
  if(viewState.filters)Object.assign(controller.filters,viewState.filters);
  if(Array.isArray(viewState.collapsed))controller.collapsed=new Set(viewState.collapsed);
  root.innerHTML=`<section class="planning-view"><iq-work-header title="Планирование" density="compact"><div slot="actions" class="row">${ui.btn('Новый релиз','secondary sm','plus','data-new-release')}${ui.btn('Новая задача','primary sm','plus','data-new-task')}</div></iq-work-header>
    <div class="pn-toolbar"><div class="iq-search-small">${icon('search',16)}<input type="search" aria-label="Найти задачу или релиз" placeholder="Найти задачу или релиз" maxlength="240" data-query value="${esc(controller.filters.query)}"></div>${ui.select('Подготовленность',[{value:'all',label:'Все задачи'},{value:'draft',label:'Черновики'},{value:'ready',label:'Готовы к работе'}],`data-preparation class="compact-select" value="${esc(controller.filters.preparation)}"`)}${ui.select('Сортировка',[{value:'planned',label:'Порядок планирования'},{value:'priority',label:'По приоритету'},{value:'date',label:'По сроку'}],`data-sort class="compact-select" value="${esc(controller.filters.sort)}"`)}${ui.ib('refresh','Обновить список','ghost sm','data-refresh')}</div>
    <div class="pn-selection" data-bulk hidden>${ui.check('Все показанные',false,'data-select-all')}<span data-selection-summary></span><div class="row">${ui.btn('В релиз…','secondary sm','box','data-move')}${ui.btn('Подготовить','secondary sm','check','data-prepare')}${ui.btn('Снять выделение','ghost sm','','data-clear')}</div></div>
    <div data-error role="alert" hidden></div><p class="sr-only" role="status" data-live></p>
    <div class="pn-scroll" tabindex="-1" aria-label="Релизы и бэклог"><div data-groups></div><div data-tail></div></div></section>`;
  const page=root.firstElementChild,groupsRoot=root.querySelector('[data-groups]'),tail=root.querySelector('[data-tail]');
  queryInput=root.querySelector('[data-query]');scroll=root.querySelector('.pn-scroll');
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&!controller.loading&&!controller.error){const id=entry.target.dataset.group;void controller.rows(id);}},{root:scroll,rootMargin:'240px'}):null;
  const focusKey=()=>document.activeElement?.closest('[data-focus]')?.dataset.focus;
  const restoreFocus=key=>{if(key&&!root.contains(document.activeElement))root.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.focus({preventScroll:true});};
  function render() {
    if(disposed)return;const oldFocus=focusKey(),top=scroll?.scrollTop||0;
    const error=root.querySelector('[data-error]');error.hidden=!controller.error;
    error.innerHTML=controller.error?ui.alert('Не удалось обновить Планирование',esc(controller.error),'danger')+ui.btn('Повторить загрузку','secondary sm','refresh','data-refresh'):'';
    const locked=controller.loading||!!controller.error||opening||!!modal;
    root.querySelector('[data-new-release]').disabled=locked||!controller.capabilities.createRelease;
    root.querySelector('[data-new-task]').disabled=locked||!controller.capabilities.createTask;
    root.querySelector('[data-refresh]').disabled=controller.loading;
    const ids=new Set(controller.groups.map(g=>g.id));for(const [id,n] of nodes)if(!ids.has(id)){observer?.unobserve(n.element);n.element.remove();nodes.delete(id);}
    let previous=null;
    for(const group of controller.groups){
      let node=nodes.get(group.id);
      if(!node){const element=document.createElement('section');element.className='pn-group';element.dataset.group=group.id;element.setAttribute('aria-label',group.title);
        element.innerHTML='<header class="pn-group-header"></header><div class="pn-group-body"></div>';node={element,head:element.firstElementChild,body:element.lastElementChild,headerKey:'',bodyKey:''};nodes.set(group.id,node);observer?.observe(element);}
      const before=previous?previous.nextElementSibling:groupsRoot.firstElementChild;
      if(before!==node.element)groupsRoot.insertBefore(node.element,before);previous=node.element;
      const hk=JSON.stringify([group.title,group.total,group.matched,group.folded,group.state,group.dateLabel,group.formatLabel,controller.capabilities,locked]);
      if(hk!==node.headerKey){node.headerKey=hk;node.head.innerHTML=`${ui.ib(group.folded?'chevron':'down',`${group.folded?'Раскрыть':'Свернуть'} ${group.title}`,'ghost sm',`data-fold data-focus="group:${esc(group.id)}" aria-expanded="${!group.folded}"`)}<h2>${esc(group.title)}</h2>${group.state!=='backlog'?ui.badge(group.state==='active'?'В работе':group.state==='closed'?'Завершён':'Запланирован',group.state==='active'?'info':'outline'):''}<span class="pn-count" aria-label="${group.matched} из ${group.total} задач">${group.matched===group.total?group.total:`${group.matched} / ${group.total}`}</span><span class="pn-group-date">${esc(group.dateLabel||'')}${group.formatLabel?' · '+esc(group.formatLabel):''}</span><div class="row pn-group-actions">${group.state==='active'&&onOpenBoard?ui.btn('На доску','ghost sm','upRight','data-board'):''}${group.state==='planned'&&controller.capabilities.start?ui.btn('Начать','secondary sm','play',`data-start ${locked?'disabled':''}`):''}${controller.capabilities.createTask&&!['active','closed'].includes(group.state)?ui.ib('plus','Добавить задачу в '+group.title,'ghost sm',`data-add ${locked?'disabled':''}`):''}</div>`;}
      const bk=JSON.stringify([group.rows,group.busy,group.error,group.loaded,group.nextCursor,controller.filters, [...controller.collapsed],controller.capabilities.createTask]);
      if(bk!==node.bodyKey){node.bodyKey=bk;node.body.innerHTML=groupBody(group,controller);}
      node.body.hidden=group.folded;node.element.dataset.pending=String(group.busy);node.body.setAttribute('aria-busy',String(group.busy));
      node.body.querySelectorAll('[data-select],[data-disclose]').forEach(el=>el.disabled=locked||group.busy);
    }
    const summary=controller.selection.summary(controller.visibleRows());
    const bulk=root.querySelector('[data-bulk]');bulk.hidden=summary.total===0;
    root.querySelector('[data-selection-summary]').textContent=`Выбрано: ${summary.total}${summary.hidden?` · скрыто: ${summary.hidden}`:''}`;
    const visible=controller.visibleRows(),selected=visible.filter(r=>controller.selection.ids.has(r.taskId));
    const all=root.querySelector('[data-select-all]');all.checked=visible.length>0&&selected.length===visible.length;all.indeterminate=selected.length>0&&selected.length<visible.length;all.disabled=locked;
    for(const checkbox of root.querySelectorAll('[data-select]')){checkbox.checked=controller.selection.ids.has(checkbox.dataset.select);checkbox.closest('tr').dataset.selected=String(checkbox.checked);}
    root.querySelector('[data-move]').disabled=locked||!controller.capabilities.move;
    root.querySelector('[data-prepare]').disabled=locked||!controller.capabilities.prepare;
    root.querySelector('[data-live]').textContent=controller.message;
    tail.innerHTML=controller.loading?'<p role="status" class="iq-helper">Загружаем релизы…</p>':controller.nextCursor?ui.btn('Показать ещё релизы','secondary sm','down','data-more-groups'):!controller.groups.length&&!controller.error?ui.empty('Начните с ближайшего результата','Создайте задачу или релиз. Обязательных дат и оценок нет.',''):'';
    if(scroll)scroll.scrollTop=top;restoreFocus(oldFocus);
    if(!controller.loading&&!controller.error)queueMicrotask(()=>{if(disposed)return;const bounds=scroll.getBoundingClientRect();let budget=3;for(const group of controller.groups){const el=nodes.get(group.id)?.element;if(!el||group.folded||group.loaded||group.busy||group.error)continue;const rect=el.getBoundingClientRect();if(rect.bottom>=bounds.top-100&&rect.top<bounds.bottom+100&&budget-->0)void controller.rows(group.id);}});
    viewState.filters={...controller.filters};viewState.collapsed=[...controller.collapsed];
  }
  async function changed(result){controller.message=result?.message||'Изменение сохранено.';controller.clear();await controller.load();}
  function released(){modal=null;opening=false;render();}
  async function action(fn){if(opening||modal||controller.loading||controller.error)return;opening=true;render();try{modal=await fn();if(disposed)modal?.close?.();}catch(error){controller.message=error.message;released();}finally{opening=false;render();}}
  function operation(intent,title){return operationDialog({adapter,projectId:project.id,intent,title,onCommitted:changed,onClose:released});}
  root.addEventListener('input',event=>{if(event.target===queryInput){clearTimeout(searchTimer);if(event.isComposing)return;searchTimer=setTimeout(()=>controller.filter({query:queryInput.value.trim()}),180);}},{signal});
  queryInput.addEventListener('compositionend',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>controller.filter({query:queryInput.value.trim()}),180);},{signal});
  root.addEventListener('iq-change',event=>{if(event.target.matches('[data-preparation]'))void controller.filter({preparation:event.detail.value});if(event.target.matches('[data-sort]'))void controller.filter({sort:event.detail.value});},{signal});
  root.addEventListener('click',event=>{
    const b=event.target.closest('button,input');if(!b||b.disabled)return;
    const group=b.closest('[data-group]')?.dataset.group;
    if(b.matches('[data-select]')){controller.toggle(b.dataset.select,event.shiftKey||selectionShift);selectionShift=false;return;}
    if(b.matches('[data-select-all]'))return controller.all();
    if(b.matches('[data-clear]'))return controller.clear();
    if(b.matches('[data-fold]'))return controller.fold(group);
    if(b.matches('[data-disclose]'))return void controller.disclose(group,b.dataset.disclose);
    if(b.matches('[data-load],[data-retry-rows]'))return void controller.rows(group,{force:true});
    if(b.matches('[data-more-rows]'))return void controller.rows(group,{append:true});
    if(b.matches('[data-more-groups]'))return void controller.load({append:true});
    if(b.matches('[data-refresh]'))return void controller.load();
    if(b.matches('[data-open]'))return void action(()=>onOpenTask(b.dataset.open,{onChanged:changed,onClose:released}));
    if(b.matches('[data-new-task],[data-add]'))return void action(()=>onCreateTask({groupId:group||'backlog',onChanged:changed,onClose:released}));
    if(b.matches('[data-new-release]'))return void action(()=>onCreateRelease({onChanged:changed,onClose:released}));
    if(b.matches('[data-board]'))return void onOpenBoard?.(group);
    if(b.matches('[data-start]'))return void action(()=>operation({kind:'start',groupId:group},'Начать релиз'));
    if(b.matches('[data-prepare]'))return void action(()=>operation({kind:'prepare',taskIds:[...controller.selection.ids]},'Подготовить задачи'));
    if(b.matches('[data-move]'))return void action(()=>moveDialog({adapter,projectId:project.id,taskIds:[...controller.selection.ids],onCommitted:changed,onClose:released}));
  },{signal});
  root.addEventListener('keydown',e=>{selectionShift=e.shiftKey;},{signal});root.addEventListener('keyup',()=>{selectionShift=false;},{signal});
  const unsubscribe=adapter.subscribe?.(()=>{if(!modal&&!opening)void controller.load();else controller.message='Данные изменились. Проверим актуальную версию при сохранении.';});
  await controller.load();
  if(viewState.scrollTop)scroll.scrollTop=viewState.scrollTop;
  return {reload:()=>controller.load(),controller,readyToLeave:()=>!opening&&!modal,
    destroy(){if(disposed)return;viewState.scrollTop=scroll.scrollTop;disposed=true;clearTimeout(searchTimer);observer?.disconnect();unsubscribe?.();abort.abort();controller.destroy();if(root.firstElementChild===page){root.classList.remove('planning-root');page.remove();}}};
}
