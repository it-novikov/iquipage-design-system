import {registerAdvanced} from '../../dist/vendor/advanced.js';
import {dialog} from '../ui.js';
export const COVER_RATIO=12/5;
export function coverImageStyle(crop,id){
  if(!crop||crop.attachmentId!==id)return '';
  const {x,y,width,height}=crop;
  if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>1.001||y+height>1.001)return '';
  return `position:absolute;width:${100/width}%;height:${100/height}%;max-width:none;left:${-100*x/width}%;top:${-100*y/height}%;object-fit:fill`;
}
/** Shared cropper public API; the original blob stays unchanged in attachment storage. */
export function editCoverImage(file,{crop:previous,onApply=()=>{}}={}){
  registerAdvanced();let cropper,dimensions,closed=false;
  const modal=dialog({title:'Обложка задачи',body:'<iq-image-crop></iq-image-crop>',wide:true,mount:async el=>{
    cropper=el.querySelector('iq-image-crop');cropper.aspectRatio=COVER_RATIO;cropper.controlled=true;
    cropper.content={title:'Выберите кадр обложки',subtitle:'Переместите изображение и настройте масштаб. На доске и в задаче будет один кадр.'};
    cropper.addEventListener('iq-crop-load',e=>{dimensions=e.detail;});
    cropper.addEventListener('iq-crop-request',async event=>{
      const request=event.detail;if(closed||!dimensions){request.reject('Выберите изображение.');return;}
      try{const {x,y,width,height}=request.crop;await onApply(cropper.source,{x:x/dimensions.width,y:y/dimensions.height,width:width/dimensions.width,height:height/dimensions.height});if(!closed&&request.accept())modal.close();}
      catch(error){request.reject(error.message);}
    });
    if(await cropper.load(file)&&previous&&!closed){try{cropper.value={x:previous.x*dimensions.width,y:previous.y*dimensions.height,width:previous.width*dimensions.width,height:previous.height*dimensions.height};}catch{}}
  }});
  modal.addEventListener('iq-close',()=>{closed=true;},{once:true});return modal;
}
