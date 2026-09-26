import {tagMarkup} from './catalog-ui.js';
import {coverImageStyle} from './cover-crop.js';
import {taskEmphasis,taskSignal,normalizePriority,ui,formatDate} from '@iquipage/web/core';
import {icon,esc} from '../ui.js';
import {childOwners,taskKindLabel} from './model.js';
import {TASK_COLUMNS,taskColumn} from '../tasks.js';
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const avatar=(name,i)=>`<span class="iq-avatar v${i%4+1}" role="img" title="${esc(name)}" aria-label="${esc(name)}">${esc(initials(name))}</span>`;
export function taskAvatars(task,index){
  const children=index.children.get(task.id)||[],owners=children.length?childOwners(task.id,index):(task.owner?[task.owner]:[]);
  if(!owners.length)return '';
  return `<span class="iq-avatars" aria-label="${children.length?'Исполнители подзадач':'Исполнитель'}">${owners.slice(0,3).map(avatar).join('')}${owners.length>3?`<span class="iq-avatar more" role="img" title="${esc(owners.slice(3).join(', '))}" aria-label="Ещё ${owners.length-3}">+${owners.length-3}</span>`:''}</span>`;
}
// A subtask counts as done once it is ready for release or its result is accepted.
const subtaskDone=task=>task.result==='accepted'||taskColumn(task)==='ready_for_release';
/** Parent summary: count and progress, expandable into a compact list of the subtasks and their columns. */
function subtasks(t,children=[],expanded=false){
  if(!children.length)return '';
  const done=children.filter(subtaskDone).length,id=esc(t.id),percent=Math.round(done/children.length*100);
  // The list is always in the markup and only hidden, so expanding never re-renders the board (no light flicker).
  const list=`<ul class="task-subtask-list" id="subtasks-${id}" ${expanded?'':'hidden'}>${children.map(child=>`<li><button type="button" class="task-subtask" data-open-task="${esc(child.id)}"><span class="task-subtask-state" data-done="${subtaskDone(child)}" aria-hidden="true">${icon(subtaskDone(child)?'checkCircle':'circle',14)}</span><span class="task-subtask-title">${esc(child.title)}</span><small>${esc(TASK_COLUMNS.find(c=>c.id===taskColumn(child))?.label||'')}</small></button></li>`).join('')}</ul>`;
  return `<div class="task-card-subtasks"><button type="button" class="task-subtasks-summary" data-toggle-children="${id}" aria-expanded="${expanded}" aria-controls="subtasks-${id}"><span>Подзадачи</span><span class="task-subtasks-count">${done}/${children.length}</span>${ui.progress(percent,'Готово подзадач','task-subtasks-progress')}${icon('down',14)}</button>${list}</div>`;
}
export function renderTaskCard(row,{index,canEdit,pending=false,expanded=false,catalogs={tags:[],releases:[]}}){
  const t=row.task,id=esc(t.id),label=taskKindLabel(t);
  canEdit=canEdit&&t.result!=='accepted';
  const tags=catalogs.tags.filter(tag=>(t.tagIds||[]).includes(tag.id)),release=catalogs.releases.find(item=>item.id===t.releaseId);
  const metadata=tags.length?`<div class="task-card-tags" data-card-tags>${tags.map(tag=>`<span data-packed-tag title="${esc(tag.name)}">${tagMarkup(tag)}</span>`).join('')}<button type="button" class="iq-tag task-tags-more" data-tags-overflow="${id}" hidden></button></div>`:'';
  const due=t.due&&/^\d{4}-\d{2}-\d{2}$/.test(t.due)?formatDate(t.due):'';
  // Moving is one step: the columns are listed right in the card menu.
  const moves=canEdit?[{section:'Переместить в'},...TASK_COLUMNS.filter(c=>c.id!==taskColumn(t)).map(c=>({label:c.label,glyph:c.icon,action:`move-to:${c.id}:${t.id}`}))]:[];
  const menu=ui.menu(ui.ib('more','Действия задачи: '+t.title,'ghost sm'),[{label:'Открыть задачу',glyph:'expand',action:'open:'+t.id},...moves]);
  return `<article class="task-card" tabindex="0" role="link" aria-label="Открыть задачу: ${esc(t.title)}" data-task-surface="${id}" data-task-emphasis="${taskEmphasis(t)}" data-task-kind="${esc(t.type||'task')}" data-drag-id="${id}" data-priority="${normalizePriority(t.priority)}" ${pending?'aria-busy="true"':''}>
    ${t.coverAttachmentId?`<button type="button" class="task-card-cover" data-state="loading" data-open-task="${id}" aria-label="Открыть задачу: ${esc(t.title)}" tabindex="-1"><img data-cover-id="${esc(t.coverAttachmentId)}" data-cover-task="${id}" style="${coverImageStyle(t.coverCrop,t.coverAttachmentId)}" alt="" draggable="false" decoding="async"><span class="task-cover-fallback">${icon('image',20)}</span></button>`:''}
    <div class="task-card-top"><div class="task-identity">
    <button type="button" class="task-card-id task-id-drag" data-drag-handle title="${esc(label)}. Перетащите за номер задачи" aria-label="Переместить задачу: ${esc(t.title)}" aria-pressed="false" aria-describedby="board-drag-help" ${!canEdit||pending?'disabled':''}>${esc(t.displayId||t.id.slice(-7).toUpperCase())}</button>${taskSignal(t)}</div>${menu}</div>

    <button type="button" class="task-card-title" data-open-task="${id}" title="${esc(t.title)}" tabindex="-1">${esc(t.title)}</button>
    ${row.parent?`<button type="button" class="task-card-parent" data-open-task="${esc(row.parent.id)}" tabindex="-1" title="Родительская задача: ${esc(row.parent.title)}">${icon('stack',14)}<span>${esc(row.parent.title)}</span></button>`:''}
    ${metadata?`<div class="task-card-metadata">${metadata}</div>`:''}
    ${due||release||taskAvatars(t,index)?`<div class="task-card-footer"><span class="task-due">${due?icon('calendar',15)+`<span>${esc(due)}</span>`:''}${release?`<span class="task-release" title="Релиз: ${esc(release.name)}">${esc(release.name)}</span>`:''}</span>${taskAvatars(t,index)}</div>`:''}
    ${subtasks(t,row.children,expanded)}
  </article>`;
}
