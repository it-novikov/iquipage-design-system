import '@iquipage/web/styles.css';
import '../ui/src/maps.css';
import '../ui/src/board/board.css';
import '../ui/shell.css';
import './shell.css';
import '../ui/planning/src/planning.css';
import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {mountTaskBoard} from '../ui/src/board/board.js';
import {parseTaskRoute} from '../ui/src/board/task-route.js';
import {dialog,input} from '../ui/src/ui.js';
import {ProductRepository} from './repository.js';
import {PlanningAdapter} from './planning-adapter.js';
import {mountPlanningHost,confirmPlanningChange,recoverPlanningAttempt} from './planning-host.js';
import {openSearch} from './search.js';
import {acceptPendingInvitation,editProfile} from './members.js';
registerCore();
const root=document.querySelector('#app'),repository=new ProductRepository();
let board,session,currentProject,planningAdapter,viewMode='tasks',navigating=false,avatarUrl=null;
const viewStates=new Map();
async function renderAvatar(project){
  const el=root.querySelector('[data-project-avatar]');if(!el)return;
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
  root.querySelector('[data-project-label]').textContent=updated.name;
  root.querySelector('[data-workspace-label]').textContent=updated.workspaceName;
  await renderAvatar(updated);
}
function report(error){dialog({title:'Не удалось выполнить действие',description:error.message});}
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
async function showProject(id,mode=location.hash.startsWith('#maps')?'maps':['planning','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'tasks'){
  if(navigating)return false;navigating=true;
  try{
  if(board&&!await board.closeTask())return;
  repository.stopWatch?.();await board?.destroy();board=null;const project=session.projects.find(p=>p.id===id)||session.projects[0];
  if(!project){root.innerHTML='<main class="host-landing"><h1>Создадим первый проект</h1><p>Задачи, обсуждения и команда в одном месте.</p><button class="iq-btn primary" data-onboard>Создать проект</button></main>';root.querySelector('[data-onboard]').onclick=()=>onboard().catch(report);return;}
  currentProject=project;viewMode=mode;
  if(avatarUrl){URL.revokeObjectURL(avatarUrl);avatarUrl=null;}
  const spaces=await repository.client.request('/workspaces');
  planningAdapter=new PlanningAdapter(repository,project.id);
  repository.confirmPlanningChange=intent=>confirmPlanningChange(planningAdapter,intent);
  const url=new URL(location.href);url.searchParams.set('project',project.slug);history.replaceState(null,'',url);
  root.innerHTML=`<div class="demo-shell"><header class="platform-header"><div class="platform-brand">
    ${ui.menu(`<button class="iq-btn ghost sm" aria-label="Выбрать пространство"><span class="host-workspace-icon">${icon('folder',18)}</span><span data-workspace-label>${esc(project.workspaceName)}</span>${icon('down',14)}</button>`,spaces.map(w=>({label:esc(w.name),action:'workspace:'+w.id})).concat([{label:'Создать пространство',action:'create-workspace'}]))}
    <span class="platform-divider">/</span>${ui.menu(`<button class="iq-btn ghost sm" aria-label="Выбрать проект"><span class="iq-avatar sm" data-project-avatar>${esc(project.name.slice(0,1))}</span><span data-project-label>${esc(project.name)}</span>${icon('down',14)}</button>`,session.projects.filter(p=>p.workspaceId===project.workspaceId).map(p=>({label:esc(p.name),action:'project:'+p.id})).concat([{label:'Создать проект',action:'create-project'}]))}
    <nav class="platform-navigation" aria-label="Разделы проекта"><a href="#tasks" data-section-link="tasks" ${mode==='tasks'?'aria-current="page"':''}>Доска задач</a><a href="#planning" data-section-link="planning" ${mode==='planning'?'aria-current="page"':''}>Планирование</a><a href="#maps" data-section-link="maps" ${mode==='maps'?'aria-current="page"':''}>Карты</a>${ui.menu(ui.ib(mode==='maps'?'grid':mode==='planning'?'calendar':'board','Выбрать раздел проекта','ghost sm'),[{label:'Доска задач',action:'section:tasks'},{label:'Планирование',action:'section:planning'},{label:'Карты',action:'section:maps'}])}</nav></div>
    <div class="platform-global"><button class="iq-btn ghost icon sm" data-search aria-label="Поиск по платформе">${icon('search',18)}</button><button class="iq-btn ghost icon sm" data-section-link="settings" aria-label="Настройки проекта">${icon('settings',18)}</button><button class="iq-btn ghost icon sm" data-theme aria-label="Изменить тему">${icon('moon',18)}</button>${ui.menu(ui.ib('user','Меню профиля','ghost sm'),[{label:'Профиль',action:'profile'},{label:'Настройки проекта',action:'section:settings'},{label:'Изменить тему',action:'theme'},{label:'Выйти',action:'logout'}])}</div></header>
    <main class="platform-main"><section id="host-view" data-section="tasks"></section></main></div>`;
  root.querySelector('[data-theme]').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
  await recoverPlanningAttempt(planningAdapter);
  const stateKey=project.id+':'+mode;if(!viewStates.has(stateKey))viewStates.set(stateKey,{});
  const host=root.querySelector('#host-view');host.dataset.section=mode;
  if(mode==='maps'){const {mountMapsHost}=await import('./maps-host.js');board=await mountMapsHost(host,{repository,project,onOpenTasks:async({focusTaskId})=>{await navigate('tasks');if(viewMode==='tasks')await board.openTask(focusTaskId);}});}
  else if(mode==='planning')board=await mountPlanningHost(host,{repository,adapter:planningAdapter,project,viewState:viewStates.get(stateKey),onOpenBoard:()=>navigate('tasks')});
  else if(mode==='settings'){const {mountSettings}=await import('./settings.js');board=await mountSettings(host,{repository,adapter:planningAdapter,project,onChanged:refreshHeader});}
  else board=await mountTaskBoard(host,{repository,project,attachmentAdapter:repository.attachmentAdapter,canEdit:project.role!=='reader',canManageCatalogs:project.role==='admin',viewState:viewStates.get(stateKey)});
  root.querySelector('[data-search]').onclick=search;
  await renderAvatar(project);
  repository.watch(project.id,()=>{
    board?.destroy();board=null;session=null;planningAdapter?.clear();
    for(const modal of document.querySelectorAll('iq-dialog'))modal.close(true);
    root.innerHTML='<main class="host-landing"><h1>Доступ изменился</h1><p>Обновите страницу, чтобы проверить доступные проекты.</p><a class="iq-btn primary" href="/">Обновить доступ</a></main>';
  });
  const task=parseTaskRoute(location.hash);if(task&&board.openTask)await board.openTask(task,{fromRoute:true});
  return true;
  }finally{navigating=false;}
}
async function navigate(mode){
  if(navigating||!currentProject)return;
  if(await showProject(currentProject.id,mode)&&mode!=='maps')history.replaceState(null,'','#'+viewMode);
}
root.addEventListener('click',event=>{const link=event.target.closest('[data-section-link]');if(!link)return;event.preventDefault();void navigate(link.dataset.sectionLink).catch(report);});
function search(){if(!session||document.querySelector('dialog[open]'))return;openSearch({client:repository.client,onOpen:async item=>{
  try{if(board&&!await board.closeTask())return;history.replaceState(null,'',item.kind==='map'?'#maps/'+encodeURIComponent(item.id):'#tasks');await showProject(item.projectId,item.kind==='map'?'maps':'tasks');if(item.kind==='task')await board.openTask(item.key);}catch(error){report(error);}
}});}
window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}});
root.addEventListener('iq-action',event=>{
  const action=String(event.detail.action||'');
  if(action.startsWith('section:'))void navigate(action.slice(8)).catch(report);
  if(action==='profile')void editProfile(repository.client).catch(report);
  if(action==='theme')document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
  if(action==='logout')void(async()=>{if(board&&!await board.closeTask())return;await repository.client.request('/logout','POST');location.reload();})().catch(report);
  if(action.startsWith('project:')){void showProject(action.slice(8)).catch(report);}
  if(action==='create-project')void onboard(currentProject?.workspaceId).catch(report);
  if(action.startsWith('workspace:')){const id=action.slice(10),p=session.projects.find(p=>p.workspaceId===id);if(p)void showProject(p.id).catch(report);else void onboard(id).catch(report);}
  if(action==='create-workspace')dialog({title:'Создать пространство',body:input('name','Название','',{required:true,maxlength:100}),submitLabel:'Создать',onSubmit:async values=>{const space=await repository.client.request('/workspaces','POST',{name:values.get('name')});await onboard(space.id);}});
});
window.addEventListener('hashchange',()=>{void(async()=>{const task=parseTaskRoute(location.hash);if(task){if(!board?.openTask)await showProject(currentProject.id,'tasks');await board?.openTask?.(task,{fromRoute:true});}else if(location.hash.startsWith('#maps'))await navigate('maps');else if(['#tasks','#planning','#settings'].includes(location.hash))await navigate(location.hash.slice(1));else await board?.closeTask();})().catch(report);});
try{session=await repository.initialize();
  const pending=sessionStorage.getItem('sprintique.pending-invitation');sessionStorage.removeItem('sprintique.pending-invitation');
  if(pending&&/^invite_[A-Za-z0-9_-]{43}$/.test(pending)&&!location.hash.startsWith('#invite/'))history.replaceState(null,'','#invite/'+pending);
  if(await acceptPendingInvitation(repository.client))session=await repository.initialize();
  const slug=new URL(location.href).searchParams.get('project');await showProject(session.projects.find(p=>p.slug===slug)?.id);}
catch(error){
  if(error.status===401){root.innerHTML='<main class="host-landing"><h1>Sprintique</h1><p>Войдите, чтобы открыть свои проекты.</p><a class="iq-btn primary" href="/auth/login">Войти</a></main>';
    root.querySelector('a').onclick=()=>{const match=location.hash.match(/^#invite\/(invite_[A-Za-z0-9_-]{43})$/);if(match)sessionStorage.setItem('sprintique.pending-invitation',match[1]);};
  }
  else {root.innerHTML='<main class="host-landing"><h1>Не удалось открыть Sprintique</h1><p role="alert"></p></main>';root.querySelector('[role=alert]').textContent=error.message;}
}
