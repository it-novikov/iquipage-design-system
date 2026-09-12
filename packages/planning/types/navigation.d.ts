/** Host context projection, not tenant authentication or a second identity store. */
export interface ProjectContext {
  id: string;
  workspaceName: string;
  projectName: string;
}
export interface ProjectChoiceQuery {query:string;cursor:string|null;signal:AbortSignal;requestId:number}
export interface ProjectChoicePage {options:{value:string;label:string;description?:string;disabled?:boolean}[];nextCursor:string|null}
export interface NavigationOptions {
  current:ProjectContext;
  profile:{name:string;initials?:string};
  projects:(query:ProjectChoiceQuery)=>ProjectChoicePage|Promise<ProjectChoicePage>;
  onSwitch:(id:string)=>ProjectContext|false|Promise<ProjectContext|false>;
  onAccount?:()=>void;
  onSignOut?:()=>void;
  onSettings?:()=>void;
  onTeam?:()=>void;
  onTheme?:()=>void;
}
export interface ProjectNavigation {
  update(context:ProjectContext):void;
  readyToLeave():boolean;
  destroy():boolean;
}
export declare function mountProjectNavigation(root:HTMLElement,options:NavigationOptions):ProjectNavigation;
