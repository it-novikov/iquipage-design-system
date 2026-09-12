import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {TaskInput} from '../contracts/index.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'V'});});after(async()=>{await f?.close();});
const path=(suffix:string)=>`/api/v1/projects/${f.first.id}/${suffix}`;
async function request(suffix:string,payload:unknown={},headers=f.alice.headers,method:'POST'|'PUT'|'GET'='POST'){
  return f.app.inject({method,url:path(suffix),headers:{...headers,'idempotency-key':randomUUID()},...(method==='GET'?{}:{payload:payload as Record<string,unknown>})});
}
async function ok(suffix:string,payload:unknown={},headers=f.alice.headers){const r=await request(suffix,payload,headers);assert.equal(r.statusCode,200,r.body);return r.json();}
const view=(suffix:string,payload:unknown={})=>ok('planning/view/'+suffix,payload);
async function task(id:string,extra:Record<string,unknown>={}){const r=await request('tasks/'+id,{baseRevision:0,task:{title:id,...extra}},f.alice.headers,'PUT');assert.equal(r.statusCode,200,r.body);return r.json();}
async function apply(intent:unknown){const plan=await view('preview',intent);const [planId,token]=plan.token.split('.');const result=await ok('planning/commands',{planId,token});assert.equal(result.status,'committed',JSON.stringify(result));return plan;}
async function release(name:string){const p=await apply({kind:'createRelease',values:{name,format:'flexible',start:null,end:null,deadline:null}});assert.ok(p.changes.length);return (await view('groups')).items.find((g:{title:string})=>g.title===name).id as string;}

test('V01 live consumer protocol groups/rows: descendants, filtering context, collapse and stable revisions',async()=>{
  await task('view-parent');await task('view-child',{parentId:'view-parent',owner:'Алиса'});await task('view-grandchild',{parentId:'view-child'});
  const groups=await view('groups',{query:'view-'});assert.equal(groups.protocol,'sprintique.planning-view/1');
  const page=await view('rows',{groupId:'backlog',revision:groups.revision,query:'view-'});
  assert.deepEqual(page.rows.map((r:{depth:number})=>r.depth),[0,1,2]);
  const filtered=await view('rows',{groupId:'backlog',revision:groups.revision,query:'view-child',collapsedTaskIds:['view-parent']});
  assert.equal(filtered.rows.length,2);assert.equal(filtered.rows[0].contextOnly,true);assert.equal(filtered.rows[0].selectable,false);assert.equal(filtered.rows[1].taskId,'view-child');
  const folded=await view('rows',{groupId:'backlog',revision:groups.revision,collapsedTaskIds:['view-parent']});
  assert.equal(folded.rows.some((r:{taskId:string})=>r.taskId==='view-child'),false);
  await task('view-later');assert.equal((await request('planning/view/rows',{groupId:'backlog',revision:groups.revision})).json().code,'CURSOR_STALE');
});
test('V02 server selection is session/tenant/revision bound; no stale mass mutation',async()=>{
  const snapshot=await view('selection',{query:'view-',taskIds:['view-parent']});assert.equal(snapshot.count,3);
  const proposed=await view('preview',{kind:'prepare',selectionToken:snapshot.token});assert.match(proposed.summary,/3/);
  assert.equal((await request('planning/view/preview',{kind:'prepare',selectionToken:snapshot.token},f.bob.headers)).statusCode,404);
  assert.equal((await request('planning/view/selection',{},f.reader.headers)).statusCode,403);
  assert.equal((await request('planning/view/preview',{kind:'prepare',selectionToken:snapshot.token,taskIds:['view-parent']})).statusCode,400);
  await task('selection-revision');assert.equal((await request('planning/view/preview',{kind:'prepare',selectionToken:snapshot.token})).json().code,'SELECTION_STALE');
});
test('V03 PR3 lifecycle intents create, prepare, move, start, close and preserve immutable history after transfer',async()=>{
  const first=await release('View launch'),next=await release('View next');
  await task('closure-candidate',{status:'ready_for_release'});await task('closure-open');
  await apply({kind:'prepare',taskIds:['closure-candidate','closure-open']});
  await apply({kind:'move',taskIds:['closure-candidate','closure-open'],groupId:first});await apply({kind:'start',groupId:first});
  const info=await view('release',{groupId:first});assert.equal(info.counts.candidates,1);assert.equal(info.counts.unfinished,1);
  await apply({kind:'close',groupId:first,acceptAllCandidates:true,destinationId:next,destinations:{}});
  const groups=await view('groups',{history:'closed'}),group=groups.items.find((g:{id:string})=>g.id===first);assert.equal(group.total,2);
  const rows=await view('rows',{groupId:first,history:'closed',revision:groups.revision});assert.equal(rows.rows.length,2);assert.ok(rows.rows.every((r:{selectable:boolean})=>!r.selectable));
  const snapshot=(await view('release',{groupId:first})).snapshot;assert.equal(snapshot.accepted,1);assert.equal(snapshot.carried,1);
  await apply({kind:'bulk',taskIds:['closure-open'],field:'owner',value:'Новый исполнитель'});
  assert.deepEqual((await view('release',{groupId:first})).snapshot,snapshot);
});
test('V04 planned end is independent from deadline; roadmap batch is atomic and stale projection is rejected',async()=>{
  await task('date-first',{due:'2026-10-30'});await task('date-second');
  const revision=(await view('timeline')).revision;
  await apply({kind:'batch',expectedProjectionRevision:revision,actions:[
    {kind:'schedule',entityId:'date-first',entityKind:'task',values:{start:'2026-10-01',end:'2026-10-03'}},
    {kind:'schedule',entityId:'date-second',entityKind:'task',values:{start:'2026-10-05',end:'2026-10-07'}},
    {kind:'temporal',entityId:'date-edge',values:{fromId:'date-first',toId:'date-second',type:'FS',lagDays:1}}
  ]});
  const timeline=await view('timeline'),first=timeline.rows.find((r:{entityId:string})=>r.entityId==='date-first');
  assert.equal(first.end,'2026-10-03');assert.equal(first.deadline,'2026-10-30');assert.equal(timeline.dependencies.find((d:{id:string})=>d.id==='date-edge').type,'FS');
  const stale=await request('planning/view/preview',{kind:'schedule',expectedProjectionRevision:revision,entityId:'date-first',entityKind:'task',values:{start:null,end:null}});assert.equal(stale.json().code,'PROJECTION_STALE');
  const conflict=await request('planning/view/preview',{kind:'schedule',entityId:'date-second',entityKind:'task',values:{start:'2026-10-02',end:'2026-10-03'}});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().code,'TEMPORAL_CONFLICT');
  assert.equal((await view('timeline')).revision,timeline.revision);
  await apply({kind:'removeTemporal',entityId:'date-edge'});assert.equal((await view('timeline')).dependencies.some((d:{id:string})=>d.id==='date-edge'),false);
  await apply({kind:'schedule',entityId:'date-first',entityKind:'task',values:{start:'2026-11-01',end:'2026-11-03'}});
  const late=(await view('timeline')).rows.find((r:{entityId:string})=>r.entityId==='date-first');assert.equal(late.start,'2026-11-01');assert.equal(late.deadline,'2026-10-30');
});
test('V05 milestones, defaults and date shifts are previewed and persisted without moving deadlines',async()=>{
  const groupId=await release('Shiftable');await task('shifted',{due:'2026-11-30'});await apply({kind:'move',groupId,taskIds:['shifted']});
  await apply({kind:'schedule',entityKind:'task',entityId:'shifted',values:{start:'2026-11-01',end:'2026-11-02'}});
  await apply({kind:'shiftDates',groupId,days:3});
  await apply({kind:'milestone',entityId:'checkpoint',values:{title:'Контрольная точка',date:'2026-11-10',releaseId:groupId}});
  await apply({kind:'settings',values:{format:'timeboxed',days:7,timeZone:'Europe/Moscow'}});
  const timeline=await view('timeline'),shifted=timeline.rows.find((r:{entityId:string})=>r.entityId==='shifted');
  assert.equal(shifted.start,'2026-11-04');assert.equal(shifted.deadline,'2026-11-30');assert.equal(timeline.rows.find((r:{entityId:string})=>r.entityId==='checkpoint').parentId,'release:'+groupId);
  const settings=await request('planning/view/settings',undefined,f.alice.headers,'GET');assert.equal(settings.json().days,7);assert.equal(settings.json().timeZone,'Europe/Moscow');
});
test('V06 options, read-only capabilities, malformed intents, and cross-tenant projections fail closed',async()=>{
  const groups=await ok('planning/view/groups',{},f.reader.headers);assert.equal(groups.capabilities.createTask,false);assert.equal(groups.capabilities.timeline,true);
  assert.equal((await request('planning/view/groups',{},f.bob.headers)).statusCode,404);
  assert.equal((await request('planning/view/preview',{kind:'sql',sql:'SELECT 1'})).statusCode,400);
  assert.equal((await request('planning/view/preview',{kind:'prepare',taskIds:['view-parent'],actorId:f.bob.id})).statusCode,400);
  const options=await view('options',{kind:'destinations',query:'View next'});assert.equal(options.options.length,1);assert.equal(options.options[0].label,'View next');
});
test('V07 task form creation in a release and full edit commit content and planning atomically',async()=>{
  const groupId=await release('Form release');
  const preview=await view('preview',{kind:'taskCreate',taskId:'form-created',task:TaskInput.parse({title:'Новая из планирования',releaseId:groupId,description:'Исходное описание'})});
  assert.equal((await request('tasks/form-created',undefined,f.alice.headers,'GET')).statusCode,404);
  const [planId,token]=preview.token.split('.');assert.equal((await ok('planning/commands',{planId,token})).status,'committed');
  const created=(await request('tasks/form-created',undefined,f.alice.headers,'GET')).json();assert.equal(created.preparation,'draft');assert.equal(created.releaseId,groupId);assert.equal(created.revision,1);
  const input=TaskInput.strip().parse({...created,title:'Одно сохранение',releaseId:null,description:'- [ ] Проверить атомарность'});
  await apply({kind:'taskEdit',taskId:created.id,baseRevision:created.revision,task:input});
  const edited=(await request('tasks/form-created',undefined,f.alice.headers,'GET')).json();assert.equal(edited.title,input.title);assert.equal(edited.description,input.description);assert.equal(edited.releaseId,null);assert.equal(edited.revision,2);
  const stale=await request('planning/view/preview',{kind:'taskEdit',taskId:created.id,baseRevision:1,task:input});assert.equal(stale.json().code,'CONFLICT');
});
test('V08 failed task-plan audit rolls back task creation, number, tag and receipt together',async()=>{
  const preview=await view('preview',{kind:'taskCreate',taskId:'form-rollback',task:TaskInput.parse({title:'Нельзя создать частично'})});
  const [planId,token]=preview.token.split('.'),before=(await f.admin.query('SELECT next_task_number FROM app.projects WHERE id=$1',[f.first.id])).rows[0];
  await f.admin.query(`CREATE FUNCTION public.view_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='form-rollback' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$; CREATE TRIGGER view_test_fail BEFORE INSERT ON app.audit_events FOR EACH ROW EXECUTE FUNCTION public.view_test_fail()`);
  try{assert.equal((await request('planning/commands',{planId,token})).statusCode,503);}finally{await f.admin.query('DROP TRIGGER view_test_fail ON app.audit_events; DROP FUNCTION public.view_test_fail()');}
  assert.equal((await request('tasks/form-rollback',undefined,f.alice.headers,'GET')).statusCode,404);
  assert.deepEqual((await f.admin.query('SELECT next_task_number FROM app.projects WHERE id=$1',[f.first.id])).rows[0],before);
});
test('V09 large consumer rows and immutable release descriptions remain paged and bind stale cursors',async()=>{
  const groupId=await release('Paged history');
  // Bulk fixture creation only. The operations under test still go through the live preview/commit API.
  const start=(await f.admin.query('SELECT next_task_number n FROM app.projects WHERE id=$1',[f.first.id])).rows[0].n;
  await f.admin.query(`INSERT INTO app.tasks(project_id,id,number,title,description,status,type,priority,owner_label,rank,revision,preparation,result,assignment_mode,release_id)
    SELECT $1,'page-'||n,$3+n,'Страница '||n,'','ready','task','normal','',n,1,'ready','open','assigned',$2 FROM generate_series(0,206) n`,[f.first.id,groupId,start]);
  await f.admin.query('UPDATE app.projects SET next_task_number=next_task_number+207,planning_revision=planning_revision+1 WHERE id=$1',[f.first.id]);
  const groups=await view('groups',{query:'Paged history'});assert.equal(groups.items.find((g:{id:string})=>g.id===groupId).matched,207);
  const first=await view('rows',{groupId,revision:groups.revision});assert.equal(first.rows.length,200);assert.ok(first.nextCursor);
  const second=await view('rows',{groupId,revision:groups.revision,cursor:first.nextCursor});assert.equal(second.rows.length,7);assert.equal(second.nextCursor,null);
  const info=await view('release',{groupId});assert.equal(info.items.length,100);assert.equal(info.counts.total,207);
  await apply({kind:'start',groupId});
  assert.equal((await request('planning/view/release',{groupId,cursor:info.nextCursor})).statusCode,409);
  await apply({kind:'close',groupId,destinationId:'backlog'});
  let cursor:string|undefined,ids:string[]=[];
  do{const page=await view('release',{groupId,...(cursor?{cursor}:{})});assert.ok(page.items.length<=100);assert.equal(page.snapshot.items.length,page.items.length);ids.push(...page.snapshot.items.map((t:{id:string})=>t.id));cursor=page.nextCursor;}while(cursor);
  assert.equal(ids.length,207);assert.equal(new Set(ids).size,207);
  const closed=await view('groups',{history:'closed',query:'Paged history'});assert.equal(closed.items.find((g:{id:string})=>g.id===groupId).matched,207);
});
