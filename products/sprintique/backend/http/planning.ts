import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {params,mutationKey} from './app.js';
import {DateOnly} from '../../contracts/index.js';
import {CommitPlan,PlanningCommand,PlanningQuery,ReleaseWrite,ApprovalDecision,MilestoneWrite,ConstraintWrite,PLANNING_POLICY,PAGE_SIZE,MAX_EXPLICIT_SELECTION} from '../../contracts/planning.js';
import * as planning from '../application/planning.js';
const pagination=z.strictObject({limit:z.coerce.number().int().min(1).max(PAGE_SIZE).default(50),cursor:z.string().max(3000).optional()});

export function registerPlanningRoutes(app:FastifyInstance,authenticated:Authenticated){
  const base='/api/v1/projects/:projectId';
  app.get(base+'/planning/capabilities',request=>authenticated(request,async(tx,actor)=>{
    const {projectId}=params(request);const context=await planning.planningLock(tx,actor,projectId);
    const role=(await tx.query<{role:string}>('SELECT role FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[projectId,actor.id])).rows[0]!.role;
    const canWrite=role!=='reader'&&(actor.kind==='human'||actor.capabilities.includes('tasks:write'));
    return {contractVersion:2,policyVersion:PLANNING_POLICY,timezone:context.timezone,formats:['flexible','timeboxed'],
      actions:{read:{allowed:true},preview:{allowed:canWrite,reason:canWrite?null:'READ_ONLY'},commit:{allowed:canWrite,requiresHumanApproval:actor.kind==='agent'},
        approve:{allowed:canWrite&&actor.kind==='human',reason:actor.kind==='agent'?'HUMAN_REQUIRED':canWrite?null:'READ_ONLY'}},
      limits:{pageSize:PAGE_SIZE,explicitSelection:MAX_EXPLICIT_SELECTION},selectors:['tasks','release','unassigned','project']};
  }));
  app.get(base+'/planning/tasks',request=>authenticated(request,(tx,actor)=>planning.listPlanning(tx,actor,params(request).projectId,PlanningQuery.parse(request.query))));
  app.get(base+'/board/tasks',request=>authenticated(request,(tx,actor)=>planning.listPlanning(tx,actor,params(request).projectId,{...PlanningQuery.parse(request.query),board:'true'})));
  app.get(base+'/planning/releases',request=>authenticated(request,(tx,actor)=>{const q=pagination.parse(request.query);return planning.listReleases(tx,actor,params(request).projectId,q.limit,q.cursor);}));
  app.put(base+'/planning/releases/:id',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request),input=ReleaseWrite.parse(request.body);return planning.writeRelease(tx,actor,projectId,id!,input.baseRevision,input.value,mutationKey(request));
  }));
  app.post(base+'/planning/previews',request=>authenticated(request,(tx,actor)=>planning.preview(tx,actor,params(request).projectId,PlanningCommand.parse(request.body))));
  app.get(base+'/planning/previews/:id/effects',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request),q=pagination.parse(request.query);return planning.previewEffects(tx,actor,projectId,z.uuid().parse(id),q.limit,q.cursor);
  }));
  app.post(base+'/planning/commands',request=>authenticated(request,(tx,actor)=>planning.commit(tx,actor,params(request).projectId,CommitPlan.parse(request.body),mutationKey(request))));
  app.get(base+'/planning/commands/:id',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request);return planning.receipt(tx,actor,projectId,id!);
  }));
  app.get(base+'/planning/releases/:id/history',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request),q=pagination.parse(request.query);return planning.history(tx,actor,projectId,id!,q.limit,q.cursor);
  }));
  app.get(base+'/approvals/:id',request=>authenticated(request,(tx,actor)=>{const {projectId,id}=params(request);return planning.approvalDetail(tx,actor,projectId,z.uuid().parse(id));}));
  app.get(base+'/approvals/:id/effects',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request),q=pagination.parse(request.query);return planning.approvalEffects(tx,actor,projectId,z.uuid().parse(id),q.limit,q.cursor);
  }));
  app.post(base+'/approvals/:id/decision',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request);return planning.decideApproval(tx,actor,projectId,z.uuid().parse(id),ApprovalDecision.parse(request.body),mutationKey(request));
  }));
  app.put(base+'/planning/milestones/:id',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request);return planning.writeMilestone(tx,actor,projectId,id!,MilestoneWrite.parse(request.body),mutationKey(request));
  }));
  app.put(base+'/planning/constraints/:id',request=>authenticated(request,(tx,actor)=>{
    const {projectId,id}=params(request);return planning.writeConstraint(tx,actor,projectId,id!,ConstraintWrite.parse(request.body),mutationKey(request));
  }));
  app.get(base+'/planning/constraints',request=>authenticated(request,async(tx,actor)=>{
    const {projectId}=params(request),q=pagination.parse(request.query),{revision}=await planning.planningLock(tx,actor,projectId);
    return planning.page((await planning.loadPlanningState(tx,projectId)).constraints,projectId+':constraints',revision,q.limit,q.cursor);
  }));
  app.get(base+'/planning/roadmap',request=>authenticated(request,(tx,actor)=>{
    const q=pagination.extend({from:DateOnly.optional(),to:DateOnly.optional(),undated:z.enum(['true','false']).optional()}).parse(request.query);
    return planning.roadmap(tx,actor,params(request).projectId,{...q,undated:q.undated!=='false'});
  }));
}
