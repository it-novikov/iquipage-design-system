import {dialog,select,icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {TASK_COLUMNS,taskColumn} from '../tasks.js';
/** Status tones follow meaning: work in progress is info, waiting for someone is warning, done is success. */
const tones={ready:'neutral',in_progress:'info',review:'warning',ready_for_testing:'planned',testing:'warning',ready_for_release:'success'};
const kindIcons={task:'checklist',bug:'bug',epic:'stack'};
const toNode=(item,linkId='')=>({id:item.id,key:item.displayId||'',title:item.title||'Без названия',status:TASK_COLUMNS.find(c=>c.id===taskColumn(item))?.label||'',tone:tones[taskColumn(item)]||'neutral',icon:kindIcons[item.type]||'checklist',done:item.result==='accepted'||taskColumn(item)==='ready_for_release',...(linkId?{linkId}:{})});
/** "Связи" as a relation map (DS iq-relation-map): parent above, subtasks below, dependencies left, blocked and related tasks right. */
export function mountTaskLinks(root,{repository,project,task,tasks,parentId=task.parentId||null,readOnly=false,actionsRoot=null,countRoot=null,onOpenTask=()=>{}}){
  let items=[],closed=false,parent=parentId;const abort=new AbortController();
  root.innerHTML=`<iq-relation-map ${readOnly?'readonly':''}></iq-relation-map><p class="iq-helper" data-links-empty hidden>Связей пока нет. Укажите родительскую задачу или свяжите с другой задачей.</p><p class="map-form-error" role="alert" hidden></p>`;
  // The one action of the section sits in its heading row.
  const addButton=readOnly?'':`<button type="button" class="iq-btn ghost sm" data-add-link>${icon('plus',16)}<span>Связать</span></button>`;
  if(actionsRoot)actionsRoot.innerHTML=addButton;else root.insertAdjacentHTML('beforeend',addButton);
  const map=root.querySelector('iq-relation-map'),error=root.querySelector('[role=alert]'),empty=root.querySelector('[data-links-empty]');
  const fail=cause=>{if(!closed){error.hidden=false;error.textContent=cause.message;}};
  const find=id=>tasks.find(item=>item.id===id);
  function draw(){
    const other=link=>link.fromId===task.id?link.toId:link.fromId;
    const nodes=list=>list.map(link=>{const target=find(other(link));return target?toNode(target,link.id):null;}).filter(Boolean);
    const children=tasks.filter(item=>item.parentId===task.id&&!item.archivedAt);
    const value={center:toNode({...task,parentId:parent}),parent:parent&&find(parent)?toNode(find(parent)):null,
      dependsOn:nodes(items.filter(l=>l.kind!=='related'&&l.fromId===task.id)),blocks:nodes(items.filter(l=>l.kind!=='related'&&l.toId===task.id)),
      related:nodes(items.filter(l=>l.kind==='related')),children:children.map(item=>toNode(item)),childrenDone:children.length?children.filter(item=>taskColumn(item)==='ready_for_release').length:null};
    map.value=value;
    const total=(value.parent?1:0)+value.dependsOn.length+value.blocks.length+value.related.length+value.children.length;
    empty.hidden=total>0;if(countRoot)countRoot.textContent=total?String(total):'';
  }
  async function reload(){
    try{
      const all=await repository.list('taskLinks',project.id,{signal:abort.signal});if(closed)return;
      items=all.filter(link=>!link.archivedAt&&(link.fromId===task.id||link.toId===task.id));draw();
    }catch(cause){fail(cause);}
  }
  map.addEventListener('iq-open',event=>{Promise.resolve(onOpenTask(event.detail.id)).catch(fail);},{signal:abort.signal});
  map.addEventListener('iq-remove',event=>{
    if(readOnly)return;const link=items.find(item=>item.id===event.detail.linkId),target=find(event.detail.id);if(!link)return;
    dialog({title:'Удалить связь?',description:`Связь с «${target?.title||'задачей'}» пропадёт. Обе задачи сохранятся.`,submitLabel:'Удалить связь',onSubmit:async()=>{
      await repository.write('taskLinks',{...link,archivedAt:new Date().toISOString()},link.revision);await reload();
    }});
  },{signal:abort.signal});
  const onAdd=event=>{
    if(readOnly||!event.target.closest('[data-add-link]'))return;
    const options=tasks.filter(item=>item.id!==task.id&&!item.archivedAt).map(item=>({value:item.id,label:`${item.displayId?item.displayId+' ':''}${item.title}`}));
    const picker=`<iq-combobox name="linkedTask" label="Задача" options="${esc(JSON.stringify(options))}" placeholder="Найти по номеру или названию"></iq-combobox>`;
    // The same words as the map: the choice describes the task being picked, towards this one.
    dialog({title:'Связать задачи',body:picker+select('kind','Выбранная задача','depends',[['depends','Блокирует эту задачу'],['blocks','Ждёт эту задачу'],['related','Связана с этой задачей']]),submitLabel:'Связать',onSubmit:async(values,form)=>{
      const other=form.querySelector('iq-combobox').value;if(!other)throw Error('Выберите задачу.');
      const kind=values.get('kind'),blocks=kind==='blocks';
      // "Блокирует" is stored as the other task depending on this one.
      const record={id:uid('task-link'),projectId:project.id,revision:0,kind:blocks?'depends':kind,fromId:blocks?other:task.id,toId:blocks?task.id:other};
      await repository.write('taskLinks',record,0);await reload();
    }});
  };
  root.addEventListener('click',onAdd,{signal:abort.signal});actionsRoot?.addEventListener('click',onAdd,{signal:abort.signal});
  const unsubscribe=repository.subscribe?.(event=>{if(event.projectId===project.id&&event.collection==='taskLinks')void reload();});
  draw();reload();
  return {reload,setParent(id){parent=id||null;draw();},destroy(){closed=true;abort.abort();unsubscribe?.();}};
}
