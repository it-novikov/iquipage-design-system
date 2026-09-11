import type {AttachmentAdapter} from './attachments.js';
import type {Repository} from './index.js';
export type BoardSort = 'priority' | 'due' | 'created' | 'manual';
export interface BoardFilters {owners:string[];releases:string[];tags:string[];tagMode:'any'|'all'}
export interface BoardViewState {sort?:BoardSort;query?:string;filters?:BoardFilters;collapsed?:string[];x?:number;y?:number}
export interface BoardConfig {
  repository:Repository;
  project:{id:string;name?:string};
  canEdit?:boolean;
  canManageCatalogs?:boolean;
  attachmentAdapter?:AttachmentAdapter|null;
  viewState?:BoardViewState;
}
export interface BoardHandle {
  reload():Promise<void>;
  openTask(id:string):Promise<boolean>;
  readyToLeave():Promise<boolean>;
  destroy():void;
}
/** Browser-only reusable feature. Authentication and authoritative permissions belong to the host. */
export declare function mountTaskBoard(root:HTMLElement,config:BoardConfig):Promise<BoardHandle>;

export interface ChecklistItem {id:string;text:string;done:boolean}
export interface TaskChecklist {id:string;title:string;items:ChecklistItem[]}
export type TagTone='neutral'|'blue'|'purple'|'green'|'amber'|'red';
export interface ProjectTag {id:string;projectId:string;revision:number;name:string;tone:TagTone;archivedAt?:string|null}
export interface ProjectRelease {id:string;projectId:string;revision:number;name:string;status:'planned'|'released';targetDate?:string|null;archivedAt?:string|null}
export interface TaskMessage {id:string;body:string;authorId:string;createdAt:string}
export interface TaskThread {
  id:string;projectId:string;taskId:string;revision:number;
  requiresResolution:boolean;resolved:boolean;messages:TaskMessage[];
  resolution?:{actorId:string;at:string}|null;createdAt:string;lastActivityAt:string;
}
export interface TaskLink {id:string;projectId:string;revision:number;kind:'depends'|'related';fromId:string;toId:string;archivedAt?:string|null}
export type TemplateMode='inherit'|'append'|'replace'|'exclude';
export interface TaskTemplateSpec {description?:string;checklists?:TaskChecklist[];priority?:'low'|'normal'|'high'|'critical'|null;descriptionMode?:TemplateMode;checklistsMode?:TemplateMode}
export interface ProjectTaskSettings {id:string;projectId:string;revision:number;base:TaskTemplateSpec;types:Partial<Record<'task'|'bug'|'epic',TaskTemplateSpec>>}
export interface TaskContentFields {
  attachmentIds?:string[];coverAttachmentId?:string|null;
  checklists?:TaskChecklist[];tagIds?:string[];releaseId?:string|null;
  templateVersion?:{settingsId:string;revision:number;type:'task'|'bug'|'epic'};
}

export interface ThreadSummary extends Omit<TaskThread,'messages'> {summary:true;messageCount:number;messages:{body:string}[]}
export interface ThreadPage {items:ThreadSummary[];nextCursor:string|null;total:number;unresolved:number}
