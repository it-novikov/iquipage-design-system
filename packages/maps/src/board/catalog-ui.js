import {dialog,input,select,icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {TAG_TONES,TAG_NAME_LIMIT,tagNameLength} from './workspace-model.js';
const colors={neutral:['--iq-recessed','--iq-muted'],blue:['--iq-avatar-blue-bg','--iq-avatar-blue-ink'],purple:['--iq-task-epic-surface','--iq-task-epic-text'],green:['--iq-avatar-sage-bg','--iq-avatar-sage-ink'],amber:['--iq-task-high-surface','--iq-task-high-text'],red:['--iq-task-critical-surface','--iq-task-critical-text']};
export function tagMarkup(tag){
  const [background,color]=colors[tag.tone]||colors.neutral;
  return `<span class="iq-tag" style="background:var(${background});color:var(${color})">${esc(tag.name)}${tag.archivedAt?' · в архиве':''}</span>`;
}
export function editCatalogItem(collection,{repository,project,item=null,name='',onSaved=()=>{}}){
  const isTag=collection==='tags';
  const body=input('name','Название',item?.name||name,{required:true,maxlength:100})+(isTag?select('tone','Цвет фона',item?.tone||'blue',Object.entries(TAG_TONES))+'<div data-tag-preview aria-label="Предпросмотр тега"></div>':`<iq-date-field name="targetDate" label="Плановая дата" value="${esc(item?.targetDate||'')}"></iq-date-field>${select('status','Состояние',item?.status||'planned',[['planned','Планируется'],['released','Выпущен']])}`);
  return dialog({title:item?(isTag?'Изменить тег':'Изменить релиз'):(isTag?'Новый тег':'Новый релиз'),body,submitLabel:'Сохранить',mount:(_,form)=>{
    if(!isTag)return;
    const field=form.querySelector('input[name=name]'),tone=form.querySelector('iq-select[name=tone]'),counter=document.createElement('small');
    field.maxLength=1000;counter.className='iq-helper';counter.setAttribute('aria-live','polite');field.closest('.iq-field')?.append(counter);
    const update=()=>{
      const count=tagNameLength(field.value.trim());counter.textContent=`${count} / ${TAG_NAME_LIMIT} символа`;
      field.setCustomValidity(field.value.trim()!==item?.name&&count>TAG_NAME_LIMIT?`Название тега — до ${TAG_NAME_LIMIT} символов.`:'');
      form.querySelector('[data-tag-preview]').innerHTML=tagMarkup({name:field.value.trim()||'Название тега',tone:tone.value});
    };
    field.addEventListener('input',update);tone.addEventListener('iq-change',update);update();
  },onSubmit:async(values,form)=>{
    const record={...(item||{id:uid(isTag?'tag':'release'),projectId:project.id,revision:0,archivedAt:null}),name:String(values.get('name')||'').trim()};
    if(isTag)record.tone=values.get('tone');else {record.status=values.get('status');record.targetDate=form.querySelector('iq-date-field').value||null;}
    const saved=await repository.write(collection,record,item?.revision||0);await onSaved(saved);
  }});
}
export function catalogLabel(item){return item.name+(item.archivedAt?' · в архиве':'');}
