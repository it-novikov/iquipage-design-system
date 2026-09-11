import {ui} from '/dist/vendor/core.js';
import {esc,icon,dialog} from '/src/ui.js';

/** Supplied avatar composition; a project has one identity, spaces remain a text hierarchy. */
export function projectAvatar(project){
  const initials=project.name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()||'П';
  const tone=1+Array.from(project.id).reduce((sum,c)=>sum+c.codePointAt(0),0)%4;
  let source='';
  try{const url=new URL(project.avatarUrl);if(['https:','http:','blob:'].includes(url.protocol))source=url.href;}catch{}
  return `<span class="iq-avatar v${tone} project-avatar" aria-hidden="true">${source?`<img src="${esc(source)}" alt="">`:esc(initials)}</span>`;
}

/** Explicit demo catalogue; the production host supplies its authorized spaces/projects. */
export function previewNavigation(params){
  const workspaces=[{id:'product',name:'Продукт'},{id:'personal',name:'Личное'}];
  const projects=[{id:'demo-product',name:'Команда продукта',workspaceId:'product'},{id:'demo-research',name:'Исследования',workspaceId:'product'},{id:'demo-personal',name:'Личные задачи',workspaceId:'personal'}];
  const id=params.get('project')||'demo-product';
  if(!projects.some(p=>p.id===id))projects[0]={...projects[0],id};
  const project=projects.find(p=>p.id===id);
  return {projects,workspaces,project,workspace:workspaces.find(w=>w.id===project.workspaceId)};
}
export function installWorkspaceNavigation({catalog,readyToLeave,go}){
  const root=document.querySelector('[data-workspace-path]'),{projects,workspaces,project,workspace}=catalog;
  const trigger=(name,label,current=false)=>`<button type="button" class="iq-btn ghost sm" aria-label="${label}" title="${esc(name)}" ${current?'aria-current="page"':''}>${current?projectAvatar(project):''}<span class="workspace-path-name">${esc(name)}</span>${icon('down',12)}</button>`;
  root.innerHTML=ui.menu(trigger(workspace.name,'Выбрать пространство'),[
    ...workspaces.map(w=>({label:esc(w.name),glyph:w.id===workspace.id?'check':null,action:'space:'+w.id})),{label:'Все пространства',glyph:'grid',action:'route:spaces'}
  ])+icon('chevron',12)+ui.menu(trigger(project.name,'Выбрать проект',true),[
    ...projects.filter(p=>p.workspaceId===workspace.id).map(p=>({label:`<span class="project-menu-identity">${projectAvatar(p)}<span>${esc(p.name)}</span></span>`,glyph:p.id===project.id?'check':null,action:'project:'+p.id})),{label:'Все проекты пространства',glyph:'grid',action:'route:projects'}
  ]);
  async function openProject(id,{section='tasks',taskId=null,mapId=null}={}){
    if(!(await readyToLeave())){dialog({title:'Сначала завершите работу с задачей',description:'Сохраните изменения или закройте панель задачи перед переходом.'});return;}
    if(!projects.some(p=>p.id===id))return;
    const next=new URL(location.href);next.searchParams.set('project',id);next.searchParams.delete('task');next.searchParams.delete('map');
    if(taskId)next.searchParams.set('task',taskId);if(mapId)next.searchParams.set('map',mapId);
    next.hash=section;location.assign(next);
  }
  root.addEventListener('iq-action',event=>{
    const [kind,id]=event.detail.action.split(':');
    if(kind==='route')void go(id);
    if(kind==='project')void openProject(id);
    if(kind==='space'){if(id===workspace.id)void go('projects');else void openProject(projects.find(p=>p.workspaceId===id).id,{section:'projects'});}
  });
  function renderDirectory(host,section){
    const spaces=section==='spaces',entries=spaces?workspaces:projects.filter(p=>p.workspaceId===workspace.id);
    host.innerHTML=`<div class="host-settings platform-directory"><h1>${spaces?'Пространства':'Проекты'}</h1><p class="iq-helper">${spaces?'Выберите рабочее пространство.':esc(workspace.name)+' · доступные проекты'}</p><div class="iq-list">${entries.map(item=>`<button type="button" class="iq-list-item full" data-directory-id="${item.id}"><div><b>${esc(item.name)}</b><small>${spaces?`${projects.filter(p=>p.workspaceId===item.id).length} ${item.id==='product'?'проекта':'проект'}`:item.id===project.id?'Текущий проект':'Открыть доску задач'}</small></div>${icon('chevron',16)}</button>`).join('')}</div>${spaces?'':'<a class="iq-link" href="#spaces">Все пространства</a>'}</div>`;
    host.querySelectorAll('[data-directory-id]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.directoryId;
      if(spaces){if(id===workspace.id)void go('projects');else void openProject(projects.find(p=>p.workspaceId===id).id,{section:'projects'});}
      else if(id===project.id)void go('tasks');else void openProject(id);
    }));
  }
  return {renderDirectory,openProject};
}
export function renderShortcutGuide(host){
  host.innerHTML=`<article class="host-settings shortcut-guide"><a class="iq-link" href="#tasks">${icon('left',16)} На доску задач</a><h1>Горячие клавиши</h1><p class="iq-helper">Быстрый поиск, редактирование и перемещение задач без мыши.</p><section><h2>Общие действия</h2><dl><div><dt>Поиск по платформе</dt><dd><kbd>⌘ / Ctrl</kbd> + <kbd>K</kbd></dd></div><div><dt>Сохранить открытую задачу</dt><dd><kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd></dd></div><div><dt>Закрыть диалог или меню</dt><dd><kbd>Esc</kbd></dd></div></dl></section><section><h2>Перемещение задач</h2><p>Перетаскивайте карточку мышью, а на сенсорном экране — за номер задачи. В меню каждой карточки есть действие «Переместить…».</p><ol><li>С помощью <kbd>Tab</kbd> перейдите к номеру задачи.</li><li>Нажмите <kbd>Enter</kbd> или <kbd>Пробел</kbd>, чтобы взять задачу.</li><li>Стрелками выберите столбец и позицию.</li><li><kbd>Enter</kbd> — подтвердить, <kbd>Esc</kbd> — отменить.</li></ol><p class="iq-helper">При автоматической сортировке место определяется выбранным порядком. Ручная очередь переставляет задачи одного уровня, не меняя их родителей.</p></section><section><h2>Описание задачи</h2><p>Нажмите на описание, чтобы редактировать. Щёлкните за пределами редактора или перейдите к следующему полю с клавиатуры, чтобы вернуться к просмотру. Изменения останутся в черновике до сохранения задачи.</p></section></article>`;
}
