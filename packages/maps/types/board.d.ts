import type {Repository} from './index.js';
export type BoardSort = 'priority' | 'due' | 'created' | 'manual';
export interface BoardViewState {sort?:BoardSort;query?:string;collapsed?:string[];x?:number;y?:number}
export interface BoardConfig {
  repository:Repository;
  project:{id:string;name?:string};
  canEdit?:boolean;
  viewState?:BoardViewState;
}
export interface BoardHandle {
  reload():Promise<void>;
  readyToLeave():Promise<boolean>;
  destroy():void;
}
/** Browser-only reusable feature. Authentication and authoritative permissions belong to the host. */
export declare function mountTaskBoard(root:HTMLElement,config:BoardConfig):Promise<BoardHandle>;
