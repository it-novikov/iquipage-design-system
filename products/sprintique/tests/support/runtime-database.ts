// Direct SQL as the runtime role, the way the API opens a request: find the live credential, set the row-security
// context for the transaction, run the statements. Tests use it to prove the database itself enforces isolation.
import pg from 'pg';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';

export interface TestCredential {token:string;kind:'session'|'agent'}
/** The principal of a credential, with what audit records and row security need. */
export interface TestActor {id:string;kind:'human'|'agent';credentialId:string;initiatorId:string;capabilities:string[];projectId:string|null}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

export class RuntimeDatabase {
  readonly pool:pg.Pool;
  constructor(url:string){this.pool=new pg.Pool({connectionString:url,max:4});}
  async authenticated<T>(credential:TestCredential,fn:(tx:PoolClient,actor:TestActor)=>Promise<T>):Promise<T>{
    const tx=await this.pool.connect();
    try{
      await tx.query('BEGIN');
      const actor=(await tx.query<TestActor>(`SELECT p.id,p.kind,c.id AS "credentialId",c.initiator_id AS "initiatorId",c.capabilities,c.project_id AS "projectId"
        FROM auth.credentials c JOIN auth.principals p ON p.id=c.principal_id
        WHERE c.token_hash=$1 AND c.kind=$2 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND p.disabled_at IS NULL`,[hash(credential.token),credential.kind])).rows[0];
      if(!actor)throw Object.assign(Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED'});
      await tx.query("SELECT set_config('app.actor_id',$1,true),set_config('app.project_limit',$2,true)",[actor.id,actor.projectId||'']);
      const result=await fn(tx,actor);
      await tx.query('COMMIT');return result;
    }catch(error){await tx.query('ROLLBACK').catch(()=>{});throw error;}
    finally{tx.release();}
  }
  close(){return this.pool.end();}
}
