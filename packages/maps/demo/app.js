import {mountProjectTaskSettings} from '/src/board/project-settings.js';
import {mountTaskBoard} from './task-board.js';
import {installNavigation,renderLanding} from './navigation.js';
import {mountMaps} from '/src/maps.js';
import {HttpRepository,BrowserRepository} from '/src/repository.js';
import {WorkflowRuntime,HttpRuntime,localTasksAdapter} from '/src/runtime.js';
import {createMap,remapDocument} from '/src/model.js';
import {BUILTIN_TEMPLATES} from '/src/templates.js';
import {icon,esc,dialog,select,pretty} from '/src/ui.js';
const params=new URLSearchParams(location.search),standalone=params.get('standalone')==='1',browser=params.get('storage')==='browser';
const guest=params.get('guest')==='1',project={id:params.get('project')||'demo-product',name:'Команда продукта'};
const shell=document.querySelector('#app'),hostView=document.querySelector('#host-view'),featureRoot=document.querySelector('#feature');
let feature=null,taskBoard=null,settingsView=null,section=standalone?'maps':'tasks',navigationGeneration=0;
const boardState={};
const canLeave=async()=>{if(settingsView&&!settingsView.readyToLeave())return false;return !taskBoard?.readyToLeave||await taskBoard.readyToLeave();};
installNavigation({standalone,guest,readyToLeave:async()=>await canLeave()&&(!feature||await feature.readyToLeave())});
shell.dataset.standalone=String(standalone);
if(standalone){document.querySelector('.platform-brand b').textContent='IQUIPAGE Maps';document.title='IQUIPAGE Maps';document.querySelector('.platform-project').textContent='Личное пространство';}
if(guest){featureRoot.hidden=true;renderLanding(hostView);history.replaceState(null,'','#landing');}
else await startWorkspace();
async function startWorkspace(){
  const repository=browser?new BrowserRepository('iquipage-maps-local'):new HttpRepository('/api');
  if(!browser)await repository.refreshCapabilities();
  const runtime=browser?new WorkflowRuntime(repository,{createTasks:localTasksAdapter(repository)}):new HttpRuntime(repository);
  const context={workspaceId:'local-workspace',actorId:repository.capabilities.actorId||'local-user'};
  if(!(await repository.list('maps',project.id)).length){
    const template=BUILTIN_TEMPLATES.find(t=>t.id==='ideas');
    const map=createMap({projectId:project.id,title:'Как сделать первый шаг понятнее?',kind:'session',document:remapDocument(template.document),templateOrigin:{id:template.id,version:template.version}});
    map.demoSeed=true;await repository.write('maps',map,0);
  }
  feature=await mountMaps(featureRoot,{project,repository,runtime,context,permissions:{read:true,edit:true,run:true,approve:true,manageAutomation:true},onOpenTasks:()=>go('tasks')});
  window.mapsDemo={feature,repository,runtime,project}; // Explicit example diagnostics only.
  async function go(next){if(!(await canLeave())||!(await feature.readyToLeave()))return;location.hash=next;}
  async function navigate(next){
    const generation=++navigationGeneration;
    if(!(await canLeave())||!(await feature.readyToLeave())){history.replaceState(null,'','#'+section);return;}
    if(generation!==navigationGeneration)return;
    taskBoard?.destroy();taskBoard=null;
    settingsView?.destroy();settingsView=null;
    section=['tasks','maps','settings','settings/automation','settings/tags','settings/releases','settings/templates'].includes(next)?next:(standalone?'maps':'tasks');
    hostView.dataset.section=section;featureRoot.hidden=section!=='maps';hostView.hidden=section==='maps';
    document.querySelector('.skip-link').href=section==='maps'?'#feature':'#host-view';
    document.querySelectorAll('.platform-navigation a,#settings-link').forEach(a=>{if(a.hash==='#'+section||(a.id==='settings-link'&&section.startsWith('settings/')))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(location.hash!=='#'+section)history.replaceState(null,'','#'+section);
    if(section==='maps')return;
    if(section==='tasks'){
      const board=await mountTaskBoard(hostView,{repository,project,canManageCatalogs:true,viewState:boardState,onOpenMap:async id=>{await feature.openMap(id);await go('maps');}});
      if(generation!==navigationGeneration){board.destroy();return;}taskBoard=board;
    }else if(['settings/tags','settings/releases','settings/templates'].includes(section)){
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
  document.querySelector('#project').addEventListener('click',()=>dialog({title:'Открыть другой проект',body:select('id','Проект',project.id,[['demo-product','Команда продукта'],['demo-research','Исследования']]),submitLabel:'Перейти',onSubmit:async values=>{if(!(await canLeave())||!(await feature.readyToLeave()))throw Error('Сначала сохраните изменения.');const next=new URL(location.href);next.searchParams.set('project',values.get('id'));location.assign(next);}}));
  await navigate(location.hash.slice(1)||(standalone?'maps':'tasks'));
}
