import {showAccessNotice} from './access-notice.js';
import {mountSignIn,inspectInvitation} from './sign-in.js';
import {appearance} from './appearance.js';
import '@iquipage/web/styles.css';
import '../ui/src/maps.css';
import '../ui/src/board/board.css';
import '../ui/shell.css';
import './shell.css';
import '../ui/planning/src/planning.css';
import '../ui/finance/src/finance.css';
import {registerCore,ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {mountTaskBoard} from '../ui/src/board/board.js';
import {parseTaskRoute} from '../ui/src/board/task-route.js';
import {dialog,input} from '../ui/src/ui.js';
import {ProductRepository} from './repository.js';
import {SprintiqueClient,ApiError} from '../client/api.ts';
import {trackedFetch,installFeedback,placeActivityLine,failed,track} from './feedback.js';
import {PlanningAdapter} from './planning-adapter.js';
import {mountPlanningHost,confirmPlanningChange,applyPlanningChange,recoverPlanningAttempt} from './planning-host.js';
import {createInRelease} from './release-scope.js';
import {openSearch} from './search.js';
import {acceptPendingInvitation} from './members.js';
import {invitationFlow} from './invitation-flow.js';
import {can,accessSignature,mayCreateProjects} from './permissions.js';
import {sectionRouteHash,retainedRouteHash} from './section-route.js';
import {keepAuthorization,resumeAuthorization,mountConsent} from './consent.js';
import {loadingMarkup,sectionLoadingShape} from '../ui/src/loading.js';
import {mountProjectNavigation} from '../ui/planning/src/project-navigation.js';
import {mountWorkbench} from './workbench/host.js';
import {mountNotificationBell} from './notifications.js';
import '../ui/planning/src/navigation.css';
import './workbench/workbench.css';
registerCore();
/** Ends the boot sequence without an error: the page is already what it should be. */
const STOP=Symbol('stop');
const root=document.querySelector('#app'),repository=new ProductRepository(new SprintiqueClient(trackedFetch));
let board,session,currentProject,planningAdapter,viewMode='tasks',navigating=false;
// The Workbench (docs/adr W6): served when the server enables it; its link shows for everyone with workbench_mvp.
// It is a section of the shell like the board: the switchers keep the last project, which the other sections open.
const featureOn=name=>!!session?.features?.includes(name);
const workbenchOn=()=>featureOn('workbench_read_internal');
const isWorkbenchPath=()=>location.pathname==='/workbench'||location.pathname.startsWith('/workbench/');
const viewStates=new Map();
async function refreshHeader(){
  session=await repository.initialize();const updated=session.projects.find(p=>p.id===currentProject.id);if(!updated)return;
  Object.assign(currentProject,updated);
  nav?.update(context(updated));nav?.setProfile?.(profileOf(session));
}
// ---- Product shell (UX R3 navigation) ----
let nav=null;
function applyTheme(theme){appearance().update({theme});}
appearance();
window.addEventListener('sprintique-appearance-change',()=>nav?.setTheme(document.documentElement.dataset.theme));
const context=project=>({id:project.id,workspaceId:project.workspaceId,workspaceName:project.workspaceName,projectName:project.name});
const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'Я';
const profileOf=value=>({id:value.principal.id,name:value.principal.name,initials:initials(value.principal.name),image:repository.client.avatarUrl?.(value.principal.id,value.principal.avatarRevision)||null});
function ensureShell(project,mode){
  if(!nav||!root.querySelector('[data-product-nav]')?.isConnected){
    nav?.destroy();
    root.innerHTML='<div class="demo-shell"><header data-product-nav></header><main class="platform-main"><section id="host-view" data-section="tasks"></section></main></div>';
    nav=mountProjectNavigation(root.querySelector('[data-product-nav]'),{
      current:context(project),profile:profileOf(session),
      catalog:()=>session.projects.map(p=>({id:p.id,name:p.name,workspaceId:p.workspaceId,workspaceName:p.workspaceName})),
      projects:async({query='',signal})=>{signal?.throwIfAborted();const q=String(query).toLocaleLowerCase('ru');
        return {options:session.projects.filter(p=>(p.workspaceName+' '+p.name).toLocaleLowerCase('ru').includes(q)).map(p=>({value:p.id,label:p.name,description:p.workspaceName})),nextCursor:null};},
      // The Workbench spans every project: choosing one there opens its board, as the old «Проекты» link did.
      onSwitch:async id=>{const shown=await showProject(id,viewMode==='workbench'?'tasks':viewMode);return shown===false?false:context(currentProject);},
      onAccount:()=>openSettings('#settings/account'),
      onTeam:()=>openSettings('#settings/members'),
      onSignOut:()=>void(async()=>{if(board&&!await board.closeTask())return;await repository.client.request('/logout','POST');location.reload();})().catch(report),
      onTheme:()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'),
      onSearch:search,onCreateProject:creatable===null||creatable.length?()=>void onboard(currentProject?.workspaceId).catch(report):undefined,onCreateWorkspace:createWorkspace,
      // Its tab shows for everyone with workbench_mvp, and to whoever has the Workbench open by its address.
      agentWork:repository.capabilities.agentWork,
      workbench:workbenchOn()&&(featureOn('workbench_mvp')||isWorkbenchPath()),
      notifications:slot=>mountNotificationBell(slot,{client:repository.client,onOpen:item=>openNotification(item).catch(report),onSettings:()=>openSettings('#settings/notifications')})
    });
    nav.setTheme(document.documentElement.dataset.theme);
    // Long requests show as a thin line under the top bar (action feedback, DS vnext.35).
    placeActivityLine(root.querySelector('[data-product-nav]'));
  }else nav.update(context(project));
  nav.setRoute(mode);
}
/** A notification opens its task in its project: the board of that project, then the drawer. */
async function openNotification(item){
  const project=session.projects.find(p=>p.id===item.project.id);
  if(!project){notify({tone:'warning',message:'Проект недоступен',description:'Доступ к проекту этой задачи закрыт.'});return;}
  if(board&&!await board.closeTask())return;
  if(project.id!==currentProject?.id||viewMode!=='tasks'||!board?.openTask){
    history.replaceState(null,'','#tasks');
    if(!await showProject(project.id,'tasks'))return;
  }
  await board?.openTask?.(item.task.id);
}
function createWorkspace(){
  dialog({title:'Создать пространство',body:input('name','Название','',{required:true,maxlength:100}),submitLabel:'Создать',onSubmit:async values=>{
    const space=await repository.client.request('/workspaces','POST',{name:values.get('name')});await onboard(space.id);
  }});
}
/** Sign-in offers only the ways in the server actually has; an unconfigured provider is never offered. */
async function renderSignIn(){
  const none={email:false,google:false,apple:false,devLogin:false};
  const [methods,invitation]=await Promise.all([fetch('/api/v1/auth/methods').then(r=>r.ok?r.json():none).catch(()=>none),inspectInvitation()]);
  mountSignIn(root,methods,invitation);
}
// The last opened project reopens after sign-in; a project link in the URL still wins.
const LAST_PROJECT_KEY='sprintique.last-project:';
function lastProject(){try{return localStorage.getItem(LAST_PROJECT_KEY+session.principal.id)||undefined;}catch{return undefined;}}
// Failures appear next to the pressed button with retry, otherwise in a 3.5 s toast; hover or focus pauses it.
function report(error){failed(error);}
// The action system (DS vnext.35): pending buttons, the line under the top bar, slow and offline notices. Back online,
// the open project reads again; a request that failed unseen is still reported where it was pressed.
installFeedback({onOnline:()=>{if(currentProject)repository.refreshAll(currentProject.id);}});
window.addEventListener('unhandledrejection',event=>{if(event.reason instanceof ApiError){event.preventDefault();failed(event.reason);}});
/** Workspaces where the person may create a project now (mayCreateProjects); a member's answer needs their access. */
async function creatableWorkspaces(){
  const client=repository.client,all=await client.request('/workspaces');
  const allowed=await Promise.all(all.map(async w=>mayCreateProjects(w,w.role==='member'?await client.request('/workspaces/'+encodeURIComponent(w.id)+'/access').catch(()=>null):null)));
  return all.filter((_,i)=>allowed[i]);
}
/** «Новый проект» appears in the navigation only where it can succeed (unknown: shown, the server decides); once per load.
 *  It is read alongside the first project's data and awaited only where the navigation is built. */
let creatable=null,creatableReady=Promise.resolve();
async function onboard(selectedWorkspaceId){
  // Projects are created where the person may: projects.create, or a members' workspace whose rule lets members create.
  const workspaces=await creatableWorkspaces();
  if(selectedWorkspaceId&&!workspaces.length)return dialog({title:'Нет доступных проектов',description:'Администратор пространства может создать проект и пригласить вас. Существующие проекты появятся после предоставления доступа.'});
  if(selectedWorkspaceId)workspaces.sort((a,b)=>(b.id===selectedWorkspaceId)-(a.id===selectedWorkspaceId));
  const form=input('name','Название проекта','',{required:true,maxlength:100})+input('slug','Адрес проекта','',{required:true,maxlength:48,placeholder:'my-product'})+input('key','Префикс задач','',{required:true,maxlength:10,placeholder:'SPR'})+
    (workspaces.length?`<iq-select name="workspaceId" label="Пространство" value="${esc(workspaces[0].id)}">${workspaces.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</iq-select>`:input('workspace','Название пространства',''));
  dialog({title:'Создать проект',body:form,submitLabel:'Создать',onSubmit:async values=>{
    let workspaceId=values.get('workspaceId');
    if(!workspaceId)workspaceId=(await repository.client.request('/workspaces','POST',{name:values.get('workspace')})).id;
    const project=await repository.client.request('/projects','POST',{workspaceId,name:values.get('name'),slug:values.get('slug'),key:values.get('key')});
    session=await repository.initialize();
    // A new workspace may let the person create projects where they could not: the navigation is built again.
    creatable=await creatableWorkspaces().catch(()=>null);nav?.destroy();nav=null;
    if(isWorkbenchPath())history.replaceState(history.state,'','#tasks');else location.hash='#tasks';
    await showProject(project.id,'tasks');
  }});
}
/** The project whose live stream is open, and the rights it was opened with: switching sections keeps it open. */
let watching=null;
function stopWatching(){repository.stopWatch?.();watching=null;}
/** Section code by route, fetched when its link is pointed at or focused, so a first visit after a release does not
 *  wait for the download; the section's own import then finds it ready. */
const SECTION_MODULES={planning:()=>import('../ui/planning/src/index.js'),maps:()=>import('./maps-host.js'),finance:()=>import('../ui/finance/src/index.js'),settings:()=>import('./settings.js'),agents:()=>import('./agents-directory.js'),wiki:()=>import('./wiki.js')};
const prefetchedSections=new Set();
function prefetchSection(mode){
  const load=SECTION_MODULES[mode];if(!load||prefetchedSections.has(mode))return;
  prefetchedSections.add(mode);load().catch(()=>prefetchedSections.delete(mode));
}
const prefetchLink=event=>{const link=event.target.closest?.('[data-section-link]');if(link)prefetchSection(link.dataset.sectionLink);};
root.addEventListener('pointerover',prefetchLink);root.addEventListener('focusin',prefetchLink);root.addEventListener('touchstart',prefetchLink,{passive:true});
/** What the project's live stream reports: changed rights ask for a refresh, lost access closes the project. */
function onStreamChange(change){
  if(change?.roleChanged){
    showAccessNotice(root,()=>{void(async()=>{if(board&&!await board.closeTask())return;session=await repository.initialize();await showProject(currentProject.id,viewMode);root.querySelector('[data-access-change]')?.remove();})().catch(report);});
    return;
  }
  watching=null;
  // The Workbench spans every project: losing one only moves the switchers to a project still open to the person.
  if(viewMode==='workbench'&&board){void(async()=>{session=await repository.initialize();
    const next=session.projects.find(p=>p.id===lastProject())||session.projects[0];if(next){currentProject=next;nav?.update(context(next));}})().catch(report);return;}
  board?.destroy();board=null;session=null;planningAdapter?.clear();
  for(const modal of document.querySelectorAll('iq-dialog'))modal.close(true);
  root.innerHTML='<main class="host-landing"><h1>Доступ изменился</h1><p>Обновите страницу, чтобы проверить доступные проекты.</p><a class="iq-btn primary" href="/">Обновить доступ</a></main>';
}
/** The section an address names: the Workbench by its path, the project sections by the hash. */
function routeMode(){
  if(isWorkbenchPath()&&workbenchOn())return 'workbench';
  return location.hash.startsWith('#wiki')?'wiki':location.hash==='#agents'?'agents':location.hash.startsWith('#maps')?'maps':location.hash.startsWith('#settings')?'settings':location.hash.startsWith('#finance')?'finance':location.hash==='#planning'?'planning':'tasks';
}
async function showProject(id,mode=routeMode()){
  if(mode==='workbench'&&!workbenchOn())mode='tasks';
  if(navigating)return false;navigating=true;
  // A section switch is one piece of work for the line under the top bar: its code, its reads and its mount.
  let loaded;track(new Promise(done=>{loaded=done;}),'read');
  let release=null;
  try{
  if(board&&!await board.closeTask())return false;
  const project=session.projects.find(p=>p.id===id)||session.projects[0];
  // Sections of one project share its live stream; another project, or changed rights, open it anew.
  const keep=!!project&&watching?.projectId===project.id&&watching.access===accessSignature(project);
  if(!keep)stopWatching();
  const previous=board;board=null;
  if(!project){await previous?.destroy();root.innerHTML='<main class="host-landing"><h1>Создадим первый проект</h1><p>Задачи, обсуждения и команда в одном месте.</p><button class="iq-btn primary" data-onboard>Создать проект</button></main>';root.querySelector('[data-onboard]').onclick=()=>onboard().catch(report);return;}
  if(mode==='wiki'&&currentProject&&currentProject.id!==project.id&&location.hash.startsWith('#wiki'))history.replaceState(null,'','#wiki');
  currentProject=project;viewMode=mode;
  try{localStorage.setItem(LAST_PROJECT_KEY+session.principal.id,project.id);}catch{}
  prefetchSection(mode);
  // Capture the durable watermark before loading any view snapshot. Writes during
  // mount are replayed afterwards, while older membership events are not mistaken for new changes.
  // A stream that stays open holds its events until the section has mounted instead: the same replay, without
  // a round trip for the watermark and a new connection on every switch.
  // The Workbench reads no project snapshot, so it needs no watermark first: the stream's head is read alongside it,
  // and the board opened next finds the stream open.
  const head=keep?null:repository.client.request(`/projects/${encodeURIComponent(project.id)}/events/head`);head?.catch(()=>{});
  const eventHead=keep||mode==='workbench'?null:await head;
  if(keep)release=repository.holdChanges();
  repository.clearProjectCache(project.id);
  planningAdapter=new PlanningAdapter(repository,project.id);
  repository.confirmPlanningChange=intent=>confirmPlanningChange(planningAdapter,intent);
  repository.applyPlanningChange=intent=>applyPlanningChange(planningAdapter,intent);
  repository.createInRelease=(intent,release,createInBacklog)=>createInRelease({adapter:planningAdapter,client:repository.client,intent,release,createInBacklog});
  if(mode==='workbench'){if(!isWorkbenchPath())history.pushState({workbench:true},'','/workbench');}
  else if(isWorkbenchPath()){
    // Leaving the Workbench is a step in the history, as it always was: Back returns to it.
    const workbenchUrl=new URL(location.href),url=new URL(location.href);
    url.pathname='/';url.search='';url.hash=location.hash||sectionRouteHash(mode,'');url.searchParams.set('project',project.slug);
    workbenchUrl.hash='';history.replaceState(history.state,'',workbenchUrl);history.pushState(null,'',url);
  }else{const url=new URL(location.href);url.searchParams.set('project',project.slug);history.replaceState(null,'',url);}
  await creatableReady;
  ensureShell(project,mode);
  await recoverPlanningAttempt(planningAdapter);
  const stateKey=project.id+':'+mode;if(!viewStates.has(stateKey))viewStates.set(stateKey,{});
  // The open section stays on screen while the next one mounts out of sight, then they swap in one frame:
  // switching sections never blanks or fades the page. Only a slow load covers the old view with an outline.
  const current=root.querySelector('#host-view'),swap=!!previous&&current.childElementCount>0;
  let host=current,cover=null,timer=0;
  if(swap){host=document.createElement('section');host.id='host-view';host.className='host-view-incoming';current.inert=true;current.after(host);
    timer=setTimeout(()=>{cover=document.createElement('div');cover.className='host-view-cover';cover.innerHTML=loadingMarkup('Загрузка раздела…',{variant:sectionLoadingShape(mode,location.hash.split('/')[1]),title:true,className:'host-loading'});host.before(cover);},400);}
  else{await previous?.destroy();host.innerHTML=loadingMarkup('Загрузка раздела…',{variant:sectionLoadingShape(mode,location.hash.split('/')[1]),title:true,className:'host-loading'});}
  host.dataset.section=mode;
  try{
  if(mode==='maps'){const {mountMapsHost}=await import('./maps-host.js');board=await mountMapsHost(host,{repository,project,viewState:viewStates.get(stateKey)});}
  else if(mode==='planning')board=await mountPlanningHost(host,{repository,adapter:planningAdapter,project,viewState:viewStates.get(stateKey),onOpenBoard:()=>navigate('tasks')});
  else if(mode==='finance'){const {mountFinance}=await import('../ui/finance/src/index.js');board=await mountFinance(host,{repository,project,viewState:viewStates.get(stateKey)});}
  else if(mode==='agents'){const {mountAgentsDirectory}=await import('./agents-directory.js');board=await mountAgentsDirectory(host,{repository,project,onOpenTask:async(projectId,taskId)=>{history.replaceState(null,'','#tasks');await showProject(projectId,'tasks');await board?.openTask?.(taskId);}});}
  else if(mode==='wiki'){const {mountWiki}=await import('./wiki.js');board=await mountWiki(host,{repository,project,viewState:viewStates.get(stateKey),onOpenTask:async id=>{history.replaceState(null,'','#tasks');await navigate('tasks');if(viewMode==='tasks')await board?.openTask?.(id);}});}
  else if(mode==='settings'){const {mountSettings}=await import('./settings.js');board=await mountSettings(host,{repository,adapter:planningAdapter,project,onChanged:refreshHeader});}
  else if(mode==='workbench')board=await mountWorkbenchSection(host);
  else board=await mountTaskBoard(host,{repository,project,attachmentAdapter:repository.attachmentAdapter,canEdit:can(project,'tasks.write'),canManageCatalogs:can(project,'project.settings'),viewState:viewStates.get(stateKey)});
  }finally{
    clearTimeout(timer);
    if(swap){await previous.destroy();current.remove();cover?.remove();host.classList.remove('host-view-incoming');}
  }
  // Content that replaces a visible outline fades in; a direct swap between sections does not animate.
  if(!swap||cover)host.firstElementChild?.classList.add('iq-reveal');
  if(keep){const held=release;release=null;held();if(!board)return true;}
  else{
    // A stream the Workbench could not open is left to the next project section; it never fails the Workbench.
    const start=eventHead||await (mode==='workbench'?head.catch(()=>null):head);
    if(start){const access=accessSignature(project);repository.watch(project.id,onStreamChange,{cursor:start.cursor,access});watching={projectId:project.id,access};}
  }
  const task=parseTaskRoute(location.hash);if(task&&board.openTask)await board.openTask(task,{fromRoute:true});
  return true;
  }finally{release?.();navigating=false;loaded();}
}
async function navigate(mode){
  if(navigating||!currentProject)return;
  // The Workbench keeps its own address; a project section's hash is restored when the switch is refused.
  const restoreHash=viewMode==='workbench'?null:retainedRouteHash(viewMode,board,location.hash);
  if(await showProject(currentProject.id,mode)){if(viewMode!=='workbench')history.replaceState(null,'',sectionRouteHash(viewMode,location.hash));}
  else if(restoreHash)history.replaceState(history.state,'',retainedRouteHash(viewMode,board,restoreHash));
  else if(isWorkbenchPath()&&location.hash){const url=new URL(location.href);url.hash='';history.replaceState(history.state,'',url);}
}
root.addEventListener('click',event=>{
  const link=event.target.closest('[data-section-link]');if(!link)return;event.preventDefault();void navigate(link.dataset.sectionLink).catch(report);});
/** A settings page by its address; from the Workbench, whose hashes are its own anchors, through a section switch. */
function openSettings(hash){
  if(!isWorkbenchPath()){location.hash=hash;return;}
  history.replaceState(history.state,'',hash);void navigate('settings').catch(report);
}
/** The Workbench in the shell's view. Planning changes from its drawer go through the drawer's own project. */
function mountWorkbenchSection(host){
  const planning=projectId=>{const adapter=new PlanningAdapter(repository,projectId);
    return {confirm:intent=>confirmPlanningChange(adapter,intent),apply:intent=>applyPlanningChange(adapter,intent)};};
  return mountWorkbench(host,{repository,session,planning,onOpenProject:(projectId,taskId)=>void openFromWorkbench(projectId,taskId).catch(report)});
}
/** «Открыть проект» and the first-run link: the project's board, with the task open when one is named. */
async function openFromWorkbench(projectId,taskId){
  const project=session.projects.find(p=>p.id===projectId)||currentProject||session.projects[0];
  if(!project)return;
  const shown=await showProject(project.id,'tasks');
  if(shown&&taskId&&board?.openTask)await board.openTask(taskId);
}
window.addEventListener('popstate',()=>{void(async()=>{
  if(isWorkbenchPath()){if(!workbenchOn())return;if(viewMode==='workbench'&&board?.navigate)await board.navigate();else await showProject(currentProject?.id??lastProject(),'workbench');}
  else if(viewMode==='workbench'){const slug=new URL(location.href).searchParams.get('project');await showProject(session.projects.find(p=>p.slug===slug)?.id??lastProject());}
})().catch(report);});
/** Command palette entries for the current project and role. */
function paletteCommands(){
  const go=(mode,hash)=>async()=>{if(hash)history.replaceState(null,'',hash);await navigate(mode);};
  const commands=[
    {id:'go-tasks',label:'Доска задач',hint:'Перейти',icon:'grid',keywords:'доска канбан board',run:go('tasks')},
    {id:'go-planning',label:'Планирование',hint:'Перейти',icon:'calendar',keywords:'релизы бэклог сроки planning',run:go('planning')},
    {id:'go-maps',label:'Карты',hint:'Перейти',icon:'grid',keywords:'карты доска идей maps',run:go('maps')},
    {id:'go-wiki',label:'Документация',hint:'Перейти',icon:'file',keywords:'документация вики wiki страницы',run:go('wiki')},
    {id:'go-finance',label:'Финансы',hint:'Перейти',icon:'chart',keywords:'финансы деньги доходы расходы бюджет finance',run:go('finance')},
    {id:'go-members',label:'Участники проекта',hint:'Настройки',icon:'users',keywords:'команда приглашения роли members',run:go('settings','#settings/members')},
    {id:'go-tags',label:'Теги',hint:'Настройки',icon:'palette',keywords:'теги метки цвета tags',run:go('settings','#settings/tags')},
    {id:'go-templates',label:'Шаблоны задач',hint:'Настройки',icon:'file',keywords:'шаблоны templates',run:go('settings','#settings/templates')},
    {id:'go-appearance',label:'Внешний вид',hint:'Настройки',icon:'sun',keywords:'тема акцент плотность appearance',run:go('settings','#settings/appearance')},
    {id:'switch',label:'Найти проект',icon:'search',keywords:'проект пространство switch',run:()=>nav?.openSwitcher()},
    {id:'theme',label:document.documentElement.dataset.theme==='dark'?'Светлая тема':'Тёмная тема',icon:document.documentElement.dataset.theme==='dark'?'sun':'moon',keywords:'тема theme dark light',run:()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')},
    {id:'profile',label:'Профиль',hint:'Настройки',icon:'user',keywords:'имя профиль profile',run:go('settings','#settings/account')}
  ];
  if(can(currentProject,'tasks.write'))commands.unshift({id:'new-task',label:'Новая задача',hint:'Создать на доске',icon:'plus',keywords:'создать задачу task new',run:async()=>{if(viewMode!=='tasks'){history.replaceState(null,'','#tasks');await navigate('tasks');}await board?.createTask?.();}});
  return commands;
}
function search(){if(!session||document.querySelector('dialog[open]'))return;openSearch({client:repository.client,commands:paletteCommands(),onOpen:async item=>{
  try{if(board&&!await board.closeTask())return;history.replaceState(null,'',item.kind==='map'?'#maps/'+encodeURIComponent(item.id):'#tasks');await showProject(item.projectId,item.kind==='map'?'maps':'tasks');if(item.kind==='task')await board.openTask(item.key);}catch(error){report(error);}
}});}
window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}});
window.addEventListener('hashchange',()=>{if(viewMode==='workbench'||isWorkbenchPath())return;void(async()=>{const task=parseTaskRoute(location.hash);if(task){if(!board?.openTask||viewMode==='maps'){const restoreHash=board?.routeHash;if(await showProject(currentProject.id,'tasks')===false){const retained=board?.routeHash||restoreHash;if(retained)history.replaceState(history.state,'',retained);return;}}await board?.openTask?.(task,{fromRoute:true});}else if(location.hash.startsWith('#maps')){if(viewMode==='maps'&&board?.openRoute)await board.openRoute(location.hash);else await navigate('maps');}
    else if(location.hash.startsWith('#wiki')){if(viewMode==='wiki'&&board?.openRoute)await board.openRoute(location.hash);else await navigate('wiki');}
    else if(location.hash.startsWith('#finance')){if(viewMode==='finance'&&board?.openRoute)await board.openRoute(location.hash);else await navigate('finance');}else if(location.hash.startsWith('#settings')){if(viewMode==='settings'&&board?.navigateSettings){await board.navigateSettings();}else await navigate('settings');}
    else if(['#tasks','#planning','#agents'].includes(location.hash)){const mode=location.hash.slice(1);
    // Closing the task drawer returns to the section already on screen: close the drawer, never remount the view
    // (a remount reloads every card and its cover, which reads as a blink).
    if(viewMode===mode&&board)await board.closeTask?.();else await navigate(mode);}else await board?.closeTask();})().catch(report);});
try{session=await repository.initialize();
  if(location.pathname==='/oauth/authorize'){await mountConsent(root,{client:repository.client,session});throw STOP;}
  if(resumeAuthorization())throw STOP;
  invitationFlow().restore();
  if(await acceptPendingInvitation(repository.client))session=await repository.initialize();
  creatableReady=creatableWorkspaces().then(value=>{creatable=value;},()=>{creatable=null;});
  if(isWorkbenchPath()&&workbenchOn())await showProject(lastProject(),'workbench');
  else{if(isWorkbenchPath())history.replaceState(null,'','/');
  const slug=new URL(location.href).searchParams.get('project');await showProject(session.projects.find(p=>p.slug===slug)?.id??lastProject());}}
catch(error){
  if(error===STOP){/* The consent screen, or on the way back to it: nothing else to show. */}
  else if(error.status===401){keepAuthorization();await renderSignIn();}
  else {root.innerHTML='<main class="host-landing"><h1>Не удалось открыть Sprintique</h1><p role="alert"></p></main>';root.querySelector('[role=alert]').textContent=error.message;}
}
