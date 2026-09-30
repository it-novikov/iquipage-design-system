import {clone,requireValue,validId,validText,now} from '../common.js';
import {fileTypeOf,HEAD_BYTES} from '../../../contracts/media.ts';
/** Per axis the frame lies inside the image or contains it whole (a letterboxed "Вписать" cover). */
const coverAxisValid=(position,size)=>size<=1?position>=-1e-6&&position<=1-size+1e-6:position<=1e-6&&position>=1-size-1e-6;
export {FILE_LIMIT,IMAGE_PIXELS} from '../../../contracts/media.ts';
/** The in-browser reference adapters hold a file whole; the server streams up to FILE_LIMIT. */
export const LOCAL_FILE_LIMIT = 10 * 1024 * 1024;
export const STAGING_TTL = 24 * 60 * 60 * 1000;
export function inspectFile(name,bytes){
  requireValue(validText(name,180)&&name.trim()===name&&name.length&&!/[\x00-\x1f\x7f/\\]/.test(name),'FILE_NAME','Некорректное имя файла.');
  requireValue(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=LOCAL_FILE_LIMIT,'FILE_SIZE','Файл должен быть непустым и не больше 10 МБ.');
  const type=fileTypeOf(name);let valid=type.matches(bytes.subarray(0,HEAD_BYTES));
  if(valid&&type.text)try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!bytes.includes(0);}catch{valid=false;}
  requireValue(valid,'FILE_CONTENT','Содержимое файла не соответствует формату.');
  return {name,mime:type.mime,size:bytes.length,image:type.previewable};
}
export function attachmentMetadata(input,processed,actorId){
  requireValue(validId(input.id)&&validId(input.taskId)&&validId(input.projectId),'FILE_ID','Не задана задача для файла.');
  requireValue(/^[a-f0-9]{64}$/.test(processed.sha256),'FILE_HASH','Не удалось проверить файл.');
  return {...processed,id:input.id,taskId:input.taskId,projectId:input.projectId,actorId,state:'staged',revision:1,createdAt:now(),expiresAt:new Date(Date.now()+STAGING_TTL).toISOString()};
}
export function sameAttachment(previous,next){
  requireValue(!previous||(previous.sha256===next.sha256&&previous.name===next.name&&previous.projectId===next.projectId&&previous.taskId===next.taskId&&previous.actorId===next.actorId),'FILE_CONFLICT','Этот ID загрузки уже использован другим файлом.');
  requireValue(!previous||previous.state!=='detached','FILE_REMOVED','Файл уже удалён. Загрузите его заново.');
  return previous||next;
}
export function fileReadable(meta,task,projectId,taskId,actorId){
  return !!meta&&meta.projectId===projectId&&meta.taskId===taskId&&
    ((meta.state==='attached'&&task?.attachmentIds?.includes(meta.id))||
     (meta.state==='staged'&&meta.actorId===actorId&&Date.parse(meta.expiresAt)>Date.now()));
}
export function validateTaskAttachments(task,previous,assets=[],actorId='local-user'){
  const ids=task.attachmentIds??[],cover=task.coverAttachmentId??null,byId=new Map(assets.map(asset=>[asset.id,asset]));
  requireValue(Array.isArray(ids)&&ids.every(validId)&&new Set(ids).size===ids.length,'TASK_FILES','Некорректный список вложений.');
  requireValue(cover===null||(validId(cover)&&ids.includes(cover)),'TASK_COVER','Обложка должна быть вложением этой задачи.');
  if(task.coverCrop){const c=task.coverCrop;requireValue(c.attachmentId===cover&&[c.x,c.y,c.width,c.height].every(Number.isFinite)&&c.width>0&&c.height>0&&c.width<=20&&c.height<=20&&coverAxisValid(c.x,c.width)&&coverAxisValid(c.y,c.height),'TASK_CROP','Кадр должен лежать внутри изображения или целиком содержать его.');}
  for(const id of ids){
    const asset=byId.get(id);
    requireValue(fileReadable(asset,previous,task.projectId,task.id,actorId),'TASK_FILE_ACCESS','Файл недоступен или загрузка истекла. Загрузите файл заново.');
    if(id===cover)requireValue(asset.image&&asset.previewMime==='image/webp','TASK_COVER','Обложкой может быть проверенное изображение PNG, JPG или WebP.');
  }
}
export function commitTaskAttachments(task,previous,assets){
  const selected=new Set(task.attachmentIds||[]),before=new Set(previous?.attachmentIds||[]);
  return assets.map(asset=>{
    if(asset.taskId!==task.id||asset.projectId!==task.projectId)return asset;
    const state=selected.has(asset.id)?'attached':before.has(asset.id)?'detached':asset.state;
    return state===asset.state?asset:{...asset,state,revision:asset.revision+1,updatedAt:now()};
  });
}
