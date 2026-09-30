import {ui,icon,escapeHTML as esc,taskEmphasis,taskSignal,formatDate,plural as pluralForms} from '@iquipage/web/core';
export {ui,icon,esc};
import {loadingMarkup} from '../../src/loading.js';
import {avatarName} from '../../src/board/assignees.js';
export const plural=(n,one,few,many)=>pluralForms(n,{one,few,many});
/** Status tones follow meaning: work in progress is info, waiting for someone is warning, done is success. */
const STATUS_TONE={'Готово к работе':'neutral','В работе':'info','На проверке':'warning','К тестированию':'planned','Тестирование':'planned','Готово к релизу':'success','Принята':'success'};
const pad=n=>String(n).padStart(2,'0');
/** The local calendar day: deadlines are dates, so timing is judged against the person's own day. */
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
export const between=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);
/** A due date reads red when it has passed and amber when it is today or tomorrow; a done task carries no tone. */
export function dueTone(due,done=false,now=today()){
  if(!due||done)return '';
  const days=between(now,due);
  return days<0?'danger':days<=1?'warning':'';
}
/** A parent names its subtasks as done out of total, the same words as on the board. Older servers give the total only. */
export function subtaskSummary(row){
  if(!row.childrenCount)return '';
  const total=row.childrenCount,done=row.doneChildrenCount;
  const text=typeof done==='number'?`<b>${done}</b> из ${total}`:`${total} ${plural(total,'подзадача','подзадачи','подзадач')}`;
  return `<span class="pn-subtasks" role="img" aria-label="Подзадачи${typeof done==='number'?`: готово ${done} из ${total}`:`: ${total}`}">${icon('checklist',14)}<span aria-hidden="true">${text}</span></span>`;
}
/** One quiet signal before the key: done, epic, bug, high or critical. A normal open task has none. */
function signal(row){
  if(row.done)return `<span class="pn-signal pn-done" role="img" aria-label="Готово">${icon('checkCircle',14)}</span>`;
  const copy=taskEmphasis({type:row.type,priority:row.priority})==='none'?'':taskSignal({type:row.type,priority:row.priority});
  const bug=row.type==='bug'?`<span class="pn-bug" role="img" aria-label="Ошибка">${icon('bug',14)}</span>`:'';
  return copy||bug?`<span class="pn-signal">${bug}${copy}</span>`:'';
}
export function rowMarkup(row,groupId,collapsed,canDrag=false,canEdit=false) {
  const disabled=!row.selectable||row.contextOnly,id=esc(row.id),taskId=esc(row.taskId),key=esc(row.key);
  const check=disabled?'<span class="pn-check-space" aria-hidden="true"></span>':ui.check('',false,`data-select="${taskId}" data-focus="select:${id}" aria-label="Выбрать ${key}"`);
  const grip=canDrag&&!disabled?ui.ib('grip',`Переместить ${key}`,'ghost sm pn-grip',`data-work-drag="${taskId}" data-focus="drag:${id}" aria-pressed="false"`):'<span class="pn-grip-space" aria-hidden="true"></span>';
  const disclosure=row.childrenCount?ui.ib(collapsed?'chevron':'down',`${collapsed?'Показать':'Скрыть'} подзадачи ${key}`,'ghost sm pn-disclose',`data-disclose="${taskId}" data-focus="disclose:${id}" aria-expanded="${!collapsed}"`):'<span class="pn-disclose-space" aria-hidden="true"></span>';
  const parent=row.parentContext?`<span class="iq-work-list-context">Часть: ${esc(row.parentTitle||row.parentContext)}</span>`:'';
  const owner=row.ownerLabel?`${ui.personAvatar({id:row.ownerId||row.ownerLabel,name:avatarName(row.ownerLabel)},{size:'xs'})}<span class="pn-person-name" title="${esc(row.ownerLabel)}">${esc(row.ownerLabel)}</span>`:'<span class="pn-empty-value">Не назначен</span>';
  const ownerEditable=canEdit&&!disabled&&row.ownerId!==undefined,ownerEmpty=row.ownerLabel?'':' data-empty="true"';
  const tone=dueTone(row.dueValue,row.done),dueEditable=canEdit&&!disabled&&row.dueValue!==undefined,dueEmpty=row.dueValue?'':' data-empty="true"';
  const due=row.dueValue?esc(formatDate(row.dueValue)):'<span class="pn-empty-value">Без даты</span>';
  return `<tr data-work-row="${taskId}" data-row="${id}" data-task="${taskId}" data-context="${row.contextOnly}" data-done="${!!row.done}" data-task-emphasis="${taskEmphasis({type:row.type,priority:row.priority})}" data-depth="${Math.min(row.depth,4)}">
    <td><div class="iq-work-list-identity pn-identity" style="--pn-depth:${Math.min(row.depth,4)}">${grip}${check}${disclosure}${signal(row)}<span class="iq-work-list-id">${key}</span><div class="iq-work-list-title"><div class="pn-title-line"><button type="button" class="iq-btn ghost sm pn-task-title" data-open="${taskId}" data-focus="open:${id}">${esc(row.title)}</button>${row.preparation==='draft'?'<span class="iq-badge outline pn-draft">Черновик</span>':''}${subtaskSummary(row)}</div>${parent}</div></div></td>
    <td data-column="status"><span class="iq-badge soft ${STATUS_TONE[row.statusLabel]||'neutral'}">${esc(row.statusLabel)}</span></td>
    <td data-column="person">${ownerEditable?`<button type="button" class="iq-btn ghost sm pn-cell" data-quick-edit="owner" data-focus="owner:${id}" data-field-task="${taskId}" aria-label="Исполнитель ${key}"${ownerEmpty}>${owner}</button>`:`<span class="pn-cell"${ownerEmpty}>${owner}</span>`}</td>
    <td data-column="date">${dueEditable?`<button type="button" class="iq-btn ghost sm pn-cell" data-quick-edit="due" data-focus="due:${id}" data-field-task="${taskId}" aria-label="Срок ${key}"${dueEmpty}${tone?` data-tone="${tone}"`:''}>${due}</button>`:`<span class="pn-cell"${dueEmpty}${tone?` data-tone="${tone}"`:''}>${due}</span>`}</td></tr>`;
}
const filtered=f=>!!(f.query||f.preparation!=='all'||f.owner||f.releaseId||f.tagIds?.length);
/** Compact DS empty state inside the section: what is missing and the one action that fills it. */
const emptyState=(title,text,action='')=>`<div class="iq-empty compact pn-empty"><span class="iq-settings-row-tile">${icon('list',18)}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
export function groupBody(group,controller,windowed=false) {
  const canSelect=!!controller.capabilities.selection&&group.rows.some(r=>r.selectable&&!r.contextOnly);
  let body='';
  if(group.rows.length)body=`<div class="iq-work-list-container"><table class="iq-work-list"><caption class="sr-only">${esc(group.title)} — задачи</caption><colgroup><col class="pn-col-task"><col class="pn-col-state"><col class="pn-col-owner"><col class="pn-col-date"></colgroup><thead><tr><th scope="col"><div class="iq-work-list-identity pn-identity"><span class="pn-grip-space" aria-hidden="true"></span>${canSelect?'<span class="pn-check-space" aria-hidden="true"></span>':''}${group.rows.some(r=>r.childrenCount)?'<span class="pn-disclose-space" aria-hidden="true"></span>':''}<span>Задача</span></div></th><th scope="col">Статус</th><th scope="col">Исполнитель</th><th scope="col">Срок</th></tr></thead><tbody data-window-body>${windowed?'':group.rows.map(row=>rowMarkup(row,group.id,controller.collapsed.has(row.taskId))).join('')}</tbody></table></div>`;
  else if(group.loaded&&!group.busy&&!group.error){
    const canAdd=controller.capabilities.createTask&&!['active','closed','cancelled'].includes(group.state);
    if(filtered(controller.filters))body=emptyState('Ничего не подходит под условия','Измените условия или сбросьте фильтры.',ui.btn('Сбросить фильтры','ghost sm','x','data-reset-filters'));
    else if(group.state==='backlog')body=emptyState('Бэклог пуст','Все задачи распределены по релизам.',canAdd?ui.btn('Добавить задачу','ghost sm','plus','data-add'):'');
    else body=emptyState('Пока нет задач','Перетащите задачи из бэклога или добавьте новую.',canAdd?ui.btn('Добавить задачу','ghost sm','plus','data-add'):'');
  }
  if(group.error)body+=`<div class="pn-group-error" role="alert">${ui.alert('Не удалось загрузить задачи',esc(group.error),'danger')}${ui.btn('Повторить','secondary sm','refresh','data-retry-rows')}</div>`;
  else if(group.busy||!group.loaded)body+=loadingMarkup('Загружаем задачи…',{rows:group.rows.length?1:3});
  else if(group.nextCursor)body+=`<div class="pn-more">${ui.btn('Показать ещё','ghost sm','down','data-more-rows')}<span>Показано ${group.rows.length} из ${group.matched}</span></div>`;
  return body;
}
