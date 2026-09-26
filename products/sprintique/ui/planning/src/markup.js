import {ui,icon,escapeHTML as esc,taskEmphasis} from '@iquipage/web/core';
export {ui,icon,esc};
import {loadingMarkup} from '../../src/loading.js';
const plural=(n,one,few,many)=>{const d=n%10,h=n%100;return d===1&&h!==11?one:d>=2&&d<=4&&(h<12||h>14)?few:many;};
const subtaskLabel=n=>`${n} ${plural(n,'подзадача','подзадачи','подзадач')}`;
/** Rows that end a run of siblings: their tree line stops at the elbow instead of continuing down. */
const lastCache=new WeakMap();
export function lastChildren(rows){
  let set=lastCache.get(rows);if(set)return set;set=new Set();
  rows.forEach((row,i)=>{if(row.depth>0&&!(rows.slice(i+1).find(next=>next.depth<=row.depth)?.depth===row.depth))set.add(row.id);});
  lastCache.set(rows,set);return set;
}
export function rowMarkup(row,groupId,collapsed,canDrag=false,canEdit=false,last=new Set()) {
  const disabled=!row.selectable||row.contextOnly;
  const disclosure=row.childrenCount?ui.ib(collapsed?'chevron':'down',`${collapsed?'Показать':'Скрыть'} подзадачи ${row.key}`,'ghost sm',`data-disclose="${esc(row.taskId)}" data-focus="disclose:${esc(row.id)}" aria-expanded="${!collapsed}"`):'<span class="pn-disclosure-space" aria-hidden="true"></span>';
  return `<tr data-work-row="${esc(row.taskId)}" data-row="${esc(row.id)}" data-task="${esc(row.taskId)}" data-context="${row.contextOnly}" data-task-emphasis="${taskEmphasis({type:row.type,priority:row.priority})}" data-depth="${Math.min(row.depth,4)}">
    <td><div class="pn-row-identity">${canDrag&&!disabled?ui.ib('grip','Переместить '+row.key,'ghost sm',`data-work-drag="${esc(row.taskId)}" data-focus="drag:${esc(row.id)}" aria-pressed="false"`):''}${disabled?'<span class="pn-check-space"></span>':ui.check('',false,`data-select="${esc(row.taskId)}" data-focus="select:${esc(row.id)}" aria-label="Выбрать ${esc(row.key)}"`)}${row.depth?`<span class="pn-tree" data-depth="${Math.min(row.depth,4)}" data-last="${last.has(row.id)}" aria-hidden="true"></span>`:''}${disclosure}<span class="iq-work-list-id">${esc(row.key)}</span><div class="iq-work-list-title">${row.contextOnly?`<span>${esc(row.title)}</span>`:`<button type="button" class="iq-btn ghost sm pn-task-title" data-open="${esc(row.taskId)}" data-focus="open:${esc(row.id)}">${esc(row.title)}</button>`}${row.childrenCount?`<span class="pn-subtasks-count">${subtaskLabel(row.childrenCount)}</span>`:''}${row.parentContext?`<small class="iq-helper">${esc(row.parentContext)}</small>`:''}</div>${['high','critical'].includes(row.priority)?`<span class="pn-priority-mark" data-level="${row.priority}" role="img" aria-label="${row.priority==='critical'?'Критический':'Высокий'} приоритет" title="${row.priority==='critical'?'Критический':'Высокий'} приоритет">${icon('flag',14)}</span>`:''}</div></td>
    <td data-column="status">${ui.badge(row.preparation==='draft'?'Черновик':row.statusLabel,'outline')}</td>
    <td data-column="person"><button type="button" class="iq-btn ghost sm pn-person" data-quick-edit="owner" data-focus="owner:${esc(row.id)}" data-field-task="${esc(row.taskId)}" aria-label="Исполнитель ${esc(row.key)}" ${!canEdit||disabled||row.ownerId===undefined?'disabled':''}>${row.ownerLabel?ui.avatar(esc(row.ownerLabel.split(/\s+/).slice(0,2).map(x=>[...x][0]).join('')),1):''}<span>${esc(row.ownerLabel||'Не назначен')}</span></button></td>
    <td data-column="date"><button type="button" class="iq-btn ghost sm pn-date" data-quick-edit="due" data-focus="due:${esc(row.id)}" data-field-task="${esc(row.taskId)}" aria-label="Срок ${esc(row.key)}" ${!canEdit||disabled||row.dueValue===undefined?'disabled':''}>${esc(row.dateLabel||'Без даты')}</button></td></tr>`;
}
export function groupBody(group,controller,windowed=false) {
  const canSelect=!!controller.capabilities.selection&&group.rows.some(r=>r.selectable&&!r.contextOnly);
  if(!group.loaded&&!group.busy&&!group.error)return ui.btn('Показать задачи','ghost sm','','data-load');
  let body='';
  if(group.rows.length)body=`<div class="iq-work-list-container"><table class="iq-work-list"><caption class="sr-only">${esc(group.title)} — задачи</caption><colgroup><col class="pn-col-task"><col class="pn-col-state"><col class="pn-col-owner"><col class="pn-col-date"></colgroup><thead><tr><th scope="col"><div class="pn-row-identity">${canSelect?`<span class="pn-grip-space" aria-hidden="true"></span>${ui.check('',false,`data-select-group="${esc(group.id)}" aria-label="Выбрать все задачи: ${esc(group.title)}"`)}`:''}<span>Задача</span></div></th><th scope="col">Состояние</th><th scope="col">Исполнитель</th><th scope="col">Срок</th></tr></thead><tbody data-window-body>${windowed?'':group.rows.map(row=>rowMarkup(row,group.id,controller.collapsed.has(row.taskId),false,false,lastChildren(group.rows))).join('')}</tbody></table></div>`;
  else if(group.loaded&&!group.busy&&!group.error)body=`<div class="pn-empty">${controller.filters.query||controller.filters.preparation!=='all'?'<p>Нет задач по этим условиям</p>':'<p>Задач пока нет</p>'}${controller.capabilities.createTask&&!['active','closed'].includes(group.state)?ui.btn('Добавить задачу','ghost sm','plus','data-add'):''}</div>`;
  if(group.error)body+=`<div class="pn-group-error" role="alert">${ui.alert('Не удалось загрузить группу',esc(group.error),'danger')}${ui.btn('Повторить','secondary sm','refresh','data-retry-rows')}</div>`;
  else if(group.busy)body+=loadingMarkup('Загружаем задачи…',{rows:3});
  else if(group.nextCursor)body+=ui.btn('Показать ещё задачи','ghost sm','down','data-more-rows');
  return body;
}
