/** Supported core browser entry. Does not register graph, roadmap, crop, or whiteboard. */
export declare const version:'0.6.0-vnext.1';
export declare function registerCore():void;
export declare function registerComponents():void;
export declare function registerDateFields():void;
export declare function registerEditors():void;
export declare function registerPagination():void;
export declare function registerStructured():void;
export declare function registerSideNavigation():void;
export declare function registerWorkHeader():void;
export declare function enhance(root?:ParentNode):void;
export declare function icon(name:string,size?:number):string;
export declare function mark():string;
export declare function escapeHTML(value:unknown):string;
export declare function notify(options:{message:string;description?:string;tone?:'info'|'success'|'warning'|'danger';duration?:number;action?:{label:string;run:()=>void}}):void;
export declare function motionReduced():boolean;
export declare function transition(el:HTMLElement,frames:Keyframe[],duration?:number,delay?:number):Animation|undefined;
export declare function autosize(input:HTMLTextAreaElement):void;
export declare function bindAutosize(root:ParentNode,signal?:AbortSignal):void;
export declare function copyAtButton(button:HTMLButtonElement,text:string):Promise<void>;
export declare function parseTime(value:string):string|null;
export declare function formatTime(value:string,cycle:12|24):string;
export declare function pageWindow(total:number,current:number,compact?:boolean):(number|string)[];
export declare class IqDateField extends HTMLElement {value:string;readonly timeValue:string;disabled:boolean;open():void;close(restore?:boolean):void;}
export declare class IqTime extends HTMLElement {value:string;hourCycle:12|24;}
export interface MarkdownEditorAction {id:string;label:string;pressed:boolean;disabled?:boolean;tone?:'neutral'|'warning';}
export interface MarkdownEditorActionIntent {id:string;pressed:boolean;previous:boolean;}
export declare class IqMarkdownEditor extends HTMLElement {value:string;disabled:boolean;readOnly:boolean;previewOnBlur:boolean;previewMode:boolean;interactiveTasks:boolean;density:'compact'|'comfortable';footerActions:MarkdownEditorAction[];preview():void;focusEditor():void;}
export declare class IqPagination extends HTMLElement {total:number;current:number;}
export interface TreeNode {id:string;label:string;children?:TreeNode[];count?:number;disabled?:boolean;}
export declare class IqTree extends HTMLElement {items:TreeNode[];value:string[];readonly total:number;}
export interface PlanItem {id:string;title:string;due:string;status?:string;owner?:string;[key:string]:unknown;}
export declare class IqPlan extends HTMLElement {items:PlanItem[];}
export interface NavigationItem {id:string;label:string;href?:string;icon?:string;count?:number;}
export interface NavigationSection {label?:string;items:NavigationItem[];}
export declare class IqSideNavigation extends HTMLElement {active:string;collapsed:boolean;items:NavigationSection[];}
export declare class IqWorkHeader extends HTMLElement {}
export declare class IqFilePreview extends HTMLElement {file:File|null;}
export type PDFPreviewRenderer=(file:File,canvas:HTMLCanvasElement,signal:AbortSignal)=>Promise<void>;
export declare function configurePDFPreviews(renderer:PDFPreviewRenderer):void;
export declare function bindBoard(root:HTMLElement,onDrop:(detail:Record<string,unknown>)=>void):()=>void;
export type Priority='critical'|'high'|'normal'|'low';
export declare const priorities:Readonly<Record<Priority,unknown>>;
export declare function normalizePriority(value:unknown):Priority;
export declare function priorityBadge(value:unknown,compact?:boolean):string;
export declare function priorityOptions():{value:Priority;label:string}[];
export declare const taskKinds:Readonly<Record<string,unknown>>;
export declare function normalizeTaskKind(value:unknown):string;
export declare function taskKindOptions():{value:string;label:string}[];
export declare function taskSignal(task:Record<string,unknown>):string;
export declare function taskEmphasis(task:Record<string,unknown>):'critical'|'high'|'epic'|'none';
export declare function validateFields(form:HTMLFormElement):boolean;
export declare function setFieldError(input:HTMLElement,message:string):void;
export declare function fieldError(input:HTMLInputElement):string;
/** Existing composition helpers; see source ui.js for optional slot markup. */
export declare const ui:Record<string,unknown>;
declare global {interface HTMLElementTagNameMap {'iq-date-field':IqDateField;'iq-time':IqTime;'iq-markdown-editor':IqMarkdownEditor;'iq-pagination':IqPagination;'iq-tree':IqTree;'iq-plan':IqPlan;'iq-side-navigation':IqSideNavigation;'iq-work-header':IqWorkHeader;'iq-file-preview':IqFilePreview;}}

/** Defaults are compatible with the existing editor preview: Markdown # becomes h2. */
export interface MarkdownRenderOptions {headingLevel?:1|2|3|4|5|6;}
/** Safe subset, not raw HTML/CommonMark extension execution. HTTPS + local #links only. */
export declare function safeMarkdown(source:string|null|undefined,options?:MarkdownRenderOptions):string;
export declare function safeMarkdownURL(value:unknown):string|null;
/** value is text, never HTML. No accepted/submitted state and no application events. */
export declare class IqMarkdownViewer extends HTMLElement {value:string;headingLevel:1|2|3|4|5|6;interactiveTasks:boolean;}
export declare function registerMarkdownViewer():void;
export type WorkDensity='compact'|'comfortable';
/** Named slots: header/navigation/summary/toolbar/footer. Default slot: working data. */
export declare class IqWorkLayout extends HTMLElement {density:WorkDensity;}
export declare function registerWorkLayout():void;
declare global {interface HTMLElementTagNameMap {'iq-markdown-viewer':IqMarkdownViewer;'iq-work-layout':IqWorkLayout;}}
