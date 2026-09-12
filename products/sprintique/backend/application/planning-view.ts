import {randomUUID} from 'node:crypto';
import type {Transaction,Actor} from '../infrastructure/database.js';
import {authorize,hash} from '../infrastructure/database.js';
import {requireCondition,Problem} from '../domain/errors.js';
import {projectRows,selected} from '../domain/planning.js';
import type {HistoryItem} from '../domain/planning.js';
import {PlanningCommand,SelectionFilter,ReleaseValue} from '../../contracts/planning.js';
import type {Selection,PlanningRow,Release,Effect} from '../../contracts/planning.js';
import {ViewFilters} from '../../contracts/planning-view.js';
import type {ViewIntent,ViewQuery,ViewRowsQuery,ViewSelectQuery,ViewOptionsQuery} from '../../contracts/planning-view.js';
import {planningLock,loadPlanningState,page,preview} from './planning.js';

const finished=(r:Release)=>['closed','cancelled'].includes(r.lifecycle);
const statusLabels:Record<string,string>={ready:'Готово к работе',in_progress:'В работе',review:'На проверке',ready_for_testing:'К тестированию',testing:'Тестирование',ready_for_release:'Готово к релизу'};
function taskChange(effect:Effect,releases:Release[]){
  const {before,after}=effect,parts:string[]=[];
  if(!before)parts.push('Создать задачу');
  if(before?.preparation!==after.preparation)parts.push(after.preparation==='ready'?'Подготовить к работе':'Сохранить черновиком');
  if(before?.effectiveReleaseId!==after.effectiveReleaseId)parts.push('Релиз: '+(releases.find(r=>r.id===after.effectiveReleaseId)?.name||'Бэклог'));
  if(before?.parentId!==after.parentId)parts.push(after.parentId?'Изменить родительскую задачу':'Убрать родительскую задачу');
  if(before?.boardEligible!==after.boardEligible)parts.push(after.boardEligible?'Появится на доске':'Уйдёт с доски');
  if(before?.result!==after.result)parts.push(after.result==='accepted'?'Результат принят':'Результат открыт');
  if(before?.plannedStart!==after.plannedStart||before?.plannedEnd!==after.plannedEnd)parts.push(`План: ${after.plannedStart||'без начала'} — ${after.plannedEnd||'без окончания'}`);
  if(before?.due!==after.due)parts.push('Дедлайн: '+(after.due||'не задан'));
  if(before?.owner!==after.owner)parts.push('Ответственный: '+(after.owner||'не назначен'));
  if(before?.priority!==after.priority)parts.push('Приоритет: '+({low:'Низкий',normal:'Обычный',high:'Высокий',critical:'Критичный'}[after.priority]||after.priority));
  if(before?.status!==after.status)parts.push('Состояние: '+(statusLabels[after.status]||after.status));
  if(JSON.stringify(before?.tagIds)!==JSON.stringify(after.tagIds))parts.push(`Теги: ${after.tagIds.length}`);
  if(JSON.stringify(before?.attachmentIds)!==JSON.stringify(after.attachmentIds)||before?.coverAttachmentId!==after.coverAttachmentId)parts.push('Обновить файлы и обложку');
  return {label:after.displayId+' · '+after.title,description:parts.join(' · ')||'Обновить содержимое задачи'};
}
const filterSelection=(f:ViewFilters,roots?:string[]):Selection=>({kind:'filter',filter:SelectionFilter.parse({q:f.query,matchReleaseNames:true,preparation:f.preparation,owner:f.owner,tagIds:f.tagIds,tagMode:f.tagMode,...(f.releaseId?{releaseId:f.releaseId==='backlog'?null:f.releaseId}:{}),...(roots?{roots}:{}),openOnly:true})});
async function context(tx:Transaction,actor:Actor,projectId:string){
  const {revision}=await planningLock(tx,actor,projectId),state=await loadPlanningState(tx,projectId);
  const access=await authorize(tx,actor,projectId,'tasks:read');
  const write=access.role!=='reader'&&(actor.kind==='human'||actor.capabilities.includes('tasks:write'));
  // The interactive UI has no agent-approval step. Agents use the canonical proposal API.
  const interactive=write&&actor.kind==='human';
  return {revision,state,rows:projectRows(state),write:interactive,admin:interactive&&access.role==='admin'};
}
async function finalSnapshots(tx:Transaction,projectId:string,releaseId:string){
  return new Map((await tx.query<{releaseId:string;items:HistoryItem[]}>(`SELECT DISTINCT ON (release_id) release_id AS "releaseId",items FROM app.release_snapshots
    WHERE project_id=$1 AND kind IN ('closed','cancelled') AND release_id=$2 ORDER BY release_id,created_at DESC,id DESC`,[projectId,releaseId])).rows.map(s=>[s.releaseId,s.items]));
}
function matches(f:ViewFilters,rows:PlanningRow[],releases:Release[]){
  const selection=filterSelection(f);if(selection.kind!=='filter')throw Error('Invalid selection');
  selection.filter.openOnly=false;
  return selected(selection,rows,releases);
}
const binding=(projectId:string,scope:string,value:unknown)=>hash(JSON.stringify([projectId,scope,value]));
const dateLabel=(r:Release)=>[r.plannedStart,r.plannedEnd].filter(Boolean).join(' — ');
export async function groups(tx:Transaction,actor:Actor,projectId:string,q:ViewQuery){
  const c=await context(tx,actor,projectId),filters=ViewFilters.strip().parse(q);
  const items:{id:string;title:string;state:string;total:number;matched:number;dateLabel:string;formatLabel:string}[]=[];
  // Process one bounded release snapshot at a time. Never materialize the entire history catalogue.
  for(const r of c.state.releases.filter(r=>!r.archivedAt&&finished(r)===(q.history==='closed')&&(!q.releaseId||r.id===q.releaseId))){
    const members=q.history==='closed'?((await finalSnapshots(tx,projectId,r.id)).get(r.id)||[]).map(i=>i.before):c.rows.filter(t=>t.effectiveReleaseId===r.id);
    items.push({id:r.id,title:r.name,state:r.lifecycle,total:members.length,matched:matches(filters,members,c.state.releases).size,dateLabel:dateLabel(r),formatLabel:r.format==='timeboxed'?'Спринт':'Релиз'});
  }
  items.sort((a,b)=>(a.state==='active'?0:1)-(b.state==='active'?0:1)||a.dateLabel.localeCompare(b.dateLabel)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  if(q.history==='current'&&(!q.releaseId||q.releaseId==='backlog')){const members=c.rows.filter(t=>!t.effectiveReleaseId);items.push({id:'backlog',title:'Бэклог',state:'backlog' as typeof items[number]['state'],total:members.length,matched:matches(filters,members,c.state.releases).size,dateLabel:'',formatLabel:''});}
  const p=page(items,binding(projectId,'groups',filters),c.revision,100,q.cursor||undefined);
  return {protocol:'sprintique.planning-view/1',projectId,revision:String(c.revision),items:p.items,nextCursor:p.nextCursor,matchedTotal:items.reduce((n,i)=>n+i.matched,0),
    capabilities:{createTask:c.write,createRelease:c.write,prepare:c.write,move:c.write,start:c.write,editRelease:c.write,close:c.write,cancel:c.write,bulk:c.write,selection:c.write,timeline:true,temporal:c.write,milestone:c.write,settings:c.admin}};
}
function orderedRows(rows:PlanningRow[],f:ViewFilters,matched:Set<string>,collapsed:string[]){
  const byId=new Map(rows.map(r=>[r.id,r])),include=new Set(matched),priority=['critical','high','normal','low'];
  const compare=(a:PlanningRow,b:PlanningRow)=>(f.sort==='priority'?priority.indexOf(a.priority)-priority.indexOf(b.priority):f.sort==='date'?(a.due||'9999').localeCompare(b.due||'9999'):a.rank-b.rank)||a.displayId.localeCompare(b.displayId,undefined,{numeric:true})||a.id.localeCompare(b.id);
  for(const id of matched){let p=byId.get(id)?.parentId;const visited=new Set<string>();while(p&&byId.has(p)&&!visited.has(p)){visited.add(p);include.add(p);p=byId.get(p)!.parentId;}}
  const children=new Map<string,PlanningRow[]>();for(const row of rows.filter(r=>include.has(r.id)).sort(compare)){const parent=row.parentId&&include.has(row.parentId)?row.parentId:'';children.set(parent,[...(children.get(parent)||[]),row]);}
  const filtering=!!(f.query||f.preparation!=='all'||f.owner||f.tagIds.length),folded=new Set(collapsed),result:{row:PlanningRow;depth:number}[]=[];
  const stack=(children.get('')||[]).toReversed().map(row=>({row,depth:0}));
  while(stack.length){const item=stack.pop()!;requireCondition(item.depth<=100,422,'HIERARCHY_DEPTH','Иерархия глубже 100 уровней не поддерживается.');result.push(item);
    if(filtering||!folded.has(item.row.id))stack.push(...(children.get(item.row.id)||[]).toReversed().map(row=>({row,depth:item.depth+1})));}
  return result;
}
export async function rows(tx:Transaction,actor:Actor,projectId:string,q:ViewRowsQuery){
  const c=await context(tx,actor,projectId);requireCondition(q.revision===String(c.revision),409,'CURSOR_STALE','Состав изменился. Обновите планирование.');
  const release=c.state.releases.find(r=>r.id===q.groupId),historical=!!release&&finished(release);
  requireCondition(q.groupId==='backlog'&&q.history==='current'||release&&!release.archivedAt&&historical===(q.history==='closed'),404,'NOT_FOUND','Группа недоступна.');
  const members=historical?((await finalSnapshots(tx,projectId,q.groupId)).get(q.groupId)||[]).map(i=>i.before):c.rows.filter(t=>(t.effectiveReleaseId||'backlog')===q.groupId);
  const f=ViewFilters.strip().parse(q),matched=matches(f,members,c.state.releases),memberIds=new Set(members.map(r=>r.id));
  const result=orderedRows(members,f,matched,q.collapsedTaskIds).map(({row:r,depth})=>({id:q.groupId+'/'+r.id,taskId:r.id,key:r.displayId,title:r.title,type:r.type,priority:r.priority,preparation:r.preparation,
    statusLabel:r.result==='accepted'?'Принята':statusLabels[r.status]||r.status,ownerLabel:r.owner,dateLabel:r.due||'',parentId:r.parentId,admission:r.admitted,outcome:r.result,revision:r.revision,
    depth,childrenCount:members.filter(t=>t.parentId===r.id).length,contextOnly:!matched.has(r.id),selectable:c.write&&!historical&&r.result==='open'&&matched.has(r.id),
    parentContext:r.parentId&&!memberIds.has(r.parentId)?c.rows.find(t=>t.id===r.parentId)?.displayId||'Родитель в другой группе':''}));
  const p=page(result,binding(projectId,'rows',[f,q.groupId,q.collapsedTaskIds]),c.revision,200,q.cursor||undefined);
  return {projectId,groupId:q.groupId,revision:String(c.revision),rows:p.items,nextCursor:p.nextCursor};
}
export async function selectMatching(tx:Transaction,actor:Actor,projectId:string,q:ViewSelectQuery){
  const c=await context(tx,actor,projectId);requireCondition(c.write&&q.history==='current',403,'READ_ONLY','Нельзя изменять историю.');
  // Store a canonical server selector, not an unbounded client-generated list.
  const selection=filterSelection(q,q.taskIds),count=selected(selection,c.rows,c.state.releases).size;
  const id=randomUUID();await tx.query(`INSERT INTO app.planning_selections(project_id,id,actor_id,credential_id,project_revision,filter,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '10 minutes')`,[projectId,id,actor.id,actor.credentialId,c.revision,JSON.stringify(selection)]);
  return {token:id,count,revision:String(c.revision)};
}
export async function options(tx:Transaction,actor:Actor,projectId:string,q:ViewOptionsQuery){
  const c=await context(tx,actor,projectId);let items:{value:string;label:string;description?:string;disabled?:boolean}[]=[];
  if(q.kind==='destinations')items=[{value:'backlog',label:'Бэклог'},...c.state.releases.filter(r=>!finished(r)&&!r.archivedAt&&r.id!==q.excludeId).map(r=>({value:r.id,label:r.name,description:dateLabel(r)}))];
  else if(q.kind==='tasks')items=c.rows.filter(t=>t.result==='open').map(t=>({value:t.id,label:t.displayId+' · '+t.title}));
  else if(q.kind==='owner')items=[{value:'__none__',label:'Не назначен'},...([...new Set(c.rows.map(t=>t.owner).filter(Boolean))].sort().map(name=>({value:name,label:name})))];
  else items=(await tx.query<{value:string;label:string}>('SELECT id AS value,name AS label FROM app.tags WHERE project_id=$1 AND archived_at IS NULL ORDER BY name,id',[projectId])).rows;
  items=items.filter(i=>i.label.toLocaleLowerCase().includes(q.query.toLocaleLowerCase()));
  const {cursor,...filters}=q,p=page(items,binding(projectId,'options',filters),c.revision,50,cursor||undefined);return {options:p.items,nextCursor:p.nextCursor};
}
export async function describeRelease(tx:Transaction,actor:Actor,projectId:string,groupId:string,cursor?:string){
  const c=await context(tx,actor,projectId),r=c.state.releases.find(r=>r.id===groupId);requireCondition(r,404,'NOT_FOUND','Релиз недоступен.');
  const snapshot=(await finalSnapshots(tx,projectId,groupId)).get(groupId),members=snapshot?snapshot.map(i=>i.before):c.rows.filter(t=>t.effectiveReleaseId===groupId);
  const items=members.map(t=>({id:t.id,key:t.displayId,title:t.title,outcome:t.result==='accepted'?'accepted':t.preparation==='ready'&&t.status==='ready_for_release'?'candidate':'unfinished',openChildren:c.rows.filter(ch=>ch.parentId===t.id&&ch.result==='open').length}));
  const p=page(items,binding(projectId,'release-items',groupId),c.revision,100,cursor),visible=new Set(p.items.map(t=>t.id));
  return {title:r.name,format:r.format,start:r.plannedStart,end:r.plannedEnd,deadline:r.deadline,nextCursor:p.nextCursor,revision:String(c.revision),
    counts:{total:items.length,accepted:items.filter(t=>t.outcome==='accepted').length,candidates:items.filter(t=>t.outcome==='candidate').length,unfinished:items.filter(t=>t.outcome==='unfinished').length},items:p.items,
    ...(snapshot?{snapshot:{name:r.name,accepted:snapshot.filter(t=>t.outcome==='accepted').length,carried:snapshot.filter(t=>t.outcome!=='accepted').length,items:snapshot.filter(t=>visible.has(t.before.id)).map(t=>({id:t.before.id,key:t.before.displayId,title:t.before.title,outcome:t.outcome}))}}:{})};
}
export async function settings(tx:Transaction,actor:Actor,projectId:string){const c=await context(tx,actor,projectId);return {...c.state.defaults,timeZone:c.state.defaults!.timezone};}
export async function timeline(tx:Transaction,actor:Actor,projectId:string,q:ViewQuery){
  const c=await context(tx,actor,projectId),matched=matches(q,c.rows,c.state.releases),releases=c.state.releases.filter(r=>!finished(r)&&!r.archivedAt&&(!q.releaseId||r.id===q.releaseId));
  const records=[...releases.map(r=>({id:'release:'+r.id,entityId:r.id,entityKind:'release',title:r.name,start:r.plannedStart,end:r.plannedEnd,deadline:r.deadline,readonly:!c.write})),
    ...c.rows.filter(t=>matched.has(t.id)&&(!t.effectiveReleaseId||releases.some(r=>r.id===t.effectiveReleaseId))).map(t=>({id:'task:'+t.id,entityId:t.id,entityKind:'task',title:t.displayId+' · '+t.title,start:t.plannedStart,end:t.plannedEnd||null,deadline:t.due,readonly:!c.write||t.result==='accepted',parentId:t.parentId?'task:'+t.parentId:t.effectiveReleaseId?'release:'+t.effectiveReleaseId:undefined,status:t.result==='accepted'?'done':t.status})),
    ...c.state.milestones.filter(m=>(!m.releaseId||c.state.releases.some(r=>r.id===m.releaseId&&!finished(r)&&!r.archivedAt))&&(!q.releaseId||m.releaseId===q.releaseId)).map(m=>({id:'milestone:'+m.id,entityId:m.id,entityKind:'milestone',title:m.title,start:m.date,end:m.date,deadline:null,readonly:!c.write,releaseId:m.releaseId,parentId:m.releaseId?'release:'+m.releaseId:undefined}))];
  requireCondition(c.state.constraints.length<=10000,422,'PROJECTION_LIMIT','Уточните календарный план: превышен лимит зависимостей.');
  const p=page(records,binding(projectId,'timeline',ViewFilters.strip().parse(q)),c.revision,200,q.cursor||undefined);
  return {projectId,revision:String(c.revision),rows:p.items,nextCursor:p.nextCursor,total:p.total,dependencies:c.state.constraints.map(e=>({id:e.id,from:e.source.kind+':'+e.source.id,to:e.target.kind+':'+e.target.id,type:e.relation,lagDays:e.lagDays}))};
}
const releaseValue=(v:{name:string;format:string;start:string|null;end:string|null;deadline:string|null})=>ReleaseValue.parse({name:v.name,format:v.format,plannedStart:v.start,plannedEnd:v.end,deadline:v.deadline});
function temporalCommand(intent:Extract<ViewIntent,{kind:'schedule'|'temporal'|'removeTemporal'}>){
  if(intent.kind==='schedule')return {kind:'schedule',entity:{id:intent.entityId,kind:intent.entityKind},plannedStart:intent.values.start,plannedEnd:intent.values.end,...(intent.values.deadline!==undefined?{deadline:intent.values.deadline}:{})};
  if(intent.kind==='removeTemporal')return {kind:'constraint.remove',id:intent.entityId};
  return {kind:'constraint',id:intent.entityId||randomUUID(),value:{source:{kind:'task',id:intent.values.fromId},target:{kind:'task',id:intent.values.toId},relation:intent.values.type,lagDays:intent.values.lagDays}};
}
export async function previewIntent(tx:Transaction,actor:Actor,projectId:string,intent:ViewIntent){
  const c=await context(tx,actor,projectId);requireCondition(c.write,403,'READ_ONLY','Изменение недоступно.');
  if('expectedProjectionRevision'in intent&&intent.expectedProjectionRevision)requireCondition(intent.expectedProjectionRevision===String(c.revision),409,'PROJECTION_STALE','План изменился. Обновите представление.');
  let selection:Selection={kind:'tasks',ids:[]};
  if('taskIds'in intent||'selectionToken'in intent){
    requireCondition(!(intent.taskIds&&intent.selectionToken),400,'SELECTION_INVALID','Укажите один способ выбора.');
    if(intent.selectionToken){const stored=(await tx.query<{filter:Selection;revision:number}>(`SELECT filter,project_revision::float8 AS revision FROM app.planning_selections
      WHERE project_id=$1 AND id=$2 AND actor_id=$3 AND credential_id=$4 AND expires_at>clock_timestamp()`,[projectId,intent.selectionToken,actor.id,actor.credentialId])).rows[0];
      requireCondition(stored,404,'SELECTION_UNAVAILABLE','Выбор устарел или недоступен.');requireCondition(stored.revision===c.revision,409,'SELECTION_STALE','Состав изменился. Выберите задачи заново.');selection=stored.filter;
    }else selection={kind:'tasks',ids:intent.taskIds||[]};
  }
  let value:unknown;
  switch(intent.kind){
    case 'taskEdit':value={kind:'task.edit',taskId:intent.taskId,baseRevision:intent.baseRevision,task:intent.task};break;
    case 'taskCreate':value={kind:'task.create',taskId:intent.taskId,task:intent.task,createInBoard:intent.createInBoard};break;
    case 'prepare':case 'unprepare':value={kind:'prepare',selection,preparation:intent.kind==='prepare'?'ready':'draft'};break;
    case 'take':value={kind:'admission',selection,admitted:true};break;
    case 'move':value={kind:'assign',selection,assignment:intent.groupId==='backlog'?{mode:'none'}:{mode:'assigned',releaseId:intent.groupId}};break;
    case 'bulk':value={kind:'bulk',selection,fields:{[intent.field==='tags'?'addTagIds':intent.field]:intent.value}};break;
    case 'start':value={kind:'start',releaseId:intent.groupId};break;
    case 'editRelease':value={kind:'release.edit',releaseId:intent.groupId,value:releaseValue(intent.values)};break;
    case 'createRelease':value={kind:'release.create',releaseId:randomUUID(),projectId,value:releaseValue(intent.values)};break;
    case 'close':case 'cancel':{
      requireCondition(Boolean(intent.newRelease)!==Boolean(intent.destinationId),400,'DESTINATION_REQUIRED','Выберите одного получателя остатка.');
      const destination=intent.newRelease?{kind:'new',id:randomUUID(),value:releaseValue(intent.newRelease)}:intent.destinationId==='backlog'?{kind:'unassigned'}:{kind:'release',releaseId:intent.destinationId};
      value={kind:intent.kind,releaseId:intent.groupId,destination,overrides:Object.fromEntries(Object.entries(intent.destinations).map(([id,to])=>[id,to==='backlog'?null:to])),
        ...(intent.kind==='close'?{accepted:intent.acceptAllCandidates?{kind:'filter',filter:SelectionFilter.parse({releaseId:intent.groupId,candidates:true})}:{kind:'tasks',ids:[]}}:{})};break;
    }
    case 'schedule':case 'temporal':case 'removeTemporal':value=temporalCommand(intent);break;
    case 'batch':for(const action of intent.actions)if(action.expectedProjectionRevision)requireCondition(action.expectedProjectionRevision===String(c.revision),409,'PROJECTION_STALE','План изменился.');value={kind:'schedule.batch',actions:intent.actions.map(temporalCommand)};break;
    case 'milestone':value={kind:'milestone',id:intent.entityId||randomUUID(),value:intent.values};break;
    case 'settings':value={kind:'settings',value:{format:intent.values.format,days:intent.values.days,timezone:intent.values.timeZone}};break;
    case 'shiftDates':value={kind:'shift',releaseId:intent.groupId,days:intent.days};break;
    default:throw new Problem(400,'INTENT_UNKNOWN','Операция не поддерживается.');
  }
  const result=await preview(tx,actor,projectId,PlanningCommand.parse(value));
  const changes=[...(result.details||[]),...result.effects.map(e=>taskChange(e,[...result.releases,...c.state.releases]))];
  return {token:result.id+'.'+result.token,expiresAt:result.expiresAt,summary:`Затронуто задач: ${result.affectedCount}. На доску: ${result.enteringBoard}, с доски: ${result.leavingBoard}.`,changes:changes.slice(0,200),moreChanges:Math.max(0,(result.details?.length||0)+result.affectedCount-Math.min(200,changes.length)),blockers:[]};
}
