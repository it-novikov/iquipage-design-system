import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize} from '../infrastructure/database.js';
import {Problem,requireCondition} from '../domain/errors.js';

export interface ProjectEvent {id:string;topic:string;resourceId:string;revision:number;operationId:string|null;correlationId:string|null;causationId:string|null;actorId:string;initiatorId:string;cursor:string}
function position(cursor:string|undefined,projectId:string){
  if(!cursor)return 0;
  let data:{projectId?:unknown;position?:unknown};
  try{data=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw new Problem(400,'CURSOR_INVALID','Некорректная позиция событий.');}
  requireCondition(data&&data.projectId===projectId&&Number.isSafeInteger(data.position)&&Number(data.position)>=0,400,'CURSOR_INVALID','Позиция относится к другому проекту.');return Number(data.position);
}
export async function projectEvents(tx:Transaction,actor:Actor,projectId:string,cursor?:string):Promise<{items:ProjectEvent[];cursor:string|null;hasMore:boolean}>{
  const canReadTasks=actor.kind==='human'||actor.capabilities.includes('tasks:read');
  const canReadThreads=actor.kind==='human'||actor.capabilities.includes('threads:read');
  await authorize(tx,actor,projectId,canReadTasks?'tasks:read':'threads:read');const after=position(cursor,projectId);
  const rows=(await tx.query<Omit<ProjectEvent,'cursor'>&{position:number}>(`SELECT o.id,o.topic,a.resource_id AS "resourceId",a.revision,
    a.actor_id AS "actorId",a.initiator_id AS "initiatorId",a.operation_id AS "operationId",a.correlation_id AS "correlationId",a.causation_id AS "causationId",o.project_sequence::float8 AS position
    FROM app.outbox o JOIN app.audit_events a ON a.id=o.id WHERE o.project_id=$1 AND o.project_sequence>$2
      AND ($3 OR o.topic NOT LIKE 'thread.%')
      AND ($4 OR o.topic NOT LIKE 'agent.%')
      AND ($6 OR o.topic LIKE 'thread.%')
      AND ($4 OR o.topic NOT LIKE 'approval.%' OR a.resource_id IN (SELECT id::text FROM app.approvals WHERE project_id=$1 AND requested_by=$5))
    ORDER BY o.project_sequence LIMIT 101`,[projectId,after,canReadThreads,actor.kind==='human',actor.id,canReadTasks])).rows;
  const items=rows.slice(0,100).map(({position,...row})=>({...row,cursor:Buffer.from(JSON.stringify({projectId,position})).toString('base64url')}));
  return {items,cursor:items.at(-1)?.cursor||cursor||null,hasMore:rows.length>100};
}
