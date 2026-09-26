import {ui,icon,escapeHTML as esc,settingsNavigation,notify} from '@iquipage/web/core';
import {mountProjectTaskSettings} from '../ui/src/board/project-settings.js';
import {settingsDialog} from '../ui/planning/src/release-dialogs.js';
import {mountMembers} from './members.js';
import {mountAgents} from './agents.js';
import {editProjectProfile,editWorkspace} from './project-profile.js';
import {dialog,input} from '../ui/src/ui.js';
import {mountOperations} from './operations.js';
import {appearance} from './appearance.js';
import {visibleSettingsGroups,settingsSection} from './settings-sections.js';

export async function mountSettings(root,{repository,project,adapter,onChanged=()=>{}}){
 const groups=visibleSettingsGroups(project.role),preferences=appearance(),abort=new AbortController();
 let mounted=null,closed=false,modal=null,busy=false,dirty=false,current='',resetForm=()=>{};
 root.innerHTML=`<iq-settings-layout><div slot="navigation"><p class="iq-settings-title">Настройки</p><div class="iq-input-shell iq-settings-search">${icon('search',17)}<input type="search" placeholder="Найти раздел" aria-label="Найти раздел настроек" data-settings-search></div><div data-settings-navigation></div><p class="iq-helper" data-settings-empty hidden>Раздел не найден</p></div><header slot="heading" class="iq-settings-heading" data-settings-heading></header><div data-settings-content></div></iq-settings-layout>`;
 const nav=root.querySelector('[data-settings-navigation]'),heading=root.querySelector('[data-settings-heading]'),content=root.querySelector('[data-settings-content]');
 function navigation(){const q=root.querySelector('[data-settings-search]').value.toLocaleLowerCase('ru').trim(),filtered=groups.map(g=>({...g,items:g.items.filter(i=>(i.label+' '+i.description).toLocaleLowerCase('ru').includes(q))})).filter(g=>g.items.length);nav.innerHTML=settingsNavigation(filtered,current);root.querySelector('[data-settings-empty]').hidden=!!filtered.length;}
 function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;},{once:true});return element;}
 async function canLeave(){
  if(busy||modal||mounted&&!mounted.readyToLeave())return false;
  if(!dirty)return true;
  return new Promise(resolve=>{let discard=false;const element=track(dialog({title:'Оставить изменения несохранёнными?',description:'Вы изменили поля. Можно вернуться к форме или продолжить без сохранения.',submitLabel:'Не сохранять',onSubmit:()=>{discard=true;resetForm();dirty=false;}}));element.addEventListener('iq-close',()=>resolve(discard),{once:true});});
 }
 const row=(title,description,control)=>`<div class="iq-setting-row"><div><b>${esc(title)}</b><p>${esc(description)}</p></div>${control}</div>`;
 function renderAppearance(){
  const v=preferences.value;
  content.innerHTML=`<section class="iq-settings-section"><h2>Тема интерфейса</h2><p>Выберите светлую, тёмную или ту, что используется на устройстве.</p><iq-visual-choice label="Тема интерфейса" data-appearance="theme"></iq-visual-choice></section>
   <section class="iq-settings-section"><h2>Акцентный цвет</h2><p>Выделяет выбранные элементы и активные разделы. Цвета статусов задач сохраняют свой смысл.</p><fieldset class="iq-accent-options"><legend class="sr-only">Акцентный цвет</legend>${[['blue','Синий'],['violet','Фиолетовый'],['green','Зелёный']].map(([id,label])=>`<label class="iq-accent-option"><input type="radio" name="accent" value="${id}" ${id===v.accent?'checked':''}><span class="iq-accent-dot" data-accent="${id}" aria-hidden="true"></span>${label}</label>`).join('')}</fieldset></section>
   <section class="iq-settings-section"><h2>Плотность информации</h2><p>Больше воздуха или больше задач на экране. Применяется к таблицам и карточкам доски.</p><iq-visual-choice label="Плотность информации" data-appearance="density"></iq-visual-choice></section>
   ${row('Уменьшить анимацию','Отключает переходы и перемещения. Системная настройка уменьшения движения учитывается всегда.',ui.toggle('Уменьшить анимацию',v.motion==='reduced','data-appearance-motion',false))}
   <div class="iq-setting-row"><div><b>Начать с настроек по умолчанию</b><p>Системная тема, синий акцент и свободная плотность.</p></div>${ui.btn('Сбросить','secondary sm','','data-reset-appearance')}</div><p class="iq-settings-status" role="status" data-appearance-status>Сохраняется автоматически в этом браузере.</p>`;
  const theme=content.querySelector('[data-appearance=theme]');theme.options=[{value:'light',label:'Светлая',preview:'light'},{value:'dark',label:'Тёмная',preview:'dark'},{value:'system',label:'Как на устройстве',preview:'system'}];theme.value=v.theme;
  const density=content.querySelector('[data-appearance=density]');density.options=[{value:'comfortable',label:'Свободная',description:'Больше воздуха',preview:'comfortable'},{value:'compact',label:'Компактная',description:'Больше информации',preview:'compact'}];density.value=v.density;
 }
 function syncAppearance(){if(current!=='appearance'||closed)return;const v=preferences.value;content.querySelector('[data-appearance=theme]').value=v.theme;content.querySelector('[data-appearance=density]').value=v.density;for(const radio of content.querySelectorAll('[name=accent]'))radio.checked=radio.value===v.accent;content.querySelector('[data-appearance-motion]').checked=v.motion==='reduced';content.querySelector('[data-appearance-status]').textContent=preferences.persistent?'Настройки сохранены в этом браузере.':'Настройки применены. Браузер не разрешил сохранение — после перезагрузки они сбросятся.';}
 async function renderForm(section){
  const base=section==='account'?'/profile':section==='profile'?'/projects/'+encodeURIComponent(project.id)+'/profile':'/workspaces/'+encodeURIComponent(project.workspaceId);
  const data=await repository.client.request(base);if(closed)return;
  const canEdit=section==='account'||(section==='profile'?project.role==='admin':data.role==='admin');
  const fields=input('name',section==='account'?'Отображаемое имя':section==='profile'?'Название проекта':'Название пространства',data.name,{required:true,maxlength:100,disabled:!canEdit})+(section==='workspace'?input('timezone','Часовой пояс',data.timezone,{required:true,maxlength:100,disabled:!canEdit}):'');
  content.innerHTML=`<form data-settings-form><section class="iq-settings-section"><fieldset class="iq-settings-fields stack" ${canEdit?'':'disabled'}>${fields}</fieldset>${!canEdit?'<p class="iq-helper">Изменять эти настройки может администратор.</p>':''}</section>${canEdit?`<div class="iq-setting-row"><p class="iq-helper" data-form-state>Нет несохранённых изменений</p><div class="row">${ui.btn('Отменить','ghost sm','','data-reset-form disabled')}<button class="iq-btn primary" type="submit" disabled>Сохранить</button></div></div>`:''}<p class="iq-helper error" role="alert" hidden></p></form>`;
  if(section==='profile')content.insertAdjacentHTML('beforeend',`<section class="iq-settings-section"><h2>Идентификаторы проекта</h2>${row('Адрес',data.slug,'')}${row('Префикс задач',data.key,'')}<p>Адрес и префикс сохраняются, чтобы ссылки на задачи продолжали работать.</p></section>${row('Аватар проекта','Помогает отличать проекты при переключении.',ui.btn('Изменить аватар','secondary sm','image',`data-settings-action="avatar" ${!canEdit?'disabled':''}`))}`);
  if(section==='workspace')content.insertAdjacentHTML('beforeend',row('Участники пространства','Роли пространства не меняют доступ к задачам отдельных проектов.',ui.btn('Управление','secondary sm','','data-settings-action="workspace"')));
  const form=content.querySelector('form');let baseline=JSON.stringify(Object.fromEntries(new FormData(form)));
  const sync=()=>{dirty=JSON.stringify(Object.fromEntries(new FormData(form)))!==baseline;const save=form.querySelector('[type=submit]');if(save)save.disabled=busy||!dirty;const cancel=form.querySelector('[data-reset-form]');if(cancel)cancel.disabled=busy||!dirty;const status=form.querySelector('[data-form-state]');if(status)status.textContent=dirty?'Есть несохранённые изменения':'Нет несохранённых изменений';};
  form.oninput=sync;resetForm=()=>{form.reset();sync();};
  form.onsubmit=async event=>{event.preventDefault();if(busy||!canEdit||!dirty)return;busy=true;form.querySelector('[type=submit]').disabled=true;const alert=form.querySelector('[role=alert]');alert.hidden=true;
   try{const values=new FormData(form),body={baseRevision:data.revision,name:String(values.get('name')).trim(),...(section==='workspace'?{timezone:String(values.get('timezone')).trim()}:{}),...(section==='profile'?{avatarAssetId:data.avatarAssetId}: {})};
    if(!body.name)throw Error('Заполните имя или название.');
    form.querySelector('fieldset').disabled=true;form.querySelector('[data-reset-form]').disabled=true;
    await repository.client.request(base,section==='profile'?'PUT':'PATCH',body,section==='profile'?await repository.key('project-profile:'+project.id,body):undefined);dirty=false;notify({message:'Изменения сохранены',tone:'success'});await onChanged();await renderForm(section);
   }catch(error){if(!closed){alert.hidden=false;alert.textContent=error.message;}}finally{busy=false;if(form.isConnected){form.querySelector('fieldset').disabled=false;sync();}}
  };
 }
 async function renderPlanning(){const data=await adapter.settings({projectId:project.id});if(closed)return;content.innerHTML=`<section class="iq-settings-section"><h2>Начальные параметры</h2>${row('Формат новых релизов',({flexible:'Гибкий релиз',timeboxed:'Спринт'})[data.format]||data.format,'')}${row('Предлагаемая длительность',`${data.days||14} дней`,'')}${row('Часовой пояс',data.timeZone||'UTC','')}<p>Изменения задают начальные значения. Даты существующих релизов и история останутся прежними.</p>${ui.btn('Изменить планирование','primary','calendar',`data-settings-action="planning" ${project.role!=='admin'?'disabled':''}`)}${project.role!=='admin'?'<p class="iq-helper">Настройки изменяет администратор проекта.</p>':''}</section>`;}
 async function select(section,{historyMode='push',force=false}={}){
  section=settingsSection('#settings/'+section,project.role);if(section===current&&!force)return true;
  if(!await canLeave())return false;busy=true;
  try{mounted?.destroy();mounted=null;dirty=false;current=section;const meta=groups.flatMap(g=>g.items).find(i=>i.id===section);navigation();if(historyMode!=='none')history[historyMode==='replace'?'replaceState':'pushState'](null,'','#settings/'+section);heading.innerHTML=`<div><h1 tabindex="-1" data-section-title>${esc(meta.label)}</h1><p>${esc(meta.description)}</p></div><a class="iq-btn ghost icon" href="#tasks" data-section-link="tasks" aria-label="Закрыть настройки">${icon('x',20)}</a>`;content.innerHTML='<p class="iq-helper" role="status">Загружаем настройки…</p>';
   if(section==='appearance')renderAppearance();
   else if(['account','profile','workspace'].includes(section))await renderForm(section);
   else if(section==='planning')await renderPlanning();
   else{const props={repository,project,onBack:()=>select('appearance'),embedded:true};if(section==='members')mounted=await mountMembers(content,props);else if(section==='agents')mounted=await mountAgents(content,props);else if(section==='operations')mounted=await mountOperations(content,props);else mounted=await mountProjectTaskSettings(content,{...props,section,canManage:project.role==='admin'});}
   if(closed){mounted?.destroy();return false;}
   if(historyMode==='push')heading.querySelector('h1').focus({preventScroll:true});
   return true;
  }catch(error){if(!closed){content.innerHTML=`${ui.alert('Не удалось загрузить настройки',esc(error.message),'danger')}${ui.btn('Попробовать снова','secondary','','data-retry-settings')}`;}return true;}
  finally{busy=false;}
 }
 root.addEventListener('input',event=>{if(event.target.matches('[data-settings-search]'))navigation();},{signal:abort.signal});
 root.addEventListener('iq-change',event=>{const key=event.target.dataset.appearance;if(key){preferences.update({[key]:event.detail.value});syncAppearance();}},{signal:abort.signal});
 root.addEventListener('change',event=>{if(event.target.matches('[name=accent]'))preferences.update({accent:event.target.value});if(event.target.matches('[data-appearance-motion]'))preferences.update({motion:event.target.checked?'reduced':'system'});if(current==='appearance')syncAppearance();},{signal:abort.signal});
 root.addEventListener('click',async event=>{
  const link=event.target.closest('[data-settings-section]');if(link){if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();await select(link.dataset.settingsSection);return;}
  if(event.target.closest('[data-reset-appearance]')){preferences.reset();syncAppearance();return;}
  if(event.target.closest('[data-reset-form]')){resetForm();return;}
  if(event.target.closest('[data-retry-settings]')){await select(current,{force:true,historyMode:'replace'});return;}
  const action=event.target.closest('[data-settings-action]');if(!action||action.disabled||busy||modal)return;
  if(!await canLeave())return;busy=true;
  try{if(action.dataset.settingsAction==='planning'){const result=await settingsDialog({adapter,projectId:project.id,onCommitted:async()=>{await renderPlanning();notify({message:'Параметры планирования сохранены',tone:'success'});},onClose:()=>{modal=null;}});modal=result.element;}
   else {const element=action.dataset.settingsAction==='avatar'?await editProjectProfile({repository,project,onChanged:async()=>{await onChanged();await renderForm('profile');}}):await editWorkspace({client:repository.client,workspaceId:project.workspaceId,onChanged:async()=>{await onChanged();await renderForm('workspace');}});track(element);}
  }catch(error){track(dialog({title:'Не удалось открыть настройки',description:error.message}));}finally{busy=false;if(closed)modal?.close(true);}
 },{signal:abort.signal});
 window.addEventListener('sprintique-appearance-change',syncAppearance,{signal:abort.signal});
 const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload,{signal:abort.signal});
 await select(settingsSection(location.hash,project.role),{historyMode:'replace'});
 return {get routeHash(){return '#settings/'+current;},navigateSettings:async()=>{const ok=await select(settingsSection(location.hash,project.role),{historyMode:'none'});history.replaceState(null,'','#settings/'+current);return ok;},closeTask:canLeave,readyToLeave:()=>!busy&&!modal&&!dirty&&(!mounted||mounted.readyToLeave()),destroy(){closed=true;abort.abort();mounted?.destroy();modal?.close(true);root.replaceChildren();}};
}
