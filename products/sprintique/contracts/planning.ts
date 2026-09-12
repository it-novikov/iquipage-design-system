import {z} from 'zod';
import {Id,Revision,DateOnly,Timezone,TaskInput} from './index.js';

export const PLANNING_POLICY = 'planning-r3.1';
export const PAGE_SIZE = 100;
export const MAX_EXPLICIT_SELECTION = 200;
const uniqueIds = z.array(Id).max(MAX_EXPLICIT_SELECTION).refine(ids=>new Set(ids).size===ids.length);
export const SelectionFilter=z.strictObject({q:z.string().max(240).default(''),matchReleaseNames:z.boolean().default(false),preparation:z.enum(['all','draft','ready']).default('all'),owner:z.string().max(120).default(''),releaseId:Id.nullable().optional(),tagIds:z.array(Id).max(30).default([]),tagMode:z.enum(['any','all']).default('any'),roots:uniqueIds.optional(),candidates:z.boolean().default(false),openOnly:z.boolean().default(false)});
export const Selection = z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('tasks'),ids:uniqueIds}),
  z.strictObject({kind:z.literal('release'),releaseId:Id}),
  z.strictObject({kind:z.literal('unassigned')}),
  z.strictObject({kind:z.literal('project')}),
  z.strictObject({kind:z.literal('filter'),filter:SelectionFilter})
]);
export const ReleaseValue = z.strictObject({
  name:z.string().trim().min(1).max(100),format:z.enum(['flexible','timeboxed']).default('flexible'),
  plannedStart:DateOnly.nullable().default(null),plannedEnd:DateOnly.nullable().default(null),deadline:DateOnly.nullable().default(null)
}).refine(v=>!v.plannedStart||!v.plannedEnd||v.plannedStart<=v.plannedEnd,'Invalid date range')
  .refine(v=>v.format!=='timeboxed'||Boolean(v.plannedStart&&v.plannedEnd),'Timeboxed dates required');
export const ReleaseWrite = z.strictObject({baseRevision:Revision,value:ReleaseValue});
export const Assignment = z.discriminatedUnion('mode',[
  z.strictObject({mode:z.literal('assigned'),releaseId:Id}),
  z.strictObject({mode:z.literal('inherit')}),z.strictObject({mode:z.literal('none')})
]);
const destination = z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('release'),releaseId:Id}),
  z.strictObject({kind:z.literal('new'),id:Id,value:ReleaseValue}),
  z.strictObject({kind:z.literal('unassigned')})
]);
const EntityRef=z.strictObject({kind:z.enum(['task','release','milestone']),id:Id});
export const ScheduleAction=z.strictObject({kind:z.literal('schedule'),entity:EntityRef,plannedStart:DateOnly.nullable(),plannedEnd:DateOnly.nullable(),deadline:DateOnly.nullable().optional()});
export const TemporalValue=z.strictObject({source:EntityRef,target:EntityRef,relation:z.enum(['FS','SS','FF','SF']),lagDays:z.number().int().min(-36500).max(36500)});
const ConstraintAction=z.strictObject({kind:z.literal('constraint'),id:Id,value:TemporalValue});
const RemoveConstraint=z.strictObject({kind:z.literal('constraint.remove'),id:Id});
export const PlanningDefaults=z.strictObject({format:z.enum(['flexible','timeboxed']),days:z.number().int().min(1).max(366),timezone:Timezone});
export const PlanningCommand = z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('task.edit'),taskId:Id,baseRevision:Revision,task:TaskInput}),
  z.strictObject({kind:z.literal('task.create'),taskId:Id,task:TaskInput,createInBoard:z.boolean().default(false)}),
  z.strictObject({kind:z.literal('prepare'),selection:Selection,preparation:z.enum(['draft','ready'])}),
  z.strictObject({kind:z.literal('admission'),selection:Selection,admitted:z.boolean()}),
  z.strictObject({kind:z.literal('assign'),selection:Selection,assignment:Assignment}),
  z.strictObject({kind:z.literal('reparent'),taskId:Id,parentId:Id.nullable()}),
  z.strictObject({kind:z.literal('bulk'),selection:Selection,fields:z.strictObject({
    owner:z.string().max(120).optional(),priority:z.enum(['low','normal','high','critical']).optional(),
    plannedStart:DateOnly.nullable().optional(),plannedEnd:DateOnly.nullable().optional(),due:DateOnly.nullable().optional(),addTagIds:z.array(Id).max(30).optional()
  }).refine(v=>Object.keys(v).length>0)}),
  z.strictObject({kind:z.literal('start'),releaseId:Id}),
  z.strictObject({kind:z.literal('release.edit'),releaseId:Id,value:ReleaseValue}),
  z.strictObject({kind:z.literal('release.create'),releaseId:Id,projectId:Id,value:ReleaseValue}),
  z.strictObject({kind:z.literal('close'),releaseId:Id,accepted:Selection,destination,overrides:z.record(Id,Id.nullable()).refine(v=>Object.keys(v).length<=200).optional()}),
  z.strictObject({kind:z.literal('cancel'),releaseId:Id,destination,overrides:z.record(Id,Id.nullable()).refine(v=>Object.keys(v).length<=200).optional()}),
  ScheduleAction,ConstraintAction,RemoveConstraint,
  z.strictObject({kind:z.literal('milestone'),id:Id,value:z.strictObject({title:z.string().trim().min(1).max(240),date:DateOnly.nullable(),releaseId:Id.nullable()})}),
  z.strictObject({kind:z.literal('settings'),value:PlanningDefaults}),
  z.strictObject({kind:z.literal('shift'),releaseId:Id,days:z.number().int().min(-36500).max(36500)}),
  z.strictObject({kind:z.literal('schedule.batch'),actions:z.array(z.discriminatedUnion('kind',[ScheduleAction,ConstraintAction,RemoveConstraint])).min(1).max(100)})
]);
export type PlanningCommand = z.infer<typeof PlanningCommand>;
export type Selection = z.infer<typeof Selection>;
export type ReleaseData = z.infer<typeof ReleaseValue>;
export const CommitPlan = z.strictObject({planId:z.uuid(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
export const ApprovalDecision = z.strictObject({baseRevision:Revision,status:z.enum(['approved','rejected'])});
export const PlanningQuery = z.strictObject({
  cursor:z.string().max(3000).optional(),limit:z.coerce.number().int().min(1).max(PAGE_SIZE).default(50),
  q:z.string().max(240).default(''),releaseId:Id.optional(),unassigned:z.enum(['true']).optional(),
  parentId:Id.optional(),preparation:z.enum(['draft','ready']).optional(),status:z.string().max(30).optional(),
  owner:z.string().max(120).optional(),tagId:Id.optional(),board:z.enum(['true']).optional()
});
export type PlanningQuery = z.infer<typeof PlanningQuery>;
export interface Release extends ReleaseData {
  id:string;projectId:string;revision:number;scopeRevision:number;lifecycle:'planned'|'active'|'closed'|'cancelled';archivedAt:string|null;
}
export interface PlanningRow {
  attachmentIds?:string[];coverAttachmentId?:string|null;coverCrop?:import('./media.js').TaskMediaData['coverCrop'];
  id:string;displayId:string;revision:number;parentId:string|null;title:string;type:string;status:string;
  owner:string;priority:string;rank:number;statusEnteredAt:string;createdAt:string;tagIds:string[];preparation:'draft'|'ready';result:'open'|'accepted';admitted:boolean;
  plannedStart:string|null;plannedEnd?:string|null;due:string|null;assignmentMode:'inherit'|'assigned'|'none';releaseId:string|null;
  effectiveReleaseId:string|null;assignmentSourceId:string|null;boardEligible:boolean;childCount:number;
}
export interface Page<T> {items:T[];total:number;nextCursor:string|null;projectRevision:number}
export interface Effect {id:string;before:PlanningRow|null;after:PlanningRow}
export interface Preview {
  id:string;token:string;expiresAt:string;actionHash:string;policyVersion:string;projectRevision:number;
  affectedCount:number;selectedCount:number;enteringBoard:number;leavingBoard:number;
  effects:Effect[];nextCursor:string|null;requiresApproval:boolean;approvalId:string|null;
  releases:Release[];details?:{label:string;description:string}[];
}
export type Receipt = {operationId:string;status:'committed';projectRevision:number;affectedCount:number;releaseIds:string[]}
  | {operationId:string;status:'rejected';error:{code:string;message:string;action:'refresh-preview'}};
export const MilestoneWrite=z.strictObject({baseRevision:Revision,value:z.strictObject({title:z.string().trim().min(1).max(240),date:DateOnly.nullable(),releaseId:Id.nullable().optional()})});
export const ConstraintWrite=z.strictObject({baseRevision:Revision,value:TemporalValue});
export interface Milestone {id:string;title:string;date:string|null;revision:number;releaseId?:string|null}
export type TemporalConstraint = z.infer<typeof ConstraintWrite>['value'] & {id:string;revision:number};
