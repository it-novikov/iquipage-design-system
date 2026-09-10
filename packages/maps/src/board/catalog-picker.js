import {dialog,icon,esc} from '../ui.js';
import {editCatalogItem,tagMarkup,catalogLabel} from './catalog-ui.js';
export function mountTaskCatalogs(root,{repository,project,task,tags,releases,readOnly=false,canManage=true,onChange=()=>{}}){
  let selected=new Set(task?.tagIds||[]),releaseId=task?.releaseId||'',allReleases=[...releases];
  const abort=new AbortController();
  root.innerHTML=`<div class="task-edit-properties"><div data-release-field></div><div class="iq-field"><span class="iq-control-label">Теги</span><div class="task-selected-tags" data-selected-tags></div><button type="button" class="iq-btn ghost sm" data-choose-tags ${readOnly?'disabled':''}>${icon('filter',16)}<span>Выбрать теги</span></button></div></div>`;
  function renderRelease(){
    const options=[{value:'',label:'Без релиза'},...allReleases.filter(item=>!item.archivedAt||item.id===releaseId).map(item=>({value:item.id,label:catalogLabel(item)}))];
    root.querySelector('[data-release-field]').innerHTML=`<iq-combobox name="releaseId" label="Релиз" value="${esc(releaseId)}" options="${esc(JSON.stringify(options))}" placeholder="Найти релиз" ${readOnly?'disabled':''}></iq-combobox>${!readOnly&&canManage?'<button type="button" class="iq-btn ghost sm" data-new-release>Новый релиз</button>':''}`;
  }
  function renderTags(){root.querySelector('[data-selected-tags]').innerHTML=tags.filter(tag=>selected.has(tag.id)).map(tagMarkup).join('')||'<span class="iq-helper">Не выбраны</span>';}
  root.addEventListener('iq-change',event=>{if(event.target.getAttribute('name')==='releaseId'){releaseId=event.target.value||'';onChange();}},{signal:abort.signal});
  root.addEventListener('click',event=>{
    if(readOnly)return;
    if(event.target.closest('[data-new-release]')&&canManage)editCatalogItem('releases',{repository,project,onSaved:item=>{allReleases.push(item);releaseId=item.id;renderRelease();onChange();}});
    if(event.target.closest('[data-choose-tags]'))chooseTags();
  },{signal:abort.signal});
  function chooseTags(){
    const draft=new Set(selected);
    dialog({title:'Теги задачи',body:`<label class="iq-search-small">${icon('search',16)}<input type="search" aria-label="Найти тег" placeholder="Найти тег"></label><div class="stack sm" data-tag-options></div>`,submitLabel:'Применить',
      onSubmit:async()=>{selected=draft;renderTags();onChange();},
      mount:el=>{
        const list=el.querySelector('[data-tag-options]'),search=el.querySelector('input[type=search]');
        function draw(){
          const query=search.value.toLocaleLowerCase('ru');
          list.innerHTML=tags.filter(tag=>(!tag.archivedAt||selected.has(tag.id))&&tag.name.toLocaleLowerCase('ru').includes(query)).map(tag=>`<label class="iq-check"><input type="checkbox" value="${esc(tag.id)}" ${draft.has(tag.id)?'checked':''}><span class="iq-check-box">${icon('check',14)}</span>${tagMarkup(tag)}</label>`).join('')||'<p class="iq-helper">Теги не найдены. Добавить их можно в настройках проекта.</p>';
        }
        search.addEventListener('input',draw);list.addEventListener('change',event=>{if(event.target.checked)draft.add(event.target.value);else draft.delete(event.target.value);});draw();
      }
    });
  }
  renderRelease();renderTags();
  return {value:()=>({releaseId:releaseId||null,tagIds:[...selected]}),destroy(){abort.abort();}};
}
export async function loadTaskSupport(repository,projectId){
  const [tags,releases,settings,links]=await Promise.all(['tags','releases','taskSettings','taskLinks'].map(name=>repository.list(name,projectId)));
  return {tags:tags.sort((a,b)=>a.name.localeCompare(b.name,'ru')),releases:releases.sort((a,b)=>a.name.localeCompare(b.name,'ru')),settings:settings[0]||null,links};
}
