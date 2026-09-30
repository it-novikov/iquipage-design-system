import {registerAdvanced} from '@iquipage/web/advanced';
import {icon} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';

/** One square crop surface for personal photos: the DS cropper in its bare appearance inside
 *  a dialog that owns the only title and footer. Resolves with a 512 px WebP, or null when cancelled. */
export function cropSquareImage({title,note,round=false,track=el=>el}){
  registerAdvanced();
  return new Promise(resolve=>{
    let result=null;
    const element=track(dialog({title,body:`<iq-image-crop appearance="bare" chooser${round?' mask="circle"':''}></iq-image-crop>`,submitLabel:'Использовать',
      onSubmit:async()=>{
        const crop=element.querySelector('iq-image-crop');if(!crop.value)throw Error('Выберите изображение.');
        result=await crop.export({size:512,type:'image/webp',quality:.9});
      },
      mount:el=>{
        el.classList.add('cover-crop-dialog','square-crop-dialog');
        el.querySelector('iq-image-crop').aspectRatio=1;
        const footer=el.querySelector('.iq-dialog-footer');footer.insertAdjacentHTML('afterbegin',`<p class="cover-crop-note">${note}</p>`);
        footer.querySelector('[type=submit]')?.insertAdjacentHTML('afterbegin',icon('check',16));
      }}));
    element.addEventListener('iq-close',()=>resolve(result),{once:true});
  });
}
/** Crops and uploads the person's own photo. Resolves with the new photo revision, or null when cancelled. */
export async function pickPersonalPhoto({client,track=el=>el}){
  const blob=await cropSquareImage({title:'Фото профиля',note:'Фото будет круглым, как рядом с вашим именем',round:true,track});
  if(!blob)return null;
  return (await client.setAvatar(blob)).avatarRevision;
}
