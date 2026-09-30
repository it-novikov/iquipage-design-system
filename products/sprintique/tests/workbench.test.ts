import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {fixture,startApp,origin} from './fixture.js';
import type {WorkbenchEnvelope,WorkbenchRow,WorkbenchPage,PlanHorizon} from '../contracts/workbench.js';

// The Workbench (docs/adr W1–W6) over HTTP against the real server and PostgreSQL: the inclusion matrix of the
// delivery plan §15, the private boundary, cursors, request and waiting lifecycles and the plan horizon.
type User=Awaited<ReturnType<typeof fixture>>['alice'];
let f:Awaited<ReturnType<typeof fixture>>;
let carol:User,dan:User;
before(async()=>{f=await fixture({prefix:'WB'});carol=await human('Карина');dan=await human('Денис');});
after(async()=>{await f?.close();});

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function human(name:string):Promise<User>{
  const id=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),credential=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,name]);
  await f.admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
  return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf}};
}
const call=(method:string,url:string,payload?:unknown,user:User=f.alice,key:string=randomUUID())=>f.app.inject({method,url,
  headers:{...user.headers,'idempotency-key':key},...(payload===undefined?{}:{payload})});
async function ok<T=any>(response:Promise<{statusCode:number;body:string;json<R>():R}>,status=200):Promise<T>{
  const r=await response;assert.equal(r.statusCode,status,r.body);return r.json<T>();
}
let keys=0;
/** A project of its own per scenario, so each envelope is read through its own filter. */
async function project(members:[User,'reader'|'editor'|'admin'][]=[]){
  const key='W'+(++keys).toString().padStart(3,'0')+'X';
  const workspace=await ok<{id:string}>(call('POST','/api/v1/workspaces',{name:'Пространство '+key}));
  const created=await ok<{id:string}>(call('POST','/api/v1/projects',{workspaceId:workspace.id,name:'Проект '+key,slug:key.toLowerCase(),key}));
  for(const [user,role] of members)await f.admin.query('INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,$3)',[created.id,user.id,role]);
  return created.id;
}
const base=(p:string)=>`/api/v1/projects/${p}`;
async function task(p:string,id:string,fields:Record<string,unknown>={},user:User=f.alice){
  return ok(call('PUT',`${base(p)}/tasks/${id}`,{baseRevision:0,task:{title:'Задача '+id,...fields}},user));
}
/** A full task write, as the drawer sends it: every field of the current task with some changed. */
async function edit(p:string,id:string,changes:Record<string,unknown>,user:User=f.alice){
  const t=await ok<any>(call('GET',`${base(p)}/tasks/${id}`,undefined,user));
  const value={title:t.title,description:t.description,status:t.status,type:t.type,priority:t.priority,ownerId:t.ownerId,due:t.due,rank:t.rank,
    parentId:t.parentId,releaseId:t.releaseId,tagIds:t.tagIds,attachmentIds:t.attachmentIds??[],coverAttachmentId:t.coverAttachmentId??null,coverCrop:t.coverCrop??null,...changes};
  return ok(call('PUT',`${base(p)}/tasks/${id}`,{baseRevision:t.revision,task:value},user));
}
async function personal(p:string,t:string,user:User=f.alice){return ok<any>(call('GET',`${base(p)}/tasks/${t}/personal`,undefined,user));}
/** "Участвую" on or off for a person. */
async function participate(p:string,t:string,participating=true,user:User=f.alice){
  const state=await personal(p,t,user);return ok(call('PUT',`${base(p)}/tasks/${t}/personal/participation`,{baseRevision:state.participationRevision,participating},user));
}
/** Up or down in the person's order of what they participate in, within the project filter `p`. */
async function rank(p:string,t:string,move:'up'|'down',user:User=f.alice,scope:string[]|null=[p]){
  const state=await personal(p,t,user);return call('PUT',`${base(p)}/tasks/${t}/personal/rank`,{baseRevision:state.rankRevision,move,projects:scope},user);
}
async function checkBack(p:string,t:string,checkBackAt:string|null,user:User=f.alice){
  const state=await personal(p,t,user);return call('PUT',`${base(p)}/tasks/${t}/personal/check-back`,{baseRevision:state.checkBackRevision,checkBackAt},user);
}
async function ask(p:string,t:string,from:User,to:User,extra:Record<string,unknown>={}){
  return ok<any>(call('POST',`${base(p)}/tasks/${t}/requests`,{id:randomUUID(),recipientId:to.id,kind:'review',...extra},from));
}
async function envelope(user:User,p?:string,query=''){
  const r=await f.app.inject({url:'/api/v1/workbench?mode=now'+(p?'&projects='+p:'')+query,headers:user.headers});
  assert.equal(r.statusCode,200,r.body);assert.equal(r.headers['cache-control'],'no-store');
  return r.json<WorkbenchEnvelope>();
}
/** Every placed row of an envelope with its section or group. */
function placed(env:WorkbenchEnvelope){
  const out:{place:string;row:WorkbenchRow}[]=[];
  for(const section of env.sections){
    if(section.groups)for(const group of section.groups)for(const row of group.items)out.push({place:group.key,row});
    else for(const row of section.items??[])out.push({place:section.key,row});
  }
  return out;
}
const where=(env:WorkbenchEnvelope,taskId:string)=>placed(env).filter(x=>x.row.taskId===taskId).map(x=>x.place);
const today=()=>new Date().toISOString().slice(0,10);
/** «Просмотрено» on one task: its news is seen, the task returns to its group. */
async function markSeen(p:string,t:string,user:User=f.alice){
  const state=await personal(p,t,user);return ok(call('PUT',`${base(p)}/tasks/${t}/personal/seen`,{baseRevision:state.seenRevision,sequence:state.latestSequence},user));
}
const inDays=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);

test('W01 inclusion matrix: explicit relations only, one task one row, counts equal rows',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'reader']]);
  const B=f.bob;
  await task(p,'req',{},B);await ask(p,'req',B,f.alice);
  await task(p,'review',{status:'review',ownerId:B.id},B);
  await task(p,'due',{due:inDays(1)},B);
  await task(p,'part',{},B);await participate(p,'part');
  await task(p,'auto');
  await task(p,'active',{status:'in_progress',ownerId:f.alice.id},B);
  await task(p,'backlog',{ownerId:f.alice.id},B);
  await task(p,'wait',{ownerId:B.id});
  await task(p,'notmine',{ownerId:B.id},B);
  await task(p,'left');await participate(p,'left',false);
  await task(p,'followed',{},B);await participate(p,'followed');await edit(p,'followed',{status:'in_progress'},B);
  await task(p,'own',{},B);await participate(p,'own');await edit(p,'own',{due:inDays(3)});
  await task(p,'multi',{},B);await participate(p,'multi');await ask(p,'multi',B,f.alice,{kind:'answer'});await edit(p,'multi',{priority:'high',due:inDays(2)},B);
  await task(p,'finished',{},B);await participate(p,'finished');await edit(p,'finished',{status:'ready_for_release'},B);
  await task(p,'mine-joined',{status:'in_progress',ownerId:f.alice.id});
  const env=await envelope(f.alice,p);
  assert.deepEqual(where(env,'req'),['action']);
  assert.deepEqual(where(env,'review'),[],'status review without a recipient is not a request');
  assert.deepEqual(where(env,'due'),[],'a date without a relation is not relevance');
  assert.deepEqual(where(env,'part'),['joined']);
  assert.deepEqual(where(env,'auto'),['joined'],'the author participates in a new task');
  assert.deepEqual(where(env,'active'),['active']);
  assert.deepEqual(where(env,'backlog'),[],'assigned backlog stays off the first screen');
  assert.deepEqual(where(env,'wait'),['waiting'],'assigning while participating is "Жду"');
  assert.deepEqual(where(env,'notmine'),[],'another person\'s task without a relation');
  assert.deepEqual(where(env,'left'),[],'leaving is one command');
  assert.deepEqual(where(env,'followed'),['updates'],'unseen news lifts a task from "Участвую" into "Изменилось"');
  assert.deepEqual(where(env,'finished'),['updates'],'done work leaves "Участвую"; its completion is news');
  assert.deepEqual(where(env,'mine-joined'),['active'],'assigned active work is "В работе" even when I participate');
  assert.deepEqual(where(env,'own'),['joined'],'own edits are not news');
  assert.deepEqual(where(env,'multi'),['action'],'one task, one row, strongest reason');
  const row=(id:string)=>placed(env).find(x=>x.row.taskId===id)!.row;
  const multi=row('multi');
  assert.equal(multi.primaryReason.code,'request_to_you');assert.equal(multi.primaryReason.text,'Борис просит ответить');
  assert.ok(multi.primaryReason.occurredAt);assert.ok(!multi.primaryReason.text.includes(' · '));
  assert.deepEqual(multi.secondaryReasons.map(r=>r.code).sort(),['followed_due_changed','participating']);
  const req=row('req');
  assert.equal(req.owner,null);assert.equal(req.due,null);assert.equal(req.canonicalUrl,`/workbench/tasks/${p}/req`);
  assert.equal(req.statusCategory,'todo');assert.equal(row('active').statusCategory,'active');
  assert.equal('workspaceName' in req,false);
  const followed=row('followed');
  assert.equal(followed.section,'updates');assert.equal(followed.group,null);
  assert.equal(followed.primaryReason.code,'followed_status_changed');assert.equal(followed.primaryReason.text,'Вы наблюдаете: статус «В работе»');
  assert.equal(followed.primaryReason.actor?.id,f.bob.id);assert.ok(followed.secondaryReasons.some(r=>r.code==='participating'));
  // The change is drawable as "было → стало" without another request.
  assert.equal(followed.updates!.count,1);
  assert.deepEqual({...followed.updates!.latest!,at:undefined,sequence:undefined},
    {kind:'status',detail:{from:'ready',to:'in_progress'},actor:{id:f.bob.id,name:'Борис'},actorName:'Борис',at:undefined,sequence:undefined});
  assert.equal(followed.updates!.latest!.sequence,followed.updates!.latestSequence);
  // Once seen, it returns to «Участвую».
  await markSeen(p,'followed');assert.deepEqual(where(await envelope(f.alice,p),'followed'),['joined']);
  assert.equal(followed.personal.participating,true);assert.equal(typeof followed.personal.rank,'number');
  assert.ok(followed.statusEnteredAt);assert.ok(!followed.allowedActions.includes('rankUp'),'order is set only in «Участвую»');
  assert.equal(row('finished').primaryReason.text,'Вы наблюдаете: работа завершена');assert.equal(row('finished').statusCategory,'done');
  assert.equal(row('mine-joined').personal.participating,true);assert.ok(!row('mine-joined').allowedActions.includes('rankUp'));
  assert.equal(row('auto').primaryReason.text,'Вы наблюдаете');
  assert.equal(row('wait').primaryReason.text,'Поручено: Борис');
  // Snapshot: each count equals its rows, no task twice anywhere.
  const [action,current,updates]=env.sections;
  assert.equal(action!.count,action!.items!.length);assert.equal(updates!.count,updates!.items!.length);
  for(const group of current!.groups!)assert.equal(group.count,group.items.length,group.key);
  assert.deepEqual(current!.groups!.map(g=>g.key),['joined','active','waiting']);
  assert.equal(current!.groups!.find(g=>g.key==='joined')!.count,3);assert.equal(updates!.count,2);
  assert.equal(current!.count,current!.groups!.reduce((sum,g)=>sum+g.count,0));
  assert.equal(current!.backlogCount,1);
  const keys=placed(env).map(x=>x.row.key);assert.equal(new Set(keys).size,keys.length);
  const backlog=await ok<WorkbenchPage>(f.app.inject({url:`/api/v1/workbench/list?section=backlog&projects=${p}`,headers:f.alice.headers}));
  assert.deepEqual(backlog.items.map(r=>r.taskId),['backlog']);assert.equal(backlog.items[0]!.primaryReason.code,'assigned_backlog');
  // Another person sees their own projection only.
  const bob=await envelope(f.bob,p);
  assert.deepEqual(where(bob,'review'),['active']);assert.deepEqual(where(bob,'auto'),[]);assert.deepEqual(where(bob,'left'),[]);
  assert.equal(placed(await envelope(carol,p)).length,0);
});

test('W02 reading never resolves; resolve demotes deterministically; undo; resolve and reassign race',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor'],[dan,'reader']]);
  await task(p,'t');
  const request=await ask(p,'t',f.bob,f.alice,{note:'Посмотри, пожалуйста'});
  assert.deepEqual(where(await envelope(f.alice,p),'t'),['action']);
  const state=await personal(p,'t');
  await ok(call('PUT',`${base(p)}/tasks/t/personal/seen`,{baseRevision:state.seenRevision,sequence:state.latestSequence}));
  assert.equal(state.requests[0].status,'open');assert.equal(state.requests[0].note,'Посмотри, пожалуйста');
  assert.deepEqual(where(await envelope(f.alice,p),'t'),['action'],'read is not resolved');
  assert.equal((await call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},f.bob)).statusCode,403);
  assert.equal((await call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},dan)).statusCode,403);
  const key=randomUUID();
  const resolved=await ok<any>(call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},f.alice,key));
  assert.equal(resolved.status,'resolved');
  assert.deepEqual(await ok(call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},f.alice,key)),resolved,'retry after a lost response');
  assert.deepEqual(where(await envelope(f.alice,p),'t'),['joined'],'the next reason takes over');
  const again=await call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:resolved.revision});
  assert.equal(again.statusCode,409);assert.equal(again.json().code,'REQUEST_CLOSED');
  const reopened=await ok<any>(call('POST',`${base(p)}/requests/${request.id}/reopen`,{baseRevision:resolved.revision}));
  assert.equal(reopened.status,'open');assert.deepEqual(where(await envelope(f.alice,p),'t'),['action']);
  // The recipient resolves while the requester hands the request to someone else: exactly one wins.
  const race=await Promise.all([
    call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:reopened.revision}),
    call('PATCH',`${base(p)}/requests/${request.id}`,{baseRevision:reopened.revision,recipientId:carol.id,neededBy:null},f.bob),
  ]);
  assert.deepEqual(race.map(r=>r.statusCode).sort(),[200,409]);
  const loser=race.find(r=>r.statusCode===409)!;assert.ok(['CONFLICT','REQUEST_CLOSED'].includes(loser.json().code));
  // Recipient rules: a reader, oneself and a stranger cannot be asked.
  for(const to of [dan,f.bob,f.reader])assert.equal((await call('POST',`${base(p)}/tasks/t/requests`,{id:randomUUID(),recipientId:to.id,kind:'answer'},f.bob)).statusCode,422);
  assert.equal((await call('POST',`${base(p)}/tasks/t/requests`,{id:randomUUID(),recipientId:f.alice.id,kind:'answer',neededBy:inDays(-2)},f.bob)).statusCode,422);
  assert.equal((await call('POST',`${base(p)}/tasks/t/requests`,{id:randomUUID(),recipientId:f.alice.id,kind:'answer'},dan)).statusCode,403);
});

test('W03 snooze is bounded by neededBy, a new request pierces it, a passed neededBy returns it',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'s',{},f.bob);
  const state0=await personal(p,'s');
  const nothing=await call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state0.snoozeRevision,until:new Date(Date.now()+3600000).toISOString()});
  assert.equal(nothing.statusCode,422);assert.equal(nothing.json().code,'SNOOZE_NOTHING');
  const request=await ask(p,'s',f.bob,f.alice,{neededBy:inDays(2)});
  const state=await personal(p,'s');
  const late=await call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state.snoozeRevision,until:inDays(3)+'T12:00:00Z'});
  assert.equal(late.statusCode,422);assert.equal(late.json().code,'SNOOZE_AFTER_NEEDED_BY');
  const far=await call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state.snoozeRevision,until:inDays(40)+'T00:00:00Z'});
  assert.equal(far.statusCode,422);
  await ok(call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state.snoozeRevision,until:inDays(1)+'T09:00:00Z'}));
  let env=await envelope(f.alice,p);
  assert.deepEqual(where(env,'s'),[]);assert.equal(env.sections[0]!.snoozedCount,1);
  const snoozed=await ok<WorkbenchPage>(f.app.inject({url:`/api/v1/workbench/list?section=snoozed&projects=${p}`,headers:f.alice.headers}));
  assert.deepEqual(snoozed.items.map(r=>r.taskId),['s']);assert.ok(snoozed.items[0]!.personal.snoozedUntil);
  // A passed neededBy brings the request back without any action of the person.
  await f.admin.query('UPDATE app.attention_requests SET needed_by=$3 WHERE project_id=$1 AND id=$2',[p,request.id,inDays(-1)]);
  env=await envelope(f.alice,p);assert.deepEqual(where(env,'s'),['action']);assert.equal(env.sections[0]!.snoozedCount,0);
  await f.admin.query('UPDATE app.attention_requests SET needed_by=$3 WHERE project_id=$1 AND id=$2',[p,request.id,inDays(2)]);
  assert.deepEqual(where(await envelope(f.alice,p),'s'),[]);
  // A newer request is not hidden by an older snooze.
  await ask(p,'s',f.bob,f.alice,{kind:'decision'});
  env=await envelope(f.alice,p);assert.deepEqual(where(env,'s'),['action']);
  const row=placed(env).find(x=>x.row.taskId==='s')!.row;assert.equal(row.request!.kind,'decision');
  // Unsnooze is the same command with null (the toast's undo).
  const current=await personal(p,'s');
  await ok(call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:current.snoozeRevision,until:null}));
  assert.equal((await envelope(f.alice,p)).sections[0]!.snoozedCount,0);
});

test('W04 private fields: independent revisions, receipts, replay, and nothing reaches shared audit, outbox or SSE',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'x');
  const audit=async()=>(await f.admin.query<{n:number}>('SELECT (SELECT count(*) FROM app.audit_events WHERE project_id=$1)+(SELECT count(*) FROM app.outbox WHERE project_id=$1)+(SELECT count(*) FROM app.idempotency WHERE project_id=$1) AS n',[p])).rows[0]!.n;
  const head=await ok<{cursor:string}>(call('GET',`${base(p)}/events/head`,undefined,f.bob));
  const before=await audit();
  const s=await personal(p,'x');assert.equal(s.participating,true,'the author participates');
  // Two tabs from the same read: seen and participation do not collide.
  const [seen,left]=await Promise.all([
    call('PUT',`${base(p)}/tasks/x/personal/seen`,{baseRevision:s.seenRevision,sequence:s.latestSequence}),
    call('PUT',`${base(p)}/tasks/x/personal/participation`,{baseRevision:s.participationRevision,participating:false}),
  ]);
  assert.equal(seen.statusCode,200,seen.body);assert.equal(left.statusCode,200,left.body);
  const stale=await call('PUT',`${base(p)}/tasks/x/personal/participation`,{baseRevision:s.participationRevision,participating:true});
  assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'CONFLICT');
  // Replay returns the original effect, marked; the same key with another body conflicts.
  const s2=await personal(p,'x');
  const key=randomUUID();
  const first=await ok<any>(call('PUT',`${base(p)}/tasks/x/personal/participation`,{baseRevision:s2.participationRevision,participating:true},f.alice,key));
  assert.equal(first.replayed,false);assert.equal(first.participating,true);
  await participate(p,'x',false);
  const replay=await ok<any>(call('PUT',`${base(p)}/tasks/x/personal/participation`,{baseRevision:s2.participationRevision,participating:true},f.alice,key));
  assert.equal(replay.replayed,true);assert.equal(replay.revision,first.revision);assert.equal((await personal(p,'x')).participating,false,'replay is not current state');
  const conflict=await call('PUT',`${base(p)}/tasks/x/personal/participation`,{baseRevision:s2.participationRevision,participating:false},f.alice,key);
  assert.equal(conflict.statusCode,409);assert.equal(conflict.json().code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await call('PUT',`${base(p)}/tasks/x/personal/participation`,{baseRevision:0,participating:true,rank:1})).statusCode,400,'one field per command');
  assert.equal(await audit(),before,'no shared audit, outbox or retry ledger entry');
  const events=await ok<any>(call('GET',`${base(p)}/events?cursor=${encodeURIComponent(head.cursor)}`,undefined,f.bob));
  assert.equal(JSON.stringify(events).includes('personal'),false);assert.equal((events.items??events.events??[]).length,0);
  // Row security: a colleague sees none of it, through SQL under their own context or over HTTP.
  const rows=await f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.task_personal_state WHERE project_id=$1',[p]));
  assert.equal(rows.rowCount,0);
  const receipts=await f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.private_receipts'));assert.equal(receipts.rowCount,0);
  const own=await f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.private_receipts WHERE project_id=$1',[p]));assert.ok((own.rowCount??0)>0);
  const bobView=await personal(p,'x',f.bob);assert.equal(bobView.participating,false);
  await assert.rejects(f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query('UPDATE app.private_receipts SET result=$1',['{}'])),/permission denied/);
  // The request that touched a project task still reaches the shared log; its reads do not.
  await ask(p,'x',f.bob,f.alice);assert.ok(await audit()>before);
});

test('W05 security: never-member, former member, cursor replay, wrong pair, agent, no-store',async()=>{
  const p=await project([[f.bob,'editor']]);
  for(let i=0;i<12;i++)await task(p,'f'+i);
  const env=await envelope(f.alice,p,'&limit=5');
  const group=env.sections[1]!.groups!.find(g=>g.key==='joined')!;assert.equal(group.count,12);assert.equal(group.items.length,5);
  const cursor=group.nextCursor!;
  // Never-member: the filter naming a foreign project answers exactly like an unknown id.
  const foreign=await envelope(dan,p),unknown=await envelope(dan,'nope');
  assert.deepEqual(foreign.sections,unknown.sections);assert.equal(foreign.scope.projectCount,0);
  const list=(user:User,query:string)=>f.app.inject({url:`/api/v1/workbench/list?${query}`,headers:user.headers});
  const foreignList=await list(dan,`section=joined&projects=${p}&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(foreignList.statusCode,400);assert.equal(foreignList.json().code,'CURSOR_INVALID');
  assert.equal((await list(f.alice,`section=joined&cursor=${encodeURIComponent(cursor)}`)).json().code,'CURSOR_INVALID');
  assert.equal((await list(f.alice,`section=active&projects=${p}&cursor=${encodeURIComponent(cursor)}`)).json().code,'CURSOR_INVALID');
  const garbage=await list(f.alice,`section=joined&projects=${p}&cursor=abc.def`);
  assert.equal(garbage.statusCode,400);assert.equal(garbage.json().code,'CURSOR_INVALID');
  assert.equal((await f.app.inject({url:'/api/v1/workbench?limit=51',headers:f.alice.headers})).statusCode,400);
  assert.equal((await f.app.inject({url:'/api/v1/workbench?mode=later',headers:f.alice.headers})).statusCode,400);
  assert.equal((await f.app.inject({url:'/api/v1/workbench?projects=a,b%20c',headers:f.alice.headers})).statusCode,400);
  // Wrong (projectId, taskId) pair and a foreign project answer like a missing task.
  const other=await project();await task(other,'mine');
  assert.equal((await call('GET',`${base(p)}/tasks/mine/personal`)).statusCode,404);
  assert.equal((await call('GET',`${base(other)}/tasks/f0/personal`)).statusCode,404);
  assert.equal((await call('GET',`${base(p)}/tasks/f0/personal`,undefined,dan)).statusCode,404);
  assert.equal((await call('PUT',`${base(p)}/tasks/f0/personal/participation`,{baseRevision:0,participating:true},dan)).statusCode,404);
  // Former member: bob participates, loses access; his rows vanish, his cursor turns stale, the rows come back with access.
  for(let i=0;i<6;i++)await participate(p,'f'+i,true,f.bob);
  const bobEnv=await envelope(f.bob,p,'&limit=5');const bobCursor=bobEnv.sections[1]!.groups!.find(g=>g.key==='joined')!.nextCursor!;
  const member=(await ok<any[]>(call('GET',`${base(p)}/members`))).find(m=>m.id===f.bob.id);
  await ok(call('PATCH',`${base(p)}/members/${f.bob.id}`,{baseRevision:member.revision,role:null}));
  const after=await envelope(f.bob,p);assert.equal(placed(after).length,0);assert.equal(after.scope.projectCount,0);
  const staleCursor=await list(f.bob,`section=joined&projects=${p}&cursor=${encodeURIComponent(bobCursor)}`);
  assert.equal(staleCursor.statusCode,409);assert.equal(staleCursor.json().code,'CURSOR_STALE');
  assert.equal((await call('GET',`${base(p)}/tasks/f0/personal`,undefined,f.bob)).statusCode,404);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[p,f.bob.id]);
  assert.equal((await envelope(f.bob,p)).sections[1]!.groups!.find(g=>g.key==='joined')!.count,6,'rows return with access');
  // An agent has no cross-project read and no personal state.
  const grant=await ok<{token:string}>(call('POST',`${base(p)}/agents`,{name:'Агент',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}));
  const agent={authorization:'Bearer '+grant.token};
  for(const url of ['/api/v1/workbench','/api/v1/workbench/plan',`${base(p)}/tasks/f0/personal`]){
    const r=await f.app.inject({url,headers:agent});assert.equal(r.statusCode,403,url);assert.equal(r.json().code,'HUMAN_REQUIRED');
  }
  assert.equal((await f.app.inject({url:'/api/v1/workbench'})).statusCode,401);
});

test('W06 keyset pagination: pages are disjoint, complete and ordered; counts match; rank is manual',async()=>{
  const p=await project();
  const ids:string[]=[];for(let i=0;i<23;i++){await task(p,'k'+i,{status:'in_progress',ownerId:f.alice.id,priority:i%3?'normal':'high'});ids.push('k'+i);}
  const env=await envelope(f.alice,p,'&limit=10');
  const active=env.sections[1]!.groups!.find(g=>g.key==='active')!;assert.equal(active.count,23);
  assert.equal(env.sections[1]!.groups!.find(g=>g.key==='joined')!.count,0,'active work is not repeated under participation');
  const seen=active.items.map(r=>r.taskId);let cursor=active.nextCursor;let pages=1;
  while(cursor){
    const page=await ok<WorkbenchPage>(f.app.inject({url:`/api/v1/workbench/list?section=active&projects=${p}&limit=10&cursor=${encodeURIComponent(cursor)}`,headers:f.alice.headers}));
    assert.equal(page.count,23);seen.push(...page.items.map(r=>r.taskId));cursor=page.nextCursor;pages++;
  }
  assert.equal(pages,3);assert.equal(new Set(seen).size,23);assert.deepEqual([...seen].sort(),[...ids].sort());
  // High priority first inside one stage.
  const high=seen.findIndex(id=>Number(id.slice(1))%3!==0);assert.ok(seen.slice(0,high).every(id=>Number(id.slice(1))%3===0));
  // The order of what the person participates in is manual and movable by buttons.
  const q=await project();
  for(const id of ['r0','r1','r2'])await task(q,id);
  const order=async()=>(await envelope(f.alice,q)).sections[1]!.groups!.find(g=>g.key==='joined')!.items.map(r=>r.taskId);
  assert.deepEqual(await order(),['r0','r1','r2']);
  await ok(rank(q,'r2','up'));assert.deepEqual(await order(),['r0','r2','r1']);
  await ok(rank(q,'r0','down'));assert.deepEqual(await order(),['r2','r0','r1']);
  const edge=await rank(q,'r2','up');assert.equal(edge.statusCode,422);assert.equal(edge.json().code,'RANK_EDGE');
  // Without the filter the same move is relative to the person's whole order, which spans other projects.
  assert.equal((await rank(q,'r2','up',f.alice,null)).statusCode,200);
  assert.deepEqual(await order(),['r2','r0','r1'],'the visible order is unchanged by a move past an invisible row');
  // Moving the last row up again and again halves one gap until none is left; the ranks are then renumbered
  // and the order stays exactly what the person set.
  let expected=['r2','r0','r1'];
  for(let i=0;i<24;i++){
    const last=expected.at(-1)!;await ok(rank(q,last,'up'));expected=[...expected.slice(0,-2),last,expected.at(-2)!];
    assert.deepEqual(await order(),expected,`move ${i}`);
  }
  const ranks=(await f.admin.query<{rank:string}>('SELECT rank FROM app.task_personal_state WHERE principal_id=$1 AND participating',[f.alice.id])).rows.map(r=>r.rank);
  assert.equal(new Set(ranks).size,ranks.length,'ranks stay distinct after renumbering');
  const notIn=await project([[f.bob,'editor']]);await task(notIn,'z',{},f.bob);
  assert.equal((await rank(notIn,'z','up')).json().code,'NOT_PARTICIPATING');
});

test('W07 "Жду": assigning while participating; check-back; reassignment and completion named; leaving ends it',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor']]);
  await task(p,'d');
  assert.equal((await checkBack(p,'d',inDays(3))).json().code,'NOT_WAITING','no check-back before delegation');
  await edit(p,'d',{ownerId:f.bob.id});
  const state=await personal(p,'d');assert.equal(state.delegated.expectedAssigneeId,f.bob.id);
  let row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;
  assert.equal(row.place,'waiting');assert.equal(row.row.primaryReason.code,'delegated_by_you');assert.equal(row.row.primaryReason.text,'Поручено: Борис');
  assert.ok(row.row.waiting!.assignedAt);
  await ok(checkBack(p,'d',inDays(3)));
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;assert.equal(row.row.waiting!.checkBackAt,inDays(3));
  // Someone else's assignment while I participate is not my delegation: news, then back to "Участвую".
  await task(p,'theirs',{},f.bob);await participate(p,'theirs');await edit(p,'theirs',{ownerId:carol.id},f.bob);
  const theirs=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='theirs')!;
  assert.equal(theirs.place,'updates');assert.equal(theirs.row.waiting,null);
  await markSeen(p,'theirs');assert.deepEqual(where(await envelope(f.alice,p),'theirs'),['joined']);
  assert.deepEqual(theirs.row.updates!.latest!.detail,{from:null,to:{id:carol.id,name:'Карина'}});
  // Assigning to myself is my active work, not waiting.
  await task(p,'self');await edit(p,'self',{ownerId:f.alice.id,status:'in_progress'});
  assert.deepEqual(where(await envelope(f.alice,p),'self'),['active']);
  // Reassignment and completion are news first, then named on the "Жду" row; the control stays until the person leaves.
  await edit(p,'d',{ownerId:carol.id},f.bob);
  assert.deepEqual(where(await envelope(f.alice,p),'d'),['updates'],'a colleague\'s reassignment lifts it into «Изменилось»');
  await markSeen(p,'d');
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;assert.equal(row.place,'waiting');
  assert.equal(row.row.primaryReason.code,'delegated_reassigned');assert.equal(row.row.primaryReason.text,'Поручено: Борис, сейчас исполняет Карина');
  assert.deepEqual({...row.row.waiting!,assignedAt:undefined},{expectedAssignee:{id:f.bob.id,name:'Борис'},expectedAssigneeLeft:false,
    ownerNow:{id:carol.id,name:'Карина'},checkBackAt:inDays(3),done:false,doneAt:null,assignedAt:undefined});
  await edit(p,'d',{status:'ready_for_release'},carol);await markSeen(p,'d');
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;
  assert.equal(row.place,'waiting');assert.equal(row.row.primaryReason.code,'delegated_completed');assert.equal(row.row.waiting!.done,true);
  await participate(p,'d',false);
  assert.deepEqual(where(await envelope(f.alice,p),'d'),[],'leaving ends the control');
  // Leaving drops the check-back date too: a later join does not revive an old date (review R2 F5).
  assert.equal((await personal(p,'d')).checkBackAt,null);
  await participate(p,'d');
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;assert.equal(row.place,'waiting');assert.equal(row.row.waiting!.checkBackAt,null);
  assert.equal((await ok<any>(call('GET',`${base(p)}/tasks/d`))).status,'ready_for_release','the task itself is untouched');
  // An agent's new task does not make anyone participate.
  const grant=await ok<{token:string}>(call('POST',`${base(p)}/agents`,{name:'Агент',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}));
  await ok(f.app.inject({method:'PUT',url:`${base(p)}/tasks/by-agent`,headers:{authorization:'Bearer '+grant.token,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'От агента'}}}));
  assert.deepEqual(where(await envelope(f.alice,p),'by-agent'),[]);
});

test('W08 requests follow their source: thread and approval resolution, membership loss orphans and reassigns',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor']]);
  await task(p,'q',{},f.bob);
  const thread=await ok<any>(call('POST',`${base(p)}/tasks/q/threads`,{id:'question',messageId:'m1',body:'Какой срок?',requiresResolution:true},f.bob));
  const request=await ask(p,'q',f.bob,f.alice,{kind:'answer',threadId:'question'});
  assert.equal(request.threadId,'question');
  const unrelated=await call('POST',`${base(p)}/tasks/q/requests`,{id:randomUUID(),recipientId:f.alice.id,kind:'answer',threadId:'missing'},f.bob);assert.equal(unrelated.statusCode,422);
  await ok(call('PATCH',`${base(p)}/threads/question/resolution`,{resolved:true,baseRevision:thread.revision}));
  const after=(await personal(p,'q')).requests.find((r:any)=>r.id===request.id);assert.equal(after.status,'resolved');
  assert.deepEqual(where(await envelope(f.alice,p),'q'),[]);
  // The requester learns about it in «Изменилось» (Bob is its author and participates).
  const bobRow=placed(await envelope(f.bob,p)).find(x=>x.row.taskId==='q')!;assert.equal(bobRow.place,'updates');
  assert.equal(bobRow.row.primaryReason.code,'request_resolved');
  assert.deepEqual(bobRow.row.updates!.latest!.detail,{change:'resolved',requestKind:'answer'});
  // An approval source: a decision resolves the request made on it.
  const approval=randomUUID();
  await f.admin.query("INSERT INTO app.approvals(project_id,id,subject_kind,subject_id,action_hash,requested_by,initiator_id,expires_at) VALUES($1,$2,'plan',$3,'hash',$4,$4,now()+interval '1 day')",[p,approval,randomUUID(),f.bob.id]);
  const onApproval=await ask(p,'q',f.bob,f.alice,{kind:'approval',approvalId:approval});
  const mismatched=await call('POST',`${base(p)}/tasks/q/requests`,{id:randomUUID(),recipientId:f.alice.id,kind:'review',approvalId:approval},f.bob);
  assert.equal(mismatched.statusCode,422,'approval kind and source go together');assert.equal(mismatched.json().code,'REQUEST_SOURCE');
  const approvalRow=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='q')!.row;
  assert.equal(approvalRow.primaryReason.code,'approval_to_you');assert.deepEqual(approvalRow.action,{kind:'approve',inline:true});
  // The decision from the row is taken against the approval revision the request was made on (review R4 F3).
  assert.equal(approvalRow.request!.sourceRevision,1);
  const stale=await call('POST',`${base(p)}/approvals/${approval}/decision`,{baseRevision:approvalRow.request!.sourceRevision!+1,status:'approved'});
  assert.equal(stale.statusCode,409,'a decision against another revision is refused');
  await ok(call('POST',`${base(p)}/approvals/${approval}/decision`,{baseRevision:1,status:'approved'}));
  assert.equal((await personal(p,'q')).requests.find((r:any)=>r.id===onApproval.id).status,'resolved');
  // Membership loss: open requests become orphaned, visible to the requester, then reassigned.
  const toCarol=await ask(p,'q',f.bob,carol);
  const member=(await ok<any[]>(call('GET',`${base(p)}/members`))).find(m=>m.id===carol.id);
  await ok(call('PATCH',`${base(p)}/members/${carol.id}`,{baseRevision:member.revision,role:'reader'}));
  const orphan=(await personal(p,'q')).requests.find((r:any)=>r.id===toCarol.id);assert.equal(orphan.status,'orphaned');
  assert.equal(placed(await envelope(carol,p)).length,0);
  const bobUpdate=placed(await envelope(f.bob,p)).find(x=>x.row.taskId==='q')!;
  assert.equal(bobUpdate.place,'updates');assert.equal(bobUpdate.row.primaryReason.code,'request_orphaned');
  assert.ok(bobUpdate.row.primaryReason.text.endsWith(': адресат больше не в проекте'));
  // Without participation the requester's own request is the relation: its news is still "Изменилось".
  await participate(p,'q',false,f.bob);
  const onlyRequest=placed(await envelope(f.bob,p)).find(x=>x.row.taskId==='q')!;
  assert.equal(onlyRequest.place,'updates');assert.equal(onlyRequest.row.primaryReason.code,'request_orphaned');
  const reassigned=await ok<any>(call('PATCH',`${base(p)}/requests/${toCarol.id}`,{baseRevision:orphan.revision,recipientId:f.alice.id,neededBy:inDays(1)},f.bob));
  assert.equal(reassigned.status,'open');assert.deepEqual(where(await envelope(f.alice,p),'q'),['action']);
  const cancelled=await ok<any>(call('POST',`${base(p)}/requests/${toCarol.id}/cancel`,{baseRevision:reassigned.revision},f.bob));
  assert.equal(cancelled.status,'cancelled');assert.deepEqual(where(await envelope(f.alice,p),'q'),[]);
});

test('W09 plan: today and seven days keep due, planned, answer, check-back and milestone distinct',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'due-today',{ownerId:f.alice.id,due:today()});
  await task(p,'overdue',{ownerId:f.alice.id,due:inDays(-3),status:'in_progress'});
  await task(p,'later',{ownerId:f.alice.id,due:inDays(5)});
  await task(p,'planned',{ownerId:f.alice.id});
  await f.admin.query('UPDATE app.tasks SET planned_start=$3,planned_end=$4 WHERE project_id=$1 AND id=$2',[p,'planned',inDays(1),inDays(2)]);
  await task(p,'asked',{},f.bob);await ask(p,'asked',f.bob,f.alice,{neededBy:inDays(2)});
  await task(p,'deleg',{ownerId:f.bob.id});await ok(checkBack(p,'deleg',inDays(4)));
  await task(p,'undated');
  await task(p,'foreign-due',{ownerId:f.bob.id,due:today()},f.bob);
  await f.admin.query("INSERT INTO app.milestones(project_id,id,title,date) VALUES($1,'m1','Бета',$2)",[p,inDays(6)]);
  const hidden=await project();await task(hidden,'secret',{ownerId:f.alice.id,due:today()});
  await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[hidden,f.alice.id]);
  const plan=(query:string)=>ok<PlanHorizon>(f.app.inject({url:`/api/v1/workbench/plan?${query}`,headers:f.alice.headers}));
  const today1=await plan(`horizon=today&timezone=UTC&projects=${p},${hidden}`);
  assert.equal(today1.days.length,1);assert.equal(today1.from,today());
  const kinds=today1.days[0]!.items.map(i=>`${i.kind}:${i.task?.id??i.milestone?.id}`).sort();
  assert.deepEqual(kinds,['due:due-today','due:overdue']);
  assert.equal(today1.days[0]!.items.find(i=>i.task?.id==='overdue')!.overdue,true);
  assert.equal(today1.days[0]!.items.find(i=>i.task?.id==='overdue')!.task!.statusCategory,'active');
  assert.deepEqual(today1.undated.map(i=>i.task!.id),['undated']);
  const week=await plan(`horizon=7d&timezone=UTC&projects=${p},${hidden}`);
  assert.equal(week.days.length,7);assert.equal(week.to,inDays(6));
  const all=week.days.flatMap(d=>d.items.map(i=>`${d.date}:${i.kind}:${i.task?.id??i.milestone?.id}`));
  for(const expected of [`${inDays(1)}:planned:planned`,`${inDays(2)}:planned:planned`,`${inDays(2)}:neededBy:asked`,`${inDays(4)}:checkBack:deleg`,
    `${inDays(5)}:due:later`,`${inDays(6)}:milestone:m1`])assert.ok(all.includes(expected),expected+' in '+all.join(', '));
  assert.ok(!all.some(x=>x.includes('foreign-due')),'another person\'s deadline is not my plan');
  assert.ok(!JSON.stringify(week).includes('secret'),'an inaccessible project is excluded before grouping');
  assert.equal(week.days.flatMap(d=>d.items).find(i=>i.kind==='neededBy')!.date,inDays(2),'a date-only value stays a date');
  // Each item says why it is my time and carries what a card needs (review R2 F7).
  const items=week.days.flatMap(d=>d.items);
  const item=(kind:string,id:string)=>items.find(i=>i.kind===kind&&i.task?.id===id)!;
  assert.equal(item('due','later').relation,'assigned');assert.equal(item('neededBy','asked').relation,'request');
  assert.equal(item('checkBack','deleg').relation,'waiting');assert.equal(items.find(i=>i.kind==='milestone')!.relation,null);
  assert.deepEqual(item('checkBack','deleg').task!.owner,{id:f.bob.id,name:'Борис'});
  assert.equal(item('planned','planned').task!.plannedStart,inDays(1));assert.equal(item('planned','planned').task!.due,null);
  assert.equal(item('due','later').task!.priority,'normal');
  assert.equal(week.undated[0]!.relation,'participating');
  assert.deepEqual(week.summary,{itemCount:items.length,overdueCount:1,undatedCount:1,undatedTruncated:false});
  assert.equal(new Set(items.map(i=>i.key)).size,items.length,'item keys are unique');
  // The overview's week asks only for the number of undated tasks.
  const overview=await plan(`horizon=7d&timezone=UTC&undated=count&projects=${p}`);
  assert.deepEqual(overview.undated,[]);assert.equal(overview.summary.undatedCount,1);assert.equal(overview.days.length,7);
  assert.equal((await f.app.inject({url:'/api/v1/workbench/plan?undated=all',headers:f.alice.headers})).statusCode,400);
  // Two requests on one task due the same day are two items with two keys (review R2 F11).
  await ask(p,'asked',f.bob,f.alice,{kind:'answer',neededBy:inDays(2)});
  const twice=(await plan(`horizon=7d&timezone=UTC&projects=${p}`)).days.flatMap(d=>d.items).filter(i=>i.kind==='neededBy');
  assert.equal(twice.length,2);assert.notEqual(twice[0]!.key,twice[1]!.key);
  // The chosen time zone is kept; the default names its source.
  assert.equal(today1.timezoneSource,'request');
  const saved=await ok<any>(call('PUT','/api/v1/workbench/preferences',{baseRevision:0,timezone:'Pacific/Kiritimati'}));
  assert.deepEqual(saved,{timezone:'Pacific/Kiritimati',layout:{currentForm:'lanes'},revision:1});
  assert.equal((await call('PUT','/api/v1/workbench/preferences',{baseRevision:0,timezone:'UTC'})).statusCode,409);
  assert.equal((await call('PUT','/api/v1/workbench/preferences',{baseRevision:saved.revision,timezone:'Mars/Base'})).statusCode,400);
  const kiritimati=await plan(`projects=${p}`);
  assert.equal(kiritimati.timezone,'Pacific/Kiritimati');assert.equal(kiritimati.timezoneSource,'preference');
  // UTC+14: local today is already tomorrow for most of the UTC day, or today late in it; never yesterday.
  assert.ok([today(),inDays(1)].includes(kiritimati.today));
  assert.equal((await f.app.inject({url:'/api/v1/workbench/plan?timezone=%2B03:00',headers:f.alice.headers})).statusCode,400);
});

test('W10 flags: off means not found and the session names what is on',async()=>{
  const session=await ok<any>(call('GET','/api/v1/session'));
  assert.deepEqual(session.features,['workbench_mvp','workbench_personal_state','workbench_plan_horizon','workbench_read_internal','workbench_requests','workbench_waiting']);
  const off=await startApp({settings:{SPRINTIQUE_FEATURES:'workbench_read_internal'}});
  try{
    const env=await off.inject({url:'/api/v1/workbench',headers:f.alice.headers});assert.equal(env.statusCode,200,env.body);
    assert.deepEqual(env.json().features,{requests:false,participation:false,waiting:false});
    const p=await project([[f.bob,'editor']]);await task(p,'z');
    // With personal state off a new task's author does not join it: the switch stops that path too (review R2 F4).
    const created=await off.inject({method:'PUT',url:`${base(p)}/tasks/quiet`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'Тихо'}}});
    assert.equal(created.statusCode,200,created.body);
    const quiet=await off.inject({url:`${base(p)}/tasks/quiet/personal`,headers:f.alice.headers});
    assert.equal(quiet.json().participating,false);assert.equal(quiet.json().participationRevision,0);
    for(const [method,url,payload] of [
      ['GET','/api/v1/workbench/plan',undefined],
      ['PUT',`${base(p)}/tasks/z/personal/participation`,{baseRevision:1,participating:false}],
      ['PUT',`${base(p)}/tasks/z/personal/check-back`,{baseRevision:0,checkBackAt:null}],
      ['POST',`${base(p)}/tasks/z/requests`,{id:randomUUID(),recipientId:f.bob.id,kind:'answer'}],
    ] as const){
      const r=await off.inject({method,url,headers:{...f.alice.headers,'idempotency-key':randomUUID()},...(payload?{payload}:{})});assert.equal(r.statusCode,404,url);
    }
    assert.deepEqual((await off.inject({url:'/api/v1/session',headers:f.alice.headers})).json().features,['workbench_read_internal']);
    // The overview's layout lives with the Workbench, not with the plan (review R3 F3).
    assert.equal((await off.inject({url:'/api/v1/workbench/preferences',headers:f.alice.headers})).statusCode,200);
    const seen=await off.inject({method:'PUT',url:`${base(p)}/tasks/z/personal/seen`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,sequence:0}});
    assert.equal(seen.statusCode,404,'seen with nothing it serves is not found');
  }finally{await off.close();}
  // "Жду" is derived from participation: switched on alone it is reported off and its command is not found.
  const waitingOnly=await startApp({settings:{SPRINTIQUE_FEATURES:'workbench_read_internal,workbench_waiting'}});
  try{
    const env=await waitingOnly.inject({url:'/api/v1/workbench',headers:f.alice.headers});
    assert.deepEqual(env.json().features,{requests:false,participation:false,waiting:false});
    const p=await project();await task(p,'w');
    const r=await waitingOnly.inject({method:'PUT',url:`${base(p)}/tasks/w/personal/check-back`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,checkBackAt:null}});
    assert.equal(r.statusCode,404);
  }finally{await waitingOnly.close();}
  // The production default (nothing named = nothing on) is proven by FeatureFlagsTest: a production process needs HTTPS.
});

test('W11 blockers: my work blocked, delegated work blocked, events on both ends of a dependency',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'mine',{status:'in_progress',ownerId:f.alice.id},f.bob);await task(p,'blocker',{ownerId:f.bob.id},f.bob);
  await task(p,'deleg',{ownerId:f.bob.id});
  await ok(call('PUT',`${base(p)}/task-links/l1`,{baseRevision:0,value:{kind:'depends',fromId:'mine',toId:'blocker'}},f.bob));
  await ok(call('PUT',`${base(p)}/task-links/l2`,{baseRevision:0,value:{kind:'depends',fromId:'deleg',toId:'blocker'}},f.bob));
  const env=await envelope(f.alice,p);
  const mine=placed(env).find(x=>x.row.taskId==='mine')!;
  assert.equal(mine.place,'active');assert.equal(mine.row.primaryReason.code,'your_work_blocked');
  const blockerKey=(await ok<any>(call('GET',`${base(p)}/tasks/blocker`))).displayId;
  assert.equal(mine.row.primaryReason.text,`Назначено вам, заблокирована задачей ${blockerKey}`);assert.equal(mine.row.blockedBy?.displayId,blockerKey);
  // The new blocker is news first; seen, the "Жду" row still names the open blocker.
  assert.deepEqual(where(env,'deleg'),['updates']);
  await markSeen(p,'deleg');
  const deleg=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='deleg')!;
  assert.equal(deleg.place,'waiting');assert.equal(deleg.row.primaryReason.code,'delegated_blocked');
  assert.equal(deleg.row.primaryReason.text,`Поручено: Борис, заблокирована задачей ${(await ok<any>(call('GET',`${base(p)}/tasks/blocker`))).displayId}`);
  const events=(await f.admin.query<{task_id:string;role:string;other:string}>("SELECT task_id,detail->>'role' AS role,detail->>'other' AS other FROM app.task_activity WHERE project_id=$1 AND kind='dependency' ORDER BY sequence",[p])).rows;
  assert.deepEqual(events.slice(0,2),[{task_id:'mine',role:'blocked_by',other:'blocker'},{task_id:'blocker',role:'blocks',other:'mine'}]);
  assert.ok(!where(await envelope(f.bob,p),'blocker').includes('action'),'blocking someone is not an action without a request');
});

test('W12 own noise: edits by my own agent are not news, a colleague\'s are',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'watched');
  const grant=await ok<{token:string}>(call('POST',`${base(p)}/agents`,{name:'Мой агент',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}));
  const agent={headers:{authorization:'Bearer '+grant.token}} as unknown as User;
  await edit(p,'watched',{status:'in_progress',due:inDays(4)},agent);
  const own=(await f.admin.query<{actor_id:string;initiator_id:string}>("SELECT actor_id,initiator_id FROM app.task_activity WHERE project_id=$1 AND task_id='watched' AND kind='status'",[p])).rows[0]!;
  assert.equal(own.initiator_id,f.alice.id,'the agent acts on the initiator\'s behalf');assert.notEqual(own.actor_id,f.alice.id);
  const quiet=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='watched')!;
  assert.equal(quiet.place,'joined');assert.equal(quiet.row.updates,null,'my agent\'s edits are my own noise');
  await edit(p,'watched',{status:'review'},f.bob);
  const row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='watched')!;
  assert.equal(row.place,'updates');assert.equal(row.row.updates!.count,1);assert.equal(row.row.updates!.latest!.actor?.id,f.bob.id);
});

test('W13 discussions reach participants: a new message, then the question resolved',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'discussed');
  const thread=await ok<any>(call('POST',`${base(p)}/tasks/discussed/threads`,{id:'q1',messageId:'m1',body:'Кто берёт?',requiresResolution:true},f.bob));
  const news=async()=>{const x=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='discussed')!;return x.place==='updates'?x.row.primaryReason:undefined;};
  assert.equal((await news())?.text,'Вы наблюдаете: новое сообщение в обсуждении');
  const state=await personal(p,'discussed');
  await ok(call('PUT',`${base(p)}/tasks/discussed/personal/seen`,{baseRevision:state.seenRevision,sequence:state.latestSequence}));
  assert.deepEqual(where(await envelope(f.alice,p),'discussed'),['joined']);assert.equal(await news(),undefined,'seen news is gone');
  await ok(call('PATCH',`${base(p)}/threads/q1/resolution`,{resolved:true,baseRevision:thread.revision},f.bob));
  assert.equal((await news())?.text,'Вы наблюдаете: вопрос в обсуждении решён');
  const latest=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='discussed')!.row.updates!.latest!;
  assert.equal(latest.kind,'resolution');assert.deepEqual(latest.detail,{resolved:true});
});

test('W14 review R1: reassignment pierces a snooze, a new relation starts now, first joins race, off is 404 unauthenticated',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor'],[dan,'editor']]);
  // F1: a request that reaches the person after the snooze is not hidden by it.
  await task(p,'s',{},f.bob);await ask(p,'s',f.bob,f.alice);
  const state=await personal(p,'s');
  await ok(call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state.snoozeRevision,until:inDays(5)+'T09:00:00Z'}));
  const toDan=await ask(p,'s',carol,dan);
  assert.deepEqual(where(await envelope(f.alice,p),'s'),[]);
  await ok(call('PATCH',`${base(p)}/requests/${toDan.id}`,{baseRevision:toDan.revision,recipientId:f.alice.id,neededBy:null},carol));
  assert.deepEqual(where(await envelope(f.alice,p),'s'),['action'],'reassigned to me after my snooze');
  // F3: participating again does not replay the history from before the new relation.
  await task(p,'h',{},f.bob);await participate(p,'h');await participate(p,'h',false);
  for(const status of ['in_progress','review','testing'])await edit(p,'h',{status},f.bob);
  await participate(p,'h');assert.deepEqual(where(await envelope(f.alice,p),'h'),['joined']);
  assert.equal(placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='h')!.row.updates,null);
  await edit(p,'h',{status:'in_progress'},f.bob);
  assert.equal(placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='h')!.row.updates!.count,1);
  // F4: two first joins from two tabs: one wins, the other is told.
  await task(p,'w',{},f.bob);
  const joins=await Promise.all([0,1].map(()=>call('PUT',`${base(p)}/tasks/w/personal/participation`,{baseRevision:0,participating:true})));
  assert.deepEqual(joins.map(r=>r.statusCode).sort(),[200,409]);
  // F10: a switched-off feature is not found before authentication.
  const off=await startApp({settings:{SPRINTIQUE_FEATURES:'workbench_read_internal'}});
  try{
    assert.equal((await off.inject({url:'/api/v1/workbench/plan'})).statusCode,404);
    assert.equal((await off.inject({method:'PUT',url:`${base(p)}/tasks/w/personal/check-back`,payload:{baseRevision:0,checkBackAt:null}})).statusCode,404);
    assert.equal((await off.inject({url:'/api/v1/workbench'})).statusCode,401,'an enabled feature still needs a session');
  }finally{await off.close();}
  const none=await startApp({settings:{SPRINTIQUE_FEATURES:'none'}});
  try{for(const url of ['/workbench','/workbench/plan','/api/v1/workbench'])assert.equal((await none.inject({url})).statusCode,404,url);}
  finally{await none.close();}
});

test('W15 review R2 F1: personal commands and shared commands of one person in one project never deadlock',async()=>{
  const p=await project([[f.bob,'editor']]);
  for(const id of ['a','b','c'])await task(p,id);
  // A move in "Участвую" in one tab while a new task is created in another (both take the person's lock).
  for(let i=0;i<8;i++){
    const [moved,created]=await Promise.all([rank(p,i%2?'c':'b','up'),call('PUT',`${base(p)}/tasks/n${i}`,{baseRevision:0,task:{title:'Новая '+i}})]);
    assert.ok([200,409,422].includes(moved.statusCode),moved.body);assert.equal(created.statusCode,200,created.body);
  }
  // Seen from the drawer while a request goes out on the same task (the personal row and the project row).
  for(let i=0;i<8;i++){
    const state=await personal(p,'a');
    const [seen,asked]=await Promise.all([
      call('PUT',`${base(p)}/tasks/a/personal/seen`,{baseRevision:state.seenRevision,sequence:state.latestSequence}),
      call('POST',`${base(p)}/tasks/a/requests`,{id:randomUUID(),recipientId:f.bob.id,kind:'answer'}),
    ]);
    assert.equal(seen.statusCode,200,seen.body);assert.equal(asked.statusCode,200,asked.body);
  }
});

test('W16 review R2 F2/F8: "Жду" follows my latest assignment, including my agent\'s; a task from planning joins its author',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor'],[dan,'editor']]);
  // I delegate, then take the task myself; a colleague then hands it on: that is no longer my delegation.
  await task(p,'took');await edit(p,'took',{ownerId:f.bob.id});await edit(p,'took',{ownerId:f.alice.id});
  await edit(p,'took',{ownerId:dan.id},carol);await markSeen(p,'took');
  let row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='took')!;
  assert.equal(row.place,'joined');assert.equal(row.row.waiting,null);
  assert.equal((await personal(p,'took')).delegated,null);
  // I delegate, then remove the owner myself: nothing is delegated.
  await task(p,'unset');await edit(p,'unset',{ownerId:f.bob.id});await edit(p,'unset',{ownerId:null});
  assert.deepEqual(where(await envelope(f.alice,p),'unset'),['joined']);
  assert.equal((await checkBack(p,'unset',inDays(2))).json().code,'NOT_WAITING');
  // A colleague removes the owner of what I delegated: still mine to wait for, "исполнитель снят".
  await task(p,'removed');await edit(p,'removed',{ownerId:f.bob.id});await edit(p,'removed',{ownerId:null},carol);await markSeen(p,'removed');
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='removed')!;
  assert.equal(row.place,'waiting');assert.equal(row.row.primaryReason.text,'Поручено: Борис, исполнитель снят');assert.equal(row.row.waiting!.ownerNow,null);
  // My own agent assigns on my behalf: that is my delegation.
  const grant=await ok<{token:string}>(call('POST',`${base(p)}/agents`,{name:'Мой агент',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}));
  const agent={headers:{authorization:'Bearer '+grant.token}} as unknown as User;
  await task(p,'via-agent');await edit(p,'via-agent',{ownerId:f.bob.id},agent);
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='via-agent')!;
  assert.equal(row.place,'waiting');assert.deepEqual(row.row.waiting!.expectedAssignee,{id:f.bob.id,name:'Борис'});
  // A task created through planning joins its author like one created on the board.
  const view=(suffix:string,payload:unknown)=>ok<any>(call('POST',`${base(p)}/planning/view/${suffix}`,payload));
  const preview=await view('preview',{kind:'taskCreate',taskId:'planned-new',task:{title:'Из планирования'}});
  const [planId,token]=preview.token.split('.');
  assert.equal((await ok<any>(call('POST',`${base(p)}/planning/commands`,{planId,token}))).status,'committed');
  assert.deepEqual(where(await envelope(f.alice,p),'planned-new'),['joined']);
  assert.equal((await personal(p,'planned-new')).participating,true);
});

test('W17 review R2 F3/F10: rank moves among the visible neighbours; a task with an awake request is not also snoozed',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'A');await task(p,'B',{ownerId:f.bob.id});await task(p,'C');
  const joined=async()=>(await envelope(f.alice,p)).sections[1]!.groups!.find(g=>g.key==='joined')!.items.map(r=>r.taskId);
  assert.deepEqual(await joined(),['A','C']);
  assert.deepEqual(where(await envelope(f.alice,p),'B'),['waiting']);
  await ok(rank(p,'C','up'));assert.deepEqual(await joined(),['C','A'],'one press moves past the visible neighbour');
  assert.equal((await rank(p,'C','up')).json().code,'RANK_EDGE');
  const hidden=await rank(p,'B','up');assert.equal(hidden.statusCode,422);assert.equal(hidden.json().code,'RANK_NOT_LISTED');
  // F10: one request snoozed, a newer one awake: the task is in "Нужно действие" only.
  await task(p,'s',{},f.bob);await ask(p,'s',f.bob,f.alice);
  const state=await personal(p,'s');
  await ok(call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state.snoozeRevision,until:inDays(3)+'T09:00:00Z'}));
  assert.equal((await envelope(f.alice,p)).sections[0]!.snoozedCount,1);
  await ask(p,'s',f.bob,f.alice,{kind:'decision'});
  const env=await envelope(f.alice,p);
  assert.deepEqual(where(env,'s'),['action']);assert.equal(env.sections[0]!.snoozedCount,0);
  const snoozed=await ok<WorkbenchPage>(f.app.inject({url:`/api/v1/workbench/list?section=snoozed&projects=${p}`,headers:f.alice.headers}));
  assert.deepEqual(snoozed.items,[]);
});

test('W18 preferences: the form of «Текущая работа» and the time zone are separate fields of one revision',async()=>{
  const u=await human('Эмма');
  const put=(payload:unknown)=>call('PUT','/api/v1/workbench/preferences',payload,u);
  assert.deepEqual(await ok(call('GET','/api/v1/workbench/preferences',undefined,u)),{timezone:null,layout:{currentForm:'lanes'},revision:0});
  const first=await ok<any>(put({baseRevision:0,layout:{currentForm:'list'}}));
  assert.deepEqual(first,{timezone:null,layout:{currentForm:'list'},revision:1});
  const zoned=await ok<any>(put({baseRevision:1,timezone:'Europe/Moscow'}));
  assert.deepEqual(zoned.layout,first.layout,'a field left out keeps its value');assert.equal(zoned.timezone,'Europe/Moscow');
  assert.equal((await put({baseRevision:1,timezone:'UTC'})).statusCode,409);
  for(const bad of [{baseRevision:2},{baseRevision:2,layout:{currentForm:'board'}},{baseRevision:2,layout:{hiddenWidgets:['week']}},
    {baseRevision:2,layout:{currentForm:'list',extra:1}}])assert.equal((await put(bad)).statusCode,400,JSON.stringify(bad));
  const reset=await ok<any>(put({baseRevision:2,layout:null,timezone:null}));
  assert.deepEqual(reset,{timezone:null,layout:{currentForm:'lanes'},revision:3});
  // Private: another person reads only their own.
  assert.equal((await ok<any>(call('GET','/api/v1/workbench/preferences',undefined,f.bob))).layout.currentForm,'lanes');
  const rows=await f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.workbench_preferences WHERE principal_id=$1',[u.id]));
  assert.equal(rows.rowCount,0);
});

test('W19 review R3 F1: a person who left the project is not named, not as the expected assignee, the owner or the actor',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor']]);
  await task(p,'gone');await edit(p,'gone',{ownerId:f.bob.id});
  await task(p,'handed');await participate(p,'handed');await edit(p,'handed',{ownerId:carol.id},f.bob);
  const member=(await ok<any[]>(call('GET',`${base(p)}/members`))).find(m=>m.id===f.bob.id);
  await ok(call('PATCH',`${base(p)}/members/${f.bob.id}`,{baseRevision:member.revision,role:null}));
  const env=await envelope(f.alice,p);
  const gone=placed(env).find(x=>x.row.taskId==='gone')!;
  assert.equal(gone.place,'waiting');assert.equal(gone.row.primaryReason.code,'delegated_orphaned');
  assert.deepEqual({...gone.row.waiting!,assignedAt:undefined,checkBackAt:undefined},
    {expectedAssignee:null,expectedAssigneeLeft:true,ownerNow:{id:f.bob.id,name:null},checkBackAt:undefined,done:false,doneAt:null,assignedAt:undefined});
  assert.deepEqual(gone.row.owner,{id:f.bob.id,name:null});
  assert.ok(!JSON.stringify(gone.row).includes('Борис'));
  const handed=placed(env).find(x=>x.row.taskId==='handed')!.row.updates!.latest!;
  assert.deepEqual(handed.actor,{id:f.bob.id,name:null});assert.equal(handed.actorName,null);
  assert.deepEqual(handed.detail,{from:null,to:{id:carol.id,name:'Карина'}});
  // A colleague hands delegated work to someone who then leaves: the text says so without a name.
  await task(p,'passed');await edit(p,'passed',{ownerId:carol.id});
  await f.admin.query('UPDATE app.tasks SET owner_id=$3 WHERE project_id=$1 AND id=$2',[p,'passed',f.bob.id]);
  const passed=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='passed')!;
  assert.equal(passed.row.primaryReason.text,'Поручено: Карина, исполнитель больше не в проекте');
});

test('W20 round 2: verbs by request kind, "Готово" from the row, the due date, the overdue count',async()=>{
  const p=await project([[f.bob,'editor'],[dan,'reader']]);
  const kinds:[string,string,boolean][]=[['review','review',true],['do','do',true],['answer','question',false],['decision','decision',false]];
  for(const [kind] of kinds){await task(p,'k-'+kind,{},f.bob);await ask(p,'k-'+kind,f.bob,f.alice,{kind});}
  await task(p,'late',{},f.bob);await ask(p,'late',f.bob,f.alice,{neededBy:inDays(1)});
  await f.admin.query("UPDATE app.attention_requests SET needed_by=$2 WHERE project_id=$1 AND task_id='late'",[p,inDays(-2)]);
  let env=await envelope(f.alice,p);
  for(const [kind,action,inline] of kinds){
    const row=placed(env).find(x=>x.row.taskId==='k-'+kind)!.row;
    assert.deepEqual(row.action,{kind:action,inline},kind);assert.equal(row.active,null);
  }
  assert.equal(placed(env).find(x=>x.row.taskId==='k-do')!.row.primaryReason.text,'Борис просит сделать');
  assert.equal(env.sections[0]!.overdueCount,1,'one awake request is past its date');
  // "В работе": the next stage and its verb; a blocker or a reader's role says why not.
  await task(p,'work',{status:'in_progress',ownerId:f.alice.id});
  await task(p,'testing',{status:'testing',ownerId:f.alice.id});
  await task(p,'stuck',{status:'in_progress',ownerId:f.alice.id});await task(p,'wall',{},f.bob);
  await ok(call('PUT',`${base(p)}/task-links/w1`,{baseRevision:0,value:{kind:'depends',fromId:'stuck',toId:'wall'}}));
  env=await envelope(f.alice,p);
  const row=(id:string)=>placed(env).find(x=>x.row.taskId===id)!.row;
  assert.deepEqual(row('work').active,{transition:{label:'На проверку',toStatusId:'review'},cannotComplete:null});
  assert.deepEqual(row('testing').active!.transition,{label:'Готово',toStatusId:'ready_for_release'});
  assert.equal(row('stuck').active!.cannotComplete!.reason,'blocked');assert.ok(!row('stuck').allowedActions.includes('complete'));
  assert.ok(row('work').allowedActions.includes('complete'));assert.equal(row('work').canEditDue,true);
  // A reader sees the same kind of row with the reason it cannot move it.
  await f.admin.query("INSERT INTO app.tasks(project_id,id,number,title,description,status,type,priority,owner_label,rank,revision,owner_id) SELECT $1,'readonly',999,'Только чтение','','in_progress','task','normal','',999,1,$2",[p,dan.id]);
  const danRow=placed(await envelope(dan,p)).find(x=>x.row.taskId==='readonly')!.row;
  assert.equal(danRow.active!.cannotComplete!.reason,'read_only');assert.equal(danRow.canEditDue,false);
});

test('W21 round 2: "Принять результат" of delegated done work, its undo, and a reopened task waits again',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'r');await edit(p,'r',{ownerId:f.bob.id});
  const early=await personal(p,'r');
  const notDone=await call('PUT',`${base(p)}/tasks/r/personal/accept`,{baseRevision:early.acceptRevision,accepted:true});
  assert.equal(notDone.statusCode,422);assert.equal(notDone.json().code,'NOT_DONE');
  await edit(p,'r',{status:'ready_for_release'},f.bob);
  assert.deepEqual(where(await envelope(f.alice,p),'r'),['updates'],'the completion is news first');
  await markSeen(p,'r');
  let row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='r')!;
  assert.equal(row.place,'waiting');assert.equal(row.row.waiting!.done,true);assert.ok(row.row.waiting!.doneAt);
  assert.ok(row.row.allowedActions.includes('acceptResult'));
  const state=await personal(p,'r');
  const accepted=await ok<any>(call('PUT',`${base(p)}/tasks/r/personal/accept`,{baseRevision:state.acceptRevision,accepted:true}));
  assert.equal(accepted.accepted,true);
  // Accepted done work leaves "Жду", and done work is not "Участвую".
  assert.deepEqual(where(await envelope(f.alice,p),'r'),[]);
  const after=await personal(p,'r');assert.equal(after.participating,true,'participation stays');assert.equal(after.delegated.accepted,true);
  // Undo from the toast.
  await ok(call('PUT',`${base(p)}/tasks/r/personal/accept`,{baseRevision:after.acceptRevision,accepted:false}));
  assert.deepEqual(where(await envelope(f.alice,p),'r'),['waiting']);
  // Accept again, then the task is reopened: it is waited for again without a command.
  const again=await personal(p,'r');
  await ok(call('PUT',`${base(p)}/tasks/r/personal/accept`,{baseRevision:again.acceptRevision,accepted:true}));
  await edit(p,'r',{status:'in_progress'},f.bob);await markSeen(p,'r');
  assert.deepEqual(where(await envelope(f.alice,p),'r'),['waiting']);
  // Nothing of it reaches the shared log.
  const shared=await f.admin.query("SELECT count(*)::int AS n FROM app.audit_events WHERE project_id=$1 AND action LIKE '%accept%'",[p]);
  assert.equal(shared.rows[0]!.n,0);
});

test('W22 round 2: «Просмотрено» for all of "Изменилось" marks only what was seen, never later news',async()=>{
  const p=await project([[f.bob,'editor']]);
  for(const id of ['u1','u2']){await task(p,id,{},f.bob);await participate(p,id);await edit(p,id,{status:'ready_for_release'},f.bob);}
  // Active work keeps its place: its news stays on its row.
  await task(p,'lane',{status:'in_progress',ownerId:f.alice.id},f.bob);await participate(p,'lane');await edit(p,'lane',{due:inDays(3)},f.bob);
  let env=await envelope(f.alice,p);
  assert.equal(env.sections[2]!.count,2);
  const before=env.generatedAt;
  await new Promise(resolve=>setTimeout(resolve,20));
  // News that arrives after the snapshot stays unseen.
  await edit(p,'u2',{due:inDays(4)},f.bob);
  const marked=await ok<any>(call('POST','/api/v1/workbench/seen',{before,projects:[p]}));
  assert.equal(marked.marked,2);
  env=await envelope(f.alice,p);
  assert.deepEqual(where(env,'u1'),[]);
  const u2=placed(env).find(x=>x.row.taskId==='u2')!;assert.equal(u2.place,'updates');assert.equal(u2.row.updates!.count,1);
  assert.equal(u2.row.updates!.latest!.kind,'due');
  assert.equal(placed(env).find(x=>x.row.taskId==='lane')!.row.updates!.count,1,'news on an active row is not part of «Изменилось»');
  assert.deepEqual(where(env,'lane'),['active']);
  // A retry is harmless; another person's news is untouched.
  assert.equal((await ok<any>(call('POST','/api/v1/workbench/seen',{before,projects:[p]}))).marked,0);
  assert.equal((await call('POST','/api/v1/workbench/seen',{before:'yesterday'})).statusCode,400);
});
