import {inspectFile,IMAGE_PIXELS} from './attachment-model.js';
import {requireValue} from '../common.js';
/** Browser-only preparation. Binary payloads are stored as Blob, never data URLs. */
export async function prepareBrowserAttachment(file,{signal}={}){
  signal?.throwIfAborted();
  const bytes=new Uint8Array(await file.arrayBuffer()),metadata=inspectFile(file.name,bytes);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  metadata.sha256=[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
  const blobs={original:new Blob([bytes],{type:metadata.mime})};
  if(metadata.image){
    const bitmap=await createImageBitmap(blobs.original);
    try{
      requireValue(bitmap.width*bitmap.height<=IMAGE_PIXELS,'IMAGE_SIZE','Изображение слишком большое для предпросмотра.');
      for(const [variant,max] of [['thumb',640],['display',1600]]){
        signal?.throwIfAborted();
        const scale=Math.min(1,max/bitmap.width,max/bitmap.height),canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        blobs[variant]=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось подготовить изображение.')),'image/webp',0.82));
        if(variant==='display')Object.assign(metadata,{width:canvas.width,height:canvas.height});
      }
      metadata.previewMime='image/webp';
    }finally{bitmap.close();}
  }
  signal?.throwIfAborted();return {metadata,blobs};
}
