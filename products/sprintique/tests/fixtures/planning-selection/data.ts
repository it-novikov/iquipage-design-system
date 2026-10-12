import type {Container, ContainerRow, ContainersView} from '../../../contracts/planning-view.js';

function row(n:number):ContainerRow {
  return {
    id:`task-${n}`, key:`TEST-${n}`, title:`Проверить сохранность рабочего контекста и понятность следующего действия — задача ${n}`,
    kind:'task', type:'task', parentId:null, depth:0, status:n%3===0?'review':'ready', done:false,
    priority:'normal', ownerId:null, ownerLabel:'', due:null, estimate:{value:2,unit:'h'},
    estimateHours:2, estimatePoints:null, estimateMismatch:false, rank:n, revision:1, crumb:null,
    afterSprintEnd:false, noDue:true, rollup:null,
  };
}

function container(id:string,name:string,rows:ContainerRow[],kind:Container['kind']='sprint'):Container {
  return {
    id, name, kind, state:kind==='backlog'?'backlog':id==='current'?'active':'planned', goal:null,
    start:kind==='sprint'?'2026-10-12':null, end:kind==='sprint'?'2026-10-25':null, deadline:null, revision:1,
    summary:{total:rows.length,done:0,open:rows.length,estimateHours:rows.length*2,remainingHours:rows.length*2,estimatePoints:0,remainingPoints:0,noDue:rows.length},
    rows,
  };
}

// Deterministic frontend data only: no credentials, production data or claimed server mutations.
export const planningData:ContainersView = {
  protocol:'sprintique.planning-containers/1', projectId:'planning-layout-test', revision:'1', today:'2026-10-12',
  estimate:{format:'time',hoursPerDay:8,hoursPerWeek:40},
  capabilities:{plan:true,manageReleases:true,completeSprint:true}, completed:{count:0},
  containers:[
    container('current','Текущий спринт',Array.from({length:32},(_,i)=>row(i+1))),
    container('next','Следующий спринт с длинным названием для проверки меню',Array.from({length:8},(_,i)=>row(i+33))),
    container('backlog','Бэклог',Array.from({length:8},(_,i)=>row(i+41)),'backlog'),
  ],
};
