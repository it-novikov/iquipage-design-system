import {randomUUID} from 'node:crypto';
import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize,requireActiveCredential} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import {idempotent,recordEvent} from './commands.js';
import {manageProject} from './membership.js';
import {linkProjectAvatar} from './media.js';

export async function projectProfile(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,'tasks:read');
  return (await tx.query('SELECT id,name,slug,key,profile_revision AS revision,avatar_asset_id AS "avatarAssetId" FROM app.projects WHERE id=$1',[projectId])).rows[0];
}
export async function putProjectProfile(tx:Transaction,actor:Actor,projectId:string,input:{baseRevision:number;name:string;avatarAssetId:string|null},key:string){
  await manageProject(tx,actor,projectId);
  return idempotent(tx,actor,projectId,'project.profile',key,input,async()=>{
    const current=await projectProfile(tx,actor,projectId);
    requireCondition(current?.['revision']===input.baseRevision,409,'CONFLICT','Настройки проекта уже изменены.');
    await linkProjectAvatar(tx,actor,projectId,input.avatarAssetId);
    await tx.query('UPDATE app.projects SET name=$2,profile_revision=profile_revision+1 WHERE id=$1',[projectId,input.name]);
    await recordEvent(tx,actor,projectId,'project.updated',projectId,input.baseRevision+1);return projectProfile(tx,actor,projectId);
  });
}
export async function workspaceProfile(tx:Transaction,actor:Actor,id:string){
  requireCondition(actor.kind==='human',403,'HUMAN_REQUIRED','Пространством управляет человек.');
  const workspace=(await tx.query('SELECT w.id,w.name,w.timezone,w.revision,m.role FROM app.workspaces w JOIN app.workspace_members m ON m.workspace_id=w.id AND m.principal_id=$2 WHERE w.id=$1',[id,actor.id])).rows[0];
  requireCondition(workspace,404,'NOT_FOUND','Пространство недоступно.');return workspace;
}
export async function workspaceLock(tx:Transaction,actor:Actor,id:string){
  await workspaceProfile(tx,actor,id);
  await tx.query('SELECT id FROM app.workspaces WHERE id=$1 FOR UPDATE',[id]);
  await requireActiveCredential(tx,actor);
  const workspace=await workspaceProfile(tx,actor,id);
  requireCondition(workspace['role']==='admin',403,'FORBIDDEN','Нужны права администратора пространства.');return workspace;
}
async function audit(tx:Transaction,actor:Actor,workspaceId:string,action:string,id:string,revision:number){
  await tx.query('INSERT INTO app.workspace_audit(id,workspace_id,actor_id,action,resource_id,revision) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),workspaceId,actor.id,action,id,revision]);
}
export async function putWorkspaceProfile(tx:Transaction,actor:Actor,id:string,input:{baseRevision:number;name:string;timezone:string}){
  const current=await workspaceLock(tx,actor,id);
  requireCondition(current['revision']===input.baseRevision,409,'CONFLICT','Пространство уже изменено.');
  await tx.query('UPDATE app.workspaces SET name=$2,timezone=$3,revision=revision+1 WHERE id=$1',[id,input.name,input.timezone]);
  await audit(tx,actor,id,'workspace.updated',id,input.baseRevision+1);return workspaceProfile(tx,actor,id);
}
export async function workspaceMembers(tx:Transaction,actor:Actor,id:string){
  await workspaceLock(tx,actor,id);
  return (await tx.query('SELECT p.id,coalesce(p.profile_name,p.name) AS name,m.role,m.revision FROM app.workspace_members m JOIN auth.principals p ON p.id=m.principal_id WHERE m.workspace_id=$1 ORDER BY name,p.id LIMIT 501',[id])).rows;
}
export async function changeWorkspaceMember(tx:Transaction,actor:Actor,workspaceId:string,id:string,input:{baseRevision:number;role:'member'|'admin'|null}){
  await workspaceLock(tx,actor,workspaceId);
  const current=(await tx.query<{role:string;revision:number}>('SELECT role,revision FROM app.workspace_members WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,id])).rows[0];
  requireCondition(current,404,'NOT_FOUND','Участник недоступен.');
  requireCondition(current.revision===input.baseRevision,409,'CONFLICT','Права участника уже изменены.');
  if(current.role==='admin'&&input.role!=='admin'){
    const count=(await tx.query<{n:number}>("SELECT count(*)::int n FROM app.workspace_members m JOIN auth.principals p ON p.id=m.principal_id WHERE workspace_id=$1 AND role='admin' AND p.kind='human' AND p.disabled_at IS NULL",[workspaceId])).rows[0]!.n;
    requireCondition(count>1,409,'LAST_ADMIN','Сначала назначьте другого администратора.');
  }
  if(input.role===null){
    requireCondition(id!==actor.id,422,'SELF_REMOVAL','Удаление своего доступа выполняет другой администратор.');
    // Workspace roles do not implicitly grant/revoke project roles. Avoid hidden cascading removal.
    const linked=await tx.query('SELECT 1 FROM app.project_members m JOIN app.projects p ON p.id=m.project_id WHERE p.workspace_id=$1 AND m.principal_id=$2 LIMIT 1',[workspaceId,id]);
    requireCondition(linked.rowCount===0,409,'PROJECT_ACCESS_REMAINS','Сначала удалите участника из проектов пространства.');
    await tx.query('DELETE FROM app.workspace_members WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,id]);
  }else await tx.query('UPDATE app.workspace_members SET role=$3,revision=revision+1 WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,id,input.role]);
  await audit(tx,actor,workspaceId,'workspace.member.updated',id,input.baseRevision+1);
  return {id,role:input.role,revision:input.baseRevision+1};
}
