import {dialog,select,icon,esc} from '../ui.js';
import {editCatalogItem,tagMarkup} from './catalog-ui.js';
import {starterTaskSettings,compileTaskTemplate,TEMPLATE_MODES,STARTER_TASK_TEMPLATES,upgradeLegacyTaskSettings} from './task-templates.js';
import {taskMarkdown} from './task-content.js';
export async function mountProjectTaskSettings(root,{repository,project,section,onBack=()=>{},canManage=true}){
  let closed=false,items=[],activeDialog=null,settings;
  const titles={tags:'Теги проекта',releases:'Релизы проекта',templates:'Шаблоны задач'};
  const createLabel=section==='tags'?'Новый тег':'Новый релиз';
  const createButton=section!=='templates'&&canManage?`<button type="button" class="iq-btn primary sm" data-catalog-create>${createLabel}</button>`:'';
  root.innerHTML=`<div class="host-settings task-settings-page">
    <button type="button" class="iq-btn ghost sm" data-settings-back>${icon('left',16)}<span>Настройки проекта</span></button>
    <div class="row between"><h1>${titles[section]}</h1>${createButton}</div>
    <p class="map-form-error" role="alert" hidden></p><div data-settings-content></div></div>`;
  const content=root.querySelector('[data-settings-content]'),error=root.querySelector('[role=alert]'),abort=new AbortController();
  const fail=cause=>{if(!closed){error.hidden=false;error.textContent=cause.message;}};
  const track=element=>{activeDialog=element;element.addEventListener('iq-close',()=>{if(activeDialog===element)activeDialog=null;},{once:true});};
  async function reload(){
    try{
      if(section==='templates'){settings=(await repository.list('taskSettings',project.id))[0]||starterTaskSettings(project.id);renderTemplates();}
      else {items=await repository.list(section,project.id);renderCatalog();}
    }catch(cause){fail(cause);}
  }
  function catalogRow(item){
    const releaseInfo=`<b>${esc(item.name)}</b><small>${item.status==='released'?'Выпущен':'Планируется'}${item.targetDate?' · '+esc(item.targetDate):''}${item.archivedAt?' · в архиве':''}</small>`;
    const controls=canManage?`<button type="button" class="iq-btn ghost sm" data-edit-item="${esc(item.id)}">Изменить</button><button type="button" class="iq-btn ghost sm" data-archive-item="${esc(item.id)}">${item.archivedAt?'Восстановить':'В архив'}</button>`:'';
    return `<div class="iq-list-item"><div>${section==='tags'?tagMarkup(item):releaseInfo}</div>${controls}</div>`;
  }
  function renderCatalog(){
    if(closed)return;
    const hint=section==='tags'?'Теги общие для проекта. Изменение имени и цвета отобразится во всех задачах.':'Выбранный релиз не меняет статус задачи автоматически.';
    const rows=items.sort((a,b)=>Number(!!a.archivedAt)-Number(!!b.archivedAt)||a.name.localeCompare(b.name,'ru')).map(catalogRow).join('');
    content.innerHTML=`<p class="iq-helper">${hint}</p><div class="iq-list">${rows||'<p class="iq-helper">Пока ничего не добавлено.</p>'}</div>`;
  }
  function renderTemplates(){
    if(closed)return;
    const names={base:'Базовый шаблон',task:'Задача',bug:'Баг',epic:'Эпик'};
    const rows=Object.entries(names).map(([type,name])=>{
      const spec=type==='base'?settings.base:compileTaskTemplate(settings,type);
      const button=canManage?`<button type="button" class="iq-btn ghost sm" data-edit-template="${type}">Настроить</button>`:'';
      return `<div class="iq-list-item"><div><b>${name}</b><small>${taskMarkdown(spec)?'Описание и критерии готовности':'Без заданного содержания'}</small></div>${button}</div>`;
    }).join('');
    content.innerHTML=`<p class="iq-helper">Базовый шаблон общий для всех задач. Шаблон типа наследует его или явно меняет нужные части. Существующие задачи не перезаписываются.</p><div class="iq-list">${rows}</div>`;
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-settings-back]'))onBack();
    if(!canManage)return;
    if(event.target.closest('[data-catalog-create]'))track(editCatalogItem(section,{repository,project,onSaved:reload}));
    const edit=event.target.closest('[data-edit-item]');
    if(edit)track(editCatalogItem(section,{repository,project,item:items.find(item=>item.id===edit.dataset.editItem),onSaved:reload}));
    const template=event.target.closest('[data-edit-template]');if(template)editTemplate(template.dataset.editTemplate);
    const archive=event.target.closest('[data-archive-item]');if(archive)archiveItem(items.find(item=>item.id===archive.dataset.archiveItem));
  },{signal:abort.signal});
  function archiveItem(item){
    if(!item)return;
    track(dialog({title:item.archivedAt?'Восстановить значение?':'Переместить в архив?',description:'Существующие задачи сохранят эту связь. Архивное значение не предлагается при новом назначении.',submitLabel:item.archivedAt?'Восстановить':'В архив',onSubmit:async()=>{
      await repository.write(section,{...item,archivedAt:item.archivedAt?null:new Date().toISOString()},item.revision);await reload();
    }}));
  }
  function editTemplate(type,source=settings,confirmed=false){
    if(!confirmed&&[source.base,...Object.values(source.types)].some(spec=>spec.checklists?.length)){
      track(dialog({title:'Объединить содержание шаблонов?',description:'Чек-листы станут частью Markdown. Содержание всех типов сохранится, но каждый тип получит самостоятельное описание вместо отдельных правил наследования чек-листов. Изменения вступят в силу только после сохранения шаблона; исходные настройки останутся в резервной копии.',submitLabel:'Перейти к редактору',onSubmit:async()=>{queueMicrotask(()=>editTemplate(type,upgradeLegacyTaskSettings(source),true));}}));return;
    }
    const base=type==='base',spec=structuredClone(base?source.base:source.types[type]||{});
    const names={base:'Базовый шаблон',task:'Шаблон задачи',bug:'Шаблон бага',epic:'Шаблон эпика'};
    let baseline='',saving=false;
    const descriptionMode=base?'':select('descriptionMode','Описание',spec.descriptionMode||'inherit',Object.entries(TEMPLATE_MODES));
    const priorities=base?[]:[['','Как в базовом']];priorities.push(['normal','Обычный'],['high','Высокий'],['critical','Критический'],['low','Низкий']);
    const body=`${select('templatePriority','Приоритет по умолчанию',spec.priority||(base?'normal':''),priorities)}${descriptionMode}
      <iq-markdown-editor name="template-description" label="Описание шаблона" variant="compact" maxlength="10000"></iq-markdown-editor>
      ${select('starter','Готовая основа','',[['','Выбрать основу'],...STARTER_TASK_TEMPLATES.map(t=>[t.id,t.name])])}<button type="button" class="iq-btn secondary sm" data-use-starter>Использовать основу</button>
      <details class="iq-accordion" open><summary>Итоговый шаблон ${icon('plus',16)}</summary><div data-effective-template></div></details>`;
    const readSpec=form=>({
      description:form.querySelector('iq-markdown-editor').value,checklists:[],contentVersion:2,...(spec.checklists?.length?{legacyChecklists:spec.checklists}:{}),
      priority:form.querySelector('[name=templatePriority]').value||null,
      ...(base?{}:{descriptionMode:form.querySelector('[name=descriptionMode]').value,checklistsMode:spec.checklistsMode||'inherit'})
    });
    const candidate=form=>{const value=structuredClone(source);if(base)value.base=readSpec(form);else value.types[type]=readSpec(form);return value;};
    const element=dialog({title:names[type],body,wide:true,submitLabel:'Сохранить шаблон',onSubmit:async(values,form)=>{
      saving=true;try{await repository.write('taskSettings',candidate(form),settings.revision);baseline=JSON.stringify(readSpec(form));await reload();}finally{saving=false;}
    },mount:(element,form)=>{
      const editor=form.querySelector('iq-markdown-editor');editor.value=taskMarkdown(spec);
      form.querySelector('[data-use-starter]').addEventListener('click',()=>{const preset=STARTER_TASK_TEMPLATES.find(t=>t.id===form.querySelector('[name=starter]').value);if(!preset)return;dialog({title:'Заменить содержание шаблона?',description:'Название типа и другие шаблоны останутся без изменений.',submitLabel:'Использовать основу',onSubmit:async()=>{editor.value=preset.description;if(!base)form.querySelector('[name=descriptionMode]').value='replace';preview();}});});
      function preview(){
        const target=form.querySelector('[data-effective-template]');
        try{
          const effective=compileTaskTemplate(candidate(form),base?'task':type);
          target.innerHTML='<iq-markdown-viewer></iq-markdown-viewer>';
          target.querySelector('iq-markdown-viewer').value=taskMarkdown(effective)||'Описание не задано.';
        }catch(cause){target.textContent=cause.message;}
      }
      form.addEventListener('iq-change',preview);baseline=JSON.stringify(readSpec(form));preview();
      const dirty=()=>JSON.stringify(readSpec(form))!==baseline;
      let confirming=false;element.setAttribute('persistent','');
      function close(){
        if(saving||confirming)return;if(!dirty()){element.close();return;}
        confirming=true;
        const confirmation=dialog({title:'Закрыть без сохранения?',description:'Изменения шаблона ещё не сохранены.',submitLabel:'Не сохранять',onSubmit:async()=>element.close(true)});
        confirmation.addEventListener('iq-close',()=>{confirming=false;},{once:true});
      }
      form.addEventListener('click',event=>{if(event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();close();}},{capture:true});
      element.querySelector('dialog').addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();close();},{capture:true});
      const unload=event=>{if(dirty()){event.preventDefault();event.returnValue='';}};
      window.addEventListener('beforeunload',unload);
      element.addEventListener('iq-close',()=>{window.removeEventListener('beforeunload',unload);},{once:true});
    }});
    track(element);
  }
  await reload();
  return {reload,readyToLeave:()=>!activeDialog,destroy(){closed=true;abort.abort();}};
}
