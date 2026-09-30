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
import {copyAtButton,motionReduced,ui} from '@iquipage/web/core';
import {taskKey,taskURL} from './task-route.js';

export async function openTaskDialog(task,{repository,project,tasks,canEdit=true,canManage=true,attachmentAdapter=null,status='ready',initialValues={},fullscreen=false,backTo=null,onBack=()=>{},onOpenTask,onReload=onOpenTask&&(()=>onOpenTask(task.id)),onSaved=()=>{},isActive=()=>true,signal,replace=null}){
  signal?.throwIfAborted();const initialTask=task;
  const [detail,context,support,members]=await Promise.all([
    task?.summary?repository.read('tasks',task.id,project.id,{signal}):task,
    repository.taskContext?repository.taskContext(project.id,{signal}):tasks,
    loadTaskSupport(repository,project.id,{signal}),
    repository.capabilities?.members===false?[]:repository.list('members',project.id,{signal})
  ]);
  signal?.throwIfAborted();task=detail;tasks=context;
  if(initialTask&&!task)throw Error('Задача недоступна.');
  const canDiscuss=canEdit;
  // Accepted release results are immutable; discussions have independent writes.
  canEdit=canEdit&&task?.result!=='accepted';
  if(!isActive())throw Error('Открытие задачи отменено.');
  const settings=support.settings||starterTaskSettings(project.id);
  const initial=task||{...instantiateTaskTemplate(settings,'task'),type:'task',status,ownerId:null,title:'',...initialValues};
  const taskId=task?.id||uid('task');
  let files,description;
  // Existing tasks save each field as it changes; a new task is created deliberately with one button.
  const autosave=!!task&&canEdit;
  let current=task,baseline='',saving=false,confirming=false,priorityTouched=false,catalogs,threads,links;
  // Owners are current human project members. A former member or pre-membership text stays visible until reassigned.
  const owners=[{value:'',label:'Не назначен'},...members.filter(m=>(m.kind??'human')==='human').map(m=>({value:m.id,label:m.name,image:repository.client?.avatarUrl?.(m.id,m.avatarRevision)||undefined}))];
  if(initial.ownerId&&!owners.some(o=>o.value===initial.ownerId))owners.push({value:initial.ownerId,label:initial.owner||'Бывший участник',description:'Больше не участник проекта'});
  const legacyOwner=!initial.ownerId&&initial.legacyOwner?`<p class="iq-helper" data-legacy-owner>Было указано: «${esc(initial.legacyOwner)}». Выберите участника проекта.</p>`:'';
  let templateVersion=initial.templateVersion,lastTemplateContent=taskMarkdown(initial);
  const parents=[{value:'',label:'Нет'},...tasks.filter(item=>{
    if(item.archivedAt||item.projectId!==project.id)return false;
    try{reparentTask({...initial,id:taskId,projectId:project.id},item.id,tasks);return true;}catch{return false;}
  }).map(item=>({value:item.id,label:`${item.displayId||item.id.slice(-7).toUpperCase()} ${item.title}`,description:`${TASK_KINDS[item.type]||'Задача'}, ${TASK_COLUMNS.find(c=>c.id===taskColumn(item))?.label||item.status}`}))];
  // Core facts form one label and value grid (state of the work on the left, people and time on the right);
  // tags follow as a quiet line. Relationships live in "Связи".
  const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';
  const ownerOptions=owners.map(({image,...o})=>o.value?{...o,avatar:{text:initials(o.label),tone:ui.avatarTone(o.value),...(image?{image}:{})}}:o);
  const statusTones={in_progress:'info',review:'warning',ready_for_testing:'info',testing:'warning',ready_for_release:'success'};
  const statusOptions=TASK_COLUMNS.map(column=>({value:column.id,label:column.label,icon:column.icon,...(statusTones[column.id]?{tone:statusTones[column.id]}:{})}));
  const priorityOptions=[['critical','Критический','critical','critical'],['high','Высокий','priority','high'],['normal','Обычный','minus',''],['low','Низкий','low','']].map(([value,label,glyph,tone])=>({value,label,icon:glyph,...(tone?{tone}:{})}));
  const kindOptions=Object.entries(TASK_KINDS).map(([value,label])=>({value,label,icon:{task:'checklist',bug:'bug',epic:'stack'}[value]||'checklist'}));
  const opts=list=>esc(JSON.stringify(list));
  const content=`<section class="task-editor-cover" data-task-cover hidden></section><div class="task-editor-layout">
    <div class="task-editor-title"><label class="sr-only" for="${taskId}-title">Название</label><textarea class="iq-inline-title" id="${taskId}-title" name="title" rows="1" required maxlength="240" placeholder="Что нужно сделать?">${esc(initial.title)}</textarea></div>
    <section class="task-editor-properties" aria-label="Свойства задачи">
      <div class="iq-properties task-props" data-columns="auto">
        <iq-select name="status" label="Статус" appearance="pill" value="${esc(task?taskColumn(task):status)}" options="${opts(statusOptions)}"></iq-select>
        <iq-combobox name="ownerId" label="Исполнитель" value="${esc(initial.ownerId||'')}" options="${opts(ownerOptions)}" placeholder="Не назначен"></iq-combobox>
        <iq-select name="priority" label="Приоритет" value="${esc(initial.priority||'normal')}" options="${opts(priorityOptions)}"></iq-select>
        <iq-date-field name="due" label="Срок" placeholder="Без срока" value="${esc(initial.due||'')}"></iq-date-field>
        <iq-select name="type" label="Тип" value="${esc(initial.type||'task')}" options="${opts(kindOptions)}"></iq-select>
        <div class="task-release-slot" data-task-catalogs></div>
      </div>${legacyOwner}
      <div class="task-tags-row" data-task-tags></div>
    </section>
    <section class="iq-section task-editor-description"><div class="iq-section-head">${icon('text',16)}<h3>Описание</h3></div>
      <div class="task-description-surface" data-description>
        <iq-markdown-editor label="Описание" name="description" variant="compact" density="compact" maxlength="10000" preview-on-blur preview empty-text="${canEdit?'Нажмите, чтобы добавить описание':'Описания нет'}" ${canEdit?'empty-action-label="Начать с шаблона" empty-action="template"':''}></iq-markdown-editor>
      </div></section>
    <div class="task-editor-supplements">
    <section class="iq-section task-relations"><div class="iq-section-head">${icon('link',16)}<h3>Связи</h3><span class="iq-section-count" data-relations-count></span><span class="iq-section-actions" data-relations-actions></span></div>
      ${task?'<div data-task-links></div>':''}
      <div class="iq-properties task-parent"><iq-select name="parent" label="Родительская задача" searchable search-placeholder="Найти задачу" value="${esc(initial.parentId||'')}" options="${opts(parents)}"></iq-select></div>
      ${task?'':'<p class="iq-helper">Подзадачи и связи с другими задачами можно добавить после создания.</p>'}</section>
    <section class="iq-section task-files-section" data-task-files></section>
    <section class="iq-section task-threads-section" data-task-threads></section></div></div><p role="status" class="iq-helper" data-task-save-state></p>`;
  const read=(form,values=new FormData(form))=>({
    title:String(values.get('title')||'').trim(),type:values.get('type')||'task',status:values.get('status'),
    ownerId:form.querySelector('iq-combobox[name=ownerId]').value||null,priority:values.get('priority')||'normal',
    ...markdownTaskChanges(initial,form.querySelector('iq-markdown-editor[name=description]').value),
    due:form.querySelector('iq-date-field[name=due]').value||null,
    parentId:form.querySelector('iq-select[name=parent]').value||null,
    ...catalogs.value(),...files.value(),templateVersion
  });
  const el=dialog({title:task?taskKey(task):'Новая задача',body:content,wide:true,replace,submitLabel:canEdit&&!task?'Создать задачу':'',
    onSubmit:canEdit&&!task?async(values,form)=>{
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
        const title=form.querySelector('.iq-dialog-head h2');title.className='task-dialog-identity';title.innerHTML=`${backTo?`<button type="button" class="iq-btn ghost icon sm task-back" data-task-back aria-label="Назад к ${esc(backTo.key)} ${esc(backTo.title)}" title="Назад к ${esc(backTo.key)}">${icon('left',18)}</button>`:''}<button type="button" class="iq-btn ghost sm iq-switcher task-link-copy" data-copy-task-link data-copy-tone="neutral" title="Скопировать ссылку" aria-label="${esc(taskKey(task))}, скопировать ссылку на задачу"><span class="iq-switcher-label">${esc(taskKey(task))}</span></button>`;
        const actions=document.createElement('div');actions.className='task-dialog-actions';
        actions.innerHTML=`<button type="button" class="iq-btn ghost icon sm" data-task-fullscreen aria-label="${fullscreen?'Свернуть в боковое меню':'Открыть на весь экран'}">${icon('expand',18)}</button>`;
        const close=form.querySelector('.iq-dialog-head [data-close]');close.before(actions);actions.append(close);
        title.querySelector('[data-task-back]')?.addEventListener('click',()=>onBack());
        // The key is the link: it reacts like the workspace and project switchers and copies the task URL.
        const keyButton=title.querySelector('[data-copy-task-link]');
        keyButton.addEventListener('click',()=>copyAtButton(keyButton,taskURL(task)));
        actions.querySelector('[data-task-fullscreen]').addEventListener('click',event=>{const native=el.querySelector('dialog'),before=native.getBoundingClientRect();fullscreen=!fullscreen;el.dataset.fullscreen=String(fullscreen);event.currentTarget.setAttribute('aria-label',fullscreen?'Свернуть в боковое меню':'Открыть на весь экран');if(!motionReduced())native.animate([{width:before.width+'px'},{width:native.getBoundingClientRect().width+'px'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});});
      }
      el.querySelector('dialog').classList.add('iq-drawer');
      if(canEdit){
        // The cover is added from the header, so an empty cover never takes space in the drawer.
        const close=form.querySelector('.iq-dialog-head [data-close]'),add=document.createElement('button');
        let actions=form.querySelector('.task-dialog-actions');
        if(!actions){actions=document.createElement('div');actions.className='task-dialog-actions';close.before(actions);actions.append(close);}
        add.type='button';add.className='iq-btn ghost icon sm task-cover-add';add.dataset.taskAddCover='';add.hidden=true;add.setAttribute('aria-label','Добавить обложку');add.title='Добавить обложку';add.innerHTML=icon('image',18);
        actions.insertBefore(add,actions.firstElementChild);
        add.addEventListener('click',()=>files?.addCover());
      }
      files=mountTaskFiles(form.querySelector('[data-task-files]'),{onCoverState:has=>{const add=el.querySelector('[data-task-add-cover]');if(add)add.hidden=has;},coverRoot:form.querySelector('[data-task-cover]'),adapter:attachmentAdapter,task:{...initial,id:taskId,projectId:project.id},readOnly:!canEdit});
      const editor=form.querySelector('iq-markdown-editor[name=description]');
      const titleField=form.querySelector('[name=title]');
      // The title is one line of intent: Enter moves on instead of adding a line break.
      titleField.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();titleField.blur();}});
      const dueField=form.querySelector('iq-date-field[name=due]'),localDay=offset=>{const d=new Date(Date.now()+offset*86400000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
      // Overdue is red, due today or tomorrow is amber; finished work carries no alarm.
      const dueTone=()=>{const value=dueField.value,done=form.querySelector('iq-select[name=status]')?.value==='ready_for_release';dueField.dataset.tone=!value||done?'':value<localDay(0)?'danger':value<=localDay(1)?'warning':'';};
      form.addEventListener('iq-change',dueTone);form.addEventListener('change',dueTone);requestAnimationFrame(dueTone);
      description=mountTaskDescription(form.querySelector('[data-description]'),{value:taskMarkdown(initial),editing:false,readOnly:!canEdit});
      catalogs=mountTaskCatalogs(form.querySelector('[data-task-catalogs]'),{tagsRoot:form.querySelector('[data-task-tags]'),repository,project,task:initial,tags:support.tags,releases:support.releases,readOnly:!canEdit,canManage,onChange:()=>form.dispatchEvent(new Event('change'))});
      if(task&&repository.capabilities?.taskLinks!==false)links=mountTaskLinks(form.querySelector('[data-task-links]'),{repository,project,task,tasks,readOnly:!canEdit,actionsRoot:form.querySelector('[data-relations-actions]'),countRoot:form.querySelector('[data-relations-count]'),onOpenTask:async id=>{
        if(onOpenTask){await onOpenTask(id);return;}
        const target=await repository.read('tasks',id,project.id);if(!target)throw Error('Задача недоступна.');
        await openTaskDialog(target,{repository,project,tasks,canEdit,canManage,attachmentAdapter,onSaved});
      }});
      if(task)threads=mountThreads(form.querySelector('[data-task-threads]'),{repository,task,readOnly:!canDiscuss,people:new Map(members.map(m=>[m.id,m])),actorId:repository.context?.actorId||'local-user'});
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
        if(event.target.getAttribute('name')==='parent')links?.setParent(event.target.value);
        if(event.target.getAttribute('name')==='priority')priorityTouched=true;
        if(event.target.getAttribute('name')!=='type'||current)return;
        const untouched=editor.value===lastTemplateContent;
        if(untouched)applyTemplate(true);
      });
      // "Шаблон" lives inside the editor: a toolbar action while editing, and a quiet link in an empty preview.
      if(canEdit)editor.toolbarActions=[{id:'template',label:'Шаблон',icon:'file'}];
      editor.addEventListener('iq-editor-action',event=>{
        if(event.detail.id!=='template'||!canEdit)return;
        const untouched=!editor.value.trim()||editor.value===lastTemplateContent;
        const apply=id=>{if(id==='project')applyTemplate();else{editor.value=STARTER_TASK_TEMPLATES.find(t=>t.id===id).description;description.refresh();}form.dispatchEvent(new Event('change'));};
        dialog({title:'Начать с шаблона',description:untouched?'Шаблон заполнит описание. Остальные поля не изменятся.':'Шаблон заменит текущее описание. Остальные поля не изменятся.',
          body:select('starter','Шаблон','project',[['project','Шаблон типа из настроек проекта'],...STARTER_TASK_TEMPLATES.map(t=>[t.id,t.name])]),
          submitLabel:untouched?'Применить':'Заменить описание',onSubmit:async values=>{apply(values.get('starter'));}});
      });
      let discarded=false;
      const dirty=()=>!discarded&&(canEdit&&(JSON.stringify(read(form))!==baseline||files.dirty())||!!threads?.dirty());
      const saveState=form.querySelector('[data-task-save-state]');
      let timer=0,inflight=null,again=false,conflict=false;
      function showState(text,{error=false,action=''}={}){
        saveState.dataset.tone=error?'danger':'muted';
        saveState.innerHTML=esc(text)+(action?` <button type="button" class="iq-btn ghost sm" data-save-action="${action}">${action==='reload'?'Загрузить актуальную версию':'Повторить'}</button>`:'');
      }
      function schedule(delay=700){if(!autosave||conflict)return;clearTimeout(timer);timer=setTimeout(()=>void flush(),delay);}
      /** Saves the latest field values once; a change made during a save is saved right after it. */
      async function flush(){
        clearTimeout(timer);timer=0;
        if(!autosave||conflict)return !conflict;
        if(inflight){again=true;await inflight;return flush();}
        const changes=read(form),snapshot=JSON.stringify(changes);
        if(snapshot===baseline)return true;
        if(!changes.title){showState('Нужно название — изменения пока не сохранены.',{error:true});return false;}
        if(files.isBusy()||files.dirty()){showState('Изменения сохранятся после загрузки файлов.');return false;}
        saving=true;showState('Сохраняется…');
        inflight=(async()=>{
          try{
            const next=reparentTask({...current,...changes},changes.parentId,tasks);
            const saved=await repository.write('tasks',next,current.revision);
            current=saved;files.accepted(saved);baseline=snapshot;
            showState(threads?.dirty()?'Задача сохранена. Черновик сообщения ещё не опубликован.':'Все изменения сохранены');
            await onSaved(saved);return true;
          }catch(error){
            conflict=error.code==='CONFLICT';
            showState(conflict?'Задачу изменили в другом месте. Ваши последние правки не сохранены.':'Не удалось сохранить: '+(error.message||'ошибка сети'),{error:true,action:conflict?'reload':'retry'});
            return false;
          }finally{saving=false;}
        })();
        const ok=await inflight;inflight=null;
        if(again){again=false;return flush();}
        return ok;
      }
      if(autosave){
        // The footer becomes the save status; the header close button stays the single way out.
        const footer=form.querySelector('.iq-dialog-footer');footer.querySelector('[data-close]').hidden=true;footer.prepend(saveState);showState('Изменения сохраняются автоматически');
        const own=event=>!event.target.closest('[data-task-threads],[data-task-links]');
        for(const type of ['input','change','iq-change','task-files-change'])form.addEventListener(type,event=>{if(own(event))schedule(type==='input'?900:300);});
        saveState.addEventListener('click',event=>{
          const action=event.target.closest('[data-save-action]')?.dataset.saveAction;
          if(action==='retry')void flush();
          if(action==='reload'){discarded=true;if(onReload)void onReload();else el.close();}
        });
      }
      // keepOpen: only settle (flush or confirm) and leave the drawer open, so the next task can replace it in one frame.
      async function close({keepOpen=false}={}){
        if(confirming||threads?.isBusy())return false;
        if(autosave&&!discarded)await flush();
        else if(saving)return false;
        if(!dirty()){if(!keepOpen)el.close();return true;}
        confirming=true;
        const confirm=dialog({
          title:'Закрыть без сохранения?',
          description:autosave?'Последние правки не удалось сохранить, а неопубликованные сообщения будут потеряны. Уже сохранённое останется.':'Изменения задачи и неопубликованные сообщения будут потеряны. Уже опубликованные сообщения сохранятся.',
          submitLabel:'Не сохранять',onSubmit:async()=>{discarded=true;if(!keepOpen)el.close();}
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
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopPropagation();if(autosave)void flush();else form.requestSubmit();}
      });
      const unload=event=>{
        if(dirty()||saving||threads?.isBusy()){event.preventDefault();event.returnValue='';}
      };
      window.addEventListener('beforeunload',unload);
      el.addEventListener('iq-close',()=>{
        clearTimeout(timer);window.removeEventListener('beforeunload',unload);description.destroy();files.destroy();catalogs.destroy();threads?.destroy();links?.destroy();
      },{once:true});
      baseline=JSON.stringify(read(form));
      // A new task starts at its title.
      if(!task&&canEdit)requestAnimationFrame(()=>requestAnimationFrame(()=>form.querySelector('[name=title]')?.focus({preventScroll:true})));
      if(!canEdit)form.querySelectorAll('input,textarea.iq-inline-title,iq-select,iq-combobox,iq-date-field,iq-markdown-editor').forEach(node=>{if(!canDiscuss||!node.closest('[data-task-threads]'))node.setAttribute('disabled','');});
    }
  });
  return el;
}
