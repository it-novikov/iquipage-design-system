import {mountTaskFiles} from './task-files-view.js';
import {uid} from '../common.js';
import {mountTaskLinks} from './link-view.js';
import {dialog,select,icon,esc} from '../ui.js';
import {TASK_COLUMNS,taskColumn,createTask} from '../tasks.js';
import {TASK_KINDS,reparentTask} from './model.js';
import {taskMarkdown,markdownTaskChanges} from './task-content.js';
import {mountThreads} from './thread-view.js';
import {loadTaskSupport,mountTaskCatalogs,releaseMeta} from './catalog-picker.js';
import {catalogLabel,tagMarkup} from './catalog-ui.js';
import {mountPlanField} from './plan-field.js';
import {today as todayValue,onlyPlanChanged} from './plan-range.js';
import {starterTaskSettings,instantiateTaskTemplate,withoutUntouchedTemplate,STARTER_TASK_TEMPLATES} from './task-templates.js';
import {mountTaskDescription} from './description-view.js';
import {copyAtButton,motionReduced,ui,notify,formatDate} from '@iquipage/web/core';
import {taskKey,taskURL} from './task-route.js';
import {avatarName,ownerOptions,ownerWarning} from './assignees.js';
import {mountAgentRuns} from './agent-runs-view.js';

export async function openTaskDialog(task,{repository,project,tasks,canEdit=true,canManage=true,attachmentAdapter=null,status='ready',initialValues={},fullscreen=false,backTo=null,onBack=()=>{},onOpenTask,onReload=onOpenTask&&(()=>onOpenTask(task.id)),onSaved=()=>{},isActive=()=>true,signal,replace=null,supplement=null}){
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
  let current=task,baseline='',saving=false,confirming=false,priorityTouched=false,catalogs,threads,links,plan,pendingPlan=null,personal=null,agents=null;
  // Owners are the people of the project and, in a group of their own, the service accounts that may take tasks
  // (SPR-7). A former member, an account that can no longer act or pre-membership text stays visible until reassigned.
  const owners=ownerOptions(members,initial,{image:m=>repository.client?.avatarUrl?.(m.id,m.avatarRevision)||undefined});
  const warning=ownerWarning(initial);
  const legacyOwner=!initial.ownerId&&initial.legacyOwner?`<p class="iq-helper" data-legacy-owner>Было указано: «${esc(initial.legacyOwner)}». Выберите участника проекта.</p>`
    :warning?`<p class="iq-helper" data-owner-warning>${esc(warning)}</p>`:'';
  // The exact template text in the editor (SPR-12). A description the caller passed in is the person's, not a template.
  let templateVersion=initial.templateVersion,lastTemplateContent=(task||initialValues.description===undefined)?taskMarkdown(initial):null;
  const parents=[{value:'',label:'Нет'},...tasks.filter(item=>{
    if(item.archivedAt||item.projectId!==project.id)return false;
    try{reparentTask({...initial,id:taskId,projectId:project.id},item.id,tasks);return true;}catch{return false;}
  }).map(item=>({value:item.id,label:`${item.displayId||item.id.slice(-7).toUpperCase()} ${item.title}`,description:`${TASK_KINDS[item.type]||'Задача'}, ${TASK_COLUMNS.find(c=>c.id===taskColumn(item))?.label||item.status}`}))];
  // Core facts form one grid of facts (handoff docs/task-drawer/fields-handoff.md): the hero row answers
  // "where is it, who does it, by when"; below it priority, type, release, plan, parent and tags. Every fact
  // is always on its place, an empty one reads quietly, and each value opens its editor in one click.
  const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';
  // People carry an avatar; a service account carries its glyph, the group heading neither.
  const ownerChoices=owners.map(({image,...o})=>o.value&&!o.icon&&!o.disabled?{...o,avatar:{text:initials(o.label),tone:ui.avatarTone(o.value),...(image?{image}:{})}}:o);
  const statusTones={in_progress:'info',review:'warning',ready_for_testing:'info',testing:'warning',ready_for_release:'success'};
  const statusOptions=TASK_COLUMNS.map(column=>({value:column.id,label:column.label,icon:column.icon,...(statusTones[column.id]?{tone:statusTones[column.id]}:{})}));
  const priorityOptions=[['critical','Критический','critical','critical'],['high','Высокий','priority','high'],['normal','Обычный','minus',''],['low','Низкий','low','']].map(([value,label,glyph,tone])=>({value,label,icon:glyph,...(tone?{tone}:{})}));
  const kindOptions=Object.entries(TASK_KINDS).map(([value,label])=>({value,label,icon:{task:'checklist',bug:'bug',epic:'stack'}[value]||'checklist'}));
  const opts=list=>esc(JSON.stringify(list));
  const statusValue=task?taskColumn(task):status;
  // The plan is saved by the planning command (preview, then commit), so it needs the host's planning hook.
  const canPlan=canEdit&&typeof repository.applyPlanningChange==='function';
  const editableFacts=()=>`<div class="iq-properties tdr-facts hero" data-columns="3">
        <iq-select name="status" label="Статус" appearance="pill" value="${esc(statusValue)}" options="${opts(statusOptions)}"></iq-select>
        <iq-select name="ownerId" label="Исполнитель" searchable search-placeholder="Найти участника" value="${esc(initial.ownerId||'')}" options="${opts(ownerChoices)}"></iq-select>
        <iq-date-field name="due" label="Срок" placeholder="Без срока" value="${esc(initial.due||'')}"></iq-date-field>
      </div>${legacyOwner}
      <div class="iq-properties tdr-facts" data-columns="3">
        <iq-select name="priority" label="Приоритет" value="${esc(initial.priority||'normal')}" options="${opts(priorityOptions)}"></iq-select>
        <iq-select name="type" label="Тип" value="${esc(initial.type||'task')}" options="${opts(kindOptions)}"></iq-select>
        <div class="tdr-fact" data-task-catalogs></div>
        <div class="tdr-fact" data-task-plan></div>
        <iq-select class="tdr-span-2" name="parent" label="Родитель" searchable search-placeholder="Найти задачу" value="${esc(initial.parentId||'')}" options="${opts(parents)}"></iq-select>
        <div class="tdr-fact tdr-span-all" data-task-tags><span class="tdr-fact-label" aria-hidden="true">Теги</span></div>
      </div>`;
  // Read-only facts are the same tiles as plain text: no disabled controls (DS principle 12).
  const staticFact=(label,value,{empty=false,span=''}={})=>`<div class="tdr-fact${span?' '+span:''}"><dt class="tdr-fact-label">${esc(label)}</dt><dd class="tdr-static" data-empty="${empty}">${value}</dd></div>`;
  const staticFacts=()=>{
    const column=TASK_COLUMNS.find(c=>c.id===statusValue),owner=owners.find(o=>o.value===(initial.ownerId||''));
    const priority=priorityOptions.find(o=>o.value===(initial.priority||'normal'))||priorityOptions[2],kind=kindOptions.find(o=>o.value===(initial.type||'task'))||kindOptions[0];
    const release=support.releases.find(item=>item.id===initial.releaseId),parent=tasks.find(item=>item.id===initial.parentId);
    const chosenTags=support.tags.filter(tag=>(initial.tagIds||[]).includes(tag.id));
    const accepted=task?.result==='accepted';
    // "в релизе 2.4" for a release named "Релиз 2.4", "в релизе «Осень»" otherwise.
    const where=release?(/^релиз\s+/i.test(release.name)?` в релизе ${esc(release.name.replace(/^релиз\s+/i,''))}`:` в релизе «${esc(release.name)}»`):'';
    const reason=accepted?`Только чтение: результат принят${where}. Обсуждение открыто.`:'Только чтение: в этом проекте у вас доступ на просмотр.';
    const dueTone=!initial.due||accepted||statusValue==='ready_for_release'?'':initial.due<todayValue()?'danger':'';
    return `<p class="tdr-lock">${icon('lock',14)}<span>${reason}</span></p>
      <dl class="tdr-facts hero">
        ${staticFact('Статус',`<span class="tdr-pill" data-tone="${esc(statusTones[statusValue]||'')}"><span class="tdr-dot" aria-hidden="true"></span>${esc(column?.label||statusValue)}</span>`)}
        ${staticFact('Исполнитель',!owner?.value&&initial.legacyOwner?`<span class="tdr-text">${esc(initial.legacyOwner)}</span>`:owner?.value?`${ui.personAvatar({id:owner.value,name:avatarName(owner.label),image:owners.find(o=>o.value===owner.value)?.image},{size:'xs'})}<span class="tdr-text">${esc(owner.label)}</span>`:'Не назначен',{empty:!owner?.value})}
        ${staticFact('Срок',initial.due?`<span class="tdr-text" ${dueTone?`data-tone="${dueTone}"`:''}>${esc(formatDate(initial.due))}</span>`:'Без срока',{empty:!initial.due})}
      </dl>
      <dl class="tdr-facts">
        ${staticFact('Приоритет',`<span class="tdr-glyph" data-tone="${esc(priority.tone||'')}">${icon(priority.icon,16)}<span class="tdr-text">${esc(priority.label)}</span></span>`)}
        ${staticFact('Тип',`${icon(kind.icon,16)}<span class="tdr-text">${esc(kind.label)}</span>`)}
        ${staticFact('Релиз',release?`<span class="tdr-text">${esc(catalogLabel(release))}</span>${releaseMeta(release)?`<span class="tdr-meta">${esc(releaseMeta(release))}</span>`:''}`:'Без релиза',{empty:!release})}
        <div class="tdr-fact" data-task-plan></div>
        ${staticFact('Родитель',parent?`<span class="tdr-text"><span class="tdr-key">${esc(taskKey(parent))}</span> ${esc(parent.title)}</span>`:'Нет',{empty:!parent,span:'tdr-span-2'})}
        ${staticFact('Теги',chosenTags.length?`<span class="tdr-tags">${chosenTags.map(tagMarkup).join('')}</span>`:'Нет тегов',{empty:!chosenTags.length,span:'tdr-span-all'})}
      </dl>`;
  };
  const content=`<section class="task-editor-cover" data-task-cover hidden></section><div class="task-editor-layout">
    <div class="task-editor-title"><label class="sr-only" for="${taskId}-title">Название</label><textarea class="iq-inline-title" id="${taskId}-title" name="title" rows="1" required maxlength="240" placeholder="Что нужно сделать?">${esc(initial.title)}</textarea></div>
    ${task&&supplement?'<section class="task-personal-section" data-task-personal aria-label="Запросы к вам" hidden></section>':''}
    <section class="task-editor-properties" aria-label="Свойства задачи">
      ${canEdit?editableFacts():staticFacts()}
    </section>
    <section class="iq-section task-editor-description"><div class="iq-section-head">${icon('text',16)}<h3>Описание</h3></div>
      <div class="task-description-surface" data-description>
        <iq-markdown-editor label="Описание" name="description" variant="compact" density="compact" maxlength="10000" preview-on-blur preview empty-text="${canEdit?'Нажмите, чтобы добавить описание':'Описания нет'}" ${canEdit?'empty-action-label="Начать с шаблона" empty-action="template"':''}></iq-markdown-editor>
      </div></section>
    <div class="task-editor-supplements">
    <section class="iq-section task-relations"><div class="iq-section-head">${icon('link',16)}<h3>Связи</h3><span class="iq-section-count" data-relations-count></span><span class="iq-section-actions" data-relations-actions></span></div>
      ${task?'<div data-task-links></div>':'<p class="iq-helper">Подзадачи и связи с другими задачами можно добавить после создания.</p>'}</section>
    <section class="iq-section task-files-section" data-task-files></section>
    <section class="task-agent-section" data-task-agents aria-label="Агенты" hidden></section>
    <section class="iq-section task-threads-section" data-task-threads></section></div></div><p role="status" class="iq-helper" data-task-save-state></p>`;
  const read=(form,values=new FormData(form))=>({
    title:String(values.get('title')||'').trim(),type:values.get('type')||'task',status:values.get('status'),
    ownerId:form.querySelector('iq-select[name=ownerId]').value||null,priority:values.get('priority')||'normal',
    ...markdownTaskChanges(initial,form.querySelector('iq-markdown-editor[name=description]').value),
    due:form.querySelector('iq-date-field[name=due]').value||null,
    parentId:form.querySelector('iq-select[name=parent]').value||null,
    ...catalogs.value(),...files.value(),templateVersion
  });
  const scheduleIntent=value=>({kind:'schedule',entityKind:'task',entityId:taskId,values:{start:value.start,end:value.end}});
  const el=dialog({title:task?taskKey(task):'Новая задача',body:content,wide:true,replace,submitLabel:canEdit&&!task?'Создать задачу':'',
    onSubmit:canEdit&&!task?async(values,form)=>{
      files.assertReady();
      if(threads?.isBusy())throw Error('Дождитесь публикации обсуждения.');saving=true;files.setLocked(true);
      try{
        const changes=read(form,values);
        // Untouched template text is guidance, not a description: the new task is saved without it (SPR-12).
        // Keyed on the dialog, not on `current`: a retry after a saved-but-failed first submit strips it too; the
        // template's legacy checklist copy goes with it.
        if(!task){const kept=withoutUntouchedTemplate(changes.description,lastTemplateContent);if(kept!==changes.description){changes.description=kept;delete changes.legacyChecklists;}}
        const value=current?{...current,...changes}:{...createTask({projectId:project.id,...changes}),...changes,id:taskId};
        const next=reparentTask(value,changes.parentId,tasks);
        let saved=await repository.write('tasks',next,current?.revision||0);
        current=saved;files.accepted(saved);baseline=JSON.stringify(read(form,values));
        // A plan chosen before the task existed is scheduled right after it: the planning command needs the task.
        if(pendingPlan){
          try{await repository.applyPlanningChange(scheduleIntent(pendingPlan));pendingPlan=null;saved=await repository.read('tasks',taskId,project.id).catch(()=>null)||saved;current=saved;}
          catch(error){notify({tone:'danger',message:'Задача создана, но план не сохранён: '+(error.message||'ошибка сети')});}
        }
        await onSaved(saved);
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
      const dueField=form.querySelector('iq-date-field[name=due]'),localDay=offset=>todayValue(new Date(Date.now()+offset*86400000));
      // Overdue is red, due today or tomorrow is amber; finished work carries no alarm.
      const dueTone=()=>{if(!dueField)return;const value=dueField.value,done=form.querySelector('iq-select[name=status]')?.value==='ready_for_release';dueField.dataset.tone=!value||done?'':value<localDay(0)?'danger':value<=localDay(1)?'warning':'';};
      form.addEventListener('iq-change',dueTone);form.addEventListener('change',dueTone);requestAnimationFrame(dueTone);
      description=mountTaskDescription(form.querySelector('[data-description]'),{value:taskMarkdown(initial),editing:false,readOnly:!canEdit});
      catalogs=canEdit?mountTaskCatalogs(form.querySelector('[data-task-catalogs]'),{tagsRoot:form.querySelector('[data-task-tags]'),repository,project,task:initial,tags:support.tags,releases:support.releases,canManage,onChange:()=>form.dispatchEvent(new Event('change'))})
        :{value:()=>({releaseId:initial.releaseId||null,tagIds:[...(initial.tagIds||[])]}),destroy(){}};
      plan=mountPlanField(form.querySelector('[data-task-plan]'),{start:initial.plannedStart||null,end:initial.plannedEnd||null,readOnly:!canPlan,
        deadline:()=>dueField?(dueField.value||null):(initial.due||null),onApply:value=>applyPlan(value)});
      if(task&&repository.capabilities?.taskLinks!==false)links=mountTaskLinks(form.querySelector('[data-task-links]'),{repository,project,task,tasks,readOnly:!canEdit,actionsRoot:form.querySelector('[data-relations-actions]'),countRoot:form.querySelector('[data-relations-count]'),onOpenTask:async id=>{
        if(onOpenTask){await onOpenTask(id);return;}
        const target=await repository.read('tasks',id,project.id);if(!target)throw Error('Задача недоступна.');
        await openTaskDialog(target,{repository,project,tasks,canEdit,canManage,attachmentAdapter,onSaved});
      }});
      // A host may add its own section (the Workbench: personal relation, requests, waiting) and header actions.
      if(task&&supplement)personal=supplement({root:form.querySelector('[data-task-personal]'),actions:form.querySelector('.task-dialog-actions'),task,dialog:el});
      if(task)threads=mountThreads(form.querySelector('[data-task-threads]'),{repository,task,readOnly:!canDiscuss,people:new Map(members.map(m=>[m.id,m])),actorId:repository.context?.actorId||'local-user'});
      else form.querySelector('[data-task-threads]').hidden=true;
      // Agents of service accounts: a quiet header action and one line above the discussion (docs/decisions/0005-ai-agents.md).
      if(task&&repository.capabilities?.aiAgents)agents=mountAgentRuns(form.querySelector('[data-task-agents]'),{repository,project,task,actions:form.querySelector('.task-dialog-actions')});
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
        // The warning speaks of the owner the task had; another choice answers it.
        if(event.target.getAttribute('name')==='ownerId')form.querySelector('[data-owner-warning]')?.remove();
        if(event.target.getAttribute('name')!=='type'||current)return;
        const untouched=editor.value===lastTemplateContent;
        if(untouched)applyTemplate(true);
      });
      // "Шаблон" lives inside the editor: a toolbar action while editing, and a quiet link in an empty preview.
      if(canEdit)editor.toolbarActions=[{id:'template',label:'Шаблон',icon:'file'}];
      editor.addEventListener('iq-editor-action',event=>{
        if(event.detail.id!=='template'||!canEdit)return;
        const untouched=!editor.value.trim()||editor.value===lastTemplateContent;
        const apply=id=>{if(id==='project')applyTemplate();else{editor.value=STARTER_TASK_TEMPLATES.find(t=>t.id===id).description;description.refresh();lastTemplateContent=editor.value;}form.dispatchEvent(new Event('change'));};
        dialog({title:'Начать с шаблона',description:untouched?'Шаблон заполнит описание. Остальные поля не изменятся.':'Шаблон заменит текущее описание. Остальные поля не изменятся.',
          body:select('starter','Шаблон','project',[['project','Шаблон типа из настроек проекта'],...STARTER_TASK_TEMPLATES.map(t=>[t.id,t.name])]),
          submitLabel:untouched?'Применить':'Заменить описание',onSubmit:async values=>{apply(values.get('starter'));}});
      });
      let discarded=false;
      const dirty=()=>!discarded&&(canEdit&&(JSON.stringify(read(form))!==baseline||files.dirty())||!!threads?.dirty()||!!personal?.dirty?.());
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
        if(inflight){again=true;await inflight.catch(()=>{});return flush();}
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
            await onSaved(saved);personal?.saved?.(saved);return true;
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
      /** Saves the plan through the planning command. Field autosave waits for it, and it waits for field
       *  autosave, so every write carries the latest task revision (the command changes the task's revision). */
      async function applyPlan(value){
        if(!task){pendingPlan=value.start?value:null;return;}
        if(conflict)throw Error('Задачу изменили в другом месте. Загрузите актуальную версию.');
        if(!await flush())throw Error('Сначала сохраните остальные изменения задачи.');
        while(inflight)await inflight;
        let failure=null;
        const work=(async()=>{
          try{await repository.applyPlanningChange(scheduleIntent(value));}catch(error){failure=error;}
          // The command may have been applied even when the call failed (a lost answer checked by its receipt),
          // so the saved task is read in any case: its revision and plan are the truth from here on.
          let fresh=null;
          try{fresh=await repository.read('tasks',taskId,project.id);}catch{}
          if(!fresh){
            if(failure)return;
            conflict=true;plan.set(value);
            showState('План сохранён, но задачу не удалось обновить. Загрузите актуальную версию, чтобы продолжить правки.',{error:true,action:'reload'});
            return;
          }
          plan.set({start:fresh.plannedStart,end:fresh.plannedEnd});
          const applied=(fresh.plannedStart||null)===(value.start||null)&&(fresh.plannedEnd||null)===(value.end||null);
          if(applied)failure=null;
          // The planning command does not check the task's revision: a newer edit made elsewhere must not be
          // overwritten by this form's next save, so anything besides the plan that changed is a conflict.
          if(!onlyPlanChanged(current,fresh)){
            conflict=true;clearTimeout(timer);
            showState('Задачу изменили в другом месте. Ваши последние правки не сохранены.',{error:true,action:'reload'});
            return;
          }
          current=fresh;files.accepted(fresh);
          if(!failure){showState('Все изменения сохранены');await onSaved(fresh);}
        })();
        // Field autosave waits on this promise and must never inherit its failure.
        inflight=work.then(()=>true,()=>false);
        const settled=inflight;
        try{await work;}finally{if(inflight===settled)inflight=null;}
        if(failure)throw failure;
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
        clearTimeout(timer);window.removeEventListener('beforeunload',unload);description.destroy();files.destroy();catalogs.destroy();plan.destroy();threads?.destroy();agents?.destroy();links?.destroy();personal?.destroy?.();
      },{once:true});
      // Read-only facts are text, not controls: there is nothing to compare.
      baseline=canEdit?JSON.stringify(read(form)):'';
      // A new task starts at its title.
      if(!task&&canEdit)requestAnimationFrame(()=>requestAnimationFrame(()=>form.querySelector('[name=title]')?.focus({preventScroll:true})));
      if(!canEdit)form.querySelectorAll('input,textarea.iq-inline-title,iq-select,iq-combobox,iq-date-field,iq-markdown-editor').forEach(node=>{if(!canDiscuss||!node.closest('[data-task-threads]'))node.setAttribute('disabled','');});
    }
  });
  return el;
}
