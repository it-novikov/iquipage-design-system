import {loadingMarkup,sectionLoadingShape} from '../loading.js';
import {dialog,icon,esc} from '../ui.js';
import {ui,formatDate} from '@iquipage/web/core';
import {editCatalogItem,tagMarkup} from './catalog-ui.js';
import {TAG_TONES} from './workspace-model.js';
import {starterTaskSettings,compileTaskTemplate,TEMPLATE_MODES,STARTER_TASK_TEMPLATES,upgradeLegacyTaskSettings} from './task-templates.js';
import {taskMarkdown} from './task-content.js';
import {select} from '../ui.js';
const priorities={normal:'Обычный',high:'Высокий',critical:'Критический',low:'Низкий'};
const modes={inherit:'Как в базовом',append:'Базовый плюс своё описание',replace:'Своё описание',exclude:'Без описания'};
const kinds=[['task','Задача','checklist'],['bug','Баг','bug'],['epic','Эпик','stack']];
const row=({media,title,meta=[],aside='',actions='',button='',muted=false})=>{
  const inner=`<span class="iq-settings-row-media">${media}</span><span class="iq-settings-row-copy"><span class="iq-settings-row-title">${title}</span>${meta.filter(Boolean).length?`<span class="iq-settings-row-meta">${meta.filter(Boolean).map(m=>`<span>${m}</span>`).join('')}</span>`:''}</span>`;
  return button?`<button type="button" class="iq-settings-row" ${button}>${inner}<span class="iq-settings-row-aside">${aside}</span><span class="iq-settings-row-chevron">${icon('chevron',17)}</span></button>`
    :`<div class="iq-settings-row"${muted?' data-state="muted"':''}>${inner}<span class="iq-settings-row-aside">${aside}</span><span class="iq-settings-row-actions">${actions}</span></div>`;
};
const taskCount=n=>{const a=n%100,b=n%10;return `В ${n} ${a>10&&a<20?'задачах':b===1?'задаче':'задачах'}`;};
const tile=glyph=>`<span class="iq-settings-row-tile">${icon(glyph,18)}</span>`;
const group=(title,description,body,count=null)=>`<section class="iq-settings-group"><header class="iq-settings-group-head"><div><h2>${esc(title)}${count!==null?`<span class="iq-settings-group-count">${count}</span>`:''}</h2>${description?`<p>${esc(description)}</p>`:''}</div></header>${body}</section>`;
const empty=(title,body,action='',glyph='palette')=>`<div class="iq-empty compact"><span class="iq-settings-row-tile">${icon(glyph,20)}</span><h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;
/** Project tags and task templates on the DS settings compositions. Readers see the same content without actions. */
export async function mountProjectTaskSettings(root,{repository,project,section,canManage=true,notice=''}){
  let closed=false,items=[],activeDialog=null,settings;
  root.innerHTML=`${notice}<div class="iq-settings-stack" data-settings-content>${loadingMarkup('Загрузка настроек задачи…',{variant:sectionLoadingShape('settings',section)})}</div><p class="iq-inline danger" role="alert" hidden></p>`;
  const content=root.querySelector('[data-settings-content]'),error=root.querySelector('[role=alert]'),abort=new AbortController();
  const fail=cause=>{if(!closed){error.hidden=false;error.textContent=cause.message;if(content.querySelector('[data-loading-shape]')){content.innerHTML=ui.btn('Повторить загрузку','secondary sm','','data-retry-settings');content.querySelector('[data-retry-settings]').onclick=()=>{content.innerHTML=loadingMarkup('Загрузка настроек задачи…',{variant:sectionLoadingShape('settings',section)});void reload();};}}};
  const track=element=>{activeDialog=element;element.addEventListener('iq-close',()=>{if(activeDialog===element)activeDialog=null;},{once:true});};
  async function reload(){
    if(closed)return;error.hidden=true;
    try{
      if(section==='templates'){settings=(await repository.list('taskSettings',project.id,{signal:abort.signal}))[0]||starterTaskSettings(project.id);renderTemplates();}
      else {items=await repository.list(section,project.id,{signal:abort.signal});renderCatalog();}
    }catch(cause){fail(cause);}
  }
  function tagRow(item){
    const menu=canManage?ui.menu(`<button type="button" class="iq-btn ghost icon sm" aria-label="Действия: ${esc(item.name)}">${icon('more',17)}</button>`,[{label:'В архив',action:'archive-tag',glyph:'folder'}]):'';
    const actions=!canManage?'':item.archivedAt?`<button type="button" class="iq-btn ghost sm" data-archive-item="${esc(item.id)}">Восстановить</button>`:`<button type="button" class="iq-btn ghost sm" data-edit-item="${esc(item.id)}">Изменить</button>${menu}`;
    return `<div class="iq-settings-row"${item.archivedAt?' data-state="muted"':''} data-tag-id="${esc(item.id)}"><span class="iq-settings-row-copy"><span class="iq-settings-row-title">${tagMarkup({...item,archivedAt:null})}</span></span><span class="iq-settings-row-aside">${Number.isFinite(item.usageCount)?`<span>${item.usageCount?esc(taskCount(item.usageCount)):'Не используется'}</span>`:''}${esc(TAG_TONES[item.tone]||(/^#[0-9A-F]{6}$/i.test(item.tone)?'Свой цвет '+item.tone.toUpperCase():TAG_TONES.neutral))}</span><span class="iq-settings-row-actions">${actions}</span></div>`;
  }
  function renderCatalog(){
    if(closed)return;
    const sorted=items.sort((a,b)=>a.name.localeCompare(b.name,'ru')),live=sorted.filter(i=>!i.archivedAt),archived=sorted.filter(i=>i.archivedAt);
    if(section!=='tags'){content.innerHTML=group('Релизы','Выбранный релиз не меняет статус задачи автоматически.',`<div class="iq-settings-panel">${sorted.map(item=>row({media:tile('calendar'),title:esc(item.name),meta:[item.status==='released'?'Выпущен':'Планируется',item.targetDate?'Выпуск '+esc(formatDate(item.targetDate)):''],actions:canManage?`<button type="button" class="iq-btn ghost sm" data-edit-item="${esc(item.id)}">Изменить</button>`:'',muted:!!item.archivedAt})).join('')||empty('Релизов пока нет','Создайте первый релиз в планировании.','','calendar')}</div>`);return;}
    const board='<a class="iq-btn secondary sm" href="#tasks" data-section-link="tasks">Открыть доску</a>';
    content.innerHTML=group('Все теги','Новые теги создаются в карточке задачи. Здесь их переименовывают, перекрашивают и убирают в архив.',`<div class="iq-settings-panel">${live.map(tagRow).join('')||empty('Тегов пока нет','Откройте задачу и добавьте первый тег. Здесь можно будет переименовать его или сменить цвет.',board)}</div>${archived.length?`<details class="iq-accordion iq-settings-past"><summary>Архив (${archived.length}) ${icon('down',16)}</summary><div class="iq-settings-panel">${archived.map(tagRow).join('')}</div></details>`:''}`,live.length);
  }
  function renderTemplates(){
    if(closed)return;
    const base=settings.base,baseText=taskMarkdown(base);
    const baseRow=row({media:tile('file'),title:'Базовый шаблон',meta:['Общая основа для всех типов',baseText?'Описание задано':'Описание не задано',base.priority?'Приоритет '+(priorities[base.priority]||base.priority).toLocaleLowerCase('ru'):''],button:`data-edit-template="base"`});
    const typeRows=kinds.map(([type,name,glyph])=>{const spec=settings.types[type]||{};return row({media:tile(glyph),title:name,meta:[modes[spec.descriptionMode||'inherit']||TEMPLATE_MODES[spec.descriptionMode],spec.priority?'Приоритет '+(priorities[spec.priority]||spec.priority).toLocaleLowerCase('ru'):''],button:`data-edit-template="${type}"`});}).join('');
    content.innerHTML=group('Основа','Шаблоны меняют только новые задачи. Существующие задачи не перезаписываются.',`<div class="iq-settings-panel">${baseRow}</div>`)+group('Типы задач','Каждый тип наследует базовый шаблон или задаёт своё описание.',`<div class="iq-settings-panel">${typeRows}</div>`);
  }
  function previewTemplate(type){
    const names={base:'Базовый шаблон',task:'Шаблон задачи',bug:'Шаблон бага',epic:'Шаблон эпика'};
    track(dialog({title:names[type],description:'Так начинается описание новой задачи. Менять шаблоны может администратор проекта.',wide:true,body:'<iq-markdown-viewer density="compact"></iq-markdown-viewer>',mount:element=>{element.querySelector('iq-markdown-viewer').value=taskMarkdown(compileTaskTemplate(settings,type==='base'?'task':type))||'Описание не задано.';}}));
  }
  root.addEventListener('click',event=>{
    const template=event.target.closest('[data-edit-template]');if(template){canManage?editTemplate(template.dataset.editTemplate):previewTemplate(template.dataset.editTemplate);return;}
    if(!canManage)return;
    const edit=event.target.closest('[data-edit-item]');
    if(edit)track(editCatalogItem(section,{repository,project,item:items.find(item=>item.id===edit.dataset.editItem),onSaved:reload}));
    const archive=event.target.closest('[data-archive-item],[data-action="archive-tag"]');if(archive)archiveItem(items.find(item=>item.id===(archive.dataset.archiveItem||archive.closest('[data-tag-id]')?.dataset.tagId)));
  },{signal:abort.signal});
  function archiveItem(item){
    if(!item)return;
    track(dialog({title:item.archivedAt?`Вернуть тег «${item.name}»?`:`Убрать тег «${item.name}» в архив?`,description:item.archivedAt?'Тег снова можно будет выбирать в задачах.':'Задачи сохранят этот тег. Его просто не будут предлагать при новом назначении.',submitLabel:item.archivedAt?'Восстановить':'В архив',onSubmit:async()=>{
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
    const element=dialog({title:names[type],body,wide:true,submitLabel:'Сохранить шаблон',success:'Шаблон сохранён',onSubmit:async(values,form)=>{
      saving=true;try{await repository.write('taskSettings',candidate(form),settings.revision);baseline=JSON.stringify(readSpec(form));await reload();}finally{saving=false;}
    },mount:(element,form)=>{
      const editor=form.querySelector('iq-markdown-editor');editor.value=taskMarkdown(spec);
      form.querySelector('[data-use-starter]').addEventListener('click',()=>{const preset=STARTER_TASK_TEMPLATES.find(t=>t.id===form.querySelector('[name=starter]').value);if(!preset)return;dialog({title:'Заменить содержание шаблона?',description:'Название типа и другие шаблоны останутся без изменений.',submitLabel:'Использовать основу',onSubmit:async()=>{editor.value=preset.description;if(!base)form.querySelector('[name=descriptionMode]').value='replace';preview();}});});
      function preview(){
        const target=form.querySelector('[data-effective-template]');
        try{
          const effective=compileTaskTemplate(candidate(form),base?'task':type);
          target.innerHTML='<iq-markdown-viewer density="compact"></iq-markdown-viewer>';
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
