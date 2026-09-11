import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {inspectFile,IMAGE_PIXELS} from '../src/board/attachment-model.js';
import {requireValue} from '../src/common.js';
/** Originals are download-only. Only re-encoded raster derivatives are displayed. */
export async function prepareAttachment(name,buffer){
  const metadata=inspectFile(name,buffer),blobs={original:buffer};
  metadata.sha256=createHash('sha256').update(buffer).digest('hex');
  if(metadata.image){
    const decoder=()=>sharp(buffer,{limitInputPixels:IMAGE_PIXELS,failOn:'warning',animated:false});
    const source=await decoder().metadata();
    requireValue(['png','jpeg','webp'].includes(source.format)&&(!source.pages||source.pages===1),'IMAGE_FORMAT','Обложка должна быть статичным PNG, JPG или WebP.');
    requireValue(source.width>0&&source.height>0&&source.width*source.height<=IMAGE_PIXELS,'IMAGE_SIZE','Изображение слишком большое для предпросмотра.');
    for(const [variant,width] of [['thumb',640],['display',1600]]){
      blobs[variant]=await decoder().rotate().resize({width,height:width,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    }
    const normalized=await sharp(blobs.display).metadata();
    Object.assign(metadata,{width:normalized.width,height:normalized.height,previewMime:'image/webp'});
  }
  return {metadata,blobs};
}
