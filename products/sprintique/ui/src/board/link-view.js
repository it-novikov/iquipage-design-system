import {dialog,select,icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {linkCaption} from './workspace-model.js';
export function mountTaskLinks(root,{repository,project,task,tasks,readOnly=false,onOpenTask=()=>{}}){
  let items=[],closed=false;const abort=new AbortController();
  root.innerHTML='<div data-links-list></div><p class="map-form-error" role="alert" hidden></p>';
  if(!readOnly)root.insertAdjacentHTML('beforeend',`<button type="button" class="iq-btn ghost sm" data-add-link>${icon('link',16)}<span>Связать с задачей</span></button>`);
  const list=root.querySelector('[data-links-list]'),error=root.querySelector('[role=alert]');
  const fail=cause=>{if(!closed){error.hidden=false;error.textContent=cause.message;}};
  async function reload(){
    try{
      const all=await repository.list('taskLinks',project.id,{signal:abort.signal});if(closed)return;
      items=all.filter(link=>!link.archivedAt&&(link.fromId===task.id||link.toId===task.id));
      list.innerHTML=items.map(link=>{
        const id=link.fromId===task.id?link.toId:link.fromId,target=tasks.find(item=>item.id===id);
        const remove=readOnly?'':`<button type="button" class="iq-btn ghost icon sm" data-remove-link="${esc(link.id)}" aria-label="Удалить связь">${icon('x',16)}</button>`;
        return `<div class="iq-list-item"><div><small>${linkCaption(link,task.id)}</small><button type="button" class="iq-btn ghost sm" data-linked-task="${esc(id)}">${esc(target?.title||'Открыть задачу')}</button></div>${remove}</div>`;
      }).join('');
    }catch(cause){fail(cause);}
  }
  root.addEventListener('click',event=>{
    const linked=event.target.closest('[data-linked-task]');
    if(linked){Promise.resolve(onOpenTask(linked.dataset.linkedTask)).catch(fail);return;}
    if(readOnly)return;
    if(event.target.closest('[data-add-link]')){
      const options=tasks.filter(item=>item.id!==task.id&&!item.archivedAt).map(item=>({value:item.id,label:item.title}));
      const picker=`<iq-combobox name="linkedTask" label="Задача" options="${esc(JSON.stringify(options))}" placeholder="Найти задачу"></iq-combobox>`;
      dialog({title:'Связать задачи',body:select('kind','Связь','depends',[['depends','Зависит от'],['related','Связана с']])+picker,submitLabel:'Связать',onSubmit:async(values,form)=>{
        const record={id:uid('task-link'),projectId:project.id,revision:0,kind:values.get('kind'),fromId:task.id,toId:form.querySelector('iq-combobox').value};
        await repository.write('taskLinks',record,0);await reload();
      }});
    }
    const remove=event.target.closest('[data-remove-link]');
    if(remove){
      const link=items.find(item=>item.id===remove.dataset.removeLink);
      dialog({title:'Удалить связь?',description:'Обе задачи и их содержимое сохранятся.',submitLabel:'Удалить связь',onSubmit:async()=>{
        await repository.write('taskLinks',{...link,archivedAt:new Date().toISOString()},link.revision);await reload();
      }});
    }
  },{signal:abort.signal});
  const unsubscribe=repository.subscribe?.(event=>{if(event.projectId===project.id&&event.collection==='taskLinks')void reload();});
  reload();return {reload,destroy(){closed=true;abort.abort();unsubscribe?.();}};
}
