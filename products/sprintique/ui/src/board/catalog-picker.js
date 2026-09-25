import {dialog,icon,esc} from '../ui.js';
import {editCatalogItem,catalogLabel,tagTone} from './catalog-ui.js';
import {mountProjectTaskSettings} from './project-settings.js';
/** Selectable DS tag: the tone stays visible in both states; a check and ring mark the selection. */
const tagChoice=(tag,pressed,readOnly)=>`<button type="button" class="iq-tag task-tag-choice" data-tone="${tagTone(tag)}" data-inline-tag="${esc(tag.id)}" aria-pressed="${pressed}" ${readOnly?'disabled':''}>${pressed?icon('check',12):''}<span>${esc(catalogLabel(tag))}</span></button>`;
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
    tagRow.innerHTML=available.length?available.map(tag=>tagChoice(tag,selected.has(tag.id),readOnly)).join(''):`<div class="task-tags-empty"><p class="iq-helper">В проекте пока нет тегов.</p>${canManage&&!readOnly?'<button type="button" class="iq-btn ghost sm" data-tag-settings>Добавить в настройках проекта</button>':'<p class="iq-helper">Добавить их может администратор проекта.</p>'}</div>`;
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
    if(button){const id=button.dataset.inlineTag;selected.has(id)?selected.delete(id):selected.add(id);const tag=tags.find(item=>item.id===id);if(tag){const next=document.createElement('template');next.innerHTML=tagChoice(tag,selected.has(id),readOnly);button.replaceWith(next.content.firstElementChild);tagRow.querySelector(`[data-inline-tag="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}onChange();}
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
export async function loadTaskSupport(repository,projectId,{signal}={}){
  const [tags,releases,settings]=await Promise.all(['tags','releases','taskSettings'].map(name=>repository.capabilities?.[name]===false?[]:repository.list(name,projectId,{signal})));
  return {tags:tags.sort((a,b)=>a.name.localeCompare(b.name,'ru')),releases:releases.sort((a,b)=>a.name.localeCompare(b.name,'ru')),settings:settings[0]||null};
}
