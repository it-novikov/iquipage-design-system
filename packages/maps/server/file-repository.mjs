import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {MemoryRepository} from '../src/repository.js';
import {clone,COLLECTIONS,prepareWrite} from '../src/model.js';
import {requireValue} from '../src/common.js';
import {writeEvents} from './outbox.mjs';
/** Single-process reference persistence. Not a distributed production database. */
export class FileRepository extends MemoryRepository {
  constructor(directory){super();this.directory=directory;this.file=path.join(directory,'records.json');this.queue=Promise.resolve();this.outbox=[];}
  async init(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try{
      const saved=JSON.parse(await readFile(this.file,'utf8'));
      for(const name of COLLECTIONS)this.data[name]=new Map((saved[name]||[]).map(x=>[x.id,x]));
      requireValue(!saved._events||Array.isArray(saved._events),'OUTBOX_DATA','Некорректная очередь событий.');
      this.outbox=saved._events||[];
    }catch(e){if(e.code!=='ENOENT')throw new Error('Хранилище повреждено или недоступно. Оригинал не изменён: '+e.message);}
    return this;
  }
  async list(...args){await this.queue.catch(()=>{});return super.list(...args);}
  async read(...args){await this.queue.catch(()=>{});return super.read(...args);}
  async pendingEvents(){await this.queue.catch(()=>{});return clone(this.outbox);}
  snapshot(){return {...Object.fromEntries(COLLECTIONS.map(c=>[c,[...this.data[c].values()]])),_events:clone(this.outbox)};}
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
      const previous=this.data[collection]?.get(value.id),next=prepareWrite(collection,value,previous,baseRevision);
      const payload=this.snapshot();
      payload[collection]=payload[collection].filter(x=>x.id!==next.id);payload[collection].push(next);
      payload._events.push(...writeEvents(collection,previous,next,[...this.data.rules.values()]));
      requireValue(payload._events.length<=10000,'OUTBOX_FULL','Очередь событий заполнена. Изменение не сохранено; восстановите обработчик событий.');
      // The document and its event share one atomic file replacement.
      await this.persist(payload,signal);
      this.data[collection].set(next.id,clone(next));this.outbox=payload._events;
      this.listeners.forEach(fn=>fn({collection,id:next.id,projectId:next.projectId,revision:next.revision}));return clone(next);
    });
    this.queue=operation;return operation;
  }
  async settleEvent(id,failure=null){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      const payload=this.snapshot(),entry=payload._events.find(e=>e.id===id);if(!entry)return;
      if(failure){entry.attempts++;entry.lastError=String(failure.error).slice(0,80);entry.nextAttemptAt=failure.date+Math.min(300000,1000*2**Math.min(entry.attempts,8));}
      else payload._events=payload._events.filter(e=>e.id!==id);
      await this.persist(payload);this.outbox=payload._events;
    });
    this.queue=operation;return operation;
  }
}
