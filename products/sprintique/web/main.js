import '@iquipage/web/styles.css';
import '../ui/src/maps.css';
import '../ui/src/board/board.css';
import '../ui/shell.css';
import './shell.css';
import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {mountTaskBoard} from '../ui/src/board/board.js';
import {parseTaskRoute} from '../ui/src/board/task-route.js';
import {dialog,input} from '../ui/src/ui.js';
import {ProductRepository} from './repository.js';
registerCore();
const root=document.querySelector('#app'),repository=new ProductRepository();
let board,session;
function report(error){dialog({title:'Не удалось выполнить действие',description:error.message});}
async function onboard(){
  const workspaces=await repository.client.request('/workspaces');
  const form=input('name','Название проекта','')+input('slug','Адрес проекта','',{placeholder:'my-product'})+input('key','Префикс задач','',{placeholder:'SPR'})+
    (workspaces.length?`<iq-select name="workspaceId" label="Пространство" value="${esc(workspaces[0].id)}">${workspaces.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</iq-select>`:input('workspace','Название пространства',''));
  dialog({title:'Создать проект',body:form,submitLabel:'Создать',onSubmit:async values=>{
    let workspaceId=values.get('workspaceId');
    if(!workspaceId)workspaceId=(await repository.client.request('/workspaces','POST',{name:values.get('workspace')})).id;
    const project=await repository.client.request('/projects','POST',{workspaceId,name:values.get('name'),slug:values.get('slug'),key:values.get('key')});
    session=await repository.initialize();location.hash='#tasks';await showProject(project.id);
  }});
}
async function showProject(id){
  if(board&&!await board.closeTask())return;
  board?.destroy();const project=session.projects.find(p=>p.id===id)||session.projects[0];
  if(!project){root.innerHTML='<main class="host-landing"><h1>Создадим первый проект</h1><p>Задачи, обсуждения и команда в одном месте.</p><button class="iq-btn primary" data-onboard>Создать проект</button></main>';root.querySelector('[data-onboard]').onclick=()=>onboard().catch(report);return;}
  const url=new URL(location.href);url.searchParams.set('project',project.slug);history.replaceState(null,'',url);
  root.innerHTML=`<div class="demo-shell"><header class="platform-header"><div class="platform-brand">
    ${ui.menu(`<button class="iq-btn ghost sm" aria-label="Выбрать пространство">${esc(project.workspaceName)}${icon('down',14)}</button>`,[...new Map(session.projects.map(p=>[p.workspaceId,p])).values()].map(p=>({label:esc(p.workspaceName),action:'project:'+p.id})))}
    <span class="platform-divider">/</span>${ui.menu(`<button class="iq-btn ghost sm" aria-label="Выбрать проект"><span class="iq-avatar sm">${esc(project.name.slice(0,1))}</span>${esc(project.name)}${icon('down',14)}</button>`,session.projects.filter(p=>p.workspaceId===project.workspaceId).map(p=>({label:esc(p.name),action:'project:'+p.id})).concat([{label:'Создать проект',action:'create-project'}]))}
    <nav class="platform-navigation"><a href="#tasks" aria-current="page">Доска задач</a></nav></div>
    <div class="platform-global"><button class="iq-btn ghost icon sm" data-theme aria-label="Изменить тему">${icon('moon',18)}</button><button class="iq-btn ghost sm" data-logout>Выйти</button></div></header>
    <main class="platform-main"><section id="host-view" data-section="tasks"></section></main></div>`;
  root.querySelector('[data-theme]').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
  root.querySelector('[data-logout]').onclick=async()=>{if(board&&!await board.closeTask())return;await repository.client.request('/logout','POST');location.reload();};
  board=await mountTaskBoard(root.querySelector('#host-view'),{repository,project,canEdit:project.role!=='reader',canManageCatalogs:project.role==='admin'});
  const task=parseTaskRoute(location.hash);if(task)await board.openTask(task,{fromRoute:true});
}
root.addEventListener('iq-action',event=>{
  const action=String(event.detail.action||'');
  if(action.startsWith('project:')){void showProject(action.slice(8)).catch(report);}
  if(action==='create-project')void onboard().catch(report);
});
window.addEventListener('hashchange',()=>{const task=parseTaskRoute(location.hash);if(task)board?.openTask(task,{fromRoute:true});else board?.closeTask();});
try{session=await repository.initialize();const slug=new URL(location.href).searchParams.get('project');await showProject(session.projects.find(p=>p.slug===slug)?.id);}
catch(error){
  if(error.status===401)root.innerHTML='<main class="host-landing"><h1>Sprintique</h1><p>Войдите, чтобы открыть свои проекты.</p><a class="iq-btn primary" href="/auth/login">Войти</a></main>';
  else {root.innerHTML='<main class="host-landing"><h1>Не удалось открыть Sprintique</h1><p role="alert"></p></main>';root.querySelector('[role=alert]').textContent=error.message;}
}
