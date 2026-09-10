import {icon,esc} from '../ui.js';
import {clone,uid} from '../common.js';
import {newChecklist} from './task-content.js';

/** Checklist edits share the task draft, never the Markdown source. */
export function mountChecklists(root,initial=[],{readOnly=false,onChange=()=>{}}={}) {
  let lists=clone(initial);const abort=new AbortController();
  function changed(){onChange(clone(lists));}
  function render(focusId){
    root.innerHTML=lists.map(list=>`<section class="task-checklist" data-list="${esc(list.id)}">
      <header class="row between"><label class="grow"><span class="sr-only">Название чек-листа</span><span class="iq-input-shell"><input data-list-title value="${esc(list.title)}" maxlength="160" ${readOnly?'readonly':''}></span></label>
      <span class="muted" data-progress>${list.items.filter(item=>item.done).length}/${list.items.length}</span>
      ${readOnly?'':`<button type="button" class="iq-btn ghost icon sm" data-remove-list aria-label="Удалить чек-лист ${esc(list.title)}">${icon('trash',16)}</button>`}</header>
      <div class="stack sm">${list.items.map(item=>`<div class="row" data-item="${esc(item.id)}"><label class="iq-check"><input type="checkbox" data-done ${item.done?'checked':''} ${readOnly?'disabled':''} aria-label="Выполнено: ${esc(item.text)}"><span class="iq-check-box">${icon('check',14)}</span></label>
      <label class="grow"><span class="sr-only">Пункт чек-листа</span><span class="iq-input-shell"><input data-item-text value="${esc(item.text)}" maxlength="2000" ${readOnly?'readonly':''}></span></label>
      ${readOnly?'':`<button type="button" class="iq-btn ghost icon sm" data-remove-item aria-label="Удалить пункт">${icon('x',16)}</button>`}</div>`).join('')}</div>
      ${readOnly?'':`<button type="button" class="iq-btn ghost sm" data-add-item>${icon('plus',16)}<span>Добавить пункт</span></button>`}</section>`).join('');
    if(!readOnly)root.insertAdjacentHTML('beforeend',`<button type="button" class="iq-btn ghost sm" data-add-list>${icon('plus',16)}<span>Добавить чек-лист</span></button>`);
    if(focusId)root.querySelector(`[data-item="${focusId}"] [data-item-text]`)?.focus();
  }
  root.addEventListener('input',event=>{
    if(readOnly)return;
    const list=lists.find(list=>list.id===event.target.closest('[data-list]')?.dataset.list);
    if(!list)return;
    if(event.target.matches('[data-list-title]'))list.title=event.target.value;
    const item=list.items.find(item=>item.id===event.target.closest('[data-item]')?.dataset.item);
    if(item&&event.target.matches('[data-item-text]'))item.text=event.target.value;
    if(item&&event.target.matches('[data-done]')){
      item.done=event.target.checked;
      event.target.closest('[data-list]').querySelector('[data-progress]').textContent=`${list.items.filter(item=>item.done).length}/${list.items.length}`;
    }
    changed();
  },{signal:abort.signal});
  root.addEventListener('click',event=>{
    if(readOnly)return;
    const list=lists.find(list=>list.id===event.target.closest('[data-list]')?.dataset.list);
    if(event.target.closest('[data-add-list]')){lists.push(newChecklist());render();changed();}
    if(!list)return;
    if(event.target.closest('[data-add-item]')){const item={id:uid('check'),text:'',done:false};list.items.push(item);render(item.id);changed();}
    if(event.target.closest('[data-remove-item]')){list.items=list.items.filter(item=>item.id!==event.target.closest('[data-item]').dataset.item);render();changed();}
    if(event.target.closest('[data-remove-list]')){lists=lists.filter(item=>item.id!==list.id);render();changed();}
  },{signal:abort.signal});
  root.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.target.matches('[data-item-text],[data-list-title]'))event.preventDefault();},{signal:abort.signal});
  render();
  return {value:()=>clone(lists),setValue(value){lists=clone(value);render();changed();},destroy(){abort.abort();}};
}
