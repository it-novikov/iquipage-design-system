import pg from 'pg';
import type {PoolClient} from 'pg';
import {createHash, randomBytes} from 'node:crypto';
import {Problem, requireCondition} from '../domain/errors.js';
import type {Capability} from '../../contracts/index.js';

export const hash = (value:string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export type Transaction = PoolClient;
export interface Credential {token:string;kind:'session'|'agent'}
export interface Actor {id:string;name:string;kind:'human'|'agent';credentialId:string;csrf:string|null;projectId:string|null;capabilities:Capability[];initiatorId:string}
export class Database {
  readonly pool:pg.Pool;
  constructor(connectionString:string) {this.pool = new pg.Pool({connectionString,max:12,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});}
  async transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T> {
    const tx=await this.pool.connect();
    try {await tx.query('BEGIN'); await tx.query("SET LOCAL statement_timeout = '10s'"); const result=await fn(tx); await tx.query('COMMIT'); return result;}
    catch(error){await tx.query('ROLLBACK').catch(()=>{});throw error;}
    finally{tx.release();}
  }
  async authenticated<T>(credential:Credential, fn:(tx:Transaction,actor:Actor)=>Promise<T>):Promise<T> {
    return this.transaction(async tx=>{
      const result=await tx.query<Actor>(`
        SELECT p.id,coalesce(p.profile_name,p.name) AS name,p.kind,c.id AS "credentialId",c.csrf,c.project_id AS "projectId",
               c.capabilities,c.initiator_id AS "initiatorId"
        FROM auth.credentials c JOIN auth.principals p ON p.id=c.principal_id
        WHERE c.token_hash=$1 AND c.kind=$2 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
        AND p.disabled_at IS NULL`,[hash(credential.token),credential.kind]);
      const actor=result.rows[0];
      requireCondition(actor,401,'UNAUTHENTICATED','Войдите в аккаунт.');
      await tx.query("SELECT set_config('app.actor_id',$1,true),set_config('app.project_limit',$2,true)",[actor.id,actor.projectId||'']);
      return fn(tx,actor);
    });
  }
  async checkRuntimeRole(){
    const result=await this.pool.query<{unsafe:boolean}>(`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname='app' AND t.tableowner=current_user) AS unsafe FROM pg_roles r WHERE r.rolname=current_user`);
    if(result.rows[0]?.unsafe!==false)throw new Problem(503,'UNSAFE_DATABASE_ROLE','API requires a non-owner, non-superuser, NOBYPASSRLS database role.');
  }
  close(){return this.pool.end();}
}
export async function authorize(tx:Transaction,actor:Actor,projectId:string,capability:Capability|'catalog:write'|'agents:manage'){
  const row=(await tx.query<{workspaceId:string;role:string}>(`SELECT p.workspace_id AS "workspaceId", m.role FROM app.projects p JOIN app.project_members m ON m.project_id=p.id AND m.principal_id=$2 WHERE p.id=$1`,[projectId,actor.id])).rows[0];
  requireCondition(row,404,'NOT_FOUND','Проект недоступен.');
  const write=!capability.endsWith(':read');
  if(actor.kind==='agent') {
    requireCondition(actor.projectId===projectId && actor.capabilities.includes(capability as Capability),403,'FORBIDDEN','Действие не входит в разрешения агента.');
    const grantor=(await tx.query<{role:string}>(`SELECT m.role FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id WHERE m.project_id=$1 AND m.principal_id=$2 AND p.disabled_at IS NULL`,[projectId,actor.initiatorId])).rows[0];
    requireCondition(grantor&&(!write||grantor.role==='editor'||grantor.role==='admin'),403,'GRANT_REVOKED','Полномочия инициатора изменились.');
  }
  requireCondition(!write||row.role==='editor'||row.role==='admin',403,'FORBIDDEN','Недостаточно прав.');
  if(capability==='agents:manage'||capability==='catalog:write') requireCondition(actor.kind==='human'&&row.role==='admin',403,'FORBIDDEN','Нужны права администратора проекта.');
  return row;
}
export async function requireActiveCredential(tx:Transaction,actor:Actor){
  const found=await tx.query(`SELECT 1 FROM auth.credentials c JOIN auth.principals p ON p.id=c.principal_id
    WHERE c.id=$1 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND p.disabled_at IS NULL`,[actor.credentialId]);
  requireCondition(found.rowCount===1,401,'UNAUTHENTICATED','Сессия завершена.');
}
