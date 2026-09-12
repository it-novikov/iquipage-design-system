/** Consumer projection only. The backend owner defines the canonical API and SDK. */
export type Capability = 'createTask'|'createRelease'|'move'|'prepare'|'start'|'close'|'cancel'|'editRelease'|'bulk'|'selection'|'reorder'|'timeline'|'milestone'|'temporal'|'settings'|'take';
export interface Filters {query:string;preparation:'all'|'draft'|'ready';sort:'planned'|'priority'|'date';history?:'current'|'closed';owner?:string;releaseId?:string;tagIds?:string[];tagMode?:'any'|'all'}
export interface RequestContext {projectId:string;signal?:AbortSignal}
export interface PlanningGroup {id:string;title:string;state:'active'|'planned'|'backlog'|'closed'|'cancelled';total:number;matched:number;dateLabel?:string;formatLabel?:string}
export interface PlanningRow {id:string;taskId:string;key:string;title:string;type:'task'|'bug'|'epic';priority:'normal'|'low'|'high'|'critical';preparation:'draft'|'ready';statusLabel:string;ownerLabel?:string;dateLabel?:string;depth:number;childrenCount:number;contextOnly:boolean;selectable:boolean;parentContext?:string|null}
export interface GroupPage {protocol:'sprintique.planning-view/1';projectId:string;revision:string;items:PlanningGroup[];nextCursor:string|null;matchedTotal?:number;capabilities:Partial<Record<Capability,boolean>>}
export interface RowPage {projectId:string;groupId:string;revision:string;rows:PlanningRow[];nextCursor:string|null}
export type SelectionSpec = {taskIds:string[];selectionToken?:never}|{selectionToken:string;taskIds?:never};
export interface ReleaseValues {name:string;format:'flexible'|'timeboxed';start:string|null;end:string|null;deadline:string|null}
export interface ScheduleValues {start:string|null;end:string|null;deadline?:string|null}
export type EntityKind = 'task'|'release'|'milestone';
export type TemporalType = 'FS'|'SS'|'FF'|'SF';
export type TemporalIntent = {kind:'schedule';entityId:string;entityKind:EntityKind;values:ScheduleValues}|{kind:'temporal';entityId?:string;values:{fromId:string;toId:string;type:TemporalType;lagDays:number}}|{kind:'removeTemporal';entityId:string};
export type PlanningIntent = (
  | ({kind:'prepare'|'unprepare'|'take'|'defer'} & SelectionSpec)
  | ({kind:'move';groupId:string} & SelectionSpec)
  | {kind:'start';groupId:string;draftHandling?:'prepare'|'backlog'}
  | {kind:'close'|'cancel';groupId:string;acceptAllCandidates?:boolean;acceptTaskIds?:string[];destinationId?:string;destinations?:Record<string,string>;newRelease?:ReleaseValues}
  | {kind:'editRelease';groupId:string;values:ReleaseValues}
  | ({kind:'bulk';field:'owner'|'priority'|'due'|'tags'|'archive';value:string|string[]|null;mode?:'replace'|'add'} & SelectionSpec)
  | {kind:'reorder';taskIds:[string];beforeId:string|null}
  | {kind:'settings';values:PlanningSettings}
  | {kind:'milestone';entityId?:string;values:{title:string;date:string;releaseId:string|null}}
  | {kind:'removeMilestone';entityId:string}
  | {kind:'shiftDates';groupId:string;days:number}
  | TemporalIntent
  | {kind:'batch';actions:TemporalIntent[]}
) & {expectedProjectionRevision?:string};
export interface ChangePreview {token:string;expiresAt:string;summary:string;changes:{label:string;description:string}[];moreChanges?:number;blockers:string[]}
export type CommandReceipt = {state:'committed';operationId:string;message?:string}|{state:'rejected';message:string}|{state:'pending'|'uncertain'};
export interface PickerPage {options:{value:string;label:string;description?:string;disabled?:boolean}[];nextCursor:string|null}
export interface PickerRequest extends RequestContext {query:string;cursor:string|null}
export interface PlanningSettings {format:'flexible'|'timeboxed';days:number;timeZone:string;revision?:number}
export interface ReleaseItem {id:string;key:string;title:string;parentId:string|null;outcome:'accepted'|'cancelled'|'candidate'|'unfinished';openChildren:number}
export interface ReleaseSnapshot {name:string;format:'flexible'|'timeboxed';closedAt:string;kind:'closed'|'cancelled';accepted:number;carried:number;items:{taskId:string;key:string;title:string;outcome:string;destinationId:string|null;status:string}[]}
export interface ReleaseDetail {id:string;title:string;state:'active'|'planned'|'closed'|'cancelled';format:'flexible'|'timeboxed';start:string|null;end:string|null;deadline:string|null;revision:number;counts:{total:number;accepted:number;candidates:number;unfinished:number;drafts:number};items:ReleaseItem[];snapshot:ReleaseSnapshot|null}
export interface TemporalRow {id:string;entityId:string;entityKind:EntityKind;title:string;parentId?:string|null;releaseId?:string|null;kind?:'goal'|'epic'|'task'|'milestone';start:string|null;end:string|null;deadline:string|null;readonly:boolean;status?:string}
export interface TemporalEdge {id:string;from:string;to:string;type:TemporalType;lagDays:number}
export interface TemporalPage {projectId:string;revision:string;rows:TemporalRow[];dependencies:TemporalEdge[];nextCursor:string|null;total:number}
export interface SelectionSnapshot {token:string;count:number;expiresAt:string;revision:string}
export interface PlanningAdapter {
  listGroups(request:RequestContext&Filters&{cursor:string|null}):Promise<GroupPage>;
  listRows(request:RequestContext&Filters&{groupId:string;revision:string;cursor:string|null;collapsedTaskIds:string[]}):Promise<RowPage>;
  destinations(request:PickerRequest&{excludeId?:string}):Promise<PickerPage>;
  preview(request:RequestContext&{intent:PlanningIntent}):Promise<ChangePreview>;
  commit(request:Omit<RequestContext,'signal'>&{token:string;idempotencyKey:string}):Promise<CommandReceipt>;
  receipt(request:Omit<RequestContext,'signal'>&{idempotencyKey:string}):Promise<CommandReceipt>;
  describeRelease?(request:RequestContext&{groupId:string}):Promise<ReleaseDetail>;
  settings?(request:RequestContext):Promise<PlanningSettings>;
  options?(request:PickerRequest&{kind:'owner'|'tags'|'tasks'|'positions';taskId?:string}):Promise<PickerPage>;
  selectMatching?(request:RequestContext&Filters&{taskIds?:string[]}):Promise<SelectionSnapshot>;
  timeline?(request:RequestContext&Partial<Filters>&{cursor:string|null}):Promise<TemporalPage>;
  subscribe?(listener:()=>void):()=>void;
}
export interface TemporalViewState {scale?:string;collapsedIds?:string[];month?:string}
export interface ViewState {filters?:Filters;collapsed?:string[];scrollTop?:number;mode?:'list'|'timeline'|'dates';temporal?:TemporalViewState}
export interface TaskCallbacks {onChanged:(result?:{message?:string})=>void|Promise<void>;onClose:()=>void}
export interface HostModal {element?:HTMLElement;close:()=>unknown}
export interface PlanningOptions {
  adapter:PlanningAdapter;project:{id:string;name:string};viewState?:ViewState;
  onOpenTask:(taskId:string,callbacks:TaskCallbacks)=>HostModal|Promise<HostModal>;
  onCreateTask:(context:TaskCallbacks&{groupId:string})=>HostModal|Promise<HostModal>;
  onCreateRelease:(callbacks:TaskCallbacks)=>HostModal|Promise<HostModal>;
  onOpenBoard?:(groupId:string)=>void|Promise<void>;
}
export interface PlanningFeature {reload():Promise<void>;readyToLeave():boolean;destroy():false|void}
export function mountPlanning(root:HTMLElement,options:PlanningOptions):Promise<PlanningFeature>;
