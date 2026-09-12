import {createCoverLoader} from './cover-loader.js';
import {mountBoardFilters} from './filter-view.js';
import {normalizeBoardFilters,hasBoardFilters,taskMatchesFilters} from './filters.js';
import {bindBoard,registerCore,ui} from '@iquipage/web/core';
import {TASK_COLUMNS,taskColumn,placeTask} from '../tasks.js';
import {icon,esc,dialog,select} from '../ui.js';
import {BOARD_SORTS,boardComparator,projectColumn} from './model.js';
import {renderTaskCard} from './card.js';
import {openTaskDialog} from './task-dialog.js';
import {mountTagPacking} from './tag-packing.js';
import {tagMarkup} from './catalog-ui.js';
import {taskURL,taskKey,parseTaskRoute} from './task-route.js';
/** Host adapter: canonical records stay in the repository; this module projects the board. */
export async function mountTaskBoard(root,{repository,project,canEdit=true,canManageCatalogs=false,attachmentAdapter=null,viewState={}}){
  registerCore();root.classList.add('iq-task-board-root');let catalogs={tags:[],releases:[]};let items=[],disposeBoard,closed=false,loading=0,dragging=false,queued=false,activeDialog=null,openingTask=false,dragIntent=null;
  const covers=createCoverLoader(attachmentAdapter,project.id);
  let disposeTags=()=>{},pointerStart=null,suppressClick=false,switchingTask=false;
  const pending=new Set(),abort=new AbortController(),signal=abort.signal;
  let reloadPromise=null,reloadAgain=false,reloadTimer=null,openingController=null;
  const key=`sprintique-board:${project.id}:${repository.context?.actorId||'local-user'}`;
  try{Object.assign(viewState,JSON.parse(localStorage.getItem(key)||'{}'),viewState);}catch{}
  const collapsed=new Set(Array.isArray(viewState.collapsed)?viewState.collapsed:[]);
  let sort=Object.hasOwn(BOARD_SORTS,viewState.sort)?viewState.sort:'priority';
  const persist=()=>{viewState.sort=sort;viewState.collapsed=[...collapsed];try{localStorage.setItem(key,JSON.stringify(viewState));}catch{}};
  delete viewState.query;
  root.innerHTML=`<div class="host-task-page"><header class="host-task-heading"><div class="host-task-heading-title"><h1>Доска задач</h1><div class="host-board-sort" data-board-sort></div></div>
  <div class="host-task-tools"><div class="board-filter-bar" data-board-filters></div>
  <button type="button" class="iq-btn primary" data-create-task ${canEdit?'':'disabled'}>${icon('plus',18)}<span>Новая задача</span></button></div>
  </header><p class="host-task-error" role="alert" hidden></p><div class="host-board-mount"></div><p class="sr-only" id="board-drag-help">Enter или пробел — взять задачу. Стрелки — выбрать позицию, Enter — переместить, Escape — отменить. В меню задачи доступно перемещение без перетаскивания.</p><span class="sr-only" role="status" data-task-live></span></div>`;
  const ownedPage=root.firstElementChild;
  function renderSort(){root.querySelector('[data-board-sort]').innerHTML=ui.menu(`<button type="button" class="iq-btn ghost sm" aria-label="Порядок задач">${esc(BOARD_SORTS[sort])}${icon('down',14)}</button>`,Object.entries(BOARD_SORTS).map(([id,label])=>({label:esc(label),glyph:id===sort?'check':null,action:'board-sort:'+id})));}
  renderSort();
  const mount=root.querySelector('.host-board-mount'),error=root.querySelector('.host-task-error');
  const fail=e=>{error.hidden=false;error.textContent=e.message||'Изменение не сохранено. Повторите действие.';};
  let filterState=normalizeBoardFilters(viewState.filters);
  const filters=mountBoardFilters(root.querySelector('[data-board-filters]'),{initial:viewState.filters,onChange:value=>{filterState=value;viewState.filters=value;persist();render();}});
  const filtering=()=>hasBoardFilters(filterState);
  const matches=t=>taskMatchesFilters(t,filterState);
  const projection=(status,tasks=items)=>projectColumn(tasks,status,{predicate:matches,compare:boardComparator(sort),collapsed,filtering:filtering()});
  const empty=status=>filtering()?'<div class="board-empty-slot"><span>Нет совпадений</span><small>Измените или сбросьте фильтры</small></div>':canEdit?`<button type="button" class="file-dropwell board-empty-slot" data-column-create="${status}"><span>Добавить задачу</span><small>или перетащите её сюда</small></button>`:'<div class="board-empty-slot"><span>Пока нет задач</span></div>';
  function render(focusId){
    if(closed||dragging){queued=true;return;}
    const old=mount.querySelector('.iq-board');
    if(old){viewState.x=old.scrollLeft;viewState.y=old.scrollTop;}disposeBoard?.();disposeTags();
    mount.innerHTML=`<div class="kanban iq-board host-task-board" role="region" aria-label="Доска задач. Шесть столбцов." tabindex="0">${TASK_COLUMNS.map(c=>{
      const p=projection(c.id),count=filtering()?`${p.matched}/${p.total}`:String(p.total);
      return `<section class="kanban-column" data-drop-status="${c.id}" aria-label="${c.label}"><div class="kanban-column-header">${icon(c.icon,18)}<h3>${c.label}</h3><span class="kanban-count" aria-label="${p.matched} задач из ${p.total}">${count}</span></div><div class="column-cards" data-column-cards>${p.rows.map(row=>renderTaskCard(row,{index:p.index,canEdit,pending:pending.has(row.task.id),collapsed:collapsed.has(row.task.id)&&!filtering(),catalogs})).join('')}${p.rows.length?'':empty(c.id)}</div>${canEdit&&p.rows.length?`<button type="button" class="iq-btn ghost sm host-column-add" data-column-create="${c.id}">${icon('plus',16)}<span>Добавить задачу</span></button>`:''}</section>`;
    }).join('')}</div>`;
    const board=mount.querySelector('.iq-board');covers.mount(board);disposeTags=mountTagPacking(board);board.scrollLeft=viewState.x||0;board.scrollTop=viewState.y||0;
    if(canEdit)disposeBoard=bindBoard(board,({id,status,beforeId})=>move(id,status,beforeId),{resolvePlacement,canDrag:({id})=>!pending.has(id)&&items.find(task=>task.id===id)?.result!=='accepted',onDragStateChange:active=>{dragging=active;if(!active&&queued)setTimeout(()=>reload(),0);}});
    if(focusId)board.querySelector(`[data-drag-id="${CSS.escape(focusId)}"] [data-drag-handle]`)?.focus({preventScroll:true});
  }
  function resolvePlacement(detail){
    const task=items.find(t=>t.id===detail.id);if(!task||pending.has(task.id))return false;
    if(sort==='manual'){
      const before=items.find(t=>t.id===detail.beforeId);
      if(before&&(before.parentId||null)!==(task.parentId||null))return false;
      return detail;
    }
    if(dragIntent?.id!==task.id)dragIntent={id:task.id,at:new Date().toISOString()};
    const candidate=taskColumn(task)===detail.status?task:{...task,status:detail.status,statusEnteredAt:dragIntent.at};
    const rows=projection(detail.status,items.map(t=>t.id===task.id?candidate:t)).rows;
    const at=rows.findIndex(r=>r.task.id===task.id);if(at<0)return false;
    const next=rows.slice(at+1).find(r=>mount.querySelector(`[data-drag-id="${CSS.escape(r.task.id)}"]`));
    return {beforeId:next?.task.id||null};
  }
  async function reload(){
    if(closed)return;if(dragging||pending.size){queued=true;return;}queued=false;
    if(reloadPromise){reloadAgain=true;return reloadPromise;}
    reloadPromise=(async()=>{do{
      reloadAgain=false;const token=++loading;
      try{
        const [all,tags,releases]=await Promise.all(['tasks','tags','releases'].map(name=>repository.list(name,project.id,{signal})));
        if(closed||token!==loading)continue;items=all;catalogs={tags,releases};filters.setData({tasks:items,...catalogs});render();
      }catch(e){if(!closed&&e.name!=='AbortError')fail(e);}
      if(dragging||pending.size){queued=reloadAgain;break;}
    }while(reloadAgain&&!closed);})().finally(()=>{reloadPromise=null;});
    return reloadPromise;
  }
  function scheduleReload(){if(closed||reloadTimer!==null)return;reloadTimer=setTimeout(()=>{reloadTimer=null;void reload();},0);}
  async function move(id,status,beforeId=null){
    if(!canEdit||closed||pending.has(id))return;
    const original=items.find(t=>t.id===id);if(!original||original.result==='accepted')return;
    if(sort!=='manual'&&taskColumn(original)===status)return;
    pending.add(id);loading++;error.hidden=true;
    try{
      const next=sort==='manual'?placeTask(original,items,status,beforeId):{...original,status};
      if(taskColumn(original)!==status)next.statusEnteredAt=dragIntent?.id===id?dragIntent.at:new Date().toISOString();
      if(next.parentId)collapsed.delete(next.parentId);
      items=items.map(t=>t.id===id?next:t);render();
      const saved=await repository.write('tasks',next,original.revision);
      if(closed)return;
      items=items.map(t=>t.id===id?saved:t);
      root.querySelector('[data-task-live]').textContent=`Задача перемещена: ${TASK_COLUMNS.find(c=>c.id===status).label}. Порядок: ${BOARD_SORTS[sort]}.`;
    }catch(e){
      if(closed)return;const current=await repository.read('tasks',id,project.id,{signal}).catch(()=>null);
      if(closed)return;
      items=items.map(t=>t.id===id?(current||original):t);fail(e);
    }finally{pending.delete(id);dragIntent=null;persist();render(id);if(queued)await reload();}
  }
  async function edit(task=null,status='ready',{fromRoute=false,fullscreen=false}={}){
    if(openingTask||activeDialog||closed)return;
    openingTask=true;const controller=new AbortController();openingController=controller;
    try{
    const created=await openTaskDialog(task,{repository,project,tasks:items,canEdit,canManage:canManageCatalogs,attachmentAdapter,status,fullscreen,signal:controller.signal,isActive:()=>!closed&&!controller.signal.aborted,onOpenTask:id=>openTask(id),onSaved:async saved=>{loading++;items=items.some(t=>t.id===saved.id)?items.map(t=>t.id===saved.id?saved:t):[...items,saved];render();await reload();}});
    if(closed||controller.signal.aborted){created.close(true);return;}activeDialog=created;
    if(task&&!fromRoute)history.pushState({taskDrawer:true,returnHash:location.hash||'#tasks'},'',taskURL(task));
    if(closed){activeDialog.close(true);return;}
    const opened=activeDialog;opened.addEventListener('iq-close',()=>{if(activeDialog===opened)activeDialog=null;if(!switchingTask&&task&&parseTaskRoute(location.hash)===taskKey(task)){if(history.state?.taskDrawer)history.back();else history.replaceState(null,'','#tasks');}},{once:true});
    }catch(cause){if(!closed&&cause.name!=='AbortError')fail(cause);}finally{if(openingController===controller){openingController=null;openingTask=false;}}
  }
  root.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};suppressClick=false;},{signal,capture:true});
  root.addEventListener('pointermove',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)suppressClick=true;},{signal,capture:true});
  root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-task-surface]')){e.preventDefault();edit(items.find(t=>t.id===e.target.dataset.taskSurface));}},{signal});
  root.addEventListener('click',e=>{
    if(suppressClick){suppressClick=false;return;}
    const overflow=e.target.closest('[data-tags-overflow]');if(overflow){const task=items.find(t=>t.id===overflow.dataset.tagsOverflow),tags=catalogs.tags.filter(tag=>task?.tagIds?.includes(tag.id));dialog({title:'Теги задачи',body:`<div class="task-selected-tags">${tags.map(tagMarkup).join('')}</div>`});return;}
    const surface=e.target.closest('[data-task-surface]');
    if(surface&&(e.metaKey||e.ctrlKey)&&(!e.target.closest('button,a,iq-menu,input')||e.target.closest('[data-open-task],[data-drag-handle]'))){window.open(taskURL(items.find(t=>t.id===surface.dataset.taskSurface)),'_blank','noopener');return;}
    if(surface&&(!e.target.closest('button,a,iq-menu,input')||e.target.closest('[data-drag-handle]')))void edit(items.find(t=>t.id===surface.dataset.taskSurface));
    const open=e.target.closest('[data-open-task]'),add=e.target.closest('[data-create-task],[data-column-create]'),toggle=e.target.closest('[data-toggle-children]'),children=e.target.closest('[data-show-children]');
    if(open)edit(items.find(t=>t.id===open.dataset.openTask));
    if(add&&canEdit)edit(null,add.dataset.columnCreate||'ready');
    if(toggle){const id=toggle.dataset.toggleChildren;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);persist();render();root.querySelector(`[data-toggle-children="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
    if(children){const list=items.filter(t=>t.parentId===children.dataset.showChildren);dialog({title:'Подзадачи',body:`<div class="iq-list">${list.map(t=>`<button class="iq-list-item full" data-child-id="${esc(t.id)}"><div><b>${esc(t.title)}</b><small>${esc(TASK_COLUMNS.find(c=>c.id===taskColumn(t))?.label||t.status)}</small></div>${icon('chevron',16)}</button>`).join('')}</div>`,mount:el=>el.addEventListener('click',e=>{const b=e.target.closest('[data-child-id]');if(b){el.close(true);edit(items.find(t=>t.id===b.dataset.childId));}})});}
  },{signal});
  root.addEventListener('iq-action',e=>{
    const [action,id]=String(e.detail.action||'').split(':');
    if(action==='board-sort'&&Object.hasOwn(BOARD_SORTS,id)){sort=id;persist();render();renderSort();root.querySelector('[data-board-sort] button')?.focus();return;}
    const task=items.find(t=>t.id===id);if(!task)return;
    if(action==='open')edit(task);
    if(action==='move-menu'&&canEdit)dialog({title:'Переместить задачу',body:select('status','Новый столбец',taskColumn(task),TASK_COLUMNS.map(c=>[c.id,c.label])),submitLabel:'Переместить',onSubmit:async values=>{await move(id,values.get('status'));}});
  },{signal});
  const unsubscribe=repository.subscribe?.(e=>{if(['tasks','tags','releases'].includes(e.collection)&&e.projectId===project.id)scheduleReload();});
  async function closeTask(){
    if(openingTask){openingController?.abort();openingController=null;openingTask=false;return true;}if(pending.size)return false;if(!activeDialog)return true;const opened=activeDialog;switchingTask=true;
    const accepted=await opened.taskController.close();
    if(accepted&&opened.isConnected)await new Promise(resolve=>opened.addEventListener('iq-close',resolve,{once:true}));
    switchingTask=false;return accepted;
  }
  async function openTask(id,options={}){
    if(closed||openingTask||pending.size)return false;
    if(activeDialog&&(activeDialog.taskController.taskKey===id||activeDialog.taskController.taskId===id))return true;
    const task=items.find(item=>item.id===id||taskKey(item)===id)||await repository.read('tasks',id,project.id,{signal});
    if(closed)return false;
    if(!task||task.projectId!==project.id){fail(Error('Задача недоступна в этом проекте.'));return false;}
    if(!(await closeTask()))return false;await edit(task,'ready',options);return activeDialog?.taskController.taskId===task.id;
  }
  await reload();
  return {reload,openTask,closeTask,currentTask:()=>activeDialog?.taskController.taskKey||null,readyToLeave:async()=>!openingTask&&!activeDialog&&!pending.size,destroy(){
    activeDialog?.close(true);
    const board=mount.querySelector('.iq-board');if(board){viewState.x=board.scrollLeft;viewState.y=board.scrollTop;}
    persist();if(root.firstElementChild===ownedPage)root.classList.remove('iq-task-board-root');closed=true;loading++;clearTimeout(reloadTimer);openingController?.abort();abort.abort();covers.destroy();filters.destroy();unsubscribe?.();disposeBoard?.();disposeTags();
  }};
}
