import {ui,icon,escapeHTML as esc,settingsNavigation,notify,enhance} from '@iquipage/web/core';
import {mountProjectTaskSettings} from '../ui/src/board/project-settings.js';
import {settingsDialog,timeZoneField} from '../ui/planning/src/release-dialogs.js';
import {mountMembers} from './members.js';
import {mountWorkspaceMembers} from './workspace-members.js';
import {mountAgents} from './agents.js';
import {mountOperations} from './operations.js';
import {pickProjectAvatar} from './project-profile.js';
import {dialog,input} from '../ui/src/ui.js';
import {appearance,appearanceDefaults} from './appearance.js';
import {visibleSettingsGroups,settingsSection,filterSettingsGroups,roleName,workspaceRoleName} from './settings-sections.js';
import * as s from './settings-ui.js';

const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return `${n} ${a>10&&a<20?many:b===1?one:b>1&&b<5?few:many}`;};
const formats={flexible:['Гибкие релизы','Релиз выходит, когда готов.'],timeboxed:['Спринты','Работа идёт периодами фиксированной длины.']};

export async function mountSettings(root,{repository,project,adapter,onChanged=()=>{}}){
 const client=repository.client,abort=new AbortController(),preferences=appearance(),phone=matchMedia('(max-width:760px)'),documentTitle=document.title;
 let workspace=null;
 try{workspace=await client.request('/workspaces/'+encodeURIComponent(project.workspaceId));}catch{/* "О пространстве" shows its own error; the other sections do not depend on it. */}
 const groups=visibleSettingsGroups(project.role,workspace?.role||''),counts={};
 let mounted=null,closed=false,modal=null,busy=false,dirty=false,current='',resetForm=()=>{},adminNames=null;
 root.innerHTML=`<iq-settings-layout view="section"><div slot="navigation"><p class="iq-settings-title">Настройки</p><label class="product-nav-search iq-settings-search">${icon('search',17)}<input type="search" placeholder="Найти настройку" aria-label="Найти раздел настроек" data-settings-search autocomplete="off"></label><div data-settings-navigation></div><p class="iq-settings-nav-empty" data-settings-empty role="status" hidden>Ничего не найдено. Попробуйте другое слово.</p></div><header slot="heading" class="iq-page-heading iq-settings-heading" data-settings-heading></header><div class="iq-settings-stack" data-settings-content></div><p class="sr-only" role="status" data-settings-announce></p></iq-settings-layout>`;
 const layout=root.querySelector('iq-settings-layout'),nav=root.querySelector('[data-settings-navigation]'),heading=root.querySelector('[data-settings-heading]'),content=root.querySelector('[data-settings-content]'),search=root.querySelector('[data-settings-search]');
 const announce=text=>{const el=root.querySelector('[data-settings-announce]');el.textContent='';requestAnimationFrame(()=>{el.textContent=text;});};
 const meta=id=>groups.flatMap(g=>g.items).find(i=>i.id===id);
 function navigation(){
  const withCounts=groups.map(g=>({...g,items:g.items.map(i=>counts[i.id]?{...i,count:counts[i.id].count,countLabel:counts[i.id].label}:i)}));
  const filtered=filterSettingsGroups(withCounts,search.value);nav.innerHTML=settingsNavigation(filtered,current);root.querySelector('[data-settings-empty]').hidden=!!filtered.length;
 }
 /** Things that need someone's decision are counted in the navigation; zero shows nothing. */
 async function loadCounts(){
  const base='/projects/'+encodeURIComponent(project.id);
  const [approvals,operations]=await Promise.all([client.request(base+'/approvals').catch(()=>null),project.role==='admin'?client.request(base+'/operations').catch(()=>null):null]);
  if(closed)return;
  const pending=(approvals?.items||[]).filter(a=>a.status==='proposed'&&new Date(a.expiresAt)>new Date()).length;
  const failed=operations?.counts?.find(c=>c.state==='failed')?.count||0;
  counts.agents=pending?{count:pending,label:plural(pending,['предложение ждёт','предложения ждут','предложений ждут'])+' решения'}:null;
  counts.operations=failed?{count:failed,label:plural(failed,['операция требует','операции требуют','операций требуют'])+' внимания'}:null;
  navigation();
 }
 const view=()=>layout.setAttribute('view',phone.matches&&location.hash==='#settings'?'index':'section');
 function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;},{once:true});return element;}
 async function canLeave(){
  if(busy||modal||mounted&&!await mounted.readyToLeave())return false;
  if(!dirty)return true;
  return new Promise(resolve=>{let discard=false;const element=track(dialog({title:'Уйти без сохранения?',description:'Изменения в полях пропадут.',submitLabel:'Не сохранять',onSubmit:()=>{discard=true;resetForm();dirty=false;}}));element.addEventListener('iq-close',()=>resolve(discard),{once:true});});
 }
 /** People who cannot change project settings see who can, instead of disabled controls. */
 async function projectLock(){
  if(project.role==='admin')return '';
  adminNames??=client.request('/projects/'+encodeURIComponent(project.id)+'/members').then(list=>list.filter(m=>m.role==='admin'&&m.kind!=='agent').map(m=>m.name)).catch(()=>[]);
  const names=await adminNames;
  return s.lock(names.length>1?`Вы можете только просматривать. Изменения вносят администраторы проекта: ${names.slice(0,2).join(' и ')}.`:names.length?`Вы можете только просматривать. Изменения вносит ${names[0]}, администратор проекта.`:'Вы можете только просматривать. Изменения вносит администратор проекта.');
 }
 function renderHeading(item){
  heading.innerHTML=`<a class="iq-btn ghost sm iq-page-heading-back" href="#settings" data-settings-index>${icon('left',17)}<span>Настройки</span></a><div class="iq-page-heading-copy"><h1 tabindex="-1" data-section-title>${esc(item.label)}</h1><p class="iq-page-heading-lead">${esc(item.description)}</p></div><div class="iq-page-heading-tools" data-heading-tools></div>`;
  return heading.querySelector('[data-heading-tools]');
 }
 /** Forms keep the save bar hidden until something differs from what is saved. */
 function bindForm(form,{read,save,after}){
  const baseline=JSON.stringify(read()),bar=form.querySelector('.iq-settings-savebar'),status=bar.querySelector('.iq-settings-savebar-status'),submit=bar.querySelector('[type=submit]'),alert=form.querySelector('[data-form-error]');
  const sync=()=>{if(busy)return;dirty=JSON.stringify(read())!==baseline;bar.hidden=!dirty;status.textContent='Есть несохранённые изменения';};
  form.addEventListener('input',sync);form.addEventListener('iq-change',sync);
  resetForm=()=>{dirty=false;void after();};
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||!dirty)return;busy=true;alert.hidden=true;submit.disabled=true;status.textContent='Сохраняем…';form.setAttribute('aria-busy','true');
   try{await save(read());dirty=false;notify({message:'Изменения сохранены',tone:'success'});await onChanged();busy=false;await after();}
   catch(error){if(!closed){alert.hidden=false;alert.textContent=error.message;status.textContent='Не удалось сохранить';}}
   finally{busy=false;if(form.isConnected){submit.disabled=false;form.removeAttribute('aria-busy');}}
  });
 }
 const formShell=(body,label)=>`<form class="iq-settings-stack" data-settings-form novalidate>${body}<p class="iq-inline danger" role="alert" data-form-error hidden></p>${s.savebar(label)}</form>`;

 function renderAppearance(tools){
  const v=preferences.value,changed=JSON.stringify(v)!==JSON.stringify(appearanceDefaults);
  tools.innerHTML=changed?ui.btn('Вернуть по умолчанию','ghost sm','','data-reset-appearance'):'';
  content.innerHTML=`${preferences.persistent?'':`<p class="iq-settings-lock">${icon('warning',17)}<span>Браузер не сохраняет настройки: после перезагрузки они сбросятся.</span></p>`}
   ${s.group({title:'Тема',description:'Светлая, тёмная или как на устройстве.',body:'<iq-visual-choice label="Тема интерфейса" data-appearance="theme"></iq-visual-choice>'})}
   ${s.group({title:'Акцентный цвет',description:'Выделяет выбранные элементы. Цвета статусов задач не меняются.',body:`<fieldset class="iq-accent-options"><legend class="sr-only">Акцентный цвет</legend>${[['blue','Синий'],['violet','Фиолетовый'],['green','Зелёный']].map(([id,label])=>`<label class="iq-accent-option"><input type="radio" name="accent" value="${id}" ${id===v.accent?'checked':''}><span class="iq-accent-dot" data-accent="${id}" aria-hidden="true"></span>${label}</label>`).join('')}</fieldset>`})}
   ${s.group({title:'Плотность',description:'Больше воздуха или больше задач на экране. Касается таблиц и карточек доски.',body:'<iq-visual-choice label="Плотность информации" data-appearance="density"></iq-visual-choice>'})}
   ${s.group({title:'Движение',body:s.panel(s.row({title:'Уменьшить анимацию',meta:['Отключает переходы и перемещения. Системная настройка учитывается всегда.'],actions:ui.toggle('Уменьшить анимацию',v.motion==='reduced','data-appearance-motion',false)}))})}`;
  const theme=content.querySelector('[data-appearance=theme]');theme.options=[{value:'light',label:'Светлая',preview:'light'},{value:'dark',label:'Тёмная',preview:'dark'},{value:'system',label:'Как на устройстве',preview:'system'}];theme.value=v.theme;
  const density=content.querySelector('[data-appearance=density]');density.options=[{value:'comfortable',label:'Свободная',description:'Больше воздуха',preview:'comfortable'},{value:'compact',label:'Компактная',description:'Больше задач на экране',preview:'compact'}];density.value=v.density;
 }
 function syncAppearance(){if(current!=='appearance'||closed)return;renderAppearance(heading.querySelector('[data-heading-tools]'));announce(preferences.persistent?'Сохранено в этом браузере':'Настройки применены до перезагрузки');}

 async function renderAccount(){
  const data=await client.request('/profile');if(closed)return;
  const role=`${roleName(project.role)} в проекте ${project.name}`;
  content.innerHTML=formShell(s.group({title:'Как вас видят',body:s.panel(s.row({media:s.avatar(data.name,data.id),title:data.name,meta:[esc(role)],attrs:'data-profile-preview'})+s.fieldRow('Отображаемое имя','Имя и фамилия, как к вам обращаются в команде.',input('name','Отображаемое имя',data.name,{required:true,maxlength:100})))}))
   +s.group({title:'Ваши роли',description:'Роли выдают администраторы проекта и пространства.',body:s.panel(s.facts([[`Проект ${project.name}`,esc(roleName(project.role))],...(workspace?[[`Пространство ${workspace.name}`,esc(workspaceRoleName(workspace.role))]]:[])]))});
  const form=content.querySelector('form'),field=form.querySelector('[name=name]'),preview=form.querySelector('[data-profile-preview] .iq-settings-row-title');
  field.addEventListener('input',()=>{preview.textContent=field.value.trim()||data.name;});
  bindForm(form,{read:()=>({name:field.value.trim()}),after:renderAccount,save:async({name})=>{if(!name)throw Error('Введите имя.');await client.request('/profile','PATCH',{baseRevision:data.revision,name});}});
 }

 async function projectAvatar(data){
  const el=content.querySelector('[data-project-avatar]');if(!el||!data.avatarAssetId||!repository.attachmentAdapter)return;
  try{const blob=await repository.attachmentAdapter.blob({projectId:project.id,id:data.avatarAssetId,variant:'thumb'});if(!el.isConnected)return;const url=URL.createObjectURL(blob),img=new Image();img.alt='';img.onload=()=>URL.revokeObjectURL(url);img.src=url;el.replaceChildren(img);}catch{/* The initial stays when the image cannot be loaded. */}
 }
 async function renderProfile(){
  const base='/projects/'+encodeURIComponent(project.id)+'/profile',data=await client.request(base);if(closed)return;
  const canEdit=project.role==='admin',address=new URL('/?project='+encodeURIComponent(data.slug),location.origin).href;
  const avatarRow=s.row({media:`<span class="iq-avatar sq-project-avatar" data-project-avatar aria-hidden="true">${esc(data.name.slice(0,1).toUpperCase())}</span>`,title:'Аватар проекта',meta:['Помогает отличать проекты в переключателе.'],
   actions:canEdit?ui.btn(data.avatarAssetId?'Заменить':'Загрузить','secondary sm','image','data-settings-action="avatar-upload"')+(data.avatarAssetId?ui.btn('Убрать','ghost sm','','data-settings-action="avatar-remove"'):''):''});
  const links=s.group({title:'Ссылки на задачи',description:'Не меняются, чтобы старые ссылки продолжали работать.',body:s.panel(s.facts([['Префикс задач',`${s.copyValue(data.key,'Скопировать префикс')}<small>Например, ${esc(data.key)}-128</small>`],['Адрес проекта',s.copyValue(address,'Скопировать адрес проекта')]]))});
  if(!canEdit){content.innerHTML=await projectLock()+s.group({title:'Основное',body:s.panel(avatarRow+s.facts([['Название проекта',esc(data.name)]]))})+links;}
  else{
   content.innerHTML=formShell(s.group({title:'Основное',body:s.panel(avatarRow+s.fieldRow('Название проекта','Видно в переключателе, поиске и ссылках.',input('name','Название проекта',data.name,{required:true,maxlength:100})))}))+links;
   const field=content.querySelector('[name=name]');
   bindForm(content.querySelector('form'),{read:()=>({name:field.value.trim()}),after:renderProfile,save:async({name})=>{if(!name)throw Error('Введите название проекта.');const body={baseRevision:data.revision,name,avatarAssetId:data.avatarAssetId};await client.request(base,'PUT',body,await repository.key('project-profile:'+project.id,body));}});
  }
  content.dataset.revision=String(data.revision);enhance(content);void projectAvatar(data);
  return data;
 }
 async function saveAvatar(avatarAssetId){
  const base='/projects/'+encodeURIComponent(project.id)+'/profile',data=await client.request(base),body={baseRevision:data.revision,name:data.name,avatarAssetId};
  await client.request(base,'PUT',body,await repository.key('project-profile:'+project.id,body));await onChanged();await renderProfile();
 }

 async function renderWorkspace(){
  const base='/workspaces/'+encodeURIComponent(project.workspaceId),data=await client.request(base);if(closed)return;workspace=data;
  if(data.role!=='admin'){content.innerHTML=s.lock('Вы можете только просматривать. Настройки пространства меняет его администратор.')+s.group({title:'Основное',body:s.panel(s.facts([['Название пространства',esc(data.name)],['Часовой пояс',esc(data.timezone)]]))});return;}
  content.innerHTML=formShell(s.group({title:'Основное',body:s.panel(s.fieldRow('Название пространства','Видно в переключателе проектов.',input('name','Название пространства',data.name,{required:true,maxlength:100}))+s.fieldRow('Часовой пояс','По умолчанию для новых проектов и дат.',timeZoneField('timezone','Часовой пояс',data.timezone)))}))
   +s.group({title:'Люди',body:s.panel(s.row({media:s.tile('users'),title:'Участники пространства',meta:['Роли в пространстве и его состав.'],href:'#settings/workspace-members',attrs:'data-settings-section="workspace-members"'}))});
  const form=content.querySelector('form'),name=form.querySelector('[name=name]'),zone=()=>String(form.querySelector('iq-combobox[name=timezone]')?.value||data.timezone).trim();
  bindForm(form,{read:()=>({name:name.value.trim(),timezone:zone()}),after:renderWorkspace,save:async({name,timezone})=>{if(!name)throw Error('Введите название пространства.');await client.request(base,'PATCH',{baseRevision:data.revision,name,timezone});}});
 }

 async function renderPlanning(tools){
  const data=await adapter.settings({projectId:project.id});if(closed)return;
  const canEdit=project.role==='admin',[format,hint]=formats[data.format]||[data.format,''];
  tools.innerHTML=canEdit?ui.btn('Изменить','secondary sm','','data-settings-action="planning"'):'';
  content.innerHTML=await projectLock()+s.group({title:'Новые релизы',description:'Эти значения предлагаются при создании релиза. Даты текущих релизов не изменятся.',body:s.panel(s.facts([['Формат',`${esc(format)}<small>${esc(hint)}</small>`],['Длительность спринта',esc(plural(data.days||14,['день','дня','дней']))],['Часовой пояс',esc(data.timeZone||'UTC')]]))});
 }

 async function select(section,{historyMode='push',force=false}={}){
  section=settingsSection('#settings/'+section,project.role,workspace?.role||'');
  if(section===current&&!force){view();return true;}
  if(!await canLeave())return false;busy=true;
  try{
   mounted?.destroy();mounted=null;dirty=false;resetForm=()=>{};current=section;const item=meta(section);navigation();
   if(historyMode!=='none')history[historyMode==='replace'?'replaceState':'pushState'](null,'','#settings/'+section);
   view();document.title=`${item.label} | Настройки | Sprintique`;
   const tools=renderHeading(item);content.innerHTML=s.skeleton();
   if(section==='appearance')renderAppearance(tools);
   else if(section==='account')await renderAccount();
   else if(section==='profile')await renderProfile();
   else if(section==='workspace')await renderWorkspace();
   else if(section==='planning')await renderPlanning(tools);
   else{
    const props={repository,project,tools,embedded:true,notice:section==='workspace-members'?'':await projectLock(),onCounts:()=>void loadCounts()};
    if(section==='members')mounted=await mountMembers(content,props);
    else if(section==='agents')mounted=await mountAgents(content,props);
    else if(section==='operations')mounted=await mountOperations(content,props);
    else if(section==='workspace-members')mounted=await mountWorkspaceMembers(content,{...props,workspace});
    else mounted=await mountProjectTaskSettings(content,{...props,section,canManage:project.role==='admin'});
   }
   if(closed){mounted?.destroy();return false;}
   if(historyMode==='push')heading.querySelector('h1').focus({preventScroll:true});
   return true;
  }catch(error){if(!closed){content.innerHTML=`${ui.alert('Не удалось загрузить раздел',esc(error.message),'danger')}<p>${ui.btn('Попробовать снова','secondary sm','refresh','data-retry-settings')}</p>`;}return true;}
  finally{busy=false;}
 }
 function showIndex(){view();const link=nav.querySelector('[aria-current=page]');link?.focus({preventScroll:true});}
 root.addEventListener('input',event=>{if(event.target.matches('[data-settings-search]'))navigation();},{signal:abort.signal});
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.matches('[data-settings-search]')&&search.value){search.value='';navigation();event.preventDefault();}},{signal:abort.signal});
 root.addEventListener('iq-change',event=>{const key=event.target.dataset.appearance;if(key){preferences.update({[key]:event.detail.value});syncAppearance();}},{signal:abort.signal});
 root.addEventListener('change',event=>{if(event.target.matches('[name=accent]')){preferences.update({accent:event.target.value});syncAppearance();}if(event.target.matches('[data-appearance-motion]')){preferences.update({motion:event.target.checked?'reduced':'system'});syncAppearance();}},{signal:abort.signal});
 root.addEventListener('click',async event=>{
  const link=event.target.closest('[data-settings-section]');if(link){if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();await select(link.dataset.settingsSection);return;}
  if(event.target.closest('[data-settings-index]')){event.preventDefault();if(await canLeave()){dirty=false;history.pushState(null,'','#settings');showIndex();}return;}
  if(event.target.closest('[data-reset-appearance]')){preferences.reset();syncAppearance();return;}
  if(event.target.closest('[data-reset-form]')){resetForm();return;}
  if(event.target.closest('[data-retry-settings]')){await select(current,{force:true,historyMode:'replace'});return;}
  const action=event.target.closest('[data-settings-action]');if(!action||action.disabled||busy||modal)return;
  const kind=action.dataset.settingsAction;
  if(kind==='planning'){busy=true;try{const result=await settingsDialog({adapter,projectId:project.id,onCommitted:async()=>{await renderPlanning(heading.querySelector('[data-heading-tools]'));notify({message:'Параметры планирования сохранены',tone:'success'});},onClose:()=>{modal=null;}});modal=result.element;}catch(error){track(dialog({title:'Не удалось открыть параметры',description:error.message}));}finally{busy=false;}return;}
  if(dirty){notify({message:'Сначала сохраните или отмените изменения названия.',tone:'warning'});return;}
  if(kind==='avatar-upload'){const assetId=await pickProjectAvatar({repository,project,track});if(assetId&&!closed){busy=true;try{await saveAvatar(assetId);notify({message:'Аватар обновлён',tone:'success'});}catch(error){notify({message:error.message,tone:'danger'});}finally{busy=false;}}return;}
  if(kind==='avatar-remove')track(dialog({title:'Убрать аватар проекта?',description:'В переключателе останется первая буква названия.',submitLabel:'Убрать',success:'Аватар убран',onSubmit:()=>saveAvatar(null)}));
 },{signal:abort.signal});
 window.addEventListener('sprintique-appearance-change',()=>{if(current==='appearance'&&!content.contains(document.activeElement))syncAppearance();},{signal:abort.signal});
 phone.addEventListener('change',view,{signal:abort.signal});
 const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload,{signal:abort.signal});
 await select(settingsSection(location.hash,project.role,workspace?.role||''),{historyMode:phone.matches&&location.hash==='#settings'?'none':'replace'});
 void loadCounts();
 return {get routeHash(){return phone.matches&&location.hash==='#settings'?'#settings':'#settings/'+current;},
  navigateSettings:async()=>{if(location.hash==='#settings'&&phone.matches){if(!await canLeave())return false;showIndex();return true;}const ok=await select(settingsSection(location.hash,project.role,workspace?.role||''),{historyMode:'none'});history.replaceState(null,'','#settings/'+current);return ok;},
  closeTask:canLeave,readyToLeave:()=>!busy&&!modal&&!dirty&&(!mounted||mounted.readyToLeave()),
  destroy(){closed=true;abort.abort();mounted?.destroy();modal?.close(true);document.title=documentTitle;root.replaceChildren();}};
}
