import {mountMaps} from '/src/maps.js';
import {HttpRepository,BrowserRepository} from '/src/repository.js';
import {WorkflowRuntime,HttpRuntime,localTasksAdapter} from '/src/runtime.js';
import {createMap,remapDocument,clone,uid} from '/src/model.js';
import {BUILTIN_TEMPLATES} from '/src/templates.js';
import {icon,esc,dialog,select,pretty} from '/src/ui.js';

const params=new URLSearchParams(location.search),standalone=params.get('standalone')==='1',browser=params.get('storage')==='browser';
const project={id:params.get('project')||'demo-product',name:'Команда продукта'};
let repository=browser?new BrowserRepository('iquipage-maps-local'):new HttpRepository('/api');
if(!browser)await repository.refreshCapabilities();
const runtime=browser?new WorkflowRuntime(repository,{createTasks:localTasksAdapter(repository)}):new HttpRuntime(repository);
const context={workspaceId:'local-workspace',actorId:repository.capabilities.actorId||'local-user'};
const shell=document.querySelector('#app'),hostView=document.querySelector('#host-view'),featureRoot=document.querySelector('#feature');
shell.dataset.standalone=String(standalone);
if(standalone){document.querySelector('.platform-brand b').textContent='IQUIPAGE Maps';document.title='IQUIPAGE Maps';document.querySelector('.platform-project').textContent='Личное пространство';document.querySelector('.platform-navigation').innerHTML='<a href="#maps" aria-current="page">Карты</a><a href="#tasks">Действия</a><a href="#settings">Настройки</a>';}
const existing=await repository.list('maps',project.id);
if(!existing.length){
  const template=BUILTIN_TEMPLATES.find(t=>t.id==='ideas');
  const map=createMap({projectId:project.id,title:'Как сделать первый шаг понятнее?',kind:'session',document:remapDocument(template.document),templateOrigin:{id:template.id,version:1}});
  map.demoSeed=true;await repository.write('maps',map,0);
}
const feature=await mountMaps(featureRoot,{project,repository,runtime,context,permissions:{read:true,edit:true,run:true,approve:true,manageAutomation:true},onOpenTasks:()=>navigate('tasks')});
// Diagnostic access is restricted to this explicit example, never the reusable module.
window.mapsDemo={feature,repository,runtime,project};
let section='maps';
async function navigate(next){
  if(!(await feature.readyToLeave())){history.replaceState(null,'','#'+section);return;}
  section=['overview','tasks','maps','materials','settings'].includes(next)?next:'maps';
  featureRoot.hidden=section!=='maps';hostView.hidden=section==='maps';
  document.querySelectorAll('.platform-navigation a').forEach(a=>{if(a.hash==='#'+section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(location.hash!=='#'+section)history.replaceState(null,'','#'+section);
  if(section==='maps')return;
  if(section==='tasks'){
    const tasks=await repository.list('tasks',project.id);
    hostView.innerHTML=`<h1>${standalone?'Следующие действия':'Доска задач'}</h1><p>Это самостоятельный экран оболочки, а не часть модуля карт. Здесь отображаются реальные задачи локального стенда, созданные после подтверждения запуска.</p><div class="host-grid">${[['planned','Запланировано'],['active','В работе'],['done','Готово']].map(([state,title])=>`<section class="host-column"><h2>${title} <span class="muted">${tasks.filter(t=>t.status===state).length}</span></h2>${tasks.filter(t=>t.status===state).map(t=>`<article class="host-task"><h3>${esc(t.title)}</h3><small>Из сценария карты</small><button type="button" class="iq-btn secondary sm" data-task="${t.id}" data-state="${state==='done'?'planned':'done'}">${state==='done'?'Вернуть':'Отметить готовым'}</button></article>`).join('')}${!tasks.some(t=>t.status===state)?'<p class="map-explanation">Пока нет задач</p>':''}</section>`).join('')}</div>`;
    hostView.querySelectorAll('[data-task]').forEach(b=>b.addEventListener('click',async()=>{try{const task=tasks.find(t=>t.id===b.dataset.task);await repository.write('tasks',{...task,status:b.dataset.state},task.revision);await navigate('tasks');}catch(e){dialog({title:'Задача не изменена',body:`<p>${esc(e.message)}</p>`});}}));
  }else if(section==='settings'){
    hostView.innerHTML=`<h1>Настройки</h1><p>Оболочка предоставляет проект, права и подключения. Модуль карт не забирает на себя эти обязанности.</p><div class="host-settings"><div class="iq-setting-row"><div><b>Режим хранения</b><p>${browser?'IndexedDB этого браузера':'Локальный сервер с сохранением на диск'}</p></div><span class="iq-badge outline">Reference</span></div><div class="iq-setting-row"><div><b>LLM-подключение</b><p>${repository.capabilities.llm?'Серверный gateway настроен. Секреты не передаются браузеру.':'Не подключено. Нужен серверный MAPS_LLM_GATEWAY и адаптер выбранного провайдера.'}</p></div></div><div class="iq-setting-row"><div><b>Совместная работа</b><p>Сервис присутствия, общие голоса и совместное редактирование не подключены.</p></div></div><details class="iq-accordion"><summary>Доступные серверные возможности ${icon('plus',16)}</summary><div>${pretty(repository.capabilities)}</div></details><p class="map-explanation">Эти настройки не меняют реальные настройки Sprintique. Интеграционная граница описана в пакете модуля.</p></div>`;
  }else if(section==='overview'){
    const maps=await repository.list('maps',project.id),tasks=await repository.list('tasks',project.id);
    hostView.innerHTML=`<h1>Обзор проекта</h1><p>Навигация платформы остаётся на месте. Карта — одна из рабочих возможностей проекта, рядом с задачами и материалами.</p><div class="host-grid"><article class="iq-card"><h3>Карты</h3><p>${maps.filter(m=>m.status!=='archived').length} активных карт</p><a href="#maps" class="iq-link">Открыть карты</a></article><article class="iq-card"><h3>Действия</h3><p>${tasks.length} задач в локальном стенде</p><a href="#tasks" class="iq-link">Открыть задачи</a></article><article class="iq-card"><h3>Архив</h3><p>${maps.filter(m=>m.status==='archived').length} сохранённых итогов</p><a href="#maps" class="iq-link">Вернуться к картам</a></article></div>`;
  }else hostView.innerHTML='<h1>Материалы проекта</h1><p>Этот раздел предоставляет платформа. В тестовой оболочке файловое хранилище не подключено. Изображения и локальный импорт на самой карте доступны независимо.</p><a class="iq-link" href="#maps">Вернуться к картам</a>';
  hostView.focus({preventScroll:true});
}
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)).catch(console.error));
document.querySelector('#theme').innerHTML=icon('sun',18);
document.querySelector('#theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';});
document.querySelector('#project').addEventListener('click',()=>dialog({title:'Открыть другой проект',description:'Одни и те же компоненты работают с разными пространствами данных.',body:select('id','Проект',project.id,[['demo-product','Команда продукта'],['demo-research','Исследования']]),submitLabel:'Перейти',onSubmit:async values=>{if(!(await feature.readyToLeave()))throw Error('Сначала сохраните изменения.');const next=new URL(location.href);next.searchParams.set('project',values.get('id'));location.assign(next);}}));
await navigate(location.hash.slice(1)||'maps');
