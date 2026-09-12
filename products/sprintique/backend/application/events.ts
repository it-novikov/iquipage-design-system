import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize} from '../infrastructure/database.js';
import {Problem,requireCondition} from '../domain/errors.js';

export interface ProjectEvent {id:string;topic:string;resourceId:string;revision:number;operationId:string|null;correlationId:string|null;causationId:string|null;actorId:string;initiatorId:string;cursor:string}
const eventCursor=(projectId:string,position:number)=>Buffer.from(JSON.stringify({projectId,position})).toString('base64url');
async function authorizeEvents(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,actor.kind==='human'||actor.capabilities.includes('tasks:read')?'tasks:read':actor.capabilities.includes('threads:read')?'threads:read':'maps:read');
}
/** Commit-ordered project sequence. Read before the snapshot, never after it: a
 * transaction committed during snapshot loading must still appear in catch-up. */
export async function projectEventHead(tx:Transaction,actor:Actor,projectId:string){
  await authorizeEvents(tx,actor,projectId);
  const row=(await tx.query<{position:number}>('SELECT event_sequence::float8 AS position FROM app.projects WHERE id=$1',[projectId])).rows[0];
  requireCondition(row&&Number.isSafeInteger(row.position),404,'NOT_FOUND','Проект недоступен.');
  return {cursor:eventCursor(projectId,row.position)};
}
function position(cursor:string|undefined,projectId:string){
  if(!cursor)return 0;
  let data:{projectId?:unknown;position?:unknown};
  try{data=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw new Problem(400,'CURSOR_INVALID','Некорректная позиция событий.');}
  requireCondition(data&&data.projectId===projectId&&Number.isSafeInteger(data.position)&&Number(data.position)>=0,400,'CURSOR_INVALID','Позиция относится к другому проекту.');return Number(data.position);
}
export async function projectEvents(tx:Transaction,actor:Actor,projectId:string,cursor?:string):Promise<{items:ProjectEvent[];cursor:string|null;hasMore:boolean}>{
  const canReadTasks=actor.kind==='human'||actor.capabilities.includes('tasks:read');
  const canReadThreads=actor.kind==='human'||actor.capabilities.includes('threads:read');
  const canReadMaps=actor.kind==='human'||actor.capabilities.includes('maps:read');
  await authorizeEvents(tx,actor,projectId);const after=position(cursor,projectId);
  const rows=(await tx.query<Omit<ProjectEvent,'cursor'>&{position:number}>(`SELECT o.id,o.topic,a.resource_id AS "resourceId",a.revision,
    a.actor_id AS "actorId",a.initiator_id AS "initiatorId",a.operation_id AS "operationId",a.correlation_id AS "correlationId",a.causation_id AS "causationId",o.project_sequence::float8 AS position
    FROM app.outbox o JOIN app.audit_events a ON a.id=o.id WHERE o.project_id=$1 AND o.project_sequence>$2
      AND ($3 OR o.topic NOT LIKE 'thread.%')
      AND ($4 OR o.topic NOT LIKE 'agent.%')
      AND ((o.topic LIKE 'thread.%' AND $3)
        OR ((o.topic LIKE 'map.%' OR o.topic LIKE 'map-template.%') AND $7)
        OR (o.topic LIKE 'asset.%' AND EXISTS(SELECT 1 FROM app.assets f WHERE f.project_id=$1 AND f.id=a.resource_id AND CASE WHEN f.target_type='map' THEN $7 ELSE $6 END))
        OR (o.topic NOT LIKE 'thread.%' AND o.topic NOT LIKE 'map.%' AND o.topic NOT LIKE 'map-template.%' AND o.topic NOT LIKE 'asset.%' AND $6))
      AND ($4 OR o.topic NOT LIKE 'approval.%' OR a.resource_id IN (SELECT id::text FROM app.approvals WHERE project_id=$1 AND requested_by=$5))
    ORDER BY o.project_sequence LIMIT 101`,[projectId,after,canReadThreads,actor.kind==='human',actor.id,canReadTasks,canReadMaps])).rows;
  const items=rows.slice(0,100).map(({position,...row})=>({...row,cursor:eventCursor(projectId,position)}));
  return {items,cursor:items.at(-1)?.cursor||cursor||null,hasMore:rows.length>100};
}
