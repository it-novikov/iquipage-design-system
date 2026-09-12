import {mountPlanning, type PlanningAdapter, type GroupPage, type PlanningIntent} from '../types/index.js';
declare const adapter:PlanningAdapter;
const result = mountPlanning(document.createElement('div'),{adapter,project:{id:'p',name:'Project'},onOpenTask:()=>({close(){}}),onCreateTask:()=>({close(){}}),onCreateRelease:()=>({close(){}})});
result.then(view=>{view.readyToLeave();view.destroy();});
const intent:PlanningIntent={kind:'move',taskIds:['a'],groupId:'release'};void intent;
// @ts-expect-error Universal arbitrary record writes are not part of the consumer port.
adapter.write('tasks',{});
// @ts-expect-error Consumer cannot send an untyped action.
const invalid:PlanningIntent={kind:'sql',query:'anything'};void invalid;
const page:GroupPage={protocol:'sprintique.planning-view/1',projectId:'p',revision:'1',items:[],nextCursor:null,capabilities:{move:true}};void page;

const close:PlanningIntent={kind:'close',groupId:'r',acceptAllCandidates:true,newRelease:{name:'Next',format:'flexible',start:null,end:null,deadline:null}};
const cancel:PlanningIntent={kind:'cancel',groupId:'r',destinationId:'backlog'};
const cycle:PlanningIntent={kind:'editRelease',groupId:'r',values:{name:'Period',format:'timeboxed',start:'2026-09-12',end:'2026-09-25',deadline:null}};
const dates:PlanningIntent={kind:'batch',expectedProjectionRevision:'v2',actions:[{kind:'schedule',entityKind:'task',entityId:'t',values:{start:'2026-09-12',end:'2026-09-15'}}]};
const dependency:PlanningIntent={kind:'temporal',values:{fromId:'a',toId:'b',type:'FS',lagDays:0}};
const allMatching:PlanningIntent={kind:'prepare',selectionToken:'opaque-selection'};
void [close,cancel,cycle,dates,dependency,allMatching];
// @ts-expect-error A selection is either explicit IDs or a server snapshot, never both.
const ambiguous:PlanningIntent={kind:'prepare',selectionToken:'snapshot',taskIds:['t']};void ambiguous;
// @ts-expect-error Batch is only the bounded supported set of temporal actions.
const nested:PlanningIntent={kind:'batch',actions:[{kind:'close',groupId:'r'}]};void nested;
// @ts-expect-error Merely closing a release does not expose a deployment command.
const deployment:PlanningIntent={kind:'deploy',groupId:'r'};void deployment;
