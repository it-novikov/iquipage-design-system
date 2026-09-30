import {z} from 'zod';
import {DateOnly,Id,Revision,Timezone} from './index.js';

// The Workbench (docs/adr W1–W6): private "Участвую" and its fields, directed requests and the plan time zone.
// Field for field the Kotlin request contracts in server/.../workbench/api/WorkbenchRequests.kt.

// "Участвую": one private flag; the person tracks the task and keeps it on their Workbench (docs/adr W5).
export const PutParticipation=z.strictObject({baseRevision:Revision,participating:z.boolean()});
export const RankMove=z.enum(['up','down']);
// Up and down move within the list the person sees: the project filter of the Workbench (null: every project).
export const PutRank=z.strictObject({baseRevision:Revision,move:RankMove,projects:z.array(Id).min(1).max(100).nullable().default(null)});
// The private date to check delegated work ("Жду"); null clears it. Never the task's due date.
export const PutCheckBack=z.strictObject({baseRevision:Revision,checkBackAt:DateOnly.nullable()});
export const PutSeen=z.strictObject({baseRevision:Revision,sequence:Revision});
// `null` ends a snooze; the server bounds it by 30 days and by the start of the request's neededBy day.
export const PutSnooze=z.strictObject({baseRevision:Revision,until:z.string().datetime({offset:true}).nullable()});

export const RequestKind=z.enum(['answer','review','decision','approval','do']);
export const CreateAttentionRequest=z.strictObject({
  id:z.uuid(),recipientId:Id,kind:RequestKind,
  neededBy:DateOnly.nullable().default(null),
  threadId:Id.nullable().default(null),approvalId:z.uuid().nullable().default(null),
  note:z.string().trim().max(500).default('')
});
export const ChangeAttentionRequest=z.strictObject({baseRevision:Revision,recipientId:Id,neededBy:DateOnly.nullable()});
export const AttentionRequestRevision=z.strictObject({baseRevision:Revision});

// The one personal setting of the overview (docs/workbench/design-v2.md §11.4): "Текущая работа" as lanes or one list.
export const WorkbenchLayout=z.strictObject({currentForm:z.enum(['lanes','list']).default('lanes')});
// "Принять результат" of delegated done work; `accepted: false` is the undo.
export const PutAccept=z.strictObject({baseRevision:Revision,accepted:z.boolean()});
// «Просмотрено» for all of "Изменилось": events up to `before`, the time of the snapshot the person looked at.
export const MarkWorkbenchSeen=z.strictObject({before:z.string().datetime({offset:true}),projects:z.array(Id).min(1).max(100).nullable().default(null)});
// A field left out keeps its value; `timezone: null` forgets the chosen zone, `layout: null` restores the default layout.
export const PutWorkbenchPreferences=z.strictObject({baseRevision:Revision,timezone:Timezone.nullable().optional(),layout:WorkbenchLayout.nullable().optional()})
  .refine(value=>value.timezone!==undefined||value.layout!==undefined,{message:'timezone or layout'});

export const workbenchSchemas={PutParticipation,PutRank,PutCheckBack,PutSeen,PutSnooze,CreateAttentionRequest,ChangeAttentionRequest,
  AttentionRequestRevision,WorkbenchLayout,PutWorkbenchPreferences,PutAccept,MarkWorkbenchSeen};

// Responses, as the interface reads them. Rows carry references and codes; no description or comment text.
export interface WorkbenchReason {code:string;text:string;actor?:{id:string;name:string|null};occurredAt?:string;neededBy?:string}
export interface WorkbenchPerson {id:string;name:string|null}
/**
 * The newest unseen event of a row, drawable as "было → стало": statuses and dates as codes, a planned interval as
 * `{start,end}`, an owner change as people (a person who left the project is not named). Never titles or text.
 */
export interface WorkbenchChange {
  kind:'status'|'completed'|'reopened'|'owner'|'due'|'planned'|'dependency'|'thread'|'resolution'|'request';
  detail:{from?:string|null|WorkbenchPerson|{start:string|null;end:string|null};to?:string|null|WorkbenchPerson|{start:string|null;end:string|null};
    result?:'accepted';change?:string;role?:'blocked_by'|'blocks';resolved?:boolean;requestKind?:string};
  actor:WorkbenchPerson|null;actorName:string|null;at:string;sequence:number;
}
/**
 * One task, one row. Placement precedence: action > joined > active > waiting > updates. "Участвую" (joined) is open
 * work I participate in and neither own nor delegated; an assigned active task is "В работе" even when I participate.
 */
export interface WorkbenchRow {
  resourceKind:'task';key:string;projectId:string;projectName:string;workspaceName?:string;
  taskId:string;displayId:string;taskRevision:number;title:string;status:string;statusCategory:'todo'|'active'|'done';statusEnteredAt:string;
  type:string;priority:string;done:boolean;
  owner:WorkbenchPerson|null;due:string|null;plannedStart:string|null;plannedEnd:string|null;
  section:'action'|'current'|'updates';group:'joined'|'active'|'waiting'|'snoozed'|'backlog'|null;
  primaryReason:WorkbenchReason;secondaryReasons:WorkbenchReason[];
  // No request note in a first-screen row (delivery-plan §4.2): the drawer reads it from `/personal`.
  request:{id:string;kind:'answer'|'review'|'decision'|'approval'|'do';revision:number;neededBy:string|null;requestedBy:WorkbenchPerson|null;
    createdAt:string;openCount:number;approvalId:string|null;threadId:string|null;sourceRevision:number|null}|null;
  // The row's verb: review, approve and do resolve in the row; a question or a decision opens the drawer to answer.
  action:{kind:'review'|'approve'|'do'|'question'|'decision';inline:boolean}|null;
  // "Готово" from an "В работе" row: the next workflow stage and its verb, or why it cannot be moved from here.
  active:{transition:{label:string;toStatusId:string}|null;cannotComplete:{reason:'read_only'|'blocked'|'final';text:string}|null}|null;
  // The shared due date may be moved from the row (by the task write the drawer uses).
  canEditDue:boolean;
  // "Жду": whom I assigned it to, who owns it now (null: owner removed), my check-back date, whether the work is done.
  waiting:{expectedAssignee:WorkbenchPerson|null;expectedAssigneeLeft:boolean;ownerNow:WorkbenchPerson|null;checkBackAt:string|null;done:boolean;
    doneAt:string|null;assignedAt:string}|null;
  // Unseen news on the task wherever the row is placed; "Изменилось" holds the tasks with news and no stronger place.
  updates:{count:number;latestSequence:number;latestAt:string;kinds:string[];latest:WorkbenchChange|null}|null;
  personal:{participating:boolean;participationRevision:number;rank:number|null;rankRevision:number;lastSeenSequence:number|null;seenRevision:number;
    snoozedUntil:string|null;snoozeRevision:number;checkBackAt:string|null;checkBackRevision:number;acceptRevision:number};
  latestSequence:number;blockedBy:{id:string;displayId:string}|null;allowedActions:string[];canonicalUrl:string;
}
export interface WorkbenchGroup {key:'joined'|'active'|'waiting';count:number;items:WorkbenchRow[];nextCursor:string|null}
export interface WorkbenchSection {key:'action'|'current'|'updates';count:number;countCapped?:boolean;snoozedCount?:number;overdueCount?:number;backlogCount?:number;
  items?:WorkbenchRow[];groups?:WorkbenchGroup[];nextCursor?:string|null}
export interface WorkbenchEnvelope {mode:'now';generatedAt:string;snapshotToken:string;
  scope:{kind:'all'|'selected';projectIds:string[]|null;projectCount:number;truncated:boolean};
  features:{requests:boolean;participation:boolean;waiting:boolean};sections:WorkbenchSection[]}
export interface WorkbenchPage {section:string;generatedAt:string;count:number;items:WorkbenchRow[];nextCursor:string|null}
export interface PlanItem {key:string;kind:'due'|'planned'|'neededBy'|'checkBack'|'milestone'|'undated';day:string;date:string|null;overdue:boolean;
  startDate:string|null;endDate:string|null;
  // Why it is my time: my assignment, my participation, work I delegated ("Жду") or a request to me; null for a milestone.
  relation:'assigned'|'participating'|'waiting'|'request'|null;
  projectId:string;projectName:string;workspaceName?:string;
  task:{id:string;displayId:string;title:string;status:string;statusCategory:'todo'|'active'|'done';done:boolean;priority:string;
    owner:WorkbenchPerson|null;due:string|null;plannedStart:string|null;plannedEnd:string|null;revision:number}|null;
  milestone:{id:string;title:string}|null;requestId:string|null;canonicalUrl:string|null}
/** `GET /api/v1/workbench/plan?horizon=today|7d&timezone=&projects=&undated=list|count` (count: the overview's week). */
export interface PlanHorizon {horizon:'today'|'7d';timezone:string;timezoneSource:'request'|'preference'|'default';preferredTimezone:string|null;
  generatedAt:string;today:string;from:string;to:string;days:{date:string;items:PlanItem[]}[];undated:PlanItem[];truncated:boolean;
  summary:{itemCount:number;overdueCount:number;undatedCount:number;undatedTruncated:boolean}}
export interface WorkbenchPreferences {timezone:string|null;layout:{currentForm:'lanes'|'list'};revision:number}
