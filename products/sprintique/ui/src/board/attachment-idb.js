import {prepareBrowserAttachment} from './attachment-browser.js';
import {attachmentMetadata,sameAttachment,fileReadable,STAGING_TTL,FILE_LIMIT} from './attachment-model.js';
import {clone,requireValue,validId,DomainError} from '../common.js';
/** Offline reference. Blobs and metadata share an IndexedDB transaction, not JSON/base64. */
export class BrowserAttachmentAdapter {
  constructor(repository){this.repository=repository;this.active=0;}
  async transaction(input,mode,action,{signal,blobs=false}={}){
    requireValue([input.id,input.projectId,input.taskId].every(validId),'FILE_ID','Некорректная ссылка на файл.');
    signal?.throwIfAborted();const db=await this.repository.ready;signal?.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const scopes=['tasks','attachments',...(blobs?['_attachmentBlobs']:[])];
      const tx=db.transaction(scopes,mode),task=tx.objectStore('tasks').get(input.taskId),meta=tx.objectStore('attachments').get(input.id);
      let remaining=2,result,error;
      const abort=()=>{try{tx.abort();}catch{}};
      signal?.addEventListener('abort',abort,{once:true});
      const ready=()=>{if(--remaining)return;try{signal?.throwIfAborted();action({tx,task:task.result,meta:meta.result,set:value=>{result=value;}});}catch(cause){error=cause;tx.abort();}};
      task.onsuccess=meta.onsuccess=ready;
      tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve(result);};
      tx.onerror=()=>{error ||= tx.error;};
      tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(error||signal?.reason||new DomainError('FILE_SAVE','Не удалось сохранить файл. Повторите загрузку.'));};
    });
  }
  actor(){return this.repository.context.actorId;}
  check(meta,task,input){requireValue(fileReadable(meta,task,input.projectId,input.taskId,this.actor()),'FILE_ACCESS','Файл недоступен в этой задаче.');}
  async upload(input,file,{signal,onProgress=()=>{}}={}){
    requireValue(file.size>0&&file.size<=FILE_LIMIT,'FILE_SIZE','Файл должен быть непустым и не больше 10 МБ.');
    requireValue(this.active<2,'FILE_BUSY','Обрабатываются другие файлы. Повторите загрузку.');
    this.active++;onProgress({phase:'preparing'});
    try{
      const prepared=await prepareBrowserAttachment(file,{signal}),candidate=attachmentMetadata(input,prepared.metadata,this.actor());      onProgress({phase:'saving'});
      return await this.transaction(input,'readwrite',({tx,task,meta,set})=>{
        requireValue(!task||(task.projectId===input.projectId&&!task.archivedAt),'FILE_ACCESS','Задача недоступна для загрузки.');
        if(meta){const previous=sameAttachment(meta,candidate);this.check(previous,task,input);set(clone(previous));return;}
        for(const [variant,blob] of Object.entries(prepared.blobs))tx.objectStore('_attachmentBlobs').put({id:candidate.id+':'+variant,blob});
        tx.objectStore('attachments').put(candidate);set(clone(candidate));
      },{signal,blobs:true});
    }finally{this.active--;}
  }
  describe(input,options={}){return this.transaction(input,'readonly',({meta,task,set})=>{this.check(meta,task,input);set(clone(meta));},options);}
  blob(input,{signal}={}){
    requireValue(['original','thumb','display'].includes(input.variant),'FILE_VARIANT','Неизвестная версия файла.');
    return this.transaction(input,'readonly',({tx,task,meta,set})=>{
      this.check(meta,task,input);requireValue(input.variant==='original'||meta.image,'FILE_VARIANT','Для файла нет изображения.');
      const request=tx.objectStore('_attachmentBlobs').get(meta.id+':'+input.variant);
      request.onsuccess=()=>set(request.result?.blob||null);
    },{signal,blobs:true}).then(blob=>{requireValue(blob instanceof Blob,'FILE_MISSING','Содержимое файла недоступно.');return blob;});
  }
  discard(input){return this.transaction(input,'readwrite',({tx,meta,set})=>{
    if(!meta){set(false);return;}
    requireValue(meta.projectId===input.projectId&&meta.taskId===input.taskId&&meta.actorId===this.actor(),'FILE_ACCESS','Загрузка недоступна.');
    if(meta.state!=='staged'){set(false);return;}
    tx.objectStore('attachments').put({...meta,state:'detached',revision:meta.revision+1,updatedAt:new Date().toISOString()});set(true);
  });}
  async collect(at=Date.now()){
    const db=await this.repository.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['attachments','_attachmentBlobs'],'readwrite'),request=tx.objectStore('attachments').getAll();let count=0;
      request.onsuccess=()=>{for(const meta of request.result)if(meta.state==='staged'?Date.parse(meta.expiresAt)<=at:meta.state==='detached'&&Date.parse(meta.updatedAt)+STAGING_TTL<=at){count++;tx.objectStore('attachments').delete(meta.id);for(const variant of ['original','thumb','display'])tx.objectStore('_attachmentBlobs').delete(meta.id+':'+variant);}};
      tx.oncomplete=()=>resolve(count);tx.onabort=()=>reject(tx.error||Error('Очистка не выполнена.'));
    });
  }
}