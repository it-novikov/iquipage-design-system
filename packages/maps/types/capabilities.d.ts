import type {BoardDocument,CreatableBoardObjectType,MapsUiCapabilities} from './index.js';
export declare const CREATABLE_BOARD_OBJECT_TYPES:readonly CreatableBoardObjectType[];
export declare function normalizeUiCapabilities(value?:Partial<Omit<MapsUiCapabilities,'allowedCreateTypes'>>&{allowedCreateTypes?:CreatableBoardObjectType[]}):Readonly<MapsUiCapabilities>;
export declare function assertDocumentTypesAllowed<T extends Pick<BoardDocument,'objects'>>(document:T,uiCapabilities:MapsUiCapabilities,message?:string):T;
