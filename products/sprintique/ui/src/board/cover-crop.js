import {registerAdvanced} from '@iquipage/web/advanced';
import {dialog,icon} from '../ui.js';
export const COVER_RATIO=12/5;
/** Per axis the frame lies inside the image, or contains it whole ("Вписать", a letterboxed cover). */
const axis=(position,size)=>size<=1?position>=-1e-6&&position<=1-size+1e-6:position<=1e-6&&position>=1-size-1e-6;
export const coverLetterboxed=crop=>!!crop&&(crop.width>1.001||crop.height>1.001);
export function coverImageStyle(crop,id){
  if(!crop||crop.attachmentId!==id)return '';
  const {x,y,width,height}=crop;
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||width>20||height>20||!axis(x,width)||!axis(y,height))return '';
  return `position:absolute;width:${100/width}%;height:${100/height}%;max-width:none;left:${-100*x/width}%;top:${-100*y/height}%;object-fit:fill`;
}
/** One surface: the DS cropper in its bare appearance fills the dialog body and the dialog owns the only footer.
 *  The whole image stays visible around the 12:5 frame; "Вписать" keeps a screenshot or a logo whole. */
export function editCoverImage(file,{crop:previous,onApply=()=>{}}={}){
  registerAdvanced();let cropper,closed=false;
  const modal=dialog({title:'Обложка задачи',body:'<iq-image-crop appearance="bare" letterbox chooser></iq-image-crop>',wide:true,submitLabel:'Использовать кадр',
    onSubmit:async()=>{
      const crop=cropper?.normalizedValue;if(!crop)throw Error('Выберите изображение.');
      await onApply(cropper.source,crop);
    },
    mount:async el=>{
      el.classList.add('cover-crop-dialog');
      const footer=el.querySelector('.iq-dialog-footer');footer.insertAdjacentHTML('afterbegin','<p class="cover-crop-note">Кадр 12 : 5, как на доске и в задаче</p>');
      footer.querySelector('[type=submit]')?.insertAdjacentHTML('afterbegin',icon('check',16));
      cropper=el.querySelector('iq-image-crop');cropper.aspectRatio=COVER_RATIO;
      if(await cropper.load(file)&&!closed){
        if(previous){try{cropper.normalizedValue=previous;}catch{cropper.fit('auto');}}else cropper.fit('auto');
      }
    }});
  modal.addEventListener('iq-close',()=>{closed=true;},{once:true});return modal;
}
