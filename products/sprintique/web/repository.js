import {SprintiqueClient,ApiError} from '../client/api.ts';
import {TaskInput} from '../contracts/index.ts';
import {PlanningClient,watchProject} from '../client/planning.ts';
import {mapWriteBody,templateWriteBody} from './maps-adapter.js';
import {MediaAdapter} from './media-adapter.js';
import {MapMedia} from './map-media.js';

/** Anti-corruption adapter: existing UI record intents become explicit v1 resource commands. */
export class ProductRepository {
  constructor(client=new SprintiqueClient()){this.client=client;this.listeners=new Set();this.context={};this.cache=new Map();this.cacheState={generation:0};this.createInBoard=true;this.capabilities={storage:'server',taskLinks:true,taskSettings:true,attachments:false,maps:true,templateImages:false};}
  async initialize(){const session=await this.client.session();this.context.actorId=session.principal.id;
    const media=await this.client.request('/media/capabilities');this.capabilities.attachments=media.available;this.attachmentAdapter=media.available?new MediaAdapter(this):null;this.mapMedia=new MapMedia(this);return session;}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  clearProjectCache(projectId){this.cacheState.generation++;for(const key of this.cache.keys())if(!projectId||key.startsWith(projectId+':'))this.cache.delete(key);}
  async cached(projectId,name,load,{signal}={}){
    signal?.throwIfAborted();const key=projectId+':'+name,entry=this.cache.get(key);
    if(entry&&entry.until>Date.now())return structuredClone(entry.value);
    const generation=this.cacheState.generation,value=await load();signal?.throwIfAborted();
    if(generation===this.cacheState.generation){this.cache.set(key,{value:structuredClone(value),until:Date.now()+30000});while(this.cache.size>48)this.cache.delete(this.cache.keys().next().value);}
    return value;
  }
  watch(projectId,onAccessRevoked,{cursor,role}={}){
    this.stopWatch?.();let timer,closed=false,checking=false,checkAgain=false;
    const changed=new Map();
    const controller=new AbortController();
    const lost=()=>{if(closed)return;this.context={};this.clearProjectCache();this.mapMedia?.clear();this.stopWatch();onAccessRevoked();};
    const checkMembership=async()=>{
      if(checking){checkAgain=true;return;}checking=true;
      try{do{checkAgain=false;const session=await this.client.request('/session','GET',undefined,undefined,controller.signal);if(closed)return;
        const current=session.projects.find(project=>project.id===projectId);
        if(!current){lost();return;}if(role&&current.role!==role){role=current.role;this.clearProjectCache(projectId);onAccessRevoked({roleChanged:true,role});}
      }while(checkAgain&&!closed);}catch(error){if(!closed&&[401,403,404].includes(error.status))lost();}finally{checking=false;}
    };
    const collections=['tasks','threads','tags','releases','maps','templates','taskLinks','taskSettings'];
    const queue=(collection,event)=>{
      const previous=changed.get(collection);
      changed.set(collection,{collection,projectId,id:event.resourceId,revision:event.revision,...(previous||event.topic==='resync'?{resync:true}:{})});
    };
    const stop=watchProject(projectId,event=>{
      if(closed)return;
      if(event.topic==='member.updated'&&event.resourceId===this.context.actorId)void checkMembership();
      const names={'task':'tasks','thread':'threads','tags':'tags','release':'releases','releases':'releases','map':'maps','map-template':'templates','task-link':'taskLinks','task-settings':'taskSettings'};
      const collection=names[event.topic.split('.')[0]];
      this.clearProjectCache(projectId);
      if(event.topic==='resync'||event.topic.startsWith('planning.')||event.topic.startsWith('member.')){collections.forEach(name=>queue(name,{...event,topic:'resync'}));if(event.topic==='resync')void checkMembership();}
      else if(collection)queue(collection,event);
      clearTimeout(timer);timer=setTimeout(()=>{for(const change of changed.values())this.listeners.forEach(fn=>fn(change));changed.clear();},80);
    },lost,{cursor});
    this.stopWatch=()=>{closed=true;clearTimeout(timer);changed.clear();controller.abort();stop();};return this.stopWatch;
  }
  async taskContext(projectId,{signal}={}){return this.cached(projectId,'task-context',async()=>{
    const planning=new PlanningClient(this.client,projectId);let cursor,result=[];
    do{signal?.throwIfAborted();const page=await planning.tasks({cursor,limit:100},signal);result.push(...page.items.map(t=>({...t,projectId,summary:true})));cursor=page.nextCursor;}while(cursor);
    return result;
  },{signal});
  }
  async list(collection,projectId,{signal}={}){
    if(collection==='maps'){
      let cursor,result=[];do{signal?.throwIfAborted();const page=await this.client.request(`/projects/${encodeURIComponent(projectId)}/maps${cursor?'?cursor='+encodeURIComponent(cursor):''}`,'GET',undefined,undefined,signal);result.push(...page.items);cursor=page.nextCursor;}while(cursor);return result;
    }
    if(collection==='templates')return this.client.request(`/projects/${encodeURIComponent(projectId)}/map-templates`,'GET',undefined,undefined,signal);
    if(collection==='tasks'){
      let cursor,result=[];const planning=new PlanningClient(this.client,projectId);
      do{signal?.throwIfAborted();const page=await planning.board({cursor,limit:100},signal);result.push(...page.items.map(t=>({...t,projectId,summary:true})));cursor=page.nextCursor;
      }while(cursor);return result;
    }
    if(collection==='releases')return this.cached(projectId,collection,async()=>{
      const planning=new PlanningClient(this.client,projectId);let cursor,result=[];
      do{signal?.throwIfAborted();const page=await planning.releases(cursor,signal);result.push(...page.items.map(r=>({...r,status:['closed','cancelled'].includes(r.lifecycle)?'released':'planned',targetDate:r.deadline})));cursor=page.nextCursor;}while(cursor);
      return result;
    },{signal});
    if(['tags','taskSettings','taskLinks'].includes(collection))return this.cached(projectId,collection,async()=>{
      const route={tags:'tags',taskSettings:'task-settings',taskLinks:'task-links'}[collection];
      const value=await this.client.request(`/projects/${encodeURIComponent(projectId)}/${route}`,'GET',undefined,undefined,signal);return collection==='taskSettings'?[value]:value;
    },{signal});
    // Unknown collection names never fall back to browser-only persistence.
    throw new ApiError('NOT_IMPLEMENTED','Этот раздел ещё не подключён к API vNext.',501);
  }
  async read(collection,id,projectId,{signal}={}){
    try{
      if(collection==='tasks')return await this.client.task(projectId,id,signal);
      if(collection==='threads')return await this.client.thread(projectId,id,signal);
      if(collection==='maps')return this.mapMedia.hydrate(await this.client.request(`/projects/${encodeURIComponent(projectId)}/maps/${encodeURIComponent(id)}`,'GET',undefined,undefined,signal),{signal});
      return (await this.list(collection,projectId)).find(r=>r.id===id)||null;
    }catch(error){if(error.status===404)return null;throw error;}
  }
  pageThreads(projectId,taskId,options){return this.client.threads(projectId,taskId,options);}
  mapHistory(projectId,id,before,{signal}={}){
    return this.client.request(`/projects/${encodeURIComponent(projectId)}/maps/${encodeURIComponent(id)}/history${before?'?before='+before:''}`,'GET',undefined,undefined,signal);
  }
  async mapVersion(projectId,id,revision,{signal}={}){
    const record=await this.client.request(`/projects/${encodeURIComponent(projectId)}/maps/${encodeURIComponent(id)}/history/${revision}`,'GET',undefined,undefined,signal);
    // Historical hydration cannot invalidate the open map's upload/deduplication cache.
    return new MapMedia(this).hydrate(record,{signal});
  }
  async key(path,body){
    // Stable per exact command/revision across network retries and reloads; contains no plaintext data.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path+JSON.stringify(body)));
    return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  async write(collection,record,baseRevision,{signal}={}){
    this.clearProjectCache(record.projectId);
    const base=`/projects/${encodeURIComponent(record.projectId)}`,id=encodeURIComponent(record.id);
    let path,body,method='PUT';
    if(collection==='tasks'){
      if(record.summary){
        const path=`${base}/tasks/${id}/position`,body={baseRevision,status:record.status,rank:record.rank};
        const saved=await this.client.request(path,'PATCH',body,await this.key(path,body));
        this.clearProjectCache(record.projectId);this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id}));return saved;
      }
      if(record.checklists?.length)throw new ApiError('CONTENT_VERSION','Сохраните чек-листы в Markdown-описании.',422);
      const content=TaskInput.parse(Object.fromEntries(Object.keys(TaskInput.shape).map(key=>[key,record[key]])));
      const {parentId,releaseId}=content;
      const previous=baseRevision?await this.client.task(record.projectId,record.id):null;
      if(this.confirmPlanningChange&&(!baseRevision&&releaseId||previous&&(previous.parentId!==parentId||previous.releaseId!==releaseId))){
        const intent=baseRevision?{kind:'taskEdit',taskId:record.id,baseRevision,task:content}:{kind:'taskCreate',taskId:record.id,task:content,createInBoard:this.createInBoard};
        await this.confirmPlanningChange(intent);
        const saved=await this.client.task(record.projectId,record.id);this.clearProjectCache(record.projectId);this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id}));return saved;
      }
      // Explicit creation from the board means "create and take into work"; Planning creation stays draft.
      body={baseRevision,createInBoard:baseRevision===0&&this.createInBoard,task:content};path=base+'/tasks/'+id;
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
    }else if(collection==='maps'){
      path=base+'/maps/'+id;body=await mapWriteBody(this,record,baseRevision,{signal});
    }else if(collection==='templates'){
      path=base+'/map-templates/'+id;body=templateWriteBody(record,baseRevision);
    }else if(collection==='taskSettings'){
      path=base+'/task-settings';body={baseRevision,value:{base:record.base,types:record.types}};
    }else if(collection==='taskLinks'){
      path=base+'/task-links/'+id;body={baseRevision,value:{kind:record.kind,fromId:record.fromId,toId:record.toId,archived:!!record.archivedAt}};
    }else if(collection==='tags'||collection==='releases'){
      path=base+'/'+collection+'/'+id;
      body={baseRevision,value:collection==='tags'?{name:record.name,tone:record.tone,archivedAt:record.archivedAt||null}:{name:record.name,status:record.status,targetDate:record.targetDate||null,archivedAt:record.archivedAt||null}};
    }else throw new ApiError('NOT_IMPLEMENTED','Этот раздел ещё не подключён к API vNext.',501);
    const saved=await this.client.request(path,method,body,await this.key(path,body),signal);
    this.clearProjectCache(record.projectId);
    this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id,revision:saved.revision}));return collection==='maps'?this.mapMedia.hydrate(saved,{signal}):saved;
  }
}
