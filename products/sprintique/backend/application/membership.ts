import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize,requireActiveCredential,hash,secret} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import {idempotent,recordEvent} from './commands.js';

/** Same project lock as canonical writes: revocation cannot race a later committed effect. */
export async function manageProject(tx:Transaction,actor:Actor,projectId:string){
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['membership:'+projectId]);
  await tx.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[projectId]);
  await requireActiveCredential(tx,actor);return authorize(tx,actor,projectId,'agents:manage');
}
export async function projectMembers(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,'tasks:read');
  return (await tx.query(`SELECT p.id,coalesce(p.profile_name,p.name) AS name,p.kind,m.role,m.revision
    FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id WHERE m.project_id=$1 ORDER BY name,p.id LIMIT 501`,[projectId])).rows;
}
async function preserveAdmin(tx:Transaction,table:'project_members'|'workspace_members',column:'project_id'|'workspace_id',scope:string,role:string,next:string|null){
  if(role==='admin'&&next!=='admin'){
    const count=(await tx.query<{n:number}>(`SELECT count(*)::int n FROM app.${table} m JOIN auth.principals p ON p.id=m.principal_id WHERE m.${column}=$1 AND m.role='admin' AND p.kind='human' AND p.disabled_at IS NULL`,[scope])).rows[0]!.n;
    requireCondition(count>1,409,'LAST_ADMIN','Сначала назначьте другого администратора.');
  }
}
export async function changeMember(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;role:'reader'|'editor'|'admin'|null},key:string){
  await manageProject(tx,actor,projectId);
  return idempotent(tx,actor,projectId,'member.change:'+id,key,input,async()=>{
    requireCondition(id!==actor.id||input.role!==null,422,'SELF_REMOVAL','Удаление своего доступа выполняет другой администратор.');
    const member=(await tx.query<{role:string;revision:number;kind:string}>(`SELECT m.role,m.revision,p.kind FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id WHERE m.project_id=$1 AND m.principal_id=$2`,[projectId,id])).rows[0];
    requireCondition(member,404,'NOT_FOUND','Участник недоступен.');
    requireCondition(member.kind==='human',422,'AGENT_GRANT_REQUIRED','Доступ агента изменяется через его разрешение.');
    requireCondition(member.revision===input.baseRevision,409,'CONFLICT','Права участника уже изменены.');
    await preserveAdmin(tx,'project_members','project_id',projectId,member.role,input.role);
    // Record while the actor is still a member, including self-removal. One transaction.
    await recordEvent(tx,actor,projectId,'member.updated',id,member.revision+1);
    if(input.role===null)await tx.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[projectId,id]);
    else await tx.query('UPDATE app.project_members SET role=$3,revision=revision+1 WHERE project_id=$1 AND principal_id=$2',[projectId,id,input.role]);
    if(input.role===null||input.role==='reader')await tx.query("UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE project_id=$1 AND kind='agent' AND initiator_id=$2 AND revoked_at IS NULL",[projectId,id]);
    return {id,role:input.role,revision:member.revision+1};
  });
}
export async function invitations(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,'agents:manage');
  return (await tx.query(`SELECT id,role,created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt",accepted_at AS "acceptedAt" FROM auth.project_invitations WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100`,[projectId])).rows;
}
export async function createInvitation(tx:Transaction,actor:Actor,projectId:string,input:{id:string;role:'reader'|'editor'|'admin';expiresInSeconds:number}){
  await manageProject(tx,actor,projectId);
  const count=(await tx.query<{n:number}>(`SELECT count(*)::int n FROM auth.project_invitations WHERE project_id=$1 AND created_at>clock_timestamp()-interval '1 day'`,[projectId])).rows[0]!.n;
  requireCondition(count<100,429,'INVITATION_LIMIT','Лимит приглашений на сегодня исчерпан.');
  const token='invite_'+secret();
  const row=(await tx.query(`INSERT INTO auth.project_invitations(id,project_id,token_hash,role,inviter_id,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()+make_interval(secs=>$6)) RETURNING id,role,expires_at AS "expiresAt"`,[input.id,projectId,hash(token),input.role,actor.id,input.expiresInSeconds])).rows[0];
  await recordEvent(tx,actor,projectId,'invitation.created',input.id,1);
  // Intentional once-only secret; neither the ledger nor audit stores its value.
  return {...row,token};
}
export async function revokeInvitation(tx:Transaction,actor:Actor,projectId:string,id:string){
  await manageProject(tx,actor,projectId);
  const result=await tx.query('UPDATE auth.project_invitations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE project_id=$1 AND id=$2 AND accepted_at IS NULL RETURNING id',[projectId,id]);
  requireCondition(result.rowCount===1,404,'NOT_FOUND','Приглашение недоступно.');
  await recordEvent(tx,actor,projectId,'invitation.revoked',id,1);return {revoked:true};
}
export async function acceptInvitation(tx:Transaction,actor:Actor,token:string){
  requireCondition(actor.kind==='human',403,'FORBIDDEN','Приглашение предназначено для человека.');
  // Resolve scope without exposing project data, then share the management lock order.
  const scope=(await tx.query<{project_id:string}>('SELECT project_id FROM auth.project_invitations WHERE token_hash=$1',[hash(token)])).rows[0];
  requireCondition(scope,404,'INVITATION_INVALID','Приглашение недоступно.');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['membership:'+scope.project_id]);
  const invitation=(await tx.query<{id:string;project_id:string;role:string;inviter_id:string;accepted_by:string|null;revoked_at:Date|null;valid:boolean}>(`SELECT *,expires_at>clock_timestamp() AS valid FROM auth.project_invitations WHERE token_hash=$1 FOR UPDATE`,[hash(token)])).rows[0];
  requireCondition(invitation,404,'INVITATION_INVALID','Приглашение недоступно.');
  requireCondition(!invitation.revoked_at&&invitation.valid,410,'INVITATION_EXPIRED','Приглашение отменено или устарело.');
  requireCondition(!invitation.accepted_by||invitation.accepted_by===actor.id,409,'INVITATION_USED','Приглашение уже использовано.');
  await requireActiveCredential(tx,actor);
  // The inviter must still be an active administrator. Never infer identities from email.
  const inviter=await tx.query(`SELECT 1 FROM app.project_members m JOIN auth.principals p ON p.id=m.principal_id WHERE m.project_id=$1 AND m.principal_id=$2 AND m.role='admin' AND p.disabled_at IS NULL FOR UPDATE OF m`,[invitation.project_id,invitation.inviter_id]);
  requireCondition(inviter.rowCount===1,403,'INVITATION_REVOKED','Автор приглашения больше не управляет проектом.');
  if(!invitation.accepted_by){
    const count=(await tx.query<{n:number}>('SELECT count(*)::int n FROM app.project_members WHERE project_id=$1',[invitation.project_id])).rows[0]!.n;
    requireCondition(count<500,422,'MEMBER_LIMIT','В проекте достигнут лимит участников.');
    // Membership input is private infrastructure data; canonical project RLS becomes visible only after this insert.
    await tx.query('INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[invitation.project_id,actor.id,invitation.role]);
  }
  const project=(await tx.query<{id:string;workspaceId:string;slug:string}>('SELECT id,workspace_id AS "workspaceId",slug FROM app.projects WHERE id=$1 FOR UPDATE',[invitation.project_id])).rows[0];
  requireCondition(project,403,'INVITATION_REVOKED','Доступ к проекту отозван.');
  if(!invitation.accepted_by){
    await tx.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[project.workspaceId,actor.id]);
    await tx.query('UPDATE auth.project_invitations SET accepted_at=clock_timestamp(),accepted_by=$2 WHERE id=$1',[invitation.id,actor.id]);
    await recordEvent(tx,actor,project.id,'member.joined',actor.id,1);
  }
  return {projectId:project.id,slug:project.slug};
}
export async function profile(tx:Transaction,actor:Actor){
  return (await tx.query('SELECT id,coalesce(profile_name,name) AS name,revision FROM auth.principals WHERE id=$1',[actor.id])).rows[0];
}
export async function changeProfile(tx:Transaction,actor:Actor,input:{baseRevision:number;name:string}){
  requireCondition(actor.kind==='human',403,'FORBIDDEN','Профиль доступен человеку.');await requireActiveCredential(tx,actor);
  const result=await tx.query('UPDATE auth.principals SET profile_name=$2,revision=revision+1 WHERE id=$1 AND revision=$3 RETURNING id,profile_name AS name,revision',[actor.id,input.name,input.baseRevision]);
  requireCondition(result.rowCount===1,409,'CONFLICT','Профиль уже изменён.');return result.rows[0];
}
