/** Public browser contract for IQUIPAGE 05.7. No backend, accounts or realtime service. */
export type BoardObjectType='sticky'|'text'|'shape'|'frame'|'task'|'image'|'drawing';
export type BoardShape='rectangle'|'diamond'|'pill'|'ellipse'|'parallelogram'|'database'|'document'|'predefined'|'manual'|'trapezoid'|'hexagon'|'delay'|'connector'|'offpage';
export type NoteColor='sand'|'lavender'|'mint'|'sky'|'rose'|'neutral';
export interface BoardObject {
 id:string; type:BoardObjectType; text:string; x:number; y:number; width:number; height:number;
 color:NoteColor; parentId?:string; locked?:boolean; author?:string;
 align?:'left'|'center'|'right';valign?:'top'|'middle'|'bottom';autoHeight?:boolean;minHeight?:number;
 headerHeight?:number;captionHeight?:number;layout?:'column';
 shape?:BoardShape; src?:string; points?:[number,number][]; done?:boolean; owner?:string;
}
export interface BoardConnection {id:string;from:string;to:string;label?:string;style?:'curve'|'straight'|'elbow';arrow?:boolean;arrowStart?:boolean;fromPort?:'auto'|'top'|'right'|'bottom'|'left';toPort?:'auto'|'top'|'right'|'bottom'|'left';dashed?:boolean;color?:'neutral'|'accent'|'success'|'warning'|'error';labelPosition?:number;bend?:number;}
export interface WhiteboardData {schema?:'iquipage.whiteboard/1';title:string;revision:number;objects:BoardObject[];connections:BoardConnection[];}
export interface BoardViewport {x:number;y:number;zoom:number;}
export interface BoardTemplate {id:string;title:string;description?:string;data:WhiteboardData;}
export interface ChangeRequest {
 requestId:number;baseRevision:number;value:WhiteboardData;reason:string;
 /** False means this response is stale or already handled; no mutation occurs. */
 accept(value?:WhiteboardData):boolean;
 reject(message?:string):boolean;
}
export interface BoardEvents {
 'iq-change':CustomEvent<{value:WhiteboardData;reason:string}>;
 'iq-change-request':CustomEvent<ChangeRequest>;
 'iq-change-cancel':CustomEvent<{requestId:number;baseRevision:number}>;
 'iq-selection':CustomEvent<{ids:string[]}>;
 'iq-viewport':CustomEvent<BoardViewport>;
 'iq-announcement':CustomEvent<{text:string}>;
 'iq-vote':CustomEvent<{objectId:string;votes:number;local:true}>;
 'iq-retry':CustomEvent<Record<string,never>>;
 'iq-edit-object':CustomEvent<{id:string;object?:BoardObject}>;
}
export declare class IqWhiteboard extends HTMLElement {
 data:WhiteboardData;selection:string[];viewport:BoardViewport;templates:BoardTemplate[];
 readOnly:boolean;state:'ready'|'loading'|'error';
 /** Legacy programmatic list view remains for compatibility, not in the visible tool menu. */
 view:'canvas'|'list';controlled:boolean;saveStatus:string;editorMode:'inline'|'host';
 fit(ids?:string[]):void;
 select(ids:string[],announce?:boolean):void;
 undo():void;redo():void;cancelPending():void;fullscreen(open:boolean):void;
 addEventListener<K extends keyof BoardEvents>(type:K,listener:(this:IqWhiteboard,event:BoardEvents[K])=>void,options?:boolean|AddEventListenerOptions):void;
 addEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions):void;
}
export declare function registerWhiteboard():void;
export declare function validateWhiteboard(value:unknown):WhiteboardData;
declare global {interface HTMLElementTagNameMap {'iq-whiteboard':IqWhiteboard;}}
