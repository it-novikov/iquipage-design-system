import {SprintiqueClient,ApiError} from '../client/api.ts';
import {TaskInput} from '../contracts/index.ts';

/** Anti-corruption adapter: existing UI record intents become explicit v1 resource commands. */
export class ProductRepository {
  constructor(client=new SprintiqueClient()){this.client=client;this.listeners=new Set();this.context={};this.capabilities={taskLinks:false,taskSettings:false,attachments:false,maps:false};}
  async initialize(){const session=await this.client.session();this.context.actorId=session.principal.id;return session;}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  async list(collection,projectId){
    if(collection==='tasks'){
      let cursor='',result=[];
      do{const page=await this.client.tasks(projectId,cursor);result.push(...page.items);cursor=page.nextCursor;
        if(result.length>10000)throw new ApiError('BOARD_LIMIT','Для большой доски требуется серверная фильтрация.',409);
      }while(cursor);return result;
    }
    if(['tags','releases'].includes(collection))return this.client.request(`/projects/${encodeURIComponent(projectId)}/${collection}`);
    // Optional UI extensions are explicitly disabled, never projected as persisted server data.
    if(['taskSettings','taskLinks'].includes(collection))throw new ApiError('NOT_IMPLEMENTED','Этот раздел ещё не подключён к API vNext.',501);
    throw new ApiError('NOT_IMPLEMENTED','Этот раздел ещё не подключён к API vNext.',501);
  }
  async read(collection,id,projectId,{signal}={}){
    try{
      if(collection==='tasks')return await this.client.task(projectId,id,signal);
      if(collection==='threads')return await this.client.thread(projectId,id,signal);
      return (await this.list(collection,projectId)).find(r=>r.id===id)||null;
    }catch(error){if(error.status===404)return null;throw error;}
  }
  pageThreads(projectId,taskId,options){return this.client.threads(projectId,taskId,options);}
  async key(path,body){
    // Stable per exact command/revision across network retries and reloads; contains no plaintext data.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path+JSON.stringify(body)));
    return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  async write(collection,record,baseRevision){
    const base=`/projects/${encodeURIComponent(record.projectId)}`,id=encodeURIComponent(record.id);
    let path,body,method='PUT';
    if(collection==='tasks'){
      if(record.attachmentIds?.length||record.coverAttachmentId)throw new ApiError('NOT_IMPLEMENTED','Файлы ещё не подключены к API vNext.',501);
      if(record.checklists?.length)throw new ApiError('CONTENT_VERSION','Сохраните чек-листы в Markdown-описании.',422);
      const {title,description,status,type,priority,owner,due,rank,parentId,releaseId,tagIds}=record;
      body={baseRevision,task:TaskInput.parse({title,description,status,type,priority,owner,due,rank,parentId,releaseId,tagIds})};path=base+'/tasks/'+id;
    }else if(collection==='threads'){
      const last=record.messages.at(-1);
      if(baseRevision===0){path=`${base}/tasks/${encodeURIComponent(record.taskId)}/threads`;method='POST';body={id:record.id,messageId:last.id,body:last.body,requiresResolution:record.requiresResolution};}
      else {
        const current=await this.client.thread(record.projectId,record.id);
        if(current.taskId!==record.taskId)throw new ApiError('THREAD_TASK','Обсуждение другой задачи.',422);
        if(record.messages.length>current.messages.length){path=`${base}/threads/${id}/messages`;method='POST';body={id:last.id,body:last.body,baseRevision};}
        else if(current.messages.some(m=>m.id===last.id)&&current.resolved===record.resolved)return current;
        else {path=`${base}/threads/${id}/resolution`;method='PATCH';body={resolved:record.resolved,baseRevision};}
      }
    }else if(collection==='tags'||collection==='releases'){
      path=base+'/'+collection+'/'+id;
      body={baseRevision,value:collection==='tags'?{name:record.name,tone:record.tone,archivedAt:record.archivedAt||null}:{name:record.name,status:record.status,targetDate:record.targetDate||null,archivedAt:record.archivedAt||null}};
    }else throw new ApiError('NOT_IMPLEMENTED','Этот раздел ещё не подключён к API vNext.',501);
    const saved=await this.client.request(path,method,body,await this.key(path,body));
    this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id}));return saved;
  }
}
