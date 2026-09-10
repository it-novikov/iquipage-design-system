import {dialog,input,select,icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {TAG_TONES} from './workspace-model.js';
const colors={neutral:['--iq-recessed','--iq-muted'],blue:['--iq-avatar-blue-bg','--iq-avatar-blue-ink'],purple:['--iq-task-epic-surface','--iq-task-epic-text'],green:['--iq-avatar-sage-bg','--iq-avatar-sage-ink'],amber:['--iq-task-high-surface','--iq-task-high-text'],red:['--iq-task-critical-surface','--iq-task-critical-text']};
export function tagMarkup(tag){
  const [background,color]=colors[tag.tone]||colors.neutral;
  return `<span class="iq-tag" style="background:var(${background});color:var(${color})">${esc(tag.name)}${tag.archivedAt?' · в архиве':''}</span>`;
}
export function editCatalogItem(collection,{repository,project,item=null,name='',onSaved=()=>{}}){
  const isTag=collection==='tags';
  const body=input('name','Название',item?.name||name,{required:true,maxlength:100})+(isTag?select('tone','Цвет',item?.tone||'blue',Object.entries(TAG_TONES)):`<iq-date-field name="targetDate" label="Плановая дата" value="${esc(item?.targetDate||'')}"></iq-date-field>${select('status','Состояние',item?.status||'planned',[['planned','Планируется'],['released','Выпущен']])}`);
  return dialog({title:item?(isTag?'Изменить тег':'Изменить релиз'):(isTag?'Новый тег':'Новый релиз'),body,submitLabel:'Сохранить',onSubmit:async(values,form)=>{
    const record={...(item||{id:uid(isTag?'tag':'release'),projectId:project.id,revision:0,archivedAt:null}),name:String(values.get('name')||'').trim()};
    if(isTag)record.tone=values.get('tone');else {record.status=values.get('status');record.targetDate=form.querySelector('iq-date-field').value||null;}
    const saved=await repository.write(collection,record,item?.revision||0);await onSaved(saved);
  }});
}
export function catalogLabel(item){return item.name+(item.archivedAt?' · в архиве':'');}
