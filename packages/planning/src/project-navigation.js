import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {formDialog} from './dialog.js';
import {readProjectContext} from './navigation-model.js';
/** Product-shell composition. The host supplies identities, allowed destinations and routing. */
export function mountProjectNavigation(root,{current,profile,projects,onSwitch,onAccount,onSignOut,onSettings,onTeam,onTheme}){
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер навигации.');
  current=readProjectContext(current);
  registerCore();const events=new AbortController();let disposed=false,dialog=null,switching=false;
  root.classList.add('pn-platform-header');
  root.innerHTML=`<a href="#tasks" class="site-brand" data-route="tasks" aria-label="Sprintique — доска задач"><span>Sprintique</span></a><button type="button" class="iq-btn ghost sm pn-context-trigger" data-context-switch aria-label="Сменить пространство или проект"><span data-space-name></span><span aria-hidden="true">/</span><strong data-project-name></strong>${icon('down',16)}</button><nav class="iq-work-navigation" aria-label="Разделы проекта"><a href="#planning" data-route="planning">Планирование</a><a href="#tasks" data-route="tasks">Доска задач</a><a href="#maps" data-route="maps">Карты</a></nav><div class="pn-personal-navigation">${ui.ib('sliders','Настройки проекта','ghost sm','data-project-settings data-route="settings"')}${ui.ib('sun','Переключить тему','ghost sm','data-theme-toggle')}${ui.menu(`<button type="button" class="iq-btn ghost icon sm" aria-label="Открыть профиль">${ui.avatar(esc(profile.initials||'Я'),1)}</button>`,[{label:profile.name,action:'account'},{label:'Команда проекта',action:'team'},{label:'Светлая / тёмная тема',action:'theme'},{label:'Выйти',action:'signout',danger:true}])}</div>`;
  function update(value){if(disposed)return;value=readProjectContext(value);current=value;root.querySelector('[data-space-name]').textContent=value.workspaceName;root.querySelector('[data-project-name]').textContent=value.projectName;root.querySelector('[data-context-switch]').title=value.workspaceName+' / '+value.projectName;}
  update(current);
  async function switchProject(){
    if(disposed||dialog||switching)return;registerAdvanced();
    dialog=formDialog({title:'Пространства и проекты',body:'<iq-remote-combobox label="Найти пространство или проект" placeholder="Название проекта или пространства"></iq-remote-combobox><p class="iq-helper">Выбор проекта меняет весь рабочий контекст. Ваши задачи остаются в своём проекте.</p>',submitLabel:'Открыть проект',
      canClose:()=>!switching,submit:async form=>{const id=form.querySelector('iq-remote-combobox').value;if(!id)throw Error('Выберите проект.');switching=true;
        try{const next=await onSwitch(id);if(next===false)throw Error('Сначала завершите открытое редактирование. Текущий проект не изменён.');const confirmed=readProjectContext(next);if(!disposed)update(confirmed);return true;}finally{switching=false;}},
      onMount:form=>{const picker=form.querySelector('iq-remote-combobox');picker.provider=projects;picker.value=current.id;},onClose:()=>{dialog=null;}});
  }
  root.addEventListener('click',event=>{if(event.target.closest('[data-context-switch]'))void switchProject();if(event.target.closest('[data-project-settings]'))onSettings?.();if(event.target.closest('[data-theme-toggle]'))onTheme?.();},{signal:events.signal});
  root.addEventListener('iq-action',event=>{if(event.detail.action==='account')onAccount?.();if(event.detail.action==='signout')onSignOut?.();if(event.detail.action==='team')onTeam?.();if(event.detail.action==='theme')onTheme?.();},{signal:events.signal});
  return {update,readyToLeave:()=>!switching&&!dialog,destroy(){if(disposed)return true;if(switching||dialog&&dialog.close()===false)return false;disposed=true;events.abort();root.replaceChildren();return true;}};
}
