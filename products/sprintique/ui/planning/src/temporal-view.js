import {registerCore,ui} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {temporalPage,roadmapProjection,timelineIntent,calendarProjection} from './temporal-model.js';
import {operationDialog} from './dialog.js';
import {scheduleDialog,milestoneDialog,dependencyDialog} from './time-dialogs.js';
import {editReleaseDialog} from './release-dialogs.js';
import {createTemporalRecovery} from './temporal-recovery.js';

export async function mountTemporalView(root,options) {
  const {adapter,projectId,mode='timeline',filters={},capabilities={},onOpenTask,onChanged=()=>{},viewState={}}=options;
  registerCore();registerAdvanced();
  let records=[],dependencies=[],revision=null,cursor=null,total=0,generation=0,projectionRevision=0;
  let disposed=false,loading=false,modal=null,dirty=false,selected=null,ready=false;
  const events=new AbortController(),signal=events.signal;
  let request=new AbortController();
  const actions=[
    ui.btn('Новая веха','secondary sm','flag','data-time-milestone'),
    ui.btn('Зависимость','ghost sm','link','data-time-dependency'),
    ui.btn('Даты выбранного объекта','ghost sm','calendar','data-time-edit disabled'),
    ui.btn('Обновить план','ghost sm','refresh','data-time-refresh')
  ].join('');
  root.innerHTML=`<div class="pn-timebar row">${actions}<span class="iq-helper" data-time-count></span></div><div data-time-error role="alert" hidden></div><div data-time-surface></div><div data-time-tail></div>`;
  const container=root.querySelector('[data-time-surface]');
  const tail=root.querySelector('[data-time-tail]'),error=root.querySelector('[data-time-error]');
  function createSurface(){
    const element=document.createElement(mode==='dates'?'iq-plan':'iq-roadmap');
    if(mode!=='dates'){
      element.controlled=true;
      element.dependencyCapabilities=capabilities.temporal?{create:true,update:true,delete:true}:false;
      element.scale=viewState.scale||'fit';element.collapsedIds=viewState.collapsedIds||[];
    }
    container.append(element);return element;
  }
  let surface=createSurface();
  function resetProjection(){
    // The public data setter preserves a dirty DS draft. Discarding only the
    // preview requires a fresh surface, not replaying the committed command.
    if(mode!=='dates'){viewState.scale=surface.scale;viewState.collapsedIds=surface.collapsedIds;}
    surface.remove();surface=createSurface();
    if(mode==='dates')surface.items=calendarProjection(records);
    else {surface.data=canonical();surface.state=ready?'ready':'error';}
    dirty=false;
  }
  function message(text){error.hidden=!text;error.textContent=text||'';}
  const canonical=()=>roadmapProjection(records,dependencies,projectionRevision);
  function apply(){
    if(mode==='dates'){
      const items=calendarProjection(records);
      if(items.length>1000)message('В календаре показана первая страница дат. Уточните релиз или условия списка.');
      surface.items=items.slice(0,1000);if(viewState.month)surface.setAttribute('month',viewState.month);
    }else{surface.data=canonical();surface.state='ready';if(selected)surface.selection={kind:'row',id:selected.id};}
  }
  function controls(){
    const states=[['[data-time-milestone]',capabilities.milestone],['[data-time-dependency]',capabilities.temporal],['[data-time-edit]',selected&&!selected.readonly&&capabilities.timeline]];
    for(const [selector,allowed] of states)root.querySelector(selector).disabled=loading||!!modal||!ready||!allowed;
    root.querySelector('[data-time-refresh]').disabled=loading||!!modal||dirty;
    root.querySelector('[data-time-count]').textContent=records.length<total?`Показано объектов: ${records.length} из ${total}`:'';
    tail.innerHTML=cursor?ui.btn('Показать ещё объекты плана','secondary sm','down',`data-time-more ${loading||dirty||modal?'disabled':''}`):'';
  }
  async function load({append=false,applyData=true}={}) {
    if(disposed||loading)return false;
    request.abort();request=new AbortController();const epoch=++generation;
    loading=true;message('');controls();
    try {
      const page=temporalPage(await adapter.timeline({projectId,...filters,cursor:append?cursor:null,signal:request.signal}),projectId,append?revision:null);
      if(disposed||epoch!==generation)return false;
      const existing=new Set(append?records.map(r=>r.id):[]);
      if(page.rows.some(r=>existing.has(r.id))||append&&page.nextCursor&&page.nextCursor===cursor)throw Error('Порядок плана изменился. Обновите список.');
      records=append?[...records,...page.rows]:page.rows;dependencies=page.dependencies;
      revision=page.revision;cursor=page.nextCursor;total=page.total;projectionRevision++;ready=true;
      selected=selected?records.find(r=>r.id===selected.id)||null:null;
      if(applyData){apply();dirty=false;}return true;
    }catch(error){if(!disposed&&epoch===generation){ready=false;message(error.message);if(mode!=='dates')surface.state='error';}return false;}
    finally{if(!disposed&&epoch===generation){loading=false;controls();}}
  }
  async function changed(){if(await load())await onChanged();}
  function released(){modal=null;controls();}
  async function action(create){if(disposed||modal||!ready)return;modal={opening:true};controls();try{modal=await create();}catch(error){modal=null;message(error.message);controls();}}
  const base=()=>({adapter,projectId,onCommitted:changed,onClose:released});
  async function open(row){
    if(!row)return;
    if(row.entityKind==='task')await action(()=>onOpenTask(row.entityId,{onChanged:changed,onClose:released}));
    else if(row.entityKind==='release')await action(()=>editReleaseDialog({...base(),groupId:row.entityId}));
    else await action(()=>milestoneDialog({...base(),row}));
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.matches('[data-time-more]'))void load({append:true});
    if(button.matches('[data-time-refresh]'))void load();
    if(button.matches('[data-time-milestone]'))void action(()=>milestoneDialog(base()));
    if(button.matches('[data-time-dependency]'))void action(()=>dependencyDialog(base()));
    if(button.matches('[data-time-edit]')&&selected)void action(()=>selected.entityKind==='milestone'?milestoneDialog({...base(),row:selected}):scheduleDialog({...base(),row:selected}));
    // data-open-task is the documented core calendar host action, not a private editor hook.
    if(mode==='dates'&&button.matches('[data-open-task]'))void open(records.find(r=>button.dataset.openTask===r.id+':end'||button.dataset.openTask===r.id+':deadline'));
  },{signal});
  root.addEventListener('iq-open',event=>{if(event.target===surface)void open(records.find(r=>r.id===event.detail.id));},{signal});
  root.addEventListener('iq-selection',event=>{if(event.target!==surface)return;selected=records.find(r=>r.id===event.detail.id)||null;controls();},{signal});
  root.addEventListener('iq-collapse',event=>{if(event.target===surface)viewState.collapsedIds=event.detail.ids;},{signal});
  root.addEventListener('iq-preview',event=>{if(event.target===surface){dirty=true;controls();}},{signal});
  root.addEventListener('iq-cancel',event=>{if(event.target===surface){dirty=false;controls();}},{signal});
  root.addEventListener('iq-change',event=>{
    if(event.target!==surface)return;
    if(mode==='dates')viewState.month=event.detail.month;
    else{dirty=false;controls();}
  },{signal});
  root.addEventListener('iq-retry',event=>{if(event.target===surface)void load();},{signal});
  root.addEventListener('iq-change-request',event=>{
    if(event.target!==surface)return;
    if(mode==='dates')return;
    event.preventDefault();const detail=event.detail;
    if(disposed||modal||!ready||!capabilities.timeline){detail.reject('Изменение сейчас недоступно.');return;}
    let intent;try{intent=timelineIntent(detail.previous,detail.value,revision);}catch(error){detail.reject(error.message);return;}
    const recovery=createTemporalRecovery({detail,load:()=>load({applyData:false}),canonical,reset:resetProjection,isActive:()=>!disposed,
      onChanged:async()=>{dirty=false;await onChanged();},onFailure:()=>{message('Изменение сохранено, но свежий план недоступен. Обновите план; повторная запись не требуется.');controls();}});
    modal={opening:true};controls();
    modal=operationDialog({adapter,projectId,intent,title:'Изменение календарного плана',
      onCommitted:()=>recovery.committed(),onClose:()=>{
        if(disposed)return;
        recovery.close();
        dirty=false;if(!ready)surface.state='error';
        released();
      }});
  },{signal});
  await load();
  return {
    reload:()=>dirty||modal?Promise.resolve(false):load(),
    readyToLeave:()=>!dirty&&!modal,
    destroy({force=false}={}){
      if(!force&&(dirty||modal))return false;
      if(force)modal?.element?.close(true);
      disposed=true;generation++;events.abort();request.abort();
      if(mode!=='dates')viewState.scale=surface.scale;
      surface.remove();root.replaceChildren();return true;
    }
  };
}
