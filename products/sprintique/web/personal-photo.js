import {registerAdvanced} from '@iquipage/web/advanced';
import {icon} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {preparePhoto} from './photo-prepare.js';

/** One square crop surface for personal photos: the DS cropper in its bare appearance inside a dialog that owns the
 *  only title and footer. `save` receives the 512 px WebP (PNG where the browser cannot encode WebP) inside the
 *  dialog, so a refusal is shown there and another photo can be chosen. Resolves with what `save` returned, or null. */
export function cropSquareImage({title,note,round=false,save,track=el=>el}){
  registerAdvanced();
  return new Promise(resolve=>{
    let result=null;
    const element=track(dialog({title,body:`<iq-image-crop appearance="bare" chooser${round?' mask="circle"':''}></iq-image-crop>`,submitLabel:'Использовать',
      onSubmit:async()=>{
        const crop=element.querySelector('iq-image-crop');if(!crop.value)throw Error('Выберите изображение.');
        result=await save(await crop.export({size:512,type:'image/webp',quality:.9}));
      },
      mount:el=>{
        el.classList.add('cover-crop-dialog','square-crop-dialog');
        const crop=el.querySelector('iq-image-crop');crop.aspectRatio=1;
        const footer=el.querySelector('.iq-dialog-footer'),submit=footer.querySelector('[type=submit]'),error=el.querySelector('.map-form-error');
        footer.insertAdjacentHTML('afterbegin',`<p class="cover-crop-note">${note}</p>`);
        submit?.insertAdjacentHTML('afterbegin',icon('check',16));
        const fail=message=>{error.textContent=message;error.hidden=!message;};
        // DS-GAP: the cropper opens PNG, JPEG and WebP up to 10 MB and 40 megapixels only. Its file choice is
        // widened to any image and converted here first, so photos from phones and cameras open too.
        el.addEventListener('click',event=>{const input=event.target.closest?.('input[type=file]');if(input&&crop.contains(input))input.accept='image/*';},true);
        el.addEventListener('change',async event=>{
          const input=event.target;if(!(input instanceof HTMLInputElement)||input.type!=='file'||!crop.contains(input))return;
          event.stopPropagation();const file=input.files?.[0];input.value='';if(!file)return;
          fail('');if(submit)submit.disabled=true;crop.setAttribute('aria-busy','true');
          try{const prepared=await preparePhoto(file);if(await crop.load(prepared))crop.fit('auto');}
          catch(cause){fail(cause.message);}
          finally{if(submit)submit.disabled=false;crop.removeAttribute('aria-busy');}
        },true);
      }}));
    element.addEventListener('iq-close',()=>resolve(result),{once:true});
  });
}
/** Crops and uploads the person's own photo. Resolves with the new photo revision, or null when cancelled. */
export async function pickPersonalPhoto({client,track=el=>el}){
  const revision=await cropSquareImage({title:'Фото профиля',note:'Фото будет круглым, как рядом с вашим именем',round:true,track,
    save:async blob=>(await client.setAvatar(blob)).avatarRevision});
  return revision;
}
