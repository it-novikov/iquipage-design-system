import {randomUUID} from 'node:crypto';
import type {Actor,Transaction} from '../infrastructure/database.js';
import {hash,secret} from '../infrastructure/database.js';
import type {Capability,Project} from '../../contracts/index.js';
import {requireCondition} from '../domain/errors.js';
import {recordEvent} from './commands.js';

export async function sessionInfo(tx:Transaction,actor:Actor){
  const projects=(await tx.query<Project>(`SELECT p.id,p.workspace_id AS "workspaceId",p.name,p.slug,p.key,m.role,w.name AS "workspaceName" FROM app.projects p JOIN app.project_members m ON m.project_id=p.id AND m.principal_id=$1 JOIN app.workspaces w ON w.id=p.workspace_id ORDER BY w.name,p.name`,[actor.id])).rows;
  return {principal:{id:actor.id,name:actor.name,kind:actor.kind},csrf:actor.csrf,projects};
}
export async function createWorkspace(tx:Transaction,actor:Actor,name:string,timezone='UTC'){
  requireCondition(actor.kind==='human',403,'FORBIDDEN','Пространство создаёт человек.');
  const id=randomUUID();
  await tx.query('INSERT INTO app.workspaces(id,name,created_by,timezone) VALUES($1,$2,$3,$4)',[id,name,actor.id,timezone]);
  await tx.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'admin')",[id,actor.id]);
  return {id,name,timezone};
}
export async function createProject(tx:Transaction,actor:Actor,input:{workspaceId:string;name:string;slug:string;key:string;timezone?:string|null}){
  requireCondition(actor.kind==='human',403,'FORBIDDEN','Проект создаёт человек.');
  const access=await tx.query("SELECT 1 FROM app.workspace_members WHERE workspace_id=$1 AND principal_id=$2 AND role='admin'",[input.workspaceId,actor.id]);
  requireCondition(access.rowCount===1,403,'FORBIDDEN','Нужны права администратора пространства.');
  const id=randomUUID();
  await tx.query('INSERT INTO app.projects(id,workspace_id,name,slug,key,timezone) VALUES($1,$2,$3,$4,$5,$6)',[id,input.workspaceId,input.name,input.slug,input.key,input.timezone||null]);
  await tx.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'admin')",[id,actor.id]);
  await recordEvent(tx,actor,id,'project.created',id,1);
  return {id,...input};
}
export async function issueAgent(tx:Transaction,actor:Actor,projectId:string,input:{name:string;capabilities:Capability[];expiresInSeconds:number}){
  const id=randomUUID(),credentialId=randomUUID(),token='spr_'+secret();
  await tx.query("INSERT INTO auth.principals(id,name,kind) VALUES($1,$2,'agent')",[id,input.name]);
  await tx.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[projectId,id]);
  const expiresAt=new Date(Date.now()+input.expiresInSeconds*1000).toISOString();
  await tx.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,project_id,capabilities,initiator_id,expires_at) VALUES($1,$2,$3,'agent',$4,$5,$6,$7)",[credentialId,id,hash(token),projectId,input.capabilities,actor.id,expiresAt]);
  await recordEvent(tx,actor,projectId,'agent.granted',id,1);
  // Token is shown once; never put this result in the idempotency ledger or logs.
  return {id,credentialId,token,expiresAt,capabilities:input.capabilities};
}
export async function revokeAgent(tx:Transaction,actor:Actor,projectId:string,id:string){
  const result=await tx.query("UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND kind='agent' RETURNING principal_id",[projectId,id]);
  requireCondition(result.rowCount===1,404,'NOT_FOUND','Разрешение недоступно.');
  await recordEvent(tx,actor,projectId,'agent.revoked',id,1);
  return {revoked:true};
}
