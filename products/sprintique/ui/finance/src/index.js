import {registerCore,ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {loadingMarkup} from '../../src/loading.js';
import {select} from '../../src/ui.js';
import {entryDialog,postDialog,voidDialog,currencyDialog,entryDetails} from './dialogs.js';
import {formatMoney,currencyName,currencySymbol} from './money.js';
import {PERIODS,STATE_FILTERS,DIRECTION_FILTERS,entryStatus,entryContext,formatDate,plural,ledgerQuery,periodRange,projectToday} from './model.js';
import {overviewMarkup,explainDialog} from './overview.js';
import {mountPlanEditor} from './plan-editor.js';
import {planOptions} from './overview-model.js';

const PAGE=50;
const ENTRY_ROUTE=/^#finance\/([A-Za-z0-9_-]{1,100})$/;
const segmented=(label,attribute,items,value)=>`<div class="iq-segmented" role="group" aria-label="${esc(label)}">${items.map(([id,text])=>`<button type="button" ${attribute}="${esc(id)}" aria-pressed="${id===value}">${esc(text)}</button>`).join('')}</div>`;
const signed=(entry)=>formatMoney(entry.direction==='expense'?-entry.amountMinor:entry.amountMinor,entry.currencyCode,{sign:true});

/**
 * The project's finance section. «Обзор» (the default) answers whether the project fits its budget: one sentence,
 * the scale of each currency and the categories against the approved plan, with the plan editor behind «Черновик» and
 * «Составить план». «Журнал» is the ledger of entries. People with finance.read see everything read-only; writers
 * keep the ledger, the plan and the explanations. The server owns every rule; this view only asks and shows.
 */
export async function mountFinance(root,{repository,project,viewState={}}){
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер раздела «Финансы».');
  registerCore();
  const base='/projects/'+encodeURIComponent(project.id);
  const api={request:(path,method='GET',body,key,signal)=>repository.client.request(base+path,method,body,key,signal),key:(path,body)=>repository.key(base+path,body)};
  // «Вести журнал финансов»; a session without permissions[] falls back to the derived role.
  const canManage=Array.isArray(project.permissions)?project.permissions.includes('finance.write'):project.role==='admin';
  const view={mode:viewState.mode==='ledger'?'ledger':'overview',period:PERIODS.some(([id])=>id===viewState.period)?viewState.period:'all',
    state:viewState.state||'',direction:viewState.direction||'',overdue:Boolean(viewState.overdue),plan:viewState.plan||''};
  let settings=null,summary=null,entries=[],total=0,cursor=null,loadingMore=false,error='',disposed=false,modal=null,modalHasForm=false,generation=0,refreshTimer=0;
  let overview=null,plans=[],editor=null;
  const abort=new AbortController();

  root.innerHTML=`<div class="fin-root iq-workspace-page"><section class="fin-view" data-main><header class="iq-workspace-heading fin-head"><div><span class="iq-workspace-eyebrow">Экономика проекта</span><h1>Финансы</h1><p>План, операции и отклонения — чтобы принимать решения вовремя.</p></div><div class="iq-workspace-tools">
    ${segmented('Вид раздела','data-view',[['overview','Обзор'],['ledger','Журнал']],view.mode)}
    ${canManage?ui.btn('Новая операция','primary','plus','data-new-entry'):''}</div></header><div class="iq-workspace-toolbar fin-context" data-tools></div>
    <div data-notice></div><div data-error role="alert" hidden></div>
    <div class="fin-overview" data-overview></div>
    <div class="fin-ledger-view" data-ledger hidden><section class="fin-totals" data-totals aria-label="Итоги за период"></section>
      <div class="iq-work-toolbar fin-toolbar"><div class="iq-work-toolbar-group">
      ${segmented('Статус операций','data-state',STATE_FILTERS,view.state)}${segmented('Направление','data-direction',DIRECTION_FILTERS,view.direction)}</div><p class="fin-overdue-filter" data-overdue-filter hidden></p></div>
      <div class="iq-work-data fin-ledger" data-list></div><div class="iq-work-footer fin-footer" data-footer hidden></div></div>
    <p class="sr-only" role="status" data-live></p></section><div data-editor hidden></div></div>`;
  const q=selector=>root.querySelector(selector);
  const announce=text=>{const live=q('[data-live]');live.textContent='';requestAnimationFrame(()=>{live.textContent=text;});};
  const saveState=()=>Object.assign(viewState,view);

  /** The open dialog; a form holds input a person typed, so leaving the section waits for it to close. */
  function track(element,{form=true}={}){
    if(!element)return element;modal=element;modalHasForm=form;
    element.addEventListener('iq-close',()=>{if(modal===element){modal=null;modalHasForm=false;}},{once:true});
    return element;
  }
  /** "Today" in the project's time zone, as planning reads it. */
  const today=()=>projectToday(settings?.timeZone);
  /** The project's categories, whatever period is on screen: the entry dialog and the editor pick one or create one. */
  let allCategories=null;
  async function categories(){
    allCategories??=api.request('/finance-categories','GET',undefined,undefined,abort.signal).then(list=>list.items).catch(()=>[]);
    return allCategories;
  }
  const currencies=()=>(summary?.currencies||[]).map(c=>c.currencyCode);

  /** Settings, then the view on screen: the overview with the plans, or the ledger's totals and first page. */
  async function load({announceResult=false}={}){
    const ticket=++generation;error='';allCategories=null;
    try{
      // The settings carry the project's time zone, which periods and «overdue» are read in.
      const nextSettings=await api.request('/finance-settings','GET',undefined,undefined,abort.signal);
      if(disposed||ticket!==generation)return;settings=nextSettings;
      if(view.mode==='overview')await loadOverview(ticket);else await loadLedger(ticket);
    }catch(failure){if(disposed||abort.signal.aborted||ticket!==generation)return;error=failure.message||'Сервис недоступен.';}
    if(disposed||ticket!==generation)return;
    render();
    if(announceResult&&view.mode==='ledger')announce(error?'Не удалось загрузить операции':total?`Найдено ${total} ${plural(total,['операция','операции','операций'])}`:'Операций нет');
  }
  async function loadOverview(ticket){
    if(!overview)q('[data-overview]').innerHTML=loadingMarkup('Загружаем обзор…',{rows:4});
    const [list,next]=await Promise.all([
      api.request('/finance-plans','GET',undefined,undefined,abort.signal),
      api.request('/finance-overview'+(view.plan?'?plan='+encodeURIComponent(view.plan):''),'GET',undefined,undefined,abort.signal)
        .catch(failure=>{if(view.plan&&failure?.status===404){view.plan='';saveState();return api.request('/finance-overview','GET',undefined,undefined,abort.signal);}throw failure;})
    ]);
    if(ticket!==generation)return;plans=list.items;overview=next;
  }
  async function loadLedger(ticket){
    if(!entries.length)q('[data-list]').innerHTML=loadingMarkup('Загружаем операции…',{rows:5});
    const day=projectToday(settings.timeZone),{from,to}=periodRange(view.period,day),range=new URLSearchParams();
    if(from)range.set('from',from);if(to)range.set('to',to);
    const [nextSummary,page]=await Promise.all([
      api.request('/finance-summary'+(range.size?'?'+range:''),'GET',undefined,undefined,abort.signal),
      api.request('/finance-entries?'+ledgerQuery({...view,limit:PAGE},day),'GET',undefined,undefined,abort.signal)
    ]);
    if(ticket!==generation)return;summary=nextSummary;entries=page.items;total=page.total;cursor=page.nextCursor;
  }
  async function loadMore(){
    if(!cursor||loadingMore)return;loadingMore=true;const ticket=generation;render();
    try{const page=await api.request('/finance-entries?'+ledgerQuery({...view,limit:PAGE,cursor},today()),'GET',undefined,undefined,abort.signal);
      if(disposed||ticket!==generation)return;entries=[...entries,...page.items];total=page.total;cursor=page.nextCursor;announce(`Показано ${entries.length} из ${total}`);}
    catch(failure){if(!disposed&&ticket===generation)notify({tone:'danger',message:'Не удалось загрузить операции',description:failure.message});}
    finally{loadingMore=false;if(!disposed)render();}
  }

  /** People who cannot change finance see who can, as in settings, instead of disabled controls. */
  let administrators=[];
  async function loadAdministrators(){
    if(canManage)return;
    try{administrators=(await repository.client.request(base+'/members','GET',undefined,undefined,abort.signal)).filter(m=>(Array.isArray(m.permissions)?m.permissions.includes('finance.write'):m.role==='admin')&&m.kind!=='agent').map(m=>m.name);}
    catch{administrators=[];}
    if(!disposed)renderNotice();
  }
  function renderNotice(){
    const names=administrators.slice(0,2);
    const text=names.length>1?`Вы можете только просматривать. Операции вносят ${names.join(' и ')}.`
      :names.length?`Вы можете только просматривать. Операции вносит ${names[0]}.`:'Вы можете только просматривать. Операции вносят те, у кого есть право «Вести журнал финансов».';
    // The overview is read-only by itself; the ledger says who keeps it.
    q('[data-notice]').innerHTML=canManage||view.mode!=='ledger'?'':`<p class="iq-settings-lock fin-lock">${icon('lock',17)}<span>${esc(text)}</span></p>`;
  }
  /** The plan of the overview and its draft: the plan picker, «Черновик» or «Пересмотреть», «Составить план». */
  function renderTools(){
    const tools=q('[data-tools]');
    if(view.mode==='ledger'){
      tools.innerHTML=`<span data-period>${select('period','Период',view.period,PERIODS,'density="compact" label-hidden')}</span>${canManage?ui.btn('Валюта','ghost sm','settings','data-currency'):''}`;
      return;
    }
    const current=overview?.plan?plans.find(p=>p.id===overview.plan.id):null;
    const picker=plans.length
      ?`<iq-select class="fin-plan-picker" name="plan" label="План" label-hidden density="compact" value="${esc(current?.id||'')}" options="${esc(JSON.stringify(planOptions(plans)))}"></iq-select>`
      :`<iq-select class="fin-plan-picker" name="plan" label="План" label-hidden density="compact" value="" disabled options="${esc(JSON.stringify([{value:'',label:'План',meta:'не составлен'}]))}"></iq-select>`;
    let action='';
    if(canManage&&current?.draftVersion)action='<button type="button" class="iq-btn secondary sm" data-edit-draft>Продолжить черновик</button>';
    else if(canManage&&current?.approvedVersion)action='<button type="button" class="iq-btn secondary sm" data-revise>Пересмотреть план</button>';
    else if(canManage&&!plans.length)action=ui.btn('Составить план','secondary sm','','data-new-plan');
    tools.innerHTML=`<div class="fin-context-plan"><span class="iq-workspace-caption">План для сравнения</span>${picker}</div><div class="iq-workspace-tools">${action}${canManage&&plans.length?ui.btn('Новый план','ghost sm','plus','data-new-plan'):''}</div>`;
  }
  function renderTotals(){
    const target=q('[data-totals]'),list=summary?.currencies||[];
    target.hidden=!list.length;
    target.innerHTML=list.map(c=>{
      const planned=[c.plannedIncome!=='0'?`поступит ${formatMoney(c.plannedIncome,c.currencyCode)}`:'',c.plannedExpense!=='0'?`уйдёт ${formatMoney(c.plannedExpense,c.currencyCode)}`:''].filter(Boolean).join(', ');
      return `<div class="fin-currency" data-currency="${esc(c.currencyCode)}">${list.length>1||c.currencyCode!==settings?.currencyCode?`<h2 class="fin-currency-title">${esc(currencyName(c.currencyCode))}, ${esc(currencySymbol(c.currencyCode))}</h2>`:''}
        <dl class="fin-facts"><div><dt>Поступило</dt><dd>${esc(formatMoney(c.postedIncome,c.currencyCode))}</dd></div>
        <div><dt>Потрачено</dt><dd>${esc(formatMoney(c.postedExpense,c.currencyCode))}</dd></div>
        <div data-emphasis><dt>Чистый результат</dt><dd data-negative="${c.balance.startsWith('-')}">${esc(formatMoney(c.balance,c.currencyCode))}</dd></div>
        <div><dt>Ожидаемый результат</dt><dd data-negative="${c.forecast.startsWith('-')}">${esc(formatMoney(c.forecast,c.currencyCode))}</dd>${planned?`<small>${esc(planned[0].toUpperCase()+planned.slice(1))}</small>`:'<small>Ожидаемых операций нет</small>'}</div></dl></div>`;
    }).join('');
  }
  function row(entry){
    const status=entryStatus(entry,today()),context=entryContext(entry);
    return `<tr data-entry="${esc(entry.id)}" data-state="${entry.state}"><td><div class="iq-work-row-title"><a href="#finance/${esc(entry.id)}" data-open-entry="${esc(entry.id)}">${esc(entry.description)}</a>${context?`<span class="fin-row-meta">${esc(context)}</span>`:''}</div></td>
      <td data-column="date"><time datetime="${esc(entry.entryDate)}">${esc(formatDate(entry.entryDate))}</time></td>
      <td data-column="status"><span class="iq-badge soft ${status.tone}">${esc(status.label)}</span></td>
      <td data-column="amount" class="fin-amount" data-direction="${entry.direction}" data-state="${entry.state}">${esc(signed(entry))}</td></tr>`;
  }
  function renderLedger(){
    const list=q('[data-list]'),footer=q('[data-footer]'),filter=q('[data-overdue-filter]');
    filter.hidden=!view.overdue;
    filter.innerHTML=view.overdue?`Только просроченные ожидаемые операции. <button type="button" class="iq-link fin-inline-link" data-clear-overdue>Показать все</button>`:'';
    if(error){list.innerHTML='';footer.hidden=true;return;}
    const filtered=Boolean(view.state||view.direction||view.period!=='all'||view.overdue);
    // Filters have nothing to narrow in an empty ledger.
    q('.fin-toolbar').hidden=!entries.length&&!filtered;
    if(!entries.length){
      footer.hidden=true;
      list.innerHTML=filtered
        ?`<div class="iq-empty compact"><h3>Нет операций по условиям</h3><p>Измените период или фильтры, чтобы увидеть другие операции.</p>${ui.btn('Сбросить фильтры','secondary sm','','data-reset-filters')}</div>`
        :`<div class="iq-empty compact"><span class="iq-settings-row-tile">${icon('chart',20)}</span><h3>Операций пока нет</h3><p>${canManage?'Добавьте доход или расход проекта: проведённый или ожидаемый к дате. Итоги появятся здесь.':'Операции вносят те, кто ведёт журнал финансов. Когда они появятся, здесь будут журнал и итоги.'}</p>${canManage?ui.btn('Добавить операцию','primary sm','plus','data-new-entry'):''}</div>`;
      return;
    }
    list.innerHTML=`<table class="iq-work-table fin-table"><caption class="sr-only">Операции проекта</caption><thead><tr><th scope="col">Операция</th><th scope="col" class="fin-col-date">Дата</th><th scope="col" class="fin-col-status">Статус</th><th scope="col" class="fin-col-amount">Сумма</th></tr></thead><tbody>${entries.map(row).join('')}</tbody></table>`;
    footer.hidden=false;
    footer.innerHTML=`<span>Показано ${entries.length} из ${total} ${plural(total,['операции','операций','операций'])}</span>${cursor?ui.btn(loadingMore?'Загружаем…':'Показать ещё','secondary sm','',`data-more ${loadingMore?'disabled':''}`):''}`;
  }
  function renderOverview(){
    const target=q('[data-overview]');
    if(error||!overview){target.innerHTML='';return;}
    target.innerHTML=overviewMarkup(overview,{canManage,timeZone:settings?.timeZone||'UTC'});
  }
  function render(){
    if(disposed)return;
    const failure=q('[data-error]');failure.hidden=!error;
    failure.innerHTML=error?ui.alert('Не удалось загрузить финансы',esc(error),'danger')+ui.btn('Повторить','secondary sm','refresh','data-retry'):'';
    for(const button of root.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view.mode));
    for(const button of root.querySelectorAll('[data-state]'))button.setAttribute('aria-pressed',String(button.dataset.state===(view.overdue?'planned':view.state)));
    for(const button of root.querySelectorAll('[data-direction]'))button.setAttribute('aria-pressed',String(button.dataset.direction===view.direction));
    q('[data-ledger]').hidden=view.mode!=='ledger';q('[data-overview]').hidden=view.mode!=='overview';
    renderTools();renderNotice();
    if(view.mode==='ledger'){renderTotals();renderLedger();}else renderOverview();
  }

  const reload=(options)=>{clearTimeout(refreshTimer);refreshTimer=0;return load(options);};
  const reloadAsked=()=>reload({announceResult:true});
  const saved=async()=>{await reload();};
  function switchTo(mode){if(view.mode===mode)return;view.mode=mode;saveState();entries=[];render();void reloadAsked();}
  async function openCreate(){
    if(modal||!settings)return;const list=await categories();if(modal||disposed)return;
    track(entryDialog({api,settings,today:today(),categories:list,currencies:currencies(),onSaved:saved}));
  }
  async function openEntry(id){
    if(modal||disposed)return false;const list=await categories();
    let entry=entries.find(item=>item.id===id);
    try{entry=await api.request('/finance-entries/'+encodeURIComponent(id),'GET',undefined,undefined,abort.signal);}
    catch(failure){if(!disposed)notify({tone:'danger',message:'Операция недоступна',description:failure.message});history.replaceState(null,'','#finance');return false;}
    if(disposed||modal)return false;
    if(location.hash!=='#finance/'+id)history.pushState(null,'','#finance/'+encodeURIComponent(id));
    const leave=()=>{if(ENTRY_ROUTE.test(location.hash))history.replaceState(null,'','#finance');};
    track(entryDetails({api,entry,today:today(),canManage,
      onEdit:replace=>track(entryDialog({api,entry,settings,today:today(),categories:list,currencies:currencies(),onSaved:saved,replace})),
      onPost:replace=>track(postDialog({api,entry,today:today(),onSaved:saved,replace})),
      onVoid:replace=>track(voidDialog({api,entry,onSaved:saved,replace})),
      onClose:leave}),{form:false});
    return true;
  }
  function openExplain(key){
    if(modal||!overview)return;
    const [categoryId,direction,currencyCode]=key.split('|');
    const target=overview.categories.find(c=>c.categoryId===categoryId&&c.direction===direction&&c.currencyCode===currencyCode);
    if(target)track(explainDialog({api,overview,row:target,onSaved:saved}));
  }

  /** The plan editor takes the page; leaving it returns to the overview of the plan it edited. */
  async function openEditor(planId){
    if(editor||modal||!settings)return;
    try{
      const [list,releasePage,plan]=await Promise.all([categories(),
        api.request('/planning/releases?limit=100','GET',undefined,undefined,abort.signal).catch(()=>({items:[]})),
        planId?api.request('/finance-plans/'+encodeURIComponent(planId),'GET',undefined,undefined,abort.signal):Promise.resolve(null)]);
      const approved=plan?.versions?.find(v=>v.state==='approved');
      const [compared,approvedPlan]=await Promise.all([
        api.request('/finance-overview'+(planId?'?plan='+encodeURIComponent(planId):''),'GET',undefined,undefined,abort.signal),
        approved?api.request(`/finance-plans/${encodeURIComponent(planId)}?version=${approved.version}`,'GET',undefined,undefined,abort.signal):Promise.resolve(null)]);
      if(disposed)return;
      const block=compared.currencies.find(c=>c.currencyCode===(plan?.selected?.lines?.[0]?.currencyCode||settings.currencyCode))||compared.currencies[0];
      const facts={fact:block?.expense.fact||'0',expected:block?.expense.expected||'0',forecast:block?.expense.forecast||'0'};
      const previous=approvedPlan?{total:approvedPlan.selected.lines.filter(l=>l.direction==='expense').reduce((sum,l)=>sum+BigInt(l.amountMinor),0n).toString(),forecast:facts.forecast}:null;
      const host=q('[data-editor]');q('[data-main]').hidden=true;host.hidden=false;
      editor=mountPlanEditor(host,{api,plan,settings,today:today(),categories:list,releases:releasePage.items||[],facts,previous,
        onDone:async next=>{closeEditor();if(next)view.plan=next.id;saveState();allCategories=null;await reload();},
        onCancel:()=>closeEditor()});
      host.querySelector('h1')?.setAttribute('tabindex','-1');host.querySelector('h1')?.focus({preventScroll:true});
    }catch(failure){notify({tone:'danger',message:'Редактор плана не открылся',description:failure.message});}
  }
  function closeEditor(){
    editor?.destroy();editor=null;const host=q('[data-editor]');host.hidden=true;q('[data-main]').hidden=false;
    q('[data-view][aria-pressed=true]')?.focus({preventScroll:true});
  }
  async function revise(){
    const current=plans.find(p=>p.id===overview?.plan?.id);if(!current?.approvedVersion)return;
    try{
      const detail=await api.request(`/finance-plans/${encodeURIComponent(current.id)}?version=${current.approvedVersion}`,'GET',undefined,undefined,abort.signal);
      const path=`/finance-plans/${encodeURIComponent(current.id)}/revise`,body={baseRevision:detail.selected.revision,version:current.approvedVersion,note:null};
      await api.request(path,'POST',body,await api.key(path,body));
      await openEditor(current.id);
    }catch(failure){notify({tone:'danger',message:'Пересмотр не начался',description:failure.message});}
  }

  root.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target||!root.contains(target)||target.closest('[data-editor]'))return;
    if(target.dataset.openEntry){event.preventDefault();void openEntry(target.dataset.openEntry);return;}
    if(target.hasAttribute('data-new-entry'))void openCreate();
    else if(target.hasAttribute('data-currency')&&settings&&!modal)track(currencyDialog({api,settings,currencies:currencies(),onSaved:saved}));
    else if(target.hasAttribute('data-more'))void loadMore();
    else if(target.hasAttribute('data-retry'))void reload();
    else if(target.dataset.explain)openExplain(target.dataset.explain);
    else if(target.hasAttribute('data-edit-draft'))void openEditor(overview?.plan?.id);
    else if(target.hasAttribute('data-new-plan'))void openEditor(null);
    else if(target.hasAttribute('data-revise'))void revise();
    else if(target.hasAttribute('data-overdue')){Object.assign(view,{mode:'ledger',overdue:true,state:'planned',direction:'',period:'all'});saveState();entries=[];render();void reloadAsked();}
    else if(target.hasAttribute('data-clear-overdue')){Object.assign(view,{overdue:false,state:''});saveState();entries=[];void reloadAsked();}
    else if(target.dataset.view)switchTo(target.dataset.view);
    else if(target.dataset.state!==undefined&&(target.dataset.state!==view.state||view.overdue)){Object.assign(view,{state:target.dataset.state,overdue:false});saveState();entries=[];void reloadAsked();}
    else if(target.dataset.direction!==undefined&&target.dataset.direction!==view.direction){view.direction=target.dataset.direction;saveState();entries=[];void reloadAsked();}
    else if(target.hasAttribute('data-reset-filters')){Object.assign(view,{state:'',direction:'',period:'all',overdue:false});saveState();entries=[];void reloadAsked();}
  },{signal:abort.signal});
  root.addEventListener('iq-change',event=>{
    const field=event.target;if(field.closest?.('[data-editor]'))return;
    if(field.matches?.('iq-select[name=period]')){view.period=event.detail.value;view.overdue=false;saveState();entries=[];void reloadAsked();}
    else if(field.matches?.('iq-select[name=plan]')&&event.detail.value){view.plan=event.detail.value;saveState();void reload();}
  },{signal:abort.signal});
  // Changes by other people arrive as project events; a burst becomes one reload, and none while a dialog or the
  // editor is open.
  const unsubscribe=repository.subscribe?.(change=>{
    if(disposed||change.projectId!==project.id||!(change.resync||String(change.collection).startsWith('finance')))return;
    clearTimeout(refreshTimer);refreshTimer=setTimeout(function again(){if(disposed)return;if(modal||editor){refreshTimer=setTimeout(again,500);return;}void reload();},150);
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!modal&&!editor)void reload();},{signal:abort.signal});

  void loadAdministrators();
  await load();
  const route=ENTRY_ROUTE.exec(location.hash);if(route)void openEntry(route[1]);
  return {
    /** A finance route inside the section: an entry link opens it, the bare section closes it. */
    async openRoute(hash){const match=ENTRY_ROUTE.exec(hash);if(match){if(!modal)await openEntry(match[1]);}else if(modal&&!modalHasForm)modal.close();return true;},
    closeTask:()=>{if(!modal)return true;if(modalHasForm)return false;modal.close(true);return true;},
    readyToLeave:()=>!modal,
    reload,
    destroy(){if(disposed)return;disposed=true;clearTimeout(refreshTimer);abort.abort();unsubscribe?.();modal?.close(true);modal=null;editor?.destroy();root.replaceChildren();}
  };
}
