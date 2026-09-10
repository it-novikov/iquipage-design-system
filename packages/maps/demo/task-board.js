import {bindBoard,registerCore} from '../dist/vendor/core.js';
import {TASK_COLUMNS,taskColumn,placeTask} from '../src/tasks.js';
import {icon,esc,dialog,select} from '../src/ui.js';
import {BOARD_SORTS,boardComparator,projectColumn} from '../src/board/model.js';
import {renderTaskCard} from '../src/board/card.js';
import {openTaskDialog} from '../src/board/task-dialog.js';
/** Host adapter: canonical records stay in the repository; this module projects the board. */
export async function mountTaskBoard(root,{repository,project,canEdit=true,viewState={}}){
  registerCore();let items=[],disposeBoard,closed=false,loading=0,dragging=false,queued=false,activeDialog=null,dragIntent=null;
  const pending=new Set(),abort=new AbortController(),signal=abort.signal;
  const key=`sprintique-board:${project.id}:${repository.context?.actorId||'local-user'}`;
  try{Object.assign(viewState,JSON.parse(localStorage.getItem(key)||'{}'),viewState);}catch{}
  const collapsed=new Set(Array.isArray(viewState.collapsed)?viewState.collapsed:[]);
  let sort=Object.hasOwn(BOARD_SORTS,viewState.sort)?viewState.sort:'priority';
  const persist=()=>{viewState.sort=sort;viewState.collapsed=[...collapsed];try{localStorage.setItem(key,JSON.stringify(viewState));}catch{}};
  root.innerHTML=`<div class="host-task-page"><header class="host-task-heading"><h1>Доска задач</h1><button type="button" class="iq-btn primary sm" data-create-task ${canEdit?'':'disabled'}>${icon('plus',17)}<span>Новая задача</span></button></header>
  <div class="host-task-tools"><label class="iq-search-small">${icon('search',17)}<input type="search" aria-label="Поиск задач" placeholder="Найти задачу…" value="${esc(viewState.query||'')}"></label>
  <div class="host-board-sort">${select('board-sort','Порядок задач',sort,Object.entries(BOARD_SORTS))}</div>
  <button type="button" class="iq-btn ghost icon sm" data-refresh-tasks aria-label="Обновить задачи">${icon('refresh',17)}</button><button type="button" class="iq-btn ghost icon sm" data-board-help aria-label="Как перемещать задачи">${icon('help',17)}</button></div>
  <p class="host-task-error" role="alert" hidden></p><div class="host-board-mount"></div><p class="sr-only" id="board-drag-help">Enter или пробел — взять задачу. Стрелки — выбрать позицию, Enter — переместить, Escape — отменить. В меню задачи доступно перемещение без перетаскивания.</p><span class="sr-only" role="status" data-task-live></span></div>`;
  const mount=root.querySelector('.host-board-mount'),error=root.querySelector('.host-task-error'),search=root.querySelector('input[type=search]');
  const fail=e=>{error.hidden=false;error.textContent=e.message||'Изменение не сохранено. Повторите действие.';};
  const query=()=>search.value.trim().toLocaleLowerCase('ru');
  const matches=t=>!query()||[t.title,t.description,t.owner,t.displayId,t.id].join(' ').toLocaleLowerCase('ru').includes(query());
  const projection=(status,tasks=items)=>projectColumn(tasks,status,{predicate:matches,compare:boardComparator(sort),collapsed,filtering:!!query()});
  const empty=()=>`<div class="board-empty-slot"><div class="empty-art" aria-hidden="true"><span class="empty-sheet back"></span><span class="empty-sheet">${icon('file',24)}</span></div><span>${query()?'Нет совпадений':'Пока нет задач'}</span></div>`;
  function render(focusId){
    if(closed||dragging){queued=true;return;}
    const old=mount.querySelector('.iq-board');
    if(old){viewState.x=old.scrollLeft;viewState.y=old.scrollTop;}disposeBoard?.();
    mount.innerHTML=`<div class="kanban iq-board host-task-board" role="region" aria-label="Доска задач. Шесть столбцов." tabindex="0">${TASK_COLUMNS.map(c=>{
      const p=projection(c.id),count=query()?`${p.matched}/${p.total}`:String(p.total);
      return `<section class="kanban-column" data-drop-status="${c.id}" aria-label="${c.label}"><div class="kanban-column-header">${icon(c.icon,18)}<h3>${c.label}</h3><span class="kanban-count" aria-label="${p.matched} задач из ${p.total}">${count}</span></div><div class="column-cards" data-column-cards>${p.rows.map(row=>renderTaskCard(row,{index:p.index,canEdit,pending:pending.has(row.task.id),collapsed:collapsed.has(row.task.id)&&!query()})).join('')}${empty()}</div>${canEdit?`<button type="button" class="iq-btn ghost sm host-column-add" data-column-create="${c.id}">${icon('plus',16)}<span>Добавить задачу</span></button>`:''}</section>`;
    }).join('')}</div>`;
    const board=mount.querySelector('.iq-board');board.scrollLeft=viewState.x||0;board.scrollTop=viewState.y||0;
    if(canEdit)disposeBoard=bindBoard(board,({id,status,beforeId})=>move(id,status,beforeId),{resolvePlacement,canDrag:({id})=>!pending.has(id),onDragStateChange:active=>{dragging=active;if(!active&&queued)setTimeout(()=>reload(),0);}});
    if(focusId)board.querySelector(`[data-drag-id="${CSS.escape(focusId)}"] [data-drag-handle]`)?.focus({preventScroll:true});
  }
  function resolvePlacement(detail){
    const task=items.find(t=>t.id===detail.id);if(!task||pending.has(task.id))return false;
    if(sort==='manual'){
      const before=items.find(t=>t.id===detail.beforeId);
      if(before&&(before.parentId||null)!==(task.parentId||null))return false;
      return detail;
    }
    if(taskColumn(task)===detail.status)return false;
    if(dragIntent?.id!==task.id)dragIntent={id:task.id,at:new Date().toISOString()};
    const candidate={...task,status:detail.status,statusEnteredAt:dragIntent.at};
    const rows=projection(detail.status,items.map(t=>t.id===task.id?candidate:t)).rows;
    const at=rows.findIndex(r=>r.task.id===task.id);if(at<0)return false;
    const next=rows.slice(at+1).find(r=>mount.querySelector(`[data-drag-id="${CSS.escape(r.task.id)}"]`));
    return {beforeId:next?.task.id||null};
  }
  async function reload(){
    if(closed)return;if(dragging||pending.size){queued=true;return;}queued=false;
    const token=++loading;
    try{const all=await repository.list('tasks',project.id);if(closed||token!==loading)return;items=all;render();}
    catch(e){if(!closed)fail(e);}
  }
  async function move(id,status,beforeId=null){
    if(!canEdit||closed||pending.has(id))return;
    const original=items.find(t=>t.id===id);if(!original)return;
    if(sort!=='manual'&&taskColumn(original)===status)return;
    pending.add(id);loading++;error.hidden=true;
    try{
      const next=sort==='manual'?placeTask(original,items,status,beforeId):{...original,status};
      if(taskColumn(original)!==status)next.statusEnteredAt=dragIntent?.id===id?dragIntent.at:new Date().toISOString();
      if(next.parentId)collapsed.delete(next.parentId);
      items=items.map(t=>t.id===id?next:t);render();
      const saved=await repository.write('tasks',next,original.revision);
      items=items.map(t=>t.id===id?saved:t);
      root.querySelector('[data-task-live]').textContent=`Задача перемещена: ${TASK_COLUMNS.find(c=>c.id===status).label}. Порядок: ${BOARD_SORTS[sort]}.`;
    }catch(e){
      const current=await repository.read('tasks',id,project.id).catch(()=>null);
      items=items.map(t=>t.id===id?(current||original):t);fail(e);
    }finally{pending.delete(id);dragIntent=null;persist();render(id);if(queued)await reload();}
  }
  function edit(task=null,status='ready'){
    activeDialog=openTaskDialog(task,{repository,project,tasks:items,canEdit,status,onSaved:async saved=>{loading++;items=items.some(t=>t.id===saved.id)?items.map(t=>t.id===saved.id?saved:t):[...items,saved];render();}});
    activeDialog.addEventListener('iq-close',()=>{activeDialog=null;},{once:true});
  }
  root.addEventListener('click',e=>{
    const open=e.target.closest('[data-open-task]'),add=e.target.closest('[data-create-task],[data-column-create]'),toggle=e.target.closest('[data-toggle-children]'),children=e.target.closest('[data-show-children]');
    if(open)edit(items.find(t=>t.id===open.dataset.openTask));
    if(add&&canEdit)edit(null,add.dataset.columnCreate||'ready');
    if(toggle){const id=toggle.dataset.toggleChildren;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);persist();render();root.querySelector(`[data-toggle-children="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
    if(e.target.closest('[data-refresh-tasks]'))reload();
    if(e.target.closest('[data-board-help]'))dialog({title:'Перемещение задач',body:'<p>Перетащите задачу за ручку или используйте пункт «Переместить» в её меню.</p><p>С клавиатуры: Enter — взять, стрелки — выбрать столбец, Enter — подтвердить, Escape — отменить.</p><p>При автоматической сортировке место определяется выбранным порядком. Ручная очередь переставляет задачи одного уровня, не меняя их родителей.</p>'});
    if(children){const list=items.filter(t=>t.parentId===children.dataset.showChildren);dialog({title:'Подзадачи',body:`<div class="iq-list">${list.map(t=>`<button class="iq-list-item full" data-child-id="${esc(t.id)}"><div><b>${esc(t.title)}</b><small>${esc(TASK_COLUMNS.find(c=>c.id===taskColumn(t))?.label||t.status)}</small></div>${icon('chevron',16)}</button>`).join('')}</div>`,mount:el=>el.addEventListener('click',e=>{const b=e.target.closest('[data-child-id]');if(b){el.close(true);edit(items.find(t=>t.id===b.dataset.childId));}})});}
  },{signal});
  root.addEventListener('iq-action',e=>{
    const [action,id]=String(e.detail.action||'').split(':');
    const task=items.find(t=>t.id===id);if(!task)return;
    if(action==='open')edit(task);
    if(action==='move-menu'&&canEdit)dialog({title:'Переместить задачу',body:select('status','Новый столбец',taskColumn(task),TASK_COLUMNS.map(c=>[c.id,c.label])),submitLabel:'Переместить',onSubmit:async values=>{await move(id,values.get('status'));}});
  },{signal});
  root.addEventListener('iq-change',e=>{if(e.target.getAttribute('name')==='board-sort'){sort=e.target.value;persist();render();}},{signal});
  let searchFrame=0;
  search.addEventListener('input',()=>{viewState.query=search.value;persist();cancelAnimationFrame(searchFrame);searchFrame=requestAnimationFrame(()=>render());},{signal});
  const unsubscribe=repository.subscribe?.(e=>{if(e.collection==='tasks'&&e.projectId===project.id)reload();});
  await reload();
  return {reload,readyToLeave:async()=>!activeDialog&&!pending.size,destroy(){
    const board=mount.querySelector('.iq-board');if(board){viewState.x=board.scrollLeft;viewState.y=board.scrollTop;}
    persist();closed=true;loading++;cancelAnimationFrame(searchFrame);abort.abort();unsubscribe?.();disposeBoard?.();
  }};
}
