import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fixture} from './fixture.js';
import {TaskInput} from '../contracts/index.js';
import type {Task} from '../contracts/index.js';
import {pageThreads} from '../backend/application/discussions.js';
import {rows as planningRows} from '../backend/application/planning-view.js';
import {MAX_TASK_DEPTH,validateTaskHierarchy} from '../backend/domain/task-invariants.js';
import {ViewRowsQuery} from '../contracts/planning-view.js';
import type {Actor,Transaction} from '../backend/infrastructure/database.js';
import type {TaskState} from '../backend/domain/planning.js';

let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'R4B'});});
after(async()=>{await f?.close();});

function request(method:'GET'|'POST'|'PUT'|'PATCH',resource:string,payload?:unknown,key=randomUUID()){
  return f.app.inject({method,url:`/api/v1/projects/${f.first.id}/${resource}`,
    headers:{...f.alice.headers,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
}
async function task(id:string,extra:Record<string,unknown>={}){
  const response=await request('PUT','tasks/'+id,{baseRevision:0,task:{title:id,...extra}});
  assert.equal(response.statusCode,200,response.body);return response.json<Task>();
}
async function apply(command:unknown){
  const preview=await request('POST','planning/previews',command);assert.equal(preview.statusCode,200,preview.body);
  const {id,token}=preview.json();
  const response=await request('POST','planning/commands',{planId:id,token});
  assert.equal(response.statusCode,200,response.body);assert.equal(response.json().status,'committed',response.body);
}

test('B01 accepted result is immutable through canonical and legacy task writes; receipts still replay',async()=>{
  const key=randomUUID(),initial={baseRevision:0,task:{title:'Accepted original',status:'ready_for_release'}};
  const created=await request('PUT','tasks/audit-accepted',initial,key);assert.equal(created.statusCode,200,created.body);
  assert.equal((await request('PUT','planning/releases/audit-acceptance',{baseRevision:0,value:{name:'Acceptance'}})).statusCode,200);
  const selection={kind:'tasks',ids:['audit-accepted']};
  await apply({kind:'prepare',selection,preparation:'ready'});
  await apply({kind:'assign',selection,assignment:{mode:'assigned',releaseId:'audit-acceptance'}});
  await apply({kind:'start',releaseId:'audit-acceptance'});
  await apply({kind:'close',releaseId:'audit-acceptance',accepted:selection,destination:{kind:'unassigned'}});
  const current=(await request('GET','tasks/audit-accepted')).json<Task>();
  assert.equal(current.result,'accepted');
  const content=TaskInput.strip().parse(current);
  const auditBefore=(await f.admin.query('SELECT count(*)::int AS n FROM app.audit_events WHERE project_id=$1',[f.first.id])).rows[0]!.n;
  const historyBefore=(await request('GET','planning/releases/audit-acceptance/history')).json();
  for(const change of [{title:'Changed'},{description:'Changed'},{owner:'Changed'},{priority:'critical'},{type:'bug'},
    {due:'2027-01-01'},{rank:7},{tagIds:['not-authorized']},{attachmentIds:['not-authorized']},{status:'ready'}]){
    const response=await request('PUT','tasks/audit-accepted',{baseRevision:current.revision,task:{...content,...change}});
    assert.equal(response.statusCode,409,response.body);assert.equal(response.json().code,'RESULT_PINNED');
  }
  for(const change of [{status:current.status,rank:7},{status:'ready',rank:current.rank}]){
    const response=await request('PATCH','tasks/audit-accepted/position',{baseRevision:current.revision,...change});
    assert.equal(response.statusCode,409,response.body);assert.equal(response.json().code,'RESULT_PINNED');
  }
  const canonical=await request('POST','planning/previews',{kind:'task.edit',taskId:current.id,baseRevision:current.revision,task:{...content,title:'Changed'}});
  assert.equal(canonical.statusCode,409);assert.equal(canonical.json().code,'RESULT_PINNED');
  assert.deepEqual((await request('GET','tasks/audit-accepted')).json(),current);
  assert.deepEqual((await request('GET','planning/releases/audit-acceptance/history')).json(),historyBefore);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.audit_events WHERE project_id=$1',[f.first.id])).rows[0]!.n,auditBefore);
  assert.deepEqual((await request('PUT','tasks/audit-accepted',initial,key)).json(),created.json());
  assert.deepEqual((await request('GET','tasks/audit-accepted')).json(),current);
});

test('B02 hierarchy write boundary includes moved descendants and preserves readable state after denial',async()=>{
  for(let depth=0;depth<=MAX_TASK_DEPTH;depth++)await task('depth-'+depth,{parentId:depth?'depth-'+(depth-1):null});
  await task('outside-root');
  const before=(await f.admin.query('SELECT next_task_number,planning_revision,event_sequence FROM app.projects WHERE id=$1',[f.first.id])).rows[0];
  const tooDeep=await request('PUT','tasks/depth-overflow',{baseRevision:0,task:{title:'Overflow',parentId:'depth-'+MAX_TASK_DEPTH}});
  assert.equal(tooDeep.statusCode,422,tooDeep.body);assert.equal(tooDeep.json().code,'HIERARCHY_DEPTH');
  for(const command of [
    {kind:'task.create',taskId:'canonical-overflow',task:TaskInput.parse({title:'Overflow',parentId:'depth-'+MAX_TASK_DEPTH})},
    {kind:'reparent',taskId:'depth-0',parentId:'outside-root'},
    {kind:'task.edit',taskId:'depth-0',baseRevision:1,task:TaskInput.parse({title:'Root',parentId:'outside-root'})}
  ]){
    const response=await request('POST','planning/previews',command);
    assert.equal(response.statusCode,422,response.body);assert.equal(response.json().code,'HIERARCHY_DEPTH');
  }
  assert.deepEqual((await f.admin.query('SELECT next_task_number,planning_revision,event_sequence FROM app.projects WHERE id=$1',[f.first.id])).rows[0],before);
  assert.equal((await request('GET','tasks/depth-overflow')).statusCode,404);
  const group=(await request('POST','planning/view/groups',{query:'depth-'})).json();
  const page=await request('POST','planning/view/rows',{groupId:'backlog',revision:group.revision,query:'depth-'});
  assert.equal(page.statusCode,200,page.body);assert.equal(page.json().rows.length,MAX_TASK_DEPTH+1);
  assert.equal(page.json().rows.at(-1).depth,MAX_TASK_DEPTH);
  assert.throws(()=>validateTaskHierarchy([{id:'a',parentId:'b'},{id:'b',parentId:'a'}]),{code:'TASK_CYCLE'});
  assert.throws(()=>validateTaskHierarchy([{id:'a',parentId:'missing'}]),{code:'TASK_PARENT'});
});

test('B04 thread pages have constant query count, bounded summaries, stable ordering and revision cursors',async()=>{
  await task('thread-catalogue');
  // Synthetic rows belong only to this disposable test cluster. Force sub-millisecond
  // timestamps so serialization cannot silently change the database ordering.
  await f.admin.query(`INSERT INTO app.threads(project_id,id,task_id,requires_resolution,last_activity_at)
    SELECT $1,'catalogue-'||lpad(n::text,4,'0'),'thread-catalogue',n%3=0,'2026-01-01'::timestamptz+n*interval '1 microsecond'
    FROM generate_series(1,1000) n`,[f.first.id]);
  await f.admin.query(`INSERT INTO app.messages(project_id,id,thread_id,body,author_id)
    SELECT $1,'catalogue-message-'||n,'catalogue-'||lpad(n::text,4,'0'),repeat('x',200),$2 FROM generate_series(1,1000) n`,[f.first.id,f.alice.id]);
  let queryCount=0;
  const first=await f.db.authenticated({token:f.alice.token,kind:'session'},async tx=>{
    const measured=new Proxy(tx,{get(target,property,receiver){
      if(property==='query')return (...args:unknown[])=>{queryCount++;return Reflect.apply(target.query,target,args);};
      return Reflect.get(target,property,receiver);
    }});
    return pageThreads(measured,f.first.id,'thread-catalogue',null,50);
  });
  assert.equal(queryCount,2);assert.equal(first.items.length,50);assert.equal(first.total,1000);assert.equal(first.unresolved,333);
  assert.ok(first.items.every(item=>item.messageCount===1&&item.messages[0]!.body.length===160));
  assert.ok(Buffer.byteLength(JSON.stringify(first))<50*1024);
  const expected=(await f.admin.query(`SELECT id FROM app.threads WHERE project_id=$1 AND task_id='thread-catalogue'
    ORDER BY (requires_resolution AND NOT resolved) DESC,last_activity_at DESC,id`,[f.first.id])).rows.map(row=>row.id);
  const ids=first.items.map(item=>item.id);let cursor=first.nextCursor;
  while(cursor){const response=await request('GET','tasks/thread-catalogue/threads?limit=50&cursor='+encodeURIComponent(cursor));assert.equal(response.statusCode,200,response.body);
    const value=response.json();ids.push(...value.items.map((item:{id:string})=>item.id));cursor=value.nextCursor;}
  assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,1000);
  const change=await request('POST','threads/'+first.items[0]!.id+'/messages',{id:'catalogue-reply',body:'Reply',baseRevision:1});assert.equal(change.statusCode,200,change.body);
  const stale=await request('GET','tasks/thread-catalogue/threads?cursor='+encodeURIComponent(first.nextCursor!));assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'THREAD_CURSOR_STALE');
  const fresh=(await request('GET','tasks/thread-catalogue/threads?limit=1')).json();
  const resolution=await request('PATCH','threads/'+first.items[0]!.id+'/resolution',{resolved:true,baseRevision:2});assert.equal(resolution.statusCode,200,resolution.body);
  assert.equal((await request('GET','tasks/thread-catalogue/threads?cursor='+encodeURIComponent(fresh.nextCursor))).json().code,'THREAD_CURSOR_STALE');
  const malformed=Buffer.from(JSON.stringify({projectId:f.first.id,taskId:'thread-catalogue',version:[],after:'x'})).toString('base64url');
  assert.equal((await request('GET','tasks/thread-catalogue/threads?cursor='+malformed)).statusCode,400);
  assert.deepEqual((await request('GET','tasks/outside-root/threads')).json(),{items:[],total:0,unresolved:0,nextCursor:null});
});

test('B05 10000-row group projection does not rescan the group for each DTO',async t=>{
  const count=10000;
  const tasks:TaskState[]=Array.from({length:count},(_,i)=>({...TaskInput.parse({title:'Task '+i,rank:i}),id:'cpu-'+i,displayId:'CPU-'+(i+1),revision:1,
    preparation:'draft',result:'open',admitted:false,assignmentMode:'none',plannedStart:null,plannedEnd:null,createdAt:'2026-01-01T00:00:00.000Z',statusEnteredAt:'2026-01-01T00:00:00.000Z'}));
  const actor:Actor={id:'synthetic',kind:'human',credentialId:'synthetic',initiatorId:'synthetic',capabilities:[],name:'Synthetic',csrf:null,projectId:null};
  const tx={async query(sql:string){
    let data:unknown[]=[];
    if(sql.includes('p.workspace_id AS'))data=[{workspaceId:'synthetic',role:'admin'}];
    else if(sql.includes('planning_revision::float8 AS revision'))data=[{revision:1,timezone:'UTC'}];
    else if(sql.includes('auth.credentials'))data=[{valid:1}];
    else if(sql.includes('FROM app.tasks t JOIN'))data=tasks;
    else if(sql.includes('planning_defaults||'))data=[{value:{format:'flexible',days:14,timezone:'UTC'}}];
    else if(sql.includes('next_task_number'))data=[{projectId:'synthetic',key:'CPU',number:count+1,createdAt:'2026-01-01T00:00:00.000Z'}];
    return {rows:data,rowCount:data.length};
  }} as unknown as Transaction;
  // A deterministic work counter catches the previous N member.filter calls without
  // setting a hardware-dependent SLA. This test runs serially and restores in finally.
  const original=Array.prototype.filter;let fullScans=0;
  Array.prototype.filter=function(...args:Parameters<typeof original>){if(this.length===count)fullScans++;return Reflect.apply(original,this,args);};
  const started=performance.now();
  try{
    const first=await planningRows(tx,actor,'synthetic',ViewRowsQuery.parse({groupId:'backlog',revision:'1'}));
    assert.equal(first.rows.length,200);assert.equal(first.rows[0]!.key,'CPU-1');assert.equal(first.rows.at(-1)!.key,'CPU-200');
    assert.ok(first.rows.every(row=>row.childrenCount===0));assert.ok(first.nextCursor);
    assert.ok(fullScans<20,`Expected a constant number of whole-group scans, got ${fullScans}`);
  }finally{Array.prototype.filter=original;}
  t.diagnostic(JSON.stringify({profile:'CPU-only-not-SLA',tasks:count,pageSize:200,fullGroupFilterCalls:fullScans,elapsedMs:Math.round(performance.now()-started)}));
});
