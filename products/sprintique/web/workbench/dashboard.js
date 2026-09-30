// «Обзор» and «Список» of the Workbench (docs/workbench/design-v2.md §11.2): one snapshot of the envelope and the
// seven days of the plan. Обзор: Нужно действие (8) + Сегодня (4), Текущая работа as lanes В работе · Жду · Участвую
// (or one list), Изменилось. Список: the same rows full width with columns and paging. Each section loads, fails and
// empties on its own; a live change is offered as one «Обновить», never as a silent reorder.
import {ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {countLabel,localDay,plural,shortDate,weekday} from './model.js';
import {activeItem,changeRow,dayStrip,emptyRow,failedRow,joinedItem,requestRow,skeletonRows,todayRow,waitingItem} from './rows.js';
import {arm,bindKeyboard,focusRow} from './keyboard.js';
import {createActions} from './actions.js';

const POLL_MS=60000;
const LANES=[
  {key:'active',title:'В работе',icon:'circle',hint:'назначено вам',list:'ol',empty:['Ничего не назначено','Назначенные вам задачи в активной стадии появятся здесь.']},
  {key:'waiting',title:'Жду',icon:'clock',hint:'вы поручили',list:'ul',empty:['Ничего не поручено','«Жду» появляется само: вы участвуете и назначили задачу другому.']},
  {key:'joined',title:'Участвую',icon:'users',hint:'ваш порядок',list:'ol',empty:['Вы пока ни в чём не участвуете','«Участвую» в задаче — и она здесь, в вашем порядке.']},
];
const section=(id,span,title,glyph,count,actions,body,{busy=false,note=''}={})=>`<section class="dsk-widget ${span}" id="${id}" aria-labelledby="${id}-h"${busy?' aria-busy="true"':''}>
  <div class="iq-section-head">${icon(glyph,18)}<h2 id="${id}-h" tabindex="-1">${esc(title)}</h2>${count}${note}<div class="iq-section-actions">${actions}</div></div>${body}</section>`;
const countBadge=(n,capped=false)=>n==null?'':`<span class="iq-section-count">${esc(countLabel(n,capped))}</span>`;

export function mountDashboard(host,{mode,api,repository,projects,filter,prefs,savePrefs,openTask,openProject,onNavigate,announce,setSummary,setUpdated}){
  const events=new AbortController();
  let envelope=null,plan=null,envError=null,planError=null,loading=true,rows=new Map(),extra={},snoozed=null,showSnoozed=false,laneTab='active';
  let token=null,poll=null,changed=false,destroyed=false,loadedAt=null,request=0;
  const wide=mode==='list';
  const parts=()=>({personal:!!envelope?.features?.participation,requests:!!envelope?.features?.requests,waiting:!!envelope?.features?.waiting});
  const view={
    reload:options=>load(options),
    rowElement:key=>host.querySelector(`[data-row][data-key="${CSS.escape(key)}"]`),
    focusSection:li=>{const s=li.closest('section');s?.querySelector('h2')?.focus();},
  };
  const actions=createActions({api,repository,view,projects,filter,openTask:(row,options)=>openTask(row,options),openProject,announce});

  async function load({focusKey=null,focusControl=null,silent=false}={}){
    const mine=++request;
    const scroll=document.scrollingElement.scrollTop,active=document.activeElement;
    const activeKey=focusKey||active?.closest?.('[data-row]')?.dataset.key||null;
    if(!silent&&!envelope){loading=true;render();}
    const [e,p]=await Promise.allSettled([api.envelope({projects:filter(),limit:10}),api.plan({horizon:'7d',projects:filter(),undated:'count'})]);
    if(destroyed||mine!==request)return;
    loading=false;
    if(e.status==='fulfilled'){envelope=e.value;envError=null;token=envelope.snapshotToken;changed=false;extra={};}else envError=e.reason;
    if(p.status==='fulfilled'){plan=p.value;planError=null;}else planError=p.reason;
    if(showSnoozed)snoozed=await api.list('snoozed',{projects:filter()}).catch(()=>null);
    loadedAt=new Date();setUpdated(loadedAt);
    render();
    document.scrollingElement.scrollTop=scroll;
    if(activeKey){const li=view.rowElement(activeKey);if(li){const control=focusControl&&li.querySelector(focusControl);(control&&!control.disabled?control.focus():focusRow(li));}}
  }
  function index(list){for(const row of list)rows.set(row.key,row);return list;}
  const groupOf=key=>envelope?.sections[1]?.groups?.find(g=>g.key===key);
  function itemsOf(key){
    const base=key==='action'?envelope?.sections[0]:key==='updates'?envelope?.sections[2]:groupOf(key);
    return base?[...base.items,...(extra[key]?.items||[])]:[];
  }
  const cursorOf=key=>extra[key]?extra[key].nextCursor:(key==='action'?envelope?.sections[0]:key==='updates'?envelope?.sections[2]:groupOf(key))?.nextCursor;

  function summary(){
    if(!envelope){setSummary(null);return;}
    const [action,,updates]=envelope.sections,today=plan?plan.days[0].items.length:null;
    setSummary([
      {href:'#dsk-action',label:'Нужно действие',count:action.count,note:action.overdueCount?`${action.overdueCount} ${plural(action.overdueCount,'просрочен','просрочено','просрочено')}`:''},
      // «Сегодня» is a section of the overview; in the list it leads to the week.
      wide?{href:'/workbench/plan?horizon=today',view:'week',label:'Сегодня',count:today}:{href:'#dsk-today',label:'Сегодня',count:today},
      {sep:true},
      ...LANES.map(l=>({href:`#dsk-lane-${l.key}`,label:l.title,count:groupOf(l.key)?.count??0})),
      {sep:true},
      {href:'#dsk-changes',label:'Изменилось',count:updates.count,capped:updates.countCapped},
    ]);
  }

  function requestsSection(){
    const s=envelope?.sections[0],p=parts();
    let body;
    if(loading&&!envelope)body=`<ol class="dsk-reqs" data-list>${skeletonRows(3)}</ol>`;
    else if(envError&&!envelope)body=`<ol class="dsk-reqs">${failedRow('«Нужно действие»')}</ol>`;
    else{
      const items=index(itemsOf('action'));
      body=`${wide?'<div class="dsk-cols dsk-cols-req" aria-hidden="true"><span></span><span>Кто просит · задача</span><span>Проект</span><span>Нужно до</span><span>Действие</span></div>':''}
      <ol class="dsk-reqs" data-list aria-label="Запросы к вам">${items.length?items.map(r=>requestRow(r,{wide,parts:p})).join(''):emptyRow('Запросов к вам нет','Точные запросы и утверждения появятся здесь, с лицом того, кто просит, и сроком ответа.')}</ol>
      ${showSnoozed?snoozedList():''}
      ${more('action')}
      ${wide?'':`<div class="dsk-widget-foot"><a class="iq-btn ghost sm" href="/workbench/list" data-view="list">Все запросы в списке${icon('arrow',16)}</a><p class="dsk-hint">Кнопка в строке закрывает запрос с отменой; «Ответить» открывает задачу с полем ответа.</p></div>`}`;
    }
    const snoozeButton=s?.snoozedCount?`<button type="button" class="iq-btn ghost sm" data-snoozed-toggle aria-expanded="${showSnoozed}">${icon('clock',16)}<span>Отложенные: ${s.snoozedCount}</span></button>`:'';
    return section('dsk-action',wide?'dsk-span-12':'dsk-span-8','Нужно действие','bell',countBadge(s?.count),snoozeButton,body,{busy:loading&&!envelope});
  }
  function snoozedList(){
    if(!snoozed)return `<ul class="dsk-snoozed">${skeletonRows(1)}</ul>`;
    return `<div class="dsk-snoozed"><h3 class="dsk-subhead">Отложенные</h3><ul data-list>${index(snoozed.items).map(r=>`<li class="dsk-snoozed-row" data-row data-key="${esc(r.key)}" tabindex="-1">
      <div class="dsk-item-copy"><a class="dsk-title" href="${esc(r.canonicalUrl)}" data-open>${esc(r.title)}</a><p class="dsk-meta"><span class="dsk-key">${esc(r.displayId)}</span> · вернётся ${esc(new Date(r.personal.snoozedUntil).toLocaleString('ru-RU',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}</p></div>
      ${ui.btn('Вернуть','ghost sm','undo',`data-unsnooze aria-label="Вернуть в «Нужно действие»: ${esc(r.displayId)}"`)}</li>`).join('')||'<li class="dsk-empty-row">Отложенных нет</li>'}</ul></div>`;
  }
  function todaySection(){
    if(wide)return '';
    let body,note='';
    if(!plan&&!planError)body=`<ul class="dsk-today" data-list>${skeletonRows(2)}</ul>`;
    else if(!plan)body=`<ul class="dsk-today">${failedRow('«Сегодня»',loadedAt?loadedAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'')}</ul>`;
    else{
      const items=plan.days[0].items,today=plan.today;
      note=`<span class="dsk-hint">${esc(weekday(today))} ${esc(shortDate(today))} · ${esc(plan.timezone)}</span>`;
      const undated=plan.summary.undatedCount;
      body=`<div class="dsk-today-wrap"><ul class="dsk-today" data-list aria-label="Сегодня">${items.length?items.map(i=>todayRow(i,{today})).join('')
        :'<li class="dsk-today-empty"><b>На сегодня ничего не назначено</b>Сроки, план и «проверить» появятся здесь, просроченное — первым.</li>'}</ul>
        <div class="dsk-today-side">${dayStrip(plan)}${undated?`<p class="dsk-undated">${icon('clock',14)}Без времени: <b>${undated}</b> ${plural(undated,'задача','задачи','задач')}, в которых вы участвуете <a class="iq-btn ghost sm" href="/workbench/plan?horizon=7d#undated" data-view="week">Показать</a></p>`:''}</div></div>`;
    }
    return section('dsk-today','dsk-span-4','Сегодня','sun',countBadge(plan?plan.days[0].items.length:null),
      `<a class="iq-btn ghost sm" href="/workbench/plan?horizon=7d" data-view="week">Неделя${icon('arrow',16)}</a>`,body,{busy:!plan&&!planError,note});
  }
  function lane(l){
    const g=groupOf(l.key),p=parts(),items=index(itemsOf(l.key)),total=items.length;
    const render=(r,i)=>l.key==='active'?activeItem(r,{wide,parts:p}):l.key==='waiting'?waitingItem(r,{wide,parts:p}):joinedItem(r,{index:i,total,wide,parts:p});
    const disabled=l.key==='waiting'&&!p.waiting||l.key==='joined'&&!p.personal;
    const list=disabled?'':items.length?`<${l.list} class="dsk-items" data-list aria-label="${esc(l.title)}">${items.map(render).join('')}</${l.list}>`
      :`<div class="dsk-lane-empty"><b>${esc(l.empty[0])}</b>${esc(l.empty[1])}</div>`;
    const cols=wide&&items.length?`<div class="dsk-cols dsk-cols-${l.key}" aria-hidden="true"><span></span><span>Задача</span><span>Проект</span><span>${l.key==='waiting'?'Проверить':'Срок'}</span><span>Действия</span></div>`:'';
    return `<section class="dsk-lane" id="dsk-lane-${l.key}" data-lane="${l.key}" aria-labelledby="dsk-lane-${l.key}-h" ${!wide&&laneTab!==l.key?'data-phone-hidden="true"':''}>
      <div class="dsk-lane-head">${icon(l.icon,16)}<h3 id="dsk-lane-${l.key}-h" tabindex="-1">${esc(l.title)}</h3>${countBadge(g?.count??0)}<p>${esc(l.hint)}</p></div>
      ${disabled?'<p class="dsk-hint">Выключено на этом сервере.</p>':cols+list}${more(l.key)}</section>`;
  }
  function currentSection(){
    const current=envelope?.sections[1],form=wide?'list':prefs().layout.currentForm;
    let body;
    if(loading&&!envelope)body=`<div class="dsk-lanes">${LANES.map(l=>`<div class="dsk-lane" aria-hidden="true"><ul class="dsk-items">${skeletonRows(3)}</ul></div>`).join('')}</div>`;
    else if(envError&&!envelope)body=`<ul>${failedRow('«Текущая работа»')}</ul>`;
    else body=`${wide?'':`<div class="iq-segmented dsk-lanes-tabs" role="group" aria-label="Дорожка">${LANES.map(l=>`<button type="button" data-lane-tab="${l.key}" aria-pressed="${laneTab===l.key}">${esc(l.title)} ${groupOf(l.key)?.count??0}</button>`).join('')}</div>`}
      <div class="dsk-lanes${form==='list'?' as-list':''}">${LANES.map(lane).join('')}</div>
      ${wide?'':'<p class="dsk-hint dsk-rule">Одна задача — одна строка: запрос → В работе → Жду → Участвую. ○ — готово, «Проверить» — ваша личная дата, ↑↓ — ваш порядок.</p>'}`;
    const backlog=current?.backlogCount?`<a class="iq-btn ghost sm" href="/workbench/list#dsk-backlog" data-view="list" data-backlog>${icon('list',16)}<span>Назначено мне: бэклог ${current.backlogCount}</span></a>`:'';
    const toggle=wide?'':`<div class="iq-segmented dsk-form" role="group" aria-label="Текущая работа как">${ui.ib('board','Дорожками','',`data-form="lanes" aria-pressed="${form==='lanes'}"`)}${ui.ib('list','Списком','',`data-form="list" aria-pressed="${form==='list'}"`)}</div>`;
    return section('dsk-current','dsk-span-12','Текущая работа','board',countBadge(current?.count),backlog+toggle,body,{busy:loading&&!envelope});
  }
  function changesSection(){
    const s=envelope?.sections[2],p=parts();
    let body;
    if(loading&&!envelope)body=`<ul class="dsk-changes" data-list>${skeletonRows(3)}</ul>`;
    else if(envError&&!envelope)body=`<ul class="dsk-changes">${failedRow('«Изменилось»')}</ul>`;
    else{
      const items=index(itemsOf('updates'));
      body=`${wide&&items.length?'<div class="dsk-cols dsk-cols-chg" aria-hidden="true"><span></span><span>Задача · что изменилось</span><span>Проект</span><span>Когда</span><span></span></div>':''}
        <ul class="dsk-changes" data-list aria-label="Изменения">${items.length?items.map(r=>changeRow(r,{wide})).join(''):emptyRow('Нет непросмотренных изменений','Здесь появятся значимые изменения задач, в которых вы участвуете, и ваших запросов.')}</ul>
        ${more('updates')}${items.length?`<p class="dsk-hint">Показано ${items.length} из ${esc(countLabel(s.count,s.countCapped))} · по задаче, новые сверху</p>`:''}`;
    }
    const all=s?.count&&(p.personal||p.requests)?`<button type="button" class="iq-btn ghost sm" data-seen-all>${icon('eye',16)}<span>Отметить всё просмотренным</span></button>`:'';
    return section('dsk-changes','dsk-span-12','Изменилось','spark',countBadge(s?.count,s?.countCapped),all,body,{busy:loading&&!envelope});
  }
  function more(key){
    if(!envelope)return '';
    const cursor=cursorOf(key);
    return cursor?`<div class="dsk-lane-more">${ui.btn('Показать ещё','ghost sm','down',`data-more="${key}"`)}</div>`:'';
  }
  function backlogSection(){
    if(!wide||!envelope?.sections[1]?.backlogCount)return '';
    const items=extra.backlog?index(extra.backlog.items):null;
    return section('dsk-backlog','dsk-span-12','Назначено мне: бэклог','list',countBadge(envelope.sections[1].backlogCount),'',
      items?`<ol class="dsk-items dsk-list2" data-list>${items.map(r=>`<li class="dsk-item" data-row data-key="${esc(r.key)}" tabindex="-1"><span class="dsk-item-lead">${icon('circle',14)}</span><div class="dsk-item-copy"><a class="dsk-title" href="${esc(r.canonicalUrl)}" data-open>${esc(r.title)}</a><p class="dsk-meta"><span class="dsk-key">${esc(r.displayId)}</span> · ещё не начата</p></div><span class="dsk-project">${esc(r.projectName)}</span><span></span><div class="dsk-item-tail"></div></li>`).join('')}</ol>${more('backlog')}`
        :`<div class="dsk-lane-more">${ui.btn('Показать','ghost sm','down','data-backlog-load')}</div>`);
  }

  function render(){
    rows=new Map();
    const refresh=changed?`<div class="dsk-refresh" role="status">${ui.btn('Появились изменения. Обновить','secondary sm','refresh','data-refresh-plaque')}</div>`:'';
    host.innerHTML=`${refresh}<div class="dsk-grid${wide?' dsk-list2':''}">${requestsSection()}${todaySection()}${currentSection()}${changesSection()}${backlogSection()}</div>`;
    arm(host);summary();actions.restore(host);
  }

  async function loadMore(key,button){
    const cursor=cursorOf(key);if(!cursor)return;
    button.disabled=true;
    try{
      const page=await api.list(key==='action'?'action':key,{projects:filter(),cursor,limit:20});
      const previous=extra[key]?.items||[];extra[key]={items:[...previous,...page.items],nextCursor:page.nextCursor};
      const first=page.items[0]?.key;render();
      if(first)focusRow(view.rowElement(first));announce(`Показано ещё ${page.items.length}`);
    }catch(error){
      button.disabled=false;
      if(error?.code==='CURSOR_STALE'||error?.code==='CURSOR_EXPIRED'){announce('Список изменился, обновляю');await load();}
      else announce('Не удалось загрузить');
    }
  }

  const rowOf=el=>{const li=el.closest('[data-row]');return li?[li,rows.get(li.dataset.key)]:[null,null];};
  host.addEventListener('click',event=>{
    const open=event.target.closest('a[data-open]');
    if(open){if(event.metaKey||event.ctrlKey||event.shiftKey||event.button)return;event.preventDefault();const [,row]=rowOf(open);if(row)openTask(row);else{const li=open.closest('[data-row]');if(li?.dataset.task)openTask({projectId:li.dataset.project,taskId:li.dataset.task,key:li.dataset.key});}return;}
    const viewLink=event.target.closest('a[data-view]');
    if(viewLink){if(event.metaKey||event.ctrlKey)return;event.preventDefault();onNavigate(viewLink.dataset.view,viewLink.getAttribute('href'));return;}
    const day=event.target.closest('a[data-day]');
    if(day){event.preventDefault();onNavigate('week',day.getAttribute('href'));return;}
    const button=event.target.closest('button');if(!button||button.disabled)return;
    const [li,row]=rowOf(button);
    if(button.hasAttribute('data-verb')&&row)void actions.verb(li,row);
    else if(button.hasAttribute('data-complete')&&row)void actions.complete(li,row);
    else if(button.hasAttribute('data-accept')&&row)void actions.accept(li,row);
    else if(button.dataset.rank&&row)void actions.rank(li,row,button.dataset.rank);
    else if(button.hasAttribute('data-seen')&&row)void actions.seen(li,row);
    else if(button.hasAttribute('data-seen-all'))void actions.seenAll(button,envelope.generatedAt);
    else if(button.hasAttribute('data-reasons')){const list=li.querySelector('.dsk-reasons');const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));list.hidden=!open;}
    else if(button.dataset.more)void loadMore(button.dataset.more,button);
    else if(button.hasAttribute('data-backlog-load'))void api.list('backlog',{projects:filter(),limit:20}).then(page=>{extra.backlog=page;render();}).catch(()=>announce('Не удалось загрузить'));
    else if(button.dataset.form){const form=button.dataset.form;if(form!==prefs().layout.currentForm)void savePrefs({layout:{currentForm:form}}).then(render);}
    else if(button.dataset.laneTab){laneTab=button.dataset.laneTab;render();host.querySelector(`[data-lane-tab="${laneTab}"]`)?.focus();}
    else if(button.hasAttribute('data-retry')||button.hasAttribute('data-refresh-plaque'))void load();
    else if(button.hasAttribute('data-snoozed-toggle')){showSnoozed=!showSnoozed;snoozed=null;render();if(showSnoozed)void api.list('snoozed',{projects:filter()}).then(page=>{snoozed=page;render();host.querySelector('[data-snoozed-toggle]')?.focus();});}
    else if(button.hasAttribute('data-unsnooze')&&row)void api.snooze(row.projectId,row.taskId,row.personal.snoozeRevision,null).then(()=>{announce('Запрос вернулся в «Нужно действие»');return load();}).catch(()=>announce('Не удалось вернуть'));
  },{signal:events.signal});
  host.addEventListener('iq-action',event=>{
    const [li,row]=rowOf(event.target);if(!row)return;
    const action=String(event.detail.action);
    if(action==='open')openTask(row);
    else if(action==='open-project')actions.openProject(row);
    else if(action==='leave')void actions.toggleParticipation(li,row);
    else if(action.startsWith('snooze:'))void actions.snooze(li,row,Number(action.slice(7)));
    else if(action.startsWith('due:'))void actions.due(li,row,action.slice(4));
    else if(action.startsWith('check:'))void actions.checkBack(li,row,action.slice(6));
  },{signal:events.signal});
  host.addEventListener('dsk-toggle-participation',event=>{const [li,row]=rowOf(event.target);if(row&&parts().personal)void actions.toggleParticipation(li,row);},{signal:events.signal});
  bindKeyboard(host,{signal:events.signal,onOpen:li=>{const row=rows.get(li.dataset.key);if(row)openTask(row);else li.querySelector('a[data-open]')?.click();},
    sections:()=>['#dsk-action','#dsk-today','#dsk-lane-active','#dsk-lane-waiting','#dsk-lane-joined','#dsk-changes'].map(s=>host.querySelector(s))});

  // Live: the envelope is polled while the page is visible; a new snapshot is offered, never applied under the reader.
  async function check(){
    if(document.hidden||!token||changed||actions.pendingKeys().length)return;
    try{const next=await api.envelope({projects:filter(),limit:10});if(next.snapshotToken!==token){changed=true;const plaque=host.querySelector('.dsk-refresh');if(!plaque){const div=document.createElement('div');div.className='dsk-refresh';div.setAttribute('role','status');div.innerHTML=ui.btn('Появились изменения. Обновить','secondary sm','refresh','data-refresh-plaque');host.prepend(div);}}}
    catch{/* offline or a transient error: the next poll tries again */}
  }
  poll=setInterval(()=>void check(),POLL_MS);

  void load();
  return {
    reload:options=>load(options),
    focusRow:key=>{const li=view.rowElement(key);if(li)focusRow(li);return !!li;},
    /** The row now at `index` of a section's list, else the one before it, else the section's heading. */
    focusAt(sectionId,index){
      const section=sectionId&&host.querySelector(`#${CSS.escape(sectionId)}`);if(!section)return;
      const rows=[...section.querySelectorAll('[data-list] > [data-row]')];
      const row=rows[Math.max(0,index)]||rows.at(-1);
      if(row)focusRow(row);else section.querySelector('h2,h3')?.focus();
    },
    destroy(){destroyed=true;clearInterval(poll);events.abort();actions.destroy();host.replaceChildren();},
  };
}
