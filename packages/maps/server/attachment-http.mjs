import {requireValue,validId} from '../src/common.js';
import {FILE_LIMIT} from '../src/board/attachment-model.js';
/** Binary transport, separate from generic JSON writes. No inline original documents. */
export function attachmentRoutes(store){
  let receiving=0;
  return async(req,res,url,parts,send)=>{
    if(parts[1]!=='files')return false;
    const input={id:parts[2],projectId:url.searchParams.get('projectId'),taskId:url.searchParams.get('taskId')};
    requireValue([input.id,input.projectId,input.taskId].every(validId)&&[3,4].includes(parts.length),'FILE_ID','Некорректная ссылка на файл.');
    if(req.method==='GET'){
      if(parts.length===3){send(res,200,await store.describe(input));return true;}
      const variant=parts[3],result=await store.blob({...input,variant});
      res.setHeader('Content-Type',result.mime);res.setHeader('Content-Length',result.bytes.length);
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Cross-Origin-Resource-Policy','same-origin');
      if(variant==='original')res.setHeader('Content-Disposition',`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(result.meta.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`);
      res.end(result.bytes);return true;
    }
    requireValue(parts.length===3&&['PUT','DELETE'].includes(req.method),'METHOD','Неподдерживаемое действие с файлом.');
    requireValue(req.headers['x-maps-client']==='reference','CSRF','Неподдерживаемый клиент записи.');
    requireValue(!req.headers.origin||req.headers.origin===`http://${req.headers.host}`,'CSRF','Запрос с другого origin отклонён.');
    if(req.method==='DELETE'){send(res,200,{discarded:await store.discard(input)});return true;}
    requireValue(req.headers['content-type']==='application/octet-stream','CONTENT_TYPE','Требуется двоичный файл.');
    requireValue(!req.headers['content-length']||Number(req.headers['content-length'])<=FILE_LIMIT,'FILE_SIZE','Файл не должен превышать 10 МБ.');
    requireValue(receiving<2,'FILE_BUSY','Другие файлы ещё загружаются. Повторите попытку.');
    const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};
    req.once('aborted',abort);res.once('close',abort);receiving++;
    try{
      const chunks=[];let size=0;
      for await(const part of req){size+=part.length;requireValue(size<=FILE_LIMIT,'FILE_SIZE','Файл не должен превышать 10 МБ.');chunks.push(part);}      const saved=await store.upload({...input,name:url.searchParams.get('name')},Buffer.concat(chunks),{signal:controller.signal});
      send(res,200,saved);return true;
    }finally{receiving--;req.removeListener('aborted',abort);res.removeListener('close',abort);}
  };
}
