import {dialog,select,input,icon,esc} from '../ui.js';
import {ui} from '@iquipage/web/core';
import {linkCandidates,taskRelease} from './link-candidates.js';
import {uid} from '../common.js';
import {TASK_COLUMNS,taskColumn} from '../tasks.js';
import {taskURL} from './task-route.js';
import {LINK_KINDS,PARENT_KIND,createLinkDrafts,saveLink,saveLinks} from './task-create.js';
/** Status tones follow meaning: work in progress is info, waiting for someone is warning, done is success. */
const tones={ready:'neutral',in_progress:'info',review:'warning',ready_for_testing:'planned',testing:'warning',ready_for_release:'success'};
const kindIcons={task:'checklist',bug:'bug',epic:'stack'};
const toNode=(item,linkId='')=>({id:item.id,key:item.displayId||'',title:item.title||'Без названия',status:TASK_COLUMNS.find(c=>c.id===taskColumn(item))?.label||'',tone:tones[taskColumn(item)]||'neutral',icon:kindIcons[item.type]||'checklist',done:item.result==='accepted'||taskColumn(item)==='ready_for_release',...(linkId?{linkId}:{})});
const EMPTY='Связей пока нет. Укажите родительскую задачу или свяжите с другой задачей.';
/**
 * «Связать задачи»: the task and how it relates, in the same words as the map. `parents` are the ids the task may take
 * as its parent; with `onParent` the picker also offers «Родитель этой задачи», which fills the «Родитель» field.
 */
function openLinkPicker({tasks,excludeId,releaseId=null,parents=null,onParent=null,onLink}){
  let selected='',query='';
  const picker=input('linkSearch','Найти задачу','',{placeholder:'Номер или название'})+'<p class="iq-helper" data-link-selected hidden></p><div class="iq-work-story" data-link-results></div>';
  const kinds=onParent?[...LINK_KINDS,PARENT_KIND]:LINK_KINDS;
  dialog({title:'Связать задачи',body:select('kind','Тип связи','depends',kinds)+picker,submitLabel:'Связать',onSubmit:async(values,form)=>{
    const other=selected;if(!other)throw Error('Выберите задачу.');
    const kind=values.get('kind');
    if(kind==='parent'){
      if(parents&&!parents.includes(other))throw Error('Эта задача не может быть родителем: получится цикл.');
      await onParent(other);return;
    }
    await onLink(other,kind);
  },mount:(_el,form)=>{
    const results=form.querySelector('[data-link-results]'),chosen=form.querySelector('[data-link-selected]');
    const options=list=>list.map(t=>({value:t.id,label:`${t.displayId||''} ${t.title}`.trim(),description:TASK_COLUMNS.find(c=>c.id===taskColumn(t))?.label||''}));
    const draw=()=>{const open=results.querySelector('details')?.open,{current,other,completed}=linkCandidates(tasks,{excludeId,releaseId,query});
      results.innerHTML=ui.choiceGroups({name:'linkedTask',value:selected,groups:[{id:'current',label:releaseId?'В этом релизе / спринте':'Без релиза',options:options(current)},{id:'other',label:'В других релизах / спринтах',options:options(other)},{id:'done',label:'Завершённые задачи',options:options(completed),collapsible:true,expanded:!!open}]})+(!current.length&&!other.length&&!completed.length?'<p class="iq-helper">Задачи не найдены. Введите номер или название, чтобы искать в других релизах.</p>':'');};
    form.querySelector('[name=linkSearch]').addEventListener('input',event=>{query=event.target.value;draw();});
    results.addEventListener('change',event=>{if(event.target.name!=='linkedTask')return;selected=event.target.value;const task=tasks.find(t=>t.id===selected);chosen.hidden=false;chosen.textContent=`Выбрана ${task.displayId||''}: ${task.title}`;});
    draw();
  }});
}
/** "Связи" as a relation map (DS iq-relation-map): parent above, subtasks below, dependencies left, blocked and related tasks right. */
export function mountTaskLinks(root,{repository,project,task,tasks,parentId=task.parentId||null,readOnly=false,actionsRoot=null,countRoot=null,parents=null,onParent=null,onOpenTask=()=>{}}){
  let items=[],closed=false,parent=parentId;const abort=new AbortController();
  root.innerHTML=`<iq-relation-map ${readOnly?'readonly':''}></iq-relation-map><p class="iq-helper" data-links-empty hidden>${EMPTY}</p><p class="map-form-error" role="alert" hidden></p>`;
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
    openLinkPicker({tasks,excludeId:task.id,releaseId:taskRelease(tasks.find(t=>t.id===task.id)||task),parents,onParent,onLink:async(other,kind)=>{
      // "Блокирует" is stored as the other task depending on this one.
      const blocks=kind==='blocks';
      const record={id:uid('task-link'),projectId:project.id,revision:0,kind:blocks?'depends':kind,fromId:blocks?other:task.id,toId:blocks?task.id:other};
      await repository.write('taskLinks',record,0);await reload();
    }});
  };
  root.addEventListener('click',onAdd,{signal:abort.signal});actionsRoot?.addEventListener('click',onAdd,{signal:abort.signal});
  const unsubscribe=repository.subscribe?.(event=>{if(event.projectId===project.id&&event.collection==='taskLinks')void reload();});
  draw();reload();
  return {reload,setParent(id){parent=id||null;draw();},destroy(){closed=true;abort.abort();unsubscribe?.();}};
}
/**
 * «Связи» of a task that does not exist yet: the same map and picker as the drawer, around «Новая задача». The links
 * are saved right after the task (task-create.js); one that fails stays on the map, with its reason and «Повторить»
 * under it, and the saved ones are not sent again. A linked task opens in a new tab, so the draft stays.
 */
export function mountDraftLinks(root,{tasks,parentId=null,releaseContext=()=>null,actionsRoot=null,countRoot=null,parents=null,onParent=null,onChange=()=>{}}){
  const drafts=createLinkDrafts(),abort=new AbortController();let parent=parentId,closed=false,locked=false,target=null;
  root.innerHTML=`<iq-relation-map></iq-relation-map><p class="iq-helper" data-links-empty>${EMPTY}</p><div class="task-link-failures" data-link-failures hidden></div><p class="map-form-error" role="alert" hidden></p>`;
  if(actionsRoot)actionsRoot.innerHTML=`<button type="button" class="iq-btn ghost sm" data-add-link>${icon('plus',16)}<span>Связать</span></button>`;
  const map=root.querySelector('iq-relation-map'),error=root.querySelector('[role=alert]'),empty=root.querySelector('[data-links-empty]'),failures=root.querySelector('[data-link-failures]');
  const find=id=>tasks.find(item=>item.id===id);
  const name=item=>item?.displayId||(item?.title?`«${item.title}»`:'задачей');
  function draw(){
    if(closed)return;
    // A saved link is in the project now: the drawer of the created task removes it, so it has no cross here.
    const nodes=kind=>drafts.items().filter(d=>d.kind===kind).map(d=>{const item=find(d.otherId);return item?toNode(item,d.state==='saved'?'':d.id):null;}).filter(Boolean);
    const value={center:{id:'new-task',key:'',title:'Новая задача'},labels:{center:'Новая задача'},parent:parent&&find(parent)?toNode(find(parent)):null,
      dependsOn:nodes('depends'),blocks:nodes('blocks'),related:nodes('related'),children:[]};
    map.value=value;
    const total=(value.parent?1:0)+drafts.items().length;
    empty.hidden=total>0;if(countRoot)countRoot.textContent=total?String(total):'';
    const failed=drafts.failed();failures.hidden=!failed.length;
    failures.innerHTML=failed.map(d=>`<p class="task-link-failure"><span>Связь с ${esc(name(find(d.otherId)))} не сохранена. ${esc(d.error)}</span><button type="button" class="iq-btn ghost sm" data-link-retry="${esc(d.id)}">Повторить</button></p>`).join('');
  }
  map.addEventListener('iq-open',event=>{const item=find(event.detail.id);if(item)window.open(taskURL(item),'_blank','noopener');},{signal:abort.signal});
  map.addEventListener('iq-remove',event=>{if(locked)return;if(drafts.remove(event.detail.linkId)){draw();onChange();}},{signal:abort.signal});
  const onAdd=event=>{
    if(locked||!event.target.closest('[data-add-link]'))return;error.hidden=true;
    openLinkPicker({tasks,excludeId:null,releaseId:releaseContext(),parents,onParent,onLink:async(other,kind)=>{drafts.add(other,kind);draw();onChange();}});
  };
  actionsRoot?.addEventListener('click',onAdd,{signal:abort.signal});
  failures.addEventListener('click',event=>{
    const draft=drafts.find(event.target.closest('[data-link-retry]')?.dataset.linkRetry);
    if(!draft||locked||!target||draft.state==='saving')return;
    void saveLink(target.repository,draft,{taskId:target.taskId,projectId:target.projectId,onChange:draw}).then(()=>onChange());
  },{signal:abort.signal});
  draw();
  return {
    drafts,
    setParent(id){parent=id||null;draw();},
    /** Saves the unsaved links of the created task; returns how many failed. «Повторить» works from then on. */
    async save(repository,{taskId,projectId,onProgress}){
      target={repository,taskId,projectId};
      const failed=await saveLinks(repository,drafts,{taskId,projectId,onChange:draw,onProgress});draw();return failed;
    },
    dirty:()=>drafts.unsaved().length>0,
    isBusy:()=>drafts.items().some(d=>d.state==='saving'),
    setLocked(value){locked=!!value;root.inert=locked;if(actionsRoot)actionsRoot.inert=locked;},
    destroy(){closed=true;abort.abort();}
  };
}
