/** Additive contracts through 0.6.0-board.7, not part of the original 0.5.7 release. */
export interface MarkdownEditorV4 {
  /** Opt-in: preview content activates editing; outside click or Tab exit activates preview. */
  previewOnBlur:boolean;
  /** Explicit mode, without resetting draft/history; read-only/disabled cannot enter editing. */
  previewMode:boolean;
  /** Defaults false; toggles task markers in-place, recording undo and emitting iq-change. */
  interactiveTasks:boolean;
}
/** Controlled draft options; a click emits intent but does not save or self-accept state. */
export interface MarkdownEditorAction {id:string;label:string;pressed:boolean;disabled?:boolean;tone?:'neutral'|'warning'}
export interface MarkdownEditorActionIntent {id:string;pressed:boolean;previous:boolean}
export interface MarkdownEditorV7 extends MarkdownEditorV4 {
  /** Optional compact layout, default comfortable; no text/tool/undo replacement. */
  density:'compact'|'comfortable';
  /** Up to four plain-data toggle actions. Copies on set/get. */
  footerActions:MarkdownEditorAction[];
}
export interface ImageCropV3 {
  /** Width / height, 0.1–10; default 1. Invalid property assignments throw. Invalid attributes fall back to 1. */
  aspectRatio:number;
  /** size is the longest output edge (32–2048), square output stays backward-compatible. */
  export(options?:{size?:number;type?:'image/png'|'image/jpeg'|'image/webp';quality?:number}):Promise<Blob>;
}
export interface MarkdownViewerV3 {interactiveTasks:boolean}
export interface MarkdownTaskToggle {source:string;position:number;checked:boolean;value:string}
export interface WhiteboardV3 {editorMode:'inline'|'host'}
export interface WhiteboardEditObject {id:string;object?:unknown}
export interface UXV3EventMap {
  'iq-editor-action':CustomEvent<MarkdownEditorActionIntent>;
  'iq-preview-change':CustomEvent<{preview:boolean}>;
  'iq-task-toggle':CustomEvent<MarkdownTaskToggle>;
  'iq-edit-object':CustomEvent<WhiteboardEditObject>;
}
