import {z} from 'zod';
import {Id,Revision,DateOnly,TaskInput} from './index.js';
import {ReleaseValue,PlanningCommand,MilestoneWrite,ConstraintWrite} from './planning.js';

export const ReleaseResponse=ReleaseValue.safeExtend({id:Id,projectId:Id,revision:Revision,scopeRevision:Revision,
  lifecycle:z.enum(['planned','active','closed','cancelled']),archivedAt:z.iso.datetime().nullable()});
export const PlanningRowResponse=z.strictObject({
  attachmentIds:TaskInput.shape.attachmentIds.optional(),coverAttachmentId:TaskInput.shape.coverAttachmentId.optional(),coverCrop:TaskInput.shape.coverCrop.optional(),
  id:Id,displayId:z.string(),revision:Revision,parentId:Id.nullable(),title:z.string(),type:TaskInput.shape.type,status:TaskInput.shape.status,
  owner:z.string(),priority:TaskInput.shape.priority,rank:z.number(),statusEnteredAt:z.iso.datetime(),createdAt:z.iso.datetime(),tagIds:z.array(Id),
  preparation:z.enum(['draft','ready']),result:z.enum(['open','accepted']),admitted:z.boolean(),plannedStart:DateOnly.nullable(),plannedEnd:DateOnly.nullable().optional(),due:DateOnly.nullable(),
  assignmentMode:z.enum(['inherit','assigned','none']),releaseId:Id.nullable(),effectiveReleaseId:Id.nullable(),assignmentSourceId:Id.nullable(),boardEligible:z.boolean(),childCount:z.number().int().nonnegative()
});
export const EffectResponse=z.strictObject({id:Id,before:PlanningRowResponse.nullable(),after:PlanningRowResponse});
export const PreviewResponse=z.strictObject({
  id:z.uuid(),token:z.string(),expiresAt:z.iso.datetime(),actionHash:z.string(),policyVersion:z.string(),projectRevision:Revision,
  affectedCount:z.number().int().nonnegative(),selectedCount:z.number().int().nonnegative(),enteringBoard:z.number().int().nonnegative(),leavingBoard:z.number().int().nonnegative(),
  effects:z.array(EffectResponse),nextCursor:z.string().nullable(),requiresApproval:z.boolean(),approvalId:z.uuid().nullable(),releases:z.array(ReleaseResponse),details:z.array(z.strictObject({label:z.string(),description:z.string()})).optional()
});
export const ReceiptResponse=z.discriminatedUnion('status',[
  z.strictObject({operationId:z.uuid(),status:z.literal('committed'),projectRevision:Revision,affectedCount:z.number().int().nonnegative(),releaseIds:z.array(Id)}),
  z.strictObject({operationId:z.uuid(),status:z.literal('rejected'),error:z.strictObject({code:z.string(),message:z.string(),action:z.literal('refresh-preview')})})
]);
export const PlanningPageResponse=z.strictObject({items:z.array(PlanningRowResponse),total:z.number().int().nonnegative(),nextCursor:z.string().nullable(),projectRevision:Revision});
const pageOf=<T extends z.ZodType>(item:T)=>z.strictObject({items:z.array(item),total:z.number().int().nonnegative(),nextCursor:z.string().nullable(),projectRevision:Revision});
export const ReleaseSummaryResponse=ReleaseResponse.safeExtend({counts:z.strictObject({total:z.number().int().nonnegative(),ready:z.number().int().nonnegative(),accepted:z.number().int().nonnegative(),onBoard:z.number().int().nonnegative()})});
export const ReleasePageResponse=pageOf(ReleaseSummaryResponse).extend({timezone:z.string()});
export const EffectsPageResponse=pageOf(EffectResponse);
export const MilestoneResponse=MilestoneWrite.shape.value.extend({id:Id,revision:Revision});
export const ConstraintResponse=ConstraintWrite.shape.value.extend({id:Id,revision:Revision});
export const ConstraintPageResponse=pageOf(ConstraintResponse);
export const RoadmapPageResponse=pageOf(z.strictObject({kind:z.enum(['task','release','milestone']),id:Id,title:z.string(),revision:Revision,start:DateOnly.nullable(),end:DateOnly.nullable()})).extend({timezone:z.string()});
const snapshot=z.strictObject({id:z.uuid(),releaseId:Id,kind:z.enum(['started','closed','cancelled']),operationId:z.uuid(),createdAt:z.iso.datetime(),itemCount:z.number().int().nonnegative()});
export const HistoryPageResponse=pageOf(z.strictObject({snapshotId:z.uuid(),kind:snapshot.shape.kind,operationId:z.uuid(),createdAt:z.iso.datetime(),before:PlanningRowResponse,task:PlanningRowResponse,outcome:z.enum(['baseline','accepted','transferred','deferred'])})).extend({snapshots:z.array(snapshot)});
export const ApprovalResponse=z.strictObject({id:z.uuid(),subjectKind:z.literal('planning'),subjectId:z.uuid(),actionHash:z.string(),requestedBy:Id,initiatorId:Id.nullable(),status:z.enum(['proposed','approved','rejected']),revision:Revision,expiresAt:z.iso.datetime(),command:PlanningCommand,
  preview:PreviewResponse.omit({token:true,effects:true,nextCursor:true}),application:ReceiptResponse.nullable()});
const permitted=z.strictObject({allowed:z.boolean(),reason:z.string().nullable()});
export const PlanningCapabilitiesResponse=z.strictObject({contractVersion:z.literal(2),policyVersion:z.string(),timezone:z.string(),formats:z.array(z.enum(['flexible','timeboxed'])),
  actions:z.strictObject({read:z.strictObject({allowed:z.boolean()}),preview:permitted,commit:z.strictObject({allowed:z.boolean(),requiresHumanApproval:z.boolean()}),approve:permitted}),
  limits:z.strictObject({pageSize:z.number().int().positive(),explicitSelection:z.number().int().positive()}),selectors:z.array(z.enum(['tasks','release','unassigned','project']))});
export type PlanningCapabilities=z.infer<typeof PlanningCapabilitiesResponse>;
export type ReleasePage=z.infer<typeof ReleasePageResponse>;
export type RoadmapPage=z.infer<typeof RoadmapPageResponse>;
export type HistoryPage=z.infer<typeof HistoryPageResponse>;
export type PlanningApproval=z.infer<typeof ApprovalResponse>;
export const planningResponseSchemas={ReleaseResponse,PlanningRowResponse,EffectResponse,PreviewResponse,ReceiptResponse,PlanningPageResponse,ReleasePageResponse,EffectsPageResponse,MilestoneResponse,ConstraintResponse,ConstraintPageResponse,RoadmapPageResponse,HistoryPageResponse,ApprovalResponse,PlanningCapabilitiesResponse};
