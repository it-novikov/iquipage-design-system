/** Consumer view protocol. Does not define the canonical vNext HTTP API or database. */
export type Capability = 'createTask'|'createRelease'|'move'|'prepare'|'start'|'close';
export type Filters = {query:string;preparation:'all'|'draft'|'ready';sort:'planned'|'priority'|'date'};
export interface RequestContext {projectId:string;signal?:AbortSignal}
export interface PlanningGroup {id:string;title:string;state:'active'|'planned'|'backlog'|'closed';total:number;matched:number;dateLabel?:string;formatLabel?:string}
export interface PlanningRow {id:string;taskId:string;key:string;title:string;type:'task'|'bug'|'epic';priority:'normal'|'low'|'high'|'critical';preparation:'draft'|'ready';statusLabel:string;ownerLabel?:string;dateLabel?:string;depth:number;childrenCount:number;contextOnly:boolean;selectable:boolean;parentContext?:string|null}
export interface GroupPage {protocol:'sprintique.planning-view/1';projectId:string;revision:string;items:PlanningGroup[];nextCursor:string|null;capabilities:Partial<Record<Capability,boolean>>}
export interface RowPage {projectId:string;groupId:string;revision:string;rows:PlanningRow[];nextCursor:string|null}
export type PlanningIntent = {kind:'prepare';taskIds:string[]}|{kind:'move';taskIds:string[];groupId:string}|{kind:'start';groupId:string};
export interface ChangePreview {token:string;expiresAt:string;summary:string;changes:{label:string;description:string}[];moreChanges?:number;blockers:string[]}
export type CommandReceipt = {state:'committed';operationId:string;message?:string}|{state:'rejected';message:string}|{state:'pending'|'uncertain'};
export interface PlanningAdapter {
  listGroups(request:RequestContext&Filters&{cursor:string|null}):Promise<GroupPage>;
  listRows(request:RequestContext&Filters&{groupId:string;revision:string;cursor:string|null;collapsedTaskIds:string[]}):Promise<RowPage>;
  destinations(request:RequestContext&{query:string;cursor:string|null}):Promise<{options:{value:string;label:string;description?:string;disabled?:boolean}[];nextCursor:string|null}>;
  preview(request:RequestContext&{intent:PlanningIntent}):Promise<ChangePreview>;
  commit(request:Omit<RequestContext,'signal'>&{token:string;idempotencyKey:string}):Promise<CommandReceipt>;
  receipt(request:Omit<RequestContext,'signal'>&{idempotencyKey:string}):Promise<CommandReceipt>;
  subscribe?(listener:()=>void):()=>void;
}
export interface ViewState {filters?:Filters;collapsed?:string[];scrollTop?:number}
export interface TaskCallbacks {onChanged:(result?:{message?:string})=>void|Promise<void>;onClose:()=>void}
export interface HostModal {element?:HTMLElement;close:()=>unknown}
export interface PlanningOptions {
  adapter:PlanningAdapter;project:{id:string;name:string};viewState?:ViewState;
  onOpenTask:(taskId:string,callbacks:TaskCallbacks)=>HostModal|Promise<HostModal>;
  onCreateTask:(context:TaskCallbacks&{groupId:string})=>HostModal|Promise<HostModal>;
  onCreateRelease:(callbacks:TaskCallbacks)=>HostModal|Promise<HostModal>;
  onOpenBoard?:(groupId:string)=>void|Promise<void>;
}
export interface PlanningFeature {reload():Promise<void>;readyToLeave():boolean;destroy():void}
export function mountPlanning(root:HTMLElement,options:PlanningOptions):Promise<PlanningFeature>;
