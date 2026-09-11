import {randomUUID} from 'node:crypto';
import type {Actor,Transaction} from '../infrastructure/database.js';
import {hash} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';

function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
/** Same transaction as canonical state, audit and outbox. A retry never runs a second effect. */
export async function idempotent<T>(tx:Transaction,actor:Actor,projectId:string,operation:string,key:string,input:unknown,execute:()=>Promise<T>):Promise<T>{
  requireCondition(/^[A-Za-z0-9_-]{8,120}$/.test(key),400,'IDEMPOTENCY_KEY','Передайте корректный Idempotency-Key.');
  const requestHash=hash(canonical(input));
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor.id}:${projectId}:${operation}:${key}`]);
  const previous=(await tx.query<{request_hash:string;result:T}>(`SELECT request_hash,result FROM app.idempotency WHERE actor_id=$1 AND project_id=$2 AND operation=$3 AND key=$4`,[actor.id,projectId,operation,key])).rows[0];
  if(previous){requireCondition(previous.request_hash===requestHash,409,'IDEMPOTENCY_CONFLICT','Ключ повтора уже использован для другого запроса.');return previous.result;}
  const result=await execute();
  await tx.query('INSERT INTO app.idempotency(actor_id,project_id,operation,key,request_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[actor.id,projectId,operation,key,requestHash,JSON.stringify(result)]);
  return result;
}
export async function recordEvent(tx:Transaction,actor:Actor,projectId:string,action:string,resourceId:string,revision:number){
  const id=randomUUID();
  await tx.query('INSERT INTO app.audit_events(id,project_id,actor_id,initiator_id,action,resource_id,revision) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,projectId,actor.id,actor.initiatorId,action,resourceId,revision]);
  await tx.query('INSERT INTO app.outbox(id,project_id,topic,payload) VALUES($1,$2,$3,$4)',[id,projectId,action,JSON.stringify({id,projectId,resourceId,revision})]);
}
