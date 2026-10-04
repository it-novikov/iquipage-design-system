import {ui,icon,escapeHTML as esc,statusGlyph} from '@iquipage/web/core';
import {arrange,dividerLabel,cells,asideOf,whenLabel,summaryParts,plural} from './containers-model.js';

/*
 * Markup of the planning page: cards with the head inside (name, dates, goal, one sum), tree rows in the DS language
 * (iq-tree columns, status glyphs in board tones, epics with the «stack» glyph) and the quiet links under the stack.
 */
const PRIORITY_TONES=new Set(['critical','high']);

export function pageMarkup(){
  return `<section class="pl-page" aria-labelledby="pl-title"><div class="iq-workspace-page">
    <header class="sq-page-heading"><h1 id="pl-title">Планирование</h1><div class="sq-page-tools" data-create-controls></div></header>
    <div data-error role="alert" hidden></div>
    <div class="iq-workspace"><nav class="iq-workspace-nav" aria-label="Разделы плана" data-plan-nav></nav><div class="iq-workspace-body">
      <div class="iq-workspace-toolbar"><label class="iq-workspace-search">${icon('search',16)}<input type="search" data-plan-search placeholder="Найти задачу или эпик" aria-label="Поиск по названию или ключу задачи"></label><span class="pl-readonly" data-readonly hidden>Только просмотр</span><p class="iq-workspace-caption" data-plan-count></p></div>
      <div class="pl-stack" data-stack></div><footer class="pl-foot" data-foot></footer>
    </div></div>
  </div><div class="pl-selbar" data-selbar role="region" aria-label="Выделенные задачи" hidden></div><p class="sr-only" role="status" aria-live="polite" data-live></p></section>`;
}

export function navigationMarkup(containers,selected){
  const sections=[['В работе',c=>c.kind==='sprint'&&c.state==='active'],['Следующие спринты',c=>c.kind==='sprint'&&c.state!=='active'],['Релизы',c=>c.kind==='release'],['Без спринта и релиза',c=>c.kind==='backlog']];
  return `<button type="button" data-plan-scope="all" ${selected==='all'?'aria-current="true"':''}>${icon('layers',16)}<span class="iq-workspace-nav-label">Весь план</span></button>`+sections.map(([label,test])=>{
    const items=containers.filter(test);if(!items.length)return '';
    return `<p class="iq-workspace-nav-group">${label}</p>`+items.map(c=>`<button type="button" data-plan-scope="${esc(c.id)}" ${selected===c.id?'aria-current="true"':''}><span class="iq-workspace-nav-label">${esc(c.name)}<span class="iq-workspace-nav-note">${c.kind==='backlog'?'Задачи на будущее':c.state==='active'?'Текущая итерация':c.kind==='release'?'Результат к дате':'Подготовка'}</span></span><span class="iq-workspace-nav-count">${c.summary.total}</span></button>`).join('');
  }).join('');
}

export function firstRunMarkup(capabilities){
  const actions=capabilities.manageReleases?`<div class="pl-first-actions">${ui.btn('Создать спринт','primary sm','','data-new-sprint')}${ui.btn('Создать релиз','secondary sm','','data-new-release')}</div>`:'';
  return `<section class="pl-first" aria-label="Спринтов и релизов пока нет"><h2>Спринтов и релизов пока нет</h2><p>Спринт — две недели с целью. Релиз — набор задач к дате. Задачи и эпики из бэклога перетаскиваются в них.</p>${actions}</section>`;
}

export function footMarkup({completed}){
  return completed.count?`<button type="button" class="iq-btn ghost sm" data-completed>${icon('clock',16)}<span>Завершённые спринты · ${completed.count}</span></button>`:'';
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
  const more=editable?`<button type="button" class="iq-btn ghost sm icon" data-more="${esc(c.id)}" aria-label="Действия: ${esc(c.name)}" aria-haspopup="menu">${icon('more',16)}</button>`:'';
  const state=c.kind==='backlog'?'Задачи на будущее':c.kind==='release'?'Релиз':c.state==='active'?'Спринт · в работе':'Спринт · запланирован';
  const collapsed=view.collapsed?.has(c.id)&&!view.query;
  const goal=c.goal?`<p class="iq-plan-goal">${esc(c.goal)}</p>`:'';
  const progress=c.kind==='sprint'&&c.state==='active'&&c.summary.total?`<progress class="iq-plan-progress" value="${c.summary.done}" max="${c.summary.total}" aria-label="Готово ${c.summary.done} из ${c.summary.total}"></progress>`:'';
  return `<header class="iq-plan-header"><div><div class="iq-plan-meta"><span class="iq-plan-state">${icon(c.kind==='backlog'?'list':c.kind==='release'?'flag':'calendar',14)}${state}</span></div><div class="iq-plan-title"><button type="button" class="iq-btn ghost sm icon iq-plan-collapse" data-collapse="${esc(c.id)}" aria-expanded="${!collapsed}" aria-controls="pl-body-${esc(c.id)}" aria-label="Состав: ${esc(c.name)}">${icon('down',16)}</button><h2>${esc(c.name)}</h2></div>${goal}</div>
    <div class="iq-plan-actions">${action}${more}</div></header>
    <div class="iq-plan-summary"><span>${when?editable?`<button type="button" class="tree-cell-button is-editable" data-dates="${esc(c.id)}" aria-label="Изменить даты: ${esc(c.name)}">${icon('calendar',14)} ${esc(when)}</button>`:esc(when):c.kind==='backlog'?'Выберите задачи и перенесите в нужный этап':'Даты не заданы'}</span><span class="pl-sum" data-sum>${sum}</span>${progress}</div>`;
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
  const glyph=epic?icon('stack',16):statusGlyph(row.status);
  const check=`<button type="button" class="tree-checkbox${selected?' true':''}" data-select="${esc(row.id)}" role="checkbox" aria-checked="${selected}" aria-label="Выбрать: ${esc(row.title)}">${selected?icon('check',13):''}</button>`;
  const iconSlot=`${capabilities.plan?check:''}<span class="tree-node-icon">${glyph}</span>`;
  const disclosure=`<span class="tree-disclosure"${epic?` data-toggle="${esc(row.id)}" aria-hidden="true"`:''}>${epic?icon('chevron',15):''}</span>`;
  const aside=epic?asideOf(row):'';
  const label=`<span class="tree-node-label">${row.crumb?`<span class="tree-node-crumb">${esc(row.crumb)} / </span>`:''}<span class="iq-plan-key">${esc(row.key)}</span><span class="pl-title" data-open="${esc(row.id)}">${esc(row.title)}</span>${aside?`<span class="tree-node-aside">ещё ${esc(aside)}</span>`:''}</span>`;
  const edit=capabilities.plan&&!epic;
  const due=value.due?`<span class="${value.dueWarning?'pl-warning':''}">${esc(value.due)}</span>`:'';
  const dueCell=edit||epic&&capabilities.plan?`<button type="button" class="tree-cell-button is-editable" data-edit-due="${esc(row.id)}" aria-label="Срок: ${esc(value.due||'не задан')}">${due||'<span class="iq-plan-placeholder">Дата</span>'}</button>`:due;
  const estimateCell=edit&&c.kind!=='release'?`<button type="button" class="tree-cell-button is-editable${value.estimateMismatch?' pl-mismatch':''}" data-edit-estimate="${esc(row.id)}" aria-label="Оценка: ${esc(value.estimate||'не задана')}"${value.estimateMismatch?' title="В другом формате: в суммы не входит"':''}>${esc(value.estimate)||'<span class="iq-plan-placeholder">Оценка</span>'}</button>`:esc(value.estimate);
  const classes=['tree-row','has-columns',epic?'is-branch':'',muted?'is-muted':'',selected?'is-selected':''].filter(Boolean).join(' ');
  const statusName=epic?'Эпик':({ready:'Готово к работе',in_progress:'В работе',review:'Ревью',ready_for_testing:'Готово к тестированию',testing:'Тестирование',ready_for_release:'Готово к релизу'})[row.status]||'';
  return `<div class="${classes}" role="treeitem" aria-level="${row.depth+1}"${epic?` aria-expanded="${open}"`:''}${capabilities.plan?` aria-selected="${selected}"`:''} aria-label="${esc(`${row.key} ${row.title}. ${statusName}`)}" tabindex="${focusId===row.id?0:-1}" data-row="${esc(row.id)}" data-container="${esc(c.id)}"${capabilities.plan?` data-tree-drag="${esc(row.id)}"`:''}${tone} style="--tree-level:${row.depth}">
    <span class="tree-row-main">${disclosure}${iconSlot}${label}</span>
    <span class="tree-cell" data-label="Статус">${esc(value.state||statusName)}</span>
    <span class="tree-cell" data-label="Кто">${esc(value.owner||'—')}</span>
    <span class="tree-cell is-end">${dueCell}</span>
    <span class="tree-cell is-end">${estimateCell}</span>
    <button type="button" class="iq-btn ghost sm icon" data-row-more="${esc(row.id)}" aria-label="Действия задачи ${esc(row.key)}" aria-haspopup="menu">${icon('more',16)}</button>
  </div>`;
}

function emptyMarkup(c,view){
  if(c.kind==='backlog')return '<p class="pl-empty">Бэклог пуст. Новые задачи появятся здесь.</p>';
  const where=c.kind==='sprint'?'сюда':'в этот релиз';
  return view.capabilities.plan?`<div class="pl-drop-empty">Добавьте новую задачу или выберите задачи в бэклоге и нажмите «Переместить в…»</div>`:'<p class="pl-empty">Пока пусто.</p>';
}

export function cardMarkup(c,view){
  const items=c.rows.length?arrange(c,view):[];
  const rows=items.map(item=>item.type==='divider'?`<div class="tree-divider" role="separator" aria-label="${esc(dividerLabel(item,view.format).replaceAll(' · ',', '))}"><span>${esc(dividerLabel(item,view.format))}</span></div>`:rowMarkup(item.row,c,view,item.muted)).join('');
  const columns=`<div class="iq-plan-columns" aria-hidden="true"><span>Задача</span><span>Статус</span><span>Исполнитель</span><span class="is-end">Срок</span><span class="is-end">Оценка</span><span></span></div>`;
  const body=c.rows.length?`${columns}<div class="pl-rows" role="tree" aria-label="${esc(c.name)}"${view.capabilities.plan?' aria-multiselectable="true"':''}>${rows}</div>`:emptyMarkup(c,view);
  const add=view.capabilities.plan?`<button type="button" class="iq-plan-add" data-add="${esc(c.id)}">${icon('plus',16)}<span>Добавить задачу</span></button>`:'';
  const collapsed=view.collapsed?.has(c.id)&&!view.query;
  return `<section class="iq-plan-panel tree-columns" data-layout="workspace" data-active="${c.state==='active'}" data-card="${esc(c.id)}" data-kind="${c.kind}" data-state="${c.state}" aria-label="${esc(c.name)}"${view.capabilities.plan&&!collapsed?` data-tree-dropzone="${esc(c.id)}"`:''}>${headMarkup(c,view)}<div id="pl-body-${esc(c.id)}" ${collapsed?'hidden':''}>${body}${add}</div></section>`;
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
