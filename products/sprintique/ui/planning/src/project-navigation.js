import {registerCore,ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {formDialog} from './dialog.js';
import {readProjectContext} from './navigation-model.js';
const ROUTES=[['tasks','Доска задач'],['planning','Планирование'],['maps','Карты']];
/** Product-shell composition (UX R3). The host supplies identities, allowed destinations and routing.
 *  Sections stay visible as text at every width; the host marks the current one with setRoute. */
export function mountProjectNavigation(root,{current,profile,projects,onSwitch,onAccount,onSignOut,onTeam,onTheme,onSearch,onCreateProject,onCreateWorkspace}){
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер навигации.');
  current=readProjectContext(current);
  registerCore();const events=new AbortController();let disposed=false,dialog=null,switching=false;
  root.classList.add('pn-platform-header');
  root.innerHTML=`<a href="#tasks" class="site-brand" data-section-link="tasks" aria-label="Sprintique — доска задач"><span>Sprintique</span></a>`
    +`<button type="button" class="iq-btn ghost sm iq-switcher pn-context-trigger" data-context-switch aria-haspopup="dialog" aria-label="Сменить пространство или проект"><span class="iq-avatar sm" data-project-avatar aria-hidden="true"></span><span class="iq-switcher-label" data-space-name></span><span aria-hidden="true" data-space-separator>/</span><strong class="iq-switcher-label" data-project-name></strong>${icon('down',16)}</button>`
    +`<nav class="iq-work-navigation" aria-label="Разделы проекта">${ROUTES.map(([route,label])=>`<a href="#${route}" data-section-link="${route}">${label}</a>`).join('')}</nav>`
    +`<div class="pn-personal-navigation">${onSearch?ui.ib('search','Поиск · ⌘K','ghost sm','data-search'):''}${ui.ib('sliders','Настройки проекта','ghost sm','data-section-link="settings"')}${ui.ib('moon','Тёмная тема','ghost sm','data-theme-toggle')}`
    +`${ui.menu(`<button type="button" class="iq-btn ghost icon sm" aria-label="Профиль: ${esc(profile.name)}">${ui.avatar(esc(profile.initials||'Я'),1)}</button>`,[{label:esc(profile.name),action:'account'},{label:'Команда проекта',action:'team'},{label:'Выйти',action:'signout',danger:true}])}</div>`;
  function update(value){
    if(disposed)return;value=readProjectContext(value);current=value;
    root.querySelector('[data-space-name]').textContent=value.workspaceName;
    root.querySelector('[data-project-name]').textContent=value.projectName;
    const avatar=root.querySelector('[data-project-avatar]');if(!avatar.querySelector('img'))avatar.textContent=value.projectName.slice(0,1);
    root.querySelector('[data-context-switch]').title=value.workspaceName+' / '+value.projectName;
  }
  /** aria-current on the section the host actually shows, including settings. */
  function setRoute(route){
    if(disposed)return;
    for(const link of root.querySelectorAll('[data-section-link]')){
      if(link.dataset.sectionLink===route&&!link.classList.contains('site-brand'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
  }
  function setTheme(theme){
    if(disposed)return;const dark=theme==='dark',button=root.querySelector('[data-theme-toggle]');
    button.innerHTML=icon(dark?'sun':'moon',18);button.setAttribute('aria-label',dark?'Светлая тема':'Тёмная тема');button.title=button.getAttribute('aria-label');
  }
  update(current);
  async function switchProject(){
    if(disposed||dialog||switching)return;registerAdvanced();
    const create=(onCreateProject?ui.btn('Новый проект','ghost sm','plus','data-create-project'):'')+(onCreateWorkspace?ui.btn('Новое пространство','ghost sm','plus','data-create-workspace'):'');
    dialog=formDialog({title:'Пространства и проекты',body:`<iq-remote-combobox label="Найти пространство или проект" placeholder="Название проекта или пространства"></iq-remote-combobox><p class="iq-helper">Выбор проекта меняет доску, планирование и карты. Несохранённое редактирование нужно завершить заранее.</p>${create?`<div class="row pn-context-create">${create}</div>`:''}`,submitLabel:'Открыть',
      canClose:()=>!switching,submit:async form=>{const id=form.querySelector('iq-remote-combobox').value;if(!id)throw Error('Выберите проект.');switching=true;
        try{const next=await onSwitch(id);if(next===false)throw Error('Сначала завершите открытое редактирование. Текущий проект не изменён.');const confirmed=readProjectContext(next);if(!disposed)update(confirmed);return true;}finally{switching=false;}},
      onMount:form=>{
        const picker=form.querySelector('iq-remote-combobox');picker.provider=projects;picker.value=current.id;
        form.querySelector('[data-create-project]')?.addEventListener('click',()=>{dialog?.close();onCreateProject();});
        form.querySelector('[data-create-workspace]')?.addEventListener('click',()=>{dialog?.close();onCreateWorkspace();});
      },onClose:()=>{dialog=null;}});
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-context-switch]'))void switchProject();
    if(event.target.closest('[data-theme-toggle]'))onTheme?.();
    if(event.target.closest('[data-search]'))onSearch?.();
  },{signal:events.signal});
  root.addEventListener('iq-action',event=>{if(event.detail.action==='account')onAccount?.();if(event.detail.action==='signout')onSignOut?.();if(event.detail.action==='team')onTeam?.();},{signal:events.signal});
  return {update,setRoute,setTheme,openSwitcher:()=>void switchProject(),avatar:()=>root.querySelector('[data-project-avatar]'),readyToLeave:()=>!switching&&!dialog,
    destroy(){if(disposed)return true;if(switching||dialog&&dialog.close()===false)return false;disposed=true;events.abort();root.replaceChildren();return true;}};
}
