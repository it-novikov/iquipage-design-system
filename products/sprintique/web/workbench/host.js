// The Workbench section (docs/adr W6, design-v2 §11): the views Обзор | Список | Неделя, the summary line, the project
// filter in the URL, and the canonical task drawer `/workbench/tasks/:projectId/:taskId` with the return of view,
// filter, scroll and focus. It mounts inside the app shell like any other section: the shell's navigation is its top
// bar, so search, notifications, settings, theme and the profile are the shell's.
import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {dialog} from '../../ui/src/ui.js';
import {openTaskDialog} from '../../ui/src/board/task-dialog.js';
import {WorkbenchApi} from './api.js';
import {mountDashboard} from './dashboard.js';
import {mountWeek} from './week.js';
import {mountPersonalPanel} from './personal-panel.js';
import {VIEWS,countLabel,parseRoute,readFilter,viewPath,writeFilter} from './model.js';

/** The person's Workbench settings as last read or saved in this page: a return to the Workbench shows them at once and
 *  reads them again alongside the snapshot. */
let knownPreferences=null;
/** The element that scrolls the section: the shell's view, or the document when mounted on its own. */
function scrollerOf(element){
  for(let node=element;node&&node!==document.body;node=node.parentElement)if(/(auto|scroll)/.test(getComputedStyle(node).overflowY))return node;
  return document.scrollingElement;
}
export async function mountWorkbench(root,{repository,session:initialSession,planning,onOpenProject}){
  let session=initialSession;
  const api=new WorkbenchApi(repository.client);
  const route0=parseRoute(location.pathname)||{view:'overview',task:null};
  let view=route0.view||'overview',filter=readFilter(location.search),content=null,drawer=null,opening=false,closed=false,origin=null;
  let preferences={timezone:null,layout:{currentForm:'lanes'},revision:0};
  const projects=new Map(session.projects.map(p=>[p.id,p]));
  const scroller=()=>scrollerOf(root);
  root.innerHTML=`<div class="dsk-shell"><div class="dsk-page iq-workspace-page">
<header class="sq-page-heading dsk-heading"><h1 tabindex="-1">Рабочий стол</h1>
<div class="sq-page-tools"><div class="iq-segmented dsk-views" role="group" aria-label="Вид рабочего стола">${VIEWS.map(v=>`<button type="button" data-view="${v.key}" aria-label="${esc(v.label)}">${icon(v.icon,16)}<span>${esc(v.label)}</span></button>`).join('')}</div>
<button type="button" class="iq-btn primary" data-create-task aria-label="Создать задачу">${icon('plus',18)}<span>Новая задача</span></button></div></header>
<div class="iq-workspace" data-workspace><nav class="iq-workspace-nav" aria-label="Очереди рабочего стола" data-summary></nav><div class="iq-workspace-body"><div class="dsk-strip iq-workspace-toolbar">
<div class="dsk-strip-end"><button type="button" class="iq-btn ghost sm" data-filter aria-haspopup="dialog">${icon('folder',16)}<span data-filter-label>Проекты: все</span>${icon('down',14)}</button>
<span data-updated></span>${ui.ib('refresh','Обновить рабочий стол','ghost sm','data-refresh')}</div></div>
<div class="dsk-banner" data-offline hidden>${icon('warning',16)}<p>Нет соединения. Показаны последние загруженные данные; изменения не сохраняются без ответа сервера.</p></div>
<div data-content></div><p class="sr-only" role="status" aria-live="polite" data-live></p></div></div></div></div>`;
  const live=root.querySelector('[data-live]');
  const announce=text=>{live.textContent='';requestAnimationFrame(()=>{live.textContent=text;});};

  const url=(v=view,task=null,extra='')=>(task?`/workbench/tasks/${encodeURIComponent(task.projectId)}/${encodeURIComponent(task.taskId)}`:viewPath(v))+writeFilter(filter)+extra;
  function renderChrome(){
    for(const b of root.querySelectorAll('[data-view]'))if(b.closest('.dsk-views'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
    const chosen=(filter||[]).map(id=>projects.get(id)).filter(Boolean);
    root.querySelector('[data-filter-label]').textContent=chosen.length===1?`Проект: ${chosen[0].name}`:chosen.length?`Проекты: ${chosen.length}`:'Проекты: все';
    root.querySelector('[data-filter]').setAttribute('aria-label',`Проекты в выдаче: ${chosen.length?chosen.map(p=>p.name).join(', '):'все'}`);
    root.querySelector('[data-workspace]').dataset.navigation=view==='week'?'hidden':'visible';
  }
  function setSummary(items){
    const nav=root.querySelector('[data-summary]');
    if(!items){nav.innerHTML='<span class="iq-skeleton iq-skeleton-line dsk-summary-skeleton"></span>';return;}
    nav.innerHTML=items.map(item=>item.sep?'<span class="iq-workspace-nav-separator" aria-hidden="true"></span>'
      :`<a href="${item.href}" ${item.view?`data-go="${item.view}"`:'data-anchor'} ${item.current?'aria-current="true"':''}>${icon(item.glyph||'list',16)}<span class="iq-workspace-nav-label">${esc(item.label)}${item.note?`<span class="iq-workspace-nav-note">${esc(item.note)}</span>`:''}</span><span class="iq-workspace-nav-count">${item.count==null?'–':esc(countLabel(item.count,item.capped))}</span></a>`).join('');
  }
  const setUpdated=at=>{root.querySelector('[data-updated]').textContent=at?`Обновлено в ${at.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`:'';};
  const prefs=()=>preferences;
  /** Saves a setting; true when it is saved. A failure is said, never swallowed (review R4 F16). */
  async function savePrefs(fields){
    try{preferences=knownPreferences=await api.savePreferences(preferences.revision,fields);return true;}
    catch(error){
      if(error.code==='CONFLICT'){
        try{preferences=await api.preferences();preferences=knownPreferences=await api.savePreferences(preferences.revision,fields);return true;}catch(again){error=again;}
      }
      notify({tone:'danger',message:'Настройку не удалось сохранить',description:error.message||'Сервер не ответил.'});return false;
    }
  }
  function mountContent(){
    content?.destroy();const host=root.querySelector('[data-content]');
    if(!session.projects.length){host.innerHTML=`<div class="dsk-first-run">${icon('users',20)}<div><h2>Рабочий стол собирается из ваших отношений к задачам</h2><p>Запросы к вам лично, задачи, которые вам назначены или за которыми вы наблюдаете, и их изменения. Проектов пока нет.</p>${ui.btn('Открыть проекты','secondary sm','folder','data-projects')}</div></div>`;content=null;setSummary([]);return;}
    const common={api,repository,projects,filter:()=>filter,prefs,savePrefs,announce,setUpdated,scroller,
      openTask:(row,options={})=>void openTask({projectId:row.projectId,taskId:row.taskId},{key:row.key,...options}),
      openProject:(projectId,taskId)=>void leave(()=>onOpenProject(projectId,taskId)),onNavigate:(v,href)=>setView(v,href)};
    if(view==='week'){setSummary(null);content=mountWeek(host,{...common,horizon:new URLSearchParams(location.search).get('horizon')==='today'?'today':'7d'});}
    else content=mountDashboard(host,{...common,mode:view==='list'?'list':'overview',setSummary});
  }
  function setView(next,href=null){
    const target=href?new URL(href,location.origin):null;
    if(next===view&&!target?.hash){return;}
    view=next;
    const extra=target?(target.searchParams.get('horizon')?`${filter?'&':'?'}horizon=${target.searchParams.get('horizon')}`:'')+target.hash:'';
    history.pushState({workbench:true},'',url(view,null,extra));
    renderChrome();mountContent();root.querySelector('h1').focus({preventScroll:true});announce(VIEWS.find(v=>v.key===view).label);
    if(target?.hash&&view!=='week')requestAnimationFrame(()=>root.querySelector(target.hash)?.scrollIntoView());
  }
  function setFilter(next){filter=next?.length?[...new Set(next)].sort():null;history.replaceState({workbench:true},'',url());renderChrome();mountContent();}
  async function leave(then){if(await closeDrawer())then();}

  // ---- the drawer: one task in its own project's context, canonical by (projectId, taskId) ----
  async function openTask(target,{key=null,fromRoute=false,answer=false}={}){
    if(opening||closed)return;
    const project=projects.get(target.projectId);
    if(!project){notify({tone:'warning',message:'Задача недоступна'});if(fromRoute)history.replaceState({workbench:true},'',url());return;}
    if(drawer){const ok=await drawer.taskController.close();if(!ok)return;}
    opening=true;
    const rowKey=key||`${target.projectId}:${target.taskId}`;
    // Where focus returns: the row, else the row now at its place in the same list, else the list's heading.
    const from=document.activeElement?.closest?.('[data-row]'),list=from?.closest('[data-list]');
    origin={key:rowKey,scroll:scroller().scrollTop,focus:document.activeElement,
      section:list?.closest('section[id]')?.id||null,index:list?[...list.querySelectorAll(':scope > [data-row]')].indexOf(from):-1};
    try{
      const task=await repository.read('tasks',target.taskId,project.id).catch(()=>null);
      if(!task||task.projectId!==project.id)throw Object.assign(Error('Задача недоступна'),{status:404});
      if(!fromRoute)history.pushState({workbench:true,drawer:true},'',url(view,target));
      // Parent, release and plan changes are planning commands of this task's project.
      const hooks=planning?.(project.id);repository.confirmPlanningChange=hooks?.confirm;repository.applyPlanningChange=hooks?.apply;
      const features=new Set(session.features||[]);
      const parts={personal:features.has('workbench_personal_state'),requests:features.has('workbench_requests'),waiting:features.has('workbench_waiting')&&features.has('workbench_personal_state')};
      drawer=await openTaskDialog(task,{repository,project,tasks:[],canEdit:project.role!=='reader',canManage:project.role==='admin',attachmentAdapter:repository.attachmentAdapter,
        onOpenTask:id=>void openTask({projectId:project.id,taskId:id},{key:origin?.key}),
        onSaved:()=>void content?.reload?.({silent:true}),
        supplement:({root:section,actions})=>{
          // «Открыть проект» is navigation, a separate action beside the drawer's own.
          const open=document.createElement('button');open.type='button';open.className='iq-btn ghost sm dsk-open-project';
          open.innerHTML=`${icon('upRight',16)}<span>Открыть проект</span>`;open.setAttribute('aria-label',`Открыть проект ${project.name}`);
          actions?.prepend(open);open.addEventListener('click',()=>void leave(()=>onOpenProject(project.id,task.id)));
          return mountPersonalPanel(section,{api,projectId:project.id,taskId:task.id,actorId:session.principal.id,actions,parts,answer,
            onChanged:()=>void content?.reload?.({silent:true})});
        }});
      drawer.addEventListener('iq-close',onDrawerClosed,{once:true});
    }catch(cause){
      notify({tone:'warning',message:'Задача недоступна',description:'Её нет или у вас нет доступа.'});
      if(fromRoute)history.replaceState({workbench:true},'',url());
      if(cause.status!==404)console.warn(cause);
    }finally{opening=false;}
  }
  async function closeDrawer(){if(!drawer)return true;return drawer.taskController.close();}
  function onDrawerClosed(){
    drawer=null;const back=origin;origin=null;
    if(parseRoute(location.pathname)?.task){if(history.state?.drawer)history.back();else history.replaceState({workbench:true},'',url());}
    if(!back)return;
    scroller().scrollTop=back.scroll;
    // Focus returns to the row it came from, or its successor when the row is gone.
    if(content?.focusRow?.(back.key))return;
    if(back.focus?.isConnected){back.focus.focus({preventScroll:true});return;}
    content?.focusAt?.(back.section,back.index);
  }

  function createTask(){
    const writable=session.projects.filter(p=>p.role!=='reader');
    if(!writable.length){notify({tone:'warning',message:'Нет проектов, где вы можете создавать задачи'});return;}
    const preset=filter?.length===1&&writable.some(p=>p.id===filter[0])?filter[0]:writable.length===1?writable[0].id:'';
    dialog({title:'Новая задача',description:'Задача создаётся в проекте. Выберите, в каком.',
      body:`<iq-select name="projectId" label="Проект" searchable value="${esc(preset)}" placeholder="Выберите проект">${writable.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.workspaceName?` — ${esc(p.workspaceName)}`:''}</option>`).join('')}</iq-select>`,
      submitLabel:'Продолжить',onSubmit:async(_values,form)=>{
        const id=form.querySelector('iq-select[name=projectId]').value;if(!id)throw Error('Выберите проект, в котором будет задача.');
        const project=projects.get(id);
        setTimeout(()=>void openTaskDialog(null,{repository,project,tasks:[],canEdit:true,canManage:project.role==='admin',attachmentAdapter:repository.attachmentAdapter,
          onSaved:saved=>{notify({tone:'success',message:`Задача ${saved.displayId} создана в проекте ${project.name}`});void content?.reload?.();}}),0);
      }});
  }
  function filterDialog(){
    const chosen=new Set(filter||[]);
    const list=session.projects.map(p=>`<label class="iq-check"><input type="checkbox" name="project" value="${esc(p.id)}" ${chosen.has(p.id)?'checked':''}><span class="iq-check-box">${icon('check',14)}</span><span>${esc(p.name)}${p.workspaceName?` <small class="dsk-hint">${esc(p.workspaceName)}</small>`:''}</span></label>`).join('');
    dialog({title:'Проекты в выдаче',description:'Фильтр сужает рабочий стол и не открывает проект. Ничего не выбрано — все доступные проекты.',
      body:`<fieldset class="dsk-check-list"><legend class="sr-only">Проекты</legend>${list}</fieldset>`,submitLabel:'Применить',
      onSubmit:async(_values,form)=>{setFilter([...form.querySelectorAll('input[name=project]:checked')].map(i=>i.value));}});
  }

  const events=new AbortController();
  root.addEventListener('click',event=>{
    if(event.target.closest('button[data-projects]')){void leave(()=>onOpenProject(null));return;}
    const go=event.target.closest('a[data-go]');
    if(go){event.preventDefault();setView(go.dataset.go,go.getAttribute('href'));return;}
    const anchor=event.target.closest('a[data-anchor]');
    if(anchor){event.preventDefault();const target=content?.reveal?.(anchor.getAttribute('href').slice(1))||root.querySelector(anchor.getAttribute('href'));if(target){target.scrollIntoView({block:'start'});const row=[...target.querySelectorAll('[data-row]')].find(el=>!el.closest('[hidden]'));(row||target.querySelector('h2,h3'))?.focus({preventScroll:true});}return;}
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.view&&button.closest('.dsk-views'))setView(button.dataset.view);
    else if(button.hasAttribute('data-filter'))filterDialog();
    else if(button.hasAttribute('data-refresh'))void content?.reload?.().then(()=>announce('Рабочий стол обновлён'));
    else if(button.hasAttribute('data-create-task'))createTask();
  },{signal:events.signal});
  const online=()=>{root.querySelector('[data-offline]').hidden=navigator.onLine;};
  window.addEventListener('online',online,{signal:events.signal});window.addEventListener('offline',online,{signal:events.signal});online();

  // /workbench/board is not a view of v1: the address is corrected, the overview shown.
  if(/^\/workbench\/board\/?$/.test(location.pathname))history.replaceState({workbench:true},'',url('overview'));
  if(knownPreferences){
    preferences=knownPreferences;
    // A newer revision from elsewhere (another tab or device) replaces them; the views follow when they differ.
    void api.preferences().then(fresh=>{
      if(closed||!fresh||!(fresh.revision>preferences.revision))return;
      const changed=fresh.timezone!==preferences.timezone||JSON.stringify(fresh.layout)!==JSON.stringify(preferences.layout);
      preferences=knownPreferences=fresh;if(changed)mountContent();
    }).catch(()=>{});
  }else{try{preferences=knownPreferences=await api.preferences();}catch{/* defaults: lanes, no zone */}}
  renderChrome();setSummary(null);mountContent();
  if(route0.task)await openTask(route0.task,{fromRoute:true});
  return {
    /** Back/forward inside the Workbench: the view, the filter and the drawer follow the URL. */
    async navigate(){
      const next=parseRoute(location.pathname);if(!next)return false;
      const nextFilter=readFilter(location.search);
      if(!next.task&&drawer)await closeDrawer();
      const nextView=next.view||view;
      if(nextView!==view||String(nextFilter)!==String(filter)){view=nextView;filter=nextFilter;renderChrome();mountContent();}
      if(next.task&&!drawer)await openTask(next.task,{fromRoute:true});
      return true;
    },
    async readyToLeave(){return closeDrawer();},
    /** The shell asks before it leaves the section: an open drawer settles first, like a task on the board. */
    closeTask:()=>closeDrawer(),
    destroy(){closed=true;events.abort();content?.destroy();drawer?.close?.(true);root.replaceChildren();},
  };
}
