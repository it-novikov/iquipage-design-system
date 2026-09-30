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
import {PlanningAdapter} from './planning-adapter.js';
import {mountPlanningHost,confirmPlanningChange,recoverPlanningAttempt} from './planning-host.js';
import {openSearch} from './search.js';
import {acceptPendingInvitation} from './members.js';
import {can,accessSignature} from './permissions.js';
import {sectionRouteHash} from './section-route.js';
import {loadingMarkup} from '../ui/src/loading.js';
import {mountProjectNavigation} from '../ui/planning/src/project-navigation.js';
import '../ui/planning/src/navigation.css';
registerCore();
const root=document.querySelector('#app'),repository=new ProductRepository();
let board,session,currentProject,planningAdapter,viewMode='tasks',navigating=false,avatarUrl=null;
const viewStates=new Map();
async function renderAvatar(project){
  const el=nav?.avatar();if(!el)return;
  if(avatarUrl){URL.revokeObjectURL(avatarUrl);avatarUrl=null;}
  el.textContent=project.name.slice(0,1);if(!project.avatarAssetId||!repository.attachmentAdapter)return;
  try{const blob=await repository.attachmentAdapter.blob({projectId:project.id,id:project.avatarAssetId,variant:'thumb'});
    if(!el.isConnected||currentProject.id!==project.id)return;
    avatarUrl=URL.createObjectURL(blob);const img=new Image();img.alt='';img.src=avatarUrl;el.replaceChildren(img);
  }catch{/* The accessible project name remains; a missing avatar must not block navigation. */}
}
async function refreshHeader(){
  session=await repository.initialize();const updated=session.projects.find(p=>p.id===currentProject.id);if(!updated)return;
  Object.assign(currentProject,updated);
  nav?.update(context(updated));nav?.setProfile?.(profileOf(session));
  await renderAvatar(updated);
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
      onSwitch:async id=>{const shown=await showProject(id,viewMode);return shown===false?false:context(currentProject);},
      onAccount:()=>{location.hash='#settings/account';},
      onTeam:()=>{location.hash='#settings/members';},
      onSignOut:()=>void(async()=>{if(board&&!await board.closeTask())return;await repository.client.request('/logout','POST');location.reload();})().catch(report),
      onTheme:()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'),
      onSearch:search,onCreateProject:()=>void onboard(currentProject?.workspaceId).catch(report),onCreateWorkspace:createWorkspace
    });
    nav.setTheme(document.documentElement.dataset.theme);
  }else nav.update(context(project));
  nav.setRoute(mode);
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
// Failures are toasts, not modal walls: the message stays until read (hover or focus pauses it).
function report(error){notify({tone:'danger',message:'Не удалось выполнить действие',description:error.message||'Повторите попытку.',duration:10000});}
async function onboard(selectedWorkspaceId){
  // Projects are created where the person may: projects.create, or a members' workspace whose rule lets members create.
  const all=await repository.client.request('/workspaces'),rule=async w=>(await repository.client.request('/workspaces/'+encodeURIComponent(w.id)).catch(()=>null))?.projectsCreatedBy==='members';
  const allowed=await Promise.all(all.map(async w=>(w.permissions||[]).includes('projects.create')||['owner','admin'].includes(w.role)||w.role==='member'&&await rule(w)));
  const workspaces=all.filter((_,i)=>allowed[i]);
  if(selectedWorkspaceId&&!workspaces.some(w=>w.id===selectedWorkspaceId))return dialog({title:'Нет доступных проектов',description:'Администратор пространства может создать проект и пригласить вас. Существующие проекты появятся после предоставления доступа.'});
  if(selectedWorkspaceId)workspaces.sort((a,b)=>(b.id===selectedWorkspaceId)-(a.id===selectedWorkspaceId));
  const form=input('name','Название проекта','',{required:true,maxlength:100})+input('slug','Адрес проекта','',{required:true,maxlength:48,placeholder:'my-product'})+input('key','Префикс задач','',{required:true,maxlength:10,placeholder:'SPR'})+
    (workspaces.length?`<iq-select name="workspaceId" label="Пространство" value="${esc(workspaces[0].id)}">${workspaces.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</iq-select>`:input('workspace','Название пространства',''));
  dialog({title:'Создать проект',body:form,submitLabel:'Создать',onSubmit:async values=>{
    let workspaceId=values.get('workspaceId');
    if(!workspaceId)workspaceId=(await repository.client.request('/workspaces','POST',{name:values.get('workspace')})).id;
    const project=await repository.client.request('/projects','POST',{workspaceId,name:values.get('name'),slug:values.get('slug'),key:values.get('key')});
    session=await repository.initialize();location.hash='#tasks';await showProject(project.id);
  }});
}
async function showProject(id,mode=location.hash.startsWith('#maps')?'maps':location.hash.startsWith('#settings')?'settings':location.hash.startsWith('#finance')?'finance':location.hash==='#planning'?'planning':'tasks'){
  if(navigating)return false;navigating=true;
  try{
  if(board&&!await board.closeTask())return false;
  repository.stopWatch?.();const previous=board;board=null;const project=session.projects.find(p=>p.id===id)||session.projects[0];
  if(!project){await previous?.destroy();root.innerHTML='<main class="host-landing"><h1>Создадим первый проект</h1><p>Задачи, обсуждения и команда в одном месте.</p><button class="iq-btn primary" data-onboard>Создать проект</button></main>';root.querySelector('[data-onboard]').onclick=()=>onboard().catch(report);return;}
  currentProject=project;viewMode=mode;
  try{localStorage.setItem(LAST_PROJECT_KEY+session.principal.id,project.id);}catch{}
  if(avatarUrl){URL.revokeObjectURL(avatarUrl);avatarUrl=null;}
  // Capture the durable watermark before loading any view snapshot. Writes during
  // mount are replayed afterwards, while older membership events are not mistaken for new changes.
  const eventHead=await repository.client.request(`/projects/${encodeURIComponent(project.id)}/events/head`);
  repository.clearProjectCache(project.id);
  planningAdapter=new PlanningAdapter(repository,project.id);
  repository.confirmPlanningChange=intent=>confirmPlanningChange(planningAdapter,intent);
  const url=new URL(location.href);url.searchParams.set('project',project.slug);history.replaceState(null,'',url);
  ensureShell(project,mode);
  await recoverPlanningAttempt(planningAdapter);
  const stateKey=project.id+':'+mode;if(!viewStates.has(stateKey))viewStates.set(stateKey,{});
  // The open section stays on screen while the next one mounts out of sight, then they swap in one frame:
  // switching sections never blanks or fades the page. Only a slow load covers the old view with an outline.
  const current=root.querySelector('#host-view'),swap=!!previous&&current.childElementCount>0;
  let host=current,cover=null,timer=0;
  if(swap){host=document.createElement('section');host.id='host-view';host.className='host-view-incoming';current.inert=true;current.after(host);
    timer=setTimeout(()=>{cover=document.createElement('div');cover.className='host-view-cover';cover.innerHTML=loadingMarkup('Загрузка раздела…',{rows:6,title:true,className:'host-loading'});host.before(cover);},400);}
  else{await previous?.destroy();host.innerHTML=loadingMarkup('Загрузка раздела…',{rows:6,title:true,className:'host-loading'});}
  host.dataset.section=mode;
  try{
  if(mode==='maps'){const {mountMapsHost}=await import('./maps-host.js');board=await mountMapsHost(host,{repository,project,onOpenTasks:async({focusTaskId})=>{await navigate('tasks');if(viewMode==='tasks')await board.openTask(focusTaskId);}});}
  else if(mode==='planning')board=await mountPlanningHost(host,{repository,adapter:planningAdapter,project,viewState:viewStates.get(stateKey),onOpenBoard:()=>navigate('tasks')});
  else if(mode==='finance'){const {mountFinance}=await import('../ui/finance/src/index.js');board=await mountFinance(host,{repository,project,viewState:viewStates.get(stateKey)});}
  else if(mode==='settings'){const {mountSettings}=await import('./settings.js');board=await mountSettings(host,{repository,adapter:planningAdapter,project,onChanged:refreshHeader});}
  else board=await mountTaskBoard(host,{repository,project,attachmentAdapter:repository.attachmentAdapter,canEdit:can(project,'tasks.write'),canManageCatalogs:can(project,'project.settings'),viewState:viewStates.get(stateKey)});
  }finally{
    clearTimeout(timer);
    if(swap){await previous.destroy();current.remove();cover?.remove();host.classList.remove('host-view-incoming');}
  }
  // Content that replaces a visible outline fades in; a direct swap between sections does not animate.
  if(!swap||cover)host.firstElementChild?.classList.add('iq-reveal');
  await renderAvatar(project);
  repository.watch(project.id,change=>{
    if(change?.roleChanged){
      if(root.querySelector('[data-access-change]'))return;
      const banner=document.createElement('section');banner.dataset.accessChange='';
      banner.innerHTML=ui.alert('Права изменились','Несохранённый текст остаётся в открытой форме. Обновите доступ, чтобы применить новые права.','warning')+ui.btn('Обновить доступ','secondary sm');
      host.before(banner);
      banner.querySelector('button').onclick=()=>{void(async()=>{if(board&&!await board.closeTask())return;session=await repository.initialize();await showProject(project.id,viewMode);})().catch(report);};
      return;
    }
    board?.destroy();board=null;session=null;planningAdapter?.clear();
    for(const modal of document.querySelectorAll('iq-dialog'))modal.close(true);
    root.innerHTML='<main class="host-landing"><h1>Доступ изменился</h1><p>Обновите страницу, чтобы проверить доступные проекты.</p><a class="iq-btn primary" href="/">Обновить доступ</a></main>';
  },{cursor:eventHead.cursor,access:accessSignature(project)});
  const task=parseTaskRoute(location.hash);if(task&&board.openTask)await board.openTask(task,{fromRoute:true});
  return true;
  }finally{navigating=false;}
}
async function navigate(mode){
  if(navigating||!currentProject)return;
  const restoreHash=board?.routeHash||sectionRouteHash(viewMode,location.hash);
  if(await showProject(currentProject.id,mode))history.replaceState(null,'',sectionRouteHash(viewMode,location.hash));
  else history.replaceState(null,'',restoreHash);
}
root.addEventListener('click',event=>{const link=event.target.closest('[data-section-link]');if(!link)return;event.preventDefault();void navigate(link.dataset.sectionLink).catch(report);});
/** Command palette entries for the current project and role. */
function paletteCommands(){
  const go=(mode,hash)=>async()=>{if(hash)history.replaceState(null,'',hash);await navigate(mode);};
  const commands=[
    {id:'go-tasks',label:'Доска задач',hint:'Перейти',icon:'grid',keywords:'доска канбан board',run:go('tasks')},
    {id:'go-planning',label:'Планирование',hint:'Перейти',icon:'calendar',keywords:'релизы бэклог сроки planning',run:go('planning')},
    {id:'go-maps',label:'Карты',hint:'Перейти',icon:'grid',keywords:'карты доска идей maps',run:go('maps')},
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
window.addEventListener('hashchange',()=>{void(async()=>{const task=parseTaskRoute(location.hash);if(task){if(!board?.openTask)await showProject(currentProject.id,'tasks');await board?.openTask?.(task,{fromRoute:true});}else if(location.hash.startsWith('#maps'))await navigate('maps');
    else if(location.hash.startsWith('#finance')){if(viewMode==='finance'&&board?.openRoute)await board.openRoute(location.hash);else await navigate('finance');}else if(location.hash.startsWith('#settings')){if(viewMode==='settings'&&board?.navigateSettings){await board.navigateSettings();}else await navigate('settings');}
    else if(['#tasks','#planning'].includes(location.hash)){const mode=location.hash.slice(1);
    // Closing the task drawer returns to the section already on screen: close the drawer, never remount the view
    // (a remount reloads every card and its cover, which reads as a blink).
    if(viewMode===mode&&board)await board.closeTask?.();else await navigate(mode);}else await board?.closeTask();})().catch(report);});
try{session=await repository.initialize();
  const pending=sessionStorage.getItem('sprintique.pending-invitation');sessionStorage.removeItem('sprintique.pending-invitation');
  if(pending&&/^invite_[A-Za-z0-9_-]{43}$/.test(pending)&&!location.hash.startsWith('#invite/'))history.replaceState(null,'','#invite/'+pending);
  if(await acceptPendingInvitation(repository.client))session=await repository.initialize();
  const slug=new URL(location.href).searchParams.get('project');await showProject(session.projects.find(p=>p.slug===slug)?.id??lastProject());}
catch(error){
  if(error.status===401)await renderSignIn();
  else {root.innerHTML='<main class="host-landing"><h1>Не удалось открыть Sprintique</h1><p role="alert"></p></main>';root.querySelector('[role=alert]').textContent=error.message;}
}
