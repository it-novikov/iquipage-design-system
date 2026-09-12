import type {Effect,Milestone,PlanningCommand,PlanningRow,Release,Selection,TemporalConstraint} from '../../contracts/planning.js';
import {requireCondition} from './errors.js';

export interface TaskState extends Omit<PlanningRow,'effectiveReleaseId'|'assignmentSourceId'|'boardEligible'|'childCount'> {}
export interface PlanningState {tasks:TaskState[];releases:Release[];milestones:Milestone[];constraints:TemporalConstraint[]}
export interface HistoryItem {before:PlanningRow;task:PlanningRow;outcome:'baseline'|'accepted'|'transferred'|'deferred'}
export interface PlanResult {
  tasks:TaskState[];releases:Release[];effects:Effect[];selectedCount:number;
  history:{releaseId:string;kind:'started'|'closed'|'cancelled';items:HistoryItem[]}|null;
}

/** One resolver for Planning, board, previews and history. No document/UI dependencies. */
export function projectRows(state:PlanningState):PlanningRow[] {
  const tasks=new Map(state.tasks.map(t=>[t.id,t]));
  const releases=new Map(state.releases.map(r=>[r.id,r]));
  const resolved=new Map<string,{releaseId:string|null;sourceId:string|null}>();
  const children=new Map<string,number>();
  for(const t of tasks.values())if(t.parentId)children.set(t.parentId,(children.get(t.parentId)||0)+1);
  for(const task of tasks.values()){
    const chain:TaskState[]=[],visiting=new Set<string>();let current:TaskState|undefined=task;
    let value:{releaseId:string|null;sourceId:string|null}={releaseId:null,sourceId:null};
    while(current){
      requireCondition(!visiting.has(current.id),422,'TASK_CYCLE','Связь создаёт цикл задач.');
      visiting.add(current.id);
      const known=resolved.get(current.id);if(known){value=known;break;}
      chain.push(current);
      if(current.assignmentMode!=='inherit'){
        value={releaseId:current.assignmentMode==='assigned'?current.releaseId:null,sourceId:current.id};break;
      }
      if(!current.parentId)break;
      current=tasks.get(current.parentId);
      requireCondition(current,422,'TASK_PARENT','Родительская задача недоступна.');
    }
    for(const item of chain)resolved.set(item.id,value);
  }
  // Cycle detection is also required where explicit assignment terminates inheritance early.
  const complete=new Set<string>();
  for(const task of tasks.values()){
    const seen=new Set<string>();let current:TaskState|undefined=task;
    while(current&&!complete.has(current.id)){
      requireCondition(!seen.has(current.id),422,'TASK_CYCLE','Связь создаёт цикл задач.');seen.add(current.id);
      if(!current.parentId)break;
      current=tasks.get(current.parentId);requireCondition(current,422,'TASK_PARENT','Родительская задача недоступна.');
    }
    for(const id of seen)complete.add(id);
  }
  return state.tasks.map(t=>{
    const effective=resolved.get(t.id)!;
    if(effective.releaseId)requireCondition(releases.has(effective.releaseId),422,'TASK_RELEASE','Релиз недоступен.');
    const release=effective.releaseId?releases.get(effective.releaseId):null;
    return {...t,effectiveReleaseId:effective.releaseId,assignmentSourceId:effective.sourceId,
      boardEligible:t.preparation==='ready'&&t.result==='open'&&(release?release.lifecycle==='active':t.admitted),childCount:children.get(t.id)||0};
  });
}

function selected(selection:Selection,rows:PlanningRow[]):Set<string> {
  if(selection.kind==='tasks'){
    const ids=new Set(selection.ids),available=new Set(rows.map(r=>r.id));
    requireCondition([...ids].every(id=>available.has(id)),404,'TASK_NOT_FOUND','Одна или несколько задач недоступны.');return ids;
  }
  return new Set(rows.filter(t=>selection.kind==='project'||(selection.kind==='unassigned'?t.effectiveReleaseId===null:t.effectiveReleaseId===selection.releaseId)).map(t=>t.id));
}
function open(task:TaskState){requireCondition(task.result==='open',409,'RESULT_PINNED','Принятый результат закреплён в истории.');}
function mutableRelease(release:Release|undefined):asserts release is Release{
  requireCondition(release&&!release.archivedAt,422,'RELEASE_UNAVAILABLE','Релиз недоступен.');
  requireCondition(['planned','active'].includes(release.lifecycle),409,'RELEASE_FINISHED','Релиз уже завершён.');
}

export function planChange(original:PlanningState,command:PlanningCommand):PlanResult {
  const state=structuredClone(original),before=projectRows(original),beforeById=new Map(before.map(t=>[t.id,t]));
  const tasks=new Map(state.tasks.map(t=>[t.id,t])),releases=new Map(state.releases.map(r=>[r.id,r]));
  let selection=new Set<string>(),history:PlanResult['history']=null,historyRows:PlanningRow[]=[];
  if('selection' in command){selection=selected(command.selection,before);requireCondition(selection.size,422,'EMPTY_SELECTION','Выберите задачи.');}
  switch(command.kind){
    case 'prepare':
      for(const id of selection){const t=tasks.get(id)!;open(t);t.preparation=command.preparation;}break;
    case 'admission':
      for(const id of selection){const t=tasks.get(id)!;open(t);
        requireCondition(beforeById.get(id)!.effectiveReleaseId===null,409,'RELEASE_ADMISSION','Допуск этой задачи определяется релизом.');
        requireCondition(!command.admitted||t.preparation==='ready',409,'TASK_NOT_PREPARED','Сначала подготовьте задачу.');t.admitted=command.admitted;
      }break;
    case 'assign': {
      if(command.assignment.mode==='assigned')mutableRelease(releases.get(command.assignment.releaseId));
      // Normalize overlapping inherited subtrees without overwriting explicit child exclusions/overrides.
      for(const id of selection){
        const t=tasks.get(id)!;open(t);
        if(t.assignmentMode==='inherit'&&t.parentId&&selection.has(t.parentId))continue;
        t.assignmentMode=command.assignment.mode;t.releaseId=command.assignment.mode==='assigned'?command.assignment.releaseId:null;t.admitted=false;
      }break;
    }
    case 'reparent': {
      const t=tasks.get(command.taskId);requireCondition(t,404,'TASK_NOT_FOUND','Задача недоступна.');open(t);
      requireCondition(command.parentId===null||tasks.has(command.parentId),422,'TASK_PARENT','Родительская задача недоступна.');
      t.parentId=command.parentId;selection.add(t.id);break;
    }
    case 'bulk':
      for(const id of selection){const t=tasks.get(id)!;open(t);Object.assign(t,command.fields);}break;
    case 'release.edit': {
      const r=releases.get(command.releaseId);mutableRelease(r);Object.assign(r,command.value);break;
    }
    case 'start': {
      const r=releases.get(command.releaseId);mutableRelease(r);
      requireCondition(r.lifecycle==='planned',409,'RELEASE_STATE','Запустить можно только запланированный релиз.');
      r.lifecycle='active';historyRows=before.filter(t=>t.effectiveReleaseId===r.id);history={releaseId:r.id,kind:'started',items:[]};break;
    }
    case 'close':case 'cancel': {
      const r=releases.get(command.releaseId);mutableRelease(r);
      requireCondition(command.kind==='cancel'||r.lifecycle==='active',409,'RELEASE_STATE','Закрыть можно только активный релиз.');
      const members=before.filter(t=>t.effectiveReleaseId===r.id),memberIds=new Set(members.map(t=>t.id));
      const accepted=command.kind==='close'?selected(command.accepted,before):new Set<string>();
      requireCondition([...accepted].every(id=>memberIds.has(id)),422,'ACCEPT_OUTSIDE_RELEASE','Принять можно только задачи этого релиза.');
      for(const id of accepted){const t=tasks.get(id)!;
        requireCondition(t.status==='ready_for_release'&&t.preparation==='ready',422,'RESULT_NOT_READY','Для принятия задача должна быть подготовлена и готова к релизу.');
        t.result='accepted';t.assignmentMode='assigned';t.releaseId=r.id;t.admitted=false;
      }
      const remainder=members.filter(t=>tasks.get(t.id)!.result==='open');
      let target:string|null=null;
      if(command.destination.kind==='release'){
        requireCondition(command.destination.releaseId!==r.id,422,'SAME_RELEASE','Выберите другой релиз для остатка.');
        const recipient=releases.get(command.destination.releaseId);mutableRelease(recipient);target=recipient.id;
      }else if(command.destination.kind==='new'){
        requireCondition(!releases.has(command.destination.id),409,'RELEASE_EXISTS','Релиз с таким идентификатором уже существует.');
        requireCondition(remainder.length>0,422,'NO_REMAINDER','Для нового релиза нет незавершённого остатка.');
        const recipient:Release={...command.destination.value,id:command.destination.id,projectId:r.projectId,revision:0,scopeRevision:0,lifecycle:'planned',archivedAt:null};
        state.releases.push(recipient);releases.set(recipient.id,recipient);target=recipient.id;
      }
      const remainderIds=new Set(remainder.map(t=>t.id));
      for(const row of remainder){const t=tasks.get(row.id)!;
        if(!(t.assignmentMode==='inherit'&&t.parentId&&remainderIds.has(t.parentId))){t.assignmentMode=target?'assigned':'none';t.releaseId=target;}
        t.admitted=false;
      }
      r.lifecycle=command.kind==='close'?'closed':'cancelled';
      historyRows=members;history={releaseId:r.id,kind:command.kind==='close'?'closed':'cancelled',items:[]};
      selection=new Set(members.map(t=>t.id));break;
    }
  }
  for(const task of state.tasks){
    requireCondition(!task.plannedStart||!task.due||task.plannedStart<=task.due,422,'DATE_RANGE','Начало не может быть позже срока.');
  }
  const after=projectRows(state);
  for(const row of after){
    const prev=beforeById.get(row.id)!;
    if(row.effectiveReleaseId!==prev.effectiveReleaseId&&row.effectiveReleaseId)mutableRelease(releases.get(row.effectiveReleaseId));
    if(prev.result==='accepted')requireCondition(row.effectiveReleaseId===prev.effectiveReleaseId,409,'RESULT_PINNED','Принятый результат нельзя перенести.');
  }
  validateTemporal(state);
  const effects:Effect[]=after.filter(row=>JSON.stringify(row)!==JSON.stringify(beforeById.get(row.id))).map(row=>({id:row.id,before:beforeById.get(row.id)!,after:row}));
  // Inherited membership and board admission are observable task changes too.
  for(const effect of effects){tasks.get(effect.id)!.revision++;effect.after.revision++;}
  const changedReleaseIds=new Set<string>();
  for(const effect of effects){if(effect.before?.effectiveReleaseId)changedReleaseIds.add(effect.before.effectiveReleaseId);if(effect.after.effectiveReleaseId)changedReleaseIds.add(effect.after.effectiveReleaseId);}
  const changedReleases=state.releases.filter(r=>changedReleaseIds.has(r.id)||JSON.stringify(r)!==JSON.stringify(original.releases.find(old=>old.id===r.id)));
  for(const release of changedReleases){release.revision++;release.scopeRevision++;}
  if(history){
    const finalById=new Map(after.map(t=>[t.id,t]));
    history.items=historyRows.map(previous=>{const task=finalById.get(previous.id)!;
      return {before:previous,task,outcome:history!.kind==='started'?'baseline':task.result==='accepted'?'accepted':task.effectiveReleaseId?'transferred':'deferred'};
    });
  }
  return {tasks:effects.map(e=>tasks.get(e.id)!),releases:changedReleases,effects,selectedCount:selection.size,history};
}

export function validateTemporal(state:PlanningState){
  const dates=new Map<string,{start:string|null;end:string|null}>();
  for(const t of state.tasks)dates.set('task:'+t.id,{start:t.plannedStart,end:t.due});
  for(const r of state.releases)dates.set('release:'+r.id,{start:r.plannedStart,end:r.plannedEnd});
  for(const m of state.milestones)dates.set('milestone:'+m.id,{start:m.date,end:m.date});
  const edges=new Map<string,string[]>(),indegree=new Map([...dates.keys()].map(id=>[id,0]));
  for(const c of state.constraints){
    const source=c.source.kind+':'+c.source.id,target=c.target.kind+':'+c.target.id;
    const a=dates.get(source),b=dates.get(target);
    requireCondition(a&&b,422,'TEMPORAL_REFERENCE','Связанная запись недоступна.');
    edges.set(source,[...(edges.get(source)||[]),target]);indegree.set(target,indegree.get(target)!+1);
    const left=c.relation[0]==='F'?a.end:a.start,right=c.relation[1]==='F'?b.end:b.start;
    if(left&&right)requireCondition(Date.parse(right)-Date.parse(left)>=c.lagDays*86400000,409,'TEMPORAL_CONFLICT','Даты противоречат зависимости. Измените их явно.');
  }
  const queue=[...indegree].filter(([,degree])=>degree===0).map(([id])=>id);
  for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i]!)||[]){indegree.set(next,indegree.get(next)!-1);if(indegree.get(next)===0)queue.push(next);}
  requireCondition(queue.length===dates.size,422,'TEMPORAL_CYCLE','Зависимость создаёт цикл.');
}
