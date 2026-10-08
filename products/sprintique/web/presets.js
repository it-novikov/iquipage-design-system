import {ui,icon,escapeHTML as esc,notify,pending} from '@iquipage/web/core';
import {dialog,input} from '../ui/src/ui.js';
import {loadCatalog,loadPresets,heldInWorkspace,rowMenu,presetPhrase,usagePhrase,plural,lowerFirst,title,explain} from './access-ui.js';
import {compile,toggle,wouldEnable,wouldDisable,ordered,PROJECT_ACCESS,TASKS_READ} from './permissions.js';
import * as s from './settings-ui.js';
import {failed} from '../ui/src/action-feedback.js';
const OWN_LIMIT=10;
/**
 * Workspace «Пресеты прав»: the starting points of project access. Everyone in the workspace reads them; changing
 * them needs «Настраивать пространство» and never goes beyond one's own permissions (the owner and administrators,
 * who may enter any project, use every permission). A change applies to every membership with the preset.
 */
export async function mountPresets(root,{repository,project,workspace}){
  const client=repository.client,workspaceId=project.workspaceId,base='/workspaces/'+encodeURIComponent(workspaceId)+'/presets',abort=new AbortController();
  const space=new Set(workspace?.permissions||project.workspacePermissions||[]),canEdit=space.has('workspace.settings'),oversee=space.has('projects.oversee');
  let closed=false,modal=null,presets=[],index=new Map(),groups=[],held=new Set(),editing=null,busy=false,loading=0;
  function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;},{once:true});return element;}
  const draft=()=>editing&&JSON.stringify([editing.name.trim(),editing.hint.trim(),[...editing.permissions]]);
  const dirty=()=>!!editing&&!editing.readOnly&&draft()!==editing.baseline;
  function presetRow(p){
    const badges=`${p.locked?' '+s.badge('закреплён'):''}${p.modified?' '+s.badge('изменён','warning'):''}${p.custom?' '+s.badge('свой','planned'):''}`;
    const items=canEdit?[...(p.modified&&!p.locked&&!p.custom?[{label:'Вернуть по умолчанию',action:'preset-reset',glyph:'refresh'}]:[]),...(p.custom?[{label:'Удалить',action:'preset-delete',danger:true,glyph:'trash'}]:[])]:[];
    return s.row({title:p.name,titleExtra:badges,meta:[esc(presetPhrase(index,p)),esc(usagePhrase(p))],aside:editing?.id===p.id?s.badge('редактируется','info'):'',
      actions:ui.btn(canEdit&&!p.locked?'Изменить':'Открыть','ghost sm','',`data-preset-open="${esc(p.id)}"`)+(items.length?rowMenu(p.name,items):'<span class="iq-settings-row-spacer"></span>'),attrs:`data-preset-id="${esc(p.id)}"`});
  }
  function lockOf(id,on){
    if(id===TASKS_READ)return 'Есть у каждого участника';
    if(editing.key==='guest'&&id===PROJECT_ACCESS)return 'Нельзя дать гостю';
    // Without projects.oversee an existing preset can only narrow: it may be used where the actor has less.
    if(!on&&editing.id&&!oversee)return 'Расширить пресет может владелец или администратор пространства';
    if(!on&&!held.has(id))return 'Нет у вас';
    return '';
  }
  function permissionRow(p){
    const on=editing.permissions.has(p.id),lock=lockOf(p.id,on),next=on?wouldDisable(index,editing.permissions,p.id):wouldEnable(index,editing.permissions,p.id);
    const hint=lock?`<span class="sq-perm-hint">${icon('lock',14)}<span>${esc(lock)}</span></span>`:editing.notes.has(p.id)?`<span class="sq-perm-hint" data-tone="note">${esc(editing.notes.get(p.id))}</span>`
      :!editing.readOnly&&next.length?`<span class="sq-perm-hint">${on?'Выключит':'Включит'}: ${esc(next.map(id=>lowerFirst(title(index,id))).join(', '))}</span>`:'';
    return s.row({title:p.title,meta:[esc(p.description),hint],actions:ui.toggle(p.title,on,`data-preset-perm="${esc(p.id)}"${lock||editing.readOnly?' disabled':''}`,false),state:on?'':'muted'});
  }
  const catalogMarkup=()=>groups.map((g,i)=>`<section class="sq-perm-group" aria-labelledby="preset-group-${i}"><h3 id="preset-group-${i}">${esc(g.group)}</h3>${s.panel(g.permissions.map(permissionRow).join(''),'ul')}</section>`).join('');
  function usageMarkup(){
    const u=editing.usage;if(!u?.members||editing.readOnly)return '';
    const people=(u.people||[]).slice(0,5).map(p=>`${p.name}${p.project?` («${p.project}»)`:''}`),more=u.members-people.length;
    return ui.alert(esc(`Применится к ${plural(u.members,['участнику','участникам','участникам'])}${u.projects?` в ${plural(u.projects,['проекте','проектах','проектах'])}`:''}`),esc(`${people.join(', ')}${more>0?` и ещё ${more}`:''}. Их личные добавления и исключения сохранятся.`),'warning');
  }
  function editorMarkup(){
    const e=editing,heading=e.id?`Пресет «${e.original}»`:'Новый пресет';
    const lock=e.locked?s.lock('Пресет закреплён: иначе проект может остаться без администратора.'):!canEdit?s.lock('Вы можете только просматривать. Пресеты меняет тот, кто настраивает пространство.'):'';
    const fields=e.readOnly?s.facts([['Название',esc(e.name)],['Одной фразой',esc(e.hint||'—')]])
      :s.fieldRow('Название','Видно в списках участников и в приглашениях.',input('name','Название',e.name,{required:true,maxlength:40}))+s.fieldRow('Одной фразой','Показывается под именем участника.',input('hint','Одной фразой',e.hint,{maxlength:140}));
    return `<form class="iq-settings-stack" data-preset-form novalidate>${s.group({id:'preset-editor-title',title:heading,description:'Право «запись» включает «чтение» той же области. Пресет не может содержать больше, чем есть у вас.',actions:ui.btn('Закрыть','ghost sm','x','data-preset-close'),
      body:`${lock}${s.panel(fields)}<div class="sq-perm-catalog" data-preset-catalog>${catalogMarkup()}</div><div data-preset-usage>${usageMarkup()}</div><p class="sr-only" role="status" data-preset-status></p>`})}
      <p class="iq-inline danger" role="alert" data-preset-error hidden></p>${e.readOnly?'':s.savebar('Сохранить пресет')}</form>`;
  }
  function render(){
    if(closed)return;
    const own=presets.filter(p=>p.custom).length,full=own>=OWN_LIMIT;
    root.innerHTML=`${s.group({title:'Пресеты проекта',count:presets.length,description:`Отправные точки для прав в проектах пространства. Свои пресеты — до ${OWN_LIMIT}. Удалить можно только пресет, который никому не назначен.`,
      actions:canEdit?`<button type="button" class="iq-btn secondary sm" data-preset-create${full?' disabled aria-describedby="preset-limit"':''}>${icon('plus',17)}Создать пресет</button>${full?`<small class="iq-helper" id="preset-limit">Уже ${OWN_LIMIT} своих пресетов.</small>`:''}`:'',
      body:s.panel(presets.map(presetRow).join('')||s.empty({title:'Пресетов пока нет',glyph:'sliders'}),'ul')})}<div data-preset-editor>${editing?editorMarkup():''}</div>`;
    syncBar();
  }
  function syncBar(){const bar=root.querySelector('.iq-settings-savebar');if(bar&&!busy)bar.hidden=!dirty();}
  function refreshCatalog(focus=''){
    root.querySelector('[data-preset-catalog]').innerHTML=catalogMarkup();syncBar();
    if(focus)root.querySelector(`[data-preset-perm="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
  }
  const announce=text=>{const node=root.querySelector('[data-preset-status]');if(!node)return;node.textContent='';requestAnimationFrame(()=>{node.textContent=text;});};
  async function load(){
    const sequence=++loading;
    const [list,catalog,mine]=await Promise.all([loadPresets(client,workspaceId),loadCatalog(client),space.has('projects.oversee')||!canEdit?null:heldInWorkspace(client,workspaceId)]);
    if(closed||sequence!==loading)return;
    presets=list;index=catalog.index;groups=catalog.project;held=new Set(mine||index.keys());render();
  }
  /** Asks before dropping unsaved changes; resolves true when it is fine to go on. */
  const discard=()=>!dirty()?Promise.resolve(true):new Promise(resolve=>{let ok=false;track(dialog({title:'Не сохранять изменения пресета?',description:'Изменения в названии и правах пропадут.',submitLabel:'Не сохранять',onSubmit:()=>{ok=true;}})).addEventListener('iq-close',()=>resolve(ok),{once:true});});
  async function open(preset){
    if(!await discard())return;
    const permissions=preset?compile(index,{base:preset.permissions,forbidden:preset.key==='guest'?[PROJECT_ACCESS]:[]}):compile(index,{base:[]});
    editing={id:preset?.id||null,requestId:preset?null:crypto.randomUUID(),original:preset?.name||'',key:preset?.key||null,locked:!!preset?.locked,readOnly:!canEdit||!!preset?.locked,revision:preset?.revision,
      name:preset?.name||'',hint:preset?.hint||'',permissions,notes:new Map(),usage:null,baseline:''};
    editing.baseline=draft();render();
    const editor=root.querySelector('[data-preset-editor]');editor.scrollIntoView({block:'start',behavior:'smooth'});(editor.querySelector('[name=name]')||editor.querySelector('[data-preset-close]'))?.focus({preventScroll:true});
    if(preset?.members&&canEdit&&!preset.locked){
      const target=editing;try{const usage=await client.request(`${base}/${encodeURIComponent(preset.id)}/usage`);if(editing!==target||closed)return;editing.usage=usage;root.querySelector('[data-preset-usage]').innerHTML=usageMarkup();}catch{/* The warning is a courtesy; the save still applies to everyone with the preset. */}
    }
  }
  async function close(){if(!await discard())return;const id=editing?.id;editing=null;render();root.querySelector(id?`[data-preset-open="${CSS.escape(id)}"]`:'[data-preset-create]')?.focus();}
  async function save(form){
    const error=form.querySelector('[data-preset-error]'),bar=form.querySelector('.iq-settings-savebar'),status=bar.querySelector('.iq-settings-savebar-status'),submit=bar.querySelector('[type=submit]');
    const name=editing.name.trim(),hint=editing.hint.trim(),permissions=ordered(index,editing.permissions);
    error.hidden=true;if(!name){error.hidden=false;error.textContent='Введите название пресета.';form.querySelector('[name=name]')?.focus();return;}
    busy=true;status.textContent='Сохраняем…';form.setAttribute('aria-busy','true');
    try{
      // One id per new preset: a retry after a lost answer returns the preset already made. The save button is the DS
      // pending action (vnext.35).
      await pending(submit,()=>editing.id?client.request(`${base}/${encodeURIComponent(editing.id)}`,'PUT',{baseRevision:editing.revision,name,hint,permissions})
        :client.request(base,'POST',{id:editing.requestId,name,hint,permissions}));
      const applied=editing.usage?.members;notify({tone:'success',message:`Пресет «${name}» сохранён`,description:applied?`Применён к ${plural(applied,['участнику','участникам','участникам'])}.`:''});
      editing=null;busy=false;await load();
    }catch(failure){if(!closed&&form.isConnected){error.hidden=false;error.textContent=explain(failure);status.textContent='Не удалось сохранить';}}
    finally{busy=false;if(form.isConnected){submit.disabled=false;form.removeAttribute('aria-busy');}}
  }
  root.addEventListener('input',event=>{
    if(!editing||!event.target.closest('[data-preset-form]'))return;
    if(event.target.name==='name')editing.name=event.target.value;
    if(event.target.name==='hint')editing.hint=event.target.value;
    syncBar();
  },{signal:abort.signal});
  root.addEventListener('change',event=>{
    const control=event.target.closest('[data-preset-perm]');if(!control||!editing||editing.readOnly)return;
    const id=control.dataset.presetPerm,result=toggle(index,editing.permissions,id,control.checked);
    editing.permissions=compile(index,{base:[...result.effective],forbidden:editing.key==='guest'?[PROJECT_ACCESS]:[]});
    editing.notes=new Map(result.also.map(p=>[p,control.checked?`Включило «${title(index,id)}»`:`Выключено вместе с «${title(index,id)}»`]));
    refreshCatalog(id);announce(`«${title(index,id)}» ${control.checked?'включено':'выключено'}${result.also.length?`. Также: ${result.also.map(p=>title(index,p)).join(', ')}`:''}.`);
  },{signal:abort.signal});
  root.addEventListener('submit',event=>{const form=event.target.closest('[data-preset-form]');if(!form)return;event.preventDefault();if(!busy&&dirty())void save(form);},{signal:abort.signal});
  root.addEventListener('click',event=>{void(async()=>{
    if(event.target.closest('[data-reset-form]')&&editing){const id=editing.id,preset=presets.find(p=>p.id===id);editing=null;if(preset)await open(preset);else render();return;}
    if(event.target.closest('[data-preset-close]'))return close();
    if(event.target.closest('[data-preset-create]'))return open(null);
    const openId=event.target.closest('[data-preset-open]')?.dataset.presetOpen;if(openId)return open(presets.find(p=>p.id===openId));
    const action=event.target.closest('[data-action]')?.dataset.action,preset=presets.find(p=>p.id===event.target.closest('[data-preset-id]')?.dataset.presetId);if(!preset)return;
    if(action==='preset-reset')track(dialog({title:`Вернуть пресет «${preset.name}» по умолчанию?`,description:`Права пресета станут такими, как при создании пространства. ${preset.members?`Применится к ${plural(preset.members,['участнику','участникам','участникам'])}; их личные изменения сохранятся.`:''}`,submitLabel:'Вернуть',success:`Пресет «${preset.name}» как по умолчанию`,
      onSubmit:async()=>{try{await client.request(`${base}/${encodeURIComponent(preset.id)}/reset`,'POST',{baseRevision:preset.revision});}catch(error){throw Error(explain(error));}if(editing?.id===preset.id)editing=null;await load();}}));
    if(action==='preset-delete')track(dialog({title:`Удалить пресет «${preset.name}»?`,description:'Удалить можно только пресет, который никому не назначен.',submitLabel:'Удалить',success:`Пресет «${preset.name}» удалён`,
      onSubmit:async()=>{try{await client.request(`${base}/${encodeURIComponent(preset.id)}`,'DELETE');}catch(error){throw Error(explain(error));}if(editing?.id===preset.id)editing=null;await load();}}));
  })().catch(error=>failed(error,{description:explain(error)}));},{signal:abort.signal});
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}},{signal:abort.signal});
  await load();
  return {readyToLeave:async()=>!modal&&await discard(),destroy(){closed=true;loading++;abort.abort();modal?.close(true);root.replaceChildren();}};
}
