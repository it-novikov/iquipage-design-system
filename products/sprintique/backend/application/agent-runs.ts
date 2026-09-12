import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import {idempotent,recordEvent} from './commands.js';
import {planningLock,preview,commit} from './planning.js';
import {readMap} from './maps.js';
import type {PlanningCommand} from '../../contracts/planning.js';
interface Run {id:string;projectId:string;agentId:string;credentialId:string;initiatorId:string;goal:string;state:string;revision:number;maxProposals:number;usedProposals:number;latestPlanId:string|null;parentRunId:string|null;expiresAt:Date;createdAt:Date;completedAt:Date|null;errorCode:string|null}
const projection=`id,project_id AS "projectId",agent_id AS "agentId",credential_id AS "credentialId",initiator_id AS "initiatorId",goal,state,revision,max_proposals AS "maxProposals",used_proposals AS "usedProposals",latest_plan_id AS "latestPlanId",parent_run_id AS "parentRunId",expires_at AS "expiresAt",created_at AS "createdAt",completed_at AS "completedAt",error_code AS "errorCode"`;
const present=(r:Run)=>({...r,state:!r.completedAt&&r.expiresAt.getTime()<=Date.now()?'expired':r.state});
async function row(tx:Transaction,actor:Actor,projectId:string,id:string){
  await authorize(tx,actor,projectId,'tasks:read');
  const run=(await tx.query<Run>(`SELECT ${projection} FROM app.agent_runs WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
  requireCondition(run&&(actor.kind==='human'||run.agentId===actor.id),404,'RUN_NOT_FOUND','Запуск недоступен.');return run;
}
function writable(run:Run,actor:Actor,revision:number){
  requireCondition(actor.kind==='agent'&&run.agentId===actor.id&&run.credentialId===actor.credentialId,403,'RUN_OWNER','Действие доступно выданному для запуска разрешению.');
  requireCondition(run.revision===revision,409,'CONFLICT','Состояние запуска изменилось.');
  requireCondition(!run.completedAt&&run.expiresAt.getTime()>Date.now(),409,'RUN_TERMINAL','Запуск остановлен или срок истёк. Создайте новый запуск.');
}
export async function listRuns(tx:Transaction,actor:Actor,projectId:string,cursor?:string){
  await authorize(tx,actor,projectId,'tasks:read');
  const rows=(await tx.query<Run>(`SELECT ${projection} FROM app.agent_runs WHERE project_id=$1 AND ($2 OR agent_id=$3) AND ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT 51`,[projectId,actor.kind==='human',actor.id,cursor||null])).rows;
  return {items:rows.slice(0,50).map(present),nextCursor:rows.length>50?rows[49]!.id:null};
}
export async function readRun(tx:Transaction,actor:Actor,projectId:string,id:string){
  const run=await row(tx,actor,projectId,id);
  const plans=(await tx.query(`SELECT p.plan_id AS id,s.summary,a.status AS approval,ap.result AS receipt FROM app.agent_run_plans p
    JOIN app.planning_plans s ON s.project_id=p.project_id AND s.id=p.plan_id
    LEFT JOIN app.approvals a ON a.project_id=p.project_id AND a.subject_id=p.plan_id::text
    LEFT JOIN app.planning_applied ap ON ap.project_id=p.project_id AND ap.plan_id=p.plan_id
    WHERE p.project_id=$1 AND p.run_id=$2 ORDER BY p.created_at,p.plan_id LIMIT 20`,[projectId,id])).rows;
  return {...present(run),plans};
}
export async function startRun(tx:Transaction,actor:Actor,projectId:string,input:{id:string;goal:string;maxProposals:number;expiresInSeconds:number;parentRunId?:string|undefined},key:string){
  await planningLock(tx,actor,projectId,true);requireCondition(actor.kind==='agent',403,'AGENT_REQUIRED','Запуск регистрирует агент с отдельным разрешением.');
  return idempotent(tx,actor,projectId,'run.start',key,input,async()=>{
    const count=(await tx.query<{n:number}>('SELECT count(*)::int n FROM app.agent_runs WHERE project_id=$1 AND agent_id=$2 AND completed_at IS NULL AND expires_at>clock_timestamp()',[projectId,actor.id])).rows[0]!.n;
    requireCondition(count<3,429,'RUN_LIMIT','Не более трёх активных запусков на агента.');
    if(input.parentRunId){const parent=await row(tx,actor,projectId,input.parentRunId);requireCondition(parent.agentId===actor.id&&(parent.completedAt||parent.expiresAt.getTime()<=Date.now()),409,'RUN_RETRY','Предыдущий запуск ещё активен.');}
    await tx.query(`INSERT INTO app.agent_runs(project_id,id,agent_id,credential_id,initiator_id,goal,state,max_proposals,expires_at,parent_run_id)
      SELECT $1,$2,$3,$4,$5,$6,'running',$7,least(expires_at,clock_timestamp()+make_interval(secs=>$8)),$9 FROM auth.credentials WHERE id=$4`,[projectId,input.id,actor.id,actor.credentialId,actor.initiatorId,input.goal,input.maxProposals,input.expiresInSeconds,input.parentRunId||null]);
    await recordEvent(tx,actor,projectId,'agent.run.started',input.id,1);return readRun(tx,actor,projectId,input.id);
  });
}
export async function proposeRun(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;command:PlanningCommand}){
  await planningLock(tx,actor,projectId,true);const run=await row(tx,actor,projectId,id);writable(run,actor,input.baseRevision);
  requireCondition(run.usedProposals<run.maxProposals,422,'RUN_BUDGET','Бюджет предложений исчерпан. Завершите запуск.');
  const plan=await preview(tx,actor,projectId,input.command);
  await tx.query('INSERT INTO app.agent_run_plans(project_id,run_id,plan_id) VALUES($1,$2,$3)',[projectId,id,plan.id]);
  await tx.query("UPDATE app.agent_runs SET state='awaiting_approval',revision=revision+1,used_proposals=used_proposals+1,latest_plan_id=$3 WHERE project_id=$1 AND id=$2",[projectId,id,plan.id]);
  await recordEvent(tx,actor,projectId,'agent.run.proposed',id,run.revision+1);
  // Like canonical previews, the seal is returned once, never persisted in the run/ledger.
  return {run:await readRun(tx,actor,projectId,id),preview:plan};
}
export async function commitRun(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;plan:{planId:string;token:string}},key:string){
  await planningLock(tx,actor,projectId,true);
  return idempotent(tx,actor,projectId,'run.commit:'+id,key,input,async()=>{
    const run=await row(tx,actor,projectId,id);writable(run,actor,input.baseRevision);requireCondition(run.latestPlanId===input.plan.planId,409,'RUN_PLAN','Подтверждается другое предложение.');
    const result=await commit(tx,actor,projectId,input.plan,'run-'+id+'-'+run.revision);
    await tx.query("UPDATE app.agent_runs SET state='running',revision=revision+1 WHERE project_id=$1 AND id=$2",[projectId,id]);
    await recordEvent(tx,actor,projectId,'agent.run.result',id,run.revision+1);return {run:await readRun(tx,actor,projectId,id),receipt:result};
  });
}
export async function finishRun(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;state:'completed'|'failed'|'cancelled';errorCode?:string|undefined},key:string){
  await planningLock(tx,actor,projectId,true);
  return idempotent(tx,actor,projectId,'run.finish:'+id,key,input,async()=>{
    const run=await row(tx,actor,projectId,id);
    if(actor.kind==='agent')writable(run,actor,input.baseRevision);
    else {const access=await authorize(tx,actor,projectId,'tasks:write');requireCondition(input.state==='cancelled'&&(run.initiatorId===actor.id||access.role==='admin'),403,'RUN_OWNER','Остановить запуск может инициатор или администратор.');requireCondition(run.revision===input.baseRevision&&!run.completedAt,409,'CONFLICT','Запуск уже изменён.');}
    if(input.state==='completed'){const applied=await tx.query('SELECT 1 FROM app.planning_applied WHERE project_id=$1 AND plan_id=$2',[projectId,run.latestPlanId]);requireCondition(applied.rowCount===1,409,'RUN_UNCONFIRMED','Сначала подтвердите результат последнего предложения.');}
    await tx.query('UPDATE app.agent_runs SET state=$3,revision=revision+1,completed_at=clock_timestamp(),error_code=$4 WHERE project_id=$1 AND id=$2',[projectId,id,input.state,input.state==='failed'?input.errorCode||'AGENT_FAILED':null]);
    await recordEvent(tx,actor,projectId,'agent.run.'+input.state,id,run.revision+1);return readRun(tx,actor,projectId,id);
  });
}
export async function agentContext(tx:Transaction,actor:Actor,projectId:string,input:{taskIds:string[];mapId?:string|undefined;objectIds?:string[]|undefined}){
  const data:{tasks?:unknown[];map?:unknown}={};
  if(input.taskIds.length){await authorize(tx,actor,projectId,'tasks:read');const ids=[...new Set(input.taskIds)];
    const rows=(await tx.query(`SELECT t.id,p.key||'-'||t.number AS key,t.title,t.description,t.revision,t.status,t.preparation,t.result FROM app.tasks t JOIN app.projects p ON p.id=t.project_id WHERE t.project_id=$1 AND t.id=ANY($2) ORDER BY t.id`,[projectId,ids])).rows;
    requireCondition(rows.length===ids.length,404,'CONTEXT_REFERENCE','Один из объектов контекста недоступен.');data.tasks=rows;
  }
  if(input.mapId){const map=await readMap(tx,actor,projectId,input.mapId),objects=map.document.objects.filter(o=>!input.objectIds||input.objectIds.includes(o.id));
    requireCondition(!input.objectIds||objects.length===new Set(input.objectIds).size,404,'CONTEXT_REFERENCE','Один из объектов карты недоступен.');
    requireCondition(objects.length<=100,422,'CONTEXT_LIMIT','Выберите не более 100 объектов карты.');
    data.map={id:map.id,revision:map.revision,title:map.title,objects:objects.map(o=>({id:o.id,type:o.type,text:o.text,parentId:o.parentId||null,locked:!!o.locked}))};
  }
  await authorize(tx,actor,projectId,input.mapId?'maps:read':'tasks:read');
  requireCondition(Buffer.byteLength(JSON.stringify(data))<=65536,422,'CONTEXT_LIMIT','Контекст превышает 64 КиБ. Уменьшите выборку.');
  return {schema:'sprintique.agent-context/1',projectId,trust:'untrusted-content',data};
}
