import {commitTaskAttachments} from '../src/board/attachment-model.js';
import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {MemoryRepository} from '../src/repository.js';
import {clone,COLLECTIONS,prepareWrite} from '../src/model.js';
import {requireValue} from '../src/common.js';
import {writeEvents,MAX_DELIVERY_ATTEMPTS,MAX_MANUAL_RETRIES,HISTORY_LIMIT} from './outbox.mjs';
const summary=e=>({id:e.id,projectId:e.event.projectId,type:e.event.type,recordId:e.event.data.recordId,recordRevision:e.event.data.revision,revision:e.revision,status:e.status,createdAt:e.createdAt,updatedAt:e.updatedAt||e.createdAt,attempts:e.attempts,totalAttempts:e.totalAttempts||e.attempts,manualRetries:e.manualRetries||0,nextAttemptAt:e.nextAttemptAt,lastError:e.lastError,targets:e.targets.map(t=>({ruleId:t.id,mapId:t.mapId,name:t.name})),outcomes:e.outcomes||[]});
/** Single-process local reference persistence; not a distributed production database. */
export class FileRepository extends MemoryRepository {
  constructor(directory){super();this.directory=directory;this.file=path.join(directory,'records.json');this.queue=Promise.resolve();this.outbox=[];this.deliveryHistory=[];}
  async init(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try{
      const saved=JSON.parse(await readFile(this.file,'utf8'));
      for(const name of COLLECTIONS)this.data[name]=new Map((saved[name]||[]).map(x=>[x.id,x]));
      requireValue(!saved._events||Array.isArray(saved._events),'OUTBOX_DATA','Некорректная очередь событий.');
      requireValue(!saved._deliveries||Array.isArray(saved._deliveries),'OUTBOX_DATA','Некорректная история доставки.');
      this.outbox=(saved._events||[]).map(e=>e.schema===2?e:{...e,revision:e.revision||1,status:'dead',lastError:'SNAPSHOT_MISSING',manualRetries:0});
      this.deliveryHistory=(saved._deliveries||[]).slice(-HISTORY_LIMIT);
    }catch(e){if(e.code!=='ENOENT')throw new Error('Хранилище повреждено или недоступно. Оригинал не изменён: '+e.message);}
    return this;
  }
  async list(...args){await this.queue.catch(()=>{});return super.list(...args);}
  async read(...args){await this.queue.catch(()=>{});return super.read(...args);}
  async pendingEvents(){await this.queue.catch(()=>{});return clone(this.outbox);}
  async listDeliveries(projectId,mapId){
    await this.queue.catch(()=>{});
    return clone([...this.outbox.map(summary),...this.deliveryHistory].filter(e=>e.projectId===projectId&&(!mapId||e.targets.some(t=>t.mapId===mapId))).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')));
  }
  snapshot(){return {...Object.fromEntries(COLLECTIONS.map(c=>[c,[...this.data[c].values()]])),_events:clone(this.outbox),_deliveries:clone(this.deliveryHistory)};}
  async persist(payload,signal){
    const temp=this.file+'.pending';
    try{
      await writeFile(temp,JSON.stringify(payload),{encoding:'utf8',mode:0o600});
      const handle=await open(temp,'r+');try{await handle.sync();}finally{await handle.close();}
      signal?.throwIfAborted();await rename(temp,this.file);
    }catch(e){await unlink(temp).catch(()=>{});throw e;}
  }
  async write(collection,value,baseRevision=0,{signal}={}){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      signal?.throwIfAborted();
      const previous=this.data[collection]?.get(value.id),next=prepareWrite(collection,value,previous,baseRevision,[...this.data.tasks.values()],this.snapshot(),this.context.actorId);
      const payload=this.snapshot();
      payload[collection]=payload[collection].filter(x=>x.id!==next.id);payload[collection].push(next);
      if(collection==='tasks')payload.attachments=commitTaskAttachments(next,previous,payload.attachments);
      payload._events.push(...writeEvents(collection,previous,next,[...this.data.rules.values()],this.data.maps));
      requireValue(payload._events.length<=10000,'OUTBOX_FULL','Очередь событий заполнена. Изменение не сохранено; восстановите обработчик событий.');
      await this.persist(payload,signal);
      this.data[collection].set(next.id,clone(next));this.outbox=payload._events;
      if(collection==='tasks')this.data.attachments=new Map(payload.attachments.map(asset=>[asset.id,clone(asset)]));
      for(const fn of this.listeners){try{fn({collection,id:next.id,projectId:next.projectId,revision:next.revision});}catch{console.warn('Repository listener failed after commit');}}
      return clone(next);
    });
    this.queue=operation;return operation;
  }
  async settleEvent(id,failure=null,{baseRevision,outcomes=[]}={}){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      const payload=this.snapshot(),entry=payload._events.find(e=>e.id===id);
      if(!entry||(baseRevision!==undefined&&entry.revision!==baseRevision))return false;
      entry.revision++;entry.attempts++;entry.totalAttempts=(entry.totalAttempts||entry.attempts-1)+1;entry.updatedAt=new Date().toISOString();
      if(failure){
        if(outcomes.length)entry.outcomes=outcomes;
        entry.lastError=String(failure.error).slice(0,80);entry.status=failure.permanent||entry.attempts>=MAX_DELIVERY_ATTEMPTS?'dead':'retry';
        entry.nextAttemptAt=entry.status==='dead'?null:failure.date+Math.min(300000,1000*2**Math.min(entry.attempts,8));
      }else{
        entry.status='delivered';entry.nextAttemptAt=null;entry.lastError=null;entry.outcomes=outcomes;
        payload._deliveries.push(summary(entry));payload._deliveries=payload._deliveries.slice(-HISTORY_LIMIT);
        payload._events=payload._events.filter(e=>e.id!==id);
      }
      await this.persist(payload);this.outbox=payload._events;this.deliveryHistory=payload._deliveries;return true;
    });
    this.queue=operation;return operation;
  }
  async recoverEvent(id,projectId,action,baseRevision){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      const payload=this.snapshot(),entry=payload._events.find(e=>e.id===id&&e.event.projectId===projectId);
      requireValue(entry,'NOT_FOUND','Событие не найдено в этом проекте.');
      requireValue(entry.revision===baseRevision,'CONFLICT','Доставка изменилась. Обновите журнал.');
      requireValue(['retry','dismiss'].includes(action),'METHOD','Неизвестное действие доставки.');
      requireValue(entry.status==='dead','DELIVERY_STATE','Действие доступно только для остановленной доставки.');
      if(action==='retry'){
        requireValue(entry.schema===2,'SNAPSHOT_MISSING','Старое событие не содержит снимка. Сохраните новое изменение.');
        requireValue(entry.manualRetries<MAX_MANUAL_RETRIES,'RETRY_LIMIT','Лимит ручных повторов исчерпан. Проверьте причину и создайте новое событие.');
        entry.manualRetries++;entry.attempts=0;entry.status='pending';entry.nextAttemptAt=0;
      }else entry.status='dismissed';
      entry.revision++;entry.updatedAt=new Date().toISOString();const result=summary(entry);
      if(action==='dismiss'){
        payload._events=payload._events.filter(e=>e.id!==id);payload._deliveries.push(result);payload._deliveries=payload._deliveries.slice(-HISTORY_LIMIT);
      }
      await this.persist(payload);this.outbox=payload._events;this.deliveryHistory=payload._deliveries;return clone(result);
    });
    this.queue=operation;return operation;
  }
}
