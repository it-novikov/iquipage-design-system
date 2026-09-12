import {randomUUID} from 'node:crypto';
import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize,hash,secret} from '../infrastructure/database.js';
import {Problem,requireCondition} from '../domain/errors.js';
import {planChange,projectRows,validateTemporal} from '../domain/planning.js';
import type {PlanningState,PlanResult,TaskState,HistoryItem} from '../domain/planning.js';
import {PLANNING_POLICY,PAGE_SIZE} from '../../contracts/planning.js';
import type {Page,PlanningQuery,PlanningRow,PlanningCommand,Preview,Receipt,Release,ReleaseData,Milestone,TemporalConstraint} from '../../contracts/planning.js';
import {idempotent,canonical} from './commands.js';

export const releaseProjection=`id,project_id AS "projectId",name,revision,scope_revision::float8 AS "scopeRevision",lifecycle,format,
  to_char(planned_start,'YYYY-MM-DD') AS "plannedStart",to_char(planned_end,'YYYY-MM-DD') AS "plannedEnd",
  to_char(deadline,'YYYY-MM-DD') AS deadline,archived_at AS "archivedAt"`;
export async function planningLock(tx:Transaction,actor:Actor,projectId:string,write=false){
  await authorize(tx,actor,projectId,write?'tasks:write':'tasks:read');
  const row=(await tx.query<{revision:number;timezone:string}>(`SELECT p.planning_revision::float8 AS revision,auth.project_timezone(p.id) AS timezone
    FROM app.projects p WHERE p.id=$1 FOR UPDATE OF p`,[projectId])).rows[0];
  requireCondition(row,404,'NOT_FOUND','Проект недоступен.');
  // Recheck after a queued command acquires the aggregate lock, not only on arrival.
  await authorize(tx,actor,projectId,write?'tasks:write':'tasks:read');
  const credential=await tx.query(`SELECT 1 FROM auth.credentials c JOIN auth.principals p ON p.id=c.principal_id
    WHERE c.id=$1 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND p.disabled_at IS NULL`,[actor.credentialId]);
  requireCondition(credential.rowCount===1,401,'UNAUTHENTICATED','Сессия завершена.');return row;
}
export async function loadPlanningState(tx:Transaction,projectId:string):Promise<PlanningState>{
  const tasks=(await tx.query<TaskState>(`SELECT t.id,p.key||'-'||t.number AS "displayId",t.revision,t.parent_id AS "parentId",t.title,t.type,t.status,
    t.owner_label AS owner,t.priority,t.rank,to_char(t.status_entered_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "statusEnteredAt",
    to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
    t.preparation,t.result,t.admitted,t.assignment_mode AS "assignmentMode",t.release_id AS "releaseId",
    to_char(t.planned_start,'YYYY-MM-DD') AS "plannedStart",to_char(t.due,'YYYY-MM-DD') AS due,
    ARRAY(SELECT tag_id FROM app.task_tags WHERE project_id=t.project_id AND task_id=t.id ORDER BY tag_id) AS "tagIds"
    FROM app.tasks t JOIN app.projects p ON p.id=t.project_id WHERE t.project_id=$1 ORDER BY t.number`,[projectId])).rows;
  const releases=(await tx.query<Release>(`SELECT ${releaseProjection} FROM app.releases WHERE project_id=$1 ORDER BY id`,[projectId])).rows;
  const milestones=(await tx.query<Milestone>(`SELECT id,title,to_char(date,'YYYY-MM-DD') AS date,revision FROM app.milestones WHERE project_id=$1 ORDER BY id`,[projectId])).rows;
  const constraints=(await tx.query<TemporalConstraint>(`SELECT id,revision,jsonb_build_object('kind',source_kind,'id',source_id) AS source,
    jsonb_build_object('kind',target_kind,'id',target_id) AS target,relation,lag_days AS "lagDays" FROM app.temporal_constraints WHERE project_id=$1 ORDER BY id`,[projectId])).rows;
  return {tasks,releases,milestones,constraints};
}
const encode=(data:unknown)=>Buffer.from(JSON.stringify(data)).toString('base64url');
function offset(cursor:string|undefined,binding:string,revision:number){
  if(!cursor)return 0;
  let value:{binding?:unknown;revision?:unknown;offset?:unknown};
  try{value=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw new Problem(400,'CURSOR_INVALID','Некорректный курсор.');}
  requireCondition(value&&value.binding===binding&&Number.isSafeInteger(value.offset)&&Number(value.offset)>=0,400,'CURSOR_INVALID','Курсор другого списка.');
  requireCondition(value.revision===revision,409,'CURSOR_STALE','Список изменился. Загрузите его заново.');return Number(value.offset);
}
export function page<T>(items:T[],binding:string,revision:number,limit:number,cursor?:string):Page<T>{
  const start=offset(cursor,binding,revision),end=start+limit;
  return {items:items.slice(start,end),total:items.length,projectRevision:revision,nextCursor:end<items.length?encode({binding,revision,offset:end}):null};
}
export async function listPlanning(tx:Transaction,actor:Actor,projectId:string,query:PlanningQuery){
  const {revision}=await planningLock(tx,actor,projectId),state=await loadPlanningState(tx,projectId);
  const {cursor,...filters}=query;
  const rows=projectRows(state).filter(t=>(!query.q||(t.title+' '+t.displayId).toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))
    &&(!query.releaseId||t.effectiveReleaseId===query.releaseId)&&(!query.unassigned||!t.effectiveReleaseId)
    &&(!query.parentId||t.parentId===query.parentId)&&(!query.preparation||t.preparation===query.preparation)
    &&(!query.status||t.status===query.status)&&(!query.owner||t.owner===query.owner)
    &&(!query.tagId||t.tagIds.includes(query.tagId))&&(!query.board||t.boardEligible));
  return page(rows,hash(projectId+JSON.stringify(filters)),revision,query.limit,cursor);
}
export async function listReleases(tx:Transaction,actor:Actor,projectId:string,limit:number,cursor?:string){
  const {revision,timezone}=await planningLock(tx,actor,projectId),state=await loadPlanningState(tx,projectId),rows=projectRows(state);
  const counts=new Map<string,{total:number;ready:number;accepted:number;onBoard:number}>();
  for(const row of rows)if(row.effectiveReleaseId){const c=counts.get(row.effectiveReleaseId)||{total:0,ready:0,accepted:0,onBoard:0};
    c.total++;if(row.preparation==='ready')c.ready++;if(row.result==='accepted')c.accepted++;if(row.boardEligible)c.onBoard++;counts.set(row.effectiveReleaseId,c);
  }
  const releases=state.releases.map(r=>({...r,counts:counts.get(r.id)||{total:0,ready:0,accepted:0,onBoard:0}}));
  return {...page(releases,projectId+':releases',revision,limit,cursor),timezone};
}
async function event(tx:Transaction,actor:Actor,projectId:string,operationId:string,topic:string,resourceId:string,revision:number){
  const id=randomUUID(),payload={id,projectId,resourceId,revision,actorId:actor.id,initiatorId:actor.initiatorId,operationId,correlationId:operationId,causationId:operationId};
  await tx.query(`INSERT INTO app.audit_events(id,project_id,actor_id,initiator_id,action,resource_id,revision,operation_id,correlation_id,causation_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$8)`,[id,projectId,actor.id,actor.initiatorId,topic,resourceId,revision,operationId]);
  await tx.query('INSERT INTO app.outbox(id,project_id,topic,payload) VALUES($1,$2,$3,$4)',[id,projectId,topic,JSON.stringify(payload)]);
}
export async function saveRelease(tx:Transaction,projectId:string,release:Release){
  await tx.query(`INSERT INTO app.releases(project_id,id,name,status,target_date,revision,archived_at,lifecycle,format,planned_start,planned_end,deadline,scope_revision)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$5,$12)
    ON CONFLICT(project_id,id) DO UPDATE SET name=$3,status=$4,target_date=$5,revision=$6,archived_at=$7,lifecycle=$8,format=$9,planned_start=$10,planned_end=$11,deadline=$5,scope_revision=$12`,
  [projectId,release.id,release.name,['closed','cancelled'].includes(release.lifecycle)?'released':'planned',release.deadline,release.revision,release.archivedAt,
    release.lifecycle,release.format,release.plannedStart,release.plannedEnd,release.scopeRevision]);
}
export async function writeRelease(tx:Transaction,actor:Actor,projectId:string,id:string,baseRevision:number,value:ReleaseData,key:string){
  await planningLock(tx,actor,projectId,true);
  requireCondition(actor.kind==='human',403,'APPROVAL_REQUIRED','Агент должен предложить изменение для проверки.');
  return idempotent(tx,actor,projectId,'planning.release:'+id,key,{baseRevision,value},async()=>{
    const state=await loadPlanningState(tx,projectId),previous=state.releases.find(r=>r.id===id);
    requireCondition((previous?.revision||0)===baseRevision,409,'CONFLICT','Релиз уже изменён.');
    requireCondition(!previous||previous.lifecycle==='planned',409,'PREVIEW_REQUIRED','Активный состав и завершённый релиз нельзя менять через обычный редактор.');
    const release:Release={...value,id,projectId,revision:baseRevision+1,scopeRevision:previous?.scopeRevision||0,lifecycle:'planned',archivedAt:null};
    state.releases=state.releases.filter(r=>r.id!==id).concat(release);validateTemporal(state);
    await saveRelease(tx,projectId,release);await event(tx,actor,projectId,randomUUID(),previous?'release.updated':'release.created',id,release.revision);return release;
  });
}
interface StoredPlan {
  id:string;actorId:string;credentialId:string;initiatorId:string;tokenHash:string;projectRevision:number;policyVersion:string;actionHash:string;
  command:PlanningCommand;effects:PlanResult;summary:Omit<Preview,'token'|'effects'|'nextCursor'>;expiresAt:Date;
}
async function readPlan(tx:Transaction,actor:Actor,projectId:string,id:string):Promise<StoredPlan>{
  const row=(await tx.query<StoredPlan>(`SELECT id,actor_id AS "actorId",credential_id AS "credentialId",initiator_id AS "initiatorId",token_hash AS "tokenHash",
    project_revision::float8 AS "projectRevision",policy_version AS "policyVersion",action_hash AS "actionHash",command,effects,summary,expires_at AS "expiresAt"
    FROM app.planning_plans WHERE project_id=$1 AND id=$2 AND actor_id=$3`,[projectId,id,actor.id])).rows[0];
  requireCondition(row,404,'PLAN_NOT_FOUND','План недоступен.');return row;
}
export async function preview(tx:Transaction,actor:Actor,projectId:string,command:PlanningCommand):Promise<Preview>{
  const {revision}=await planningLock(tx,actor,projectId,true),state=await loadPlanningState(tx,projectId),effects=planChange(state,command);
  const id=randomUUID(),token=secret(),expiresAt=new Date(Date.now()+10*60000),approvalId=actor.kind==='agent'?randomUUID():null;
  const actionHash=hash(canonical({projectId,actorId:actor.id,credentialId:actor.credentialId,initiatorId:actor.initiatorId,revision,policy:PLANNING_POLICY,command,effects}));
  const summary:StoredPlan['summary']={id,expiresAt:expiresAt.toISOString(),actionHash,policyVersion:PLANNING_POLICY,projectRevision:revision,
    affectedCount:effects.effects.length,selectedCount:effects.selectedCount,
    enteringBoard:effects.effects.filter(e=>!e.before?.boardEligible&&e.after.boardEligible).length,
    leavingBoard:effects.effects.filter(e=>e.before?.boardEligible&&!e.after.boardEligible).length,
    requiresApproval:approvalId!==null,approvalId,releases:effects.releases};
  await tx.query(`INSERT INTO app.planning_plans(project_id,id,actor_id,credential_id,initiator_id,token_hash,project_revision,policy_version,action_hash,command,effects,summary,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[projectId,id,actor.id,actor.credentialId,actor.initiatorId,hash(token),revision,PLANNING_POLICY,actionHash,JSON.stringify(command),JSON.stringify(effects),JSON.stringify(summary),expiresAt]);
  if(approvalId){
    await tx.query(`INSERT INTO app.approvals(project_id,id,subject_kind,subject_id,action_hash,requested_by,initiator_id,expires_at)
      VALUES($1,$2,'planning',$3,$4,$5,$6,$7)`,[projectId,approvalId,id,actionHash,actor.id,actor.initiatorId,expiresAt]);
    await event(tx,actor,projectId,randomUUID(),'approval.proposed',approvalId,1);
  }
  const result=page(effects.effects,id,revision,PAGE_SIZE);return {...summary,token,effects:result.items,nextCursor:result.nextCursor};
}
export async function previewEffects(tx:Transaction,actor:Actor,projectId:string,id:string,limit:number,cursor?:string){
  await planningLock(tx,actor,projectId);const stored=await readPlan(tx,actor,projectId,id);
  requireCondition(stored.expiresAt.getTime()>Date.now(),409,'PLAN_EXPIRED','Превью устарело.');
  return page(stored.effects.effects,id,stored.projectRevision,limit,cursor);
}
async function applyPlan(tx:Transaction,actor:Actor,projectId:string,operationId:string,result:PlanResult){
  for(const release of result.releases)await saveRelease(tx,projectId,release);
  if(result.tasks.length)await tx.query(`UPDATE app.tasks t SET revision=n.revision,parent_id=n."parentId",release_id=n."releaseId",
    assignment_mode=n."assignmentMode",preparation=n.preparation,result=n.result,admitted=n.admitted,owner_label=n.owner,priority=n.priority,
    planned_start=n."plannedStart"::date,due=n.due::date,updated_at=clock_timestamp()
    FROM jsonb_to_recordset($2::jsonb) AS n(id text,revision integer,"parentId" text,"releaseId" text,"assignmentMode" text,preparation text,result text,
      admitted boolean,owner text,priority text,"plannedStart" text,due text) WHERE t.project_id=$1 AND t.id=n.id`,[projectId,JSON.stringify(result.tasks)]);
  if(result.history)await tx.query(`INSERT INTO app.release_snapshots(project_id,id,release_id,kind,operation_id,items) VALUES($1,$2,$3,$4,$5,$6)`,
    [projectId,randomUUID(),result.history.releaseId,result.history.kind,operationId,JSON.stringify(result.history.items)]);
  for(const e of result.effects)await event(tx,actor,projectId,operationId,'task.plan.changed',e.id,e.after.revision);
  for(const r of result.releases)await event(tx,actor,projectId,operationId,result.history?.releaseId===r.id?'release.'+result.history.kind:'release.scope.changed',r.id,r.revision);
}
export async function commit(tx:Transaction,actor:Actor,projectId:string,input:{planId:string;token:string},key:string):Promise<Receipt>{
  const {revision}=await planningLock(tx,actor,projectId,true);
  return idempotent(tx,actor,projectId,'planning.commit',key,input,async()=>{
    const operationId=randomUUID();await tx.query('SAVEPOINT planning_apply');
    try{
      const stored=await readPlan(tx,actor,projectId,input.planId);
      requireCondition(stored.credentialId===actor.credentialId&&stored.initiatorId===actor.initiatorId&&stored.tokenHash===hash(input.token),403,'PLAN_FORBIDDEN','План недоступен для применения.');
      const applied=(await tx.query<{result:Receipt}>('SELECT result FROM app.planning_applied WHERE project_id=$1 AND plan_id=$2',[projectId,stored.id])).rows[0];
      if(applied){await tx.query('RELEASE SAVEPOINT planning_apply');return applied.result;}
      requireCondition(stored.expiresAt.getTime()>Date.now(),409,'PLAN_EXPIRED','Срок подтверждения истёк.');
      requireCondition(stored.projectRevision===revision&&stored.policyVersion===PLANNING_POLICY,409,'PLAN_STALE','Условия изменились. Просмотрите новый план.');
      if(actor.kind==='agent'){
        const approval=(await tx.query<{decidedBy:string}>(`SELECT decided_by AS "decidedBy" FROM app.approvals WHERE project_id=$1 AND subject_kind='planning'
          AND subject_id=$2 AND action_hash=$3 AND requested_by=$4 AND status='approved' AND expires_at>clock_timestamp()`,[projectId,stored.id,stored.actionHash,actor.id])).rows[0];
        requireCondition(approval,403,'APPROVAL_REQUIRED','Нужно решение человека по этому плану.');
        const approver=await tx.query(`SELECT 1 FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id WHERE project_id=$1
          AND principal_id=$2 AND role IN ('editor','admin') AND p.kind='human' AND p.disabled_at IS NULL`,[projectId,approval.decidedBy]);
        requireCondition(approver.rowCount===1,403,'APPROVAL_REVOKED','Полномочия подтвердившего участника изменились.');
      }
      // Recompute rather than trusting persisted client inputs or a partial prepared graph.
      const current=planChange(await loadPlanningState(tx,projectId),stored.command);
      requireCondition(canonical(current)===canonical(stored.effects),409,'PLAN_STALE','Последствия изменились. Просмотрите новый план.');
      await applyPlan(tx,actor,projectId,operationId,current);
      const final=(await tx.query<{revision:number}>('SELECT planning_revision::float8 AS revision FROM app.projects WHERE id=$1',[projectId])).rows[0]!;
      const result:Receipt={operationId,status:'committed',projectRevision:final.revision,affectedCount:current.effects.length,releaseIds:current.releases.map(r=>r.id)};
      await tx.query('INSERT INTO app.planning_applied(project_id,plan_id,result) VALUES($1,$2,$3)',[projectId,stored.id,JSON.stringify(result)]);
      await tx.query('RELEASE SAVEPOINT planning_apply');return result;
    }catch(error){
      await tx.query('ROLLBACK TO SAVEPOINT planning_apply');
      if(!(error instanceof Problem))throw error;
      // Domain rejection is a durable result. Transport/storage failure remains unknown to the caller.
      return {operationId,status:'rejected',error:{code:error.code,message:error.message,action:'refresh-preview'}};
    }
  });
}
export async function receipt(tx:Transaction,actor:Actor,projectId:string,key:string):Promise<Receipt>{
  await planningLock(tx,actor,projectId);
  const row=(await tx.query<{result:Receipt}>('SELECT result FROM app.idempotency WHERE project_id=$1 AND actor_id=$2 AND operation=$3 AND key=$4',[projectId,actor.id,'planning.commit',key])).rows[0];
  requireCondition(row,404,'RECEIPT_NOT_FOUND','Подтверждённого результата пока нет. Повторите тот же запрос с тем же ключом.');return row.result;
}
export async function approvalDetail(tx:Transaction,actor:Actor,projectId:string,id:string){
  await planningLock(tx,actor,projectId);
  const row=(await tx.query(`SELECT id,subject_kind AS "subjectKind",subject_id AS "subjectId",action_hash AS "actionHash",requested_by AS "requestedBy",
    initiator_id AS "initiatorId",status,revision,expires_at AS "expiresAt" FROM app.approvals WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
  requireCondition(row,404,'NOT_FOUND','Предложение недоступно.');
  requireCondition(actor.kind==='human'||row['requestedBy']===actor.id,404,'NOT_FOUND','Предложение недоступно.');
  const plan=(await tx.query('SELECT command,summary FROM app.planning_plans WHERE project_id=$1 AND id=$2',[projectId,row['subjectId']])).rows[0];
  const applied=(await tx.query('SELECT result FROM app.planning_applied WHERE project_id=$1 AND plan_id=$2',[projectId,row['subjectId']])).rows[0];
  return {...row,command:plan?.['command'],preview:plan?.['summary'],application:applied?.['result']||null};
}
export async function decideApproval(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;status:'approved'|'rejected'},key:string){
  await planningLock(tx,actor,projectId,true);requireCondition(actor.kind==='human',403,'HUMAN_REQUIRED','Решение принимает человек.');
  return idempotent(tx,actor,projectId,'approval.decide:'+id,key,input,async()=>{
    const updated=await tx.query(`UPDATE app.approvals SET status=$3,decided_by=$4,decided_at=clock_timestamp(),revision=revision+1
      WHERE project_id=$1 AND id=$2 AND revision=$5 AND status='proposed' AND expires_at>clock_timestamp() RETURNING revision`,[projectId,id,input.status,actor.id,input.baseRevision]);
    requireCondition(updated.rowCount===1,409,'APPROVAL_STALE','Предложение изменено или устарело.');
    await event(tx,actor,projectId,randomUUID(),'approval.'+input.status,id,updated.rows[0]!['revision']);
    return approvalDetail(tx,actor,projectId,id);
  });
}
export async function approvalEffects(tx:Transaction,actor:Actor,projectId:string,id:string,limit:number,cursor?:string){
  const approval=await approvalDetail(tx,actor,projectId,id);
  const stored=(await tx.query<{effects:PlanResult;revision:number}>('SELECT effects,project_revision::float8 AS revision FROM app.planning_plans WHERE project_id=$1 AND id=$2',[projectId,approval['subjectId']])).rows[0]!;
  return page(stored.effects.effects,'approval:'+id,stored.revision,limit,cursor);
}
export async function history(tx:Transaction,actor:Actor,projectId:string,releaseId:string,limit:number,cursor?:string){
  await planningLock(tx,actor,projectId);
  const rows=(await tx.query<{id:string;releaseId:string;kind:string;operationId:string;items:HistoryItem[];createdAt:Date}>(`SELECT id,release_id AS "releaseId",kind,operation_id AS "operationId",items,created_at AS "createdAt"
    FROM app.release_snapshots WHERE project_id=$1 AND release_id=$2 ORDER BY created_at,id`,[projectId,releaseId])).rows;
  const items=rows.flatMap(snapshot=>snapshot.items.map(item=>({snapshotId:snapshot.id,kind:snapshot.kind,operationId:snapshot.operationId,createdAt:snapshot.createdAt,...item})));
  return {...page(items,projectId+':history:'+releaseId,rows.length,limit,cursor),snapshots:rows.map(({items,...summary})=>({...summary,itemCount:items.length}))};
}
export async function writeMilestone(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;value:{title:string;date:string|null}},key:string){
  await planningLock(tx,actor,projectId,true);requireCondition(actor.kind==='human',403,'HUMAN_REQUIRED','Изменения календаря сейчас доступны человеку.');
  return idempotent(tx,actor,projectId,'milestone:'+id,key,input,async()=>{
    const state=await loadPlanningState(tx,projectId),previous=state.milestones.find(m=>m.id===id);
    requireCondition((previous?.revision||0)===input.baseRevision,409,'CONFLICT','Веха изменена.');
    const value={id,...input.value,revision:input.baseRevision+1};state.milestones=state.milestones.filter(m=>m.id!==id).concat(value);validateTemporal(state);
    await tx.query(`INSERT INTO app.milestones(project_id,id,title,date,revision) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(project_id,id) DO UPDATE SET title=$3,date=$4,revision=$5`,[projectId,id,value.title,value.date,value.revision]);
    await event(tx,actor,projectId,randomUUID(),'milestone.changed',id,value.revision);return value;
  });
}
export async function writeConstraint(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;value:Omit<TemporalConstraint,'id'|'revision'>},key:string){
  await planningLock(tx,actor,projectId,true);requireCondition(actor.kind==='human',403,'HUMAN_REQUIRED','Изменения календаря сейчас доступны человеку.');
  return idempotent(tx,actor,projectId,'constraint:'+id,key,input,async()=>{
    const state=await loadPlanningState(tx,projectId),previous=state.constraints.find(c=>c.id===id);
    requireCondition((previous?.revision||0)===input.baseRevision,409,'CONFLICT','Зависимость изменена.');
    const value={id,...input.value,revision:input.baseRevision+1};state.constraints=state.constraints.filter(c=>c.id!==id).concat(value);validateTemporal(state);
    await tx.query(`INSERT INTO app.temporal_constraints(project_id,id,source_kind,source_id,target_kind,target_id,relation,lag_days,revision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(project_id,id) DO UPDATE SET source_kind=$3,source_id=$4,target_kind=$5,target_id=$6,relation=$7,lag_days=$8,revision=$9`,
    [projectId,id,value.source.kind,value.source.id,value.target.kind,value.target.id,value.relation,value.lagDays,value.revision]);
    await event(tx,actor,projectId,randomUUID(),'temporal.constraint.changed',id,value.revision);return value;
  });
}
export async function roadmap(tx:Transaction,actor:Actor,projectId:string,query:{limit:number;cursor?:string|undefined;from?:string|undefined;to?:string|undefined;undated?:boolean}){
  const {revision,timezone}=await planningLock(tx,actor,projectId),state=await loadPlanningState(tx,projectId);
  const rows=[...projectRows(state).map(t=>({kind:'task',id:t.id,title:t.title,revision:t.revision,start:t.plannedStart,end:t.due})),
    ...state.releases.map(r=>({kind:'release',id:r.id,title:r.name,revision:r.revision,start:r.plannedStart,end:r.plannedEnd})),
    ...state.milestones.map(m=>({kind:'milestone',id:m.id,title:m.title,revision:m.revision,start:m.date,end:m.date}))]
    .filter(r=>(r.start||r.end)?(!query.from||(r.end||r.start)!>=query.from)&&(!query.to||(r.start||r.end)!<=query.to):query.undated!==false);
  const {cursor,...filters}=query;
  return {...page(rows,hash(projectId+':roadmap:'+JSON.stringify(filters)),revision,query.limit,cursor),timezone};
}
