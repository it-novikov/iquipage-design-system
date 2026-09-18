import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {authorize} from '../infrastructure/database.js';
import {StartAgentRun,AgentRunProposal,AgentRunCommit,FinishAgentRun,AgentContextQuery} from '../../contracts/agents.js';
import * as runs from '../application/agent-runs.js';
export function registerAgentRoutes(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId';
  const runParams=(r:Parameters<typeof params>[0])=>{const p=params(r);return {...p,id:z.uuid().parse(p.id)};};
  app.get(base+'/agents',r=>authenticated(r,async(tx,a)=>{const {projectId}=params(r);await authorize(tx,a,projectId,'agents:manage');return (await tx.query(`SELECT c.id,p.name,c.principal_id AS "agentId",c.capabilities,c.initiator_id AS "initiatorId",c.expires_at AS "expiresAt",c.revoked_at AS "revokedAt" FROM auth.credentials c JOIN auth.principals p ON p.id=c.principal_id WHERE c.project_id=$1 AND c.kind='agent' ORDER BY c.expires_at DESC LIMIT 100`,[projectId])).rows;}));
  app.get(base+'/agent-runs',r=>authenticated(r,(tx,a)=>runs.listRuns(tx,a,params(r).projectId,z.strictObject({cursor:z.uuid().optional()}).parse(r.query).cursor)));
  app.post(base+'/agent-runs',r=>authenticated(r,(tx,a)=>runs.startRun(tx,a,params(r).projectId,StartAgentRun.parse(r.body),mutationKey(r))));
  app.get(base+'/agent-runs/:id',r=>authenticated(r,(tx,a)=>{const p=runParams(r);return runs.readRun(tx,a,p.projectId,p.id);}));
  app.post(base+'/agent-runs/:id/proposals',r=>authenticated(r,(tx,a)=>{const p=runParams(r);return runs.proposeRun(tx,a,p.projectId,p.id,AgentRunProposal.parse(r.body));}));
  app.post(base+'/agent-runs/:id/commit',r=>authenticated(r,(tx,a)=>{const p=runParams(r);return runs.commitRun(tx,a,p.projectId,p.id,AgentRunCommit.parse(r.body),mutationKey(r));}));
  app.post(base+'/agent-runs/:id/finish',r=>authenticated(r,(tx,a)=>{const p=runParams(r);return runs.finishRun(tx,a,p.projectId,p.id,FinishAgentRun.parse(r.body),mutationKey(r));}));
  app.post(base+'/agent-context',r=>authenticated(r,(tx,a)=>runs.agentContext(tx,a,params(r).projectId,AgentContextQuery.parse(r.body))));
  app.get(base+'/approvals',r=>authenticated(r,async(tx,a)=>{
    const {projectId}=params(r),q=z.strictObject({cursor:z.uuid().optional()}).parse(r.query);await authorize(tx,a,projectId,'tasks:read');
    const rows=(await tx.query<{id:string}>(`SELECT a.id,a.status,a.revision,a.requested_by AS "requestedBy",a.expires_at AS "expiresAt",p.name AS "agentName",s.summary FROM app.approvals a
      JOIN auth.principals p ON p.id=a.requested_by JOIN app.planning_plans s ON s.project_id=a.project_id AND s.id::text=a.subject_id
      WHERE a.project_id=$1 AND ($2 OR a.requested_by=$3) AND ($4::uuid IS NULL OR a.id>$4) ORDER BY a.id LIMIT 51`,[projectId,a.kind==='human',a.id,q.cursor||null])).rows;
    return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.id:null};
  }));
}
