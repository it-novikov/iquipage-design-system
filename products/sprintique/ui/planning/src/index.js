import {registerCore,notify,bindTreeDrag,escapeHTML as esc,icon} from '@iquipage/web/core';
import {filterPlan} from './workspace-model.js';
import {PlanningOperation} from './operation.js';
import {operationDialog} from './dialog.js';
import {openMenu,closePopover} from '../../src/popover.js';
import {estimateEditor,formatSum} from '../../src/estimate.js';
import {loadingMarkup} from '../../src/loading.js';
import {pageMarkup,navigationMarkup,firstRunMarkup,footMarkup,cardMarkup,selectionMarkup,dragPreview,sumMarkup} from './containers-view.js';
import {blocksOf,blockDone,sumOf,plural,validContainers,dateRange,shortDate} from './containers-model.js';
import {dueEditor,containerDialog,completionDialog,completedDialog,cancelDialog} from './containers-dialogs.js';

/**
 * «Планирование» (round 4.1): the running sprint, the next sprints, open releases and the backlog as cards of one page.
 * Rows are a tree in the DS language; a held row moves between cards; dates and estimates change in place; the sprint
 * ends in one dialog. The host supplies the planning adapter and opens tasks.
 */
export async function mountPlanning(root,{adapter,project,onOpenTask,onCreateTask,viewState={}}){
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер Планирования.');
  registerCore();
  root.classList.add('planning-root');root.innerHTML=pageMarkup();
  const page=root.querySelector('.pl-page'),stack=root.querySelector('[data-stack]'),foot=root.querySelector('[data-foot]');
  const selbar=root.querySelector('[data-selbar]'),live=root.querySelector('[data-live]'),errorBox=root.querySelector('[data-error]');
  stack.innerHTML=loadingMarkup('Загрузка планирования…',{rows:8,title:false,className:'pl-loading'});
  let data=null,disposed=false,loading=null,again=false,dragging=false,busy=false,focusId=viewState.focusId||'';
  let scope=viewState.scope||'all',query='';
  const collapsed=new Set(viewState.collapsed||[]);
  const expandedState=new Map(Object.entries(viewState.expanded||{}));
  const selection=new Set();
  const say=text=>{live.textContent='';setTimeout(()=>{live.textContent=text;},30);};
  const format=()=>data?.estimate?.format||'time';
  const capabilities=()=>data?.capabilities||{plan:false,manageReleases:false,completeSprint:false};
  const containers=()=>data?.containers||[];
  const containerOf=id=>containers().find(c=>c.id===id);
  const rowOf=id=>{for(const c of containers()){const row=c.rows.find(r=>r.id===id);if(row)return {row,container:c};}return null;};
  /** Epics are open in the running sprint and closed elsewhere until the person toggles them. */
  const expanded=id=>{if(expandedState.has(id))return expandedState.get(id);const found=rowOf(id);return found?.container.kind==='sprint'&&found.container.state==='active';};

  async function load(){
    if(loading){again=true;return loading;}
    loading=(async()=>{
      try{
        const next=await adapter.containers();
        if(disposed)return;if(!validContainers(next))throw Error('Не удалось прочитать планирование.');
        data=next;errorBox.hidden=true;errorBox.innerHTML='';
        const known=new Set(containers().flatMap(c=>c.rows.map(r=>r.id)));
        for(const id of [...selection])if(!known.has(id))selection.delete(id);
        render();
      }catch(error){
        if(disposed)return;
        errorBox.hidden=false;errorBox.innerHTML=`<p class="pl-error">${esc(error.message||'Не удалось загрузить планирование.')}</p><button type="button" class="iq-btn secondary sm" data-retry>Повторить</button>`;
        if(!data)stack.innerHTML='';
      }finally{loading=null;if(again&&!disposed){again=false;void load();}}
    })();
    return loading;
  }

  function view(){
    const all=containers(),firstPlanned=all.find(c=>c.kind==='sprint'&&c.state==='planned')?.id;
    return {selection,expanded,collapsed,query,capabilities:capabilities(),format:format(),today:data.today,focusId,firstPlanned,activeExists:all.some(c=>c.kind==='sprint'&&c.state==='active')};
  }
  function render(){
    if(!data||disposed)return;
    const all=containers(),firstRun=!all.some(c=>c.kind!=='backlog');
    if(!focusId||!rowOf(focusId))focusId=all.flatMap(c=>c.rows)[0]?.id||'';
    if(scope!=='all'&&!containerOf(scope))scope='all';
    const filtered=filterPlan(all,{scope,query});
    const v={...view(),expanded:id=>filtered.ancestorIds.has(id)||expanded(id)};
    const hadFocus=root.contains(document.activeElement)&&document.activeElement.matches('[data-row]');
    root.querySelector('[data-readonly]').hidden=v.capabilities.plan;
    page.toggleAttribute('data-readonly',!v.capabilities.plan);
    root.querySelector('[data-plan-nav]').innerHTML=navigationMarkup(all,scope);
    root.querySelector('[data-create-controls]').innerHTML=v.capabilities.manageReleases?`<button type="button" class="iq-btn secondary" data-new-release>Новый релиз</button><button type="button" class="iq-btn primary" data-new-sprint>${icon('plus',18)}<span>Новый спринт</span></button>`:'';
    root.querySelector('[data-plan-count]').textContent=filtered.matches===null?'Выберите задачи для переноса или перетащите их между этапами':`Найдено: ${filtered.matches}. Суммы относятся ко всему этапу.`;
    stack.innerHTML=(firstRun&&!query?firstRunMarkup(v.capabilities):'')+filtered.containers.map(c=>cardMarkup(c,v)).join('');
    if(!filtered.containers.length)stack.innerHTML=`<div class="iq-workspace-empty"><h2>Задачи не найдены</h2><p>Попробуйте другое название или ключ задачи.</p><button type="button" class="iq-btn secondary sm" data-reset-search>Сбросить поиск</button></div>`;
    foot.innerHTML=footMarkup({capabilities:v.capabilities,completed:data.completed,firstRun});foot.hidden=!foot.innerHTML;
    // Keep drag across complete containers only: reordering a filtered subset would hide neighbours.
    if(query.trim())for(const el of stack.querySelectorAll('[data-tree-drag],[data-tree-dropzone]')){el.removeAttribute('data-tree-drag');el.removeAttribute('data-tree-dropzone');}
    const visible=[...stack.querySelectorAll('[data-row]')].filter(el=>!el.closest('[hidden]'));
    if(!visible.some(el=>el.dataset.row===focusId))focusId=visible[0]?.dataset.row||'';
    for(const el of visible)el.tabIndex=el.dataset.row===focusId?0:-1;
    viewState.scope=scope;viewState.collapsed=[...collapsed];
    renderSelection();
    viewState.expanded=Object.fromEntries(expandedState);viewState.focusId=focusId;
    if(hadFocus)focusRow(focusId);
  }
  function renderSelection(){
    const plan=capabilities().plan&&selection.size>0;selbar.hidden=!plan;
    if(!plan){selbar.innerHTML='';return;}
    const rows=[...selection].map(id=>rowOf(id)?.row).filter(Boolean);
    selbar.innerHTML=selectionMarkup(selection.size,formatSum(sumOf(rows,format()),format()));
  }
  const rowElement=id=>stack.querySelector(`[data-row="${CSS.escape(id)}"]`);
  function focusRow(id){
    focusId=id;for(const el of stack.querySelectorAll('[data-row][tabindex="0"]'))el.tabIndex=-1;
    const el=rowElement(id);if(el){el.tabIndex=0;el.focus({preventScroll:false});}
  }

  /** A planning intent previewed and committed at once; a blocker asks the person first. */
  async function apply(intent,{title='Проверить изменение'}={}){
    const operation=new PlanningOperation(adapter,project.id);
    try{
      await operation.inspect(intent);
      if(operation.state!=='ready')throw Error(operation.error||'Не удалось проверить изменение.');
      if(operation.preview.blockers.length){
        operation.destroy();
        await new Promise((resolve,reject)=>{let done=false;operationDialog({adapter,projectId:project.id,intent,title,onCommitted:()=>{done=true;},onClose:()=>done?resolve():reject(Error('Изменение не подтверждено.'))});});
      }else{
        await operation.submit();
        if(operation.state==='uncertain')await operation.recover();
        if(operation.state!=='committed')throw Error(operation.error||'Изменение не сохранено.');
      }
    }finally{operation.destroy();}
    await load();
  }
  const fail=error=>notify({tone:'danger',message:'Не удалось сохранить',description:error?.message||'Повторите попытку.'});

  /** Moves ids into a container after a root row, then offers «Отменить» and speaks the warnings. */
  async function move(ids,containerId,afterId,{withChildren=true,quiet=false}={}){
    if(busy)return null;busy=true;
    try{
      const result=await adapter.move({ids,containerId,afterId,withChildren,expectedRevision:data.revision});
      await load();
      const target=containerOf(containerId),moved=result.moved.length;
      const same=result.containers.length===1&&result.containers[0].id===containerId;
      const message=same?'Порядок изменён':`Перенесено в ${target?(target.kind==='backlog'?'бэклог':target.name):'другой список'}`;
      say(`${message}. ${moved} ${plural(moved,'задача','задачи','задач')}.`);
      if(!quiet)notify({tone:result.warnings.length?'warning':'success',message,description:result.warnings.map(w=>w.message).join(' '),
        action:{label:'Отменить',undo:true,run:()=>undo(result.undo)}});
      return result;
    }catch(error){
      if(error?.code==='PROJECTION_STALE'){await load();notify({tone:'warning',message:'План изменился',description:'Мы обновили страницу. Повторите перенос.'});}
      else fail(error);
      return null;
    }finally{busy=false;}
  }
  async function undo(restore){
    try{await adapter.move({restore});await load();say('Перенос отменён.');}
    catch(error){notify({tone:'danger',message:'Отменить не получилось',description:error?.code==='UNDO_STALE'?'После переноса план уже изменился.':error?.message||''});}
  }
  /** The root row a block lands after when it goes to the end of a container. */
  function lastRoot(container,except=new Set()){
    return container.rows.filter(row=>row.depth===0&&!except.has(row.id)).at(-1)?.id??null;
  }

  function moveMenu(anchor,ids,{withChildren=true,caption='Переместить в'}={}){
    const from=new Set(ids.map(id=>rowOf(id)?.container.id));
    const items=containers().filter(c=>!(from.size===1&&from.has(c.id))).map(c=>({value:c.id,label:c.name,
      meta:c.kind==='sprint'&&c.state==='active'?'идёт':c.kind==='sprint'?dateRange(c.start,c.end,data.today):c.kind==='release'&&c.deadline?`к ${shortDate(c.deadline,data.today)}`:''}));
    if(capabilities().manageReleases)items.push({separator:true},{value:'__sprint',label:'Новый спринт…'});
    openMenu(anchor,{caption,items,align:'center',onPick:item=>{
      if(item.value==='__sprint'){newContainer('sprint',ids);return;}
      void move(ids,item.value,lastRoot(containerOf(item.value),new Set(ids)),{withChildren}).then(result=>{if(result)clearSelection();});
    }});
  }
  const carry=id=>selection.has(id)?[...selection]:[id];
  function rowMenu(anchor,id){
    const found=rowOf(id);if(!found)return;
    const epic=found.row.kind==='epic',items=[{value:'open',label:'Открыть'}];
    if(capabilities().plan){items.push({value:'move',label:'Переместить в…'});if(epic)items.push({value:'alone',label:'Перенести только эпик…'});}
    openMenu(anchor,{items,label:found.row.title,onPick:item=>{
      if(item.value==='open')void openTask(id);
      if(item.value==='move')moveMenu(anchor,carry(id));
      if(item.value==='alone')moveMenu(anchor,[id],{withChildren:false,caption:'Только эпик — в'});
    }});
  }

  function newContainer(kind,ids=[]){
    if(!capabilities().manageReleases)return;
    void adapter.settings().catch(()=>({days:14})).then(settings=>containerDialog({kind,containers:containers(),today:data.today,days:settings?.days||14,
      onSubmit:async values=>{
        const before=new Set(containers().map(c=>c.id));
        await apply({kind:'createRelease',values});
        const created=containers().find(c=>!before.has(c.id));
        if(created&&ids.length)await move(ids,created.id,null);
        if(created)say(`${created.name}: создан.`);
      }}));
  }
  function editContainer(id){
    const c=containerOf(id);if(!c||c.kind==='backlog')return;
    containerDialog({kind:c.kind,containers:containers(),today:data.today,value:c,onSubmit:values=>apply({kind:'editRelease',groupId:c.id,values})});
  }
  function containerMenu(anchor,id){
    const c=containerOf(id);if(!c)return;
    const sprint=c.kind==='sprint',items=[{value:'edit',label:sprint?'Даты и цель…':'Срок и цель…',meta:sprint?dateRange(c.start,c.end,data.today):c.deadline?`к ${shortDate(c.deadline,data.today)}`:''}];
    if(sprint&&c.state==='active'&&capabilities().completeSprint)items.push({separator:true},{value:'complete',label:'Завершить спринт'});
    if(sprint&&c.state==='planned')items.push({separator:true},{value:'start',label:'Начать спринт'});
    if(!sprint&&c.state==='active'&&capabilities().completeSprint)items.push({separator:true},{value:'complete',label:'Завершить релиз'});
    if(!sprint&&c.state==='planned')items.push({separator:true},{value:'start',label:'Начать релиз'});
    items.push({value:'cancel',label:sprint?'Отменить спринт':'Отменить релиз',danger:true});
    openMenu(anchor,{items,label:c.name,align:'end',onPick:item=>{
      if(item.value==='edit')editContainer(id);
      if(item.value==='complete')complete(id);
      if(item.value==='start')void start(id);
      if(item.value==='cancel')cancelDialog({container:c,onSubmit:intent=>apply(intent,{title:'Отменить'})});
    }});
  }
  function complete(id){
    const c=containerOf(id);if(!c)return;
    completionDialog({container:c,containers:containers(),format:format(),today:data.today,
      onSubmit:async intent=>{await apply(intent,{title:'Завершить'});say(`${c.name}: завершён.`);notify({tone:'success',message:`${c.name}: завершён`,description:'Снимок состава сохранён в «Завершённые».'});}});
  }
  async function start(id){try{await apply({kind:'start',groupId:id});say(`${containerOf(id)?.name||'Спринт'}: начался.`);}catch(error){fail(error);}}

  function editDue(button){
    const found=rowOf(button.dataset.editDue);if(!found)return;
    const {row,container}=found;
    dueEditor(button,{value:row.due,today:data.today,sprintEnd:container.kind==='sprint'?container.end:null,
      onPick:async day=>{await apply({kind:'bulk',field:'due',value:day,taskIds:[row.id],expectedProjectionRevision:data.revision});say(day?`Срок ${shortDate(day,data.today)}.`:'Срок снят.');}});
  }
  function editEstimate(button){
    const found=rowOf(button.dataset.editEstimate);if(!found)return;
    estimateEditor(button,{value:found.row.estimate,format:format(),hoursPerDay:data.estimate.hoursPerDay,hoursPerWeek:data.estimate.hoursPerWeek,
      onSave:value=>apply({kind:'bulk',field:'estimate',value,taskIds:[found.row.id],expectedProjectionRevision:data.revision})});
  }
  function openTask(id){focusId=id;return onOpenTask?.(id,{onChanged:()=>load(),onClose:()=>focusRow(id)});}
  function toggle(id){expandedState.set(id,!expanded(id));render();focusRow(id);}
  function toggleSelection(id,{range=false}={}){
    if(!capabilities().plan)return;
    if(range&&focusId&&focusId!==id){
      const order=visibleRows().map(el=>el.dataset.row),a=order.indexOf(focusId),b=order.indexOf(id);
      if(a>=0&&b>=0)for(const rid of order.slice(Math.min(a,b),Math.max(a,b)+1))selection.add(rid);
    }else if(selection.has(id))selection.delete(id);else selection.add(id);
    focusId=id;render();focusRow(id);
    say(selection.size?`Выбрано: ${selection.size}.`:'Выделение снято.');
  }
  function clearSelection(){if(!selection.size)return;selection.clear();render();say('Выделение снято.');}

  /** Alt+↑/↓: a root row moves past its neighbour in the same part of the card (open work or done work). */
  function reorder(id,direction){
    const found=rowOf(id);if(!found||found.row.depth!==0||!capabilities().plan)return;
    const {container}=found,blocks=blocksOf(container.rows);
    const doneOf=new Map(blocks.map(block=>[block.root.id,blockDone(block)]));
    const section=blocks.map(block=>block.root.id).filter(rid=>doneOf.get(rid)===doneOf.get(id));
    const at=section.indexOf(id),neighbour=section[at+direction];if(!neighbour)return;
    const ranked=blocks.map(block=>block.root.id).filter(rid=>rid!==id);
    const afterId=direction>0?neighbour:ranked[ranked.indexOf(neighbour)-1]??null;
    void move([id],container.id,afterId,{quiet:true}).then(()=>{focusRow(id);say(direction>0?'Ниже.':'Выше.');});
  }

  const visibleRows=()=>[...stack.querySelectorAll('[data-row]')].filter(el=>!el.closest('[hidden]'));
  function onKey(event){
    const el=event.target.closest?.('[data-row]');if(!el||event.target!==el)return;
    const id=el.dataset.row,rows=visibleRows(),at=rows.indexOf(el),found=rowOf(id);
    if(query.trim()&&event.altKey)return;
    if(event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();reorder(id,event.key==='ArrowUp'?-1:1);return;}
    switch(event.key){
      case 'ArrowDown':case 'ArrowUp':{event.preventDefault();const next=rows[at+(event.key==='ArrowDown'?1:-1)];if(next){focusRow(next.dataset.row);if(event.shiftKey)toggleSelection(next.dataset.row);}break;}
      case 'Home':case 'End':event.preventDefault();focusRow((event.key==='Home'?rows[0]:rows.at(-1)).dataset.row);break;
      case 'ArrowRight':if(found?.row.kind==='epic'){event.preventDefault();if(!expanded(id))toggle(id);else{const next=rows[at+1];if(next&&rowOf(next.dataset.row)?.row.parentId===id)focusRow(next.dataset.row);}}break;
      case 'ArrowLeft':event.preventDefault();if(found?.row.kind==='epic'&&expanded(id))toggle(id);else if(found?.row.depth>0&&rowElement(found.row.parentId))focusRow(found.row.parentId);break;
      case ' ':event.preventDefault();toggleSelection(id);break;
      case 'Enter':event.preventDefault();void openTask(id);break;
      case 'Escape':if(selection.size){event.preventDefault();clearSelection();}break;
      case 'm':case 'M':case 'ь':case 'Ь':if(capabilities().plan&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();moveMenu(el,carry(id));}break;
      case 'ContextMenu':event.preventDefault();rowMenu(el,id);break;
      case 'F10':if(event.shiftKey){event.preventDefault();rowMenu(el,id);}break;
      default:break;
    }
  }
  /** «+ Задача» creates inside the epic that holds the focus in this card, otherwise at the card's top level. */
  function epicAround(containerId){
    const found=rowOf(focusId);if(!found||found.container.id!==containerId)return null;
    if(found.row.kind==='epic')return found.row.id;
    return found.row.parentId&&found.container.rows.some(r=>r.id===found.row.parentId)?found.row.parentId:null;
  }
  function onClick(event){
    const t=event.target;
    const scopeButton=t.closest('[data-plan-scope]');
    if(scopeButton){scope=scopeButton.dataset.planScope;render();root.querySelector(`[data-plan-scope="${CSS.escape(scope)}"]`)?.focus();return;}
    if(t.closest('[data-reset-search]')){query='';root.querySelector('[data-plan-search]').value='';render();root.querySelector('[data-plan-search]').focus();return;}
    const collapse=t.closest('[data-collapse]');
    if(collapse){if(query.trim()){say('Очистите поиск, чтобы свернуть контейнер.');return;}const id=collapse.dataset.collapse;if(collapsed.has(id))collapsed.delete(id);else collapsed.add(id);render();root.querySelector(`[data-collapse="${CSS.escape(id)}"]`)?.focus();return;}
    const rowMore=t.closest('[data-row-more]');if(rowMore){rowMenu(rowMore,rowMore.dataset.rowMore);return;}
    if(t.closest('[data-retry]')){void load();return;}
    const toggleButton=t.closest('[data-toggle]');if(toggleButton){toggle(toggleButton.dataset.toggle);return;}
    const check=t.closest('[data-select]');if(check){toggleSelection(check.dataset.select,{range:event.shiftKey});return;}
    const due=t.closest('[data-edit-due]');if(due){focusId=due.dataset.editDue;editDue(due);return;}
    const estimate=t.closest('[data-edit-estimate]');if(estimate){focusId=estimate.dataset.editEstimate;editEstimate(estimate);return;}
    const action=t.closest('[data-complete],[data-start],[data-more],[data-dates],[data-add],[data-new-sprint],[data-new-release],[data-completed],[data-move-selection],[data-clear-selection]');
    if(action){
      const d=action.dataset;
      if(d.complete)complete(d.complete);
      else if(d.start)void start(d.start);
      else if(d.more)containerMenu(action,d.more);
      else if(d.dates)editContainer(d.dates);
      else if(d.add!==undefined)onCreateTask?.({groupId:d.add,parentId:epicAround(d.add),onChanged:()=>load()});
      else if('newSprint' in d)newContainer('sprint');
      else if('newRelease' in d)newContainer('release');
      else if('completed' in d)void adapter.releases().then(result=>completedDialog({releases:result.items||[],today:data.today})).catch(fail);
      else if('moveSelection' in d)moveMenu(action,[...selection]);
      else if('clearSelection' in d)clearSelection();
      return;
    }
    const row=t.closest('[data-row]');if(!row)return;
    if(event.metaKey||event.ctrlKey||event.shiftKey){toggleSelection(row.dataset.row,{range:event.shiftKey});return;}
    void openTask(row.dataset.row);
  }
  function onContext(event){const row=event.target.closest('[data-row]');if(!row)return;event.preventDefault();focusId=row.dataset.row;rowMenu(row,row.dataset.row);}
  function onFocus(event){const row=event.target.closest?.('[data-row]');if(row&&event.target===row)focusId=row.dataset.row;}
  const searchInput=root.querySelector('[data-plan-search]');
  const onSearch=()=>{query=searchInput.value;render();};
  searchInput.addEventListener('input',onSearch);
  root.addEventListener('click',onClick);root.addEventListener('keydown',onKey);root.addEventListener('contextmenu',onContext);root.addEventListener('focusin',onFocus);

  const drag=bindTreeDrag({root:page,rowSelector:'[data-tree-drag]',containerSelector:'[data-tree-dropzone]',
    ignore:'input,textarea,select,[contenteditable],button,[data-tree-nodrag],[data-select],[data-toggle]',
    canDrag:()=>capabilities().plan&&!busy,
    items:row=>dragIds(row.dataset.treeDrag),
    preview:(row,ids)=>preview(row.dataset.treeDrag,ids),
    canDrop:({ids,containerId})=>{previewSum(ids,containerId);return true;},
    onState:active=>{dragging=active;if(active)closePopover();else previewSum([],null);},
    label:ids=>ids.length===1?(rowOf(ids[0])?.row.title||'задача'):`${ids.length} ${plural(ids.length,'задача','задачи','задач')}`,
    onDrop:async({ids,containerId,afterId})=>{const result=await move(ids,containerId,afterId);if(result)clearSelection();}
  });
  /** While a block hovers a card, that card's head already counts it; leaving restores the sum. */
  let previewed=null;
  function previewSum(ids,containerId){
    if(previewed?.id===containerId)return;
    if(previewed){const slot=stack.querySelector(`[data-card="${CSS.escape(previewed.id)}"] [data-sum]`);if(slot)slot.innerHTML=previewed.html;previewed=null;}
    const c=containerId&&containerOf(containerId);if(!c)return;
    const moving=ids.map(id=>rowOf(id)).filter(found=>found&&found.container.id!==containerId&&found.row.kind!=='epic').map(found=>found.row);
    const slot=stack.querySelector(`[data-card="${CSS.escape(containerId)}"] [data-sum]`);if(!slot||!moving.length)return;
    const open=moving.filter(r=>!r.done),hours=rows=>rows.reduce((t,r)=>t+(r.estimateMismatch?0:r.estimateHours||0),0),points=rows=>rows.reduce((t,r)=>t+(r.estimateMismatch?0:r.estimatePoints||0),0);
    const s=c.summary,next={...s,total:s.total+moving.length,done:s.done+moving.length-open.length,open:s.open+open.length,estimateHours:s.estimateHours+hours(moving),remainingHours:s.remainingHours+hours(open),
      estimatePoints:s.estimatePoints+points(moving),remainingPoints:s.remainingPoints+points(open),noDue:s.noDue+(c.kind==='release'?open.filter(r=>!r.due).length:0)};
    previewed={id:containerId,html:slot.innerHTML};slot.innerHTML=sumMarkup({...c,summary:next},format());
  }
  /** What a drag carries: the selection, or the row; an epic takes the subtasks below it in this card along. */
  function dragIds(id){
    const ids=carry(id),found=rowOf(id);
    if(ids.length!==1||found?.row.kind!=='epic')return ids;
    const rows=found.container.rows,at=rows.indexOf(found.row),below=[];
    for(const r of rows.slice(at+1)){if(r.depth<=found.row.depth)break;below.push(r.id);}
    return [id,...below];
  }
  /** The ghost: several rows with «N задач · сумма», an epic with the subtasks that go along, or one row. */
  function preview(id,ids){
    const found=rowOf(id);if(!found)return null;
    const {container,row}=found,v=view();
    if(ids.length>1&&selection.has(id)){
      const rows=ids.map(rid=>rowOf(rid)?.row).filter(Boolean),sum=formatSum(sumOf(rows,format()),format());
      return dragPreview(rows.slice(0,5).map(r=>({...r,depth:0})),container,v,`${ids.length} ${plural(ids.length,'задача','задачи','задач')}${sum?` · ${sum}`:''}`);
    }
    if(row.kind==='epic'){
      const block=blocksOf(container.rows).find(b=>b.rows.includes(row)),below=[];
      for(const r of block.rows.slice(block.rows.indexOf(row)+1)){if(r.depth<=row.depth)break;below.push(r);}
      const kids=below.filter(r=>r.kind!=='epic'),sum=formatSum(sumOf(kids,format()),format());
      const badge=kids.length?`Эпик + ${kids.length} ${plural(kids.length,'подзадача','подзадачи','подзадач')}${sum?` · ${sum}`:''}`:'Эпик';
      return dragPreview([row,...below.slice(0,5)].map(r=>({...r,depth:r.depth-row.depth})),container,{...v,expanded:()=>true},badge);
    }
    return dragPreview([{...row,depth:0}],container,v,'');
  }

  const unsubscribe=adapter.subscribe?.(()=>{if(!dragging&&!busy)void load();})||(()=>{});
  await load();
  return {
    reload:()=>load(),
    readyToLeave:()=>!busy,
    destroy(){disposed=true;searchInput.removeEventListener('input',onSearch);drag.destroy();closePopover();unsubscribe();root.removeEventListener('click',onClick);root.removeEventListener('keydown',onKey);root.removeEventListener('contextmenu',onContext);root.removeEventListener('focusin',onFocus);root.innerHTML='';}
  };
}
