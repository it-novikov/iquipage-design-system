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
/** Tag colour: palette circles (radios, arrow keys), "Свой цвет" last; the hex row appears only for a custom colour.
    One live tag preview sits on the legend row. The hidden input carries the value (palette tone or #RRGGBB). */
function toneChoice(current,name){
  const custom=isTagColor(current)?current.toUpperCase():'',tone=custom?'custom':current;
  return `<fieldset class="iq-color-field tag-tone-choice"><legend class="iq-color-legend"><span class="iq-control-label">Цвет</span><span class="iq-tag" ${tagToneAttributes(custom||current)} data-tone-preview>${esc(name||'Новый тег')}</span></legend><input type="hidden" name="tone" value="${esc(custom||current)}">
    <div class="iq-color-swatches" role="radiogroup" aria-label="Цвет тега">${Object.entries(TAG_TONES).map(([id,label])=>`<label class="iq-color-swatch" data-tone="${id}" title="${esc(label)}"><input class="sr-only" type="radio" name="toneChoice" value="${id}" ${id===tone?'checked':''} aria-label="${esc(label)}">${icon('check',14)}</label>`).join('')}<label class="iq-color-swatch iq-color-swatch-custom" ${custom?tagToneAttributes(custom):''} title="Свой цвет"><input class="sr-only" type="radio" name="toneChoice" value="custom" ${custom?'checked':''} aria-label="Свой цвет">${icon(custom?'check':'palette',14)}</label></div>
    <div class="iq-color-custom" data-tone-custom ${custom?'':'hidden'}><input type="color" value="${esc((custom||'#6E56CF').toLowerCase())}" aria-label="Свой цвет" data-tone-color><span class="iq-input-shell"><input type="text" value="${esc(custom||'#6E56CF')}" maxlength="7" spellcheck="false" aria-label="Цвет в формате #RRGGBB" data-tone-hex></span><small class="iq-helper" data-tone-error hidden>Формат #RRGGBB</small></div></fieldset>`;
}
/** A new tag starts with the next palette colour not used in the project yet (round-robin), not always blue. */
export function nextTagTone(tags=[]){const used=new Set(tags.filter(t=>!t.archivedAt).map(t=>t.tone));const palette=Object.keys(TAG_TONES).filter(t=>t!=='neutral');return palette.find(t=>!used.has(t))||palette[tags.length%palette.length];}
export function editCatalogItem(collection,{repository,project,item=null,name='',tags=[],onSaved=()=>{}}){
  const isTag=collection==='tags';
  const body=isTag?input('name','Название',item?.name||name,{maxlength:100})+toneChoice(item?.tone||nextTagTone(tags),item?.name||name)
    :input('name','Название',item?.name||name,{required:true,maxlength:100})+`<iq-date-field name="targetDate" label="Плановая дата" value="${esc(item?.targetDate||'')}"></iq-date-field>${select('status','Состояние',item?.status||'planned',[['planned','Планируется'],['released','Выпущен']])}`;
  const el=dialog({title:item?(isTag?'Изменить тег':'Изменить релиз'):(isTag?'Новый тег':'Новый релиз'),body,submitLabel:item?'Сохранить':'Создать',mount:(_,form)=>{
    if(!isTag)return;
    const field=form.querySelector('input[name=name]'),tone=form.querySelector('input[name=tone]'),preview=form.querySelector('[data-tone-preview]'),counter=document.createElement('small');
    field.maxLength=1000;counter.className='iq-helper iq-color-counter';counter.setAttribute('aria-live','polite');field.closest('.iq-field')?.append(counter);
    requestAnimationFrame(()=>{field.focus();field.select();});
    const probe=value=>{const t=document.createElement('template');t.innerHTML=`<i ${tagToneAttributes(value)}></i>`;return t.content.firstElementChild;};
    const paintPreview=()=>{const p=probe(tone.value);preview.dataset.tone=p.dataset.tone;if(p.dataset.tagColor)preview.dataset.tagColor=p.dataset.tagColor;else delete preview.dataset.tagColor;preview.textContent=field.value.trim()||'Новый тег';};
    const update=()=>{
      const count=tagNameLength(field.value.trim());
      // The counter appears only near the limit.
      counter.hidden=count<24;counter.textContent=`${count} / ${TAG_NAME_LIMIT}`;counter.dataset.tone=count>TAG_NAME_LIMIT?'danger':'';
      field.setCustomValidity(!field.value.trim()?'Введите название тега.':field.value.trim()!==item?.name&&count>TAG_NAME_LIMIT?`Название тега — до ${TAG_NAME_LIMIT} символов.`:'');
      paintPreview();
    };
    const custom=form.querySelector('.iq-color-swatch-custom'),row=form.querySelector('[data-tone-custom]'),picker=form.querySelector('[data-tone-color]'),hex=form.querySelector('[data-tone-hex]'),error=form.querySelector('[data-tone-error]');
    const setCustom=value=>{const color=value.toUpperCase();tone.value=color;const p=probe(color);custom.dataset.tone=p.dataset.tone;custom.dataset.tagColor=p.dataset.tagColor;update();};
    form.addEventListener('change',event=>{
      if(event.target.name!=='toneChoice')return;
      const choice=event.target.value;row.hidden=choice!=='custom';
      custom.querySelector('.iq-icon')?.replaceWith(document.createRange().createContextualFragment(icon(choice==='custom'?'check':'palette',14)));
      if(choice==='custom'){setCustom(isTagColor(hex.value)?hex.value:'#6E56CF');hex.focus();}else{tone.value=choice;delete custom.dataset.tagColor;delete custom.dataset.tone;update();}
    });
    picker.addEventListener('input',()=>{hex.value=picker.value.toUpperCase();error.hidden=true;setCustom(picker.value);});
    hex.addEventListener('input',()=>{const value=hex.value.trim().replace(/^([0-9a-f])/i,'#$1');const ok=isTagColor(value);error.hidden=ok||value.length<7;if(ok){picker.value=value.toLowerCase();setCustom(value);}});
    field.addEventListener('input',update);update();
  },onSubmit:async(values,form)=>{
    const record={...(item||{id:uid(isTag?'tag':'release'),projectId:project.id,revision:0,archivedAt:null}),name:String(values.get('name')||'').trim()};
    if(isTag)record.tone=values.get('tone');else {record.status=values.get('status');record.targetDate=form.querySelector('iq-date-field').value||null;}
    const saved=await repository.write(collection,record,item?.revision||0);await onSaved(saved);
  }});
  if(isTag)el.setAttribute('data-size','compact');
  return el;
}
export function catalogLabel(item){return item.name+(item.archivedAt?' (в архиве)':'');}
