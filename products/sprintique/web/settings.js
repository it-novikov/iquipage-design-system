import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {mountProjectTaskSettings} from '../ui/src/board/project-settings.js';
import {settingsDialog} from '../ui/planning/src/release-dialogs.js';
import {mountMembers} from './members.js';
import {mountAgents} from './agents.js';
import {editProjectProfile,editWorkspace} from './project-profile.js';
import {dialog} from '../ui/src/ui.js';
import {mountOperations} from './operations.js';

/** Settings sections are linkable pages (#settings/<id>) under one DS section navigation. */
export const SETTINGS_SECTIONS=[['general','Общие'],['tags','Теги'],['templates','Шаблоны задач'],['members','Участники'],['agents','Агенты'],['operations','Фоновые операции']];
export function settingsSectionFromHash(hash){const id=hash.match(/^#settings\/([a-z]+)$/)?.[1];return SETTINGS_SECTIONS.some(([key])=>key===id)?id:'general';}

export async function mountSettings(root,{repository,project,adapter,onChanged=()=>{}}){
  let mounted=null,closed=false,modal=null,busy=false,current=null;
  const admin=project.role==='admin',sections=SETTINGS_SECTIONS.filter(([id])=>id!=='operations'||admin);
  root.innerHTML=`<section class="host-settings settings-shell"><p class="settings-eyebrow">Настройки проекта · ${esc(project.name)}</p>
    <nav class="iq-work-navigation" aria-label="Разделы настроек">${sections.map(([id,label])=>`<a href="#settings/${id}" data-settings-section="${id}">${label}</a>`).join('')}</nav>
    <div class="settings-page" data-settings-page></div></section>`;
  const page=root.querySelector('[data-settings-page]');
  const track=element=>{modal={element};element.addEventListener('iq-close',()=>{modal=null;},{once:true});};
  function general(){
    const row=(label,hint,button)=>`<div class="iq-list-item"><div><b>${label}</b><p class="iq-helper">${hint}</p></div>${button}</div>`;
    page.innerHTML=`<section class="host-settings task-settings-page"><h1>Общие</h1><div class="iq-list">
      ${row('Название и аватар проекта','Адрес и префикс задач не меняются.',ui.btn('Изменить','secondary sm','',`data-settings-open="profile" ${admin?'':'disabled'}`))}
      ${row('Пространство','Название, часовой пояс и участники пространства.',ui.btn('Открыть','secondary sm','','data-settings-open="workspace"'))}
      ${row('Формат и период планирования','Гибкие релизы или спринты фиксированной длины.',ui.btn('Настроить','secondary sm','calendar',`data-settings-open="planning" ${admin?'':'disabled'}`))}
    </div></section>`;
    return null;
  }
  const mounts={
    general,
    tags:()=>mountProjectTaskSettings(page,{repository,project,section:'tags',canManage:admin}),
    templates:()=>mountProjectTaskSettings(page,{repository,project,section:'templates',canManage:admin}),
    members:()=>mountMembers(page,{repository,project}),
    agents:()=>mountAgents(page,{repository,project}),
    operations:()=>mountOperations(page,{repository,project})
  };
  /** Switches the section; refuses while the open page has unsaved work or a dialog is open. */
  async function showSection(id){
    if(closed||busy||modal)return false;if(!sections.some(([key])=>key===id))id='general';
    if(id===current)return true;
    if(mounted&&!mounted.readyToLeave())return false;
    busy=true;
    try{
      mounted?.destroy();mounted=null;page.replaceChildren();current=id;
      for(const link of root.querySelectorAll('[data-settings-section]')){if(link.dataset.settingsSection===id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
      mounted=await mounts[id]();
      if(closed)mounted?.destroy();
    }catch(error){if(!closed)page.innerHTML=`<div class="iq-alert danger" role="alert"><div class="message-copy"><b>Не удалось открыть раздел</b><p>${esc(error.message)}</p></div></div>`;}
    finally{busy=false;}
    return true;
  }
  const abort=new AbortController();
  root.addEventListener('click',async event=>{
    const link=event.target.closest('[data-settings-section]');
    if(link&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey){event.preventDefault();if(await showSection(link.dataset.settingsSection))history.replaceState(null,'','#settings/'+current);return;}
    const button=event.target.closest('[data-settings-open]');if(!button||button.disabled||closed||busy)return;
    busy=true;button.disabled=true;
    try{
      const kind=button.dataset.settingsOpen;
      if(kind==='planning')modal=await settingsDialog({adapter,projectId:project.id,onClose:()=>{modal=null;}});
      else track(kind==='profile'?await editProjectProfile({repository,project,onChanged}):await editWorkspace({client:repository.client,workspaceId:project.workspaceId,onChanged}));
    }catch(error){if(!closed)track(dialog({title:'Не удалось открыть настройки',description:error.message}));}
    finally{busy=false;button.disabled=false;}
  },{signal:abort.signal});
  await showSection(settingsSectionFromHash(location.hash));
  const ready=()=>!busy&&!modal&&(!mounted||mounted.readyToLeave());
  return {showSection,closeTask:async()=>ready(),readyToLeave:ready,
    destroy(){closed=true;abort.abort();mounted?.destroy();modal?.element?.close(true);root.replaceChildren();}};
}
