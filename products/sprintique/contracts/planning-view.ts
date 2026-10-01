import {z} from 'zod';
import {Id,DateOnly,Revision,TaskInput,TaskEstimate} from './index.js';

/** Public application projection consumed by the Planning UI. No UI imports in the API. */
export const ViewFilters=z.strictObject({query:z.string().max(240).default(''),preparation:z.enum(['all','draft','ready']).default('all'),
  sort:z.enum(['planned','priority','date']).default('planned'),history:z.enum(['current','closed']).default('current'),
  owner:z.string().max(120).default(''),releaseId:z.string().max(100).default(''),tagIds:z.array(Id).max(30).default([]),tagMode:z.enum(['any','all']).default('any')});
export type ViewFilters=z.infer<typeof ViewFilters>;
export const ViewQuery=ViewFilters.extend({cursor:z.string().max(240).nullable().optional()});
export const ViewRowsQuery=ViewQuery.extend({groupId:Id,revision:z.string().regex(/^\d+$/),collapsedTaskIds:z.array(Id).max(1000).default([])});
export const ViewSelectQuery=ViewFilters.extend({taskIds:z.array(Id).min(1).max(200).optional()});
export const ViewOptionsQuery=z.strictObject({kind:z.enum(['destinations','tasks','owner','tags','positions']),query:z.string().max(240).default(''),cursor:z.string().max(240).nullable().optional(),excludeId:Id.optional(),taskId:Id.optional()});
export type ViewQuery=z.infer<typeof ViewQuery>;
export type ViewRowsQuery=z.infer<typeof ViewRowsQuery>;
export type ViewSelectQuery=z.infer<typeof ViewSelectQuery>;
export type ViewOptionsQuery=z.infer<typeof ViewOptionsQuery>;
const selection={taskIds:z.array(Id).max(200).optional(),selectionToken:z.uuid().optional()};
const releaseValue=z.strictObject({name:z.string().trim().min(1).max(100),format:z.enum(['flexible','timeboxed']),start:DateOnly.nullable(),end:DateOnly.nullable(),deadline:DateOnly.nullable(),goal:z.string().max(240).nullable().optional()});
const revision={expectedProjectionRevision:z.string().regex(/^\d+$/).optional()};
const schedule=z.strictObject({kind:z.literal('schedule'),entityKind:z.enum(['task','release','milestone']),entityId:Id,values:z.strictObject({start:DateOnly.nullable(),end:DateOnly.nullable(),deadline:DateOnly.nullable().optional()}),...revision});
const temporal=z.strictObject({kind:z.literal('temporal'),entityId:Id.optional(),values:z.strictObject({fromId:Id,toId:Id,type:z.enum(['FS','SS','FF','SF']),lagDays:z.number().int().min(-36500).max(36500)}),...revision});
const remove=z.strictObject({kind:z.literal('removeTemporal'),entityId:Id,...revision});
export const ViewIntent=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('taskEdit'),taskId:Id,baseRevision:Revision,task:TaskInput}),
  z.strictObject({kind:z.literal('taskCreate'),taskId:Id,task:TaskInput,createInBoard:z.boolean().default(false)}),
  z.strictObject({kind:z.enum(['prepare','unprepare','take']),...selection,...revision}),
  z.strictObject({kind:z.literal('move'),groupId:Id,...selection,...revision}),
  z.strictObject({kind:z.literal('reorder'),taskIds:z.array(Id).length(1),selectionToken:z.never().optional(),beforeId:Id.nullable(),...revision}),
  z.strictObject({kind:z.literal('bulk'),field:z.enum(['owner','priority','due','tags','estimate']),value:z.union([z.string().max(120),z.array(Id).max(30),TaskEstimate,z.null()]),...selection,...revision}),
  z.strictObject({kind:z.literal('start'),groupId:Id}),
  z.strictObject({kind:z.literal('editRelease'),groupId:Id,values:releaseValue}),
  z.strictObject({kind:z.literal('createRelease'),values:releaseValue}),
  z.strictObject({kind:z.enum(['close','cancel']),groupId:Id,acceptAllCandidates:z.boolean().default(false),destinationId:Id.optional(),newRelease:releaseValue.optional(),destinations:z.record(Id,Id).refine(v=>Object.keys(v).length<=200).default({})}),
  schedule,temporal,remove,
  z.strictObject({kind:z.literal('batch'),actions:z.array(z.discriminatedUnion('kind',[schedule,temporal,remove])).min(1).max(100),...revision}),
  z.strictObject({kind:z.literal('milestone'),entityId:Id.optional(),values:z.strictObject({title:z.string().trim().min(1).max(240),date:DateOnly.nullable(),releaseId:Id.nullable()})}),
  z.strictObject({kind:z.literal('settings'),values:z.strictObject({format:z.enum(['flexible','timeboxed']),days:z.number().int(),timeZone:z.string().max(100),inheritTimeZone:z.boolean().optional(),
    estimateFormat:z.enum(['time','points']).optional(),hoursPerDay:z.number().int().min(1).max(24).optional(),hoursPerWeek:z.number().int().min(1).max(168).optional()})}),
  z.strictObject({kind:z.literal('shiftDates'),groupId:Id,days:z.number().int().min(-36500).max(36500)}),
  // The proposal form of a move (agents): previewed, and approved by a person, like any planning change.
  z.strictObject({kind:z.literal('place'),ids:z.array(Id).min(1).max(200),containerId:Id,afterId:Id.nullable().optional(),withChildren:z.boolean().default(true)})
]);
/** The round-4 planning screen: every open container with its tree and sums. The body is an empty object. */
export const ViewContainersQuery=z.strictObject({});
const RestoreItem=z.strictObject({id:Id,containerId:Id,inherit:z.boolean(),rank:z.number().finite(),admitted:z.boolean().nullable().optional()});
export const RestoreValue=z.strictObject({kind:z.literal('restore'),expectedRevision:z.string().regex(/^\d+$/),items:z.array(RestoreItem).min(1).max(2000)});
/** A move into a container after a root row (null: first), or the undo a move returned: exactly one of the two forms. */
export const ViewMoveRequest=z.strictObject({ids:z.array(Id).min(1).max(200).optional(),containerId:Id.optional(),afterId:Id.nullable().optional(),
  withChildren:z.boolean().default(true),expectedRevision:z.string().regex(/^\d+$/).optional(),restore:RestoreValue.optional()})
  .refine(v=>(v.restore===undefined)===(v.ids!==undefined&&v.containerId!==undefined),'One form')
  .refine(v=>v.restore===undefined||(v.afterId===undefined&&v.expectedRevision===undefined),'One form');
export type ViewMoveRequest=z.input<typeof ViewMoveRequest>;
export type EstimateUnit=TaskEstimate['unit'];
export interface ContainerSummary {total:number;done:number;open:number;estimateHours:number;remainingHours:number;estimatePoints:number;remainingPoints:number;noDue:number}
export interface ContainerRow {
  id:string;key:string;title:string;kind:'epic'|'task';type:'task'|'bug'|'epic';parentId:string|null;depth:number;status:string;done:boolean;
  priority:'low'|'normal'|'high'|'critical';ownerId:string|null;ownerLabel:string;due:string|null;estimate:TaskEstimate|null;
  estimateHours:number|null;estimatePoints:number|null;estimateMismatch:boolean;rank:number;revision:number;crumb:string|null;
  afterSprintEnd:boolean;noDue:boolean;
  rollup:null|{here:{total:number;done:number;estimateHours:number;estimatePoints:number};elsewhere:{containerId:string;name:string;count:number}[]};
}
export interface Container {
  id:string;kind:'sprint'|'release'|'backlog';state:'active'|'planned'|'backlog';name:string;goal:string|null;
  start:string|null;end:string|null;deadline:string|null;revision:number|null;summary:ContainerSummary;rows:ContainerRow[];
}
export interface ContainersView {
  protocol:'sprintique.planning-containers/1';projectId:string;revision:string;today:string;
  estimate:{format:'time'|'points';hoursPerDay:number;hoursPerWeek:number};
  capabilities:{plan:boolean;manageReleases:boolean;completeSprint:boolean};completed:{count:number};containers:Container[];
}
export interface RestoreUndo {kind:'restore';expectedRevision:string;items:{id:string;containerId:string;inherit:boolean;rank:number;admitted?:boolean|null}[]}
export interface MoveResult {
  status:'committed';operationId:string;revision:string;moved:string[];containers:{id:string;summary:ContainerSummary}[];
  undo:RestoreUndo;warnings:{taskId:string;code:'AFTER_SPRINT_END'|'NO_DUE';message:string}[];
}
export type ViewIntent=z.infer<typeof ViewIntent>;
