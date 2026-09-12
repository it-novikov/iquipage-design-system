import type {ThreadPage} from './board.js';
/** Host integration contract. These types do not grant server permissions. */
export type Collection='maps'|'templates'|'runs'|'tasks'|'rules'|'tags'|'releases'|'threads'|'taskLinks'|'taskSettings';
export type MapKind='permanent'|'session';
export type MapStatus='draft'|'active'|'paused'|'archived';
export type BoardObjectType='sticky'|'text'|'shape'|'frame'|'task'|'image'|'drawing';
export type CreatableBoardObjectType=Exclude<BoardObjectType,'drawing'>;
export interface BoardObjectBase{id:string;text:string;x:number;y:number;width:number;height:number;parentId?:string;locked?:boolean;[field:string]:unknown}
export interface BoardTaskObject extends BoardObjectBase{type:'task';owner?:string;done?:boolean;externalTaskId?:string}
export type BoardObject=BoardTaskObject|(BoardObjectBase&{type:Exclude<BoardObjectType,'task'>;externalTaskId?:never});
export interface BoardDocument{schema?:string;title:string;revision:number;objects:BoardObject[];connections:{id:string;from:string;to:string;label?:string;[field:string]:unknown}[]}
export interface MapRecord{schema:'iquipage.maps/1';id:string;projectId:string;title:string;kind:MapKind;status:MapStatus;revision:number;document:BoardDocument;flow:Flow|null;summary:string;createdAt:string;updatedAt:string;sourceMapId?:string;sourceRevision?:number;session:Session|null}
export interface Session{phase:'collect'|'discuss'|'vote'|'outcomes';timer:{remaining:number;endsAt:string|null};votes:Record<string,number>;voteLimit:number}
export interface FlowNode{id:string;kind:'input'|'transform'|'condition'|'llm'|'approval'|'task'|'output';title:string;x:number;y:number;width:number;height:number;config:Record<string,unknown>}
export interface Flow{schema:'iquipage.flow/1';version:number;nodes:FlowNode[];edges:{id:string;source:string;target:string;when:'always'|'true'|'false'}[];annotations?:BoardDocument}
export interface VersionedRecord{id:string;projectId:string;revision:number;[field:string]:unknown}
export interface Capabilities{storage:'server'|'browser'|'memory';storageLabel?:string;runtimeScope?:'local-reference'|'production';collaboration:boolean;events:boolean;transactionalEvents?:boolean;llm:boolean;schedule?:boolean;webhook?:boolean;tasks?:boolean;attachments?:boolean}
export interface Repository{
 capabilities:Capabilities;
 context?:{workspaceId:string;actorId:string};
 list(collection:Collection,projectId:string):Promise<any[]>;
 read(collection:Collection,id:string,projectId:string,options?:{signal?:AbortSignal}):Promise<any|null>;
 write(collection:Collection,value:any,baseRevision:number,options?:{signal?:AbortSignal}):Promise<any>;
 request?<T=unknown>(path:string,options?:{method?:'GET'|'POST'|'PUT'|'DELETE';body?:unknown;signal?:AbortSignal}):Promise<T>;
 subscribe?(listener:(change:{collection:Collection;id:string;projectId:string;revision:number})=>void):()=>void;
 pageThreads?(projectId:string,taskId:string,options?:{cursor?:string|null;limit?:number;signal?:AbortSignal}):Promise<ThreadPage>;
 close?():void|Promise<void>;
}
export interface ActionItem{title:string}
export interface Run{schema:'iquipage.run/1';id:string;projectId:string;mapId:string;mapRevision:number;revision:number;mode:'test'|'execute';status:'queued'|'running'|'awaiting_approval'|'succeeded'|'failed'|'blocked'|'interrupted'|'rejected'|'cancelled';flowSnapshot:Flow;steps:any[];data:any;result?:any;[field:string]:unknown}
export interface Runtime{
 start(input:{projectId:string;mapId:string;mapRevision:number;flow:Flow;input:{notes:string[]};mode:'test'|'execute';actorId?:string}):Promise<Run>;
 approve(id:string,projectId:string,decision:{accepted:boolean;actions:ActionItem[];baseRevision:number;actorId?:string}):Promise<Run>;
 cancel(id:string,projectId:string):Promise<Run>;
 retry(id:string,projectId:string):Promise<Run>;
}
export interface MapsConfig{
 /** Direct inline content editing by default. Properties mode is explicit legacy opt-in. */
 canvasEditing?:'direct'|'properties';
 project:{id:string;name?:string};repository:Repository;runtime?:Runtime;mapId?:string;storageLabel?:string;
 context?:{workspaceId:string;actorId:string};
 permissions:{read:boolean;edit?:boolean;run?:boolean;approve?:boolean;manageAutomation?:boolean};
 uiCapabilities?:Partial<Omit<MapsUiCapabilities,'allowedCreateTypes'>> & {allowedCreateTypes?:CreatableBoardObjectType[]};
 onOpenMap?:(target:{id:string;projectId:string})=>void;
 onOpenTasks?:(target:{ids:string[];projectId:string;focusTaskId?:string})=>void|Promise<void>;
}
export interface MapsUiCapabilities{mapSwitcher:boolean;templates:boolean;sessions:boolean;workflow:boolean;automation:boolean;agentProposals:boolean;allowedCreateTypes:readonly CreatableBoardObjectType[]}
export interface OpenTaskDetail{objectId:string;taskId:string}
export interface OpenTasksDetail{ids:string[];projectId:string;focusTaskId?:string}
export interface WhiteboardChangeRequestDetail{requestId:string;baseRevision:number;reason:string;value:BoardDocument;accept(value:BoardDocument):boolean;reject(message?:string):boolean}
export interface WhiteboardHostCommandDetail{command:string}
export interface WhiteboardSelectionDetail{ids:string[]}
export interface WhiteboardElementEventMap{
 'iq-open-task':CustomEvent<OpenTaskDetail>;
 'iq-host-command':CustomEvent<WhiteboardHostCommandDetail>;
 'iq-selection':CustomEvent<WhiteboardSelectionDetail>;
 'iq-change-request':CustomEvent<WhiteboardChangeRequestDetail>;
}
export interface MapsElementEventMap{'iq-open-tasks':CustomEvent<OpenTasksDetail>}
export interface IqWhiteboardElement extends HTMLElement{
 data:BoardDocument;readonly draftData:BoardDocument;allowedCreateTypes:CreatableBoardObjectType[];
 controlled:boolean;readOnly:boolean;readonly dirty:boolean;readonly saving:boolean;
 editorMode:'inline'|'host';
 command(id:'edit'|'quick-note'|'bulk'|'search'|'frames'|'menu'|'undo'|'redo'|'image'|'connect-form'|'export'|'export-summary'|'library-toggle'|'help'|'templates'|'session'):void;
 applyDocument(value:BoardDocument,baseRevision:number,reason?:string):boolean;
 addEventListener<K extends keyof WhiteboardElementEventMap>(type:K,listener:(this:IqWhiteboardElement,event:WhiteboardElementEventMap[K])=>void,options?:boolean|AddEventListenerOptions):void;
}
declare global{interface HTMLElementTagNameMap{'iq-whiteboard':IqWhiteboardElement}}
export interface AgentProposal{schema:'iquipage.map-proposal/1';mapId:string;projectId:string;baseRevision:number;operations:({type:'updateText';id:string;text:string}|{type:'addSticky';text:string})[]}
export declare class MapsFeature{
 readonly current:MapRecord|null;
 readonly uiCapabilities:MapsUiCapabilities;
 readyToLeave():Promise<boolean>;
 openMap(id:string):Promise<boolean>;
 getAgentContext(ids?:string[]):Record<string,unknown>;
 previewAgentProposal(proposal:AgentProposal):HTMLElement;
 destroy():Promise<boolean>;
}
export declare function mountMaps(root:HTMLElement,config:MapsConfig):Promise<MapsFeature>;

/** Delivery metadata excludes note contents and connection credentials. */
export interface DeliveryRecord {id:string;projectId:string;revision:number;type:string;recordId:string;recordRevision:number;status:"pending"|"retry"|"dead"|"delivered"|"dismissed";createdAt:string;attempts:number;totalAttempts:number;manualRetries:number;nextAttemptAt:number|null;lastError:string|null;outcomes:{ruleId:string;mapId:string;runId?:string;reason?:string}[]}
