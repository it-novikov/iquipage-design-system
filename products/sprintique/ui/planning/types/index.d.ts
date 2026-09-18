/** Product consumer protocol. Canonical commands and projections live in contracts/. */
import type {ViewIntent,ViewFilters} from '../../../contracts/planning-view.js';
export type Capability='createTask'|'createRelease'|'move'|'prepare'|'start'|'editRelease'|'close'|'cancel'|'bulk'|'selection'|'timeline'|'temporal'|'milestone'|'settings';
export type Filters=ViewFilters;
export interface RequestContext {projectId:string;signal?:AbortSignal}
export interface PlanningGroup {id:string;title:string;state:'active'|'planned'|'backlog'|'closed'|'cancelled';total:number;matched:number;dateLabel?:string;formatLabel?:string}
export interface PlanningRow {id:string;taskId:string;key:string;title:string;type:'task'|'bug'|'epic';priority:'normal'|'low'|'high'|'critical';preparation:'draft'|'ready';statusLabel:string;ownerLabel?:string;dateLabel?:string;depth:number;childrenCount:number;contextOnly:boolean;selectable:boolean;parentContext?:string|null;revision:number;admission:boolean;outcome:'open'|'accepted';parentId:string|null}
export interface GroupPage {protocol:'sprintique.planning-view/1';projectId:string;revision:string;items:PlanningGroup[];nextCursor:string|null;matchedTotal:number;capabilities:Partial<Record<Capability,boolean>>}
export interface RowPage {projectId:string;groupId:string;revision:string;rows:PlanningRow[];nextCursor:string|null}
export type PlanningIntent=ViewIntent;
export interface ChangePreview {token:string;expiresAt:string;summary:string;changes:{label:string;description:string}[];moreChanges?:number;blockers:string[]}
export type CommandReceipt={state:'committed';operationId:string;message?:string}|{state:'rejected';message:string}|{state:'pending'|'uncertain'};
export interface OptionPage {options:{value:string;label:string;description?:string;disabled?:boolean}[];nextCursor:string|null}
export interface ReleaseDescription {
  title:string;format:'flexible'|'timeboxed';start:string|null;end:string|null;deadline:string|null;
  revision:string;nextCursor:string|null;counts:{total:number;accepted:number;candidates:number;unfinished:number};
  items:{id:string;key:string;title:string;outcome:'accepted'|'candidate'|'unfinished';openChildren:number}[];
  snapshot?:{name:string;accepted:number;carried:number;items:{id:string;key:string;title:string;outcome:'baseline'|'accepted'|'transferred'|'deferred'}[]};
}
export interface TimelineRow {id:string;entityId:string;entityKind:'task'|'release'|'milestone';title:string;start:string|null;end:string|null;deadline:string|null;readonly:boolean;parentId?:string;releaseId?:string|null;status?:string}
export interface TimelinePage {projectId:string;revision:string;rows:TimelineRow[];nextCursor:string|null;total:number;dependencies:{id:string;from:string;to:string;type:'FS'|'SS'|'FF'|'SF';lagDays:number}[]}
export interface PlanningAdapter {
  listGroups(request:RequestContext&Partial<Filters>&{cursor?:string|null}):Promise<GroupPage>;
  listRows(request:RequestContext&Partial<Filters>&{groupId:string;revision:string;cursor:string|null;collapsedTaskIds:string[]}):Promise<RowPage>;
  destinations(request:RequestContext&{query:string;cursor:string|null;excludeId?:string}):Promise<OptionPage>;
  options(request:RequestContext&{kind:'tasks'|'owner'|'tags';query:string;cursor:string|null}):Promise<OptionPage>;
  selectMatching(request:RequestContext&Partial<Filters>&{taskIds?:string[]}):Promise<{token:string;count:number;revision:string}>;
  describeRelease(request:RequestContext&{groupId:string;cursor?:string}):Promise<ReleaseDescription>;
  settings(request:RequestContext):Promise<{format:'flexible'|'timeboxed';days:number;timeZone:string}>;
  timeline(request:RequestContext&Partial<Filters>&{cursor?:string|null}):Promise<TimelinePage>;
  preview(request:RequestContext&{intent:PlanningIntent}):Promise<ChangePreview>;
  commit(request:Omit<RequestContext,'signal'>&{token:string;idempotencyKey:string}):Promise<CommandReceipt>;
  receipt(request:Omit<RequestContext,'signal'>&{idempotencyKey:string}):Promise<CommandReceipt>;
  subscribe?(listener:()=>void):()=>void;
}
export interface ViewState {filters?:Partial<Filters>;collapsed?:string[];scrollTop?:number;view?:'list'|'timeline'}
export interface TaskCallbacks {onChanged:(result?:{message?:string})=>void|Promise<void>;onClose:()=>void}
export interface HostModal {element?:HTMLElement;close:()=>unknown}
export interface PlanningOptions {
  adapter:PlanningAdapter;project:{id:string;name:string};viewState?:ViewState;
  onOpenTask:(taskId:string,callbacks:TaskCallbacks)=>HostModal|Promise<HostModal>;
  onCreateTask:(context:TaskCallbacks&{groupId:string})=>HostModal|Promise<HostModal>;
  onCreateRelease:(callbacks:TaskCallbacks)=>HostModal|Promise<HostModal>;
  onOpenBoard?:(groupId:string)=>void|Promise<void>;
}
export interface PlanningFeature {reload():Promise<void>;readyToLeave():boolean;destroy(options?:{force?:boolean}):void}
export function mountPlanning(root:HTMLElement,options:PlanningOptions):Promise<PlanningFeature>;
