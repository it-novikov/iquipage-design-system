import {z} from 'zod';
import {DateOnly,Id,Revision,Timezone} from './index.js';

// The Workbench (docs/adr W1–W6): personal field commands, "Жду", directed requests and the plan time zone.
// Field for field the Kotlin request contracts in server/.../workbench/api/WorkbenchRequests.kt.

export const PutFollow=z.strictObject({baseRevision:Revision,following:z.boolean()});
export const FocusAction=z.enum(['add','remove','up','down']);
// Up and down move within the list the person sees: the project filter of the Workbench (null: every project).
export const PutFocus=z.strictObject({baseRevision:Revision,action:FocusAction,projects:z.array(Id).min(1).max(100).nullable().default(null)});
export const PutSeen=z.strictObject({baseRevision:Revision,sequence:Revision});
// `null` ends a snooze; the server bounds it by 30 days and by the start of the request's neededBy day.
export const PutSnooze=z.strictObject({baseRevision:Revision,until:z.string().datetime({offset:true}).nullable()});

export const RequestKind=z.enum(['answer','review','decision','approval']);
export const CreateAttentionRequest=z.strictObject({
  id:z.uuid(),recipientId:Id,kind:RequestKind,
  neededBy:DateOnly.nullable().default(null),
  threadId:Id.nullable().default(null),approvalId:z.uuid().nullable().default(null),
  note:z.string().trim().max(500).default('')
});
export const ChangeAttentionRequest=z.strictObject({baseRevision:Revision,recipientId:Id,neededBy:DateOnly.nullable()});
export const AttentionRequestRevision=z.strictObject({baseRevision:Revision});

export const StartWaiting=z.strictObject({
  baseRevision:Revision,checkBackAt:DateOnly.nullable().default(null),
  sourceSequence:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable().default(null)
});
export const ChangeWaiting=z.strictObject({baseRevision:Revision,checkBackAt:DateOnly.nullable()});
export const CloseWaiting=z.strictObject({baseRevision:Revision,outcome:z.enum(['resolved','cancelled'])});

export const PutWorkbenchPreferences=z.strictObject({baseRevision:Revision,timezone:Timezone});

export const workbenchSchemas={PutFollow,PutFocus,PutSeen,PutSnooze,CreateAttentionRequest,ChangeAttentionRequest,AttentionRequestRevision,
  StartWaiting,ChangeWaiting,CloseWaiting,PutWorkbenchPreferences};

// Responses, as the interface reads them. Rows carry references and codes; no description or comment text.
export interface WorkbenchReason {code:string;text:string;actor?:{id:string;name:string|null};occurredAt?:string;neededBy?:string}
export interface WorkbenchPerson {id:string;name:string|null}
export interface WorkbenchRow {
  resourceKind:'task';key:string;projectId:string;projectName:string;workspaceName?:string;
  taskId:string;displayId:string;taskRevision:number;title:string;status:string;type:string;priority:string;done:boolean;
  owner:WorkbenchPerson|null;due:string|null;plannedStart:string|null;plannedEnd:string|null;
  section:'action'|'current'|'updates';group:'focus'|'active'|'waiting'|'snoozed'|'backlog'|null;
  primaryReason:WorkbenchReason;secondaryReasons:WorkbenchReason[];
  // No request note in a first-screen row (delivery-plan §4.2): the drawer reads it from `/personal`.
  request:{id:string;kind:string;revision:number;neededBy:string|null;requestedBy:WorkbenchPerson|null;createdAt:string;openCount:number}|null;
  waiting:{revision:number;checkBackAt:string|null;expectedAssignee:WorkbenchPerson|null;expectedAssigneeLeft:boolean}|null;
  updates:{count:number;latestSequence:number;latestAt:string;kinds:string[]}|null;
  personal:{following:boolean;followRevision:number;focused:boolean;focusRevision:number;lastSeenSequence:number|null;seenRevision:number;
    snoozedUntil:string|null;snoozeRevision:number};
  latestSequence:number;blockedBy:{id:string;displayId:string}|null;allowedActions:string[];canonicalUrl:string;
}
export interface WorkbenchGroup {key:'focus'|'active'|'waiting';count:number;items:WorkbenchRow[];nextCursor:string|null}
export interface WorkbenchSection {key:'action'|'current'|'updates';count:number;countCapped?:boolean;snoozedCount?:number;backlogCount?:number;
  items?:WorkbenchRow[];groups?:WorkbenchGroup[];nextCursor?:string|null}
export interface WorkbenchEnvelope {mode:'now';generatedAt:string;snapshotToken:string;
  scope:{kind:'all'|'selected';projectIds:string[]|null;projectCount:number;truncated:boolean};
  features:{requests:boolean;personal:boolean;waiting:boolean};sections:WorkbenchSection[]}
export interface WorkbenchPage {section:string;generatedAt:string;count:number;items:WorkbenchRow[];nextCursor:string|null}
export interface PlanItem {key:string;kind:'due'|'planned'|'neededBy'|'checkBack'|'milestone'|'undated';day:string;date:string|null;overdue:boolean;
  startDate:string|null;endDate:string|null;projectId:string;projectName:string;workspaceName?:string;
  task:{id:string;displayId:string;title:string;status:string;done:boolean;revision:number}|null;
  milestone:{id:string;title:string}|null;requestId:string|null;canonicalUrl:string|null}
export interface PlanHorizon {horizon:'today'|'7d';timezone:string;timezoneSource:'request'|'preference'|'default';preferredTimezone:string|null;
  generatedAt:string;today:string;from:string;to:string;days:{date:string;items:PlanItem[]}[];undated:PlanItem[];truncated:boolean}
