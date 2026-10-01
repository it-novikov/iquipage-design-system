import {dialog,esc} from '../ui.js';
import {formatDate} from '@iquipage/web/core';
import {editCatalogItem,catalogLabel,tagTone} from './catalog-ui.js';
// "до 06.10" in the current year, "до 06.10.2027" otherwise: the value column is narrow.
const shortDate=value=>{const text=formatDate(value);return String(value).slice(0,4)===String(new Date().getFullYear())?text.slice(0,5):text;};
/** The quiet second part of a release value: its target date or that it is out. */
const releaseMeta=item=>item.status==='released'?'выпущен':item.targetDate?`до ${shortDate(item.targetDate)}`:'';
export function mountTaskCatalogs(root,{tagsRoot=root,repository,project,task,tags,releases,readOnly=false,canManage=true,onChange=()=>{}}){
  let selected=new Set(task?.tagIds||[]),releaseId=task?.releaseId||'',allReleases=[...releases];
  const abort=new AbortController();
  const createReleaseValue='__create_release__';
  function renderRelease(){
    // A release reads as its name; its date is in the open list (meta), where search lives too.
    const options=[{value:'',label:'Без релиза'},...allReleases.filter(item=>!item.archivedAt||item.id===releaseId).map(item=>({value:item.id,label:catalogLabel(item),...(releaseMeta(item)?{meta:releaseMeta(item)}:{})}))];
    if(!readOnly&&canManage)options.push({value:createReleaseValue,label:'Новый релиз',icon:'plus',separator:true});
    root.innerHTML=`<iq-select name="releaseId" label="Релиз" searchable search-placeholder="Найти релиз" value="${esc(releaseId)}" options="${esc(JSON.stringify(options))}" ${readOnly?'disabled':''}></iq-select>`;
  }
  // Tags use the DS tag picker as a ghost value of the properties list: chosen tags in their colours, a click opens
  // the search over the project catalog; an unmatched search offers a new tag to admins.
  tagsRoot.insertAdjacentHTML('beforeend',`<iq-tag-picker label="Теги" appearance="ghost" ${canManage&&!readOnly?'creatable':''} ${readOnly?'readonly':''}></iq-tag-picker>`);
  const picker=tagsRoot.querySelector('iq-tag-picker');
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
