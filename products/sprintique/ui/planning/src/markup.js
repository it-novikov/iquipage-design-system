import {ui,icon,escapeHTML as esc,taskEmphasis} from '@iquipage/web/core';
export {ui,icon,esc};
const typeLabels={task:'Задача',bug:'Баг',epic:'Эпик'};
export function rowMarkup(row,groupId,collapsed) {
  const disabled=!row.selectable||row.contextOnly;
  const disclosure=row.childrenCount?ui.ib(collapsed?'chevron':'down',`${collapsed?'Показать':'Скрыть'} подзадачи ${row.key}`,'ghost sm',`data-disclose="${esc(row.taskId)}" data-focus="disclose:${esc(row.id)}" aria-expanded="${!collapsed}"`):'<span class="pn-disclosure-space" aria-hidden="true"></span>';
  return `<tr data-row="${esc(row.id)}" data-task="${esc(row.taskId)}" data-context="${row.contextOnly}" data-task-emphasis="${taskEmphasis({type:row.type,priority:row.priority})}" data-depth="${Math.min(row.depth,4)}">
    <td><div class="pn-row-identity">${disabled?'<span class="pn-check-space"></span>':ui.check('',false,`data-select="${esc(row.taskId)}" data-focus="select:${esc(row.id)}" aria-label="Выбрать ${esc(row.key)}"`)}<span class="pn-indent" style="--pn-depth:${Math.min(row.depth,4)}"></span>${disclosure}<div class="iq-work-row-title"><div class="row"><span class="mono">${esc(row.key)}</span>${ui.badge(typeLabels[row.type],row.type==='epic'?'planned':'outline')}${['high','critical'].includes(row.priority)?ui.badge(row.priority==='critical'?'Критический':'Высокий',row.priority==='critical'?'danger':'warning'):''}${row.contextOnly?ui.badge('Контекст','outline'):''}</div>${row.contextOnly?`<span>${esc(row.title)}</span>`:`<button type="button" class="iq-btn ghost sm pn-task-title" data-open="${esc(row.taskId)}" data-focus="open:${esc(row.id)}">${esc(row.title)}</button>`}${row.parentContext?`<small class="iq-helper">${esc(row.parentContext)}</small>`:''}</div></div></td>
    <td data-column="status">${ui.badge(row.preparation==='draft'?'Черновик':row.statusLabel,row.preparation==='draft'?'outline':'neutral')}</td>
    <td data-column="person"><span class="pn-person">${row.ownerLabel?ui.avatar(esc(row.ownerLabel.split(/\s+/).slice(0,2).map(x=>[...x][0]).join('')),1):''}<span>${esc(row.ownerLabel||'Не назначен')}</span></span></td>
    <td data-column="date"><span class="pn-date">${esc(row.dateLabel||'Без даты')}</span></td></tr>`;
}
export function groupBody(group,controller) {
  if(!group.loaded&&!group.busy&&!group.error)return ui.btn('Показать задачи','ghost sm','','data-load');
  let body='';
  if(group.rows.length)body=`<div class="iq-table-wrap"><table class="iq-work-table"><caption class="sr-only">${esc(group.title)} — задачи</caption><colgroup><col style="width:52%"><col style="width:17%"><col style="width:18%"><col style="width:13%"></colgroup><thead><tr><th scope="col">Задача</th><th scope="col">Состояние</th><th scope="col">Ответственный</th><th scope="col">Срок</th></tr></thead><tbody>${group.rows.map(row=>rowMarkup(row,group.id,controller.collapsed.has(row.taskId))).join('')}</tbody></table></div>`;
  else if(group.loaded&&!group.busy&&!group.error)body=`<div class="pn-empty">${controller.filters.query||controller.filters.preparation!=='all'?'<p>Нет задач по этим условиям</p>':'<p>Задач пока нет</p>'}${controller.capabilities.createTask&&!['active','closed'].includes(group.state)?ui.btn('Добавить задачу','ghost sm','plus','data-add'):''}</div>`;
  if(group.error)body+=`<div class="pn-group-error" role="alert">${ui.alert('Не удалось загрузить группу',esc(group.error),'danger')}${ui.btn('Повторить','secondary sm','refresh','data-retry-rows')}</div>`;
  else if(group.busy)body+='<p class="iq-helper" role="status">Загружаем задачи…</p>';
  else if(group.nextCursor)body+=ui.btn('Показать ещё задачи','ghost sm','down','data-more-rows');
  return body;
}
