/** Supported core browser entry. Does not register graph, roadmap, crop, or whiteboard. */
export declare const version:'0.6.0-vnext.22';
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
/** Tag colour attributes: a palette tone name, or any "#RRGGBB" (derived, theme-aware fill and text; no inline styles). */
export declare function tagToneAttributes(tone:string):string;
export interface AvatarPerson {name:string;id?:string;}
export declare function notify(options:{message:string;description?:string;tone?:'info'|'success'|'warning'|'danger';duration?:number;action?:{label:string;run:()=>void}}):void;
export declare function motionReduced():boolean;
export declare function transition(el:HTMLElement,frames:Keyframe[],duration?:number,delay?:number):Animation|undefined;
export declare function autosize(input:HTMLTextAreaElement):void;
export declare function bindAutosize(root:ParentNode,signal?:AbortSignal):void;
export declare function copyAtButton(button:HTMLButtonElement,text:string):Promise<void>;
export declare function parseTime(value:string):string|null;
export declare function formatTime(value:string,cycle:12|24):string;
export declare function pageWindow(total:number,current:number,compact?:boolean):(number|string)[];
export declare function formatDate(value:string|number|Date|null|undefined,options?:{timeZone?:string}):string;
export declare function formatDateTime(value:string|number|Date|null|undefined,options?:{timeZone?:string}):string;
export declare function formatDateRange(start:string|number|Date|null|undefined,end:string|number|Date|null|undefined,options?:{timeZone?:string}):string;
export declare class IqDateField extends HTMLElement {value:string;readonly timeValue:string;disabled:boolean;open():void;close(restore?:boolean):void;}
export declare class IqTime extends HTMLElement {value:string;hourCycle:12|24;}
export interface MarkdownEditorAction {id:string;label:string;pressed:boolean;disabled?:boolean;tone?:'neutral'|'warning';hint?:string;/** 'chip' renders a compact pressed toggle (chat composers); 'check' a checkbox with a hint. */appearance?:'check'|'chip';icon?:string;}
export interface MarkdownEditorActionIntent {id:string;pressed:boolean;previous:boolean;reason?:'reset';}
export interface MarkdownEditorSubmit {value:string;/** true for Ctrl/⌘+Alt+Enter (for example: reply and resolve). */alternate:boolean;}
export declare class IqMarkdownEditor extends HTMLElement {value:string;disabled:boolean;readOnly:boolean;previewOnBlur:boolean;previewMode:boolean;interactiveTasks:boolean;density:'compact'|'comfortable';footerActions:MarkdownEditorAction[];/** Host actions at the end of the toolbar, shown only while editing; a click emits iq-editor-action {id}. */toolbarActions:MarkdownToolbarAction[];preview():void;focusEditor():void;/** variant="chat" idle="line": false while the composer rests as one line. */readonly expanded:boolean;expand(options?:{focus?:boolean}):void;collapse():void;reset():void;}
export interface MarkdownToolbarAction {id:string;label:string;icon?:string;}
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
export interface PDFJSSource {pdfjsUrl:string;workerUrl?:string;}
/** PDF thumbnails are opt-in: pass a renderer or a self-hosted pdf.js module URL; null restores the placeholder tile. */
export declare function configurePDFPreviews(renderer:PDFPreviewRenderer|PDFJSSource|null):void;
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

/** Authentication shell. Named light-DOM slots: brand, tools, context, form, footer.
 * Attributes: product, heading, description, context-title, context-description,
 * action-href (root-relative or HTTPS), action-label, hint, error, pending, pending-label.
 * Supply slot roots before connecting; add/remove controls inside those roots afterward.
 * State updates preserve consumer subtree identity and focus.
 * iq-auth-action bubbles and is cancelable. Host owns authentication and state.
 */
export declare class IqAuthScreen extends HTMLElement {}
export declare function registerAuthScreen():void;
declare global {interface HTMLElementTagNameMap {'iq-auth-screen':IqAuthScreen;}}

/** Native username/password form. Never persists credentials. Configuration attributes
 * are set before connection; error/pending are reactive. action is root-relative or HTTPS.
 * Optional recovery-href, registration-href, remember-me; host owns their availability.
 * iq-auth-submit is cancelable and carries transient credentials; never log its detail. */
export declare class IqAuthDialog extends HTMLElement {clearPassword():void;}
export declare function registerAuthDialog():void;
declare global {interface HTMLElementTagNameMap {'iq-auth-dialog':IqAuthDialog;}}

/** Persistent settings shell: navigation and heading named slots, content default slot. */
/** Full-width settings workspace. `view` chooses the half a phone shows (760px and below). */
export declare class IqSettingsLayout extends HTMLElement {}
export type SettingsLayoutView='index'|'section';
export interface VisualChoiceOption {value:string;label:string;description?:string;preview?:'light'|'dark'|'system'|'comfortable'|'compact';}
/** Native keyboard-operable radios; iq-change detail.value. Label via label attribute. */
export declare class IqVisualChoice extends HTMLElement {options:VisualChoiceOption[];value:string;}
export interface SettingsNavigationItem {id:string;label:string;icon?:string;count?:number;countLabel?:string;}
/** Settings navigation drawn with the DS side navigation (`.product-nav-*`). Returns the list only. */
export declare function settingsNavigation(groups:{label:string;items:SettingsNavigationItem[]}[],active:string):string;
export declare function registerSettings():void;
export interface RelationMapNode {id:string;title:string;key?:string;status?:string;tone?:'neutral'|'info'|'planned'|'success'|'warning'|'danger';icon?:string;linkId?:string;}
export interface RelationMapValue {center:RelationMapNode;parent?:RelationMapNode|null;dependsOn?:RelationMapNode[];blocks?:RelationMapNode[];related?:RelationMapNode[];children?:RelationMapNode[];childrenDone?:number|null;}
/** Read-only relation map of one object. Emits iq-open {id} and, unless readonly, iq-remove {id, linkId} for removable links. */
export declare class IqRelationMap extends HTMLElement {value:RelationMapValue|null;}
export declare function registerRelationMap():void;
declare global {interface HTMLElementTagNameMap {'iq-settings-layout':IqSettingsLayout;'iq-relation-map':IqRelationMap;'iq-visual-choice':IqVisualChoice;}}
