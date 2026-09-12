import {mountProjectNavigation} from '../src/project-navigation.js';
import {releaseFields,readReleaseFields,settingsDialog} from '../src/release-dialogs.js';
import {addDays,todayInZone} from '../src/date-value.js';
import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {mountPlanning} from '../src/index.js';
import {formDialog} from '../src/dialog.js';
import {fixtureRepository} from './fixture-repository.js';
import {createFixtureAdapter} from './fixture-adapter.js';
import {project as defaultProject,memberships} from './fixture-projection.js';
import {seed} from './seed.js';
import {openTaskDialog} from '../../maps/src/board/task-dialog.js';
import {mountTaskBoard} from '../../maps/src/board/board.js';
import {BrowserAttachmentAdapter} from '../../maps/src/board/attachment-idb.js';
import {createTask} from '../../maps/src/tasks.js';
import {mountMaps} from '../../maps/src/maps.js';
import {WorkflowRuntime,localTasksAdapter} from '../../maps/src/runtime.js';
registerCore();
const params=new URLSearchParams(location.search),namespace='sprintique-pn2-fixture-'+(params.get('fixture')||'local');
let savedView={};try{savedView=JSON.parse(sessionStorage.getItem(namespace+'-view')||'{}');}catch{}
const contexts=[{id:'default',workspaceId:'pn2-fixture-space',workspaceName:'Моя команда',project:{...defaultProject,name:'Новый продукт'}},{id:'mobile',workspaceId:'pn2-fixture-space',workspaceName:'Моя команда',project:{id:'pn-mobile',name:'Мобильное приложение',key:'MOB'}},{id:'studio',workspaceId:'pn2-fixture-studio',workspaceName:'Студия',project:{id:'pn-studio',name:'Клиентский проект',key:'STU'}}];
const contextProjection=c=>({id:c.id,workspaceName:c.workspaceName,projectName:c.project.name});
let activeContext=contexts.find(c=>c.id===params.get('context'))||contexts[0],project=activeContext.project;
const contextNamespace=c=>c.id==='default'?namespace:namespace+'-context-'+c.id;
let repository=fixtureRepository(contextNamespace(activeContext),{workspaceId:activeContext.workspaceId,projectId:project.id}),adapter=createFixtureAdapter(repository,{project});
const root=document.querySelector('#feature'),state={mode:savedView.mode,temporal:savedView.temporal},contextViews=new Map();
window.addEventListener('beforeunload',()=>{try{sessionStorage.setItem(namespace+'-view',JSON.stringify({mode:state.mode,temporal:state.temporal}));}catch{}});
let attachments=new BrowserAttachmentAdapter(repository);
const shell=mountProjectNavigation(document.querySelector('.pn-platform-header'),{
 current:contextProjection(activeContext),profile:{name:'Демонстрационный участник',initials:'Д'},
 projects:async({query='',signal})=>{signal?.throwIfAborted();return {options:contexts.filter(c=>(c.workspaceName+' '+c.project.name).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).map(c=>({value:c.id,label:c.project.name,description:c.workspaceName})),nextCursor:null};},
 onSwitch:switchContext,onSettings:()=>{location.hash='settings';},onAccount:()=>showProfile(),onSignOut:()=>leaveDemo(),onTeam:()=>showTeam()
});
let mounted=null,current='planning',routing=false,boardGroup=null,dialogOpen=false;
document.querySelector('[data-theme-toggle]').innerHTML=icon('sun',18);
document.querySelector('[data-theme-toggle]').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
await seed(repository,project);
async function openTask(id,{onChanged=()=>{},onClose=()=>{}}={}) {
  if(dialogOpen)throw Error('Сначала закройте открытую задачу.');dialogOpen=true;
  try{
    const task=id?await repository.read('tasks',id,project.id):null;
    if(id&&!task)throw Error('Задача не найдена.');
    const el=await openTaskDialog(task,{repository,project,tasks:await repository.list('tasks',project.id),attachmentAdapter:attachments,onSaved:async()=>{await onChanged();},onOpenTask:undefined});
    el.addEventListener('iq-close',()=>{dialogOpen=false;onClose();},{once:true});
    return {element:el,close:()=>el.taskController.close()};
  }catch(error){dialogOpen=false;throw error;}
}
async function createRelease({onChanged=()=>{},onClose=()=>{}}={}) {
  const settings=await adapter.settings({projectId:project.id});
  const today=todayInZone(settings.timeZone||'UTC'),start=settings.format==='timeboxed'?today:null;
  const initial={format:settings.format,start,end:start?addDays(start,settings.days-1):null};
  return formDialog({title:'Новый релиз',body:releaseFields(initial),submitLabel:'Создать релиз',
    submit:async form=>{
      const value=readReleaseFields(form);
      await repository.write('releases',{id:'pn-release-'+crypto.randomUUID(),projectId:project.id,name:value.name,status:'planned',planningPhase:'planned',planningFormat:value.format,planningStart:value.start,targetDate:value.end,deadline:value.deadline,revision:0},0);
      await onChanged({message:'Релиз создан в тестовом хранилище.'});
    },onClose});
}

function createPlanningTask({groupId='backlog',onChanged,onClose}){
  return formDialog({title:'Новая задача',body:`${ui.field('Название задачи','',{name:'title',required:true,max:240,placeholder:'Что нужно сделать?'})}${ui.select('Тип',[{value:'task',label:'Задача'},{value:'bug',label:'Баг'},{value:'epic',label:'Эпик'}],'name="type" value="task"')}${ui.select('Подготовленность',[{value:'draft',label:'Черновик'},{value:'ready',label:'Готова к работе'}],'name="preparation" value="draft"')}<p class="iq-helper">Задача будет видна участникам проекта. Описание, файлы и обсуждения доступны в полном документе.</p>`,submitLabel:'Создать задачу',
    submit:async form=>{
      const title=form.querySelector('[name=title]').value.trim(),type=form.querySelector('[name=type]').value,preparation=form.querySelector('[name=preparation]').value;
      const target=(await repository.list('releases',project.id)).find(r=>r.id===groupId);
      if(target?.planningPhase==='active')throw Error('Создайте задачу в бэклоге и явно добавьте её в активный состав.');
      const task={...createTask({projectId:project.id,title,type}),preparation,planningAdmission:false,releaseId:target?.id||null,releaseAssignment:target?'assigned':'none'};
      await repository.write('tasks',task,0);await onChanged({message:'Задача создана. Полное описание доступно по её названию.'});
    },onClose});
}
async function navigate(section){
  if(routing)return;routing=true;
  try{
    if(dialogOpen||mounted?.readyToLeave&&!(await mounted.readyToLeave())){history.replaceState(null,'','#'+current);return;}
    const left=await mounted?.destroy();if(left===false){history.replaceState(null,'','#'+current);return;}mounted=null;root.innerHTML='';current=['planning','tasks','maps','settings'].includes(section)?section:'planning';
    document.querySelectorAll('[data-route]').forEach(a=>{if(a.dataset.route===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(current==='planning')mounted=await mountPlanning(root,{adapter,project,viewState:state,onOpenTask:openTask,onCreateTask:createPlanningTask,onCreateRelease:createRelease,onOpenBoard:async group=>{boardGroup=group;location.hash='tasks';}});
    else if(current==='tasks'){
      const boardRepository=Object.create(repository);
      boardRepository.list=async(name,pid)=>{const values=await repository.list(name,pid);if(name!=='tasks')return values;const member=memberships(values);return values.filter(t=>t.planningAdmission&&!['accepted','cancelled'].includes(t.planningOutcome)&&(!boardGroup||member.get(t.id)===boardGroup));};
      boardRepository.write=async(name,value,rev,opts)=>repository.write(name,name==='tasks'&&!rev?{...value,preparation:'ready',planningAdmission:true}:value,rev,opts);
      mounted=await mountTaskBoard(root,{repository:boardRepository,project,attachmentAdapter:attachments,viewState:{},canManageCatalogs:true});
    }else if(current==='maps')mounted=await mountMaps(root,{repository,project,storageLabel:'Сохранено в этом браузере',runtime:new WorkflowRuntime(repository,{createTasks:localTasksAdapter(repository)}),context:repository.context,permissions:{read:true,edit:true,run:false,approve:false,manageAutomation:false},onOpenTasks:async target=>{if(target?.focusTaskId)await openTask(target.focusTaskId);else location.hash='tasks';}});
    else root.innerHTML=`<section class="pn-settings"><h1>Настройки проекта</h1>${ui.btn('Как планируем работу','secondary sm','calendar','data-planning-settings')}<p class="iq-helper">В этой сборке проверяется Планирование. Настройки доступа и автоматизация подключаются новым backend.</p>${ui.btn('Вернуться к планированию','secondary','left','data-back-planning')}</section>`;
    root.querySelector('[data-planning-settings]')?.addEventListener('click',async()=>{if(dialogOpen)return;dialogOpen=true;try{await settingsDialog({adapter,projectId:project.id,onClose:()=>{dialogOpen=false;}});}catch(e){dialogOpen=false;showError(e);}});
    root.querySelector('[data-back-planning]')?.addEventListener('click',()=>{location.hash='planning';});
    if(location.hash!=='#'+current)history.replaceState(null,'','#'+current);
  }finally{routing=false;}
}
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)).catch(showError));
document.querySelectorAll('[data-route=tasks]').forEach(a=>a.addEventListener('click',()=>{boardGroup=null;}));
function showError(error){window.planningFixture.routeError=error.stack;root.innerHTML=ui.alert('Не удалось открыть раздел',esc(error.message),'danger');}
// Fixture diagnostics are isolated to this entry and are never exported by @sprintique/planning-ui.
window.planningFixture={get repository(){return repository;},get adapter(){return adapter;},get project(){return project;},get view(){return mounted;}};
await navigate(location.hash.slice(1)||'planning');

// Context switching is an isolated demo of the host contract, not tenant authentication.
async function switchContext(id){
  const next=contexts.find(c=>c.id===id);if(!next)throw Error('Проект недоступен.');if(next===activeContext)return contextProjection(next);
  if(routing||dialogOpen||mounted?.readyToLeave&&!(await mounted.readyToLeave()))return false;
  const nextRepository=fixtureRepository(contextNamespace(next),{workspaceId:next.workspaceId,projectId:next.project.id});
  try{await seed(nextRepository,next.project);}catch(error){(await nextRepository.ready).close();throw error;}
  if(dialogOpen||mounted?.readyToLeave&&!(await mounted.readyToLeave())){(await nextRepository.ready).close();return false;}
  if(await mounted?.destroy()===false){(await nextRepository.ready).close();return false;}
  const oldRepository=repository;contextViews.set(activeContext.id,structuredClone(state));mounted=null;
  activeContext=next;project=next.project;repository=nextRepository;adapter=createFixtureAdapter(repository,{project});attachments=new BrowserAttachmentAdapter(repository);boardGroup=null;
  for(const key of Object.keys(state))delete state[key];Object.assign(state,contextViews.get(next.id)||{});
  const url=new URL(location.href);url.searchParams.set('context',next.id);history.replaceState(null,'',url);
  await navigate(current);(await oldRepository.ready).close();return contextProjection(next);
}
function showProfile(){
  if(dialogOpen)return;dialogOpen=true;
  formDialog({title:'Профиль',body:`<div class="row">${ui.avatar('Д',1)}<div><strong>Демонстрационный участник</strong><p class="iq-helper">${esc(activeContext.workspaceName)} / ${esc(project.name)}</p></div></div><p>Это локальный тестовый профиль. Учётная запись, личные настройки и полномочия подключаются приложением через новый backend.</p>`,onClose:()=>{dialogOpen=false;}});
}
function showTeam(){
  if(dialogOpen)return;dialogOpen=true;
  repository.list('tasks',project.id).then(tasks=>{
    const names=[...new Set(tasks.map(t=>t.owner).filter(Boolean))];
    formDialog({title:'Команда проекта',body:`<p class="iq-helper">Участники тестовых задач. Это не список реальных аккаунтов или выданных прав.</p><div class="iq-list">${names.map(name=>`<div class="iq-list-item">${ui.avatar(esc(name.split(' ').map(s=>s[0]).slice(0,2).join('')),1)}<div>${esc(name)}</div></div>`).join('')}</div><p class="iq-helper">Профили агентов, подключения и назначения по principal ID описаны в контракте R3. Исполнитель LLM в этой сборке не подключён.</p>`,onClose:()=>{dialogOpen=false;}});
  }).catch(error=>{dialogOpen=false;showError(error);});
}
async function leaveDemo(){
  if(dialogOpen||mounted?.readyToLeave&&!(await mounted.readyToLeave()))return;
  dialogOpen=true;let confirmed=false;
  formDialog({title:'Выйти из демонстрации?',body:'<p>Сохранённые тестовые данные останутся в этом браузере. Серверная сессия к этой сборке не подключена.</p>',submitLabel:'Выйти',submit:()=>{confirmed=true;},onClose:async()=>{
    dialogOpen=false;if(!confirmed)return;if(await mounted?.destroy()===false)return;mounted=null;
    const header=document.querySelector('.pn-platform-header');header.hidden=true;
    root.innerHTML=`<section class="pn-settings"><h1>Sprintique</h1><p>Общее место для задач, идей и работы команды.</p><p class="iq-helper">Стартовый экран демонстрации. Авторизация подключается новой платформой.</p>${ui.btn('Продолжить демонстрацию','primary','','data-resume-demo')}</section>`;
    root.querySelector('[data-resume-demo]').onclick=()=>{header.hidden=false;void navigate('tasks');};
  }});
}
