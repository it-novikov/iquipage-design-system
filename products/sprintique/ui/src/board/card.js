import {tagMarkup} from './catalog-ui.js';
import {coverImageStyle,coverLetterboxed} from './cover-crop.js';
import {taskEmphasis,taskSignal,normalizePriority,ui,formatDate} from '@iquipage/web/core';
import {icon,esc} from '../ui.js';
import {childOwners,taskKindLabel} from './model.js';
import {avatarName} from './assignees.js';
import {TASK_COLUMNS,taskColumn} from '../tasks.js';
/** People on a card are one DS avatar group: a stable tone per person, at most three discs, one tooltip with every name. */
export function taskAvatars(task,index,people=new Map()){
  // A member's photo comes from the board's people (id → {name, image}); a former member keeps the initials.
  const who=owner=>({...owner,...(owner.id&&people.get(owner.id)?.image?{image:people.get(owner.id).image}:{})});
  const children=index.children.get(task.id)||[];
  if(children.length)return ui.avatarGroup(childOwners(task.id,index).map(who),{size:'sm',label:'Исполнители подзадач'});
  // A service account's disc takes its initials from its own name; the tooltip heading says what it is (SPR-7).
  const remark=task.ownerKind==='service'?/\(([^()]*)\)$/.exec(task.owner||'')?.[1]:'';
  return task.owner?ui.avatarGroup([who({id:task.ownerId||undefined,name:avatarName(task.owner)})],{size:'sm',label:remark?`Исполнитель — ${remark}`:'Исполнитель'}):'';
}
// A subtask counts as done once it is ready for release or its result is accepted.
const subtaskDone=task=>task.result==='accepted'||taskColumn(task)==='ready_for_release';
/** Parent summary: count and progress, expandable into a compact list of the subtasks and their columns. */
function subtasks(t,children=[],expanded=false,people=''){
  if(!children.length)return '';
  const done=children.filter(subtaskDone).length,id=esc(t.id),percent=Math.round(done/children.length*100);
  // The list is always in the markup and only hidden, so expanding never re-renders the board (no light flicker).
  const list=`<ul class="task-subtask-list" id="subtasks-${id}" ${expanded?'':'hidden'}>${children.map(child=>`<li><button type="button" class="task-subtask" data-open-task="${esc(child.id)}"><span class="task-subtask-state" data-done="${subtaskDone(child)}" aria-hidden="true">${icon(subtaskDone(child)?'checkCircle':'circle',14)}</span><span class="task-subtask-title">${esc(child.title)}</span><small>${esc(TASK_COLUMNS.find(c=>c.id===taskColumn(child))?.label||'')}</small></button></li>`).join('')}</ul>`;
  return `<div class="task-card-subtasks"><button type="button" class="task-subtasks-summary" data-toggle-children="${id}" aria-expanded="${expanded}" aria-controls="subtasks-${id}"><span>Подзадачи</span><span class="task-subtasks-count">${done}/${children.length}</span>${ui.progress(percent,'Готово подзадач','task-subtasks-progress')}${icon('down',14)}</button>${people?`<span class="task-subtasks-people">${people}</span>`:''}${list}</div>`;
}
export function renderTaskCard(row,{index,canEdit,pending=false,expanded=false,catalogs={tags:[],releases:[],people:new Map()}}){
  // The kind leads the key («Задача SPR-1», «Баг SPR-2», «Эпик SPR-3»); the key stays the drag handle, and the signal
  // after it keeps only urgency, since the kind is already said.
  const t=row.task,id=esc(t.id),label=taskKindLabel(t),key=t.displayId||t.id.slice(-7).toUpperCase();
  canEdit=canEdit&&t.result!=='accepted';
  const tags=catalogs.tags.filter(tag=>(t.tagIds||[]).includes(tag.id)),release=catalogs.releases.find(item=>item.id===t.releaseId);
  const metadata=tags.length?`<div class="task-card-tags" data-card-tags>${tags.map(tag=>`<span data-packed-tag title="${esc(tag.name)}">${tagMarkup(tag)}</span>`).join('')}<button type="button" class="iq-tag task-tags-more" data-tags-overflow="${id}" hidden></button></div>`:'';
  const due=t.due&&/^\d{4}-\d{2}-\d{2}$/.test(t.due)?formatDate(t.due):'';
  // Overdue is red, due today or tomorrow is amber; finished work carries no alarm.
  const day=offset=>{const d=new Date(Date.now()+offset*86400000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const dueTone=!due||taskColumn(t)==='ready_for_release'||t.result==='accepted'?'':t.due<day(0)?'danger':t.due<=day(1)?'warning':'';
  const people=taskAvatars(t,index,catalogs.people),parent=(row.children||[]).length>0;
  // Moving is one step: the columns are listed right in the card menu.
  const moves=canEdit?[{section:'Переместить в'},...TASK_COLUMNS.filter(c=>c.id!==taskColumn(t)).map(c=>({label:c.label,glyph:c.icon,action:`move-to:${c.id}:${t.id}`}))]:[];
  const menu=ui.menu(ui.ib('more','Действия задачи: '+t.title,'ghost sm'),[{label:'Открыть задачу',glyph:'expand',action:'open:'+t.id},...moves]);
  return `<article class="task-card" tabindex="0" role="link" aria-label="Открыть: ${esc(label)} ${esc(key)}, ${esc(t.title)}" data-task-surface="${id}" data-task-emphasis="${taskEmphasis(t)}" data-task-kind="${esc(t.type||'task')}" data-drag-id="${id}" data-priority="${normalizePriority(t.priority)}" ${pending?'aria-busy="true"':''}>
    ${t.coverAttachmentId?`<button type="button" class="task-card-cover" data-state="loading" data-open-task="${id}" aria-label="Открыть задачу: ${esc(t.title)}" tabindex="-1">${coverLetterboxed(t.coverCrop)&&t.coverCrop.attachmentId===t.coverAttachmentId?'<img class="task-cover-backdrop" alt="" aria-hidden="true" hidden>':''}<img data-cover-id="${esc(t.coverAttachmentId)}" data-cover-task="${id}" style="${coverImageStyle(t.coverCrop,t.coverAttachmentId)}" alt="" draggable="false" decoding="async"><span class="task-cover-fallback">${icon('image',20)}</span></button>`:''}
    <div class="task-card-top"><div class="task-identity">
    <span class="task-card-kind">${esc(label)}</span><button type="button" class="task-card-id task-id-drag" data-drag-handle title="${esc(label)} ${esc(key)}. Перетащите за номер задачи" aria-label="Переместить: ${esc(label)} ${esc(key)}, ${esc(t.title)}" aria-pressed="false" aria-describedby="board-drag-help" ${!canEdit||pending?'disabled':''}>${esc(key)}</button>${taskSignal({...t,type:'task'})}</div>${menu}</div>

    <button type="button" class="task-card-title" data-open-task="${id}" title="${esc(t.title)}" tabindex="-1">${esc(t.title)}</button>
    ${row.parent?`<button type="button" class="task-card-parent" data-open-task="${esc(row.parent.id)}" tabindex="-1" title="Родительская задача: ${esc(row.parent.title)}">${icon('stack',14)}<span>${esc(row.parent.title)}</span></button>`:''}
    ${t.effectiveBlocked===true?`<span class="iq-badge danger" title="${esc((t.blockers||[]).map(b=>`${b.displayId||''} ${b.title}`).join('; '))}">${icon('lock',14)} Заблокирована${t.blockingTaskCount>1?` (${t.blockingTaskCount})`:''}</span>`:''}
    ${metadata?`<div class="task-card-metadata">${metadata}</div>`:''}
    ${due||release||(people&&!parent)?`<div class="task-card-footer"><span class="task-due">${due?`<span class="task-due-date" ${dueTone?`data-tone="${dueTone}"`:''}>${icon('calendar',14)}<span>${esc(due)}</span>${dueTone==='danger'?'<span class="sr-only">просрочено</span>':''}</span>`:''}${release?`<span class="task-release" title="Релиз: ${esc(release.name)}">${icon('flag',14)}<span>${esc(release.name)}</span></span>`:''}</span>${parent?'':people}</div>`:''}
    ${subtasks(t,row.children,expanded,parent?people:'')}
  </article>`;
}
