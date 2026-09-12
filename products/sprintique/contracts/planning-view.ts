import {z} from 'zod';
import {Id,DateOnly,Revision,TaskInput} from './index.js';

/** Public application projection consumed by the Planning UI. No UI imports in the API. */
export const ViewFilters=z.strictObject({query:z.string().max(240).default(''),preparation:z.enum(['all','draft','ready']).default('all'),
  sort:z.enum(['planned','priority','date']).default('planned'),history:z.enum(['current','closed']).default('current'),
  owner:z.string().max(120).default(''),releaseId:z.string().max(100).default(''),tagIds:z.array(Id).max(30).default([]),tagMode:z.enum(['any','all']).default('any')});
export type ViewFilters=z.infer<typeof ViewFilters>;
export const ViewQuery=ViewFilters.extend({cursor:z.string().max(240).nullable().optional()});
export const ViewRowsQuery=ViewQuery.extend({groupId:Id,revision:z.string().regex(/^\d+$/),collapsedTaskIds:z.array(Id).max(1000).default([])});
export const ViewSelectQuery=ViewFilters.extend({taskIds:z.array(Id).min(1).max(200).optional()});
export const ViewOptionsQuery=z.strictObject({kind:z.enum(['destinations','tasks','owner','tags']),query:z.string().max(240).default(''),cursor:z.string().max(240).nullable().optional(),excludeId:Id.optional()});
export type ViewQuery=z.infer<typeof ViewQuery>;
export type ViewRowsQuery=z.infer<typeof ViewRowsQuery>;
export type ViewSelectQuery=z.infer<typeof ViewSelectQuery>;
export type ViewOptionsQuery=z.infer<typeof ViewOptionsQuery>;
const selection={taskIds:z.array(Id).max(200).optional(),selectionToken:z.uuid().optional()};
const releaseValue=z.strictObject({name:z.string().trim().min(1).max(100),format:z.enum(['flexible','timeboxed']),start:DateOnly.nullable(),end:DateOnly.nullable(),deadline:DateOnly.nullable()});
const revision={expectedProjectionRevision:z.string().regex(/^\d+$/).optional()};
const schedule=z.strictObject({kind:z.literal('schedule'),entityKind:z.enum(['task','release','milestone']),entityId:Id,values:z.strictObject({start:DateOnly.nullable(),end:DateOnly.nullable(),deadline:DateOnly.nullable().optional()}),...revision});
const temporal=z.strictObject({kind:z.literal('temporal'),entityId:Id.optional(),values:z.strictObject({fromId:Id,toId:Id,type:z.enum(['FS','SS','FF','SF']),lagDays:z.number().int().min(-36500).max(36500)}),...revision});
const remove=z.strictObject({kind:z.literal('removeTemporal'),entityId:Id,...revision});
export const ViewIntent=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('taskEdit'),taskId:Id,baseRevision:Revision,task:TaskInput}),
  z.strictObject({kind:z.literal('taskCreate'),taskId:Id,task:TaskInput,createInBoard:z.boolean().default(false)}),
  z.strictObject({kind:z.enum(['prepare','unprepare','take']),...selection}),
  z.strictObject({kind:z.literal('move'),groupId:Id,...selection}),
  z.strictObject({kind:z.literal('bulk'),field:z.enum(['owner','priority','due','tags']),value:z.union([z.string().max(120),z.array(Id).max(30),z.null()]),...selection}),
  z.strictObject({kind:z.literal('start'),groupId:Id}),
  z.strictObject({kind:z.literal('editRelease'),groupId:Id,values:releaseValue}),
  z.strictObject({kind:z.literal('createRelease'),values:releaseValue}),
  z.strictObject({kind:z.enum(['close','cancel']),groupId:Id,acceptAllCandidates:z.boolean().default(false),destinationId:Id.optional(),newRelease:releaseValue.optional(),destinations:z.record(Id,Id).refine(v=>Object.keys(v).length<=200).default({})}),
  schedule,temporal,remove,
  z.strictObject({kind:z.literal('batch'),actions:z.array(z.discriminatedUnion('kind',[schedule,temporal,remove])).min(1).max(100),...revision}),
  z.strictObject({kind:z.literal('milestone'),entityId:Id.optional(),values:z.strictObject({title:z.string().trim().min(1).max(240),date:DateOnly.nullable(),releaseId:Id.nullable()})}),
  z.strictObject({kind:z.literal('settings'),values:z.strictObject({format:z.enum(['flexible','timeboxed']),days:z.number().int(),timeZone:z.string().max(100)})}),
  z.strictObject({kind:z.literal('shiftDates'),groupId:Id,days:z.number().int().min(-36500).max(36500)})
]);
export type ViewIntent=z.infer<typeof ViewIntent>;
