import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,sign,createHash} from 'node:crypto';
import {fixture} from './fixture.js';
import type {Task,Thread} from '../contracts/index.js';
import {TaskInput} from '../contracts/index.js';
import {Database} from '../backend/infrastructure/database.js';
import {createApp} from '../backend/http/app.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture();});after(async()=>{await f?.close();});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
function put(id:string,title:string,revision=0,key=randomUUID(),extra:Record<string,unknown>={}){
  return f.app.inject({method:'PUT',url:path('tasks/'+id),headers:{...f.alice.headers,'idempotency-key':key},payload:{baseRevision:revision,task:{title,...extra}}});
}
test('requires real authentication and fails closed without OIDC configuration',async()=>{
  assert.equal((await f.app.inject({url:path('tasks')})).statusCode,401);
  assert.equal((await f.app.inject({url:'/auth/login'})).statusCode,503);
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
  const db=new Database(process.env['DATABASE_URL']!);const app=await createApp({db,origin:'http://localhost:4311'});
  try{assert.equal((await app.inject({url:path('tasks/task-basic'),headers:f.alice.headers})).json<Task>().displayId,'SPR-1');}finally{await app.close();await db.close();}
  const owner=new Database(process.env['MIGRATION_DATABASE_URL']!);try{await assert.rejects(()=>owner.checkRuntimeRole());}finally{await owner.close();}
});
test('readiness checks schema access with the restricted runtime role',async()=>{
  const response=await f.app.inject({url:'/ready'});assert.equal(response.statusCode,200,response.body);
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
test('OIDC authorization code flow validates PKCE, nonce, signature and one-use browser state',async()=>{
  const issuer='https://identity.test',clientId='sprintique-test',origin='http://localhost:4311';
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
  let nonce='',challenge='',invalidSignature=false;
  const app=await createApp({db:f.db,origin,oidc:{issuer,clientId,clientSecret:'synthetic-secret',origin,transport:async(input,options)=>{
    const url=String(input);
    if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post']});
    if(url.endsWith('/jwks'))return Response.json({keys:[jwk]});
    assert.equal(url,issuer+'/token');const form=new URLSearchParams(String(options?.body));
    assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),origin+'/auth/callback');
    assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'),challenge);
    const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({iss:issuer,sub:'oidc-human',aud:clientId,iat:now,exp:now+60,nonce,name:'OIDC Test'})).toString('base64url');
    const signature=invalidSignature?'invalid':sign('RSA-SHA256',Buffer.from(header+'.'+payload),privateKey).toString('base64url');
    return Response.json({access_token:'not-used-by-product',token_type:'Bearer',expires_in:60,id_token:header+'.'+payload+'.'+signature});
  }}});
  try{
    async function begin(){const response=await app.inject({url:'/auth/login'});assert.equal(response.statusCode,302,response.body);const location=new URL(response.headers.location!);nonce=location.searchParams.get('nonce')!;challenge=location.searchParams.get('code_challenge')!;return {state:location.searchParams.get('state')!,cookie:String(response.headers['set-cookie']).split(';')[0]!};}
    const first=await begin();
    assert.equal((await app.inject({url:'/auth/callback?code=good&state='+first.state,headers:{cookie:'__Host-sprintique-login=wrong'}})).statusCode,400);
    const callback=await app.inject({url:'/auth/callback?code=good&state='+first.state,headers:{cookie:first.cookie}});assert.equal(callback.statusCode,302,callback.body);
    const cookies=callback.headers['set-cookie'] as string[];assert.match(cookies[0]!,/HttpOnly; Secure; SameSite=Lax/);
    const session=await app.inject({url:'/api/v1/session',headers:{cookie:cookies[0]!.split(';')[0]!}});assert.equal(session.statusCode,200,session.body);assert.equal(session.json().principal.name,'OIDC Test');
    assert.equal((await app.inject({url:'/auth/callback?code=good&state='+first.state,headers:{cookie:first.cookie}})).statusCode,400);
    const second=await begin();nonce='wrong';assert.equal((await app.inject({url:'/auth/callback?code=good&state='+second.state,headers:{cookie:second.cookie}})).statusCode,401);
    const third=await begin();invalidSignature=true;assert.equal((await app.inject({url:'/auth/callback?code=good&state='+third.state,headers:{cookie:third.cookie}})).statusCode,401);
  }finally{await app.close();}
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
  const db=new Database('postgresql://unused@127.0.0.1:1/sprintique');const app=await createApp({db,origin:'http://localhost:4311'});
  try{const response=await app.inject({url:'/api/v1/session',headers:f.alice.headers});assert.equal(response.statusCode,503);assert.equal(response.json().code,'TEMPORARILY_UNAVAILABLE');assert.ok(!response.body.includes('postgresql'));}
  finally{await app.close();await db.close();}
});
