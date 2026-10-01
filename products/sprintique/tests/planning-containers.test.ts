import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import type {ContainersView,Container,ContainerRow,MoveResult} from '../contracts/planning-view.js';

// Planning R4.1: the containers projection, the move with its undo, estimates, the r4 date policy and completion.
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'C'});});after(async()=>{await f?.close();});
const path=(suffix:string)=>`/api/v1/projects/${f.first.id}/${suffix}`;
type Headers=typeof f.alice.headers;
async function request(suffix:string,payload:unknown={},headers:Headers=f.alice.headers,method:'POST'|'PUT'|'GET'='POST',key=randomUUID()){
  return f.app.inject({method,url:path(suffix),headers:{...headers,'idempotency-key':key},...(method==='GET'?{}:{payload:payload as Record<string,unknown>})});
}
async function ok<T=any>(suffix:string,payload:unknown={},headers:Headers=f.alice.headers):Promise<T>{const r=await request(suffix,payload,headers);assert.equal(r.statusCode,200,r.body);return r.json<T>();}
const view=()=>ok<ContainersView>('planning/view/containers',{});
const container=(v:ContainersView,name:string)=>v.containers.find(c=>c.name===name)!;
const rowOf=(c:Container,id:string)=>c.rows.find(r=>r.id===id)!;
async function task(id:string,extra:Record<string,unknown>={}){const r=await request('tasks/'+id,{baseRevision:0,task:{title:id,...extra}},f.alice.headers,'PUT');assert.equal(r.statusCode,200,r.body);return r.json();}
async function apply(intent:unknown){const plan=await ok('planning/view/preview',intent);const [planId,token]=plan.token.split('.');const result=await ok('planning/commands',{planId,token});assert.equal(result.status,'committed',JSON.stringify(result));return plan;}
async function sprint(name:string,start:string,end:string,goal?:string){await apply({kind:'createRelease',values:{name,format:'timeboxed',start,end,deadline:null,...(goal===undefined?{}:{goal})}});return container(await view(),name).id;}
async function release(name:string,deadline:string|null){await apply({kind:'createRelease',values:{name,format:'flexible',start:null,end:null,deadline}});return container(await view(),name).id;}
const move=(body:Record<string,unknown>,headers:Headers=f.alice.headers,key=randomUUID())=>request('planning/view/move',body,headers,'POST',key);
async function moved(body:Record<string,unknown>){const r=await move(body);assert.equal(r.statusCode,200,r.body);return r.json<MoveResult>();}
const ids=(c:Container)=>c.rows.map(r=>r.id);

test('C01 estimates: units as entered, hours by the project day and week, story points apart, invalid values refused',async()=>{
  await task('est-h',{estimate:{value:6,unit:'h'}});await task('est-d',{estimate:{value:2,unit:'d'}});await task('est-w',{estimate:{value:1,unit:'w'}});
  await task('est-sp',{estimate:{value:5,unit:'sp'}});await task('est-none');
  const document=(await request('tasks/est-d',undefined,f.alice.headers,'GET')).json();assert.deepEqual(document.estimate,{value:2,unit:'d'});
  let backlog=container(await view(),'Бэклог');
  assert.equal(rowOf(backlog,'est-h').estimateHours,6);assert.equal(rowOf(backlog,'est-d').estimateHours,16);assert.equal(rowOf(backlog,'est-w').estimateHours,40);
  assert.equal(rowOf(backlog,'est-sp').estimateMismatch,true);assert.equal(rowOf(backlog,'est-sp').estimatePoints,5);assert.equal(rowOf(backlog,'est-none').estimate,null);
  assert.equal(backlog.summary.estimateHours,62);assert.equal(backlog.summary.estimatePoints,0);
  for(const estimate of [{value:0,unit:'h'},{value:1.234,unit:'h'},{value:10000,unit:'h'},{value:3,unit:'m'}]){
    assert.equal((await request('tasks/est-bad',{baseRevision:0,task:{title:'bad',estimate}},f.alice.headers,'PUT')).statusCode,400,JSON.stringify(estimate));
  }
  // The project's format and working day: changing it never rewrites stored estimates.
  const settings=(await request('planning/view/settings',undefined,f.alice.headers,'GET')).json();assert.equal(settings.estimateFormat,'time');assert.equal(settings.hoursPerDay,8);
  await apply({kind:'settings',values:{format:settings.format,days:settings.days,timeZone:settings.timeZone,inheritTimeZone:settings.timeZoneInherited,estimateFormat:'points',hoursPerDay:6}});
  const v=await view();assert.deepEqual(v.estimate,{format:'points',hoursPerDay:6,hoursPerWeek:40});backlog=container(v,'Бэклог');
  assert.equal(rowOf(backlog,'est-h').estimateMismatch,true);assert.equal(rowOf(backlog,'est-d').estimateHours,12);assert.equal(rowOf(backlog,'est-sp').estimateMismatch,false);
  assert.equal(backlog.summary.estimatePoints,5);assert.equal(backlog.summary.estimateHours,0);
  assert.deepEqual((await request('tasks/est-h',undefined,f.alice.headers,'GET')).json().estimate,{value:6,unit:'h'});
  await apply({kind:'settings',values:{format:settings.format,days:settings.days,timeZone:settings.timeZone,inheritTimeZone:settings.timeZoneInherited,estimateFormat:'time',hoursPerDay:8}});
  // A bulk estimate edit sets and clears the value with its unit.
  await apply({kind:'bulk',field:'estimate',value:{value:3,unit:'d'},taskIds:['est-none']});
  assert.deepEqual((await request('tasks/est-none',undefined,f.alice.headers,'GET')).json().estimate,{value:3,unit:'d'});
  await apply({kind:'bulk',field:'estimate',value:null,taskIds:['est-none']});
  assert.equal((await request('tasks/est-none',undefined,f.alice.headers,'GET')).json().estimate,null);
  assert.equal((await request('planning/view/preview',{kind:'bulk',field:'owner',value:{value:1,unit:'h'},taskIds:['est-none']})).statusCode,400);
});

test('C02 containers: order, goal, tree with crumbs, epic rollups here and elsewhere, leaf-only summaries',async()=>{
  const s1=await sprint('C Sprint 1','2026-10-01','2026-10-14','связи видны на графе'),s2=await sprint('C Sprint 2','2026-10-15','2026-10-28');
  const r1=await release('C Release',null);
  await task('epic-a',{type:'epic',priority:'high',due:'2026-10-10'});
  await task('kid-1',{parentId:'epic-a',estimate:{value:4,unit:'h'},status:'in_progress'});
  await task('kid-2',{parentId:'epic-a',estimate:{value:1,unit:'d'},status:'ready_for_release'});
  await task('kid-3',{parentId:'epic-a',estimate:{value:2,unit:'h'}});
  await moved({ids:['epic-a'],containerId:s1,afterId:null});
  await moved({ids:['kid-3'],containerId:s2,afterId:null});
  const v=await view();
  assert.equal(v.protocol,'sprintique.planning-containers/1');assert.match(v.today,/^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(v.capabilities,{plan:true,manageReleases:true,completeSprint:true});
  const order=v.containers.map(c=>c.id);assert.ok(order.indexOf(s1)<order.indexOf(s2));assert.ok(order.indexOf(s2)<order.indexOf(r1));assert.equal(order.at(-1),'backlog');
  const one=container(v,'C Sprint 1'),two=container(v,'C Sprint 2');
  assert.equal(one.kind,'sprint');assert.equal(one.state,'planned');assert.equal(one.goal,'связи видны на графе');assert.equal(one.end,'2026-10-14');
  assert.deepEqual(ids(one),['epic-a','kid-1','kid-2']);
  const epic=rowOf(one,'epic-a');assert.equal(epic.kind,'epic');assert.equal(epic.depth,0);assert.equal(epic.priority,'high');assert.equal(epic.due,'2026-10-10');
  assert.deepEqual(epic.rollup!.here,{total:2,done:1,estimateHours:12,estimatePoints:0});
  assert.deepEqual(epic.rollup!.elsewhere,[{containerId:s2,name:'C Sprint 2',count:1}]);
  assert.equal(rowOf(one,'kid-1').depth,1);assert.equal(rowOf(one,'kid-2').done,true);assert.equal(rowOf(one,'kid-1').crumb,null);
  const crumb=rowOf(two,'kid-3');assert.equal(crumb.depth,0);assert.equal(crumb.crumb,'epic-a');
  // Summaries count tasks and subtasks, never epics.
  assert.deepEqual(one.summary,{total:2,done:1,open:1,estimateHours:12,remainingHours:4,estimatePoints:0,remainingPoints:0,noDue:0});
  await task('rel-nodue');await moved({ids:['rel-nodue'],containerId:r1,afterId:null});
  const rel=container(await view(),'C Release');assert.equal(rowOf(rel,'rel-nodue').noDue,true);assert.equal(rel.summary.noDue,1);
  // A release goal is edited and cleared through the release values.
  await apply({kind:'editRelease',groupId:r1,values:{name:'C Release',format:'flexible',start:null,end:null,deadline:null,goal:'публичный запуск'}});
  assert.equal(container(await view(),'C Release').goal,'публичный запуск');
  await apply({kind:'editRelease',groupId:r1,values:{name:'C Release',format:'flexible',start:null,end:null,deadline:null}});
  assert.equal(container(await view(),'C Release').goal,'публичный запуск');
  await apply({kind:'editRelease',groupId:r1,values:{name:'C Release',format:'flexible',start:null,end:null,deadline:null,goal:null}});
  assert.equal(container(await view(),'C Release').goal,null);
});

test('C03 an epic moves with its subtasks from the same container; «only the epic» pins them where they were',async()=>{
  const target=await sprint('C Move target','2026-11-01','2026-11-14');
  await task('mv-epic',{type:'epic'});await task('mv-a',{parentId:'mv-epic'});await task('mv-b',{parentId:'mv-epic'});
  const elsewhere=await sprint('C Move elsewhere','2026-11-15','2026-11-28');
  await task('mv-c',{parentId:'mv-epic'});await moved({ids:['mv-c'],containerId:elsewhere,afterId:null});
  const result=await moved({ids:['mv-epic'],containerId:target,afterId:null});
  assert.deepEqual(result.moved,['mv-epic','mv-a','mv-b']);
  assert.ok(result.containers.some(c=>c.id==='backlog'));assert.ok(result.containers.some(c=>c.id===target));
  let v=await view();assert.deepEqual(ids(container(v,'C Move target')),['mv-epic','mv-a','mv-b']);
  assert.deepEqual(ids(container(v,'C Move elsewhere')),['mv-c']);assert.equal(container(v,'Бэклог').rows.some(r=>r.id.startsWith('mv-')),false);
  // Only the epic: its subtasks stay in the sprint, now with the epic as a crumb.
  const only=await moved({ids:['mv-epic'],containerId:'backlog',afterId:null,withChildren:false});assert.deepEqual(only.moved,['mv-epic']);
  v=await view();const left=container(v,'C Move target');assert.deepEqual(ids(left),['mv-a','mv-b']);assert.equal(rowOf(left,'mv-a').crumb,'mv-epic');
  assert.ok(container(v,'Бэклог').rows.some(r=>r.id==='mv-epic'));
});

test('C04 reorder within a container and placement after a root row keep the block order',async()=>{
  const s=await sprint('C Order','2026-12-01','2026-12-14');
  for(const id of ['or-1','or-2','or-3','or-4'])await task(id);
  await moved({ids:['or-1','or-2','or-3','or-4'],containerId:s,afterId:null});
  assert.deepEqual(ids(container(await view(),'C Order')),['or-1','or-2','or-3','or-4']);
  await moved({ids:['or-4'],containerId:s,afterId:'or-1'});
  assert.deepEqual(ids(container(await view(),'C Order')),['or-1','or-4','or-2','or-3']);
  await moved({ids:['or-2','or-1'],containerId:s,afterId:'or-3'});
  assert.deepEqual(ids(container(await view(),'C Order')),['or-4','or-3','or-2','or-1']);
  await moved({ids:['or-1'],containerId:s,afterId:null});
  assert.deepEqual(ids(container(await view(),'C Order')),['or-1','or-4','or-3','or-2']);
  const outside=await move({ids:['or-1'],containerId:s,afterId:'mv-a'});assert.equal(outside.statusCode,422);assert.equal(outside.json().code,'PLACE_SCOPE');
  // A crowded gap renumbers the container instead of losing the order.
  for(let i=0;i<40;i++)await moved({ids:[i%2?'or-2':'or-3'],containerId:s,afterId:'or-1'});
  assert.deepEqual(ids(container(await view(),'C Order')).slice(0,1),['or-1']);
});

test('C05 a move between containers is idempotent, undone by restore, and the undo is refused once the plan moved on',async()=>{
  const a=await sprint('C Undo A','2027-01-01','2027-01-14');
  await task('un-1',{estimate:{value:5,unit:'h'}});await task('un-2');
  const key=randomUUID(),body={ids:['un-1'],containerId:a,afterId:null};
  const first=await move(body,f.alice.headers,key);assert.equal(first.statusCode,200,first.body);
  const replay=await move(body,f.alice.headers,key);assert.deepEqual(replay.json(),first.json());
  const result=first.json<MoveResult>();assert.equal(result.undo.kind,'restore');
  assert.equal(result.containers.find(c=>c.id===a)!.summary.estimateHours,5);
  assert.ok(container(await view(),'C Undo A').rows.some(r=>r.id==='un-1'));
  const undone=await moved({restore:result.undo});assert.ok(undone.moved.includes('un-1'));
  let v=await view();assert.equal(container(v,'C Undo A').rows.length,0);assert.ok(container(v,'Бэклог').rows.some(r=>r.id==='un-1'));
  const again=await moved({ids:['un-2'],containerId:a,afterId:null});
  await task('un-later');
  const stale=await move({restore:again.undo});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'UNDO_STALE');
  const stalePlace=await move({ids:['un-1'],containerId:a,afterId:null,expectedRevision:again.revision});assert.equal(stalePlace.json().code,'PROJECTION_STALE');
  assert.equal((await move({ids:['un-1'],containerId:a})).statusCode,200);
  assert.equal((await move({ids:['un-1']})).statusCode,400);
  assert.equal((await move({ids:['un-1'],containerId:a,restore:result.undo})).statusCode,400);
});

test('C06 completion: done work is accepted whatever its preparation, the rest carries over, exceptions and epics follow',async()=>{
  const s=await sprint('C Close','2027-02-01','2027-02-14'),next=await sprint('C Close next','2027-02-15','2027-02-28');
  await task('cl-done',{status:'ready_for_release'});await task('cl-open');await task('cl-own');
  await task('cl-epic',{type:'epic',status:'ready_for_release'});await task('cl-epic-open',{parentId:'cl-epic'});await task('cl-epic-done',{parentId:'cl-epic',status:'ready_for_release'});
  await moved({ids:['cl-done','cl-open','cl-own','cl-epic'],containerId:s,afterId:null});
  await apply({kind:'start',groupId:s});
  assert.equal(container(await view(),'C Close').state,'active');
  const info=await ok('planning/view/release',{groupId:s});assert.equal(info.counts.candidates,2);assert.equal(info.counts.unfinished,4);
  await apply({kind:'close',groupId:s,acceptAllCandidates:true,destinationId:next,destinations:{'cl-own':'backlog'}});
  const v=await view();assert.equal(v.containers.some(c=>c.id===s),false);assert.ok(v.completed.count>=1);
  const carried=container(v,'C Close next');assert.deepEqual(ids(carried).sort(),['cl-epic','cl-epic-open','cl-open'].sort());
  assert.ok(container(v,'Бэклог').rows.some(r=>r.id==='cl-own'));
  for(const id of ['cl-done','cl-epic-done'])assert.equal((await request('tasks/'+id,undefined,f.alice.headers,'GET')).json().result,'accepted');
  assert.equal((await request('tasks/cl-epic',undefined,f.alice.headers,'GET')).json().result,'open');
  // Accepted work is pinned and finished sprints refuse new work.
  const pinned=await move({ids:['cl-done'],containerId:'backlog',afterId:null});assert.equal(pinned.statusCode,409);assert.equal(pinned.json().code,'RESULT_PINNED');
  const finished=await move({ids:['cl-open'],containerId:s,afterId:null});assert.equal(finished.statusCode,409);assert.equal(finished.json().code,'RELEASE_FINISHED');
});

test('C07 dates under planning-r4.0: conflicts warn, cycles are refused; a move warns about a late due date',async()=>{
  const s=await sprint('C Dates','2027-03-01','2027-03-14'),r=await release('C Dates release','2027-04-01');
  await task('dt-late',{due:'2027-03-20'});await task('dt-free');
  const late=await moved({ids:['dt-late','dt-free'],containerId:s,afterId:null});
  assert.deepEqual(late.warnings.map(w=>[w.taskId,w.code]),[['dt-late','AFTER_SPRINT_END']]);
  assert.equal(rowOf(container(await view(),'C Dates'),'dt-late').afterSprintEnd,true);
  const nodue=await moved({ids:['dt-free'],containerId:r,afterId:null});assert.deepEqual(nodue.warnings.map(w=>w.code),['NO_DUE']);
  const due=await ok('planning/view/preview',{kind:'bulk',field:'due',value:'2027-03-30',taskIds:['dt-late']});
  assert.ok(due.changes.some((c:{label:string})=>c.label.startsWith('Конфликт дат')));
  await task('dt-a');await task('dt-b');
  await apply({kind:'batch',actions:[
    {kind:'schedule',entityId:'dt-a',entityKind:'task',values:{start:'2027-03-01',end:'2027-03-05'}},
    {kind:'schedule',entityId:'dt-b',entityKind:'task',values:{start:'2027-03-06',end:'2027-03-08'}},
    {kind:'temporal',entityId:'dt-edge',values:{fromId:'dt-a',toId:'dt-b',type:'FS',lagDays:0}}]});
  const conflict=await ok('planning/view/preview',{kind:'schedule',entityId:'dt-b',entityKind:'task',values:{start:'2027-03-02',end:'2027-03-03'}});
  assert.ok(conflict.changes.some((c:{label:string})=>c.label==='Конфликт дат'));
  const cycle=await request('planning/view/preview',{kind:'temporal',entityId:'dt-back',values:{fromId:'dt-b',toId:'dt-a',type:'FS',lagDays:0}});
  assert.equal(cycle.statusCode,422);assert.equal(cycle.json().code,'TEMPORAL_CYCLE');
  const capabilities=(await request('planning/capabilities',undefined,f.alice.headers,'GET')).json();assert.equal(capabilities.policyVersion,'planning-r4.0');
});

test('C08 permissions: readers see without actions, agents propose a place, other tenants see nothing',async()=>{
  const readerView=await ok<ContainersView>('planning/view/containers',{},f.reader.headers);
  assert.deepEqual(readerView.capabilities,{plan:false,manageReleases:false,completeSprint:false});
  const denied=await move({ids:['un-2'],containerId:'backlog',afterId:null},f.reader.headers);assert.equal(denied.statusCode,403);
  assert.equal((await request('planning/view/containers',{},f.bob.headers)).statusCode,404);
  assert.equal((await move({ids:['un-2'],containerId:'backlog',afterId:null},f.bob.headers)).statusCode,404);
  const grant=await request('agents',{name:'Planner',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600});assert.equal(grant.statusCode,200,grant.body);
  const agent={authorization:'Bearer '+grant.json().token} as unknown as Headers;
  const refused=await move({ids:['un-2'],containerId:'backlog',afterId:null},agent);assert.equal(refused.statusCode,403);assert.equal(refused.json().code,'HUMAN_REQUIRED');
  const proposal=await request('planning/previews',{kind:'place',ids:['un-2'],containerId:'backlog',afterId:null},agent);
  assert.equal(proposal.statusCode,200,proposal.body);assert.equal(proposal.json().requiresApproval,true);
  const agentView=await ok<ContainersView>('planning/view/containers',{},agent);assert.equal(agentView.capabilities.plan,false);
});

export type {ContainerRow};
