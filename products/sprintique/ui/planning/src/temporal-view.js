import {registerCore,ui} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {temporalPage,roadmapProjection,timelineIntent,calendarProjection} from './temporal-model.js';
import {operationDialog} from './dialog.js';
import {scheduleDialog,milestoneDialog,dependencyDialog} from './time-dialogs.js';
import {editReleaseDialog} from './release-dialogs.js';

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
  const surface=document.createElement(mode==='dates'?'iq-plan':'iq-roadmap');
  container.append(surface);
  if(mode!=='dates'){
    surface.controlled=true;
    surface.dependencyCapabilities=capabilities.temporal?{create:true,update:true,delete:true}:false;
    surface.scale=viewState.scale||'fit';surface.collapsedIds=viewState.collapsedIds||[];
  }
  function message(text){error.hidden=!text;error.textContent=text||'';}
  const canonical=()=>roadmapProjection(records,dependencies,projectionRevision);
  function apply(){
    if(mode==='dates'){
      const items=calendarProjection(records);
      if(items.length>1000)message('В календаре показана первая страница дат. Уточните релиз или условия списка.');
      surface.items=items.slice(0,1000);if(viewState.month)surface.setAttribute('month',viewState.month);
    }else{surface.data=canonical();surface.state='ready';}
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
  surface.addEventListener('iq-open',event=>{void open(records.find(r=>r.id===event.detail.id));},{signal});
  surface.addEventListener('iq-selection',event=>{selected=records.find(r=>r.id===event.detail.id)||null;controls();},{signal});
  surface.addEventListener('iq-collapse',event=>{viewState.collapsedIds=event.detail.ids;},{signal});
  surface.addEventListener('iq-preview',()=>{dirty=true;controls();},{signal});
  surface.addEventListener('iq-cancel',()=>{dirty=false;controls();},{signal});
  surface.addEventListener('iq-change',event=>{
    if(mode==='dates')viewState.month=event.detail.month;
    else{dirty=false;controls();}
  },{signal});
  surface.addEventListener('iq-retry',()=>void load(),{signal});
  surface.addEventListener('iq-change-request',event=>{
    if(mode==='dates')return;
    event.preventDefault();const detail=event.detail;
    if(disposed||modal||!ready||!capabilities.timeline){detail.reject('Изменение сейчас недоступно.');return;}
    let intent;try{intent=timelineIntent(detail.previous,detail.value,revision);}catch(error){detail.reject(error.message);return;}
    let accepted=false;modal={opening:true};controls();
    modal=operationDialog({adapter,projectId,intent,title:'Изменение календарного плана',
      onCommitted:async()=>{
        if(await load({applyData:false})){
          detail.accept(canonical());accepted=true;dirty=false;await onChanged();
        }else throw Error('Изменение сохранено, но свежий план пока недоступен.');
      },onClose:()=>{
        if(!accepted){detail.reject('Применение отменено.');if(ready){surface.data=canonical();dirty=false;}}
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
