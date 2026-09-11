import {mountTaskFiles} from './task-files-view.js';
import {uid} from '../common.js';
import {mountTaskLinks} from './link-view.js';
import {dialog,input,select,icon,esc} from '../ui.js';
import {TASK_COLUMNS,taskColumn,createTask} from '../tasks.js';
import {TASK_KINDS,reparentTask} from './model.js';
import {taskMarkdown,markdownTaskChanges} from './task-content.js';
import {mountThreads} from './thread-view.js';
import {loadTaskSupport,mountTaskCatalogs} from './catalog-picker.js';
import {starterTaskSettings,instantiateTaskTemplate,STARTER_TASK_TEMPLATES} from './task-templates.js';
import {mountTaskDescription} from './description-view.js';
import {copyAtButton,motionReduced} from '@iquipage/web/core';
import {taskKey,taskURL} from './task-route.js';

export async function openTaskDialog(task,{repository,project,tasks,canEdit=true,canManage=true,attachmentAdapter=null,status='ready',fullscreen=false,onOpenTask,onSaved=()=>{}}){
  const support=await loadTaskSupport(repository,project.id);
  const settings=support.settings||starterTaskSettings(project.id);
  const initial=task||{...instantiateTaskTemplate(settings,'task'),type:'task',status,owner:'',title:''};
  const taskId=task?.id||uid('task');
  let files,description;
  let current=task,baseline='',saving=false,confirming=false,priorityTouched=false,catalogs,threads,links;
  let templateVersion=initial.templateVersion,lastTemplateContent=taskMarkdown(initial);
  const parents=[{value:'',label:'Отсутствует'},...tasks.filter(item=>{
    if(item.archivedAt||item.projectId!==project.id)return false;
    try{reparentTask({...initial,id:taskId,projectId:project.id},item.id,tasks);return true;}catch{return false;}
  }).map(item=>({value:item.id,label:`${item.displayId||item.id.slice(-7).toUpperCase()} · ${item.title}`,description:`${TASK_KINDS[item.type]||'Задача'} · ${TASK_COLUMNS.find(c=>c.id===taskColumn(item))?.label||item.status}`}))];
  const content=`<div class="task-editor-layout"><div class="task-editor-content"><section class="task-editor-cover" data-task-cover></section>
    ${input('title','Название',initial.title,{required:true,placeholder:'Что нужно сделать?'})}
    <section class="task-edit-section"><div class="row between"><h3>Описание</h3>${canEdit?'<button type="button" class="iq-btn ghost sm" data-apply-template>Применить шаблон</button>':''}</div>
      <div class="task-description-surface" data-description>
        <iq-markdown-editor label="Описание" name="description" variant="compact" density="compact" maxlength="10000" preview-on-blur></iq-markdown-editor>
      </div><div class="task-tags-row" data-task-tags aria-label="Теги задачи"></div></section>
    </div><aside class="task-editor-properties" aria-label="Свойства задачи">
    <div class="task-edit-properties">
      ${select('type','Тип',initial.type||'task',Object.entries(TASK_KINDS))}
      ${select('status','Статус',task?taskColumn(task):status,TASK_COLUMNS.map(column=>[column.id,column.label]))}
      ${input('owner','Ответственный',initial.owner||'',{maxlength:120,placeholder:'Можно назначить позже'})}
      ${select('priority','Приоритет',initial.priority||'normal',[['normal','Обычный'],['high','Высокий'],['critical','Критический'],['low','Низкий']])}
      <iq-date-field name="due" label="Срок" value="${esc(initial.due||'')}"></iq-date-field>
    </div><section data-task-catalogs></section></aside>
    <div class="task-editor-supplements">
    <section class="task-edit-section" data-task-files></section>
    <section class="task-edit-section"><h3>Связи</h3><iq-combobox name="parent" label="Родительская задача" value="${esc(initial.parentId||'')}" options="${esc(JSON.stringify(parents))}" placeholder="Найти задачу по номеру или названию"></iq-combobox><div data-task-links></div></section>
    <section class="task-edit-section" data-task-threads></section></div></div><p role="status" class="iq-helper" data-task-save-state></p>`;
  const read=(form,values=new FormData(form))=>({
    title:String(values.get('title')||'').trim(),type:values.get('type')||'task',status:values.get('status'),
    owner:values.get('owner')||'',priority:values.get('priority')||'normal',
    ...markdownTaskChanges(initial,form.querySelector('iq-markdown-editor[name=description]').value),
    due:form.querySelector('iq-date-field[name=due]').value||null,
    parentId:form.querySelector('iq-combobox[name=parent]').value||null,
    ...catalogs.value(),...files.value(),templateVersion
  });
  const el=dialog({title:task?taskKey(task):'Новая задача',body:content,wide:true,submitLabel:canEdit?'Сохранить задачу':'',
    onSubmit:canEdit?async(values,form)=>{
      files.assertReady();
      if(threads?.isBusy())throw Error('Дождитесь публикации обсуждения.');saving=true;files.setLocked(true);
      try{
        const changes=read(form,values),value=current?{...current,...changes}:{...createTask({projectId:project.id,...changes}),...changes,id:taskId};
        const next=reparentTask(value,changes.parentId,tasks);
        const saved=await repository.write('tasks',next,current?.revision||0);
        current=saved;files.accepted(saved);baseline=JSON.stringify(read(form,values));await onSaved(saved);
        if(threads?.dirty()){form.querySelector('[data-task-save-state]').textContent='Задача сохранена. Черновик сообщения ещё не опубликован.';return false;}
      }finally{saving=false;files.setLocked(false);}
    }:undefined,
    mount:(el,form)=>{
      el.classList.add('task-edit-dialog');el.setAttribute('kind','drawer');el.setAttribute('persistent','');
      el.dataset.fullscreen=String(fullscreen);
      if(task){
        const title=form.querySelector('.iq-dialog-head h2');title.className='task-dialog-identity';title.innerHTML=`<button type="button" class="iq-btn ghost sm task-link-copy" data-copy-task-link title="Скопировать ссылку">${esc(taskKey(task))}</button><button type="button" class="iq-btn ghost icon sm" data-copy-task-icon data-copy-tone="neutral" aria-label="Скопировать ссылку на задачу">${icon('copy',18)}</button>`;
        const actions=document.createElement('div');actions.className='task-dialog-actions';
        actions.innerHTML=`<button type="button" class="iq-btn ghost icon sm" data-task-fullscreen aria-label="${fullscreen?'Свернуть в боковое меню':'Открыть на весь экран'}">${icon('expand',18)}</button>`;
        const close=form.querySelector('.iq-dialog-head [data-close]');close.before(actions);actions.append(close);
        const copyIcon=title.querySelector('[data-copy-task-icon]');
        title.querySelector('[data-copy-task-link]').addEventListener('click',()=>copyAtButton(copyIcon,taskURL(task)));
        copyIcon.addEventListener('click',()=>copyAtButton(copyIcon,taskURL(task)));
        actions.querySelector('[data-task-fullscreen]').addEventListener('click',event=>{const native=el.querySelector('dialog'),before=native.getBoundingClientRect();fullscreen=!fullscreen;el.dataset.fullscreen=String(fullscreen);event.currentTarget.setAttribute('aria-label',fullscreen?'Свернуть в боковое меню':'Открыть на весь экран');if(!motionReduced())native.animate([{width:before.width+'px'},{width:native.getBoundingClientRect().width+'px'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});});
      }
      el.querySelector('dialog').classList.add('iq-drawer');
      files=mountTaskFiles(form.querySelector('[data-task-files]'),{coverRoot:form.querySelector('[data-task-cover]'),adapter:attachmentAdapter,task:{...initial,id:taskId,projectId:project.id},readOnly:!canEdit});
      const editor=form.querySelector('iq-markdown-editor[name=description]');
      description=mountTaskDescription(form.querySelector('[data-description]'),{value:taskMarkdown(initial),editing:!task,readOnly:!canEdit});
      catalogs=mountTaskCatalogs(form.querySelector('[data-task-catalogs]'),{tagsRoot:form.querySelector('[data-task-tags]'),repository,project,task:initial,tags:support.tags,releases:support.releases,readOnly:!canEdit,canManage});
      if(task&&repository.capabilities?.taskLinks!==false)links=mountTaskLinks(form.querySelector('[data-task-links]'),{repository,project,task,tasks,readOnly:!canEdit,onOpenTask:async id=>{
        if(onOpenTask){await onOpenTask(id);return;}
        const target=await repository.read('tasks',id,project.id);if(!target)throw Error('Задача недоступна.');
        await openTaskDialog(target,{repository,project,tasks,canEdit,canManage,attachmentAdapter,onSaved});
      }});
      if(task)threads=mountThreads(form.querySelector('[data-task-threads]'),{repository,task,readOnly:!canEdit});
      else form.querySelector('[data-task-threads]').hidden=true;
      function applyTemplate(changePriority=false){
        const result=instantiateTaskTemplate(settings,form.querySelector('iq-select[name=type]').value);
        editor.value=taskMarkdown(result);
        description.refresh();
        templateVersion=result.templateVersion;
        if(changePriority&&!priorityTouched)form.querySelector('iq-select[name=priority]').value=result.priority;
        lastTemplateContent=editor.value;
      }
      form.addEventListener('iq-change',event=>{
        if(event.target.getAttribute('name')==='priority')priorityTouched=true;
        if(event.target.getAttribute('name')!=='type'||current)return;
        const untouched=editor.value===lastTemplateContent;
        if(untouched)applyTemplate(true);
      });
      form.querySelector('[data-apply-template]')?.addEventListener('click',()=>dialog({
        title:'Выбрать шаблон',description:'Шаблон заменит описание и чек-листы. Название и остальные свойства сохранятся.',
        body:select('starter','Основа','project',[['project','Шаблон типа из настроек проекта'],...STARTER_TASK_TEMPLATES.map(t=>[t.id,t.name])]),
        submitLabel:'Применить',onSubmit:async values=>{const id=values.get('starter');if(id==='project')applyTemplate();else{editor.value=STARTER_TASK_TEMPLATES.find(t=>t.id===id).description;description.refresh();}}
      }));
      const dirty=()=>canEdit&&(JSON.stringify(read(form))!==baseline||files.dirty()||threads?.dirty());
      async function close(){
        if(saving||confirming||threads?.isBusy())return false;
        if(!dirty()){el.close();return true;}
        confirming=true;
        let discarded=false;
        const confirm=dialog({
          title:'Закрыть без сохранения?',
          description:'Изменения задачи и неопубликованные сообщения будут потеряны. Уже опубликованные сообщения сохранятся.',
          submitLabel:'Не сохранять',onSubmit:async()=>{discarded=true;el.close();}
        });
        return new Promise(resolve=>confirm.addEventListener('iq-close',()=>{confirming=false;resolve(discarded);},{once:true}));
      }
      el.taskController={close,dirty:()=>dirty()||saving||files.isBusy()||threads?.isBusy(),taskId,taskKey:task?taskKey(task):null};
      form.addEventListener('click',event=>{
        if(event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();close();}
      },{capture:true});
      el.querySelector('dialog').addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();close();},{capture:true});
      const native=el.querySelector('dialog');let outsideDown=false;
      const outside=event=>{const r=native.getBoundingClientRect();return event.target===native&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
      native.addEventListener('pointerdown',event=>{outsideDown=outside(event);});
      native.addEventListener('click',event=>{if(outsideDown&&outside(event)){event.preventDefault();event.stopImmediatePropagation();close();}outsideDown=false;},{capture:true});
      form.addEventListener('keydown',event=>{
        if(event.isComposing||!canEdit||event.target.closest('[data-task-threads]'))return;
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopPropagation();form.requestSubmit();}
      });
      const unload=event=>{
        if(dirty()||saving||threads?.isBusy()){event.preventDefault();event.returnValue='';}
      };
      window.addEventListener('beforeunload',unload);
      el.addEventListener('iq-close',()=>{
        window.removeEventListener('beforeunload',unload);description.destroy();files.destroy();catalogs.destroy();threads?.destroy();links?.destroy();
      },{once:true});
      baseline=JSON.stringify(read(form));
      if(!canEdit)form.querySelectorAll('input,iq-select,iq-combobox,iq-date-field,iq-markdown-editor').forEach(node=>node.setAttribute('disabled',''));
    }
  });
  return el;
}
