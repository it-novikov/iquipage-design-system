/** Host integration contract. These types do not grant server permissions. */
export type Collection='maps'|'templates'|'runs'|'tasks'|'rules';
export type MapKind='permanent'|'session';
export type MapStatus='draft'|'active'|'paused'|'archived';
export type BoardObject={id:string;type:'sticky'|'text'|'shape'|'frame'|'task'|'image'|'drawing';text:string;x:number;y:number;width:number;height:number;parentId?:string;locked?:boolean;[field:string]:unknown};
export interface BoardDocument{schema?:string;title:string;revision:number;objects:BoardObject[];connections:{id:string;from:string;to:string;label?:string;[field:string]:unknown}[]}
export interface MapRecord{schema:'iquipage.maps/1';id:string;projectId:string;title:string;kind:MapKind;status:MapStatus;revision:number;document:BoardDocument;flow:Flow|null;summary:string;createdAt:string;updatedAt:string;sourceMapId?:string;sourceRevision?:number;session:Session|null}
export interface Session{phase:'collect'|'discuss'|'vote'|'outcomes';timer:{remaining:number;endsAt:string|null};votes:Record<string,number>;voteLimit:number}
export interface FlowNode{id:string;kind:'input'|'transform'|'condition'|'llm'|'approval'|'task'|'output';title:string;x:number;y:number;width:number;height:number;config:Record<string,unknown>}
export interface Flow{schema:'iquipage.flow/1';version:number;nodes:FlowNode[];edges:{id:string;source:string;target:string;when:'always'|'true'|'false'}[];annotations?:BoardDocument}
export interface VersionedRecord{id:string;projectId:string;revision:number;[field:string]:unknown}
export interface Capabilities{storage:'server'|'browser'|'memory';storageLabel?:string;runtimeScope?:'local-reference'|'production';collaboration:boolean;events:boolean;llm:boolean;schedule?:boolean;webhook?:boolean;tasks?:boolean}
export interface Repository{
 capabilities:Capabilities;
 list(collection:Collection,projectId:string):Promise<any[]>;
 read(collection:Collection,id:string,projectId:string):Promise<any|null>;
 write(collection:Collection,value:any,baseRevision:number,options?:{signal?:AbortSignal}):Promise<any>;
 subscribe?(listener:(change:{collection:Collection;id:string;projectId:string;revision:number})=>void):()=>void;
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
 project:{id:string;name?:string};repository:Repository;runtime?:Runtime;mapId?:string;storageLabel?:string;
 context?:{workspaceId:string;actorId:string};
 permissions:{read:boolean;edit?:boolean;run?:boolean;approve?:boolean;manageAutomation?:boolean};
 onOpenMap?:(target:{id:string;projectId:string})=>void;
 onOpenTasks?:(target:{ids:string[];projectId:string})=>void|Promise<void>;
}
export interface AgentProposal{schema:'iquipage.map-proposal/1';mapId:string;projectId:string;baseRevision:number;operations:({type:'updateText';id:string;text:string}|{type:'addSticky';text:string})[]}
export declare class MapsFeature{
 readonly current:MapRecord|null;
 readyToLeave():Promise<boolean>;
 openMap(id:string):Promise<boolean>;
 getAgentContext(ids?:string[]):Record<string,unknown>;
 previewAgentProposal(proposal:AgentProposal):HTMLElement;
 destroy():Promise<boolean>;
}
export declare function mountMaps(root:HTMLElement,config:MapsConfig):Promise<MapsFeature>;
