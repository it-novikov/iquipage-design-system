// «Неделя» of the Workbench (docs/adr W5 §13, design-v2 §5.3): Сегодня | 7 дней in the person's time zone, read only.
// Kinds of time stay distinct and named (Срок, План, Ответ, Проверить, Веха); what is overdue shows on today with its
// original date; tasks the person participates in without any date are listed under «Без времени».
import {ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {PLAN_KINDS,dayLabel,plural,shortDate} from './model.js';
import {arm,bindKeyboard,focusRow} from './keyboard.js';

const LEGEND=[['flag','Срок — когда должен быть готов результат'],['calendar','План — когда работаете (интервал показан на каждом дне)'],
  ['help','Ответ — «нужно до» запроса'],['calendar','Проверить — ваша личная дата'],['pin','Веха проекта']];

export function mountWeek(host,{api,filter,horizon:initial='7d',openTask,announce,setUpdated,savePrefs,prefs}){
  const events=new AbortController();
  let horizon=initial,plan=null,error=null,destroyed=false,request=0;

  async function load(){
    const mine=++request;
    try{plan=await api.plan({horizon,projects:filter()});error=null;}catch(cause){error=cause;}
    if(destroyed||mine!==request)return;
    setUpdated(new Date());render();
    const anchor=decodeURIComponent(location.hash.slice(1));
    if(anchor){const target=host.querySelector(`[data-date="${CSS.escape(anchor)}"],#dsk-week-${CSS.escape(anchor)}`);target?.scrollIntoView({block:'start'});}
  }
  const chip=(item,today)=>{
    const kind=PLAN_KINDS[item.kind]||PLAN_KINDS.due,name=item.task?.title||item.milestone?.title||'';
    const when=item.overdue?` · было ${shortDate(item.date)}`:item.kind==='planned'&&item.startDate&&item.endDate&&item.startDate!==item.endDate?` · ${shortDate(item.startDate)} – ${shortDate(item.endDate)}`:'';
    const inner=`<span class="dsk-plan-kind">${icon(kind.icon,14)}${esc(kind.label)}${esc(when)}${item.task?` · <span class="dsk-key">${esc(item.task.displayId)}</span>`:''}</span>
      <span class="dsk-plan-title">${esc(name)}</span><span class="dsk-project">${esc(item.projectName)}</span>`;
    const tone=item.overdue?' data-tone="danger"':'';
    return item.canonicalUrl?`<li data-row data-key="${esc(item.key)}" data-project="${esc(item.projectId)}" data-task="${esc(item.task.id)}" tabindex="-1" class="dsk-plan-chip" data-kind="${item.kind}"${tone}>
        <a href="${esc(item.canonicalUrl)}" data-open aria-label="${esc(kind.label)}: ${esc(name)}, ${esc(item.task.displayId)}${item.overdue?`, просрочено с ${shortDate(item.date)}`:''}">${inner}</a></li>`
      :`<li data-row data-key="${esc(item.key)}" tabindex="-1" class="dsk-plan-chip" data-kind="${item.kind}">${inner}</li>`;
  };
  function render(){
    if(!plan&&!error){host.innerHTML='<div class="dsk-week" aria-busy="true"><div class="iq-skeleton dsk-week-skeleton"></div></div>';return;}
    if(!plan){host.innerHTML=`<div class="dsk-failed" role="alert">${icon('warning',18)}<div><b>«Неделя» не загрузилась</b><p>Сервер плана не ответил.</p></div>${ui.btn('Повторить','secondary sm','refresh','data-retry')}</div>`;return;}
    const today=plan.today,range=plan.days.length>1?`${dayLabel(plan.from,today).replace(/^сегодня$/,shortDate(plan.from))} – ${shortDate(plan.to)}`:`сегодня, ${shortDate(today)}`;
    host.innerHTML=`<div class="dsk-week-head">
        <div class="iq-segmented" role="group" aria-label="Горизонт"><button type="button" data-horizon="today" aria-pressed="${horizon==='today'}">Сегодня</button><button type="button" data-horizon="7d" aria-pressed="${horizon==='7d'}">7 дней</button></div>
        <p class="dsk-hint">${esc(range)} · просроченное показано на сегодня · ${esc(plan.timezone)}${plan.timezoneSource==='default'?` <button type="button" class="dsk-more" data-zone>выбрать пояс</button>`:''}</p></div>
      <ul class="dsk-legend" aria-label="Виды времени">${LEGEND.map(([glyph,text])=>`<li>${icon(glyph,14)}${esc(text)}</li>`).join('')}</ul>
      <p class="dsk-hint">Только чтение: перенос — в задаче.</p>
      <div class="dsk-week${plan.days.length===1?' dsk-week-one':''}">${plan.days.map(day=>{
        const d=new Date(day.date+'T12:00:00Z'),weekend=[0,6].includes(d.getUTCDay()),isToday=day.date===today;
        const name=d.toLocaleDateString('ru-RU',{weekday:'short',timeZone:'UTC'});
        return `<section class="dsk-day" id="dsk-week-${day.date}" data-date="${day.date}" data-today="${isToday}" data-weekend="${weekend}" aria-labelledby="dsk-day-${day.date}">
          <h3 id="dsk-day-${day.date}" tabindex="-1">${esc(name[0].toUpperCase()+name.slice(1))} ${d.getUTCDate()}<small>${isToday?'Сегодня':weekend?'выходной':''}</small></h3>
          ${day.items.length?`<ul class="dsk-day-items" data-list aria-label="${esc(d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}))}">${day.items.map(i=>chip(i,today)).join('')}</ul>`
            :'<p class="dsk-day-empty">ничего не запланировано</p>'}</section>`;
      }).join('')}</div>
      <section class="dsk-widget dsk-undated-section" id="undated" aria-labelledby="dsk-undated-h">
        <div class="iq-section-head">${icon('clock',18)}<h2 id="dsk-undated-h" tabindex="-1">Без времени</h2><span class="iq-section-count">${plan.summary.undatedCount}</span>
          <span class="dsk-hint">участвуете, дат нет — это не ошибка</span></div>
        ${plan.undated.length?`<ul class="dsk-changes" data-list>${plan.undated.map(i=>`<li class="dsk-chg" data-row data-key="${esc(i.key)}" data-project="${esc(i.projectId)}" data-task="${esc(i.task.id)}" tabindex="-1">
          <span class="dsk-key">${esc(i.task.displayId)}</span><div class="dsk-chg-copy"><a class="dsk-title" href="${esc(i.canonicalUrl)}" data-open>${esc(i.task.title)}</a>
          <span class="dsk-chg-what">${esc(i.relation==='assigned'?'назначена вам':i.task.owner?.name?`исполняет ${i.task.owner.name}`:'не назначена')}</span></div><span class="dsk-project">${esc(i.projectName)}</span></li>`).join('')}</ul>
          ${plan.summary.undatedTruncated?`<p class="dsk-hint">Показано ${plan.undated.length} из ${plan.summary.undatedCount} ${plural(plan.summary.undatedCount,'задачи','задач','задач')}</p>`:''}`
          :'<p class="dsk-hint">Все задачи, в которых вы участвуете, имеют даты.</p>'}
      </section>`;
    arm(host);
  }
  host.addEventListener('click',event=>{
    const open=event.target.closest('a[data-open]');
    if(open){if(event.metaKey||event.ctrlKey)return;event.preventDefault();const li=open.closest('[data-row]');openTask({projectId:li.dataset.project,taskId:li.dataset.task,key:li.dataset.key});return;}
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.horizon&&button.dataset.horizon!==horizon){horizon=button.dataset.horizon;const url=new URL(location.href);url.searchParams.set('horizon',horizon);url.hash='';history.replaceState(history.state,'',url);void load();announce(horizon==='today'?'Сегодня':'7 дней');}
    else if(button.hasAttribute('data-retry'))void load();
    else if(button.hasAttribute('data-zone')){const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;void savePrefs({timezone:zone}).then(()=>{announce(`Часовой пояс: ${zone}`);return load();});}
  },{signal:events.signal});
  bindKeyboard(host,{signal:events.signal,onOpen:li=>li.querySelector('a[data-open]')?.click(),sections:()=>[...host.querySelectorAll('.dsk-day,#undated')]});
  render();void load();
  void prefs;
  return {reload:load,focusRow:key=>{const li=host.querySelector(`[data-row][data-key="${CSS.escape(key)}"]`);if(li)focusRow(li);return !!li;},destroy(){destroyed=true;events.abort();host.replaceChildren();}};
}
