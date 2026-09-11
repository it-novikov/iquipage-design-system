import {dialog,icon,esc} from '../ui.js';
import {editCatalogItem,catalogLabel} from './catalog-ui.js';
import {mountProjectTaskSettings} from './project-settings.js';
import {transition} from '../../dist/vendor/core.js';
export function mountTaskCatalogs(root,{tagsRoot=root,repository,project,task,tags,releases,readOnly=false,canManage=true,onChange=()=>{}}){
  let selected=new Set(task?.tagIds||[]),releaseId=task?.releaseId||'',allReleases=[...releases];
  const abort=new AbortController();
  const createReleaseValue='__create_release__';
  root.innerHTML='<div class="task-edit-properties"><div data-release-field></div></div>';
  const tagRow=document.createElement('div');tagRow.className='task-selected-tags';tagsRoot.append(tagRow);
  function renderRelease(){
    const options=[{value:'',label:'Без релиза'},...allReleases.filter(item=>!item.archivedAt||item.id===releaseId).map(item=>({value:item.id,label:catalogLabel(item)}))];
    if(!readOnly&&canManage)options.push({value:createReleaseValue,label:'Новый релиз',icon:'plus'});
    root.querySelector('[data-release-field]').innerHTML=`<iq-combobox name="releaseId" label="Релиз" value="${esc(releaseId)}" options="${esc(JSON.stringify(options))}" placeholder="Найти релиз" ${readOnly?'disabled':''}></iq-combobox>`;
  }
  function renderTags(){
    const available=tags.filter(tag=>!tag.archivedAt||selected.has(tag.id));
    tagRow.innerHTML=available.length?available.map(tag=>`<button type="button" class="iq-btn ${selected.has(tag.id)?'primary':'secondary'} pill sm task-tag-choice" data-inline-tag="${esc(tag.id)}" aria-pressed="${selected.has(tag.id)}" ${readOnly?'disabled':''}><span>${esc(catalogLabel(tag))}</span></button>`).join(''):`<div class="task-tags-empty"><p class="iq-helper">В проекте пока нет тегов.</p>${canManage&&!readOnly?'<button type="button" class="iq-btn ghost sm" data-tag-settings>Добавить в настройках проекта</button>':'<p class="iq-helper">Добавить их может администратор проекта.</p>'}</div>`;
  }
  root.addEventListener('iq-change',event=>{if(event.target.getAttribute('name')==='releaseId'){
    if(event.target.value===createReleaseValue){
      event.target.value=releaseId;
      if(!readOnly&&canManage)editCatalogItem('releases',{repository,project,onSaved:item=>{allReleases.push(item);releaseId=item.id;renderRelease();onChange();}});
    }else{releaseId=event.target.value||'';onChange();}
  }},{signal:abort.signal});
  tagRow.addEventListener('click',event=>{
    if(readOnly)return;
    const button=event.target.closest('[data-inline-tag]');
    if(button){const id=button.dataset.inlineTag;selected.has(id)?selected.delete(id):selected.add(id);button.setAttribute('aria-pressed',String(selected.has(id)));button.classList.toggle('primary',selected.has(id));button.classList.toggle('secondary',!selected.has(id));transition(button.querySelector('span'),[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],230);onChange();}
    if(event.target.closest('[data-tag-settings]'))openTagSettings();
  },{signal:abort.signal});
  function openTagSettings(){
    let settings;const modal=dialog({title:'Настройки проекта · Теги',body:'<div data-inline-tag-settings></div>',wide:true,mount:async el=>{
      settings=await mountProjectTaskSettings(el.querySelector('[data-inline-tag-settings]'),{repository,project,section:'tags',canManage,onBack:()=>el.close()});
      if(!el.isConnected){settings.destroy();return;}el.querySelector('[data-settings-back]').innerHTML=icon('left',16)+'<span>Вернуться к задаче</span>';
    }});
    modal.addEventListener('iq-close',async()=>{settings?.destroy();try{const next=await repository.list('tags',project.id);if(abort.signal.aborted)return;tags=next.sort((a,b)=>a.name.localeCompare(b.name,'ru'));renderTags();}catch(error){if(!abort.signal.aborted)dialog({title:'Не удалось обновить теги',description:error.message});}},{once:true});
  }
  renderRelease();renderTags();
  return {value:()=>({releaseId:releaseId||null,tagIds:[...selected]}),destroy(){abort.abort();}};
}
export async function loadTaskSupport(repository,projectId){
  const [tags,releases,settings,links]=await Promise.all(['tags','releases','taskSettings','taskLinks'].map(name=>repository.list(name,projectId)));
  return {tags:tags.sort((a,b)=>a.name.localeCompare(b.name,'ru')),releases:releases.sort((a,b)=>a.name.localeCompare(b.name,'ru')),settings:settings[0]||null,links};
}
