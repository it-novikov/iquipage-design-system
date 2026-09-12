import {ApiError} from '../client/api.ts';

const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
/** Public whiteboard currently accepts inline PNG/JPEG/WebP only. Hydrate privately at the host boundary.
 * The canonical document retains asset IDs, never inline bytes, temporary URLs or S3 object keys.
 */
export class MapMedia {
  constructor(repository){this.repository=repository;this.images=new Map();}
  clear(){this.images.clear();}
  async hydrate(record,{signal}={}){
    const value=structuredClone(record),prefix=record.projectId+':'+record.id+':';
    // Retain only one open map; each image is a server-bounded, re-encoded display derivative.
    for(const key of this.images.keys())if(!key.startsWith(prefix))this.images.delete(key);
    for(const object of value.document.objects){
      if(object.type!=='image')continue;
      const key=prefix+object.id,cached=this.images.get(key);let src;
      if(cached?.assetId===object.assetId&&cached.display)src=cached.src;
      else {const blob=await this.repository.attachmentAdapter.blob({projectId:record.projectId,id:object.assetId,variant:'display'},{signal});src=await dataURL(blob);this.images.set(key,{assetId:object.assetId,src,display:true});}
      object.src=src;delete object.assetId;
    }
    return value;
  }
  async dehydrate(record,{signal}={}){
    const document=structuredClone(record.document);let count=0;
    for(const object of document.objects){
      if(object.type!=='image')continue;
      if(++count>40)throw new ApiError('MAP_IMAGE_LIMIT','На карте может быть до 40 изображений.',422);
      const key=record.projectId+':'+record.id+':'+object.id,cached=this.images.get(key);
      if(cached?.src===object.src)object.assetId=cached.assetId;
      else {
        if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(object.src)||object.src.length>7_500_000)throw new ApiError('MAP_IMAGE','Выберите PNG, JPEG или WebP до 5 МБ.',422);
        const mime=object.src.slice(5,object.src.indexOf(';')),bytes=Uint8Array.from(atob(object.src.split(',')[1]),c=>c.charCodeAt(0));
        const blob=new Blob([bytes],{type:mime}),extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
        const assetId='map-image-'+crypto.randomUUID();
        await this.repository.attachmentAdapter.upload({projectId:record.projectId,id:assetId,targetId:record.id,targetType:'map'},new File([blob],'image.'+extension,{type:blob.type}),{signal});
        object.assetId=assetId;this.images.set(key,{assetId,src:object.src});
      }
      delete object.src;
    }
    return document;
  }
}
