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
