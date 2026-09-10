import {mkdir,readFile,writeFile,rename,rm,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {prepareAttachment} from './attachment-images.mjs';
import {attachmentMetadata,sameAttachment,fileReadable,STAGING_TTL} from '../src/board/attachment-model.js';
import {clone,requireValue,validId} from '../src/common.js';

/** Local reference only. The host must implement authoritative authentication and ACL. */
export class FileAttachmentStore {
  constructor(repository){
    this.repository=repository;
    this.directory=path.join(repository.directory,'attachments');
    this.active=0;
  }
  async init(){await mkdir(this.directory,{recursive:true,mode:0o700});return this;}
  serialize(action){
    const operation=this.repository.queue.catch(()=>{}).then(action);
    this.repository.queue=operation;return operation;
  }
  validateTarget({id,projectId,taskId}){
    requireValue([id,projectId,taskId].every(validId),'FILE_ID','Не задана задача для файла.');
    const task=this.repository.data.tasks.get(taskId);
    requireValue(!task||(task.projectId===projectId&&!task.archivedAt),'FILE_ACCESS','Задача недоступна для загрузки.');
  }
  async upload(input,bytes,{signal}={}){
    this.validateTarget(input);signal?.throwIfAborted();
    requireValue(this.active<2,'FILE_BUSY','Обрабатываются другие файлы. Повторите загрузку.');
    this.active++;
    try{return await this.prepareAndStore(input,bytes,signal);}finally{this.active--;}
  }
  async prepareAndStore(input,bytes,signal){
    const prepared=await prepareAttachment(input.name,bytes);signal?.throwIfAborted();
    const candidate=attachmentMetadata(input,prepared.metadata,this.repository.context.actorId);
    return this.serialize(async()=>{
      signal?.throwIfAborted();this.validateTarget(input);
      const previous=this.repository.data.attachments.get(input.id);
      if(previous){const value=sameAttachment(previous,candidate);requireValue(fileReadable(value,this.repository.data.tasks.get(input.taskId),input.projectId,input.taskId,this.repository.context.actorId),'FILE_EXPIRED','Загрузка истекла. Выберите файл заново.');return clone(value);}
      const temp=path.join(this.directory,'.staging-'+randomUUID()),target=path.join(this.directory,input.id);
      let published=false;
      await mkdir(temp,{mode:0o700});
      try{
        for(const [variant,data] of Object.entries(prepared.blobs)){
          signal?.throwIfAborted();await writeFile(path.join(temp,variant),data,{mode:0o600,flush:true});
        }
        signal?.throwIfAborted();
        // A prior process may have died after blob rename but before metadata commit.
        await rm(target,{recursive:true,force:true});await rename(temp,target);published=true;
        const payload=this.repository.snapshot();payload.attachments.push(candidate);
        await this.repository.persist(payload,signal);
        this.repository.data.attachments.set(candidate.id,clone(candidate));return clone(candidate);
      }catch(error){if(published)await rm(target,{recursive:true,force:true}).catch(()=>{});throw error;}
      finally{await rm(temp,{recursive:true,force:true}).catch(()=>{});}
    });
  }
  async describe({id,projectId,taskId}){
    requireValue([id,projectId,taskId].every(validId),'FILE_ID','Некорректная ссылка на файл.');
    await this.repository.queue.catch(()=>{});
    const meta=this.repository.data.attachments.get(id),task=this.repository.data.tasks.get(taskId);
    requireValue(fileReadable(meta,task,projectId,taskId,this.repository.context.actorId),'FILE_ACCESS','Файл недоступен в этой задаче.');return clone(meta);
  }
  async blob(input){
    requireValue(['original','thumb','display'].includes(input.variant),'FILE_VARIANT','Неизвестная версия файла.');
    const meta=await this.describe(input);
    requireValue(input.variant==='original'||meta.image,'FILE_VARIANT','Для этого файла нет изображения.');
    const bytes=await readFile(path.join(this.directory,meta.id,input.variant));
    return {meta,bytes,mime:input.variant==='original'?'application/octet-stream':'image/webp'};
  }
  async discard(input){
    return this.serialize(async()=>{
      this.validateTarget(input);
      const meta=this.repository.data.attachments.get(input.id);
      if(!meta)return false;
      requireValue(meta.projectId===input.projectId&&meta.taskId===input.taskId&&meta.actorId===this.repository.context.actorId,'FILE_ACCESS','Загрузка недоступна.');
      if(meta.state!=='staged')return false;
      const next={...meta,state:'detached',revision:meta.revision+1,updatedAt:new Date().toISOString()};
      const payload=this.repository.snapshot();payload.attachments=payload.attachments.map(item=>item.id===next.id?next:item);
      await this.repository.persist(payload);this.repository.data.attachments.set(next.id,next);return true;
    });
  }
  async collect(at=Date.now()){
    return this.serialize(async()=>{
      const payload=this.repository.snapshot(),expired=payload.attachments.filter(meta=>
        meta.state==='staged'?Date.parse(meta.expiresAt)<=at:meta.state==='detached'&&Date.parse(meta.updatedAt)+STAGING_TTL<=at);
      const ids=new Set(expired.map(meta=>meta.id));
      if(ids.size){payload.attachments=payload.attachments.filter(meta=>!ids.has(meta.id));await this.repository.persist(payload);for(const id of ids)this.repository.data.attachments.delete(id);}
      const known=new Set(payload.attachments.map(meta=>meta.id));
      for(const item of await readdir(this.directory,{withFileTypes:true}))if(item.isDirectory()&&!known.has(item.name)&&(/^\.staging-[\w-]+$/.test(item.name)||validId(item.name))){
        const folder=path.join(this.directory,item.name);if(ids.has(item.name)||(await stat(folder)).mtimeMs+STAGING_TTL<=at)await rm(folder,{recursive:true});
      }
      return ids.size;
    });
  }
}
