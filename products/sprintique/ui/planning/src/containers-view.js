import {ui,icon,escapeHTML as esc,statusGlyph} from '@iquipage/web/core';
import {arrange,dividerLabel,cells,asideOf,whenLabel,summaryParts,plural} from './containers-model.js';

/*
 * Markup of the planning page: cards with the head inside (name, dates, goal, one sum), tree rows in the DS language
 * (iq-tree columns, status glyphs in board tones, epics with the «stack» glyph) and the quiet links under the stack.
 */
const PRIORITY_TONES=new Set(['critical','high']);

export function pageMarkup(){
  return `<section class="pl-page" aria-labelledby="pl-title"><div class="pl-inner">
    <header class="pl-head"><h1 id="pl-title">Планирование</h1><span class="pl-readonly" data-readonly hidden>Только просмотр</span></header>
    <div data-error role="alert" hidden></div>
    <div class="pl-stack" data-stack></div>
    <footer class="pl-foot" data-foot></footer>
  </div><div class="pl-selbar" data-selbar role="region" aria-label="Выделенные задачи" hidden></div><p class="sr-only" role="status" aria-live="polite" data-live></p></section>`;
}

export function firstRunMarkup(capabilities){
  const actions=capabilities.manageReleases?`<div class="pl-first-actions">${ui.btn('Создать спринт','primary sm','','data-new-sprint')}${ui.btn('Создать релиз','secondary sm','','data-new-release')}</div>`:'';
  return `<section class="pl-first" aria-label="Спринтов и релизов пока нет"><h2>Спринтов и релизов пока нет</h2><p>Спринт — две недели с целью. Релиз — набор задач к дате. Задачи и эпики из бэклога перетаскиваются в них.</p>${actions}</section>`;
}

export function footMarkup({capabilities,completed,firstRun}){
  const links=capabilities.manageReleases&&!firstRun?`<button type="button" class="pl-link" data-new-sprint>${icon('plus',14)}<span>Спринт</span></button><button type="button" class="pl-link" data-new-release>${icon('plus',14)}<span>Релиз</span></button>`:'';
  const done=completed.count?`<button type="button" class="pl-link pl-link-end" data-completed><span>Завершённые спринты · ${completed.count}</span>${icon('chevron',14)}</button>`:'';
  return links||done?`${links}<span class="pl-foot-gap"></span>${done}`:'';
}

/** The head of a card: name and dates, the goal below, one sum and at most one button on the right, «···» on hover. */
function headMarkup(c,view){
  const {capabilities,format,today,activeExists}=view;
  const when=whenLabel(c,today);
  const editable=capabilities.manageReleases&&c.kind!=='backlog';
  const sum=sumMarkup(c,format);
  let action='';
  if(c.kind==='sprint'&&c.state==='active'&&capabilities.completeSprint)action=ui.btn('Завершить спринт','secondary sm','',`data-complete="${esc(c.id)}"`);
  else if(c.kind==='sprint'&&c.state==='planned'&&!activeExists&&view.firstPlanned===c.id&&capabilities.manageReleases)action=ui.btn('Начать спринт','secondary sm','',`data-start="${esc(c.id)}"`);
  const more=editable?`<button type="button" class="iq-btn ghost sm icon pl-more" data-more="${esc(c.id)}" aria-label="Действия: ${esc(c.name)}" aria-haspopup="menu">${icon('more',16)}</button>`:'';
  const goal=c.kind==='backlog'?'':c.goal?`<p class="pl-goal">Цель — ${esc(c.goal)}</p>`:editable?'<p class="pl-goal is-empty">Цель не задана</p>':'';
  return `<header class="pl-card-head"><div class="pl-card-title"><h2 class="pl-card-name">${esc(c.name)}</h2>${when?`<span class="pl-when">${editable?`<button type="button" class="pl-when-button" data-dates="${esc(c.id)}" aria-label="Изменить даты: ${esc(c.name)}">${esc(when)}</button>`:esc(when)}</span>`:''}</div>
    <div class="pl-card-side"><span class="pl-sum" data-sum>${sum}</span>${action}${more}</div>${goal}</header>`;
}
/** The one sum of a head; during a drag the target's sum is shown as if the block were already there. */
export function sumMarkup(c,format){
  return summaryParts(c,format).map(part=>part.warning?`<span class="pl-sum-warning">${esc(part.warning)}</span>`:`<span><b>${esc(part.strong)}</b>${esc(part.text)}</span>`).join('');
}

function rowMarkup(row,c,view,muted){
  const {selection,expanded,capabilities,format,today,focusId}=view;
  const epic=row.kind==='epic',open=epic&&expanded(row.id),selected=selection.has(row.id);
  const tone=!muted&&PRIORITY_TONES.has(row.priority)?` data-tone="${row.priority}"`:'';
  const value=cells(row,c,format,today);
  const choosing=capabilities.plan&&c.rows.some(item=>selection.has(item.id));
  const glyph=epic?icon('stack',16):statusGlyph(row.status);
  const check=`<span class="tree-checkbox pl-check${selected?' true':''}" data-select="${esc(row.id)}" role="checkbox" aria-checked="${selected}" aria-label="Выбрать: ${esc(row.title)}">${selected?icon('check',13):''}</span>`;
  const iconSlot=capabilities.plan?`<span class="tree-node-icon pl-slot${choosing?' is-choosing':''}"><span class="pl-glyph">${glyph}</span>${check}</span>`:`<span class="tree-node-icon">${glyph}</span>`;
  const disclosure=`<span class="tree-disclosure"${epic?` data-toggle="${esc(row.id)}" aria-hidden="true"`:''}>${epic?icon('chevron',15):''}</span>`;
  const aside=epic?asideOf(row):'';
  const label=`<span class="tree-node-label">${row.crumb?`<span class="tree-node-crumb">${esc(row.crumb)} / </span>`:''}<span class="pl-title" data-open="${esc(row.id)}">${esc(row.title)}</span>${aside?`<span class="tree-node-aside">ещё ${esc(aside)}</span>`:''}</span>`;
  const edit=capabilities.plan&&!epic;
  const due=value.due?`<span class="${value.dueWarning?'pl-warning':''}">${esc(value.due)}</span>`:'';
  const dueCell=edit||epic&&capabilities.plan?`<button type="button" class="tree-cell-button is-editable" data-edit-due="${esc(row.id)}" aria-label="Срок: ${esc(value.due||'не задан')}">${due||'<span class="pl-empty-value"></span>'}</button>`:due;
  const estimateCell=edit&&c.kind!=='release'?`<button type="button" class="tree-cell-button is-editable${value.estimateMismatch?' pl-mismatch':''}" data-edit-estimate="${esc(row.id)}" aria-label="Оценка: ${esc(value.estimate||'не задана')}"${value.estimateMismatch?' title="В другом формате: в суммы не входит"':''}>${esc(value.estimate)||'<span class="pl-empty-value"></span>'}</button>`:esc(value.estimate);
  const classes=['tree-row','has-columns',epic?'is-branch':'',muted?'is-muted':'',selected?'is-selected':''].filter(Boolean).join(' ');
  const statusName=epic?'Эпик':({ready:'Готово к работе',in_progress:'В работе',review:'Ревью',ready_for_testing:'Готово к тестированию',testing:'Тестирование',ready_for_release:'Готово к релизу'})[row.status]||'';
  return `<div class="${classes}" role="treeitem" aria-level="${row.depth+1}"${epic?` aria-expanded="${open}"`:''}${capabilities.plan?` aria-selected="${selected}"`:''} aria-label="${esc(`${row.key} ${row.title}. ${statusName}`)}" tabindex="${focusId===row.id?0:-1}" data-row="${esc(row.id)}" data-container="${esc(c.id)}"${capabilities.plan?` data-tree-drag="${esc(row.id)}"`:''}${tone} style="--tree-level:${row.depth}">
    <span class="tree-row-main">${disclosure}${iconSlot}${label}</span>
    <span class="tree-cell${value.state&&!epic?' pl-word':''}">${esc(value.state)}</span>
    <span class="tree-cell">${esc(value.owner)}</span>
    <span class="tree-cell is-end">${dueCell}</span>
    <span class="tree-cell is-end">${estimateCell}</span>
  </div>`;
}

function emptyMarkup(c,view){
  if(c.kind==='backlog')return '<p class="pl-empty">Бэклог пуст. Новые задачи появятся здесь.</p>';
  const where=c.kind==='sprint'?'сюда':'в этот релиз';
  return view.capabilities.plan?`<div class="pl-drop-empty">Перетащите ${where} задачи или эпики из бэклога — или добавьте новую</div>`:'<p class="pl-empty">Пока пусто.</p>';
}

export function cardMarkup(c,view){
  const items=c.rows.length?arrange(c,view):[];
  const rows=items.map(item=>item.type==='divider'?`<div class="tree-divider" role="separator" aria-label="${esc(dividerLabel(item,view.format).replaceAll(' · ',', '))}"><span>${esc(dividerLabel(item,view.format))}</span></div>`:rowMarkup(item.row,c,view,item.muted)).join('');
  const body=c.rows.length?`<div class="pl-rows" role="tree" aria-label="${esc(c.name)}"${view.capabilities.plan?' aria-multiselectable="true"':''}>${rows}</div>`:emptyMarkup(c,view);
  const add=view.capabilities.plan?`<button type="button" class="pl-add" data-add="${esc(c.id)}">${icon('plus',14)}<span>Задача</span></button>`:'';
  return `<section class="pl-card tree-columns" data-card="${esc(c.id)}" data-kind="${c.kind}" data-state="${c.state}" aria-label="${esc(c.name)}"${view.capabilities.plan?` data-tree-dropzone="${esc(c.id)}"`:''}>${headMarkup(c,view)}${body}${add}</section>`;
}

export function selectionMarkup(count,sum){
  return `<b>${count} ${plural(count,'задача','задачи','задач')}${sum?` · ${esc(sum)}`:''}</b>
    <button type="button" class="iq-btn secondary sm" data-move-selection aria-haspopup="menu"><span>Переместить в…</span>${icon('down',14)}</button>
    <button type="button" class="iq-btn ghost sm icon" data-clear-selection aria-label="Снять выделение">${icon('x',16)}</button>`;
}

/**
 * The ghost of a drag: an opaque raised card with only the glyph and the title of each row (an epic with the subtasks
 * that go along, or the selection) and a chip saying what moves. No owner, date or estimate columns.
 */
export function dragPreview(rows,c,view,badge){
  const items=rows.map(row=>{
    const epic=row.kind==='epic',glyph=epic?icon('stack',16):statusGlyph(row.status);
    const tone=PRIORITY_TONES.has(row.priority)&&!row.done?` data-tone="${row.priority}"`:'';
    return `<div class="pl-ghost-row${epic?' is-branch':''}${row.depth>0?' is-child':''}"${tone} style="--tree-level:${row.depth}"><span class="pl-ghost-icon">${glyph}</span><span class="pl-ghost-title">${esc(row.title)}</span></div>`;
  }).join('');
  return {html:`<div class="pl-ghost">${items}</div>`,badge,fit:true};
}
