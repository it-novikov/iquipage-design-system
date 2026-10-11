import {mountTaskMaterials} from './task-materials.js';
import {mountTaskFiles} from './task-files-view.js';
import {uid} from '../common.js';
import {mountTaskLinks,mountDraftLinks} from './link-view.js';
import {createTaskOnce,linksFailedText} from './task-create.js';
import {dialog,select,icon,esc} from '../ui.js';
import {TASK_COLUMNS,taskColumn,createTask} from '../tasks.js';
import {TASK_KINDS,reparentTask} from './model.js';
import {taskMarkdown,markdownTaskChanges} from './task-content.js';
import {mountThreads} from './thread-view.js';
import {loadTaskSupport,mountTaskCatalogs} from './catalog-picker.js';
import {catalogLabel,tagMarkup} from './catalog-ui.js';
import {mountPlanField} from './plan-field.js';
import {today as todayValue,onlyPlanChanged} from './plan-range.js';
import {starterTaskSettings,instantiateTaskTemplate,withoutUntouchedTemplate,canApplyTypeTemplate,STARTER_TASK_TEMPLATES} from './task-templates.js';
import {mountTaskDescription} from './description-view.js';
import {copyAtButton,motionReduced,ui,notify,formatDate} from '@iquipage/web/core';
import {taskKey,taskURL,parseTaskSection} from './task-route.js';
import {avatarName,ownerOptions,ownerWarning} from './assignees.js';
import {mountAgentRuns} from './agent-runs-view.js';
import {mountTaskWork} from './task-work-view.js';
import {formatEstimate,estimateEditor,estimateMismatch} from '../estimate.js';

export async function openTaskDialog(task,{repository,project,tasks,canEdit=true,canManage=true,attachmentAdapter=null,status='ready',initialValues={},fullscreen=false,backTo=null,onBack=()=>{},onOpenTask,onReload=onOpenTask&&(()=>onOpenTask(task.id)),onSaved=()=>{},isActive=()=>true,signal,replace=null,supplement=null}){
  signal?.throwIfAborted();const initialTask=task;
  // What the open drawer reads next starts now, alongside the task, rather than after it renders.
  if(task?.id)repository.warmTask?.(project.id,task.id);
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
  let current=task,baseline='',saving=false,confirming=false,priorityTouched=false,catalogs,threads,links,materials,plan,pendingPlan=null,personal=null,agents=null;
  // Owners are the people of the project and, in a group of their own, the service accounts that may take tasks
  // (SPR-7). A former member, an account that can no longer act or pre-membership text stays visible until reassigned.
  const owners=ownerOptions(members,initial,{image:m=>repository.client?.avatarUrl?.(m.id,m.avatarRevision)||undefined});
  const warning=ownerWarning(initial);
  const legacyOwner=!initial.ownerId&&initial.legacyOwner?`<p class="iq-helper" data-legacy-owner>Было указано: «${esc(initial.legacyOwner)}». Выберите участника проекта.</p>`
    :warning?`<p class="iq-helper" data-owner-warning>${esc(warning)}</p>`:'';
  // The exact template text in the editor (SPR-12). A description the caller passed in is the person's, not a template.
  let templateVersion=initial.templateVersion,lastTemplateContent=task?taskMarkdown(instantiateTaskTemplate(settings,initial.type||'task')):initialValues.description===undefined?taskMarkdown(initial):null;
  const parents=[{value:'',label:'Нет'},...tasks.filter(item=>{
    if(item.archivedAt||item.projectId!==project.id)return false;
    try{reparentTask({...initial,id:taskId,projectId:project.id},item.id,tasks);return true;}catch{return false;}
  }).map(item=>({value:item.id,key:item.displayId||item.id.slice(-7).toUpperCase(),label:item.title,description:`${TASK_KINDS[item.type]||'Задача'}, ${TASK_COLUMNS.find(c=>c.id===taskColumn(item))?.label||item.status}`}))];
  // Core facts are one calm list (docs/task-drawer/fields-handoff.md §8, direction A «Список»): ten 36px rows, the
  // label on the left; "where, who, by when" first, then priority, type, release, plan, parent, tags and the author.
  // Every fact is always on its place, an empty one reads quietly, and each value opens its editor in one click
  // (DS .iq-properties[data-label=wide]). Glyphs, dates of releases and plan durations live in the open editors.
  const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';
  // People carry an avatar; a service account its square bot avatar, its role spoken rather than written beside the
  // name (a state such as «приостановлен» stays in the words); the group heading neither.
  const serviceName=label=>String(label||'').replace(/ \(сервисный аккаунт\)$/,'');
  const ownerChoices=owners.map(({image,...o})=>!o.value||o.disabled?o
    :o.icon?{...o,icon:'bot',label:serviceName(o.label),avatar:{kind:'bot',label:'сервисный аккаунт'}}
    :{...o,avatar:{text:initials(o.label),tone:ui.avatarTone(o.value),...(image?{image}:{})}});
  const statusTones={in_progress:'info',review:'warning',ready_for_testing:'info',testing:'warning',ready_for_release:'success'};
  const statusOptions=TASK_COLUMNS.map(column=>({value:column.id,label:column.label,icon:column.icon,...(statusTones[column.id]?{tone:statusTones[column.id]}:{})}));
  const priorityOptions=[['critical','Критический','critical','critical'],['high','Высокий','priority','high'],['normal','Обычный','minus',''],['low','Низкий','low','']].map(([value,label,glyph,tone])=>({value,label,icon:glyph,...(tone?{tone}:{})}));
  const kindOptions=Object.entries(TASK_KINDS).map(([value,label])=>({value,label,icon:{task:'checklist',bug:'bug',epic:'stack'}[value]||'checklist'}));
  const opts=list=>esc(JSON.stringify(list));
  const statusValue=task?taskColumn(task):status;
  // The due date's signal (owner's decision 2026-10-01): overdue in the critical tone with «просрочен», today and
  // tomorrow in the high tone with the word; finished work («Готово к релизу», an accepted result) carries none.
  // An editable date gets it from the DS field (`deadline`); the read-only row says the same.
  const finished=column=>column==='ready_for_release'||task?.result==='accepted';
  const dueSignal=due=>{
    if(!due||finished(statusValue))return null;
    const now=todayValue(),next=new Date();next.setDate(next.getDate()+1);
    return due<now?{word:'просрочен',tone:'critical'}:due===now?{word:'сегодня',tone:'high'}:due===todayValue(next)?{word:'завтра',tone:'high'}:null;
  };
  // A static row: a term and its value, the same text as a trigger's value without a hover.
  const row=(label,value,{empty=false,tone='',wrapper='div'}={})=>`<${wrapper} class="iq-property"><dt class="iq-property-label">${esc(label)}</dt><dd class="iq-property-value"${empty?' data-empty="true"':''}${tone?` data-tone="${tone}"`:''}>${value}</dd></${wrapper}>`;
  // The author: who created the task and when (the server reads it from the task's creation record).
  const author=(()=>{
    if(!task)return {html:'после создания',empty:true};
    const when=task.createdAt?`<span class="iq-property-meta">· ${esc(formatDate(task.createdAt))}</span>`:'';
    if(!task.createdById)return {html:`<span class="iq-property-text">Неизвестен</span>${when}`,empty:true};
    const service=task.createdByKind==='service',member=members.find(m=>m.id===task.createdById);
    const image=member?repository.client?.avatarUrl?.(member.id,member.avatarRevision)||undefined:undefined;
    return {html:`${ui.personAvatar({id:task.createdById,name:task.createdByName||'?',image,kind:service?'service':'human'},{size:'xs'})}<span class="iq-property-text">${esc(task.createdByName||'')}</span>${service?'<span class="sr-only">, сервисный аккаунт</span>':''}${when}`};
  })();
  // The plan is saved by the planning command (preview, then commit), so it needs the host's planning hook.
  const canPlan=canEdit&&typeof repository.applyPlanningChange==='function';
  // The estimate (planning R4.1): a number with its unit, edited in place and saved with the other fields.
  let estimate=initial.estimate||null,estimateSettings=null;
  // One entry per row, in reading order, in both the editable and the read-only list: a new fact (such as the
  // estimate, right after «Приоритет») is one more entry in each.
  const editableFacts=()=>`<div class="iq-properties" data-label="wide">${[
    `<iq-select name="status" label="Статус" appearance="pill" value="${esc(statusValue)}" options="${opts(statusOptions)}"></iq-select>`,
    `<iq-select name="ownerId" label="Исполнитель" searchable search-placeholder="Найти участника" value="${esc(initial.ownerId||'')}" options="${opts(ownerChoices)}"></iq-select>`,
    `<iq-date-field name="due" label="Срок" placeholder="Без срока" ${finished(statusValue)?'':'deadline'} value="${esc(initial.due||'')}"></iq-date-field>`,
    `<iq-select name="priority" label="Приоритет" trigger-icon="none" value="${esc(initial.priority||'normal')}" options="${opts(priorityOptions)}"></iq-select>`,
    '<div data-task-estimate></div>',
    `<iq-select name="type" label="Тип" trigger-icon="none" value="${esc(initial.type||'task')}" options="${opts(kindOptions)}"></iq-select>`,
    '<div class="task-property-slot" data-task-catalogs></div>',
    '<div data-task-plan></div>',
    `<iq-select name="parent" label="Родитель" searchable search-placeholder="Найти задачу" value="${esc(initial.parentId||'')}" options="${opts(parents)}"></iq-select>`,
    '<div class="task-property-slot" data-task-tags></div>',
    row('Автор',author.html,{empty:author.empty,wrapper:'dl'})
  ].join('')}</div>${legacyOwner}`;
  // Read-only facts are the same rows as plain text: no disabled controls (DS principle 12), one lock line says why.
  const staticFacts=()=>{
    const column=TASK_COLUMNS.find(c=>c.id===statusValue),owner=owners.find(o=>o.value===(initial.ownerId||''));
    const priority=priorityOptions.find(o=>o.value===(initial.priority||'normal'))||priorityOptions[2],kind=kindOptions.find(o=>o.value===(initial.type||'task'))||kindOptions[0];
    const release=support.releases.find(item=>item.id===initial.releaseId),parent=tasks.find(item=>item.id===initial.parentId);
    const chosenTags=support.tags.filter(tag=>(initial.tagIds||[]).includes(tag.id));
    const accepted=task?.result==='accepted';
    // "в релизе 2.4" for a release named "Релиз 2.4", "в релизе «Осень»" otherwise.
    const where=release?(/^релиз\s+/i.test(release.name)?` в релизе ${esc(release.name.replace(/^релиз\s+/i,''))}`:` в релизе «${esc(release.name)}»`):'';
    const reason=accepted?`Только чтение: результат принят${where}. Обсуждение открыто.`:'Только чтение: в этом проекте у вас доступ на просмотр.';
    const service=!!owner?.icon,signal=dueSignal(initial.due);
    const ownerValue=!owner?.value&&initial.legacyOwner?`<span class="iq-property-text">${esc(initial.legacyOwner)}</span>`
      :owner?.value?`${ui.personAvatar({id:owner.value,name:avatarName(owner.label),image:owner.image,kind:service?'service':'human'},{size:'xs'})}<span class="iq-property-text">${esc(service?serviceName(owner.label):owner.label)}</span>${service?'<span class="sr-only">, сервисный аккаунт</span>':''}`:'Не назначен';
    return `<p class="tdr-lock">${icon('lock',14)}<span>${reason}</span></p>
      <dl class="iq-properties" data-label="wide">${[
        row('Статус',`<span class="tdr-pill" data-tone="${esc(statusTones[statusValue]||'')}"><span class="tdr-dot" aria-hidden="true"></span>${esc(column?.label||statusValue)}</span>`),
        row('Исполнитель',ownerValue,{empty:!owner?.value&&!initial.legacyOwner}),
        row('Срок',initial.due?`<span class="iq-property-text">${esc(formatDate(initial.due)+(signal?' · '+signal.word:''))}</span>`:'Без срока',{empty:!initial.due,tone:signal?.tone}),
        row('Приоритет',esc(priority.label),{tone:priority.tone}),
        row('Оценка',initial.estimate?`<span class="iq-property-text">${esc(formatEstimate(initial.estimate))}</span>`:'Без оценки',{empty:!initial.estimate}),
        row('Тип',esc(kind.label)),
        row('Релиз',release?`<span class="iq-property-text">${esc(catalogLabel(release))}</span>`:'Без релиза',{empty:!release}),
        '<div data-task-plan></div>',
        row('Родитель',parent?`<span class="iq-property-key">${esc(taskKey(parent))}</span><span class="iq-property-text">${esc(parent.title)}</span>`:'Нет',{empty:!parent}),
        row('Теги',chosenTags.length?chosenTags.map(tagMarkup).join(''):'Нет тегов',{empty:!chosenTags.length}),
        row('Автор',author.html,{empty:author.empty})
      ].join('')}</dl>`;
  };
  const workTabs=!!(task&&repository.capabilities?.agentWork);
  const titleContent=`<div class="task-editor-title"><label class="sr-only" for="${taskId}-title">Название</label><textarea class="iq-inline-title" id="${taskId}-title" name="title" rows="1" required maxlength="240" placeholder="Что нужно сделать?">${esc(initial.title)}</textarea></div>`;
  const content=`<section class="task-editor-cover" data-task-cover hidden></section>${workTabs?`${titleContent}<iq-tabs label="Разделы задачи" value="${parseTaskSection(location.hash)}" data-task-tabs><div class="iq-tabs-list" data-tablist><button type="button" data-tab="task">Задача</button><button type="button" data-tab="work">Работа агента</button></div><section class="iq-tab-panel" data-panel="task"><div class="task-editor-layout"><section class="task-editor-title iq-work-story iq-work-question" data-task-work-summary hidden></section>`:`<div class="task-editor-layout">${titleContent}`}
    ${task&&supplement?'<section class="task-personal-section" data-task-personal aria-label="Запросы к вам" hidden></section>':''}
    <section class="task-editor-properties" aria-label="Свойства задачи">
      ${canEdit?editableFacts():staticFacts()}
    </section>
    <section class="iq-section task-editor-description"><div class="iq-section-head"><h3>Описание</h3></div>
      <div class="task-description-surface" data-description>
        <iq-markdown-editor label="Описание" name="description" variant="compact" density="compact" maxlength="10000" preview-on-blur preview empty-text="${canEdit?'Нажмите, чтобы добавить описание':'Описания нет'}" ${canEdit?'empty-action-label="Начать с шаблона" empty-action="template"':''}></iq-markdown-editor><div data-type-template-offer hidden></div>
      </div></section>
    <div class="task-editor-supplements">
    <section class="iq-section task-materials-section" data-task-materials aria-label="Материалы задачи"></section>
    <section class="iq-section task-relations"><div class="iq-section-head">${icon('link',16)}<h3>Связи</h3><span class="iq-section-count" data-relations-count></span><span class="iq-section-actions" data-relations-actions></span></div>
      ${task||canEdit?'<div data-task-links></div>':''}</section>
    <section class="iq-section task-files-section" data-task-files></section>
    ${workTabs?'':'<section class="task-agent-section" data-task-agents aria-label="Агенты" hidden></section>'}
    <section class="iq-section task-threads-section" data-task-threads></section></div></div>${workTabs?'</section><section class="iq-tab-panel" data-panel="work" hidden><div class="iq-work-story-copy"><section data-task-agents aria-label="Работа агента"></section></div></section></iq-tabs>':''}<p role="status" class="iq-helper" data-task-save-state></p>`;
  const read=(form,values=new FormData(form))=>({
    title:String(values.get('title')||'').trim(),type:values.get('type')||'task',status:values.get('status'),
    ownerId:form.querySelector('iq-select[name=ownerId]').value||null,priority:values.get('priority')||'normal',
    ...markdownTaskChanges(initial,form.querySelector('iq-markdown-editor[name=description]').value),
    due:form.querySelector('iq-date-field[name=due]').value||null,
    parentId:form.querySelector('iq-select[name=parent]').value||null,estimate,
    ...catalogs.value(),...files.value(),templateVersion
  });
  /** «Оценка» right after «Приоритет»: a ghost value; the editor opens in place and the change saves with the task. */
  function mountEstimate(form){
    const slot=form.querySelector('[data-task-estimate]');if(!slot)return;
    slot.classList.add('iq-property');
    const id=uid();
    const paint=()=>{
      const other=!!estimateSettings&&estimateMismatch(estimate,estimateSettings.estimateFormat);
      slot.innerHTML=`<span class="iq-property-label" id="${id}-label">Оценка</span><button type="button" class="iq-date-trigger tdr-plan-trigger" aria-haspopup="dialog" aria-labelledby="${id}-label ${id}-value"><span id="${id}-value" data-date-caption${estimate?'':' data-empty="true"'}>${esc(estimate?formatEstimate(estimate)+(other?' · в другом формате':''):'Без оценки')}</span>${icon('down',16)}</button>`;
    };
    paint();
    (repository.viewSettings?repository.viewSettings(project.id):repository.client?.request?.(`/projects/${encodeURIComponent(project.id)}/planning/view/settings`))?.then(value=>{estimateSettings=value;paint();}).catch(()=>{});
    slot.addEventListener('click',event=>{
      const trigger=event.target.closest('button');if(!trigger)return;
      estimateEditor(trigger,{value:estimate,format:estimateSettings?.estimateFormat||'time',hoursPerDay:estimateSettings?.hoursPerDay||8,hoursPerWeek:estimateSettings?.hoursPerWeek||40,
        onSave:value=>{estimate=value;paint();form.dispatchEvent(new Event('change'));slot.querySelector('button')?.focus();}});
    });
  }
  const scheduleIntent=value=>({kind:'schedule',entityKind:'task',entityId:taskId,values:{start:value.start,end:value.end}});
  const el=dialog({title:task?taskKey(task):'Новая задача',body:content,wide:true,replace,submitLabel:canEdit&&!task?'Создать задачу':'',
    onSubmit:canEdit&&!task?async(values,form)=>{
      files.assertReady();
      if(threads?.isBusy())throw Error('Дождитесь публикации обсуждения.');
      if(links?.isBusy?.())throw Error('Дождитесь сохранения связей.');
      if(materials?.isBusy())throw Error('Сначала завершите работу со ссылкой.');
      saving=true;files.setLocked(true);links?.setLocked?.(true);materials?.setLocked(true);
      const saveState=form.querySelector('[data-task-save-state]');
      try{
        const snapshot=JSON.stringify(read(form,values)),changes=read(form,values);
        // Untouched template text is guidance, not a description: the new task is saved without it (SPR-12).
        // Keyed on the dialog, not on `current`: a retry after a saved-but-failed first submit strips it too; the
        // template's legacy checklist copy goes with it.
        if(!task){const kept=withoutUntouchedTemplate(changes.description,lastTemplateContent);if(kept!==changes.description){changes.description=kept;delete changes.legacyChecklists;}}
        const edit=base=>reparentTask({...base,...changes},changes.parentId,tasks);
        // The task is created once, with its staged files (task-create.js); a repeated «Создать» edits it instead.
        let saved=current;
        if(!current){
          const value={...createTask({projectId:project.id,...changes}),...changes,id:taskId};
          saved=await createTaskOnce(repository,reparentTask(value,changes.parentId,tasks),{projectId:project.id,edit});
        }else if(snapshot!==baseline)saved=await repository.write('tasks',edit(current),current.revision);
        if(saved!==current){
          current=saved;files.accepted(saved);baseline=snapshot;
          // A plan chosen before the task existed is scheduled right after it: the planning command needs the task.
          if(pendingPlan){
            try{await repository.applyPlanningChange(scheduleIntent(pendingPlan));pendingPlan=null;saved=await repository.read('tasks',taskId,project.id).catch(()=>null)||saved;current=saved;}
            catch(error){notify({tone:'danger',message:'Задача создана, но план не сохранён: '+(error.message||'ошибка сети')});}
          }
          await onSaved(saved);
        }
        const failedMaterials=materials?.dirty()?await materials.save():0;
        // Links follow the task, each its own repeatable command; a failed one keeps the form open with its reason.
        if(links?.dirty?.()){
          saveState.dataset.tone='muted';
          const failed=await links.save(repository,{taskId,projectId:project.id,onProgress:({done,total})=>{saveState.textContent=`Сохраняются связи: ${Math.min(done+1,total)} из ${total}`;}});
          if(failed){
            saveState.dataset.tone='danger';saveState.textContent=linksFailedText(taskKey(current),failed)+(failedMaterials?' Материалы тоже сохранены не все.':'');
            form.querySelector('.iq-dialog-head h2').textContent=taskKey(current);
            form.querySelector('.iq-dialog-footer button[type=submit]').textContent=failedMaterials?'Повторить сохранение':'Сохранить связи';
            form.querySelector('.iq-dialog-footer [data-close]').textContent='Закрыть';
            return false;
          }
          saveState.textContent='';
        }
        if(failedMaterials){saveState.dataset.tone='danger';saveState.textContent=`Задача ${taskKey(current)} создана. Не все материалы сохранены — причина указана под ссылкой.`;form.querySelector('.iq-dialog-head h2').textContent=taskKey(current);form.querySelector('.iq-dialog-footer button[type=submit]').textContent='Сохранить материалы';form.querySelector('.iq-dialog-footer [data-close]').textContent='Закрыть';return false;}
        if(threads?.dirty()){saveState.textContent='Задача сохранена. Черновик сообщения ещё не опубликован.';return false;}
      }finally{saving=false;files.setLocked(false);links?.setLocked?.(false);materials?.setLocked(false);}
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
        keyButton.addEventListener('click',()=>copyAtButton(keyButton,taskURL(task,form.querySelector('[data-task-tabs]')?.getAttribute('value'))));
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
      const dueField=form.querySelector('iq-date-field[name=due]');
      // Finished work carries no deadline signal: «Готово к релизу» removes it, another status brings it back.
      if(dueField)form.addEventListener('iq-change',event=>{if(event.target.getAttribute?.('name')==='status')dueField.toggleAttribute('deadline',!finished(event.target.value));});
      mountEstimate(form);
      description=mountTaskDescription(form.querySelector('[data-description]'),{value:taskMarkdown(initial),editing:false,readOnly:!canEdit});
      catalogs=canEdit?mountTaskCatalogs(form.querySelector('[data-task-catalogs]'),{tagsRoot:form.querySelector('[data-task-tags]'),repository,project,task:initial,tags:support.tags,releases:support.releases,canManage,onChange:()=>form.dispatchEvent(new Event('change'))})
        :{value:()=>({releaseId:initial.releaseId||null,tagIds:[...(initial.tagIds||[])]}),destroy(){}};
      plan=mountPlanField(form.querySelector('[data-task-plan]'),{start:initial.plannedStart||null,end:initial.plannedEnd||null,readOnly:!canPlan,
        deadline:()=>dueField?(dueField.value||null):(initial.due||null),onApply:value=>applyPlan(value)});
      // «Родитель этой задачи» in the link picker fills the «Родитель» field, as if it were chosen there.
      const parentField=form.querySelector('iq-select[name=parent]');
      const linkParents={parents:parents.map(option=>option.value).filter(Boolean),onParent:parentField?id=>{parentField.value=id;parentField.dispatchEvent(new CustomEvent('iq-change',{bubbles:true,detail:{value:id}}));}:null};
      const relations={actionsRoot:form.querySelector('[data-relations-actions]'),countRoot:form.querySelector('[data-relations-count]')};
      // After a creation whose links did not all save, the footer follows the retries until every link is in.
      const linksChanged=()=>{
        if(!current||!links||materials?.dirty())return;
        const state=form.querySelector('[data-task-save-state]'),left=links.drafts.failed().length;
        state.dataset.tone=left?'danger':'muted';
        state.textContent=left?linksFailedText(taskKey(current),left):links.dirty()?'':`Задача ${taskKey(current)} создана, связи сохранены.`;
        form.querySelector('.iq-dialog-footer button[type=submit]').textContent=links.dirty()?'Сохранить связи':'Готово';
      };
      if(!task&&canEdit&&repository.capabilities?.taskLinks!==false)links=mountDraftLinks(form.querySelector('[data-task-links]'),{tasks,parentId:initial.parentId||null,releaseContext:()=>catalogs.value().releaseId||tasks.find(t=>t.id===parentField?.value)?.effectiveReleaseId||null,...relations,...linkParents,onChange:linksChanged});
      if(task&&repository.capabilities?.taskLinks!==false)links=mountTaskLinks(form.querySelector('[data-task-links]'),{repository,project,task,tasks,readOnly:!canEdit,...relations,...(canEdit?linkParents:{}),onOpenTask:async id=>{
        if(onOpenTask){await onOpenTask(id);return;}
        const target=await repository.read('tasks',id,project.id);if(!target)throw Error('Задача недоступна.');
        await openTaskDialog(target,{repository,project,tasks,canEdit,canManage,attachmentAdapter,onSaved});
      }});
      // A host may add its own section (the Workbench: personal relation, requests, waiting) and header actions.
      if(task&&supplement)personal=supplement({root:form.querySelector('[data-task-personal]'),actions:form.querySelector('.task-dialog-actions'),task,dialog:el});
      if(task)threads=mountThreads(form.querySelector('[data-task-threads]'),{repository,task,readOnly:!canDiscuss,people:new Map(members.map(m=>[m.id,m])),actorId:repository.context?.actorId||'local-user',onAnswerQuestion:(id,answer,revision)=>agents?.answerQuestion(id,answer,revision)});
      else form.querySelector('[data-task-threads]').hidden=true;
      // Agents of service accounts: a quiet header action and one line above the discussion (docs/decisions/0005-ai-agents.md).
      if(workTabs)agents=mountTaskWork(form.querySelector('[data-task-agents]'),{repository,project,task,summaryRoot:form.querySelector('[data-task-work-summary]'),onOpenWork:()=>form.querySelector('[data-tab=work]')?.click(),onThread:(id,messageId)=>{form.querySelector('[data-tab=task]')?.click();return threads?.open(id,messageId);},onState:state=>threads?.setWorkState(state),onChange:()=>threads?.reload()});
      else if(task&&repository.capabilities?.aiAgents)agents=mountAgentRuns(form.querySelector('[data-task-agents]'),{repository,project,task,actions:form.querySelector('.task-dialog-actions')});
      function applyTemplate(changePriority=false){
        const result=instantiateTaskTemplate(settings,form.querySelector('iq-select[name=type]').value);
        editor.value=taskMarkdown(result);
        description.refresh();
        templateVersion=result.templateVersion;
        if(changePriority&&!priorityTouched)form.querySelector('iq-select[name=priority]').value=result.priority;
        lastTemplateContent=editor.value;
        form.querySelector('[data-type-template-offer]').hidden=true;
      }
      form.addEventListener('iq-change',event=>{
        if(event.target.getAttribute('name')==='parent')links?.setParent(event.target.value);
        if(event.target.getAttribute('name')==='priority')priorityTouched=true;
        // The warning speaks of the owner the task had; another choice answers it.
        if(event.target.getAttribute('name')==='ownerId')form.querySelector('[data-owner-warning]')?.remove();
        if(event.target.getAttribute('name')!=='type'||!canEdit)return;
        const offer=form.querySelector('[data-type-template-offer]');
        const untouched=canApplyTypeTemplate(editor.value,lastTemplateContent);
        offer.hidden=untouched;
        if(untouched){applyTemplate(!current);form.dispatchEvent(new Event('change'));}
        else {
          const type=form.querySelector('iq-select[name=type]').value;
          const name={task:'задачи',bug:'бага',epic:'эпика'}[type]||'выбранного типа';
          offer.innerHTML=`<div class="iq-banner" role="status"><p>Есть шаблон для ${name}.</p><div class="sq-page-actions">${ui.btn('Посмотреть шаблон','secondary sm','','data-preview-type-template')}${ui.btn('Оставить мой текст','ghost sm','','data-keep-description')}</div></div>`;
          offer.querySelector('[data-keep-description]').onclick=event=>{event.stopPropagation();offer.hidden=true;editor.previewMode=false;editor.focusEditor();};
          offer.querySelector('[data-preview-type-template]').onclick=()=>dialog({title:`Шаблон для ${name}`,description:'Замена удалит текущий текст описания. Остальные поля не изменятся.',body:'<iq-markdown-viewer data-template-preview></iq-markdown-viewer>',submitLabel:'Заменить описание',mount:element=>{element.querySelector('[data-template-preview]').value=taskMarkdown(instantiateTaskTemplate(settings,type));},onSubmit:async()=>{applyTemplate();offer.hidden=true;form.dispatchEvent(new Event('change'));}});
        }
      });
      if(repository.listTaskMaterials)materials=mountTaskMaterials(form.querySelector('[data-task-materials]'),{repository,taskId,projectId:project.id,isNew:!task,readOnly:!canEdit,onChange:()=>{
        if(task||!current||saving)return;
        const button=form.querySelector('.iq-dialog-footer button[type=submit]');if(button)button.textContent=materials?.dirty()||links?.dirty?.()?'Повторить сохранение':'Готово';
        if(!materials?.dirty()&&!links?.dirty?.())form.querySelector('[data-task-save-state]').textContent='Все материалы и связи сохранены.';
      }});
      else form.querySelector('[data-task-materials]').hidden=true;
      // "Шаблон" lives inside the editor: a toolbar action while editing, and a quiet link in an empty preview.
      if(canEdit)editor.toolbarActions=[{id:'template',label:'Шаблон',icon:'file'}];
      editor.addEventListener('iq-editor-action',event=>{
        if(event.detail.id!=='template'||!canEdit)return;
        const untouched=canApplyTypeTemplate(editor.value,lastTemplateContent);
        const apply=id=>{if(id==='project')applyTemplate();else{editor.value=STARTER_TASK_TEMPLATES.find(t=>t.id===id).description;description.refresh();lastTemplateContent=editor.value;}form.dispatchEvent(new Event('change'));};
        dialog({title:'Начать с шаблона',description:untouched?'Шаблон заполнит описание. Остальные поля не изменятся.':'Шаблон заменит текущее описание. Остальные поля не изменятся.',
          body:select('starter','Шаблон','project',[['project','Шаблон типа из настроек проекта'],...STARTER_TASK_TEMPLATES.map(t=>[t.id,t.name])]),
          submitLabel:untouched?'Применить':'Заменить описание',onSubmit:async values=>{apply(values.get('starter'));}});
      });
      let discarded=false;
      const dirty=()=>!discarded&&(canEdit&&(JSON.stringify(read(form))!==baseline||files.dirty()||!!links?.dirty?.()||!!materials?.dirty())||!!threads?.dirty()||!!personal?.dirty?.()||!!agents?.dirty?.());
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
      // A new task tells how its creation goes (links saving, one that failed) beside its buttons.
      if(!task&&canEdit)form.querySelector('.iq-dialog-footer').prepend(saveState);
      if(autosave){
        // The footer becomes the save status; the header close button stays the single way out.
        const footer=form.querySelector('.iq-dialog-footer');footer.querySelector('[data-close]').hidden=true;footer.prepend(saveState);showState('Изменения сохраняются автоматически');
        const own=event=>!event.target.matches('iq-tabs')&&!event.target.closest('[data-task-threads],[data-task-links],[data-task-materials],[data-task-agents],[data-task-work-summary]');
        for(const type of ['input','change','iq-change','task-files-change'])form.addEventListener(type,event=>{if(own(event))schedule(type==='input'?900:300);});
        saveState.addEventListener('click',event=>{
          const action=event.target.closest('[data-save-action]')?.dataset.saveAction;
          if(action==='retry')void flush();
          if(action==='reload'){discarded=true;if(onReload)void onReload();else el.close();}
        });
      }
      if(workTabs){
        const tabs=form.querySelector('[data-task-tabs]'),footer=form.querySelector('.iq-dialog-footer');
        const syncTab=(route=false)=>{const value=tabs.getAttribute('value');footer.hidden=value==='work';if(route)history.replaceState(history.state,'',taskURL(task,value));};
        tabs.addEventListener('iq-change',event=>{if(event.target===tabs)syncTab(true);});syncTab();
      }
      // keepOpen: only settle (flush or confirm) and leave the drawer open, so the next task can replace it in one frame.
      async function close({keepOpen=false}={}){
        if(confirming||threads?.isBusy()||agents?.isBusy?.()||materials?.isBusy())return false;
        if(autosave&&!discarded)await flush();
        else if(saving)return false;
        if(!dirty()){if(!keepOpen)el.close();return true;}
        confirming=true;
        const confirm=dialog({
          title:'Закрыть без сохранения?',
          description:autosave?'Последние правки не удалось сохранить, а неопубликованные сообщения будут потеряны. Уже сохранённое останется.'
            :current?'Задача уже создана. Несохранённые материалы, связи и правки в неё не попадут.':'Изменения задачи и неопубликованные сообщения будут потеряны. Уже опубликованные сообщения сохранятся.',
          submitLabel:'Не сохранять',onSubmit:async()=>{discarded=true;if(!keepOpen)el.close();}
        });
        return new Promise(resolve=>confirm.addEventListener('iq-close',()=>{confirming=false;resolve(discarded);},{once:true}));
      }
      el.taskController={close,dirty:()=>dirty()||saving||files.isBusy()||threads?.isBusy()||!!links?.isBusy?.()||!!materials?.isBusy(),taskId,taskKey:task?taskKey(task):null};
      form.addEventListener('click',event=>{
        if(event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();close();}
      },{capture:true});
      el.querySelector('dialog').addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();close();},{capture:true});
      const native=el.querySelector('dialog');let outsideDown=false;
      const outside=event=>{const r=native.getBoundingClientRect();return event.target===native&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
      native.addEventListener('pointerdown',event=>{outsideDown=outside(event);});
      native.addEventListener('click',event=>{if(outsideDown&&outside(event)){event.preventDefault();event.stopImmediatePropagation();close();}outsideDown=false;},{capture:true});
      form.addEventListener('keydown',event=>{
        if(event.isComposing||!canEdit||event.target.closest('[data-task-threads],[data-task-agents]'))return;
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopPropagation();if(autosave)void flush();else form.requestSubmit();}
      });
      const unload=event=>{
        if(dirty()||saving||threads?.isBusy()||materials?.isBusy()){event.preventDefault();event.returnValue='';}
      };
      window.addEventListener('beforeunload',unload);
      el.addEventListener('iq-close',()=>{
        clearTimeout(timer);window.removeEventListener('beforeunload',unload);description.destroy();files.destroy();catalogs.destroy();plan.destroy();threads?.destroy();agents?.destroy();links?.destroy();materials?.destroy();personal?.destroy?.();
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
