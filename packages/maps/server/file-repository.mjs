import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {MemoryRepository} from '../src/repository.js';
import {clone,COLLECTIONS,prepareWrite} from '../src/model.js';
/** Single-process reference persistence. Not a distributed production database. */
export class FileRepository extends MemoryRepository {
  constructor(directory){super();this.directory=directory;this.file=path.join(directory,'records.json');this.queue=Promise.resolve();}
  async init(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    try{const saved=JSON.parse(await readFile(this.file,'utf8'));for(const name of COLLECTIONS)this.data[name]=new Map((saved[name]||[]).map(x=>[x.id,x]));}
    catch(e){if(e.code!=='ENOENT')throw new Error('Хранилище повреждено или недоступно. Оригинал не изменён: '+e.message);}
    return this;
  }
  async list(...args){await this.queue.catch(()=>{});return super.list(...args);}
  async read(...args){await this.queue.catch(()=>{});return super.read(...args);}
  async write(collection,value,baseRevision=0,{signal}={}){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      signal?.throwIfAborted();const next=prepareWrite(collection,value,this.data[collection].get(value.id),baseRevision);
      const payload=Object.fromEntries(COLLECTIONS.map(c=>[c,[...this.data[c].values()]]));
      payload[collection]=payload[collection].filter(x=>x.id!==next.id);payload[collection].push(next);
      const temp=this.file+'.pending';
      try{
        await writeFile(temp,JSON.stringify(payload),{encoding:'utf8',mode:0o600});
        const handle=await open(temp,'r+');try{await handle.sync();}finally{await handle.close();}
        signal?.throwIfAborted();await rename(temp,this.file);
      }catch(e){await unlink(temp).catch(()=>{});throw e;}
      this.data[collection].set(next.id,clone(next));
      this.listeners.forEach(fn=>fn({collection,id:next.id,projectId:next.projectId,revision:next.revision}));return clone(next);
    });
    this.queue=operation;return operation;
  }
}
