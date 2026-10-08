import {registerCore,ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {formDialog} from './dialog.js';
import {readProjectContext} from './navigation-model.js';
const ROUTES=[['tasks','Доска задач'],['planning','Планирование'],['maps','Карты'],['finance','Финансы']];
/** Product-shell composition (UX R3). The host supplies identities, allowed destinations and routing.
 *  Sections stay visible as text at every width; the host marks the current one with setRoute. The Workbench, when
 *  offered, is the first section: it spans every project, the switchers keep the project the other sections open. */
/** The person's photo over their initials (DS personAvatar), in the one tone they keep everywhere. */
// The profile disc is the DS md step (28px), the size of the small icon button it sits in.
const profileAvatar=profile=>ui.personAvatar({id:profile.id,name:profile.name||'Я',image:profile.image||undefined},{size:'md'});
export function mountProjectNavigation(root,{current,profile,projects,catalog=()=>[],onSwitch,onAccount,onSignOut,onTeam,onTheme,onSearch,onCreateProject,onCreateWorkspace,workbench=false,notifications}){
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер навигации.');
  current=readProjectContext(current);
  registerCore();const events=new AbortController();let disposed=false,dialog=null,switching=false;
  root.classList.add('pn-platform-header');
  // Workspace and project are separate choices: each name opens its own DS menu.
  root.innerHTML=`<div class="pn-context" data-context></div>`
    // Sections are the DS work navigation (text tabs, the current one underlined at the header's edge), centred.
    +`<nav class="pn-sections iq-work-navigation" aria-label="Разделы проекта">${workbench?'<a href="/workbench" data-section-link="workbench">Рабочий стол</a>':''}${ROUTES.map(([route,label])=>`<a href="#${route}" data-section-link="${route}">${label}</a>`).join('')}</nav>`
    +`<div class="pn-personal-navigation">${onSearch?ui.ib('search','Поиск (⌘K)','ghost sm','data-search'):''}${notifications?'<span class="pn-bell-slot" data-notifications></span>':''}${ui.ib('settings','Настройки','ghost sm','data-section-link="settings"')}${ui.ib('moon','Тёмная тема','ghost sm','data-theme-toggle')}`
    +`${ui.menu(`<button type="button" class="iq-btn ghost icon sm" data-profile-avatar aria-label="Профиль: ${esc(profile.name)}">${profileAvatar(profile)}</button>`,[{label:esc(profile.name),action:'account'},{label:'Команда проекта',action:'team'},{label:'Выйти',action:'signout',danger:true}])}</div>`;
  function renderContext(){
    const all=catalog()||[],spaces=[...new Map(all.map(p=>[p.workspaceId,{id:p.workspaceId,name:p.workspaceName}])).values()];
    const inSpace=all.filter(p=>p.workspaceId===current.workspaceId);
    // Both are the DS switcher (the board title chooses its release with the same control): the current one checked.
    const spaceItems=[{section:'Пространства'},...spaces.map(w=>({label:w.name,glyph:'folder',current:w.id===current.workspaceId,action:'workspace:'+w.id})),
      ...(onCreateWorkspace?[{label:'Новое пространство',glyph:'plus',action:'create-workspace'}]:[])];
    const projectItems=[{section:current.workspaceName},...inSpace.map(p=>({label:p.name,glyph:'box',current:p.id===current.id,action:'project:'+p.id})),
      {label:'Найти проект…',glyph:'search',action:'find-project'},...(onCreateProject?[{label:'Новый проект',glyph:'plus',action:'create-project'}]:[])];
    root.querySelector('[data-context]').innerHTML=
      ui.switcher({label:current.workspaceName,name:'Пространство',tone:'muted',className:'pn-space-trigger',items:spaceItems})
      +'<span class="pn-context-separator" aria-hidden="true">/</span>'
      +ui.switcher({label:current.projectName,name:'Проект',emphasis:'strong',className:'pn-project-trigger',items:projectItems});
  }
  function update(value){
    if(disposed)return;current=readProjectContext(value);renderContext();
  }
  async function switchTo(id){
    if(disposed||switching||id===current.id)return;switching=true;
    try{const next=await onSwitch(id);if(next===false)notify({tone:'warning',message:'Сначала завершите открытое редактирование. Текущий проект не изменён.'});else if(!disposed)update(next);}
    finally{switching=false;}
  }
  /** aria-current on the section the host actually shows, including settings. */
  function setRoute(route){
    if(disposed)return;
    for(const link of root.querySelectorAll('[data-section-link]')){
      const current=link.dataset.sectionLink===route;
      if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
  }
  function setTheme(theme){
    if(disposed)return;const dark=theme==='dark',button=root.querySelector('[data-theme-toggle]');
    button.innerHTML=icon(dark?'sun':'moon',18);button.setAttribute('aria-label',dark?'Светлая тема':'Тёмная тема');button.title=button.getAttribute('aria-label');
  }
  update(current);
  // The host's notification bell lives in the personal tools; it is the host's to load and to tear down.
  const bell=notifications?.(root.querySelector('[data-notifications]'))||null;
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
    if(event.target.closest('[data-theme-toggle]'))onTheme?.();
    if(event.target.closest('[data-search]'))onSearch?.();
  },{signal:events.signal});
  root.addEventListener('iq-action',event=>{
    const [kind,id]=String(event.detail.action).split(':');
    if(kind==='project')void switchTo(id);
    if(kind==='workspace'&&id!==current.workspaceId){const first=(catalog()||[]).find(p=>p.workspaceId===id);if(first)void switchTo(first.id);}
    if(kind==='find-project')void switchProject();
    if(kind==='create-project')onCreateProject?.();
    if(kind==='create-workspace')onCreateWorkspace?.();
    if(event.detail.action==='account')onAccount?.();if(event.detail.action==='signout')onSignOut?.();if(event.detail.action==='team')onTeam?.();},{signal:events.signal});
  /** A new photo or name reaches the header without rebuilding the navigation. */
  function setProfile(next){profile={...profile,...next};const button=root.querySelector('[data-profile-avatar]');if(!button)return;button.innerHTML=profileAvatar(profile);button.setAttribute('aria-label','Профиль: '+profile.name);}
  return {update,setRoute,setTheme,setProfile,openSwitcher:()=>void switchProject(),readyToLeave:()=>!switching&&!dialog,
    destroy(){if(disposed)return true;if(switching||dialog&&dialog.close()===false)return false;disposed=true;events.abort();bell?.destroy();root.replaceChildren();return true;}};
}
