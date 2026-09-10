import {dialog,input,select,icon,esc} from '../ui.js';
import {TASK_COLUMNS,taskColumn,createTask} from '../tasks.js';
import {TASK_KINDS,reparentTask} from './model.js';
export function openTaskDialog(task,{repository,project,tasks,canEdit=true,status='ready',onSaved=()=>{}}){
  let baseline='',saving=false,confirming=false;
  const parents=[{value:'',label:'Без родительской задачи'},...tasks.filter(t=>t.id!==task?.id&&!t.archivedAt).map(t=>({value:t.id,label:t.title,description:t.displayId||t.id.slice(-7)}))];
  const content=`${input('title','Название',task?.title||'',{required:true})}
  <div class="task-edit-properties">${select('type','Тип',task?.type||'task',Object.entries(TASK_KINDS))}${select('status','Статус',task?taskColumn(task):status,TASK_COLUMNS.map(c=>[c.id,c.label]))}
  ${input('owner','Ответственный',task?.owner||'',{maxlength:120,placeholder:'Можно назначить позже'})}${select('priority','Приоритет',task?.priority||'normal',[['normal','Обычный'],['high','Высокий'],['critical','Критический'],['low','Низкий']])}
  <iq-date-field name="due" label="Срок" value="${esc(task?.due||'')}"></iq-date-field></div>
  <section class="task-edit-section"><h3>Описание</h3><iq-markdown-editor label="Описание" name="description" variant="compact" maxlength="10000"></iq-markdown-editor></section>
  <section class="task-edit-section"><h3>Связи</h3><iq-combobox name="parent" label="В составе" value="${esc(task?.parentId||'')}" options="${esc(JSON.stringify(parents))}" placeholder="Найти родительскую задачу"></iq-combobox><p class="iq-helper">Назначение родителя сохраняет задачу и её содержимое. Перемещение по доске не меняет эту связь.</p></section>`;
  const read=(form,values=new FormData(form))=>({title:String(values.get('title')||'').trim(),type:values.get('type')||'task',status:values.get('status'),owner:values.get('owner')||'',priority:values.get('priority')||'normal',description:form.querySelector('iq-markdown-editor').value,due:form.querySelector('iq-date-field').value||null,parentId:form.querySelector('iq-combobox').value||null});
  const el=dialog({title:task?'Задача':'Новая задача',body:content,wide:true,submitLabel:canEdit?'Сохранить задачу':'',
    onSubmit:canEdit?async(values,form)=>{
      saving=true;
      try{
        const changes=read(form,values),value=task?{...task,...changes}:{...createTask({projectId:project.id,...changes}),...changes};
        const next=reparentTask(value,changes.parentId,tasks);
        const saved=await repository.write('tasks',next,task?.revision||0);
        baseline=JSON.stringify(read(form,values));await onSaved(saved);
      }finally{saving=false;}
    }:undefined,
    mount:(el,form)=>{
      el.classList.add('task-edit-dialog');el.setAttribute('kind','drawer');el.setAttribute('persistent','');
      el.querySelector('dialog').classList.add('iq-drawer');
      const editor=form.querySelector('iq-markdown-editor');editor.value=task?.description||'';
      if(task)editor.preview();
      const dirty=()=>canEdit&&JSON.stringify(read(form))!==baseline;
      const close=()=>{
        if(saving||confirming)return;
        if(!dirty()){el.close();return;}
        confirming=true;
        const confirm=dialog({title:'Закрыть без сохранения?',description:'Изменения в этой задаче ещё не сохранены.',submitLabel:'Не сохранять',onSubmit:async()=>{el.close(true);}});
        confirm.addEventListener('iq-close',()=>{confirming=false;},{once:true});
      };
      form.addEventListener('click',e=>{if(e.target.closest('[data-close]')){e.preventDefault();e.stopImmediatePropagation();close();}},{capture:true});
      el.querySelector('dialog').addEventListener('cancel',e=>{e.preventDefault();e.stopImmediatePropagation();close();},{capture:true});
      form.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing&&canEdit){e.preventDefault();e.stopPropagation();form.requestSubmit();}});
      const unload=e=>{if(dirty()){e.preventDefault();e.returnValue='';}};
      window.addEventListener('beforeunload',unload);
      el.addEventListener('iq-close',()=>window.removeEventListener('beforeunload',unload),{once:true});
      baseline=JSON.stringify(read(form));
      if(!canEdit)form.querySelectorAll('input,iq-select,iq-combobox,iq-date-field,iq-markdown-editor').forEach(n=>n.setAttribute('disabled',''));
    }
  });
  return el;
}
