// Rows of the Workbench (docs/workbench/design-v2.md §11.2–§11.3): a request with its verb, a "Сегодня" item, the
// three lanes of «Текущая работа» (В работе · Жду · Участвую) and a change with its "было → стало". Every row is an
// `li[data-row]` with the task title as its link and every action as its own labelled control; the views wire them.
import {ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {ageLabel,changeLine,changeOf,checkWhen,countLabel,dueWhen,duePresets,moreReasons,neededWhen,planTone,planWhen,PLAN_KINDS,snoozePresets,
  statusLabel,verbOf,CHANGE_GLYPH,localDay} from './model.js';

const person=p=>p&&p.name?{id:p.id,name:p.name}:null;
const key=row=>esc(row.displayId);
const project=row=>esc(row.projectName)+(row.workspaceName?` <small>${esc(row.workspaceName)}</small>`:'');
/** The id of a row's title: the row is named by it (the title is its name for a screen reader, design-v2 §11.3). */
const titleId=key=>'dsk-t-'+String(key).replace(/[^A-Za-z0-9_-]/g,'_');
const title=row=>`<a class="dsk-title" id="${titleId(row.key)}" href="${esc(row.canonicalUrl)}" data-open>${esc(row.title)}</a>`;
const rowAttrs=(row,kind,extra='')=>`class="dsk-${kind}" data-row data-key="${esc(row.key)}" data-project="${esc(row.projectId)}" data-task="${esc(row.taskId)}" tabindex="-1" aria-labelledby="${titleId(row.key)}" ${extra}`;

/** The one "when" fact: a label and a value, a tone only when someone waits; a button when it can be changed here. */
export function whenFact(w,{button='',label=''}={}){
  const tone=w.tone?` data-tone="${w.tone}"`:'',empty=w.empty?' data-empty="true"':'';
  const inner=`${icon(w.icon,14)}${w.label?`<span class="dsk-when-label">${esc(w.label)}</span>`:''}<span class="dsk-when-value">${esc(w.value)}</span>`;
  return button?`<button type="button" class="dsk-when" ${button}${tone}${empty} aria-label="${esc(label||`${w.label} ${w.value}`)}">${inner}${icon('down',12).replace('class="iq-icon"','class="iq-icon dsk-chev"')}</button>`
    :`<span class="dsk-when"${tone}${empty}>${inner}</span>`;
}
const menu=(label,items)=>ui.menu(ui.ib('more',label,'ghost sm','data-row-menu'),items);
/** A verb button with its glyph first ("✓ Проверено"), as the DS buttons put only trailing arrows last. */
const verbButton=(label,glyph,attrs)=>`<button type="button" class="iq-btn secondary sm dsk-verb" ${attrs}>${icon(glyph,16)}<span>${esc(label)}</span></button>`;

/** "Нужно действие": who asks what, the task, "Нужно до" and the verb; the menu opens, snoozes, leaves. */
export function requestRow(row,{wide=false,today=localDay(),parts}={}){
  const verb=verbOf(row),asker=person(row.request?.requestedBy),more=row.secondaryReasons.length;
  const presets=parts.personal?snoozePresets(row.request?.neededBy):[];
  const items=[{label:'Открыть задачу',action:'open',glyph:'upRight'},{label:'Открыть проект',action:'open-project',glyph:'folder'},
    ...(presets.length?[{section:'Отложить до'},...presets.map((p,i)=>({label:p.label,action:`snooze:${i}`,glyph:'clock'}))]:[])];
  return `<li ${rowAttrs(row,'req')}>
    ${ui.personAvatar(asker||{name:'?'},{size:''})}
    <div class="dsk-req-copy">
      <p class="dsk-req-ask"><b>${esc(asker?.name||'Участник проекта')}</b> ${esc(verb.asks)}<span class="dsk-age">${esc(ageLabel(row.request?.createdAt))}</span></p>
      <div class="dsk-req-task">${title(row)}<span class="dsk-key">${key(row)}</span>${wide?'':`<span class="dsk-project">${project(row)}</span>`}
        ${more?`<button type="button" class="dsk-more" data-reasons aria-expanded="false">${esc(moreReasons(more))}${icon('down',12)}</button>`:''}</div>
      ${more?`<ul class="dsk-reasons" hidden>${row.secondaryReasons.map(r=>`<li>${esc(r.text)}</li>`).join('')}</ul>`:''}
    </div>
    ${wide?`<span class="dsk-project">${project(row)}</span>`:''}
    ${whenFact(neededWhen(row,today))}
    <div class="dsk-req-actions">${verbButton(verb.label,verb.icon,`data-verb aria-label="${esc(verb.label)}: ${key(row)}" aria-keyshortcuts="E"`)}${menu(`Действия: ${row.displayId}`,items)}</div>
  </li>`;
}

/** "Сегодня": the kind of time in words, the task, and when (was, today, an interval). */
export function todayRow(item,{today}){
  const kind=PLAN_KINDS[item.kind]||PLAN_KINDS.due,tone=planTone(item);
  const name=item.task?item.task.title:item.milestone?.title||'';
  const link=item.canonicalUrl?`<a class="dsk-title" href="${esc(item.canonicalUrl)}" data-open>${esc(name)}</a>`:`<span class="dsk-title">${esc(name)}</span>`;
  return `<li class="dsk-today-row" data-row data-key="${esc(item.key)}" ${item.task?`data-project="${esc(item.projectId)}" data-task="${esc(item.task.id)}"`:''} tabindex="-1"${tone?` data-tone="${tone}"`:''}>
    <span class="dsk-kind">${icon(kind.icon,14)}${esc(kind.label)}</span>
    <div class="dsk-item-copy">${link}<p class="dsk-meta">${item.task?`<span class="dsk-key">${esc(item.task.displayId)}</span> · `:''}${esc(item.projectName)}</p></div>
    <span class="dsk-age">${esc(planWhen(item,today))}</span>
  </li>`;
}

/** The strip of seven days with their numbers of items; a day leads to the week view. */
export function dayStrip(plan){
  return `<div class="dsk-days" role="list" aria-label="Семь дней">${plan.days.map((day,i)=>{
    const d=new Date(day.date+'T12:00:00Z'),n=day.items.length,over=day.items.some(item=>item.overdue);
    const name=d.toLocaleDateString('ru-RU',{weekday:'short',timeZone:'UTC'});
    return `<a role="listitem" href="/workbench/plan?horizon=7d#${day.date}" data-day="${day.date}" data-today="${i===0}" data-weekend="${[0,6].includes(d.getUTCDay())}"
      aria-label="${esc(d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}))}: ${n?`${n} ${n===1?'пункт':n<5?'пункта':'пунктов'}`:'ничего'}">
      <small>${esc(name[0].toUpperCase()+name.slice(1))}</small><b>${d.getUTCDate()}</b><span class="dsk-daycount" data-zero="${!n}"${over?' data-tone="danger"':''}>${n||'–'}</span></a>`;
  }).join('')}</div>`;
}

const rowMenu=(row,parts,extra=[])=>menu(`Действия: ${row.displayId}`,[{label:'Открыть задачу',action:'open',glyph:'upRight'},...extra,
  ...(parts.personal&&row.personal.participating?[{label:'Перестать участвовать',action:'leave',glyph:'users'}]:[]),
  {label:'Открыть проект',action:'open-project',glyph:'folder'}]);
const newsNote=row=>row.updates?` · <span class="dsk-news">${esc(countLabel(row.updates.count))} ${row.updates.count===1?'изменение':'изм.'}</span>`:'';

/** «В работе»: the done check with the workflow's verb, the task, "Срок ▾", the menu. */
export function activeItem(row,{wide=false,today=localDay(),parts}={}){
  const move=row.active?.transition,cannot=row.active?.cannotComplete;
  const detail=cannot?.reason==='blocked'?cannot.text.replace(/^З/,'з'):statusLabel(row.status).toLowerCase();
  const check=`<button type="button" class="dsk-check" data-complete ${cannot?`disabled title="${esc(cannot.text)}"`:''}
    aria-label="${esc(move?.label||'Готово')}: ${key(row)}${cannot?`. ${esc(cannot.text)}`:''}" aria-keyshortcuts="D">${icon('check',14)}</button>`;
  const due=dueWhen(row,today),presets=duePresets(today);
  const dueControl=row.canEditDue?ui.menu(whenFact(due,{button:'data-due',label:`Срок ${row.displayId}: ${due.value}. Перенести`}),
    [...presets.map((p,i)=>({label:p.label,action:`due:${i}`,glyph:'calendar'})),{label:'Выбрать дату…',action:'due:pick',glyph:'calendar'},{label:'Без срока',action:'due:none',glyph:'x'}]):whenFact(due);
  return `<li ${rowAttrs(row,'item','data-group="active"')} data-transition="${esc(move?.label||'')}">
    ${check}
    <div class="dsk-item-copy">${title(row)}<p class="dsk-meta"><span class="dsk-key">${key(row)}</span>${wide?'':` · ${project(row)}`} · ${esc(detail)}${newsNote(row)}</p></div>
    ${wide?`<span class="dsk-project">${project(row)}</span>`:''}
    ${dueControl}
    <div class="dsk-item-tail">${rowMenu(row,parts)}</div>
  </li>`;
}

/** What happened to delegated work, in words: done, reassigned, owner removed, a new blocker, or the latest news. */
function waitingState(row){
  const w=row.waiting;
  if(w.done)return `работа завершена${w.doneAt?' '+ageLabel(w.doneAt):''}`;
  if(w.expectedAssigneeLeft&&(!w.ownerNow||w.ownerNow.id===row.owner?.id)&&!w.ownerNow?.name)return 'исполнитель больше не в проекте';
  if(!w.ownerNow)return 'исполнитель снят';
  if(w.expectedAssignee&&w.ownerNow.id!==w.expectedAssignee.id)return `сейчас исполняет ${w.ownerNow.name||'бывший участник'}`;
  if(row.updates?.latest)return changeLine(row.updates.latest);
  return statusLabel(row.status).toLowerCase();
}
/** «Жду»: the face of whom I assigned it to, what happened, "Проверить ▾" or «Принять» when done. */
export function waitingItem(row,{wide=false,today=localDay(),parts}={}){
  const w=row.waiting,face=person(w.expectedAssignee)||person(w.ownerNow);
  const lead=face?ui.personAvatar(face,{size:'sm'}):`<span class="dsk-item-glyph">${icon('user',14)}</span>`;
  const check=checkWhen(row,today),presets=duePresets(today);
  const tail=w.done&&parts.waiting?verbButton('Принять','check',`data-accept aria-label="Принять результат: ${key(row)}" aria-keyshortcuts="E"`)
    :parts.waiting?ui.menu(whenFact(check,{button:'data-check-back',label:`Проверить ${row.displayId}: ${check.value}. Изменить дату`}),
      [{label:'Сегодня',action:'check:today',glyph:'calendar'},...presets.map((p,i)=>({label:p.label,action:`check:${i}`,glyph:'calendar'})),
        {label:'Выбрать дату…',action:'check:pick',glyph:'calendar'},{label:'Без даты проверки',action:'check:none',glyph:'x'}]):whenFact(check);
  return `<li ${rowAttrs(row,'item','data-group="waiting"')}>
    <span class="dsk-item-lead">${lead}</span>
    <div class="dsk-item-copy">${title(row)}<p class="dsk-meta">${face?`<b>${esc(face.name)}</b> · `:''}${esc(waitingState(row))}${wide?'':` · ${key(row)}`}</p></div>
    ${wide?`<span class="dsk-project">${project(row)}</span>`:''}
    ${tail}
    <div class="dsk-item-tail">${rowMenu(row,parts)}</div>
  </li>`;
}

/** «Участвую»: my order number, the task, its owner, "Срок", ↑ ↓ with the position announced. */
export function joinedItem(row,{index,total,wide=false,today=localDay(),parts}={}){
  const owner=row.owner?.name?`исполняет ${row.owner.name}`:'не назначена';
  const up=index===0,down=index===total-1;
  const rank=parts.personal?`${ui.ib('arrowUp',`Выше: ${row.displayId}, позиция ${index+1} из ${total}`,'ghost sm',`data-rank="up" ${up?'disabled':''} aria-keyshortcuts="Meta+ArrowUp"`)}${
    ui.ib('arrowUp',`Ниже: ${row.displayId}, позиция ${index+1} из ${total}`,'ghost sm dsk-down',`data-rank="down" ${down?'disabled':''} aria-keyshortcuts="Meta+ArrowDown"`)}`:'';
  return `<li ${rowAttrs(row,'item','data-group="joined"')}>
    <span class="dsk-item-lead"><span class="dsk-rankno" aria-hidden="true">${index+1}</span></span>
    <div class="dsk-item-copy">${title(row)}<p class="dsk-meta"><span class="dsk-key">${key(row)}</span>${wide?'':` · ${project(row)}`} · ${esc(owner)}${newsNote(row)}</p></div>
    ${wide?`<span class="dsk-project">${project(row)}</span>`:''}
    ${whenFact(dueWhen(row,today))}
    <div class="dsk-item-tail">${rank}${rowMenu(row,parts)}</div>
  </li>`;
}

/** «Изменилось»: the glyph of the kind, the task, what changed ("было → стало"), "+N ещё", the age, «Просмотрено». */
export function changeRow(row,{wide=false}={}){
  const latest=row.updates?.latest,change=changeOf(latest,row.primaryReason.text.replace(/^[^:]+:\s*/,''));
  const diff=change.from||change.to?` <span class="dsk-diff">${change.from?`<s>${esc(change.from)}</s>${icon('arrow',12)}`:''}${change.to?esc(change.to):''}</span>`:'';
  const extra=(row.updates?.count||1)-1;
  return `<li ${rowAttrs(row,'chg')}>
    <span class="dsk-chg-glyph" aria-hidden="true">${icon(CHANGE_GLYPH[latest?.kind]||'dot',14)}</span>
    <div class="dsk-chg-copy">${title(row)}<span class="dsk-key">${key(row)}</span>${wide?'':`<span class="dsk-project">${project(row)}</span>`}
      <span class="dsk-chg-what">${esc(change.text)}${diff}</span>${extra>0?`<span class="dsk-chg-more">+${esc(countLabel(extra))} ещё</span>`:''}</div>
    ${wide?`<span class="dsk-project">${project(row)}</span>`:''}
    <span class="dsk-age">${esc(ageLabel(row.updates?.latestAt))}</span>
    ${ui.ib('eye','Просмотрено: '+row.displayId,'ghost sm','data-seen aria-keyshortcuts="S"')}
  </li>`;
}

/** A calm empty state inside a section: the structure stays in place. */
export const emptyRow=(title,body)=>`<li class="dsk-empty-row"><span class="dsk-empty-glyph">${icon('checkCircle',16)}</span><div><b>${esc(title)}</b><p>${esc(body)}</p></div></li>`;
/** Skeleton lines of a loading section: geometry reserved, nothing announced but aria-busy. */
export const skeletonRows=(n=3)=>Array.from({length:n},()=>`<li class="dsk-skeleton-row" aria-hidden="true"><span class="iq-skeleton dsk-skeleton-dot"></span><span class="iq-skeleton iq-skeleton-line"></span><span class="iq-skeleton iq-skeleton-line dsk-short"></span></li>`).join('');
/** A section that failed on its own: one local retry; the others stay current. */
export const failedRow=(what,at)=>`<li class="dsk-failed" role="alert"><span class="dsk-failed-glyph">${icon('warning',18)}</span><div><b>${esc(what)} не загрузилось</b><p>Сервер не ответил.${at?` Остальные разделы актуальны на ${esc(at)}.`:''}</p></div>${ui.btn('Повторить','secondary sm','refresh','data-retry')}</li>`;
