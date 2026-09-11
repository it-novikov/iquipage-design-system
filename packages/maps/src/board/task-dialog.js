import {mountTaskFiles} from './task-files-view.js';
import {uid} from '../common.js';
import {mountTaskLinks} from './link-view.js';
import {dialog,input,select,icon,esc} from '../ui.js';
import {TASK_COLUMNS,taskColumn,createTask} from '../tasks.js';
import {TASK_KINDS,reparentTask} from './model.js';
import {mountChecklists} from './checklist-view.js';
import {mountThreads} from './thread-view.js';
import {loadTaskSupport,mountTaskCatalogs} from './catalog-picker.js';
import {emptyTaskSettings,instantiateTaskTemplate} from './task-templates.js';

export async function openTaskDialog(task,{repository,project,tasks,canEdit=true,canManage=true,attachmentAdapter=null,status='ready',onSaved=()=>{}}){
  const support=await loadTaskSupport(repository,project.id);
  const settings=support.settings||emptyTaskSettings(project.id);
  const initial=task||{...instantiateTaskTemplate(settings,'task'),type:'task',status,owner:'',title:''};
  const taskId=task?.id||uid('task');
  let files;
  let current=task,baseline='',saving=false,confirming=false,priorityTouched=false,checklists,catalogs,threads,links;
  let templateVersion=initial.templateVersion,lastTemplateContent=JSON.stringify({description:initial.description||'',checklists:initial.checklists||[]});
  const parents=[{value:'',label:'Без родительской задачи'},...tasks.filter(item=>item.id!==task?.id&&!item.archivedAt).map(item=>({value:item.id,label:item.title,description:item.displayId||item.id.slice(-7)}))];
  const content=`<section data-task-cover></section>${input('title','Название',initial.title,{required:true})}
    <div class="task-edit-properties">
      ${select('type','Тип',initial.type||'task',Object.entries(TASK_KINDS))}
      ${select('status','Статус',task?taskColumn(task):status,TASK_COLUMNS.map(column=>[column.id,column.label]))}
      ${input('owner','Ответственный',initial.owner||'',{maxlength:120,placeholder:'Можно назначить позже'})}
      ${select('priority','Приоритет',initial.priority||'normal',[['normal','Обычный'],['high','Высокий'],['critical','Критический'],['low','Низкий']])}
      <iq-date-field name="due" label="Срок" value="${esc(initial.due||'')}"></iq-date-field>
    </div><section data-task-catalogs></section>
    <section class="task-edit-section"><div class="row between"><h3>Описание</h3>${canEdit?'<button type="button" class="iq-btn ghost sm" data-apply-template>Применить шаблон</button>':''}</div>
      <iq-markdown-editor label="Описание" name="description" variant="compact" maxlength="10000"></iq-markdown-editor></section>
    <section class="task-edit-section"><h3>Чек-листы</h3><div data-checklists></div></section>
    <section class="task-edit-section" data-task-files></section>
    <section class="task-edit-section"><h3>Связи</h3><iq-combobox name="parent" label="В составе" value="${esc(initial.parentId||'')}" options="${esc(JSON.stringify(parents))}" placeholder="Найти родительскую задачу"></iq-combobox><div data-task-links></div></section>
    <section class="task-edit-section" data-task-threads></section><p role="status" class="iq-helper" data-task-save-state></p>`;
  const read=(form,values=new FormData(form))=>({
    title:String(values.get('title')||'').trim(),type:values.get('type')||'task',status:values.get('status'),
    owner:values.get('owner')||'',priority:values.get('priority')||'normal',
    description:form.querySelector('iq-markdown-editor[name=description]').value,
    due:form.querySelector('iq-date-field[name=due]').value||null,
    parentId:form.querySelector('iq-combobox[name=parent]').value||null,
    checklists:checklists.value(),...catalogs.value(),...files.value(),templateVersion
  });
  const el=dialog({title:task?'Задача':'Новая задача',body:content,wide:true,submitLabel:canEdit?'Сохранить задачу':'',
    onSubmit:canEdit?async(values,form)=>{
      files.assertReady();
      if(threads?.isBusy())throw Error('Дождитесь публикации обсуждения.');saving=true;
      try{
        const changes=read(form,values),value=current?{...current,...changes}:{...createTask({projectId:project.id,...changes}),...changes,id:taskId};
        const next=reparentTask(value,changes.parentId,tasks);
        const saved=await repository.write('tasks',next,current?.revision||0);
        current=saved;files.accepted(saved);baseline=JSON.stringify(read(form,values));await onSaved(saved);
        if(threads?.dirty()){form.querySelector('[data-task-save-state]').textContent='Задача сохранена. Черновик сообщения ещё не опубликован.';return false;}
      }finally{saving=false;}
    }:undefined,
    mount:(el,form)=>{
      el.classList.add('task-edit-dialog');el.setAttribute('kind','drawer');el.setAttribute('persistent','');
      el.querySelector('dialog').classList.add('iq-drawer');
      files=mountTaskFiles(form.querySelector('[data-task-files]'),{coverRoot:form.querySelector('[data-task-cover]'),adapter:attachmentAdapter,task:{...initial,id:taskId,projectId:project.id},readOnly:!canEdit});
      const editor=form.querySelector('iq-markdown-editor[name=description]');editor.value=initial.description||'';if(task)editor.preview();
      checklists=mountChecklists(form.querySelector('[data-checklists]'),initial.checklists||[],{readOnly:!canEdit});
      catalogs=mountTaskCatalogs(form.querySelector('[data-task-catalogs]'),{repository,project,task:initial,tags:support.tags,releases:support.releases,readOnly:!canEdit,canManage});
      if(task)links=mountTaskLinks(form.querySelector('[data-task-links]'),{repository,project,task,tasks,readOnly:!canEdit,onOpenTask:async id=>{
        const target=await repository.read('tasks',id,project.id);if(!target)throw Error('Задача недоступна.');
        await openTaskDialog(target,{repository,project,tasks,canEdit,canManage,attachmentAdapter,onSaved});
      }});
      if(task)threads=mountThreads(form.querySelector('[data-task-threads]'),{repository,task,readOnly:!canEdit});
      else form.querySelector('[data-task-threads]').innerHTML='<p class="iq-helper">Обсуждения появятся после первого сохранения задачи.</p>';
      function applyTemplate(changePriority=false){
        const result=instantiateTaskTemplate(settings,form.querySelector('iq-select[name=type]').value);
        editor.value=result.description;
        checklists.setValue(result.checklists);
        templateVersion=result.templateVersion;
        if(changePriority&&!priorityTouched)form.querySelector('iq-select[name=priority]').value=result.priority;
        lastTemplateContent=JSON.stringify({description:editor.value,checklists:checklists.value()});
      }
      form.addEventListener('iq-change',event=>{
        if(event.target.getAttribute('name')==='priority')priorityTouched=true;
        if(event.target.getAttribute('name')!=='type'||current)return;
        const untouched=JSON.stringify({description:editor.value,checklists:checklists.value()})===lastTemplateContent;
        if(untouched)applyTemplate(true);
      });
      form.querySelector('[data-apply-template]')?.addEventListener('click',()=>dialog({
        title:'Применить шаблон типа?',description:'Описание и чек-листы будут заменены шаблоном. Остальные свойства останутся прежними.',
        submitLabel:'Применить',onSubmit:async()=>applyTemplate()
      }));
      const dirty=()=>canEdit&&(JSON.stringify(read(form))!==baseline||files.dirty()||threads?.dirty());
      function close(){
        if(saving||confirming||threads?.isBusy())return;
        if(!dirty()){el.close();return;}
        confirming=true;
        const confirm=dialog({
          title:'Закрыть без сохранения?',
          description:'Изменения задачи и неопубликованные сообщения будут потеряны. Уже опубликованные сообщения сохранятся.',
          submitLabel:'Не сохранять',onSubmit:async()=>{el.close(true);}
        });
        confirm.addEventListener('iq-close',()=>{confirming=false;},{once:true});
      }
      form.addEventListener('click',event=>{
        if(event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();close();}
      },{capture:true});
      el.querySelector('dialog').addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();close();},{capture:true});
      form.addEventListener('keydown',event=>{
        if(event.isComposing||!canEdit||event.target.closest('[data-task-threads]'))return;
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopPropagation();form.requestSubmit();}
      });
      const unload=event=>{
        if(dirty()||saving||threads?.isBusy()){event.preventDefault();event.returnValue='';}
      };
      window.addEventListener('beforeunload',unload);
      el.addEventListener('iq-close',()=>{
        window.removeEventListener('beforeunload',unload);files.destroy();checklists.destroy();catalogs.destroy();threads?.destroy();links?.destroy();
      },{once:true});
      baseline=JSON.stringify(read(form));
      if(!canEdit)form.querySelectorAll('input,iq-select,iq-combobox,iq-date-field,iq-markdown-editor').forEach(node=>node.setAttribute('disabled',''));
    }
  });
  return el;
}
