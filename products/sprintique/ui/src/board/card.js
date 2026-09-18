import {tagMarkup} from './catalog-ui.js';
import {coverImageStyle} from './cover-crop.js';
import {taskEmphasis,taskSignal,normalizePriority,ui} from '@iquipage/web/core';
import {icon,esc} from '../ui.js';
import {childOwners,taskKindLabel} from './model.js';
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const avatar=(name,i)=>`<span class="iq-avatar v${i%4+1}" role="img" title="${esc(name)}" aria-label="${esc(name)}">${esc(initials(name))}</span>`;
export function taskAvatars(task,index){
  const children=index.children.get(task.id)||[],owners=children.length?childOwners(task.id,index):(task.owner?[task.owner]:[]);
  if(!owners.length)return '';
  return `<span class="iq-avatars" aria-label="${children.length?'Исполнители подзадач':'Исполнитель'}">${owners.slice(0,3).map(avatar).join('')}${owners.length>3?`<span class="iq-avatar more" role="img" title="${esc(owners.slice(3).join(', '))}" aria-label="Ещё ${owners.length-3}">+${owners.length-3}</span>`:''}</span>`;
}
export function renderTaskCard(row,{index,canEdit,pending=false,collapsed=false,catalogs={tags:[],releases:[]}}){
  const t=row.task,id=esc(t.id),label=taskKindLabel(t);
  canEdit=canEdit&&t.result!=='accepted';
  const tags=catalogs.tags.filter(tag=>(t.tagIds||[]).includes(tag.id)),release=catalogs.releases.find(item=>item.id===t.releaseId);
  const metadata=tags.length?`<div class="task-card-tags" data-card-tags>${tags.map(tag=>`<span data-packed-tag title="${esc(tag.name)}">${tagMarkup(tag)}</span>`).join('')}<button type="button" class="iq-tag task-tags-more" data-tags-overflow="${id}" hidden></button></div>`:'';
  const due=t.due&&/^\d{4}-\d{2}-\d{2}$/.test(t.due)?new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(t.due+'T12:00:00Z')):'';
  const menu=ui.menu(ui.ib('more','Действия задачи: '+t.title,'ghost sm'),[{label:'Открыть задачу',glyph:'expand',action:'open:'+t.id},...(canEdit?[{label:'Переместить…',glyph:'arrow',action:'move-menu:'+t.id}]:[])]);
  return `<article class="task-card" tabindex="0" role="link" aria-label="Открыть задачу: ${esc(t.title)}" data-task-surface="${id}" data-task-emphasis="${taskEmphasis(t)}" data-task-kind="${esc(t.type||'task')}" data-drag-id="${id}" data-priority="${normalizePriority(t.priority)}" style="--task-depth:${Math.min(row.depth,3)}" ${pending?'aria-busy="true"':''}>
    ${row.depth?'<span class="task-nesting-guide" aria-hidden="true"></span>':''}
    ${row.depth===0&&row.parent?`<button type="button" class="task-parent-context" data-open-task="${esc(row.parent.id)}" title="${esc(row.parent.title)}"><span>${esc(row.parent.displayId||row.parent.title)}</span></button>`:''}
    ${t.coverAttachmentId?`<button type="button" class="task-card-cover" data-state="loading" data-open-task="${id}" aria-label="Открыть задачу: ${esc(t.title)}"><img data-cover-id="${esc(t.coverAttachmentId)}" data-cover-task="${id}" style="${coverImageStyle(t.coverCrop,t.coverAttachmentId)}" alt="" draggable="false" decoding="async"><span class="task-cover-fallback">${icon('image',20)}</span></button>`:''}
    <div class="task-card-top"><div class="task-identity">
    <button type="button" class="task-card-id task-id-drag" data-drag-handle title="${esc(label)} · Перетащите за номер задачи" aria-label="Переместить задачу: ${esc(t.title)}" aria-pressed="false" aria-describedby="board-drag-help" ${!canEdit||pending?'disabled':''}>${esc(t.displayId||t.id.slice(-7).toUpperCase())}</button>${taskSignal(t)}</div>${menu}</div>

    <button type="button" class="task-card-title" data-open-task="${id}" title="${esc(t.title)}">${esc(t.title)}</button>
    ${metadata?`<div class="task-card-metadata">${metadata}</div>`:''}
    ${due||release||taskAvatars(t,index)?`<div class="task-card-footer"><span class="task-due">${due?icon('calendar',15)+`<span>${esc(due)}</span>`:''}${release?`<span class="task-release" title="Релиз: ${esc(release.name)}">${esc(release.name)}</span>`:''}</span>${taskAvatars(t,index)}</div>`:''}
    ${row.children?`<button type="button" class="task-child-toggle" data-toggle-children="${id}" aria-expanded="${!collapsed}">${icon(collapsed?'chevron':'down',14)}<span>Подзадачи · ${row.children}</span></button>`:''}
    ${row.otherChildren?`<button type="button" class="task-child-jump" data-show-children="${id}">В других столбцах: ${row.otherChildren}</button>`:''}
  </article>`;
}
