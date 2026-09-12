import {registerAdvanced} from '@iquipage/web/advanced';
import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {formDialog} from './dialog.js';
/** Conditions are ordinary UI state. Applying them never changes task records. */
export function filterDialog({adapter,projectId,filters,onApply,onClose}) {
  registerAdvanced();const tags=new Map((filters.tagIds||[]).map(id=>[id,'Выбранный тег'])),labels=new Map();
  const body='<iq-remote-combobox data-filter-owner label="Исполнитель" placeholder="Любой участник"></iq-remote-combobox>'
    +'<iq-remote-combobox data-filter-release label="Релиз" placeholder="Все релизы и бэклог"></iq-remote-combobox>'
    +'<iq-remote-combobox data-filter-tag label="Добавить тег" placeholder="Найти тег проекта"></iq-remote-combobox>'
    +'<div class="row" data-filter-tags></div>'
    +ui.select('Совпадение тегов',[{value:'any',label:'Хотя бы один выбранный'},{value:'all',label:'Все выбранные'}],`data-tag-mode value="${esc(filters.tagMode||'any')}"`)
    +'<p class="iq-helper">Между разными условиями действует «И». Пустое значение не ограничивает результат.</p>'
    +ui.btn('Сбросить эти условия','ghost sm','refresh','data-filter-reset');
  return formDialog({title:'Условия списка',body,submitLabel:'Применить',
    submit:async form=>{await onApply({owner:form.querySelector('[data-filter-owner]').value||'',releaseId:form.querySelector('[data-filter-release]').value||'',tagIds:[...tags.keys()],tagMode:form.querySelector('[data-tag-mode]').value||'any'});},
    onMount:form=>{
      const owner=form.querySelector('[data-filter-owner]'),release=form.querySelector('[data-filter-release]'),tag=form.querySelector('[data-filter-tag]');
      owner.provider=q=>adapter.options({projectId,kind:'owner',...q});owner.value=filters.owner||'';
      release.provider=q=>adapter.destinations({projectId,...q});release.value=filters.releaseId||'';
      tag.provider=async q=>{const page=await adapter.options({projectId,kind:'tags',...q});for(const option of page.options){labels.set(option.value,option.label);if(tags.has(option.value))tags.set(option.value,option.label);}render();return page;};
      const render=()=>{form.querySelector('[data-filter-tags]').innerHTML=[...tags].map(([id,label])=>`<span class="iq-tag">${esc(label)}<button type="button" data-remove-tag="${esc(id)}" aria-label="Убрать условие ${esc(label)}">×</button></span>`).join('');};
      form.addEventListener('iq-change',event=>{if(event.target!==tag||!tag.value)return;tags.set(tag.value,labels.get(tag.value)||'Выбранный тег');tag.value='';render();});
      form.addEventListener('click',event=>{const target=event.target.closest('button');if(target?.matches('[data-remove-tag]')){tags.delete(target.dataset.removeTag);render();tag.focus();}if(target?.matches('[data-filter-reset]')){owner.value='';release.value='';tag.value='';tags.clear();render();}});
      render();
    },onClose});
}
