import {registerCore,ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {loadingMarkup} from '../../src/loading.js';
import {select} from '../../src/ui.js';
import {entryDialog,postDialog,voidDialog,currencyDialog,entryDetails} from './dialogs.js';
import {formatMoney,currencyName,currencySymbol,addMinor} from './money.js';
import {PERIODS,STATE_FILTERS,DIRECTION_FILTERS,entryStatus,entryContext,formatDate,formatMonth,plural,ledgerQuery,periodRange} from './model.js';

const PAGE=50;
const ENTRY_ROUTE=/^#finance\/([A-Za-z0-9_-]{1,100})$/;
const segmented=(label,attribute,items,value)=>`<div class="iq-segmented" role="group" aria-label="${esc(label)}">${items.map(([id,text])=>`<button type="button" ${attribute}="${esc(id)}" aria-pressed="${id===value}">${esc(text)}</button>`).join('')}</div>`;
const signed=(entry)=>formatMoney(entry.direction==='expense'?-entry.amountMinor:entry.amountMinor,entry.currencyCode,{sign:true});

/**
 * The project's finance section: totals for a period, the ledger of entries and a summary by month and category.
 * People of the project read it; project administrators add, correct, post and void entries. The server owns every
 * rule; this view only asks and shows.
 */
export async function mountFinance(root,{repository,project,viewState={}}){
  if(!(root instanceof HTMLElement))throw Error('Нужен контейнер раздела «Финансы».');
  registerCore();
  const base='/projects/'+encodeURIComponent(project.id);
  const api={request:(path,method='GET',body,key,signal)=>repository.client.request(base+path,method,body,key,signal),key:(path,body)=>repository.key(base+path,body)};
  const canManage=project.role==='admin';
  const view={mode:viewState.mode==='summary'?'summary':'ledger',period:PERIODS.some(([id])=>id===viewState.period)?viewState.period:'all',
    state:viewState.state||'',direction:viewState.direction||''};
  let settings=null,summary=null,entries=[],total=0,cursor=null,loadingMore=false,error='',disposed=false,modal=null,modalHasForm=false,generation=0,refreshTimer=0;
  const abort=new AbortController();

  root.innerHTML=`<section class="fin-view"><header class="sq-page-heading fin-head"><h1>Финансы</h1>
    ${segmented('Вид раздела','data-view',[['ledger','Журнал'],['summary','Сводка']],view.mode)}
    <div class="sq-page-tools"><span data-period>${select('period','Период',view.period,PERIODS,'density="compact" label-hidden')}</span>
    ${canManage?ui.btn('Валюта','ghost sm','settings','data-currency'):''}${canManage?ui.btn('Новая операция','primary','plus','data-new-entry'):''}</div></header>
    <div data-notice></div><div data-error role="alert" hidden></div>
    <section class="fin-totals" data-totals aria-label="Итоги за период"></section>
    <div data-ledger><div class="iq-work-toolbar fin-toolbar"><div class="iq-work-toolbar-group">
      ${segmented('Статус операций','data-state',STATE_FILTERS,view.state)}${segmented('Направление','data-direction',DIRECTION_FILTERS,view.direction)}</div></div>
      <div class="iq-work-data fin-ledger" data-list aria-live="polite"></div><div class="iq-work-footer fin-footer" data-footer hidden></div></div>
    <div class="fin-summary" data-summary hidden></div><p class="sr-only" role="status" data-live></p></section>`;
  const q=selector=>root.querySelector(selector);
  const announce=text=>{const live=q('[data-live]');live.textContent='';requestAnimationFrame(()=>{live.textContent=text;});};
  const saveState=()=>Object.assign(viewState,view);

  /** The open dialog; a form holds input a person typed, so leaving the section waits for it to close. */
  function track(element,{form=true}={}){
    if(!element)return element;modal=element;modalHasForm=form;
    element.addEventListener('iq-close',()=>{if(modal===element){modal=null;modalHasForm=false;}},{once:true});
    return element;
  }
  const categories=()=>[...new Set((summary?.categories||[]).map(c=>c.category))].sort((a,b)=>a.localeCompare(b,'ru'));
  const currencies=()=>(summary?.currencies||[]).map(c=>c.currencyCode);

  /** Settings, totals and the first page, read together for the current filter and period. */
  async function load(){
    const ticket=++generation;error='';
    if(!entries.length)q('[data-list]').innerHTML=loadingMarkup('Загружаем операции…',{rows:5});
    try{
      const {from,to}=periodRange(view.period),range=new URLSearchParams();if(from)range.set('from',from);if(to)range.set('to',to);
      const [nextSettings,nextSummary,page]=await Promise.all([
        api.request('/finance-settings','GET',undefined,undefined,abort.signal),
        api.request('/finance-summary'+(range.size?'?'+range:''),'GET',undefined,undefined,abort.signal),
        api.request('/finance-entries?'+ledgerQuery({...view,limit:PAGE}),'GET',undefined,undefined,abort.signal)
      ]);
      if(disposed||ticket!==generation)return;
      settings=nextSettings;summary=nextSummary;entries=page.items;total=page.total;cursor=page.nextCursor;
    }catch(failure){if(disposed||abort.signal.aborted||ticket!==generation)return;error=failure.message||'Сервис недоступен.';}
    render();
  }
  async function loadMore(){
    if(!cursor||loadingMore)return;loadingMore=true;const ticket=generation;render();
    try{const page=await api.request('/finance-entries?'+ledgerQuery({...view,limit:PAGE,cursor}),'GET',undefined,undefined,abort.signal);
      if(disposed||ticket!==generation)return;entries=[...entries,...page.items];total=page.total;cursor=page.nextCursor;announce(`Показано ${entries.length} из ${total}`);}
    catch(failure){if(!disposed&&ticket===generation)notify({tone:'danger',message:'Не удалось загрузить операции',description:failure.message});}
    finally{loadingMore=false;if(!disposed)render();}
  }

  /** People who cannot change finance see who can, as in settings, instead of disabled controls. */
  let administrators=[];
  async function loadAdministrators(){
    if(canManage)return;
    try{administrators=(await repository.client.request(base+'/members','GET',undefined,undefined,abort.signal)).filter(m=>m.role==='admin'&&m.kind!=='agent').map(m=>m.name);}
    catch{administrators=[];}
    if(!disposed)renderNotice();
  }
  function renderNotice(){
    const names=administrators.slice(0,2);
    const text=names.length>1?`Вы можете только просматривать. Операции вносят администраторы проекта: ${names.join(' и ')}.`
      :names.length?`Вы можете только просматривать. Операции вносит ${names[0]}, администратор проекта.`:'Вы можете только просматривать. Операции вносят администраторы проекта.';
    q('[data-notice]').innerHTML=canManage?'':`<p class="iq-settings-lock fin-lock">${icon('lock',17)}<span>${esc(text)}</span></p>`;
  }
  function renderTotals(){
    const target=q('[data-totals]'),list=summary?.currencies||[];
    target.hidden=!list.length;
    target.innerHTML=list.map(c=>{
      const planned=[c.plannedIncome!=='0'?`поступит ${formatMoney(c.plannedIncome,c.currencyCode)}`:'',c.plannedExpense!=='0'?`уйдёт ${formatMoney(c.plannedExpense,c.currencyCode)}`:''].filter(Boolean).join(', ');
      return `<div class="fin-currency" data-currency="${esc(c.currencyCode)}">${list.length>1||c.currencyCode!==settings?.currencyCode?`<h2 class="fin-currency-title">${esc(currencyName(c.currencyCode))}, ${esc(currencySymbol(c.currencyCode))}</h2>`:''}
        <dl class="fin-facts"><div><dt>Поступило</dt><dd>${esc(formatMoney(c.postedIncome,c.currencyCode))}</dd></div>
        <div><dt>Потрачено</dt><dd>${esc(formatMoney(c.postedExpense,c.currencyCode))}</dd></div>
        <div data-emphasis><dt>Баланс</dt><dd data-negative="${c.balance.startsWith('-')}">${esc(formatMoney(c.balance,c.currencyCode))}</dd></div>
        <div><dt>С учётом ожидаемых</dt><dd data-negative="${c.forecast.startsWith('-')}">${esc(formatMoney(c.forecast,c.currencyCode))}</dd>${planned?`<small>${esc(planned[0].toUpperCase()+planned.slice(1))}</small>`:'<small>Ожидаемых операций нет</small>'}</div></dl></div>`;
    }).join('');
  }
  function row(entry){
    const status=entryStatus(entry),context=entryContext(entry);
    return `<tr data-entry="${esc(entry.id)}" data-state="${entry.state}"><td><div class="iq-work-row-title"><a href="#finance/${esc(entry.id)}" data-open-entry="${esc(entry.id)}">${esc(entry.description)}</a>${context?`<span class="fin-row-meta">${esc(context)}</span>`:''}</div></td>
      <td data-column="date"><time datetime="${esc(entry.entryDate)}">${esc(formatDate(entry.entryDate))}</time></td>
      <td data-column="status"><span class="iq-badge soft ${status.tone}">${esc(status.label)}</span></td>
      <td data-column="amount" class="fin-amount" data-direction="${entry.direction}" data-state="${entry.state}">${esc(signed(entry))}</td></tr>`;
  }
  function renderLedger(){
    const list=q('[data-list]'),footer=q('[data-footer]');
    if(error){list.innerHTML='';footer.hidden=true;return;}
    const filtered=Boolean(view.state||view.direction||view.period!=='all');
    // Filters have nothing to narrow in an empty ledger.
    q('.fin-toolbar').hidden=!entries.length&&!filtered;
    if(!entries.length){
      footer.hidden=true;
      list.innerHTML=filtered
        ?`<div class="iq-empty compact"><h3>Нет операций по условиям</h3><p>Измените период или фильтры, чтобы увидеть другие операции.</p>${ui.btn('Сбросить фильтры','secondary sm','','data-reset-filters')}</div>`
        :`<div class="iq-empty compact"><span class="iq-settings-row-tile">${icon('chart',20)}</span><h3>Операций пока нет</h3><p>${canManage?'Добавьте доход или расход проекта: проведённый или ожидаемый к дате. Итоги появятся здесь.':'Операции вносят администраторы проекта. Когда они появятся, здесь будут журнал и итоги.'}</p>${canManage?ui.btn('Добавить операцию','primary sm','plus','data-new-entry'):''}</div>`;
      return;
    }
    list.innerHTML=`<table class="iq-work-table fin-table"><caption class="sr-only">Операции проекта</caption><thead><tr><th scope="col">Операция</th><th scope="col" class="fin-col-date">Дата</th><th scope="col" class="fin-col-status">Статус</th><th scope="col" class="fin-col-amount">Сумма</th></tr></thead><tbody>${entries.map(row).join('')}</tbody></table>`;
    footer.hidden=false;
    footer.innerHTML=`<span>Показано ${entries.length} из ${total} ${plural(total,['операции','операций','операций'])}</span>${cursor?ui.btn(loadingMore?'Загружаем…':'Показать ещё','secondary sm','',`data-more ${loadingMore?'disabled':''}`):''}`;
  }
  function renderSummary(){
    const target=q('[data-summary]');
    if(!summary||error){target.innerHTML='';return;}
    if(!summary.currencies.length){target.innerHTML=`<div class="iq-empty compact"><h3>Сводка пуста</h3><p>За выбранный период нет операций.</p></div>`;return;}
    const byCurrency=code=>summary.months.filter(m=>m.currencyCode===code);
    const number=(value,code)=>`<td class="fin-num">${esc(formatMoney(value,code))}</td>`;
    const months=summary.currencies.map(({currencyCode:code})=>`<section class="iq-section fin-summary-section" aria-labelledby="fin-months-${esc(code)}"><header class="iq-section-head">${icon('calendar',17)}<h3 id="fin-months-${esc(code)}">По месяцам${summary.currencies.length>1?', '+esc(code):''}</h3></header>
      <div class="iq-table-wrap"><table class="iq-table fin-summary-table"><caption class="sr-only">Поступления и расходы по месяцам</caption><thead><tr><th scope="col">Месяц</th><th scope="col" class="fin-num">Поступило</th><th scope="col" class="fin-num">Потрачено</th><th scope="col" class="fin-num">Итог месяца</th><th scope="col" class="fin-num">Ожидается поступлений</th><th scope="col" class="fin-num">Ожидается расходов</th></tr></thead>
      <tbody>${byCurrency(code).map(m=>`<tr><th scope="row">${esc(formatMonth(m.month))}</th>${number(m.postedIncome,code)}${number(m.postedExpense,code)}${number(addMinor(m.postedIncome,'-'+m.postedExpense),code)}${number(m.plannedIncome,code)}${number(m.plannedExpense,code)}</tr>`).join('')}</tbody></table></div></section>`).join('');
    const categories=`<section class="iq-section fin-summary-section" aria-labelledby="fin-categories"><header class="iq-section-head">${icon('palette',17)}<h3 id="fin-categories">По категориям</h3><span class="iq-section-count">${summary.categories.length}</span></header>
      <div class="iq-table-wrap"><table class="iq-table fin-summary-table"><caption class="sr-only">Суммы по категориям</caption><thead><tr><th scope="col">Категория</th><th scope="col">Направление</th><th scope="col" class="fin-num">Проведено</th><th scope="col" class="fin-num">Ожидается</th></tr></thead>
      <tbody>${summary.categories.map(c=>`<tr><th scope="row">${esc(c.category)}</th><td>${c.direction==='income'?'Доход':'Расход'}</td>${number(c.posted,c.currencyCode)}${number(c.planned,c.currencyCode)}</tr>`).join('')}</tbody></table></div></section>`;
    target.innerHTML=months+categories+(summary.truncated?`<p class="iq-helper">Показаны последние 240 месяцев и по 200 крупнейших категорий в каждой валюте. Выберите период короче, чтобы увидеть остальное.</p>`:'');
  }
  function render(){
    if(disposed)return;
    const failure=q('[data-error]');failure.hidden=!error;
    failure.innerHTML=error?ui.alert('Не удалось загрузить финансы',esc(error),'danger')+ui.btn('Повторить','secondary sm','refresh','data-retry'):'';
    for(const button of root.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view.mode));
    for(const button of root.querySelectorAll('[data-state]'))button.setAttribute('aria-pressed',String(button.dataset.state===view.state));
    for(const button of root.querySelectorAll('[data-direction]'))button.setAttribute('aria-pressed',String(button.dataset.direction===view.direction));
    q('[data-ledger]').hidden=view.mode!=='ledger';q('[data-summary]').hidden=view.mode!=='summary';
    renderNotice();renderTotals();renderLedger();renderSummary();
  }

  const reload=()=>{clearTimeout(refreshTimer);refreshTimer=0;return load();};
  const saved=async()=>{await reload();};
  function openCreate(){if(!modal&&settings)track(entryDialog({api,settings,categories:categories(),currencies:currencies(),onSaved:saved}));}
  async function openEntry(id){
    if(modal||disposed)return false;
    let entry=entries.find(item=>item.id===id);
    try{entry=await api.request('/finance-entries/'+encodeURIComponent(id),'GET',undefined,undefined,abort.signal);}
    catch(failure){if(!disposed)notify({tone:'danger',message:'Операция недоступна',description:failure.message});history.replaceState(null,'','#finance');return false;}
    if(disposed||modal)return false;
    if(location.hash!=='#finance/'+id)history.pushState(null,'','#finance/'+encodeURIComponent(id));
    const leave=()=>{if(ENTRY_ROUTE.test(location.hash))history.replaceState(null,'','#finance');};
    track(entryDetails({api,entry,canManage,
      onEdit:replace=>track(entryDialog({api,entry,settings,categories:categories(),currencies:currencies(),onSaved:saved,replace})),
      onPost:replace=>track(postDialog({api,entry,onSaved:saved,replace})),
      onVoid:replace=>track(voidDialog({api,entry,onSaved:saved,replace})),
      onClose:leave}),{form:false});
    return true;
  }

  root.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target||!root.contains(target))return;
    if(target.dataset.openEntry){event.preventDefault();void openEntry(target.dataset.openEntry);return;}
    if(target.hasAttribute('data-new-entry'))openCreate();
    else if(target.hasAttribute('data-currency')&&settings&&!modal)track(currencyDialog({api,settings,currencies:currencies(),onSaved:saved}));
    else if(target.hasAttribute('data-more'))void loadMore();
    else if(target.hasAttribute('data-retry'))void reload();
    else if(target.dataset.view&&target.dataset.view!==view.mode){view.mode=target.dataset.view;saveState();render();}
    else if(target.dataset.state!==undefined&&target.dataset.state!==view.state){view.state=target.dataset.state;saveState();entries=[];void reload();}
    else if(target.dataset.direction!==undefined&&target.dataset.direction!==view.direction){view.direction=target.dataset.direction;saveState();entries=[];void reload();}
    else if(target.hasAttribute('data-reset-filters')){Object.assign(view,{state:'',direction:'',period:'all'});q('iq-select[name=period]').value='all';saveState();entries=[];void reload();}
  },{signal:abort.signal});
  q('iq-select[name=period]').addEventListener('iq-change',event=>{view.period=event.detail.value;saveState();entries=[];void reload();},{signal:abort.signal});
  // Changes by other people arrive as project events; a burst becomes one reload, and none while a dialog is open.
  const unsubscribe=repository.subscribe?.(change=>{
    if(disposed||change.projectId!==project.id||!(change.resync||String(change.collection).startsWith('finance')))return;
    clearTimeout(refreshTimer);refreshTimer=setTimeout(function again(){if(disposed)return;if(modal){refreshTimer=setTimeout(again,500);return;}void reload();},150);
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!modal)void reload();},{signal:abort.signal});

  void loadAdministrators();
  await load();
  const route=ENTRY_ROUTE.exec(location.hash);if(route)void openEntry(route[1]);
  return {
    /** A finance route inside the section: an entry link opens it, the bare section closes it. */
    async openRoute(hash){const match=ENTRY_ROUTE.exec(hash);if(match){if(!modal)await openEntry(match[1]);}else if(modal&&!modalHasForm)modal.close();return true;},
    closeTask:()=>{if(!modal)return true;if(modalHasForm)return false;modal.close(true);return true;},
    readyToLeave:()=>!modal,
    reload,
    destroy(){if(disposed)return;disposed=true;clearTimeout(refreshTimer);abort.abort();unsubscribe?.();modal?.close(true);modal=null;root.replaceChildren();}
  };
}
