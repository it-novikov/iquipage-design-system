import {BrowserAttachmentAdapter} from '/src/board/attachment-idb.js';
import {installQuickSearch} from './quick-search.js';
import {seedUXPreview} from './ux-preview-data.js';
import {previewNavigation,installWorkspaceNavigation,renderShortcutGuide} from './workspace-navigation.js';
import {HttpAttachmentAdapter} from '/src/board/attachment-http.js';
import {mountProjectTaskSettings} from '/src/board/project-settings.js';
import {parseTaskRoute} from '/src/board/task-route.js';
import {mountTaskBoard} from './task-board.js';
import {installNavigation,renderLanding} from './navigation.js';
import {mountMaps} from '/src/maps.js';
import {HttpRepository,BrowserRepository} from '/src/repository.js';
import {WorkflowRuntime,HttpRuntime,localTasksAdapter} from '/src/runtime.js';
import {createMap,remapDocument} from '/src/model.js';
import {BUILTIN_TEMPLATES} from '/src/templates.js';
import {icon,esc,pretty} from '/src/ui.js';
const params=new URLSearchParams(location.search),standalone=params.get('standalone')==='1',browser=params.get('storage')==='browser';
const guest=params.get('guest')==='1',catalog=previewNavigation(params),{project}=catalog;
const shell=document.querySelector('#app'),hostView=document.querySelector('#host-view'),featureRoot=document.querySelector('#feature');
let feature=null,taskBoard=null,settingsView=null,section=standalone?'maps':'tasks',navigationGeneration=0;
const boardState={};
const canLeave=async()=>{if(settingsView&&!settingsView.readyToLeave())return false;return !taskBoard?.readyToLeave||await taskBoard.readyToLeave();};
installNavigation({standalone,guest,readyToLeave:async()=>await canLeave()&&(!feature||await feature.readyToLeave())});
shell.dataset.standalone=String(standalone);
if(standalone)document.title='IQUIPAGE Maps';
if(guest){featureRoot.hidden=true;renderLanding(hostView);history.replaceState(null,'','#landing');}
else await startWorkspace();
async function startWorkspace(){
  const repository=browser?new BrowserRepository('iquipage-maps-local'):new HttpRepository('/api');
  if(!browser)await repository.refreshCapabilities();
  const attachmentAdapter=browser?new BrowserAttachmentAdapter(repository):repository.capabilities.attachments?new HttpAttachmentAdapter(repository.baseURL):null;
  if(browser)await attachmentAdapter.collect();
  const runtime=browser?new WorkflowRuntime(repository,{createTasks:localTasksAdapter(repository)}):new HttpRuntime(repository);
  const context={workspaceId:'local-workspace',actorId:repository.capabilities.actorId||'local-user'};
  if(browser&&params.get('uxPreview')==='1')await seedUXPreview(repository,project);
  if(!(await repository.list('maps',project.id)).length){
    const template=BUILTIN_TEMPLATES.find(t=>t.id==='ideas');
    const map=createMap({projectId:project.id,title:'Как сделать первый шаг понятнее?',kind:'session',document:remapDocument(template.document),templateOrigin:{id:template.id,version:template.version}});
    map.demoSeed=true;await repository.write('maps',map,0);
  }
  let pendingTaskId=params.get('task');
  feature=await mountMaps(featureRoot,{project,repository,runtime,context,permissions:{read:true,edit:true,run:true,approve:true,manageAutomation:true},onOpenTasks:async target=>{if(target.projectId!==project.id)throw Error('Задача относится к другому проекту.');pendingTaskId=target.focusTaskId||null;await go('tasks');}});
  window.mapsDemo={feature,repository,runtime,project}; // Explicit example diagnostics only.
  const workspaceNavigation=installWorkspaceNavigation({catalog,readyToLeave:async()=>await canLeave()&&await feature.readyToLeave(),go});
  installQuickSearch({repository,project,projects:browser?catalog.projects:[project],readyToOpen:async()=>await canLeave()&&await feature.readyToLeave(),onOpen:async item=>{
    if(!(await canLeave())||!(await feature.readyToLeave()))return;
    if(item.projectId&&item.projectId!==project.id){await workspaceNavigation.openProject(item.projectId,{section:item.kind==='map'?'maps':'tasks',taskId:item.kind==='task'?item.id:null,mapId:item.kind==='map'?item.id:null});return;}
    if(item.kind==='task'){if(section!=='tasks')await navigate('tasks');await taskBoard?.openTask(item.id);}
    else if(item.kind==='map'){await navigate('maps');await feature.openMap(item.id);}
    else await navigate(item.id);
  }});
  async function go(next){if(!(await canLeave())||!(await feature.readyToLeave()))return;location.hash=next;}
  async function navigate(next){
    const generation=++navigationGeneration;
    const routeTask=parseTaskRoute(next);
    if(taskBoard&&routeTask){const previous=taskBoard.currentTask();if(!(await taskBoard.openTask(routeTask,{fromRoute:true})))history.replaceState(null,'',previous?'#/task/'+encodeURIComponent(previous):'#tasks');return;}
    if(taskBoard?.currentTask()&&!(await taskBoard.closeTask())){history.replaceState(null,'','#/task/'+encodeURIComponent(taskBoard.currentTask()));return;}
    if(!(await canLeave())||!(await feature.readyToLeave())){history.replaceState(null,'','#'+section);return;}
    if(generation!==navigationGeneration)return;
    taskBoard?.destroy();taskBoard=null;
    settingsView?.destroy();settingsView=null;
    section=routeTask?'tasks':['tasks','maps','spaces','projects','help/shortcuts','settings','settings/automation','settings/tags','settings/releases','settings/templates'].includes(next)?next:(standalone?'maps':'tasks');
    hostView.dataset.section=section;featureRoot.hidden=section!=='maps';hostView.hidden=section==='maps';
    document.querySelector('.skip-link').href=section==='maps'?'#feature':'#host-view';
    document.querySelectorAll('.platform-navigation a,#settings-link').forEach(a=>{if(a.hash==='#'+section||(a.id==='settings-link'&&section.startsWith('settings/')))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(!routeTask&&location.hash!=='#'+section)history.replaceState(null,'','#'+section);
    if(section==='maps'){if(params.get('map')){const id=params.get('map');params.delete('map');await feature.openMap(id);}return;}
    if(section==='tasks'){
      const board=await mountTaskBoard(hostView,{repository,project,attachmentAdapter,canManageCatalogs:true,viewState:boardState,onOpenMap:async id=>{await feature.openMap(id);await go('maps');}});
      if(generation!==navigationGeneration){board.destroy();return;}taskBoard=board;
      if(routeTask)await board.openTask(routeTask,{fromRoute:true,fullscreen:!history.state?.taskDrawer});
      if(pendingTaskId){const id=pendingTaskId;pendingTaskId=null;await board.openTask(id);}
    }else if(section==='spaces'||section==='projects')workspaceNavigation.renderDirectory(hostView,section);
    else if(section==='help/shortcuts')renderShortcutGuide(hostView);
    else if(['settings/tags','settings/releases','settings/templates'].includes(section)){
      const mounted=await mountProjectTaskSettings(hostView,{repository,project,section:section.split('/')[1],onBack:()=>go('settings')});
      if(generation!==navigationGeneration){mounted.destroy();return;}
      settingsView=mounted;
    }else if(section==='settings/automation'){
      const maps=await repository.list('maps',project.id),rules=await repository.list('rules',project.id);
      if(generation!==navigationGeneration)return;
      hostView.innerHTML=`<div class="host-settings"><a class="iq-link" href="#settings">${icon('left',16)} Настройки проекта</a><h1>Автоматизация</h1><p>Правило настраивается на карте сценария. Повседневная работа остаётся на доске задач.</p><div class="iq-list">${maps.filter(m=>m.flow).map(m=>`<button class="iq-list-item host-automation-map" data-automation-map="${esc(m.id)}"><span>${icon('workflow',20)}</span><div><b>${esc(m.title)}</b><small>Правил: ${rules.filter(r=>r.mapId===m.id).length}${m.status==='archived'?' · В архиве':''}</small></div>${icon('chevron',16)}</button>`).join('')||'<p class="iq-helper">На карте добавьте сценарий действий, затем настройте его запуск.</p>'}</div><a class="iq-btn secondary sm" href="#maps">Открыть карты</a></div>`;
      hostView.querySelectorAll('[data-automation-map]').forEach(b=>b.addEventListener('click',async()=>{await feature.openMap(b.dataset.automationMap);await feature.switchView('workflow');await feature.automationActions.automations();await go('maps');}));
    }else{
      hostView.innerHTML=`<div class="host-settings"><h1>Настройки проекта</h1><a class="command-entry" href="#settings/tags"><span><b>Теги</b><small>Единые названия и цвета для задач проекта</small></span></a><a class="command-entry" href="#settings/releases"><span><b>Релизы</b><small>Плановые выпуски и связанные задачи</small></span></a><a class="command-entry" href="#settings/templates"><span><b>Шаблоны задач</b><small>Общее содержание и переопределения типов</small></span></a><a class="command-entry" href="#settings/automation">${icon('bolt',22)}<span><b>Автоматизация</b><small>Правила запуска, сценарии и история доставки</small></span>${icon('chevron',18)}</a><div class="iq-setting-row"><div><b>Хранение</b><p>${browser?'IndexedDB этого браузера':'Локальный сервер с сохранением на диск'}</p></div></div><div class="iq-setting-row"><div><b>LLM</b><p>${repository.capabilities.llm?'Подключён серверный gateway.':'Не подключено. Без gateway внешние вызовы недоступны.'}</p></div></div><details class="iq-accordion"><summary>Возможности стенда ${icon('plus',16)}</summary><div>${pretty(repository.capabilities)}</div></details></div>`;
    }
    hostView.focus({preventScroll:true});
  }
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)).catch(console.error));
  document.querySelector('#theme').innerHTML=icon('sun',18);
  document.querySelector('#theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';});
  await navigate(location.hash.slice(1)||(standalone?'maps':'tasks'));
}
