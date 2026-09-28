/** Types for cluster-guard.mjs: lifetime guards for the runner's synthetic PostgreSQL clusters. */
export declare const RUNNER_FILE:'runner.json';
export declare function isOwnedDir(dir:string,root?:string):boolean;
export declare function alive(pid:number):boolean;
export declare function writeOwner(dir:string,options?:{root?:string;pid?:number}):void;
export declare function stopCluster(dir:string,options?:{bin?:string;root?:string}):void;
export declare function sweepOrphans(options?:{bin?:string;root?:string;exclude?:string|null}):string[];
export declare function startGuard(options:{dir:string;bin:string;root?:string;pid?:number;interval?:number}):import('node:child_process').ChildProcess;
export declare function watchParent(onGone:()=>void,options?:{interval?:number}):()=>void;
