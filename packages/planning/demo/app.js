import {releaseFields,readReleaseFields,settingsDialog} from '../src/release-dialogs.js';
import {addDays} from '../src/date-value.js';
import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {mountPlanning} from '../src/index.js';
import {formDialog} from '../src/dialog.js';
import {fixtureRepository} from './fixture-repository.js';
import {createFixtureAdapter} from './fixture-adapter.js';
import {project,memberships} from './fixture-projection.js';
import {seed} from './seed.js';
import {openTaskDialog} from '../../maps/src/board/task-dialog.js';
import {mountTaskBoard} from '../../maps/src/board/board.js';
import {BrowserAttachmentAdapter} from '../../maps/src/board/attachment-idb.js';
import {createTask} from '../../maps/src/tasks.js';
import {mountMaps} from '../../maps/src/maps.js';
import {WorkflowRuntime,localTasksAdapter} from '../../maps/src/runtime.js';
registerCore();
const params=new URLSearchParams(location.search),namespace='sprintique-pn2-fixture-'+(params.get('fixture')||'local');
const repository=fixtureRepository(namespace),adapter=createFixtureAdapter(repository),root=document.querySelector('#feature'),state={};
const attachments=new BrowserAttachmentAdapter(repository);
let mounted=null,current='planning',routing=false,boardGroup=null,dialogOpen=false;
document.querySelector('[data-theme-toggle]').innerHTML=icon('sun',18);
document.querySelector('[data-theme-toggle]').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
await seed(repository);
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
  const today=new Date().toISOString().slice(0,10),start=settings.format==='timeboxed'?today:null;
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
    }else if(current==='maps')mounted=await mountMaps(root,{repository,project,runtime:new WorkflowRuntime(repository,{createTasks:localTasksAdapter(repository)}),context:repository.context,permissions:{read:true,edit:true,run:false,approve:false,manageAutomation:false},onOpenTasks:async()=>{location.hash='tasks';}});
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
window.planningFixture={repository,adapter,project,get view(){return mounted;}};
await navigate(location.hash.slice(1)||'planning');
