import {loadingMarkup} from '../loading.js';
import {pageHeader} from '../page-header.js';
import {createCoverLoader} from './cover-loader.js';
import {mountBoardFilters} from './filter-view.js';
import {normalizeBoardFilters,hasBoardFilters,taskMatchesFilters} from './filters.js';
import {bindBoard,registerCore,ui,notify,FEEDBACK_TIMING} from '@iquipage/web/core';
import {TASK_COLUMNS,taskColumn,placeTask} from '../tasks.js';
import {icon,esc,dialog,select} from '../ui.js';
import {BOARD_SORTS,boardComparator,projectColumn,boardShown} from './model.js';
import {mountReleaseTitle} from './release-title.js';
import {renderTaskCard} from './card.js';
import {openTaskDialog} from './task-dialog.js';
import {background} from '../action-feedback.js';
import {mountTagPacking} from './tag-packing.js';
import {tagMarkup} from './catalog-ui.js';
import {taskURL,taskKey,parseTaskRoute} from './task-route.js';
/** Host adapter: canonical records stay in the repository; this module projects the board. */
export async function mountTaskBoard(root,{repository,project,canEdit=true,canManageCatalogs=false,attachmentAdapter=null,viewState={}}){
  registerCore();root.classList.add('iq-task-board-root');let catalogs={tags:[],releases:[]};let items=[],disposeBoard,closed=false,loading=0,dragging=false,queued=false,activeDialog=null,openingTask=false,dragIntent=null;
  const covers=createCoverLoader(attachmentAdapter,project.id);
  let disposeTags=()=>{},pointerStart=null,suppressClick=false,switchingTask=false,trail=[];
  const pending=new Set(),abort=new AbortController(),signal=abort.signal;
  let reloadPromise=null,reloadAgain=false,reloadTimer=null,openingController=null,reloads=0;
  // What a board load reads: one release (with its lifecycle, which decides the query) or the tasks without one.
  const boardScope=scope=>!scope?null:scope.backlog?{backlog:true}:{releaseId:scope.releaseId,lifecycle:scope.lifecycle};
  const sameScope=(a,b)=>!!a&&!!b&&a.backlog===b.backlog&&a.releaseId===b.releaseId&&a.lifecycle===b.lifecycle;
  const key=`sprintique-board:${project.id}:${repository.context?.actorId||'local-user'}`;
  // Scroll position lives only for this page session (switching sections); a reload starts at the first column.
  try{const {x:_x,y:_y,boardScope:_scope,...stored}=JSON.parse(localStorage.getItem(key)||'{}');Object.assign(viewState,stored,viewState);}catch{}
  // Subtask lists on parent cards are collapsed unless the person opened them.
  const expanded=new Set(Array.isArray(viewState.expanded)?viewState.expanded:[]);delete viewState.collapsed;
  let sort=Object.hasOwn(BOARD_SORTS,viewState.sort)?viewState.sort:'priority';
  const persist=()=>{viewState.sort=sort;viewState.expanded=[...expanded];try{const {x:_x,y:_y,boardScope:_scope,...stored}=viewState;localStorage.setItem(key,JSON.stringify(stored));}catch{}};
  delete viewState.query;
  root.innerHTML=`<div class="host-task-page">${pageHeader({titleHTML:'<div class="host-task-heading-title"><h1 class="host-board-title" data-board-title>Доска задач</h1></div>',actions:`
  <div class="host-task-tools sq-page-tools"><div class="host-board-sort" data-board-sort></div><div class="board-filter-bar" data-board-filters></div>
  <button type="button" class="iq-btn primary" data-create-task ${canEdit?'':'disabled'}>${icon('plus',18)}<span>Новая задача</span></button></div>
  `})}<p class="host-task-error" role="alert" hidden></p><div class="host-board-mount"></div><p class="sr-only" id="board-drag-help">Enter или пробел — взять задачу. Стрелки — выбрать позицию, Enter — переместить, Escape — отменить. В меню задачи доступно перемещение без перетаскивания.</p><span class="sr-only" role="status" data-task-live></span></div>`;
  const ownedPage=root.firstElementChild;
  function renderSort(){root.querySelector('[data-board-sort]').innerHTML=ui.menu(`<button type="button" class="iq-btn ghost sm" aria-label="Порядок задач: ${esc(BOARD_SORTS[sort])}">${icon('sort',17)}<span>${esc(BOARD_SORTS[sort])}</span></button>`,Object.entries(BOARD_SORTS).map(([id,label])=>({label:esc(label),glyph:id===sort?'check':null,action:'board-sort:'+id})));}
  renderSort();
  const mount=root.querySelector('.host-board-mount'),error=root.querySelector('.host-task-error');
  mount.innerHTML=loadingMarkup('Загружаем доску…',{variant:'board'});
  const fail=e=>{error.hidden=false;error.textContent=e.message||'Изменение не сохранено. Повторите действие.';if(mount.querySelector('[data-loading-shape]')){mount.innerHTML=ui.btn('Повторить загрузку','secondary sm','','data-retry-board');mount.querySelector('[data-retry-board]').onclick=()=>{mount.innerHTML=loadingMarkup('Загружаем доску…',{variant:'board'});void reload();};}};
  let filterState=normalizeBoardFilters(viewState.filters);
  const filters=mountBoardFilters(root.querySelector('[data-board-filters]'),{initial:viewState.filters,onChange:value=>{filterState=value;viewState.filters=value;persist();render();},countMatches:value=>items.filter(t=>taskMatchesFilters(t,value)).length});
  const filtering=()=>hasBoardFilters(filterState);
  const matches=t=>taskMatchesFilters(t,filterState);
  const projection=(status,tasks=items)=>projectColumn(tasks,status,{predicate:matches,compare:boardComparator(sort)});
  const empty=status=>filtering()?'<div class="board-empty-slot"><span>Нет совпадений</span><small>Измените или сбросьте фильтры</small></div>':canEdit?`<button type="button" class="file-dropwell board-empty-slot" data-column-create="${status}"><span>Добавить задачу</span><small>или перетащите её сюда</small></button>`:'<div class="board-empty-slot"><span>Пока нет задач</span></div>';
  /** The board shows one release: the one the person picked (kept on the server for them and this project) while it is
   *  running or planned, otherwise the running one (the one ending first when several run), otherwise the tasks
   *  without a release. Kind, dates and days left belong to planning; the board keeps only the name. */
  let chosenRelease=null,shown={backlog:true},saving=Promise.resolve();
  // The person's choice loads alongside the first catalogs instead of before them.
  let preference=repository.boardRelease?repository.boardRelease(project.id,{signal}).catch(()=>null):null;
  function resolveShown(){shown=boardShown(chosenRelease,catalogs.releases);}
  // The title is the release switcher (release-title.js): picking a release reloads the board under it.
  const releaseTitle=mountReleaseTitle(root.querySelector('[data-board-title]'),{signal,onPick:value=>{
    // A load already under way for the previous release is discarded: its tasks never show under the new title.
    chosenRelease=value;resolveShown();renderTitle();loading++;void reload();
    // Remembered for the person in this project, on every device, one save after another so the last choice wins;
    // a failed save keeps the choice for this visit.
    saving=saving.then(()=>repository.setBoardRelease?.(project.id,value)).catch(()=>notify({tone:'warning',message:'Не удалось запомнить выбор релиза. Доска покажет его до перезагрузки.'}));
  }});
  const renderTitle=()=>releaseTitle.render(catalogs.releases,shown);
  function render(focusId){
    if(closed||dragging){queued=true;return;}
    const old=mount.querySelector('.iq-board');
    if(old){viewState.x=old.scrollLeft;viewState.y=old.scrollTop;}disposeBoard?.();disposeTags();
    mount.innerHTML=`<div class="kanban iq-board host-task-board" role="region" aria-label="Доска задач. Шесть столбцов." tabindex="0">${TASK_COLUMNS.map(c=>{
      const p=projection(c.id),count=filtering()?`${p.matched}/${p.total}`:String(p.total);
      return `<section class="kanban-column" data-drop-status="${c.id}" aria-label="${c.label}"><div class="kanban-column-header">${icon(c.icon,18)}<h3>${c.label}</h3><span class="kanban-count" aria-label="${p.matched} задач из ${p.total}">${count}</span></div><div class="column-cards" data-column-cards>${p.rows.map(row=>renderTaskCard(row,{index:p.index,canEdit,pending:pending.has(row.task.id),expanded:expanded.has(row.task.id),catalogs})).join('')}${p.rows.length?'':empty(c.id)}</div>${canEdit&&p.rows.length?`<button type="button" class="iq-btn ghost sm host-column-add" data-column-create="${c.id}">${icon('plus',16)}<span>Добавить задачу</span></button>`:''}</section>`;
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
        // The tasks of the release shown last time load alongside the catalogs; they are used only when the catalogs
        // show that same release again, otherwise the right release is read after them, as before.
        const guess=boardScope(reloads++?shown:viewState.boardScope),early=guess?repository.list('tasks',project.id,{signal,board:guess}):null;
        early?.catch(()=>{});
        const [tags,releases,members,picked]=await Promise.all([...['tags','releases'].map(name=>repository.list(name,project.id,{signal})),
          repository.capabilities?.members===false?[]:repository.list('members',project.id,{signal}).catch(()=>[]),preference]);
        if(preference){preference=null;chosenRelease??=picked??null;}
        catalogs={...catalogs,releases};resolveShown();const scope=shown;viewState.boardScope=boardScope(scope);
        const all=early&&sameScope(guess,viewState.boardScope)?await early:await repository.list('tasks',project.id,{signal,board:scope});
        if(closed||token!==loading||scope!==shown)continue;items=all;
        const people=new Map(members.map(m=>[m.id,{id:m.id,name:m.name,image:repository.client?.avatarUrl?.(m.id,m.avatarRevision)||undefined}]));
        catalogs={tags,releases,people};filters.setData({tasks:items,...catalogs});renderTitle();render();error.hidden=true;
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
      items=items.map(t=>t.id===id?next:t);render();
      const saved=await repository.write('tasks',next,original.revision);
      if(closed)return;
      items=items.map(t=>t.id===id?saved:t);
      root.querySelector('[data-task-live]').textContent=`Задача перемещена: ${TASK_COLUMNS.find(c=>c.id===status).label}. Порядок: ${BOARD_SORTS[sort]}.`;
      return true;
    }catch(e){
      if(closed)return;const current=await repository.read('tasks',id,project.id,{signal}).catch(()=>null);
      if(closed)return;
      // Optimistic move, rolled back with a toast: the card is back where it was, the reason is said once.
      items=items.map(t=>t.id===id?(current||original):t);notify({tone:'danger',message:'Задача не перемещена',description:e.message||'Повторите действие.',duration:3500});
    }finally{pending.delete(id);dragIntent=null;persist();render(id);if(queued)await reload();}
  }
  async function edit(task=null,status='ready',{fromRoute=false,fullscreen=false,replaceRoute=false,replace=null}={}){
    if(openingTask||(activeDialog&&activeDialog!==replace)||closed)return;
    openingTask=true;const controller=new AbortController();openingController=controller;
    // The drawer opens once its task is read: on a slow connection the pressed card shows it is opening after 150 ms
    // (the busy look of a card, as while it moves), and the line under the top bar follows after a second.
    const surface=task?root.querySelector(`[data-task-surface="${CSS.escape(task.id)}"]`):null;
    const opening=surface?setTimeout(()=>surface.setAttribute('aria-busy','true'),FEEDBACK_TIMING.pending):0;
    try{
    // A new task starts in the release the board shows; the form lets the person pick another or none.
    const initialValues=task?{}:{releaseId:shown.backlog?null:shown.releaseId};
    const created=await openTaskDialog(task,{repository,project,tasks:items,canEdit,canManage:canManageCatalogs,attachmentAdapter,status,initialValues,fullscreen,replace,signal:controller.signal,isActive:()=>!closed&&!controller.signal.aborted,onOpenTask:id=>openTask(id,{via:'link',from:task}),backTo:task?trail.at(-1)||null:null,onBack:()=>{const previous=trail.at(-1);if(previous)void openTask(previous.id,{via:'back'});},onReload:async()=>{if(!(await closeTask()))return;const fresh=await repository.read('tasks',task.id,project.id);if(fresh)await edit(fresh,'ready',{fromRoute:true,fullscreen});},onSaved:async saved=>{if(!task&&!items.some(t=>t.id===saved.id))notify({tone:'success',message:`Задача ${taskKey(saved)} создана`,action:{label:'Открыть',run:()=>void openTask(saved.id)}});loading++;items=items.some(t=>t.id===saved.id)?items.map(t=>t.id===saved.id?saved:t):[...items,saved];render();await reload();}});
    if(closed||controller.signal.aborted){created.close(true);return;}activeDialog=created;
    // Following a link or going back inside the drawer replaces the drawer's history entry, so closing it
    // always returns to the board instead of walking back through every task that was visited.
    if(task&&replaceRoute)history.replaceState({...(history.state||{}),taskDrawer:history.state?.taskDrawer===true},'',taskURL(task));
    else if(task&&!fromRoute)history.pushState({taskDrawer:true,returnHash:location.hash||'#tasks'},'',taskURL(task));
    if(closed){activeDialog.close(true);return;}
    const opened=activeDialog;opened.addEventListener('iq-close',()=>{if(activeDialog===opened)activeDialog=null;if(!switchingTask)trail=[];if(!switchingTask&&task&&parseTaskRoute(location.hash)===taskKey(task)){if(history.state?.taskDrawer)history.back();else history.replaceState(null,'','#tasks');}},{once:true});
    }catch(cause){if(!closed&&cause.name!=='AbortError')fail(cause);}finally{clearTimeout(opening);if(surface&&!pending.has(task.id))surface.removeAttribute('aria-busy');if(openingController===controller){openingController=null;openingTask=false;}}
  }
  // Pointing at a card or focusing it reads the project's task list the drawer needs (for parents and links) ahead of
  // the click; the drawer then finds it in the repository's short cache. At most one read in 20 seconds.
  let warmedAt=0;
  const warmDrawer=e=>{
    if(!repository.taskContext||Date.now()-warmedAt<20000||!e.target.closest?.('[data-task-surface], [data-open-task]'))return;
    warmedAt=Date.now();background(()=>repository.taskContext(project.id,{signal})).catch(()=>{warmedAt=0;});
  };
  root.addEventListener('pointerover',warmDrawer,{signal});root.addEventListener('focusin',warmDrawer,{signal});
  root.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};suppressClick=false;},{signal,capture:true});
  root.addEventListener('pointermove',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)suppressClick=true;},{signal,capture:true});
  root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-task-surface]')){e.preventDefault();edit(items.find(t=>t.id===e.target.dataset.taskSurface));}},{signal});
  root.addEventListener('click',e=>{
    if(suppressClick){suppressClick=false;return;}
    const overflow=e.target.closest('[data-tags-overflow]');if(overflow){const task=items.find(t=>t.id===overflow.dataset.tagsOverflow),tags=catalogs.tags.filter(tag=>task?.tagIds?.includes(tag.id));dialog({title:'Теги задачи',body:`<div class="task-selected-tags">${tags.map(tagMarkup).join('')}</div>`});return;}
    const surface=e.target.closest('[data-task-surface]');
    if(surface&&(e.metaKey||e.ctrlKey)&&(!e.target.closest('button,a,iq-menu,input')||e.target.closest('[data-open-task],[data-drag-handle]'))){window.open(taskURL(items.find(t=>t.id===surface.dataset.taskSurface)),'_blank','noopener');return;}
    if(surface&&(!e.target.closest('button,a,iq-menu,input')||e.target.closest('[data-drag-handle]')))void edit(items.find(t=>t.id===surface.dataset.taskSurface));
    const open=e.target.closest('[data-open-task]'),add=e.target.closest('[data-create-task],[data-column-create]'),toggle=e.target.closest('[data-toggle-children]');
    if(open)edit(items.find(t=>t.id===open.dataset.openTask));
    if(add&&canEdit)edit(null,add.dataset.columnCreate||'ready');
    if(toggle){const id=toggle.dataset.toggleChildren,open=!expanded.has(id);open?expanded.add(id):expanded.delete(id);persist();
      // In place: re-rendering the board would restart every card's light and hover fade.
      toggle.setAttribute('aria-expanded',String(open));const list=root.querySelector(`#subtasks-${CSS.escape(id)}`);if(list)list.hidden=!open;}
  },{signal});
  root.addEventListener('iq-action',e=>{
    const parts=String(e.detail.action||'').split(':'),action=parts[0],id=parts.at(-1);
    if(action==='board-sort'&&Object.hasOwn(BOARD_SORTS,id)){sort=id;persist();render();renderSort();root.querySelector('[data-board-sort] button')?.focus();return;}
    const task=items.find(t=>t.id===id);if(!task)return;
    if(action==='open')edit(task);
    if(action==='move-to'&&canEdit&&TASK_COLUMNS.some(c=>c.id===parts[1]))void move(id,parts[1]).then(moved=>{if(moved)notify({tone:'success',message:`${taskKey(task)} → ${TASK_COLUMNS.find(c=>c.id===parts[1]).label}`});});
  },{signal});
  const unsubscribe=repository.subscribe?.(e=>{if(['tasks','taskLinks','tags','releases'].includes(e.collection)&&e.projectId===project.id)scheduleReload();});
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
    // Moving between tasks inside the drawer hands over in one frame: the current drawer settles its edits but stays
    // open until the next one is ready, then the next replaces it without motion, so nothing blinks.
    const handoff=(options.via==='link'||options.via==='back')&&activeDialog?activeDialog:null;
    if(handoff){if(pending.size||!(await handoff.taskController.close({keepOpen:true})))return false;}
    else if(!(await closeTask()))return false;
    // The trail holds the tasks the drawer came from; a fresh open (board, search, URL) starts a new one.
    const current=options.from;
    if(options.via==='link'&&current&&current.id!==task.id)trail.push({id:current.id,key:taskKey(current),title:current.title});
    else if(options.via==='back')trail.pop();
    else trail=[];
    const handedOver=handoff?new Promise(resolve=>{handoff.addEventListener('iq-close',resolve,{once:true});setTimeout(resolve,1000);}):null;
    if(handoff)switchingTask=true;
    try{await edit(task,'ready',{...options,replaceRoute:options.via==='link'||options.via==='back',...(handoff?{replace:handoff,fullscreen:handoff.dataset.fullscreen==='true'}:{})});}
    // The native close event is queued, so the switch lasts until the old drawer has really closed.
    finally{if(handoff){if(handoff.open)handoff.close(true);await handedOver;switchingTask=false;}}
    return activeDialog?.taskController.taskId===task.id;
  }
  await reload();
  return {reload,openTask,closeTask,createTask:()=>canEdit?edit(null,'ready'):undefined,currentTask:()=>activeDialog?.taskController.taskKey||null,readyToLeave:async()=>!openingTask&&!activeDialog&&!pending.size,destroy(){
    activeDialog?.close(true);
    const board=mount.querySelector('.iq-board');if(board){viewState.x=board.scrollLeft;viewState.y=board.scrollTop;}
    persist();if(root.firstElementChild===ownedPage)root.classList.remove('iq-task-board-root');closed=true;loading++;clearTimeout(reloadTimer);openingController?.abort();abort.abort();covers.destroy();filters.destroy();unsubscribe?.();disposeBoard?.();disposeTags();
  }};
}
