import {SprintiqueClient,ApiError} from '../client/api.ts';
import {TaskInput} from '../contracts/index.ts';
import {PutTaskMaterial,TaskMaterial,TaskMaterialList,TaskMaterialWriteResponse} from '../contracts/task-materials.ts';
import {PlanningClient,watchProject} from '../client/planning.ts';
import {mapWriteBody,templateWriteBody} from './maps-adapter.js';
import {MediaAdapter} from './media-adapter.js';
import {MapMedia} from './map-media.js';
import {describeOwner} from '../ui/src/board/assignees.js';
import {accessSignature} from './permissions.js';
import {wikiMethods} from './wiki-adapter.js';

/** Anti-corruption adapter: existing UI record intents become explicit v1 resource commands. */
/**
 * Board and dialogs read `owner` as a display name; the API owns ownerId, ownerName and legacy free text. A service
 * account owner reads «Имя (сервисный аккаунт)», marked when it can no longer act (SPR-7).
 */
const displayOwner=(task,people)=>({...task,...describeOwner(task,people)});
export class ProductRepository {
  constructor(client=new SprintiqueClient()){this.client=client;this.listeners=new Set();this.context={};this.cache=new Map();this.cacheState={generation:0};this.inflight=new Map();this.early=new Map();this.streamState={held:0,resume:null};this.createInBoard=true;this.capabilities={storage:'server',taskLinks:true,taskSettings:true,attachments:false,maps:true,templateImages:false};}
  async initialize(){
    // The session and the storage capabilities are independent reads: one round trip, not two.
    const [session,media]=await Promise.all([this.client.session(),this.client.request('/media/capabilities')]);this.context.actorId=session.principal.id;
    // Agents of service accounts on tasks, when the server has them on (docs/decisions/0005-ai-agents.md).
    this.capabilities.aiAgents=(session.features||[]).includes('ai_agents');
    this.capabilities.agentWork=(session.features||[]).includes('agent_work');
    this.capabilities.attachments=media.available;this.attachmentAdapter=media.available?new MediaAdapter(this):null;this.mapMedia=new MapMedia(this);return session;}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  async listTaskMaterials(taskId,projectId,{signal}={}){
    const path=`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/materials`;
    return TaskMaterialList.parse(await this.client.request(path,'GET',undefined,undefined,signal));
  }
  async readTaskMaterial(taskId,id,projectId,{signal}={}){
    const path=`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/materials/${encodeURIComponent(id)}`;
    return TaskMaterial.parse(await this.client.request(path,'GET',undefined,undefined,signal));
  }
  async putTaskMaterial(taskId,record,baseRevision,{projectId=record.projectId,signal}={}){
    const path=`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/materials/${encodeURIComponent(record.id)}`;
    const body=PutTaskMaterial.parse({baseRevision,value:{category:record.category,title:record.title,url:record.url,archived:!!record.archived}});
    const saved=TaskMaterialWriteResponse.parse(await this.client.request(path,'PUT',body,await this.key(path,body),signal));
    this.listeners.forEach(fn=>fn({collection:'taskMaterials',projectId,id:saved.id,taskId:saved.taskId,revision:saved.revision}));
    return saved;
  }
  /** Every collection of the project reads again (back online after the connection was lost). */
  refreshAll(projectId){
    this.clearProjectCache(projectId);
    for(const collection of ['tasks','threads','tags','releases','maps','templates','taskLinks','taskSettings','taskMaterials','wikiPages','wikiTaskLinks'])this.listeners.forEach(fn=>fn({collection,projectId,resync:true}));
  }
  clearProjectCache(projectId){this.cacheState.generation++;for(const key of this.cache.keys())if(!projectId||key.startsWith(projectId+':'))this.cache.delete(key);}
  async cached(projectId,name,load,{signal}={}){
    signal?.throwIfAborted();const key=projectId+':'+name,entry=this.cache.get(key);
    if(entry&&entry.until>Date.now())return structuredClone(entry.value);
    // A read of the same thing already under way (a prefetch on hover, a parallel section load) is shared rather than
    // sent again; when its first caller cancels it, the next caller reads on its own.
    const generation=this.cacheState.generation,running=this.inflight.get(key);
    if(running&&running.generation===generation){
      try{const shared=await running.promise;signal?.throwIfAborted();return structuredClone(shared);}
      catch(error){signal?.throwIfAborted();if(error?.name!=='AbortError')throw error;}
    }
    const record={generation,promise:null};let snapshot;
    record.promise=(async()=>{snapshot=structuredClone(await load());return snapshot;})();
    this.inflight.set(key,record);record.promise.catch(()=>{});
    try{
      await record.promise;signal?.throwIfAborted();
      if(generation===this.cacheState.generation){this.cache.set(key,{value:snapshot,until:Date.now()+30000});while(this.cache.size>48)this.cache.delete(this.cache.keys().next().value);}
      return structuredClone(snapshot);
    }finally{if(this.inflight.get(key)===record)this.inflight.delete(key);}
  }
  /**
   * Holds the live stream of the watched project while a section mounts: its events wait and are handled, in order,
   * when the last hold is released. A mount therefore sees every change after the data it read, exactly as when the
   * stream was started after the mount from the watermark taken before it. Returns the release function.
   */
  holdChanges(){
    const state=this.streamState;state.held++;let released=false;
    return ()=>{if(released)return;released=true;state.held--;if(!state.held)state.resume?.();};
  }
  /** `access` is the person's permissions signature: a change of it (not only of the derived role) asks for a refresh. */
  watch(projectId,onAccessRevoked,{cursor,access,role}={}){
    this.stopWatch?.();let timer,closed=false,checking=false,checkAgain=false;
    const changed=new Map();
    const controller=new AbortController();
    const lost=()=>{if(closed)return;this.context={};this.clearProjectCache();this.mapMedia?.clear();this.stopWatch();onAccessRevoked();};
    const checkMembership=async()=>{
      if(checking){checkAgain=true;return;}checking=true;
      try{do{checkAgain=false;const session=await this.client.request('/session','GET',undefined,undefined,controller.signal);if(closed)return;
        const current=session.projects.find(project=>project.id===projectId);
        if(!current){lost();return;}if(access!==undefined){const signature=accessSignature(current);if(signature!==access){access=signature;this.clearProjectCache(projectId);onAccessRevoked({roleChanged:true,role:current.role,permissions:current.permissions});}}
        else if(role&&current.role!==role){role=current.role;this.clearProjectCache(projectId);onAccessRevoked({roleChanged:true,role});}
      }while(checkAgain&&!closed);}catch(error){if(!closed&&[401,403,404].includes(error.status))lost();}finally{checking=false;}
    };
    const collections=['tasks','threads','tags','releases','maps','templates','taskLinks','taskSettings','taskMaterials','wikiPages','wikiTaskLinks'];
    const queue=(collection,event)=>{
      const previous=changed.get(collection);
      changed.set(collection,{collection,projectId,id:event.resourceId,revision:event.revision,...(collection==='wikiTaskLinks'?{taskId:event.resourceId}:{}),...(previous||event.topic==='resync'?{resync:true}:{})});
    };
    // Events and the loss of access that arrive while a section mounts wait for it (holdChanges).
    const state=this.streamState,waiting=[];let lostWhileHeld=false;
    const handle=event=>{
      if(closed)return;
      if(event.topic==='member.updated'&&event.resourceId===this.context.actorId)void checkMembership();
      const names={'task':'tasks','thread':'threads','tags':'tags','release':'releases','releases':'releases','map':'maps','map-template':'templates','task-link':'taskLinks','task-settings':'taskSettings','task-material':'taskMaterials','wiki-page':'wikiPages','wiki-link':'wikiTaskLinks','wiki-task-link':'wikiTaskLinks','finance-entry':'financeEntries','finance-settings':'financeSettings'};
      const collection=names[event.topic.split('.')[0]];
      this.clearProjectCache(projectId);
      if(event.topic==='resync'||event.topic.startsWith('planning.')||event.topic.startsWith('member.')){collections.forEach(name=>queue(name,{...event,topic:'resync'}));if(event.topic==='resync')void checkMembership();}
      else if(collection)queue(collection,event);
      clearTimeout(timer);timer=setTimeout(()=>{for(const change of changed.values())this.listeners.forEach(fn=>fn(change));changed.clear();},80);
    };
    const stop=watchProject(projectId,event=>{if(closed)return;if(state.held)waiting.push(event);else handle(event);},
      ()=>{if(state.held)lostWhileHeld=true;else lost();},{cursor});
    state.resume=()=>{while(waiting.length&&!closed&&!state.held)handle(waiting.shift());if(lostWhileHeld&&!state.held){lostWhileHeld=false;lost();}};
    this.stopWatch=()=>{closed=true;clearTimeout(timer);changed.clear();waiting.length=0;lostWhileHeld=false;state.resume=null;controller.abort();stop();};return this.stopWatch;
  }
  async taskContext(projectId,{signal}={}){return this.cached(projectId,'task-context',async()=>{
    const planning=new PlanningClient(this.client,projectId);let cursor,result=[];
    do{signal?.throwIfAborted();const page=await planning.tasks({cursor,limit:100},signal);result.push(...page.items.map(t=>({...t,projectId,summary:true})));cursor=page.nextCursor;}while(cursor);
    const names=await this.memberNames(projectId,{signal});result=result.map(t=>displayOwner(t,names));
    return result;
  },{signal});
  }
  /** The release a person's board shows in this project, kept on the server: an id, 'backlog', or null (running). */
  async boardRelease(projectId,{signal}={}){return (await this.client.request(`/projects/${encodeURIComponent(projectId)}/preferences`,'GET',undefined,undefined,signal)).boardRelease??null;}
  setBoardRelease(projectId,boardRelease){return this.client.request(`/projects/${encodeURIComponent(projectId)}/preferences`,'PUT',{boardRelease});}
  /** `board` narrows the board: {releaseId, lifecycle} for one release, {backlog:true} for tasks without one. A
   *  running release lists what the server admits to the board; a planned one lists its prepared, open tasks. */
  async list(collection,projectId,{signal,board}={}){
    if(collection==='maps'){
      let cursor,result=[];do{signal?.throwIfAborted();const page=await this.client.request(`/projects/${encodeURIComponent(projectId)}/maps${cursor?'?cursor='+encodeURIComponent(cursor):''}`,'GET',undefined,undefined,signal);result.push(...page.items);cursor=page.nextCursor;}while(cursor);return result;
    }
    if(collection==='templates')return this.client.request(`/projects/${encodeURIComponent(projectId)}/map-templates`,'GET',undefined,undefined,signal);
    if(collection==='tasks'){
      let cursor,result=[];const planning=new PlanningClient(this.client,projectId);
      const planned=board&&!board.backlog&&board.lifecycle==='planned',scope=!board?{}:board.backlog?{unassigned:'true'}:{releaseId:board.releaseId};
      do{signal?.throwIfAborted();const page=planned?await planning.tasks({...scope,preparation:'ready',cursor,limit:100},signal):await planning.board({...scope,cursor,limit:100},signal);
        result.push(...page.items.filter(t=>!planned||t.result==='open').map(t=>({...t,projectId,summary:true})));cursor=page.nextCursor;
      }while(cursor);const names=await this.memberNames(projectId,{signal});return result.map(t=>displayOwner(t,names));
    }
    if(collection==='releases')return this.cached(projectId,collection,async()=>{
      const planning=new PlanningClient(this.client,projectId);let cursor,result=[];
      do{signal?.throwIfAborted();const page=await planning.releases(cursor,signal);result.push(...page.items.map(r=>({...r,status:['closed','cancelled'].includes(r.lifecycle)?'released':'planned',targetDate:r.deadline})));cursor=page.nextCursor;}while(cursor);
      return result;
    },{signal});
    // People and service accounts of the project (agents answer through proposals). A service account is named with
    // its owner wherever its work shows, e.g. «Робот (сервисный аккаунт Алиса)»; accountName keeps its own name for
    // the owner pickers, where it may take tasks (SPR-7).
    if(collection==='members')return this.cached(projectId,collection,async()=>
      (await this.client.request(`/projects/${encodeURIComponent(projectId)}/members`,'GET',undefined,undefined,signal))
        .filter(m=>m.kind==='human'||m.kind==='service')
        .map(m=>m.kind==='service'?{...m,accountName:m.name,name:`${m.name} (сервисный аккаунт ${m.ownerName||'без владельца'})`}:m),{signal});
    if(['tags','taskSettings','taskLinks'].includes(collection))return this.cached(projectId,collection,async()=>{
      const route={tags:'tags',taskSettings:'task-settings',taskLinks:'task-links'}[collection];
      const value=await this.client.request(`/projects/${encodeURIComponent(projectId)}/${route}`,'GET',undefined,undefined,signal);return collection==='taskSettings'?[value]:value;
    },{signal});
    // Unknown collection names never fall back to browser-only persistence.
    throw new ApiError('NOT_IMPLEMENTED','Этот раздел ещё не подключён к API vNext.',501);
  }
  /** Members by id: an owner's name, and for a service account its own name, kind and state (SPR-7). */
  async memberNames(projectId,{signal}={}){return new Map((await this.list('members',projectId,{signal})).map(m=>[m.id,m]));}
  async read(collection,id,projectId,{signal}={}){
    try{
      if(collection==='tasks')return displayOwner(await this.client.task(projectId,id,signal));
      if(collection==='threads')return await this.client.thread(projectId,id,signal);
      if(collection==='maps')return this.mapMedia.hydrate(await this.client.request(`/projects/${encodeURIComponent(projectId)}/maps/${encodeURIComponent(id)}`,'GET',undefined,undefined,signal),{signal});
      return (await this.list(collection,projectId)).find(r=>r.id===id)||null;
    }catch(error){if(error.status===404)return null;throw error;}
  }
  /**
   * The reads an opened task drawer makes next (its first page of discussions, its agents, the project's links and
   * estimate settings), started alongside the task itself instead of after the drawer has rendered. Each early answer
   * is taken once, by the same read, within a few seconds and only while nothing has changed since (no event, no
   * write: the cache generation is the same); anything else reads again.
   */
  warmTask(projectId,taskId){
    const until=Date.now()+5000,generation=this.cacheState.generation;
    const put=(key,load)=>{const promise=load();promise.catch(()=>{});this.early.set(key,{promise,until,generation});};
    for(const [key,entry] of this.early)if(entry.until<Date.now())this.early.delete(key);
    put(`threads:${projectId}:${taskId}`,()=>this.client.threads(projectId,taskId,{limit:20}));
    if(this.capabilities.aiAgents)put(`agents:${projectId}:${taskId}`,()=>this.client.request(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/agents`));
    put(`view-settings:${projectId}`,()=>this.client.request(`/projects/${encodeURIComponent(projectId)}/planning/view/settings`));
    if(this.capabilities.taskLinks!==false)this.list('taskLinks',projectId).catch(()=>{});
  }
  takeEarly(key){const entry=this.early.get(key);this.early.delete(key);return entry&&entry.until>=Date.now()&&entry.generation===this.cacheState.generation?entry.promise:null;}
  pageThreads(projectId,taskId,options={}){
    const early=!options.cursor&&options.limit===20?this.takeEarly(`threads:${projectId}:${taskId}`):null;
    return early||this.client.threads(projectId,taskId,options);
  }
  /** The project's planning settings that the drawer's estimate reads (format, hours per day and week). */
  viewSettings(projectId){return this.takeEarly(`view-settings:${projectId}`)||this.client.request(`/projects/${encodeURIComponent(projectId)}/planning/view/settings`);}
  /** Agents on a task: who can work on it, its latest runs and the steps of the last one. */
  taskAgents(projectId,taskId,{signal}={}){return this.takeEarly(`agents:${projectId}:${taskId}`)||this.client.request(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/agents`,'GET',undefined,undefined,signal);}
  startAgent(projectId,taskId,accountId){return this.client.request(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/agent-runs`,'POST',{accountId});}
  stopAgent(projectId,taskId,runId){return this.client.request(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/agent-runs/${encodeURIComponent(runId)}/stop`,'POST',{});}
  /** The caller's own read marker for a thread: "new" follows the person across devices. */
  markThreadRead(projectId,threadId,seenActivityAt){return this.client.request(`/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}/read`,'POST',{seenActivityAt});}
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
        this.clearProjectCache(record.projectId);this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id}));return displayOwner(saved);
      }
      if(record.checklists?.length)throw new ApiError('CONTENT_VERSION','Сохраните чек-листы в Markdown-описании.',422);
      // A schema failure speaks the product's language: our own refinement texts are Russian, anything else is generic.
      const parsed=TaskInput.safeParse(Object.fromEntries(Object.keys(TaskInput.shape).map(key=>[key,record[key]])));
      if(!parsed.success){const text=parsed.error.issues.map(issue=>issue.message).find(message=>/[а-яё]/i.test(message));throw new ApiError('VALIDATION',text||'Проверьте поля задачи.',422);}
      const content=parsed.data;
      const {parentId,releaseId}=content;
      // A task created on the board in a running or planned release joins it: the host asks first (the release scope
      // changes) and commits through planning; without the right to change the scope it goes to the backlog, as
      // before. A finished or archived release takes the ordinary path, which refuses it.
      if(!baseRevision&&this.createInBoard&&releaseId&&this.createInRelease){
        const release=(await this.list('releases',record.projectId,{signal})).find(item=>item.id===releaseId&&['active','planned'].includes(item.lifecycle)&&!item.archivedAt);
        if(release){
          await this.createInRelease({kind:'taskCreate',taskId:record.id,task:content,createInBoard:true},release,
            ()=>this.write('tasks',{...record,releaseId:null},0,{signal}));
          const saved=await this.client.task(record.projectId,record.id);this.clearProjectCache(record.projectId);this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id}));return displayOwner(saved);
        }
      }
      const previous=baseRevision?await this.client.task(record.projectId,record.id):null;
      if(this.confirmPlanningChange&&(!baseRevision&&releaseId||previous&&(previous.parentId!==parentId||previous.releaseId!==releaseId))){
        const intent=baseRevision?{kind:'taskEdit',taskId:record.id,baseRevision,task:content}:{kind:'taskCreate',taskId:record.id,task:content,createInBoard:this.createInBoard};
        await this.confirmPlanningChange(intent);
        const saved=await this.client.task(record.projectId,record.id);this.clearProjectCache(record.projectId);this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id}));return displayOwner(saved);
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
        else if(current.requiresResolution!==record.requiresResolution&&current.messages.length===record.messages.length){path=`${base}/threads/${id}/kind`;method='PATCH';body={requiresResolution:record.requiresResolution,baseRevision};}
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
    this.listeners.forEach(fn=>fn({collection,projectId:record.projectId,id:record.id,revision:saved.revision}));return collection==='maps'?this.mapMedia.hydrate(saved,{signal}):collection==='tasks'?displayOwner(saved):saved;
  }
}
Object.assign(ProductRepository.prototype,wikiMethods);
