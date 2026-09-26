import {registerAdvanced} from '@iquipage/web/advanced';
import {dialog} from '../ui/src/ui.js';

/** Opens the DS square crop and uploads the result. Resolves with the new asset id, or null when cancelled. */
export function pickProjectAvatar({repository,project,track=el=>el}){
  registerAdvanced();
  return new Promise(resolve=>{
    let pending=false,result=null;
    const element=track(dialog({title:'Аватар проекта',body:'<iq-image-crop></iq-image-crop>',mount:element=>{
      const crop=element.querySelector('iq-image-crop');crop.controlled=true;crop.aspectRatio=1;
      crop.content={title:'Аватар проекта',subtitle:'Выберите квадратный кадр. Файл до 10 МБ.'};
      crop.addEventListener('iq-crop-request',async event=>{
        const request=event.detail;if(pending)return;pending=true;element.setAttribute('persistent','');
        try{
          const file=new File([await crop.export({size:512,type:'image/webp',quality:.9})],'project-avatar.webp',{type:'image/webp'});
          const asset=await repository.attachmentAdapter.upload({projectId:project.id,id:crypto.randomUUID(),targetType:'project-avatar',targetId:project.id},file,{signal:request.signal});
          if(request.accept()){result=asset.id;element.close(true);}
        }catch(error){request.reject(error.message);}finally{pending=false;element.removeAttribute('persistent');}
      });
    }}));
    element.addEventListener('iq-close',()=>resolve(result),{once:true});
  });
}
