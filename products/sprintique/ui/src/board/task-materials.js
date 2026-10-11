import {ui,enhance,escapeHTML as esc,icon} from '@iquipage/web/core';
import {dialog,input,select} from '../ui.js';
import {loadingMarkup} from '../loading.js';
import {uid} from '../common.js';
import {MATERIAL_CATEGORIES,materialValues,createMaterialDrafts,saveMaterialDrafts} from './task-materials-model.js';

export function materialsMarkup(rows,{readOnly=false,expanded=new Set(),locked=false,wikiSlot=false,hasWiki=false}={}){
 const button=(category,label)=>ui.btn(label,'ghost sm','plus',`data-material-add="${category}" ${locked?'disabled':''}`);
 const row=x=>{let host='';try{host=new URL(x.url).hostname;}catch{}return `<div class="task-material-row" data-material-row="${esc(x.id)}"><div class="task-material-copy"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" data-material-link="${esc(x.id)}">${esc(x.title)}<span class="sr-only"> (откроется в новой вкладке)</span>${icon('upRight',14)}</a><span class="iq-helper">${esc(host)}</span>${x.state==='failed'?`<p class="map-form-error" role="alert">${esc(x.error)}</p>`:''}</div>${!readOnly?ui.menu(`<button type="button" class="iq-btn ghost icon sm" data-material-menu="${esc(x.id)}" aria-label="${esc('Действия материала: '+x.title)}" ${locked?'disabled':''}>${icon('more',16)}</button>`,[{label:'Изменить',action:'material-edit',glyph:'settings'},{label:'Убрать из задачи',action:'material-remove',glyph:'x'}]):''}</div>`;};
 const populated=[],empty=[];
 for(const [category,title] of Object.entries(MATERIAL_CATEGORIES)){
  const list=rows.filter(x=>x.category===category&&!x.archivedAt);if(!list.length&&!(category==='documentation'&&wikiSlot&&hasWiki)){if(!readOnly)empty.push(button(category,category==='design'?'Добавить макет':'Добавить документ'));continue;}
  populated.push(`<section class="task-material-group"><div class="iq-section-head"><h3>${title}</h3>${category==='documentation'&&wikiSlot?'':`<span class="iq-section-count">${list.length}</span>`}${readOnly?'':`<span class="iq-section-actions">${button(category,'Добавить')}</span>`}</div>${list.slice(0,3).map(row).join('')}${list.length>3?`<details class="iq-work-details" data-material-more="${category}" ${expanded.has(category)?'open':''}><summary>Ещё материалов: ${list.length-3}</summary>${list.slice(3).map(row).join('')}</details>`:''}${category==='documentation'&&wikiSlot?'<div data-wiki-material-slot></div>':''}</section>`);
 }
 return populated.join('')+(wikiSlot&&!rows.some(x=>x.category==='documentation'&&!x.archivedAt)&&!hasWiki?'<div data-wiki-material-slot></div>':'')+(empty.length?`<div class="task-material-empty">${empty.join('')}</div>`:'');
}

/** Task materials have their own revision; saving them never rewrites the task description. */
export function mountTaskMaterials(root,{repository,taskId,projectId,isNew=false,readOnly=false,onChange=()=>{},wikiRoot=null,hasWiki=()=>false}){
 const abort=new AbortController(),drafts=isNew?createMaterialDrafts():null,expanded=new Set();
 let rows=[],closed=false,loading=!isNew,loaded=isNew,loadError='',status='',busy=false,locked=false,modal=null,modalDirty=false,removed=null,generation=0,persisted=!isNew,needsReload=false,cleanupEnhance=null;
 const all=()=>drafts?drafts.items():rows;
 const find=id=>all().find(x=>x.id===id);
 const changed=()=>{if(closed)return;draw();onChange();};
 const refresh=()=>{if(!persisted||closed)return;if(busy){needsReload=true;return;}needsReload=false;void reload();};
 const unsubscribe=repository.subscribe?.(event=>{if(event.collection==='taskMaterials'&&event.projectId===projectId&&(!event.taskId||event.taskId===taskId))refresh();});
 function draw(){
  if(closed)return;
  const active=root.contains(document.activeElement)?document.activeElement:null;const wikiFocus=wikiRoot?.contains(active)?active:null;
  const focus=active?.dataset.materialLink?`[data-material-link="${CSS.escape(active.dataset.materialLink)}"]`:active?.dataset.materialAdd?`[data-material-add="${active.dataset.materialAdd}"]`:active?.hasAttribute('data-material-restore')?'[data-material-restore]':active?.closest('[data-material-row]')?`[data-material-menu="${CSS.escape(active.closest('[data-material-row]').dataset.materialRow)}"]`:null;
  root.hidden=readOnly&&loaded&&!all().length&&!hasWiki()&&!loadError;wikiRoot?.remove();
  root.innerHTML=`${loading&&!loaded?loadingMarkup('Загружаем материалы…',{variant:'history',rows:2}):materialsMarkup(all(),{readOnly:readOnly||!loaded,expanded,locked:locked||busy,wikiSlot:!!wikiRoot,hasWiki:hasWiki()})}${loadError?`<p class="map-form-error" role="alert">${esc(loadError)}</p>${ui.btn('Повторить','secondary sm','','data-material-reload')}`:''}${removed?`<p class="iq-helper">Ссылка убрана из задачи. ${ui.btn('Вернуть','ghost sm','','data-material-restore '+(busy?'disabled':''))}</p>`:''}${status?`<p class="iq-helper" role="status" data-material-status>${esc(status)}</p>`:''}`;
  if(wikiRoot)(root.querySelector('[data-wiki-material-slot]')||root).append(wikiRoot);cleanupEnhance=enhance(root);
  if(wikiFocus?.isConnected)wikiFocus.focus({preventScroll:true});else if(focus)root.querySelector(focus)?.focus({preventScroll:true});
 }
 async function reload(){
  const own=++generation;loading=true;loadError='';draw();
  try{const value=await repository.listTaskMaterials(taskId,projectId,{signal:abort.signal});if(closed||own!==generation)return;if(drafts)drafts.sync(value);else rows=value;loaded=true;}
  catch(error){if(closed||own!==generation)return;loadError=error.message||'Не удалось загрузить материалы.';}
  finally{if(!closed&&own===generation){loading=false;draw();}}
 }
 function focusRow(id){queueMicrotask(()=>{if(!closed)root.querySelector(`[data-material-link="${CSS.escape(id)}"]`)?.focus({preventScroll:true});});}
 async function write(record,baseRevision){
  const result=await repository.putTaskMaterial(taskId,record,baseRevision,{projectId,signal:abort.signal});
  if(closed)return result;
  if(drafts)drafts.adopt(result);
  else {const i=rows.findIndex(x=>x.id===record.id);if(result.archivedAt){if(i>=0)rows.splice(i,1);}else if(i>=0)rows[i]=result;else rows.push(result);}
  return result;
 }
 function edit(category,existing=null){
  if(readOnly||locked||busy||modal||!loaded)return;
  let id=existing?.id||uid('material'),baseRevision=existing?.conflict?.revision||existing?.revision||0,more=false,complete=false,conflict=!!existing?.conflict;
  const original=existing?materialValues(existing):{category,title:'',url:''};
  const conflictMarkup=current=>`<p role="alert">${current.archivedAt?'Материал убран из задачи. Сохранение вернёт его.':'Материал уже изменён.'} Ваш текст сохранён в форме.</p><p>${esc(current.title)}<br>${esc(current.url)}</p>${ui.btn('Актуальная версия проверена','secondary sm','','data-material-accept-current')}`;
  const element=dialog({title:existing?'Изменить материал':category==='design'?'Добавить макет':'Добавить документ',body:input('url','Ссылка',original.url,{required:true,maxlength:2048,placeholder:'https://'})+input('title','Название',original.title,{required:true,maxlength:200})+(existing?select('category','Раздел',category,Object.entries(MATERIAL_CATEGORIES)):'')+`<div data-material-conflict>${existing?.conflict?conflictMarkup(existing.conflict):''}</div>`,submitLabel:existing?'Сохранить':'Добавить',mount:(el,form)=>{
   if(!existing){const another=document.createElement('button');another.type='button';another.className='iq-btn secondary sm';another.textContent='Добавить и ещё';another.dataset.materialAnother='';form.querySelector('button[type=submit]').after(another);another.addEventListener('click',()=>{if(busy)return;more=true;form.requestSubmit();});}
   form.addEventListener('click',event=>{if(!busy&&event.target.closest('button[type=submit]'))more=false;});
   const value=()=>({category:form.querySelector('iq-select[name=category]')?.value||category,title:form.elements.title.value,url:form.elements.url.value});
   const dirty=()=>JSON.stringify(value())!==JSON.stringify(original);
   form.addEventListener('input',()=>{modalDirty=dirty();});form.addEventListener('iq-change',()=>{modalDirty=dirty();});
   let confirming=false;
   const close=()=>{if(busy||confirming)return;if(!dirty()){el.close();return;}confirming=true;const confirm=dialog({title:'Закрыть без сохранения?',description:'Изменения ссылки не сохранятся.',submitLabel:'Не сохранять',onSubmit:async()=>{el.close();}});confirm.addEventListener('iq-close',()=>{confirming=false;},{once:true});};
   form.addEventListener('click',event=>{if(event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();close();}},true);
   el.querySelector('dialog').addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();close();},true);el.setAttribute('persistent','');
   form.querySelector('[data-material-conflict]').addEventListener('click',event=>{if(event.target.closest('[data-material-accept-current]')){conflict=false;event.target.closest('[data-material-conflict]').textContent='Актуальная версия проверена. Ваш текст остался в форме.';form.querySelector('button[type=submit]').focus();}});
  },onSubmit:async(values,form)=>{
   const addAnother=more;more=false;
   if(conflict)throw Error('Сначала проверьте актуальную версию материала.');
   const fields=materialValues({category:existing?values.get('category'):category,title:values.get('title'),url:values.get('url')});
   if(all().some(x=>x.id!==id&&x.category===fields.category&&x.url===fields.url))throw Error('Эта ссылка уже добавлена.');
   busy=true;draw();
   try{
    let saved;
    if(drafts&&(!persisted||existing?.state&&existing.state!=='saved'&&!existing.conflict)){saved=existing?drafts.update(existing.id,fields):drafts.add(fields);}
    else saved=await write({id,...fields,archived:false},baseRevision);
    if(closed)return false;
    expanded.add(fields.category);status=saved.state==='pending'?'':persisted?'Ссылка сохранена.':'';changed();modalDirty=false;
    if(addAnother&&!existing){id=uid('material');baseRevision=0;form.elements.url.value='';form.elements.title.value='';queueMicrotask(()=>form.elements.url.focus());return false;}
    complete=true;id=saved.id;
   }catch(error){
    if(error.code==='CONFLICT'){
     const current=await repository.readTaskMaterial(taskId,id,projectId,{signal:abort.signal});
     if(closed)return false;
     if(current){baseRevision=current.revision;conflict=true;form.querySelector('[data-material-conflict]').innerHTML=conflictMarkup(current);}
     else throw Error('Материал убран из задачи. Ваш текст остался в форме.');
    }
    throw error;
   }finally{busy=false;draw();if(needsReload)refresh();}
  }});
  modal=element;queueMicrotask(()=>element.querySelector('[name=url]')?.focus());
  element.addEventListener('iq-close',()=>{modal=null;modalDirty=false;if(complete)focusRow(id);else if(existing)root.querySelector(`[data-material-menu="${CSS.escape(existing.id)}"]`)?.focus({preventScroll:true});else root.querySelector(`[data-material-add="${category}"]`)?.focus({preventScroll:true});},{once:true});
 }
 async function remove(row){
  if(drafts&&row.state!=='saved'){drafts.remove(row.id);changed();root.querySelector(`[data-material-add="${row.category}"]`)?.focus({preventScroll:true});return;}
  busy=true;draw();try{removed=await write({id:row.id,...materialValues(row),archived:true},row.revision);status='';}catch(error){status=error.message||'Не удалось убрать ссылку.';if(error.code==='CONFLICT')needsReload=true;}finally{busy=false;changed();if(needsReload)refresh();root.querySelector('[data-material-restore]')?.focus({preventScroll:true});}
 }
 async function restore(){
  if(!removed)return;busy=true;draw();try{const value=await write({id:removed.id,...materialValues(removed),archived:false},removed.revision);removed=null;status='Ссылка возвращена.';expanded.add(value.category);focusRow(value.id);}catch(error){status=error.message||'Не удалось вернуть ссылку.';if(error.code==='CONFLICT'){const current=await repository.readTaskMaterial(taskId,removed.id,projectId,{signal:abort.signal}).catch(()=>null);if(current){removed=current.archivedAt?current:null;status=current.archivedAt?`Материал изменён. Можно вернуть актуальную версию: «${current.title}».`:'Ссылка уже возвращена.';needsReload=true;}}}finally{busy=false;changed();if(needsReload)refresh();}
 }
 root.addEventListener('toggle',event=>{const category=event.target.dataset.materialMore;if(category){if(event.target.open)expanded.add(category);else expanded.delete(category);}}, {capture:true,signal:abort.signal});
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||busy||locked)return;
  if(button.hasAttribute('data-material-reload')){void reload();return;}
  if(readOnly)return;
  if(button.dataset.materialAdd){edit(button.dataset.materialAdd);return;}
  if(button.hasAttribute('data-material-restore')){void restore();return;}
 },{signal:abort.signal});
 root.addEventListener('iq-action',event=>{
  if(readOnly||locked||busy||modal)return;
  const row=find(event.target.closest('[data-material-row]')?.dataset.materialRow);if(!row)return;
  if(event.detail.action==='material-edit')edit(row.category,row);
  if(event.detail.action==='material-remove')void remove(row);
 },{signal:abort.signal});
 draw();if(!isNew)void reload();
 return {refreshLayout:draw,drafts,dirty:()=>!!drafts?.unsaved().length||modalDirty,isBusy:()=>busy||!!modal,
  setLocked(value){locked=!!value;draw();},
  async save(){if(!drafts)return 0;persisted=true;busy=true;try{return await saveMaterialDrafts(repository,drafts,{taskId,projectId,onChange:changed,signal:abort.signal});}finally{busy=false;changed();if(needsReload)refresh();}},
  destroy(){closed=true;++generation;abort.abort();unsubscribe?.();cleanupEnhance?.();modal?.close(true);root.replaceChildren();}
 };
}
