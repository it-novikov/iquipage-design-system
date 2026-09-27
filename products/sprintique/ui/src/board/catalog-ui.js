import {dialog,input,select,icon,esc} from '../ui.js';
import {tagToneAttributes} from '@iquipage/web/core';
import {uid} from '../common.js';
import {TAG_TONES,TAG_NAME_LIMIT,tagNameLength} from './workspace-model.js';
/** A palette tone name or any RGB colour "#RRGGBB". */
export const isTagColor=value=>/^#[0-9A-F]{6}$/i.test(String(value||''));
export const tagTone=tag=>TAG_TONES[tag?.tone]||isTagColor(tag?.tone)?tag.tone:'neutral';
export function tagMarkup(tag){
  return `<span class="iq-tag" ${tagToneAttributes(tagTone(tag))}>${esc(tag.name)}${tag.archivedAt?' (в архиве)':''}</span>`;
}
/** Tag colour: the palette as live tag swatches, then "Свой цвет" (native picker and hex). The hidden input carries the value. */
function toneChoice(current){
  const custom=isTagColor(current)?current.toUpperCase():'';
  return `<fieldset class="iq-color-field tag-tone-choice"><legend class="iq-control-label">Цвет</legend><input type="hidden" name="tone" value="${esc(current)}">
    <div class="iq-color-swatches tag-tone-options">${Object.entries(TAG_TONES).map(([tone,label])=>`<button type="button" class="iq-tag" data-tone="${tone}" data-tone-choice="${tone}" aria-label="${esc(label)}" aria-pressed="${tone===current}">Тег</button>`).join('')}<button type="button" class="iq-tag" ${tagToneAttributes(custom||'#6E56CF')} data-tone-choice="custom" aria-label="Свой цвет" aria-pressed="${!!custom}" ${custom?'':'hidden'}>Тег</button></div>
    <div class="iq-color-custom"><label class="iq-color-custom-picker"><input type="color" value="${esc((custom||'#6E56CF').toLowerCase())}" aria-label="Свой цвет" data-tone-color><span>Свой цвет</span></label><span class="iq-input-shell"><input type="text" value="${esc(custom)}" placeholder="#6E56CF" maxlength="7" spellcheck="false" aria-label="Цвет в формате HEX" data-tone-hex></span></div></fieldset>`;
}
export function editCatalogItem(collection,{repository,project,item=null,name='',onSaved=()=>{}}){
  const isTag=collection==='tags';
  const body=input('name','Название',item?.name||name,{required:true,maxlength:100})+(isTag?toneChoice(item?.tone||'blue'):`<iq-date-field name="targetDate" label="Плановая дата" value="${esc(item?.targetDate||'')}"></iq-date-field>${select('status','Состояние',item?.status||'planned',[['planned','Планируется'],['released','Выпущен']])}`);
  return dialog({title:item?(isTag?'Изменить тег':'Изменить релиз'):(isTag?'Новый тег':'Новый релиз'),body,submitLabel:'Сохранить',mount:(_,form)=>{
    if(!isTag)return;
    const field=form.querySelector('input[name=name]'),tone=form.querySelector('input[name=tone]'),counter=document.createElement('small');
    field.maxLength=1000;counter.className='iq-helper';counter.setAttribute('aria-live','polite');field.closest('.iq-field')?.append(counter);
    const update=()=>{
      const count=tagNameLength(field.value.trim());counter.textContent=`${count} / ${TAG_NAME_LIMIT} символа`;
      field.setCustomValidity(field.value.trim()!==item?.name&&count>TAG_NAME_LIMIT?`Название тега — до ${TAG_NAME_LIMIT} символов.`:'');
      // Each swatch shows the tag as it will look, so the choice is the preview.
      for(const swatch of form.querySelectorAll('[data-tone-choice]')){swatch.textContent=field.value.trim()||'Тег';swatch.setAttribute('aria-pressed',String(swatch.dataset.toneChoice===tone.value||swatch.dataset.toneChoice==='custom'&&isTagColor(tone.value)));}
    };
    const customSwatch=form.querySelector('[data-tone-choice=custom]'),picker=form.querySelector('[data-tone-color]'),hex=form.querySelector('[data-tone-hex]');
    const setCustom=value=>{const color=value.toUpperCase();tone.value=color;customSwatch.hidden=false;const attrs=document.createElement('template');attrs.innerHTML=`<i ${tagToneAttributes(color)}></i>`;const probe=attrs.content.firstElementChild;customSwatch.dataset.tone=probe.dataset.tone;customSwatch.dataset.tagColor=probe.dataset.tagColor;update();};
    form.addEventListener('click',event=>{const swatch=event.target.closest('[data-tone-choice]');if(!swatch)return;if(swatch.dataset.toneChoice==='custom'){setCustom('#'+swatch.dataset.tagColor);return;}tone.value=swatch.dataset.toneChoice;update();});
    picker.addEventListener('input',()=>{hex.value=picker.value.toUpperCase();setCustom(picker.value);});
    hex.addEventListener('input',()=>{const value=hex.value.trim().replace(/^([0-9a-f])/i,'#$1');if(isTagColor(value)){picker.value=value.toLowerCase();setCustom(value);}});
    field.addEventListener('input',update);update();
  },onSubmit:async(values,form)=>{
    const record={...(item||{id:uid(isTag?'tag':'release'),projectId:project.id,revision:0,archivedAt:null}),name:String(values.get('name')||'').trim()};
    if(isTag)record.tone=values.get('tone');else {record.status=values.get('status');record.targetDate=form.querySelector('iq-date-field').value||null;}
    const saved=await repository.write(collection,record,item?.revision||0);await onSaved(saved);
  }});
}
export function catalogLabel(item){return item.name+(item.archivedAt?' (в архиве)':'');}
