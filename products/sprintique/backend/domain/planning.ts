import type {Effect,Milestone,PlanningCommand,PlanningRow,Release,Selection,TemporalConstraint,ReleaseData} from '../../contracts/planning.js';
import {ReleaseValue} from '../../contracts/planning.js';
import {requireCondition} from './errors.js';
import type {TaskData} from '../../contracts/index.js';
import {requireOpenTask,validateTaskHierarchy} from './task-invariants.js';

export interface TaskState extends Omit<PlanningRow,'effectiveReleaseId'|'assignmentSourceId'|'boardEligible'|'childCount'> {}
export interface PlanningState {tasks:TaskState[];releases:Release[];milestones:Milestone[];constraints:TemporalConstraint[];dependencies?:{id:string;fromId:string;toId:string}[];defaults?:{format:'flexible'|'timeboxed';days:number;timezone:string};creation?:{projectId:string;key:string;number:number;createdAt:string}}
export interface HistoryItem {before:PlanningRow;task:PlanningRow;outcome:'baseline'|'accepted'|'transferred'|'deferred'}
export interface PlanResult {
  taskContent:{id:string;value:TaskData}|null;
  createdTask:{id:string;projectId:string;number:number;createdAt:string}|null;
  tasks:TaskState[];releases:Release[];effects:Effect[];selectedCount:number;
  milestones:Milestone[];constraints:TemporalConstraint[];removedConstraints:string[];defaults:NonNullable<PlanningState['defaults']>|null;details:{label:string;description:string}[];
  history:{releaseId:string;kind:'started'|'closed'|'cancelled';items:HistoryItem[]}|null;
}

/** One resolver for Planning, board, previews and history. No document/UI dependencies. */
export function projectRows(state:PlanningState):PlanningRow[] {
  validateTaskHierarchy(state.tasks);
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
  return state.tasks.map(t=>{
    const effective=resolved.get(t.id)!;
    if(effective.releaseId)requireCondition(releases.has(effective.releaseId),422,'TASK_RELEASE','Релиз недоступен.');
    const release=effective.releaseId?releases.get(effective.releaseId):null;
    return {...t,effectiveReleaseId:effective.releaseId,assignmentSourceId:effective.sourceId,
      boardEligible:t.preparation==='ready'&&t.result==='open'&&(release?release.lifecycle==='active':t.admitted),childCount:children.get(t.id)||0};
  });
}

export function selected(selection:Selection,rows:PlanningRow[],releases:Release[]=[]):Set<string> {
  if(selection.kind==='tasks'){
    const ids=new Set(selection.ids),available=new Set(rows.map(r=>r.id));
    requireCondition([...ids].every(id=>available.has(id)),404,'TASK_NOT_FOUND','Одна или несколько задач недоступны.');return ids;
  }
  if(selection.kind==='filter'){
    const f=selection.filter,roots=f.roots?new Set(f.roots):null,byId=new Map(rows.map(r=>[r.id,r]));
    const matchingReleases=new Set(f.matchReleaseNames&&f.q?releases.filter(r=>r.name.toLocaleLowerCase().includes(f.q.toLocaleLowerCase())).map(r=>r.id):[]);
    if(roots)requireCondition([...roots].every(id=>byId.has(id)),404,'TASK_NOT_FOUND','Выбранная задача недоступна.');
    return new Set(rows.filter(t=>{
      if(roots){let parent:PlanningRow|undefined=t,found=false;while(parent){if(roots.has(parent.id)){found=true;break;}parent=parent.parentId?byId.get(parent.parentId):undefined;}if(!found)return false;}
      return (!f.q||(t.title+' '+t.displayId).toLocaleLowerCase().includes(f.q.toLocaleLowerCase())||!!t.effectiveReleaseId&&matchingReleases.has(t.effectiveReleaseId))
        &&(f.preparation==='all'||t.preparation===f.preparation)&&(!f.owner||(f.owner==='__none__'?!t.owner:t.owner===f.owner))
        &&(f.releaseId===undefined||t.effectiveReleaseId===f.releaseId)
        &&(!f.tagIds.length||(f.tagMode==='all'?f.tagIds.every(id=>t.tagIds.includes(id)):f.tagIds.some(id=>t.tagIds.includes(id))))
        &&(!f.candidates||(t.preparation==='ready'&&t.status==='ready_for_release'&&t.result==='open'))&&(!f.openOnly||t.result==='open');
    }).map(t=>t.id));
  }
  return new Set(rows.filter(t=>selection.kind==='project'||(selection.kind==='unassigned'?t.effectiveReleaseId===null:t.effectiveReleaseId===selection.releaseId)).map(t=>t.id));
}
const open = requireOpenTask;
function mutableRelease(release:Release|undefined):asserts release is Release{
  requireCondition(release&&!release.archivedAt,422,'RELEASE_UNAVAILABLE','Релиз недоступен.');
  requireCondition(['planned','active'].includes(release.lifecycle),409,'RELEASE_FINISHED','Релиз уже завершён.');
}

function schedule(state:PlanningState,command:Extract<PlanningCommand,{kind:'schedule'|'constraint'|'constraint.remove'}>){
  if(command.kind==='constraint.remove'){
    requireCondition(state.constraints.some(c=>c.id===command.id),404,'CONSTRAINT_NOT_FOUND','Зависимость недоступна.');
    state.constraints=state.constraints.filter(c=>c.id!==command.id);return;
  }
  if(command.kind==='constraint'){
    const previous=state.constraints.find(c=>c.id===command.id);
    state.constraints=state.constraints.filter(c=>c.id!==command.id).concat({...command.value,id:command.id,revision:(previous?.revision||0)+1});return;
  }
  const {entity,plannedStart,plannedEnd,deadline}=command;
  requireCondition(!plannedStart||!plannedEnd||plannedStart<=plannedEnd,422,'DATE_RANGE','Начало не может быть позже окончания.');
  if(entity.kind==='task'){
    const t=state.tasks.find(t=>t.id===entity.id);requireCondition(t,404,'TASK_NOT_FOUND','Задача недоступна.');open(t);
    t.plannedStart=plannedStart;t.plannedEnd=plannedEnd;if(deadline!==undefined)t.due=deadline;
  }else if(entity.kind==='release'){
    const r=state.releases.find(r=>r.id===entity.id);mutableRelease(r);
    const value:ReleaseData={...r,plannedStart,plannedEnd,deadline:deadline===undefined?r.deadline:deadline};
    requireCondition(ReleaseValue.safeParse({name:value.name,format:value.format,plannedStart,plannedEnd,deadline:value.deadline}).success,422,'RELEASE_DATES','Для спринта нужны обе даты.');Object.assign(r,value);
  }else{
    const m=state.milestones.find(m=>m.id===entity.id);requireCondition(m,404,'MILESTONE_NOT_FOUND','Веха недоступна.');
    if(m.releaseId)mutableRelease(state.releases.find(r=>r.id===m.releaseId));
    requireCondition(plannedStart===plannedEnd,422,'MILESTONE_DATE','У вехи одна дата.');m.date=plannedStart;
  }
}

export function planChange(original:PlanningState,command:PlanningCommand):PlanResult {
  const state=structuredClone(original),before=projectRows(original),beforeById=new Map(before.map(t=>[t.id,t]));
  const tasks=new Map(state.tasks.map(t=>[t.id,t])),releases=new Map(state.releases.map(r=>[r.id,r]));
  let selection=new Set<string>(),history:PlanResult['history']=null,historyRows:PlanningRow[]=[];
  if('selection' in command){selection=selected(command.selection,before,state.releases);requireCondition(selection.size,422,'EMPTY_SELECTION','Выберите задачи.');}
  switch(command.kind){
    case 'task.create':{
      requireCondition(state.creation,503,'CREATION_CONTEXT','Контекст создания недоступен.');requireCondition(!tasks.has(command.taskId),409,'CONFLICT','Задача уже создана.');
      if(command.task.releaseId)mutableRelease(releases.get(command.task.releaseId));
      const {description,...fields}=command.task;
      const t:TaskState={...fields,id:command.taskId,revision:0,displayId:state.creation.key+'-'+state.creation.number,preparation:command.createInBoard?'ready':'draft',admitted:command.createInBoard,
        result:'open',plannedStart:null,plannedEnd:null,assignmentMode:fields.releaseId?'assigned':'inherit',createdAt:state.creation.createdAt,statusEnteredAt:state.creation.createdAt};
      tasks.set(t.id,t);state.tasks.push(t);selection.add(t.id);break;
    }
    case 'task.edit':{
      const t=tasks.get(command.taskId);requireCondition(t,404,'TASK_NOT_FOUND','Задача недоступна.');open(t);
      requireCondition(t.revision===command.baseRevision,409,'CONFLICT','Задача уже изменена. Обновите её перед сохранением.');
      if(command.task.releaseId!==t.releaseId){if(command.task.releaseId)mutableRelease(releases.get(command.task.releaseId));t.assignmentMode=command.task.releaseId?'assigned':'none';t.admitted=false;}
      const {description,...fields}=command.task;Object.assign(t,fields);selection.add(t.id);break;
    }
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
      for(const id of selection){const t=tasks.get(id)!;open(t);const {addTagIds,...fields}=command.fields;Object.assign(t,fields);
        if(addTagIds)t.tagIds=[...new Set([...t.tagIds,...addTagIds])].sort();requireCondition(t.tagIds.length<=30,422,'TASK_TAG_LIMIT','У задачи может быть не более 30 тегов.');}break;
    case 'release.edit': {
      const r=releases.get(command.releaseId);mutableRelease(r);Object.assign(r,command.value);break;
    }
    case 'release.create': {
      requireCondition(!releases.has(command.releaseId),409,'RELEASE_EXISTS','Релиз уже существует.');
      const release:Release={...command.value,id:command.releaseId,projectId:command.projectId,revision:0,scopeRevision:0,lifecycle:'planned',archivedAt:null};
      state.releases.push(release);releases.set(release.id,release);break;
    }
    case 'schedule':case 'constraint':case 'constraint.remove':schedule(state,command);break;
    case 'schedule.batch':for(const action of command.actions)schedule(state,action);break;
    case 'milestone':{
      if(command.value.releaseId)mutableRelease(releases.get(command.value.releaseId));
      const previous=state.milestones.find(m=>m.id===command.id);
      if(previous?.releaseId)mutableRelease(releases.get(previous.releaseId));
      state.milestones=state.milestones.filter(m=>m.id!==command.id).concat({...command.value,id:command.id,revision:previous?.revision||0});break;
    }
    case 'settings':state.defaults=command.value;break;
    case 'shift':{
      mutableRelease(releases.get(command.releaseId));
      const shift=(value:string|null|undefined)=>{if(!value)return null;const day=new Date(Date.parse(value)+command.days*86400000).toISOString().slice(0,10);requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(day),422,'DATE_RANGE','Дата вне допустимого диапазона.');return day;};
      for(const row of before.filter(t=>t.result==='open'&&t.effectiveReleaseId===command.releaseId)){
        const t=tasks.get(row.id)!;t.plannedStart=shift(t.plannedStart);t.plannedEnd=shift(t.plannedEnd);selection.add(t.id);
      }break;
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
      const accepted=command.kind==='close'?selected(command.accepted,before,state.releases):new Set<string>();
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
      for(const [id,destination] of Object.entries(command.overrides||{})){
        requireCondition(remainderIds.has(id),422,'OVERRIDE_NOT_REMAINDER','Отдельное назначение допустимо только для незавершённого остатка.');
        if(destination){requireCondition(destination!==r.id,422,'SAME_RELEASE','Выберите другой релиз.');mutableRelease(releases.get(destination));}
      }
      for(const row of remainder){const t=tasks.get(row.id)!;
        if(Object.hasOwn(command.overrides||{},t.id)){const override=command.overrides![t.id]!;t.assignmentMode=override?'assigned':'none';t.releaseId=override;}
        else if(!(t.assignmentMode==='inherit'&&t.parentId&&remainderIds.has(t.parentId))){t.assignmentMode=target?'assigned':'none';t.releaseId=target;}
        t.admitted=false;
      }
      r.lifecycle=command.kind==='close'?'closed':'cancelled';
      historyRows=members;history={releaseId:r.id,kind:command.kind==='close'?'closed':'cancelled',items:[]};
      selection=new Set(members.map(t=>t.id));break;
    }
  }
  for(const task of state.tasks){
    requireCondition(!task.plannedStart||!task.plannedEnd||task.plannedStart<=task.plannedEnd,422,'DATE_RANGE','Начало не может быть позже окончания.');
  }
  const after=projectRows(state);
  for(const row of after){
    const prev=beforeById.get(row.id)!;
    if(row.effectiveReleaseId!==prev?.effectiveReleaseId&&row.effectiveReleaseId)mutableRelease(releases.get(row.effectiveReleaseId));
    if(prev?.result==='accepted')requireCondition(row.effectiveReleaseId===prev.effectiveReleaseId,409,'RESULT_PINNED','Принятый результат нельзя перенести.');
  }
  validateTemporal(state);
  const effects:Effect[]=after.filter(row=>command.kind==='task.edit'&&row.id===command.taskId||JSON.stringify(row)!==JSON.stringify(beforeById.get(row.id))).map(row=>({id:row.id,before:beforeById.get(row.id)||null,after:row}));
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
  const milestones=state.milestones.filter(m=>JSON.stringify(m)!==JSON.stringify(original.milestones.find(old=>old.id===m.id)));
  for(const m of milestones)m.revision=(original.milestones.find(old=>old.id===m.id)?.revision||0)+1;
  const constraints=state.constraints.filter(c=>JSON.stringify(c)!==JSON.stringify(original.constraints.find(old=>old.id===c.id)));
  const removedConstraints=original.constraints.filter(c=>!state.constraints.some(next=>next.id===c.id)).map(c=>c.id);
  const defaults=JSON.stringify(state.defaults)!==JSON.stringify(original.defaults)?state.defaults||null:null;
  const lifecycleLabels={planned:'Запланирован',active:'Начат',closed:'Завершён',cancelled:'Отменён'};
  const details=[...changedReleases.map(r=>({label:r.name,description:`${lifecycleLabels[r.lifecycle]}: ${r.plannedStart||'без начала'} — ${r.plannedEnd||'без окончания'}; дедлайн ${r.deadline||'не задан'}`})),
    ...milestones.map(m=>({label:m.title,description:`Веха: ${m.date||'без даты'}`})),...constraints.map(c=>({label:'Зависимость',description:`${c.source.id} → ${c.target.id}: ${c.relation}, ${c.lagDays} дн.`})),
    ...removedConstraints.map(id=>({label:'Удалить зависимость',description:id})),...(defaults?[{label:'Настройки планирования',description:`${defaults.format==='timeboxed'?'Спринт':'Релиз'}, ${defaults.days} дн., ${defaults.timezone}`}]:[]),
    ...effects.filter(e=>e.after.plannedEnd&&e.after.due&&e.after.plannedEnd>e.after.due).map(e=>({label:`Риск срока · ${e.after.displayId}`,description:`Плановое окончание ${e.after.plannedEnd} позже дедлайна ${e.after.due}. Дедлайн не сдвигается автоматически.`}))];
  return {createdTask:command.kind==='task.create'?{id:command.taskId,projectId:state.creation!.projectId,number:state.creation!.number,createdAt:state.creation!.createdAt}:null,
    taskContent:command.kind==='task.edit'||command.kind==='task.create'?{id:command.taskId,value:command.task}:null,tasks:effects.map(e=>tasks.get(e.id)!),releases:changedReleases,effects,selectedCount:selection.size,history,milestones,constraints,removedConstraints,defaults,details};
}

export function validateTemporal(state:PlanningState){
  requireCondition(state.tasks.length<=10000&&state.releases.length<=1000&&state.milestones.length<=10000&&state.constraints.length<=10000&&(state.dependencies?.length||0)<=10000,422,'PROJECT_LIMIT','Лимит проекта: 10 000 задач, вех и связей, 1000 релизов.');
  const dates=new Map<string,{start:string|null;end:string|null}>();
  for(const t of state.tasks)dates.set('task:'+t.id,{start:t.plannedStart,end:t.plannedEnd===undefined?t.due:t.plannedEnd});
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
  // A logical "depends on" edge points in the reverse direction of its predecessor constraint.
  // Both surfaces share one DAG invariant; otherwise either API could close the other's cycle.
  for(const link of state.dependencies||[]){const source='task:'+link.toId,target='task:'+link.fromId;
    requireCondition(dates.has(source)&&dates.has(target),422,'TASK_REFERENCE','Связанные задачи недоступны.');
    edges.set(source,[...(edges.get(source)||[]),target]);indegree.set(target,indegree.get(target)!+1);
  }
  const queue=[...indegree].filter(([,degree])=>degree===0).map(([id])=>id);
  for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i]!)||[]){indegree.set(next,indegree.get(next)!-1);if(indegree.get(next)===0)queue.push(next);}
  requireCondition(queue.length===dates.size,422,'TEMPORAL_CYCLE','Зависимость создаёт цикл.');
}
