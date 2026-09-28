// The cleanup queue as the worker role sees it: only the queue functions, no table access. Tests use it to prove
// the database contract of the queue (leases, fencing, retries) independently of the worker implementation.
import pg from 'pg';

export interface Job {id:string;lease_token:string;attempts:number}
export class JobQueue {
  readonly pool:pg.Pool;
  constructor(url:string){this.pool=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:5000});}
  async claim(){return (await this.pool.query<Job>("SELECT id,lease_token,attempts FROM work.claim('asset.gc')")).rows[0]||null;}
  async settle(job:Job,succeeded:boolean,errorCode:string|null=null){
    return (await this.pool.query<{ok:boolean}>('SELECT work.settle($1,$2,$3,$4) AS ok',[job.id,job.lease_token,succeeded,errorCode])).rows[0]!.ok;
  }
  async prepare(job:Job){
    return (await this.pool.query<{asset:{id:string;projectId:string;sha256:string}|null}>('SELECT work.prepare_asset_gc($1,$2) AS asset',[job.id,job.lease_token])).rows[0]!.asset;
  }
  async finish(job:Job){return (await this.pool.query<{ok:boolean}>('SELECT work.finish_asset_gc($1,$2) AS ok',[job.id,job.lease_token])).rows[0]!.ok;}
  close(){return this.pool.end();}
}
