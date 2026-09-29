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
before(async()=>{f=await fixture({prefix:'W'});carol=await human('Карина');dan=await human('Денис');});
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
async function focus(p:string,t:string,action='add',user:User=f.alice){
  const state=await personal(p,t,user);return ok(call('PUT',`${base(p)}/tasks/${t}/personal/focus`,{baseRevision:state.focusRevision,action,projects:[p]},user));
}
async function follow(p:string,t:string,following=true,user:User=f.alice){
  const state=await personal(p,t,user);return ok(call('PUT',`${base(p)}/tasks/${t}/personal/follow`,{baseRevision:state.followRevision,following},user));
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
const inDays=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);

test('W01 inclusion matrix: explicit relations only, one task one row, counts equal rows',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'reader']]);
  await task(p,'req');await ask(p,'req',f.bob,f.alice);
  await task(p,'review',{status:'review',ownerId:f.bob.id});
  await task(p,'due',{due:inDays(1)});
  await task(p,'focus');await focus(p,'focus');
  await task(p,'active',{status:'in_progress',ownerId:f.alice.id});
  await task(p,'backlog',{ownerId:f.alice.id});
  await task(p,'wait',{ownerId:f.bob.id});await ok(call('POST',`${base(p)}/tasks/wait/wait-state`,{baseRevision:0}));
  await task(p,'creator',{ownerId:f.bob.id});
  await task(p,'followed');await follow(p,'followed');await edit(p,'followed',{status:'in_progress'},f.bob);
  await task(p,'own');await follow(p,'own');await edit(p,'own',{due:inDays(3)});
  await task(p,'multi');await follow(p,'multi');await focus(p,'multi');await ask(p,'multi',f.bob,f.alice,{kind:'answer'});await edit(p,'multi',{priority:'high',due:inDays(2)},f.bob);
  const env=await envelope(f.alice,p);
  assert.deepEqual(where(env,'req'),['action']);
  assert.deepEqual(where(env,'review'),[],'status review without a recipient is not a request');
  assert.deepEqual(where(env,'due'),[],'a date without a relation is not relevance');
  assert.deepEqual(where(env,'focus'),['focus']);
  assert.deepEqual(where(env,'active'),['active']);
  assert.deepEqual(where(env,'backlog'),[],'assigned backlog stays off the first screen');
  assert.deepEqual(where(env,'wait'),['waiting']);
  assert.deepEqual(where(env,'creator'),[],'authorship is not delegation');
  assert.deepEqual(where(env,'followed'),['updates']);
  assert.deepEqual(where(env,'own'),[],'own edits are not news');
  assert.deepEqual(where(env,'multi'),['action'],'one task, one row, strongest reason');
  const multi=placed(env).find(x=>x.row.taskId==='multi')!.row;
  assert.equal(multi.primaryReason.code,'request_to_you');assert.equal(multi.primaryReason.text,'Борис просит ответить');
  assert.ok(multi.primaryReason.occurredAt);assert.ok(!multi.primaryReason.text.includes(' · '));
  assert.deepEqual(multi.secondaryReasons.map(r=>r.code).sort(),['followed_due_changed','manual_focus'].sort());
  const req=placed(env).find(x=>x.row.taskId==='req')!.row;
  assert.equal(req.owner,null);assert.equal(req.due,null);assert.equal(req.canonicalUrl,`/workbench/tasks/${p}/req`);
  assert.equal(req.projectName.startsWith('Проект'),true);assert.equal('workspaceName' in req,false);
  const followed=placed(env).find(x=>x.row.taskId==='followed')!.row;
  assert.equal(followed.primaryReason.code,'followed_status_changed');assert.equal(followed.primaryReason.text,'Вы следите: статус «В работе»');
  assert.equal(followed.primaryReason.actor?.id,f.bob.id);
  // Snapshot: each count equals its rows, no task twice anywhere.
  const [action,current,updates]=env.sections;
  assert.equal(action!.count,action!.items!.length);assert.equal(updates!.count,updates!.items!.length);
  for(const group of current!.groups!)assert.equal(group.count,group.items.length,group.key);
  assert.equal(current!.count,current!.groups!.reduce((sum,g)=>sum+g.count,0));
  assert.equal(current!.backlogCount,1);
  const keys=placed(env).map(x=>x.row.key);assert.equal(new Set(keys).size,keys.length);
  const backlog=await ok<WorkbenchPage>(f.app.inject({url:`/api/v1/workbench/list?section=backlog&projects=${p}`,headers:f.alice.headers}));
  assert.deepEqual(backlog.items.map(r=>r.taskId),['backlog']);assert.equal(backlog.items[0]!.primaryReason.code,'assigned_backlog');
  // Another person sees their own projection only.
  const bob=await envelope(f.bob,p);assert.deepEqual(placed(bob).map(x=>x.row.taskId).sort(),['review']);
  const reader=await envelope(carol,p);assert.equal(placed(reader).length,0);
});

test('W02 reading never resolves; resolve demotes deterministically; undo; resolve and reassign race',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor'],[dan,'reader']]);
  await task(p,'t');await focus(p,'t');
  const request=await ask(p,'t',f.bob,f.alice,{note:'Посмотри, пожалуйста'});
  assert.deepEqual(where(await envelope(f.alice,p),'t'),['action']);
  const state=await personal(p,'t');
  await ok(call('PUT',`${base(p)}/tasks/t/personal/seen`,{baseRevision:state.seenRevision,sequence:state.latestSequence}));
  assert.equal(state.requests[0].status,'open');
  assert.deepEqual(where(await envelope(f.alice,p),'t'),['action'],'read is not resolved');
  assert.equal((await call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},f.bob)).statusCode,403);
  assert.equal((await call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},dan)).statusCode,403);
  const key=randomUUID();
  const resolved=await ok<any>(call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},f.alice,key));
  assert.equal(resolved.status,'resolved');
  assert.deepEqual(await ok(call('POST',`${base(p)}/requests/${request.id}/resolve`,{baseRevision:request.revision},f.alice,key)),resolved,'retry after a lost response');
  assert.deepEqual(where(await envelope(f.alice,p),'t'),['focus'],'the next reason takes over');
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
  await task(p,'s');
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
  const s=await personal(p,'x');
  // Two tabs from the same read: seen and focus do not collide.
  const [seen,focused]=await Promise.all([
    call('PUT',`${base(p)}/tasks/x/personal/seen`,{baseRevision:s.seenRevision,sequence:s.latestSequence}),
    call('PUT',`${base(p)}/tasks/x/personal/focus`,{baseRevision:s.focusRevision,action:'add'}),
  ]);
  assert.equal(seen.statusCode,200,seen.body);assert.equal(focused.statusCode,200,focused.body);
  const stale=await call('PUT',`${base(p)}/tasks/x/personal/focus`,{baseRevision:s.focusRevision,action:'remove'});
  assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'CONFLICT');
  const s2=await personal(p,'x');
  await ok(call('PUT',`${base(p)}/tasks/x/personal/follow`,{baseRevision:s2.followRevision,following:true}),200);
  // Replay returns the original effect, marked; the same key with another body conflicts.
  const key=randomUUID();
  const first=await ok<any>(call('PUT',`${base(p)}/tasks/x/personal/focus`,{baseRevision:s2.focusRevision,action:'remove'},f.alice,key));
  assert.equal(first.replayed,false);assert.equal(first.focused,false);
  await focus(p,'x','add');
  const replay=await ok<any>(call('PUT',`${base(p)}/tasks/x/personal/focus`,{baseRevision:s2.focusRevision,action:'remove'},f.alice,key));
  assert.equal(replay.replayed,true);assert.equal(replay.revision,first.revision);assert.equal((await personal(p,'x')).focused,true,'replay is not current state');
  const conflict=await call('PUT',`${base(p)}/tasks/x/personal/focus`,{baseRevision:s2.focusRevision,action:'up'},f.alice,key);
  assert.equal(conflict.statusCode,409);assert.equal(conflict.json().code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await call('PUT',`${base(p)}/tasks/x/personal/focus`,{baseRevision:0,action:'add',following:true})).statusCode,400,'one field per command');
  assert.equal(await audit(),before,'no shared audit, outbox or retry ledger entry');
  const events=await ok<any>(call('GET',`${base(p)}/events?cursor=${encodeURIComponent(head.cursor)}`,undefined,f.bob));
  assert.equal(JSON.stringify(events).includes('personal'),false);assert.equal((events.items??events.events??[]).length,0);
  // Row security: a colleague sees none of it, through SQL under their own context or over HTTP.
  const rows=await f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.task_personal_state WHERE project_id=$1',[p]));
  assert.equal(rows.rowCount,0);
  const receipts=await f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.private_receipts'));assert.equal(receipts.rowCount,0);
  const own=await f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query('SELECT 1 FROM app.private_receipts WHERE project_id=$1',[p]));assert.ok((own.rowCount??0)>0);
  const bobView=await personal(p,'x',f.bob);assert.equal(bobView.focused,false);assert.equal(bobView.following,false);
  await assert.rejects(f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query('UPDATE app.private_receipts SET result=$1',['{}'])),/permission denied/);
  // The request that touched a project task still reaches the shared log; its reads do not.
  await ask(p,'x',f.bob,f.alice);assert.ok(await audit()>before);
});

test('W05 security: never-member, former member, cursor replay, wrong pair, agent, no-store',async()=>{
  const p=await project([[f.bob,'editor']]);
  for(let i=0;i<12;i++){await task(p,'f'+i);await focus(p,'f'+i);}
  const env=await envelope(f.alice,p,'&limit=5');
  const group=env.sections[1]!.groups!.find(g=>g.key==='focus')!;assert.equal(group.count,12);assert.equal(group.items.length,5);
  const cursor=group.nextCursor!;
  // Never-member: the filter naming a foreign project answers exactly like an unknown id.
  const foreign=await envelope(dan,p),unknown=await envelope(dan,'nope');
  assert.deepEqual(foreign.sections,unknown.sections);assert.equal(foreign.scope.projectCount,0);
  const foreignList=await f.app.inject({url:`/api/v1/workbench/list?section=focus&projects=${p}&cursor=${encodeURIComponent(cursor)}`,headers:dan.headers});
  assert.equal(foreignList.statusCode,400);assert.equal(foreignList.json().code,'CURSOR_INVALID');
  const otherFilter=await f.app.inject({url:`/api/v1/workbench/list?section=focus&cursor=${encodeURIComponent(cursor)}`,headers:f.alice.headers});
  assert.equal(otherFilter.json().code,'CURSOR_INVALID');
  const otherSection=await f.app.inject({url:`/api/v1/workbench/list?section=active&projects=${p}&cursor=${encodeURIComponent(cursor)}`,headers:f.alice.headers});
  assert.equal(otherSection.json().code,'CURSOR_INVALID');
  const garbage=await f.app.inject({url:`/api/v1/workbench/list?section=focus&projects=${p}&cursor=abc.def`,headers:f.alice.headers});
  assert.equal(garbage.statusCode,400);assert.equal(garbage.json().code,'CURSOR_INVALID');
  assert.equal((await f.app.inject({url:'/api/v1/workbench?limit=51',headers:f.alice.headers})).statusCode,400);
  assert.equal((await f.app.inject({url:'/api/v1/workbench?mode=later',headers:f.alice.headers})).statusCode,400);
  assert.equal((await f.app.inject({url:'/api/v1/workbench?projects=a,b%20c',headers:f.alice.headers})).statusCode,400);
  // Wrong (projectId, taskId) pair and a foreign project answer like a missing task.
  const other=await project();await task(other,'mine');
  assert.equal((await call('GET',`${base(p)}/tasks/mine/personal`)).statusCode,404);
  assert.equal((await call('GET',`${base(other)}/tasks/f0/personal`)).statusCode,404);
  assert.equal((await call('GET',`${base(p)}/tasks/f0/personal`,undefined,dan)).statusCode,404);
  assert.equal((await call('PUT',`${base(p)}/tasks/f0/personal/focus`,{baseRevision:0,action:'add'},dan)).statusCode,404);
  // Former member: bob focuses, loses access; his rows vanish, his cursor turns stale, the rows come back with access.
  for(let i=0;i<6;i++)await focus(p,'f'+i,'add',f.bob);
  const bobEnv=await envelope(f.bob,p,'&limit=5');const bobCursor=bobEnv.sections[1]!.groups!.find(g=>g.key==='focus')!.nextCursor!;
  const member=(await ok<any[]>(call('GET',`${base(p)}/members`))).find(m=>m.id===f.bob.id);
  await ok(call('PATCH',`${base(p)}/members/${f.bob.id}`,{baseRevision:member.revision,role:null}));
  const after=await envelope(f.bob,p);assert.equal(placed(after).length,0);assert.equal(after.scope.projectCount,0);
  const staleCursor=await f.app.inject({url:`/api/v1/workbench/list?section=focus&projects=${p}&cursor=${encodeURIComponent(bobCursor)}`,headers:f.bob.headers});
  assert.equal(staleCursor.statusCode,409);assert.equal(staleCursor.json().code,'CURSOR_STALE');
  assert.equal((await call('GET',`${base(p)}/tasks/f0/personal`,undefined,f.bob)).statusCode,404);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[p,f.bob.id]);
  assert.equal((await envelope(f.bob,p)).sections[1]!.groups!.find(g=>g.key==='focus')!.count,6,'rows return with access');
  // An agent has no cross-project read and no personal state.
  const grant=await ok<{token:string}>(call('POST',`${base(p)}/agents`,{name:'Агент',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}));
  const agent={authorization:'Bearer '+grant.token};
  for(const url of ['/api/v1/workbench','/api/v1/workbench/plan',`${base(p)}/tasks/f0/personal`]){
    const r=await f.app.inject({url,headers:agent});assert.equal(r.statusCode,403,url);assert.equal(r.json().code,'HUMAN_REQUIRED');
  }
  assert.equal((await f.app.inject({url:'/api/v1/workbench'})).statusCode,401);
});

test('W06 keyset pagination: pages are disjoint, complete and ordered; counts match',async()=>{
  const p=await project();
  const ids:string[]=[];for(let i=0;i<23;i++){await task(p,'k'+i,{status:'in_progress',ownerId:f.alice.id,priority:i%3?'normal':'high'});ids.push('k'+i);}
  const env=await envelope(f.alice,p,'&limit=10');
  const active=env.sections[1]!.groups!.find(g=>g.key==='active')!;assert.equal(active.count,23);
  const seen=active.items.map(r=>r.taskId);let cursor=active.nextCursor;let pages=1;
  while(cursor){
    const page=await ok<WorkbenchPage>(f.app.inject({url:`/api/v1/workbench/list?section=active&projects=${p}&limit=10&cursor=${encodeURIComponent(cursor)}`,headers:f.alice.headers}));
    assert.equal(page.count,23);seen.push(...page.items.map(r=>r.taskId));cursor=page.nextCursor;pages++;
  }
  assert.equal(pages,3);assert.equal(new Set(seen).size,23);assert.deepEqual([...seen].sort(),[...ids].sort());
  // High priority first inside one stage.
  const high=seen.findIndex(id=>Number(id.slice(1))%3!==0);assert.ok(seen.slice(0,high).every(id=>Number(id.slice(1))%3===0));
  // Focus rank order is manual and movable by buttons.
  for(const id of ['k0','k1','k2'])await focus(p,id);
  const order=async()=>(await envelope(f.alice,p)).sections[1]!.groups!.find(g=>g.key==='focus')!.items.map(r=>r.taskId);
  assert.deepEqual(await order(),['k0','k1','k2']);
  await focus(p,'k2','up');assert.deepEqual(await order(),['k0','k2','k1']);
  await focus(p,'k0','down');assert.deepEqual(await order(),['k2','k0','k1']);
  const edge=await call('PUT',`${base(p)}/tasks/k2/personal/focus`,{baseRevision:(await personal(p,'k2')).focusRevision,action:'up',projects:[p]});
  assert.equal(edge.statusCode,422);assert.equal(edge.json().code,'FOCUS_EDGE');
  // Without the filter the same move is relative to the person's whole focus, which spans other projects.
  const global=await call('PUT',`${base(p)}/tasks/k2/personal/focus`,{baseRevision:(await personal(p,'k2')).focusRevision,action:'up'});
  assert.equal(global.statusCode,200,global.body);
  assert.deepEqual(await order(),['k2','k0','k1'],'the visible order is unchanged by a move past an invisible row');
  // Moving the last row up again and again halves the same gap until none is left; the ranks are then renumbered
  // and the order stays exactly what the person set.
  let expected=['k2','k0','k1'];
  for(let i=0;i<24;i++){
    const last=expected.at(-1)!;await focus(p,last,'up');expected=[...expected.slice(0,-2),last,expected.at(-2)!];
    assert.deepEqual(await order(),expected,`move ${i}`);
  }
  const ranks=(await f.admin.query<{rank:string}>('SELECT focus_rank AS rank FROM app.task_personal_state WHERE principal_id=$1 AND focus_rank IS NOT NULL',[f.alice.id])).rows.map(r=>r.rank);
  assert.equal(new Set(ranks).size,ranks.length,'ranks stay distinct after renumbering');
  // Focused tasks left the active group: one row each.
  assert.equal((await envelope(f.alice,p)).sections[1]!.groups!.find(g=>g.key==='active')!.count,20);
});

test('W07 waiting: explicit opt-in on assignment, completion and reassignment are named, closing is a state',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor']]);
  await task(p,'none');
  const unassigned=await call('POST',`${base(p)}/tasks/none/wait-state`,{baseRevision:0});assert.equal(unassigned.json().code,'WAIT_OWNER');
  await task(p,'self',{ownerId:f.alice.id});assert.equal((await call('POST',`${base(p)}/tasks/self/wait-state`,{baseRevision:0})).json().code,'WAIT_OWNER');
  await task(p,'d');await edit(p,'d',{ownerId:f.bob.id});
  const state=await personal(p,'d');assert.ok(state.ownerSequence>0);assert.equal(state.waiting,null);
  assert.deepEqual(where(await envelope(f.alice,p),'d'),[],'assigning alone does not start control');
  const started=await ok<any>(call('POST',`${base(p)}/tasks/d/wait-state`,{baseRevision:0,checkBackAt:inDays(3),sourceSequence:state.ownerSequence}));
  assert.equal(started.state,'active');assert.equal(started.expectedAssigneeId,f.bob.id);
  let row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;
  assert.equal(row.place,'waiting');assert.equal(row.row.primaryReason.code,'delegated_by_you');assert.equal(row.row.primaryReason.text,'Поручено: Борис');
  assert.equal(row.row.waiting!.checkBackAt,inDays(3));
  assert.equal((await call('POST',`${base(p)}/tasks/d/wait-state`,{baseRevision:started.revision})).json().code,'WAIT_ACTIVE');
  await edit(p,'d',{ownerId:carol.id},f.bob);
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;
  assert.equal(row.row.primaryReason.code,'delegated_reassigned');assert.equal(row.row.primaryReason.text,'Поручено: Борис, сейчас исполняет Карина');
  await edit(p,'d',{status:'ready_for_release'},carol);
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='d')!;
  assert.equal(row.place,'waiting',"completion is shown, the control is the person's to close");assert.equal(row.row.primaryReason.code,'delegated_completed');
  const changed=await ok<any>(call('PATCH',`${base(p)}/tasks/d/wait-state`,{baseRevision:started.revision,checkBackAt:null}));
  const closed=await ok<any>(call('POST',`${base(p)}/tasks/d/wait-state/resolve`,{baseRevision:changed.revision,outcome:'resolved'}));
  assert.equal(closed.state,'resolved');assert.deepEqual(where(await envelope(f.alice,p),'d'),[]);
  assert.equal((await ok<any>(call('GET',`${base(p)}/tasks/d`))).status,'ready_for_release','the task itself is untouched');
  // Starting again is explicit and uses the closed relation's revision.
  await edit(p,'d',{status:'in_progress'},carol);
  const again=await ok<any>(call('POST',`${base(p)}/tasks/d/wait-state`,{baseRevision:closed.revision}));assert.equal(again.expectedAssigneeId,carol.id);
});

test('W08 requests follow their source: thread and approval resolution, membership loss orphans and reassigns',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor']]);
  await task(p,'q');
  const thread=await ok<any>(call('POST',`${base(p)}/tasks/q/threads`,{id:'question',messageId:'m1',body:'Какой срок?',requiresResolution:true},f.bob));
  const request=await ask(p,'q',f.bob,f.alice,{kind:'answer',threadId:'question'});
  assert.equal(request.threadId,'question');
  const unrelated=await call('POST',`${base(p)}/tasks/q/requests`,{id:randomUUID(),recipientId:f.alice.id,kind:'answer',threadId:'missing'},f.bob);assert.equal(unrelated.statusCode,422);
  await ok(call('PATCH',`${base(p)}/threads/question/resolution`,{resolved:true,baseRevision:thread.revision}));
  const after=(await personal(p,'q')).requests.find((r:any)=>r.id===request.id);assert.equal(after.status,'resolved');
  assert.deepEqual(where(await envelope(f.alice,p),'q'),[]);
  // The requester learns about it through the updates of their own request.
  const bobRow=placed(await envelope(f.bob,p)).find(x=>x.row.taskId==='q');assert.equal(bobRow?.place,'updates');assert.equal(bobRow?.row.primaryReason.code,'request_resolved');
  // An approval source: a decision resolves the request made on it.
  const approval=randomUUID();
  await f.admin.query("INSERT INTO app.approvals(project_id,id,subject_kind,subject_id,action_hash,requested_by,initiator_id,expires_at) VALUES($1,$2,'plan',$3,'hash',$4,$4,now()+interval '1 day')",[p,approval,randomUUID(),f.bob.id]);
  const onApproval=await ask(p,'q',f.bob,f.alice,{kind:'approval',approvalId:approval});
  const mismatched=await call('POST',`${base(p)}/tasks/q/requests`,{id:randomUUID(),recipientId:f.alice.id,kind:'review',approvalId:approval},f.bob);
  assert.equal(mismatched.statusCode,422,'approval kind and source go together');assert.equal(mismatched.json().code,'REQUEST_SOURCE');
  assert.equal(placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='q')!.row.primaryReason.code,'approval_to_you');
  await ok(call('POST',`${base(p)}/approvals/${approval}/decision`,{baseRevision:1,status:'approved'}));
  assert.equal((await personal(p,'q')).requests.find((r:any)=>r.id===onApproval.id).status,'resolved');
  // Membership loss: open requests become orphaned, visible to the requester, then reassigned.
  const toCarol=await ask(p,'q',f.bob,carol);
  const member=(await ok<any[]>(call('GET',`${base(p)}/members`))).find(m=>m.id===carol.id);
  await ok(call('PATCH',`${base(p)}/members/${carol.id}`,{baseRevision:member.revision,role:'reader'}));
  const orphan=(await personal(p,'q')).requests.find((r:any)=>r.id===toCarol.id);assert.equal(orphan.status,'orphaned');
  assert.equal(placed(await envelope(carol,p)).length,0);
  const bobUpdate=placed(await envelope(f.bob,p)).find(x=>x.row.taskId==='q')!;assert.equal(bobUpdate.row.primaryReason.code,'request_orphaned');
  assert.equal(bobUpdate.row.primaryReason.text,'Ваш запрос: адресат больше не в проекте');
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
  await task(p,'asked');await ask(p,'asked',f.bob,f.alice,{neededBy:inDays(2)});
  await task(p,'deleg',{ownerId:f.bob.id});await ok(call('POST',`${base(p)}/tasks/deleg/wait-state`,{baseRevision:0,checkBackAt:inDays(4)}));
  await task(p,'undated');await focus(p,'undated');
  await task(p,'foreign-due',{ownerId:f.bob.id,due:today()});
  await f.admin.query("INSERT INTO app.milestones(project_id,id,title,date) VALUES($1,'m1','Бета',$2)",[p,inDays(6)]);
  const hidden=await project();await task(hidden,'secret',{ownerId:f.alice.id,due:today()});
  await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[hidden,f.alice.id]);
  const today1=await ok<PlanHorizon>(f.app.inject({url:`/api/v1/workbench/plan?horizon=today&timezone=UTC&projects=${p},${hidden}`,headers:f.alice.headers}));
  assert.equal(today1.days.length,1);assert.equal(today1.from,today());
  const kinds=today1.days[0]!.items.map(i=>`${i.kind}:${i.task?.id??i.milestone?.id}`).sort();
  assert.deepEqual(kinds,['due:due-today','due:overdue']);
  assert.equal(today1.days[0]!.items.find(i=>i.task?.id==='overdue')!.overdue,true);
  assert.deepEqual(today1.undated.map(i=>i.task!.id),['undated']);
  const week=await ok<PlanHorizon>(f.app.inject({url:`/api/v1/workbench/plan?horizon=7d&timezone=UTC&projects=${p},${hidden}`,headers:f.alice.headers}));
  assert.equal(week.days.length,7);assert.equal(week.to,inDays(6));
  const all=week.days.flatMap(d=>d.items.map(i=>`${d.date}:${i.kind}:${i.task?.id??i.milestone?.id}`));
  for(const expected of [`${inDays(1)}:planned:planned`,`${inDays(2)}:planned:planned`,`${inDays(2)}:neededBy:asked`,`${inDays(4)}:checkBack:deleg`,
    `${inDays(5)}:due:later`,`${inDays(6)}:milestone:m1`])assert.ok(all.includes(expected),expected+' in '+all.join(', '));
  assert.ok(!all.some(x=>x.includes('foreign-due')),'another person\'s deadline is not my plan');
  assert.ok(!JSON.stringify(week).includes('secret'),'an inaccessible project is excluded before grouping');
  assert.equal(week.days.flatMap(d=>d.items).find(i=>i.kind==='neededBy')!.date,inDays(2),'a date-only value stays a date');
  // The chosen time zone is kept; the default names its source.
  assert.equal(today1.timezoneSource,'request');
  const saved=await ok<any>(call('PUT','/api/v1/workbench/preferences',{baseRevision:0,timezone:'Pacific/Kiritimati'}));
  assert.equal((await call('PUT','/api/v1/workbench/preferences',{baseRevision:0,timezone:'UTC'})).statusCode,409);
  assert.equal((await call('PUT','/api/v1/workbench/preferences',{baseRevision:saved.revision,timezone:'Mars/Base'})).statusCode,400);
  const kiritimati=await ok<PlanHorizon>(f.app.inject({url:`/api/v1/workbench/plan?projects=${p}`,headers:f.alice.headers}));
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
    assert.deepEqual(env.json().features,{requests:false,personal:false,waiting:false});
    const p=await project([[f.bob,'editor']]);await task(p,'z');
    for(const [method,url,payload] of [
      ['GET','/api/v1/workbench/plan',undefined],
      ['PUT',`${base(p)}/tasks/z/personal/focus`,{baseRevision:0,action:'add'}],
      ['POST',`${base(p)}/tasks/z/requests`,{id:randomUUID(),recipientId:f.bob.id,kind:'answer'}],
      ['POST',`${base(p)}/tasks/z/wait-state`,{baseRevision:0}],
    ] as const){
      const r=await off.inject({method,url,headers:{...f.alice.headers,'idempotency-key':randomUUID()},...(payload?{payload}:{})});assert.equal(r.statusCode,404,url);
    }
    assert.deepEqual((await off.inject({url:'/api/v1/session',headers:f.alice.headers})).json().features,['workbench_read_internal']);
  }finally{await off.close();}
  // The production default (nothing named = nothing on) is proven by FeatureFlagsTest: a production process needs HTTPS.
});

test('W11 blockers: my work blocked, delegated work blocked, events on both ends of a dependency',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'mine',{status:'in_progress',ownerId:f.alice.id});await task(p,'blocker',{ownerId:f.bob.id});
  await task(p,'deleg',{ownerId:f.bob.id});await ok(call('POST',`${base(p)}/tasks/deleg/wait-state`,{baseRevision:0}));
  await ok(call('PUT',`${base(p)}/task-links/l1`,{baseRevision:0,value:{kind:'depends',fromId:'mine',toId:'blocker'}},f.bob));
  await ok(call('PUT',`${base(p)}/task-links/l2`,{baseRevision:0,value:{kind:'depends',fromId:'deleg',toId:'blocker'}},f.bob));
  const env=await envelope(f.alice,p);
  const mine=placed(env).find(x=>x.row.taskId==='mine')!;
  assert.equal(mine.place,'active');assert.equal(mine.row.primaryReason.code,'your_work_blocked');
  const blockerKey=(await ok<any>(call('GET',`${base(p)}/tasks/blocker`))).displayId;
  assert.equal(mine.row.primaryReason.text,`Назначено вам, заблокирована задачей ${blockerKey}`);assert.equal(mine.row.blockedBy?.displayId,blockerKey);
  const deleg=placed(env).find(x=>x.row.taskId==='deleg')!;
  assert.equal(deleg.place,'waiting');assert.equal(deleg.row.primaryReason.code,'delegated_blocked');
  const events=(await f.admin.query<{task_id:string;role:string;other:string}>("SELECT task_id,detail->>'role' AS role,detail->>'other' AS other FROM app.task_activity WHERE project_id=$1 AND kind='dependency' ORDER BY sequence",[p])).rows;
  assert.deepEqual(events.slice(0,2),[{task_id:'mine',role:'blocked_by',other:'blocker'},{task_id:'blocker',role:'blocks',other:'mine'}]);
  assert.deepEqual(where(await envelope(f.bob,p),'blocker'),[],'blocking someone is not an action without a request');
});

test('W12 own noise: edits by my own agent are not news, a colleague\'s are',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'watched');await follow(p,'watched');
  const grant=await ok<{token:string}>(call('POST',`${base(p)}/agents`,{name:'Мой агент',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}));
  const agent={headers:{authorization:'Bearer '+grant.token}} as unknown as User;
  await edit(p,'watched',{status:'in_progress',due:inDays(4)},agent);
  const own=(await f.admin.query<{actor_id:string;initiator_id:string}>("SELECT actor_id,initiator_id FROM app.task_activity WHERE project_id=$1 AND task_id='watched' AND kind='status'",[p])).rows[0]!;
  assert.equal(own.initiator_id,f.alice.id,'the agent acts on the initiator\'s behalf');assert.notEqual(own.actor_id,f.alice.id);
  assert.deepEqual(where(await envelope(f.alice,p),'watched'),[],'my agent\'s edits are my own noise');
  await edit(p,'watched',{status:'review'},f.bob);
  const row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='watched')!;
  assert.equal(row.place,'updates');assert.equal(row.row.updates!.count,1);assert.equal(row.row.primaryReason.actor?.id,f.bob.id);
});

test('W13 discussions reach followers: a new message, then the question resolved',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p,'discussed');await follow(p,'discussed');
  const thread=await ok<any>(call('POST',`${base(p)}/tasks/discussed/threads`,{id:'q1',messageId:'m1',body:'Кто берёт?',requiresResolution:true},f.bob));
  let row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='discussed')!;
  assert.equal(row.row.primaryReason.code,'followed_thread_changed');assert.equal(row.row.primaryReason.text,'Вы следите: новое сообщение в обсуждении');
  const state=await personal(p,'discussed');
  await ok(call('PUT',`${base(p)}/tasks/discussed/personal/seen`,{baseRevision:state.seenRevision,sequence:state.latestSequence}));
  assert.deepEqual(where(await envelope(f.alice,p),'discussed'),[]);
  await ok(call('PATCH',`${base(p)}/threads/q1/resolution`,{resolved:true,baseRevision:thread.revision},f.bob));
  row=placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='discussed')!;
  assert.equal(row.row.primaryReason.text,'Вы следите: вопрос в обсуждении решён');
});

test('W14 review R1: reassignment pierces a snooze, a new relation starts now, first waits race, off is 404 unauthenticated',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor'],[dan,'editor']]);
  // F1: a request that reaches the person after the snooze is not hidden by it.
  await task(p,'s');await ask(p,'s',f.bob,f.alice);
  const state=await personal(p,'s');
  await ok(call('PUT',`${base(p)}/tasks/s/personal/snooze`,{baseRevision:state.snoozeRevision,until:inDays(5)+'T09:00:00Z'}));
  const toDan=await ask(p,'s',carol,dan);
  assert.deepEqual(where(await envelope(f.alice,p),'s'),[]);
  await ok(call('PATCH',`${base(p)}/requests/${toDan.id}`,{baseRevision:toDan.revision,recipientId:f.alice.id,neededBy:null},carol));
  assert.deepEqual(where(await envelope(f.alice,p),'s'),['action'],'reassigned to me after my snooze');
  // F3: following again does not replay the history from before the new relation.
  await task(p,'h');await follow(p,'h');await follow(p,'h',false);
  for(const status of ['in_progress','review','testing'])await edit(p,'h',{status},f.bob);
  await follow(p,'h');assert.deepEqual(where(await envelope(f.alice,p),'h'),[]);
  await edit(p,'h',{status:'in_progress'},f.bob);
  assert.equal(placed(await envelope(f.alice,p)).find(x=>x.row.taskId==='h')!.row.updates!.count,1);
  // F4: two first starts of "Жду" from two tabs: one wins, the other is told.
  await task(p,'w',{ownerId:f.bob.id});
  const starts=await Promise.all([inDays(1),inDays(2)].map(checkBackAt=>call('POST',`${base(p)}/tasks/w/wait-state`,{baseRevision:0,checkBackAt})));
  assert.deepEqual(starts.map(r=>r.statusCode).sort(),[200,409]);
  // F10: a switched-off feature is not found before authentication.
  const off=await startApp({settings:{SPRINTIQUE_FEATURES:'workbench_read_internal'}});
  try{
    assert.equal((await off.inject({url:'/api/v1/workbench/plan'})).statusCode,404);
    assert.equal((await off.inject({method:'POST',url:`${base(p)}/tasks/w/wait-state`,payload:{baseRevision:0}})).statusCode,404);
    assert.equal((await off.inject({url:'/api/v1/workbench'})).statusCode,401,'an enabled feature still needs a session');
  }finally{await off.close();}
  const none=await startApp({settings:{SPRINTIQUE_FEATURES:'none'}});
  try{for(const url of ['/workbench','/workbench/plan','/api/v1/workbench'])assert.equal((await none.inject({url})).statusCode,404,url);}
  finally{await none.close();}
});
