import type {Repository} from './index.js';
export type FileVariant='original'|'thumb'|'display';
export interface AttachmentTarget {id:string;projectId:string;taskId:string}
export interface AttachmentMetadata extends AttachmentTarget {
  name:string;mime:string;size:number;sha256:string;image:boolean;
  actorId:string;state:'staged'|'attached'|'detached';revision:number;
  createdAt:string;expiresAt:string;updatedAt?:string;
  width?:number;height?:number;previewMime?:'image/webp';
}
export interface UploadProgress {
  phase:'preparing'|'uploading'|'processing'|'saving';loaded?:number;total?:number|null;
}
export interface AttachmentAdapter {
  upload(target:AttachmentTarget,file:File,options?:{signal?:AbortSignal;onProgress?:(progress:UploadProgress)=>void}):Promise<AttachmentMetadata>;
  describe(target:AttachmentTarget,options?:{signal?:AbortSignal}):Promise<AttachmentMetadata>;
  blob(target:AttachmentTarget&{variant:FileVariant},options?:{signal?:AbortSignal}):Promise<Blob>;
  discard(target:AttachmentTarget):Promise<boolean>;
  collect?(at?:number):Promise<number>;
}
/** Same-origin reference adapter; production authentication belongs to the host. */
export declare class HttpAttachmentAdapter implements AttachmentAdapter {
  constructor(baseURL?:string);
  upload:AttachmentAdapter['upload'];describe:AttachmentAdapter['describe'];
  blob:AttachmentAdapter['blob'];discard:AttachmentAdapter['discard'];
}
/** Browser-only local reference; the host supplies the repository instance. */
export declare class BrowserAttachmentAdapter implements AttachmentAdapter {
  constructor(repository:Repository&{ready:Promise<IDBDatabase>;context:{actorId:string;workspaceId:string}});
  upload:AttachmentAdapter['upload'];describe:AttachmentAdapter['describe'];
  blob:AttachmentAdapter['blob'];discard:AttachmentAdapter['discard'];
  collect(at?:number):Promise<number>;
}
