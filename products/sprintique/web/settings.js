import {ui} from '@iquipage/web/core';
import {mountProjectTaskSettings} from '../ui/src/board/project-settings.js';
import {settingsDialog} from '../ui/planning/src/release-dialogs.js';
import {mountMembers} from './members.js';
import {mountAgents} from './agents.js';
import {editProjectProfile,editWorkspace} from './project-profile.js';
import {dialog} from '../ui/src/ui.js';
import {mountOperations} from './operations.js';

export async function mountSettings(root,{repository,project,adapter,onChanged=()=>{}}){
  let mounted=null,closed=false,planningDialog=null,busy=false;
  async function home(){if(closed||mounted&&!mounted.readyToLeave())return;mounted?.destroy();mounted=null;
    root.innerHTML=`<section class="host-settings task-settings-page"><h1>Настройки проекта</h1><div class="iq-list"><div class="iq-list-item"><span>Теги и цвета</span>${ui.btn('Открыть','secondary sm','','data-settings="tags"')}</div><div class="iq-list-item"><span>Шаблоны задач</span>${ui.btn('Открыть','secondary sm','','data-settings="templates"')}</div><div class="iq-list-item"><span>Формат и период планирования</span>${ui.btn('Настроить','secondary sm','calendar',`data-settings="planning" ${project.role!=='admin'?'disabled':''}`)}</div></div></section>`;
    root.querySelector('.iq-list').insertAdjacentHTML('beforeend',`<div class="iq-list-item"><span>Участники и приглашения</span>${ui.btn('Открыть','secondary sm','','data-settings="members"')}</div>`);
    root.querySelector('.iq-list').insertAdjacentHTML('beforeend',`<div class="iq-list-item"><span>Агенты и подтверждения</span>${ui.btn('Открыть','secondary sm','','data-settings="agents"')}</div>`);
    if(project.role==='admin')root.querySelector('.iq-list').insertAdjacentHTML('beforeend',`<div class="iq-list-item"><span>Фоновые операции</span>${ui.btn('Открыть','secondary sm','','data-settings="operations"')}</div>`);
    root.querySelector('.iq-list').insertAdjacentHTML('beforeend',`<div class="iq-list-item"><span>Название и аватар проекта</span>${ui.btn('Изменить','secondary sm','','data-settings="profile" '+(project.role!=='admin'?'disabled':''))}</div><div class="iq-list-item"><span>Пространство</span>${ui.btn('Открыть','secondary sm','','data-settings="workspace"')}</div>`);
  }
  const abort=new AbortController();root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-settings]');if(!button||button.disabled||closed||busy)return;
    busy=true;button.disabled=true;
    try{
    if(['profile','workspace'].includes(button.dataset.settings)){
      const element=button.dataset.settings==='profile'?await editProjectProfile({repository,project,onChanged}):await editWorkspace({client:repository.client,workspaceId:project.workspaceId,onChanged});
      planningDialog={element};element.addEventListener('iq-close',()=>{planningDialog=null;},{once:true});return;
    }
    if(button.dataset.settings==='planning'){planningDialog=await settingsDialog({adapter,projectId:project.id,onClose:()=>{planningDialog=null;}});return;}
    if(button.dataset.settings==='members'){mounted=await mountMembers(root,{repository,project,onBack:home});return;}
    if(button.dataset.settings==='agents'){mounted=await mountAgents(root,{repository,project,onBack:home});return;}
    if(button.dataset.settings==='operations'){mounted=await mountOperations(root,{repository,project,onBack:home});return;}
    mounted=await mountProjectTaskSettings(root,{repository,project,section:button.dataset.settings,canManage:project.role==='admin',onBack:home});
    }catch(error){if(!closed){const element=dialog({title:'Не удалось открыть настройки',description:error.message});planningDialog={element};element.addEventListener('iq-close',()=>{planningDialog=null;},{once:true});}}
    finally{busy=false;button.disabled=false;if(closed){mounted?.destroy();planningDialog?.element.close(true);}}
  },{signal:abort.signal});
  await home();return {closeTask:async()=>!busy&&!planningDialog&&(!mounted||mounted.readyToLeave()),readyToLeave:()=>!busy&&!planningDialog&&(!mounted||mounted.readyToLeave()),destroy(){closed=true;abort.abort();mounted?.destroy();planningDialog?.element.close(true);root.replaceChildren();}};
}
