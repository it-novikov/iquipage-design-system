/**
 * Public contracts for @iquipage/web/advanced, version 0.5.5.
 * Runtime: dist/advanced.js. Shared primitives load from the core entry.
 */
export type Revision = string | number;
export type SurfaceState = 'ready' | 'loading' | 'empty' | 'error' | 'blocked';
export type GraphKind = 'note' | 'task' | 'checklist' | 'media' | 'group';
export type RelationKind = 'relates' | 'depends' | 'supports';
export type RelationType = 'FS' | 'SS' | 'FF' | 'SF';
export type ISODate = string; // runtime validation: strict YYYY-MM-DD
export interface RoadmapRow {
  id: string; title: string; start?: ISODate|null; end?: ISODate|null;
  kind?: 'goal' | 'epic' | 'task' | 'milestone'; parentId?:string; blockReason?:string; progress?: number; status?: string;
  readonly?: boolean; blocked?: boolean; [domainField:string]:unknown;
}
export interface RoadmapDependency {
  id: string; from: string; to: string; type?: RelationType; lagDays?: number;
}
export interface RoadmapData {
  revision?: Revision; title?: string; rows: RoadmapRow[]; dependencies?: RoadmapDependency[];
}
export interface GraphNode {
  id:string;kind?:GraphKind;title:string;x?:number;y?:number;width?:number;height?:number;
  text?:string;items?:{label:string;checked?:boolean}[];url?:string;alt?:string;
  parentId?:string;archived?:boolean;readonly?:boolean;status?:'ready'|'done'|'error'|'disabled';
  archivedByGroup?:string; [domainField:string]:unknown;
}
export interface GraphEdge {
  id:string;source:string;target:string;kind?:RelationKind;label?:string;
  disabled?:boolean;status?:'ready'|'error';
}
export interface GraphData {revision?:Revision;title?:string;nodes:GraphNode[];edges:GraphEdge[]}
export interface GraphPresence {id:string;label:string;cursor?:{x:number;y:number};editingNodeId?:string}
export interface GraphViewport {x:number;y:number;zoom:number}
export type Operation = Record<string, unknown>;
export interface CommitRequest<T> {
  value:T; previous:T; baseRevision:Revision|undefined; operation:Operation|null;
  signal:AbortSignal;accept(value:T):boolean;reject(message?:string):boolean;
}
export interface Preview<T> {value:T;baseRevision:Revision|undefined;operation:Operation|null}
export interface PointSelection {index:number;seriesId:string;label:string;value:number}
export interface Query {
  query:string;cursor:string|null;requestId:number;signal:AbortSignal;
}
export interface Option {value:string;label:string;description?:string;disabled?:boolean}
export interface QueryResult {options:Option[];nextCursor?:string|null}
export type QueryProvider = (query:Query) => QueryResult | Promise<QueryResult>;
export interface ChoiceRequest {value:string;option:Option|null;previous:string}
export interface TagRequest {
  value:string[];previous:string[];operation:{kind:'add'|'remove';value:string};
  accept():boolean;reject(message?:string):boolean;
}
export interface ChartSeries {id:string;label?:string;values:(number|null)[]}
export interface ChartData {
  title?:string;description?:string;unit?:string;xLabel?:string;
  labels:string[];series:ChartSeries[];
}
export declare function registerAdvanced():void;
export declare function validateRoadmap(data:RoadmapData):RoadmapData;
export declare function roadmapConflicts(data:RoadmapData):{id:string;from:string;to:string;message:string}[];
export declare function validateGraph(data:GraphData):GraphData;
export declare function layoutGraph(data:GraphData):GraphData;
export declare function normalizeChartData(data:ChartData):{data:ChartData;missing:number};
declare class DataSurface<T> extends HTMLElement {
  data:T;readonly:boolean;state:SurfaceState;controlled:boolean;
  readonly pending:boolean;readonly issue:string;
  preview(value:T,operation:Operation):boolean;
  requestCommit():boolean;
}
export declare class IqRoadmap extends DataSurface<RoadmapData> {
  dependencyCapabilities:false|Partial<{create:boolean;update:boolean;delete:boolean}>;
  range:{start:ISODate;end:ISODate};
  collapsedIds:string[];selection:{kind:'row'|'dependency';id:string}|null;
  scale:'fit'|'day'|'week'|'month';today:ISODate;
}
export type GraphOperation='read'|'create'|'move'|'resize'|'editContent'|'connect'|'editRelations'|'deleteRelations'|'archive'|'restore'|'open'|'discuss';
export type GraphPermissions=Partial<Record<GraphOperation,boolean>>&{fields?:Record<string,boolean>};
export interface ArchiveCluster {id:string;title:string;nodeIds:string[];}
export interface GraphPointer {inside:boolean;x?:number;y?:number;pointerType?:string;}
export declare class IqGraph extends DataSurface<GraphData> {
  mode:'map'|'workflow';presence:GraphPresence[];
  allowedKinds:GraphKind[];kindLabels:Partial<Record<GraphKind,string>>;
  permissions:GraphPermissions|false;nodePermissions:Record<string,GraphPermissions|false>;
  mediaSources:Map<string,Blob|string>;archiveClusters:ArchiveCluster[];
  viewport:GraphViewport;selection:{kind:'node'|'edge';id:string}|null;fullscreen:boolean;
  fit():void;zoom(amount:number,clientX?:number,clientY?:number):void;
}
export declare class IqRemoteCombobox extends HTMLElement {
  value:string;selectedOption:Option|null;options:Option[];
  provider:QueryProvider|null;debounce:number;controlled:boolean;
  disabled:boolean;readonly:boolean;readonly loading:boolean;readonly error:string;
  readonly validity:ValidityState|undefined;
  request(append?:boolean):Promise<void>;
  setResult(result:QueryResult,requestId?:number):boolean;
  setError(message:string,requestId?:number):boolean;
  close():void;checkValidity():boolean;reportValidity():boolean;
}
export declare class IqTagInput extends HTMLElement {
  value:string[];controlled:boolean;disabled:boolean;readonly:boolean;
  readonly pending:boolean;readonly error:string;readonly max:number;readonly maxLength:number;
}
export declare class IqDataChart extends HTMLElement {
  data:ChartData;type:'line'|'bar';state:Exclude<SurfaceState,'blocked'>;
  formatValue:(value:number)=>string;render():void;
}
export interface CropRect {x:number;y:number;width:number;height:number}
export interface CropExportOptions {size?:number;type?:'image/png'|'image/jpeg'|'image/webp';quality?:number}
export interface CropRequest {blob:Blob;crop:CropRect;signal:AbortSignal;accept():boolean;reject(message?:string):boolean}
export declare function cropRect(width:number,height:number,zoom?:number,x?:number,y?:number):CropRect;
export declare class IqImageCrop extends HTMLElement {
  content:Partial<{eyebrow:string;title:string;subtitle:string;placeholder:string}>;
  source:Blob|null;controlled:boolean;disabled:boolean;readonly:boolean;aspectRatio:number;
  readonly pending:boolean;readonly loading:boolean;readonly error:string;
  get value():CropRect|null;set value(value:CropRect);
  load(source:Blob|null):Promise<boolean>;
  export(options?:CropExportOptions):Promise<Blob>;
  request():Promise<void>;
}
declare global {
  interface HTMLElementTagNameMap {
    'iq-roadmap':IqRoadmap;'iq-graph':IqGraph;'iq-remote-combobox':IqRemoteCombobox;
    'iq-tag-input':IqTagInput;'iq-data-chart':IqDataChart;'iq-image-crop':IqImageCrop;
  }
}
