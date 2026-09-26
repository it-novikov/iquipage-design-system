import {mountAuthScreen} from './auth-screen.js';
import {appearance} from './appearance.js';
import '@iquipage/web/styles.css';
import '../ui/src/maps.css';
import '../ui/src/board/board.css';
import '../ui/shell.css';
import './shell.css';
import '../ui/planning/src/planning.css';
import {registerCore,ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {mountTaskBoard} from '../ui/src/board/board.js';
import {parseTaskRoute} from '../ui/src/board/task-route.js';
import {dialog,input} from '../ui/src/ui.js';
import {ProductRepository} from './repository.js';
import {PlanningAdapter} from './planning-adapter.js';
import {mountPlanningHost,confirmPlanningChange,recoverPlanningAttempt} from './planning-host.js';
import {openSearch} from './search.js';
import {acceptPendingInvitation,editProfile} from './members.js';
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
  nav?.update(context(updated));
  await renderAvatar(updated);
}
// ---- Product shell (UX R3 navigation) ----
let nav=null;
function applyTheme(theme){appearance().update({theme});}
appearance();
window.addEventListener('sprintique-appearance-change',()=>nav?.setTheme(document.documentElement.dataset.theme));
const context=project=>({id:project.id,workspaceId:project.workspaceId,workspaceName:project.workspaceName,projectName:project.name});
const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'Я';
function ensureShell(project,mode){
  if(!nav||!root.querySelector('[data-product-nav]')?.isConnected){
    nav?.destroy();
    root.innerHTML='<div class="demo-shell"><header data-product-nav></header><main class="platform-main"><section id="host-view" data-section="tasks"></section></main></div>';
    nav=mountProjectNavigation(root.querySelector('[data-product-nav]'),{
      current:context(project),profile:{name:session.principal.name,initials:initials(session.principal.name)},
      catalog:()=>session.projects.map(p=>({id:p.id,name:p.name,workspaceId:p.workspaceId,workspaceName:p.workspaceName})),
      projects:async({query='',signal})=>{signal?.throwIfAborted();const q=String(query).toLocaleLowerCase('ru');
        return {options:session.projects.filter(p=>(p.workspaceName+' '+p.name).toLocaleLowerCase('ru').includes(q)).map(p=>({value:p.id,label:p.name,description:p.workspaceName})),nextCursor:null};},
      onSwitch:async id=>{const shown=await showProject(id,viewMode);return shown===false?false:context(currentProject);},
      onAccount:()=>void editProfile(repository.client).catch(report),
      onTeam:()=>void navigate('settings').catch(report),
      onSignOut:()=>void(async()=>{if(board&&!await board.closeTask())return;await repository.client.request('/logout','POST');location.reload();})().catch(report),
      onTheme:()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'),
      onSearch:search,onCreateProject:()=>void onboard(currentProject?.workspaceId).catch(report),onCreateWorkspace:createWorkspace
    });
    nav.setTheme(document.documentElement.dataset.theme);
  }else nav.update(context(project));
  nav.setRoute(mode);
  root.querySelector('#host-view').replaceChildren();
}
function createWorkspace(){
  dialog({title:'Создать пространство',body:input('name','Название','',{required:true,maxlength:100}),submitLabel:'Создать',onSubmit:async values=>{
    const space=await repository.client.request('/workspaces','POST',{name:values.get('name')});await onboard(space.id);
  }});
}
/** Sign-in offers only the ways in the server actually has; an unconfigured provider is never a link. */
/** Sign-in: the DS credential dialog for the local stand; an organisation provider is opened directly
 *  (its themed page shows the same dialog); nothing configured → a calm explanation, never a raw error. */
async function renderSignIn(){
  const methods=await fetch('/api/v1/auth/methods').then(r=>r.ok?r.json():{oidc:false,devLogin:false}).catch(()=>({oidc:false,devLogin:false}));
  const keepInvitation=()=>{const match=location.hash.match(/^#invite\/(invite_[A-Za-z0-9_-]{43})$/);if(match)sessionStorage.setItem('sprintique.pending-invitation',match[1]);};
  if(methods.oidc&&!methods.devLogin){mountAuthScreen(root);return;}
  if(!methods.devLogin){root.innerHTML='<main class="iq-auth-stage"><section class="iq-auth-dialog"><h1>Вход не настроен</h1><p class="iq-auth-dialog-description">Для отладки запустите локальный стенд: <code>npm run dev:local</code>.</p></section></main>';return;}
  root.innerHTML=`<main class="iq-auth-stage"><div class="host-sign-in"><iq-auth-dialog product="Sprintique" heading="Вход в Sprintique" description="Локальный стенд: тестовая учётная запись admin / admin." username-label="Логин"></iq-auth-dialog>${methods.oidc?'<a class="iq-btn ghost" href="/auth/login" data-oidc>Войти через учётную запись организации</a>':''}</div></main>`;
  root.querySelector('[data-oidc]')?.addEventListener('click',keepInvitation);
  const dialog=root.querySelector('iq-auth-dialog');
  dialog.querySelector('[name=username]').value='admin';dialog.querySelector('[name=password]').focus();
  dialog.addEventListener('iq-auth-submit',async event=>{
    event.preventDefault();dialog.removeAttribute('error');dialog.setAttribute('pending','');
    try{
      const response=await fetch('/auth/dev-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:event.detail.username,password:event.detail.password})});
      if(!response.ok)throw Error((await response.json().catch(()=>null))?.message||'Не удалось войти.');
      keepInvitation();location.reload();
    }catch(cause){dialog.removeAttribute('pending');dialog.clearPassword();dialog.setAttribute('error',cause.message);dialog.querySelector('[name=password]').focus();}
  });
}
// The last opened project reopens after sign-in; a project link in the URL still wins.
const LAST_PROJECT_KEY='sprintique.last-project:';
function lastProject(){try{return localStorage.getItem(LAST_PROJECT_KEY+session.principal.id)||undefined;}catch{return undefined;}}
// Failures are toasts, not modal walls: the message stays until read (hover or focus pauses it).
function report(error){notify({tone:'danger',message:'Не удалось выполнить действие',description:error.message||'Повторите попытку.',duration:10000});}
async function onboard(selectedWorkspaceId){
  const workspaces=(await repository.client.request('/workspaces')).filter(w=>w.role==='admin');
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
async function showProject(id,mode=location.hash.startsWith('#maps')?'maps':location.hash.startsWith('#settings')?'settings':location.hash==='#planning'?'planning':'tasks'){
  if(navigating)return false;navigating=true;
  try{
  if(board&&!await board.closeTask())return false;
  repository.stopWatch?.();await board?.destroy();board=null;const project=session.projects.find(p=>p.id===id)||session.projects[0];
  if(!project){root.innerHTML='<main class="host-landing"><h1>Создадим первый проект</h1><p>Задачи, обсуждения и команда в одном месте.</p><button class="iq-btn primary" data-onboard>Создать проект</button></main>';root.querySelector('[data-onboard]').onclick=()=>onboard().catch(report);return;}
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
  const host=root.querySelector('#host-view');host.dataset.section=mode;
  // Each section replaces this outline when it mounts, so a slow first load never shows a blank page.
  host.innerHTML=loadingMarkup('Загрузка раздела…',{rows:6,title:true,className:'host-loading'});
  if(mode==='maps'){const {mountMapsHost}=await import('./maps-host.js');board=await mountMapsHost(host,{repository,project,onOpenTasks:async({focusTaskId})=>{await navigate('tasks');if(viewMode==='tasks')await board.openTask(focusTaskId);}});}
  else if(mode==='planning')board=await mountPlanningHost(host,{repository,adapter:planningAdapter,project,viewState:viewStates.get(stateKey),onOpenBoard:()=>navigate('tasks')});
  else if(mode==='settings'){const {mountSettings}=await import('./settings.js');board=await mountSettings(host,{repository,adapter:planningAdapter,project,onChanged:refreshHeader});}
  else board=await mountTaskBoard(host,{repository,project,attachmentAdapter:repository.attachmentAdapter,canEdit:project.role!=='reader',canManageCatalogs:project.role==='admin',viewState:viewStates.get(stateKey)});
  // The mounted section fades in over the (possibly never shown) skeleton instead of popping in.
  host.firstElementChild?.classList.add('iq-reveal');
  await renderAvatar(project);
  repository.watch(project.id,change=>{
    if(change?.roleChanged){
      if(root.querySelector('[data-access-change]'))return;
      const banner=document.createElement('section');banner.dataset.accessChange='';
      banner.innerHTML=ui.alert('Права изменились','Несохранённый текст остаётся в открытой форме. Обновите доступ, чтобы применить новую роль.','warning')+ui.btn('Обновить доступ','secondary sm');
      host.before(banner);
      banner.querySelector('button').onclick=()=>{void(async()=>{if(board&&!await board.closeTask())return;session=await repository.initialize();await showProject(project.id,viewMode);})().catch(report);};
      return;
    }
    board?.destroy();board=null;session=null;planningAdapter?.clear();
    for(const modal of document.querySelectorAll('iq-dialog'))modal.close(true);
    root.innerHTML='<main class="host-landing"><h1>Доступ изменился</h1><p>Обновите страницу, чтобы проверить доступные проекты.</p><a class="iq-btn primary" href="/">Обновить доступ</a></main>';
  },{cursor:eventHead.cursor,role:project.role});
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
    {id:'go-members',label:'Участники проекта',hint:'Настройки',icon:'user',keywords:'команда приглашения роли members',run:go('settings','#settings/members')},
    {id:'go-tags',label:'Теги и цвета',hint:'Настройки',icon:'sliders',keywords:'теги метки tags',run:go('settings','#settings/tags')},
    {id:'go-templates',label:'Шаблоны задач',hint:'Настройки',icon:'sliders',keywords:'шаблоны templates',run:go('settings','#settings/templates')},
    {id:'switch',label:'Найти проект',icon:'search',keywords:'проект пространство switch',run:()=>nav?.openSwitcher()},
    {id:'theme',label:document.documentElement.dataset.theme==='dark'?'Светлая тема':'Тёмная тема',icon:document.documentElement.dataset.theme==='dark'?'sun':'moon',keywords:'тема theme dark light',run:()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')},
    {id:'profile',label:'Профиль',icon:'user',keywords:'имя профиль profile',run:()=>void editProfile(repository.client).catch(report)}
  ];
  if(currentProject?.role!=='reader')commands.unshift({id:'new-task',label:'Новая задача',hint:'Создать на доске',icon:'plus',keywords:'создать задачу task new',run:async()=>{if(viewMode!=='tasks'){history.replaceState(null,'','#tasks');await navigate('tasks');}await board?.createTask?.();}});
  return commands;
}
function search(){if(!session||document.querySelector('dialog[open]'))return;openSearch({client:repository.client,commands:paletteCommands(),onOpen:async item=>{
  try{if(board&&!await board.closeTask())return;history.replaceState(null,'',item.kind==='map'?'#maps/'+encodeURIComponent(item.id):'#tasks');await showProject(item.projectId,item.kind==='map'?'maps':'tasks');if(item.kind==='task')await board.openTask(item.key);}catch(error){report(error);}
}});}
window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}});
window.addEventListener('hashchange',()=>{void(async()=>{const task=parseTaskRoute(location.hash);if(task){if(!board?.openTask)await showProject(currentProject.id,'tasks');await board?.openTask?.(task,{fromRoute:true});}else if(location.hash.startsWith('#maps'))await navigate('maps');else if(location.hash.startsWith('#settings')){if(viewMode==='settings'&&board?.navigateSettings){await board.navigateSettings();}else await navigate('settings');}
    else if(['#tasks','#planning'].includes(location.hash))await navigate(location.hash.slice(1));else await board?.closeTask();})().catch(report);});
try{session=await repository.initialize();
  const pending=sessionStorage.getItem('sprintique.pending-invitation');sessionStorage.removeItem('sprintique.pending-invitation');
  if(pending&&/^invite_[A-Za-z0-9_-]{43}$/.test(pending)&&!location.hash.startsWith('#invite/'))history.replaceState(null,'','#invite/'+pending);
  if(await acceptPendingInvitation(repository.client))session=await repository.initialize();
  const slug=new URL(location.href).searchParams.get('project');await showProject(session.projects.find(p=>p.slug===slug)?.id??lastProject());}
catch(error){
  if(error.status===401)await renderSignIn();
  else {root.innerHTML='<main class="host-landing"><h1>Не удалось открыть Sprintique</h1><p role="alert"></p></main>';root.querySelector('[role=alert]').textContent=error.message;}
}
