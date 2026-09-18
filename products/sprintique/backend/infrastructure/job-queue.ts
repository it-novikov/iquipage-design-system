import pg from 'pg';
import type {ObjectStorage} from './object-storage.js';
import {objectKey} from './object-storage.js';
interface Job {id:string;lease_token:string;attempts:number}
export class JobQueue {
  readonly pool:pg.Pool;
  constructor(url:string){this.pool=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:5000});}
  async checkRole(){
    const result=await this.pool.query<{unsafe:boolean}>(`SELECT r.rolsuper OR r.rolbypassrls OR
      has_table_privilege(current_user,'app.tasks','SELECT') OR has_table_privilege(current_user,'app.assets','UPDATE') OR
      has_table_privilege(current_user,'work.jobs','UPDATE') AS unsafe FROM pg_roles r WHERE r.rolname=current_user`);
    if(result.rows[0]?.unsafe!==false)throw Error('Worker needs its restricted function-only database role');
  }
  async claim(){return (await this.pool.query<Job>("SELECT id,lease_token,attempts FROM work.claim('asset.gc')")).rows[0]||null;}
  async settle(job:Job,succeeded:boolean,errorCode:string|null=null){return (await this.pool.query<{ok:boolean}>('SELECT work.settle($1,$2,$3,$4) AS ok',[job.id,job.lease_token,succeeded,errorCode])).rows[0]!.ok;}
  async collectOne(storage:ObjectStorage){
    const job=await this.claim();if(!job)return false;
    try{
      const asset=(await this.pool.query<{asset:{id:string;projectId:string;sha256:string}|null}>('SELECT work.prepare_asset_gc($1,$2) AS asset',[job.id,job.lease_token])).rows[0]!.asset;
      if(!asset){await this.settle(job,true);return true;}
      // Idempotent deletes. A crash after any deletion is resumed by the next fenced lease.
      for(const variant of ['original','display','thumb'])await storage.remove(objectKey(asset,variant));
      const completed=(await this.pool.query<{ok:boolean}>('SELECT work.finish_asset_gc($1,$2) AS ok',[job.id,job.lease_token])).rows[0]!.ok;
      if(!completed)throw Error('Lease lost');
    }catch{await this.settle(job,false,'ASSET_GC_FAILED');}
    return true;
  }
  close(){return this.pool.end();}
}
