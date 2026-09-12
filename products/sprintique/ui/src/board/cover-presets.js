import {dialog,esc,icon} from '../ui.js';
import {COVER_PRESETS as presets} from './cover-assets.js';

export function openCoverPresets(onSelect){
  let closed=false,busy=false;
  const el=dialog({title:'Обложка задачи',description:'Готовый фон для задачи — или ваше изображение.',body:`<div class="task-cover-presets">${presets.map(p=>`<button type="button" class="task-cover-preset" data-cover-preset="${p.id}"><img src="${p.src}" alt="" width="1942" height="809"><span>${esc(p.name)}</span></button>`).join('')}</div><button type="button" class="file-dropwell task-cover-upload" data-upload-cover>${icon('upload',18)}<span class="task-dropwell-copy"><span>Загрузить свою обложку</span><small>PNG, JPG или WebP · до 10 МБ</small></span></button>`,mount:element=>{
    element.querySelectorAll('[data-cover-preset]').forEach((button,index)=>{
      button.addEventListener('click',async()=>{
        if(busy)return;busy=true;
        element.querySelectorAll('[data-cover-preset],[data-upload-cover]').forEach(b=>{b.disabled=true;});
        try{
          const response=await fetch(presets[index].src);if(!response.ok)throw Error('Обложка недоступна');
          const bytes=await response.arrayBuffer();
          if(closed)return;
          onSelect(new File([bytes],`cover-${presets[index].id}.webp`,{type:'image/webp'}));el.close();
        }catch{busy=false;element.querySelectorAll('[data-cover-preset],[data-upload-cover]').forEach(b=>{b.disabled=false;});}
      });
    });
    element.querySelector('[data-upload-cover]').addEventListener('click',()=>{onSelect(null);el.close();});
  }});
  el.addEventListener('iq-close',()=>{closed=true;},{once:true});
  return {destroy(){closed=true;el.close(true);}};
}
