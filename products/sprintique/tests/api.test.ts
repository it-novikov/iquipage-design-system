import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,startApp} from './fixture.js';
import type {Task,Thread} from '../contracts/index.js';
import {TaskInput} from '../contracts/index.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture();});after(async()=>{await f?.close();});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
function put(id:string,title:string,revision=0,key=randomUUID(),extra:Record<string,unknown>={}){
  return f.app.inject({method:'PUT',url:path('tasks/'+id),headers:{...f.alice.headers,'idempotency-key':key},payload:{baseRevision:revision,task:{title,...extra}}});
}
test('requires real authentication and fails closed without a configured sign-in provider',async()=>{
  assert.equal((await f.app.inject({url:path('tasks')})).statusCode,401);
  const unconfigured=await f.app.inject({url:'/auth/login/google'});assert.equal(unconfigured.statusCode,404);assert.equal(unconfigured.json().code,'SIGN_IN_NOT_CONFIGURED');
  assert.equal((await f.app.inject({url:'/auth/login/keycloak'})).statusCode,404);
  assert.equal((await f.app.inject({url:path('tasks'),headers:{'X-Maps-Client':'reference'}})).statusCode,401);
});
test('rejects CSRF, actor spoofing, unknown fields, malformed dates',async()=>{
  const bad=await f.app.inject({method:'PUT',url:path('tasks/csrf'),headers:{cookie:f.alice.headers.cookie,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'No'}}});
  assert.equal(bad.statusCode,403);
  assert.equal((await put('spoof','No',0,randomUUID(),{actorId:f.bob.id})).statusCode,400);
  assert.equal((await put('date','No',0,randomUUID(),{due:'2026-02-30'})).statusCode,400);
  assert.throws(()=>TaskInput.parse({title:'x',rank:Infinity}));
});
test('server allocates readable numbers; IDs, actor and clocks are not client-controlled',async()=>{
  const created=await put('task-basic','Первая задача');assert.equal(created.statusCode,200,created.body);
  const task=created.json<Task>();assert.equal(task.displayId,'SPR-1');assert.equal(task.revision,1);
  const read=await f.app.inject({url:path('tasks/SPR-1'),headers:f.alice.headers});assert.deepEqual(read.json(),task);
});
test('parallel duplicate retries produce one effect, one audit and one outbox event',async()=>{
  const key=randomUUID();const responses=await Promise.all(Array.from({length:8},()=>put('task-retry','Повтор',0,key)));
  responses.forEach(r=>assert.equal(r.statusCode,200,r.body));responses.forEach(r=>assert.deepEqual(r.json(),responses[0]!.json()));
  const count=await f.admin.query<{count:number}>("SELECT count(*)::int AS count FROM app.audit_events WHERE resource_id='task-retry'");assert.equal(count.rows[0]!.count,1);
  assert.equal((await put('task-retry','Другой запрос',0,key)).statusCode,409);
  const event=await f.admin.query("SELECT 1 FROM app.outbox o JOIN app.audit_events a USING(id) WHERE a.resource_id='task-retry'");assert.equal(event.rowCount,1);
});
test('competing edits use compare-and-set: one wins and stale draft is rejected',async()=>{
  await put('task-cas','Начало');
  const results=await Promise.all([put('task-cas','А',1),put('task-cas','Б',1)]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
});
test('project and workspace isolation includes reads, writes, catalogs and discussions',async()=>{
  for(const resource of ['tasks','tasks/task-basic','tags','releases','tasks/task-basic/threads']){
    const response=await f.app.inject({url:path(resource),headers:f.bob.headers});assert.equal(response.statusCode,404,response.body);
  }
  const denied=await f.app.inject({method:'PUT',url:path('tasks/task-basic'),headers:{...f.reader.headers,'idempotency-key':randomUUID()},payload:{baseRevision:1,task:{title:'No'}}});assert.equal(denied.statusCode,403);
  const projects=(await f.app.inject({url:'/api/v1/session',headers:f.bob.headers})).json<{projects:{id:string}[]}>();assert.deepEqual(projects.projects.map(p=>p.id),[f.second.id]);
});
test('RLS protects direct runtime SQL and context does not leak from pooled connections',async()=>{
  const rows=await f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query('SELECT id FROM app.tasks'));assert.equal(rows.rowCount,0);
  const none=await f.db.pool.query('SELECT id FROM app.tasks');assert.equal(none.rowCount,0);
  await assert.rejects(()=>f.db.authenticated({token:f.bob.token,kind:'session'},tx=>tx.query("UPDATE app.tasks SET title='Forbidden' WHERE id='task-basic' RETURNING id").then(r=>{assert.equal(r.rowCount,0);throw Error('rollback context');})));
  assert.equal((await f.db.pool.query('SELECT id FROM app.tasks')).rowCount,0);
});
test('parent cycles and cross-project references cannot be saved',async()=>{
  await put('parent-a','A');await put('parent-b','B',0,randomUUID(),{parentId:'parent-a'});
  assert.equal((await put('parent-a','A',1,randomUUID(),{parentId:'parent-b'})).statusCode,422);
  assert.equal((await put('parent-c','C',0,randomUUID(),{parentId:'unknown'})).statusCode,422);
  assert.equal((await put('tag-ref','Tag',0,randomUUID(),{tagIds:['unknown']})).statusCode,422);
});
test('thread messages and decision state have server-owned author, CAS and idempotency',async()=>{
  const key=randomUUID(),payload={id:'thread-one',messageId:'message-one',body:'Нужно решение',requiresResolution:true};
  const create=()=>f.app.inject({method:'POST',url:path('tasks/task-basic/threads'),headers:{...f.alice.headers,'idempotency-key':key},payload});
  const original=await create();assert.equal(original.statusCode,200,original.body);assert.equal(original.json<Thread>().messages[0]!.authorId,f.alice.id);
  assert.deepEqual((await create()).json(),original.json());
  const reply=await f.app.inject({method:'POST',url:path('threads/thread-one/messages'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{id:'message-two',body:'Ответ',baseRevision:1}});assert.equal(reply.statusCode,200,reply.body);
  const resolved=await f.app.inject({method:'PATCH',url:path('threads/thread-one/resolution'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{resolved:true,baseRevision:2}});
  assert.equal(resolved.statusCode,200,resolved.body);assert.equal(resolved.json<Thread>().resolution!.actorId,f.alice.id);
  const page=await f.app.inject({url:path('tasks/task-basic/threads'),headers:f.alice.headers});assert.equal(page.json().items[0].messageCount,2);assert.equal(page.json().unresolved,0);
});
test('scoped agent token cannot widen access, impersonate a human or survive revocation',async()=>{
  const issued=await f.app.inject({method:'POST',url:path('agents'),headers:f.alice.headers,payload:{name:'Агент проверки',capabilities:['tasks:read'],expiresInSeconds:60}});
  assert.equal(issued.statusCode,200,issued.body);const agent=issued.json<{token:string;credentialId:string}>();
  const headers={authorization:'Bearer '+agent.token};assert.equal((await f.app.inject({url:path('tasks'),headers})).statusCode,200);
  assert.equal((await f.app.inject({url:path('threads/thread-one'),headers})).statusCode,403);
  assert.equal((await f.app.inject({url:`/api/v1/projects/${f.second.id}/tasks`,headers})).statusCode,404);
  assert.equal((await f.app.inject({method:'POST',url:path('agents'),headers,payload:{name:'Nested',capabilities:['tasks:write'],expiresInSeconds:60}})).statusCode,403);
  await f.app.inject({method:'DELETE',url:path('agents/'+agent.credentialId),headers:f.alice.headers});
  assert.equal((await f.app.inject({url:path('tasks'),headers})).statusCode,401);
});
test('expired session is rejected; logout revokes the actual server credential',async()=>{
  await f.admin.query("UPDATE auth.credentials SET expires_at=now()-interval '1 second' WHERE id=$1",[f.reader.credential]);
  assert.equal((await f.app.inject({url:'/api/v1/session',headers:f.reader.headers})).statusCode,401);
  assert.equal((await f.app.inject({method:'POST',url:'/api/v1/logout',headers:f.bob.headers})).statusCode,200);
  assert.equal((await f.app.inject({url:'/api/v1/session',headers:f.bob.headers})).statusCode,401);
});
test('records survive a new application and database-pool instance; no memory fallback',async()=>{
  const app=await startApp();
  try{assert.equal((await app.inject({url:path('tasks/task-basic'),headers:f.alice.headers})).json<Task>().displayId,'SPR-1');}finally{await app.close();}
  // The owner role bypasses row security: the API refuses to run with it.
  await assert.rejects(()=>startApp({databaseUrl:process.env['MIGRATION_DATABASE_URL']!}));
});
test('readiness checks schema access with the restricted runtime role',async()=>{
  const response=await f.app.inject({url:'/ready'});assert.equal(response.statusCode,200,response.body);
});
test('a tag colour is a palette tone or any RGB colour, stored upper case',async()=>{
  const tag=(id:string,tone:string)=>f.app.inject({method:'PUT',url:path('tags/'+id),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:{name:'Цвет '+id,tone}}});
  const custom=await tag('rgb','#3a7bd5');assert.equal(custom.statusCode,200,custom.body);assert.equal(custom.json().tone,'#3A7BD5');
  for(const bad of ['#12345','red-ish','#GGGGGG','3A7BD5'])assert.equal((await tag('bad-'+bad.length,bad)).statusCode,400);
});
test('archived catalog references can be retained, but cannot be newly assigned',async()=>{
  const headers={...f.alice.headers,'idempotency-key':randomUUID()};
  assert.equal((await f.app.inject({method:'PUT',url:path('tags/design'),headers,payload:{baseRevision:0,value:{name:'Дизайн',tone:'purple'}}})).statusCode,200);
  assert.equal((await put('tag-keep','Тег',0,randomUUID(),{tagIds:['design']})).statusCode,200);
  assert.equal((await f.app.inject({method:'PUT',url:path('tags/design'),headers:{...headers,'idempotency-key':randomUUID()},payload:{baseRevision:1,value:{name:'Дизайн',tone:'purple',archivedAt:new Date().toISOString()}}})).statusCode,200);
  assert.equal((await put('tag-keep','Сохранённый тег',1,randomUUID(),{tagIds:['design']})).statusCode,200);
  assert.equal((await put('tag-new','Новый тег',0,randomUUID(),{tagIds:['design']})).statusCode,422);
});
test('agent grant is invalidated when the human initiator loses project access',async()=>{
  const issue=await f.app.inject({method:'POST',url:path('agents'),headers:f.alice.headers,payload:{name:'Auditor',capabilities:['tasks:read'],expiresInSeconds:60}});
  const agent=issue.json<{token:string}>();
  await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[f.first.id,f.alice.id]);
  try{assert.equal((await f.app.inject({url:path('tasks'),headers:{authorization:'Bearer '+agent.token}})).statusCode,403);}
  finally{await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'admin')",[f.first.id,f.alice.id]);}
});
test('outbox failure rolls back canonical state, number allocation, audit and idempotency',async()=>{
  await f.admin.query(`CREATE FUNCTION public.fail_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'resourceId'='rollback-task' THEN RAISE EXCEPTION 'synthetic delivery persistence failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_outbox_failure BEFORE INSERT ON app.outbox FOR EACH ROW EXECUTE FUNCTION public.fail_test_outbox()`);
  const key=randomUUID();
  try{
    assert.equal((await put('rollback-task','Rollback',0,key)).statusCode,503);
    assert.equal((await f.admin.query("SELECT 1 FROM app.tasks WHERE id='rollback-task'")).rowCount,0);
    assert.equal((await f.admin.query("SELECT 1 FROM app.audit_events WHERE resource_id='rollback-task'")).rowCount,0);
    assert.equal((await f.admin.query('SELECT 1 FROM app.idempotency WHERE key=$1',[key])).rowCount,0);
  }finally{await f.admin.query('DROP TRIGGER test_outbox_failure ON app.outbox; DROP FUNCTION public.fail_test_outbox()');}
  assert.equal((await put('rollback-task','Rollback',0,key)).statusCode,200);
});
test('discussion pagination rejects stale and cross-task cursors without losing the data',async()=>{
  const add=(id:string)=>f.app.inject({method:'POST',url:path('tasks/task-basic/threads'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{id,messageId:'msg-'+id,body:id,requiresResolution:false}});
  await add('page-a');await add('page-b');
  const first=(await f.app.inject({url:path('tasks/task-basic/threads?limit=1'),headers:f.alice.headers})).json<{nextCursor:string}>();assert.ok(first.nextCursor);
  const other=await f.app.inject({url:path('tasks/parent-a/threads?cursor='+first.nextCursor),headers:f.alice.headers});assert.equal(other.statusCode,400);
  await add('page-c');
  const stale=await f.app.inject({url:path('tasks/task-basic/threads?cursor='+first.nextCursor),headers:f.alice.headers});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'THREAD_CURSOR_STALE');
});
test('unavailable PostgreSQL returns a bounded failure, never a fallback user or memory store',async()=>{
  const app=await startApp({databaseUrl:'postgresql://unused@127.0.0.1:1/sprintique'});
  try{const response=await app.inject({url:'/api/v1/session',headers:f.alice.headers});assert.equal(response.statusCode,503);assert.equal(response.json().code,'TEMPORARILY_UNAVAILABLE');assert.ok(!response.body.includes('postgresql'));}
  finally{await app.close();}
});
