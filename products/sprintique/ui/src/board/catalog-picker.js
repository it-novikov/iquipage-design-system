import {dialog,esc} from '../ui.js';
import {editCatalogItem,catalogLabel,tagTone} from './catalog-ui.js';
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
  // Tags use the DS tag picker: chosen tags in their colours, search over the project catalog, creation for admins.
  tagRow.innerHTML=`<iq-tag-picker label="Теги" ${canManage&&!readOnly?'creatable':''} ${readOnly?'readonly':''}></iq-tag-picker>`;
  const picker=tagRow.querySelector('iq-tag-picker');
  function renderTags(){
    picker.options=tags.map(tag=>({value:tag.id,label:tag.name,tone:tagTone(tag),archived:!!tag.archivedAt}));
    picker.value=[...selected];
  }
  picker.addEventListener('iq-change',event=>{event.stopPropagation();selected=new Set(event.detail.value);onChange();},{signal:abort.signal});
  // "+ Новый тег" (or an unmatched search) opens the tag dialog: name and colour swatches, prefilled with the search.
  picker.addEventListener('iq-create',event=>{
    const {label,accept}=event.detail;
    editCatalogItem('tags',{repository,project,name:label.slice(0,100),tags,onSaved:saved=>{
      if(abort.signal.aborted)return;tags=[...tags,saved].sort((a,b)=>a.name.localeCompare(b.name,'ru'));accept({value:saved.id,label:saved.name,tone:tagTone(saved)});
    }});
  },{signal:abort.signal});
  root.addEventListener('iq-change',event=>{if(event.target.getAttribute('name')==='releaseId'){
    if(event.target.value===createReleaseValue){
      event.target.value=releaseId;
      if(!readOnly&&canManage)editCatalogItem('releases',{repository,project,onSaved:item=>{allReleases.push(item);releaseId=item.id;renderRelease();onChange();}});
    }else{releaseId=event.target.value||'';onChange();}
  }},{signal:abort.signal});
  renderRelease();renderTags();
  return {value:()=>({releaseId:releaseId||null,tagIds:[...selected]}),destroy(){abort.abort();}};
}
export async function loadTaskSupport(repository,projectId,{signal}={}){
  const [tags,releases,settings]=await Promise.all(['tags','releases','taskSettings'].map(name=>repository.capabilities?.[name]===false?[]:repository.list(name,projectId,{signal})));
  return {tags:tags.sort((a,b)=>a.name.localeCompare(b.name,'ru')),releases:releases.sort((a,b)=>a.name.localeCompare(b.name,'ru')),settings:settings[0]||null};
}
