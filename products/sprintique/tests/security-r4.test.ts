import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture,origin} from './fixture.js';
import {createApp} from '../backend/http/app.js';
import {MapDocument} from '../contracts/maps.js';
import {PREVIEW_BUDGET} from '../contracts/planning.js';
import {appendMessage} from '../backend/application/discussions.js';
import type {ObjectStorage} from '../backend/infrastructure/object-storage.js';
import type {Capability,Message,Task,Thread} from '../contracts/index.js';

/** Regressions for the security findings resolved after the R4 deep-scan handover.
 *  Each test fails against the engineering build that preceded these fixes. */
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'SEC'});});
after(async()=>{await f?.close();});

const base=()=>`/api/v1/projects/${f.first.id}/`;
function call(method:'GET'|'POST'|'PUT'|'PATCH',resource:string,headers:Record<string,string>,payload?:unknown,key=randomUUID()){
  return f.app.inject({method,url:base()+resource,headers:{...headers,'idempotency-key':key},
    ...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
}
async function grant(capabilities:Capability[]){
  const response=await call('POST','agents',f.alice.headers,{name:'Агент '+capabilities.join(','),capabilities,expiresInSeconds:3600});
  assert.equal(response.statusCode,200,response.body);
  return {authorization:'Bearer '+response.json<{token:string}>().token};
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
async function waitForProjectLock(pid:number){
  for(let attempt=0;attempt<200;attempt++){
    await f.admin.query('SELECT pg_stat_clear_snapshot()');
    const row=(await f.admin.query<{waiting:boolean}>(`SELECT wait_event_type='Lock' AND query LIKE '%app.projects%FOR UPDATE%' AS waiting FROM pg_stat_activity WHERE pid=$1`,[pid])).rows[0];
    if(row?.waiting)return;
    await delay(10);
  }
  assert.fail('Expected the discussion write to queue behind the project aggregate lock');
}

test('SEC-01 a write-only grant never receives preserved content it may not read',async()=>{
  const secret='Внутреннее описание, которое агент не читает';
  const created=await call('PUT','tasks/sec-disclosure',f.alice.headers,{baseRevision:0,task:{title:'Задача',description:secret}});
  assert.equal(created.statusCode,200,created.body);
  const task=created.json<Task>();assert.equal(task.description,secret);
  const writer=await grant(['tasks:write']),full=await grant(['tasks:write','tasks:read']);

  const position=await call('PATCH','tasks/sec-disclosure/position',writer,{baseRevision:task.revision,status:'in_progress',rank:2048});
  assert.equal(position.statusCode,200,position.body);
  assert.equal(position.json().receipt,'task');
  assert.ok(!('description' in position.json()),'position readback disclosed preserved content');
  assert.ok(!JSON.stringify(position.json()).includes(secret));

  const write=await call('PUT','tasks/sec-disclosure',writer,{baseRevision:position.json().revision,task:{title:'Задача',description:'своё'}});
  assert.equal(write.statusCode,200,write.body);
  assert.equal(write.json().receipt,'task');
  assert.ok(!('preparation' in write.json()),'canonical readback disclosed server planning fields');

  const readable=await call('PATCH','tasks/sec-disclosure/position',full,{baseRevision:write.json().revision,status:'review',rank:3000});
  assert.equal(readable.statusCode,200,readable.body);
  assert.ok(!('receipt' in readable.json()));
  assert.equal(readable.json<Task>().description,'своё');
});

test('SEC-01 discussion readback and Planning previews respect the read grant',async()=>{
  const thread=randomUUID();
  await call('PUT','tasks/sec-thread-task',f.alice.headers,{baseRevision:0,task:{title:'Обсуждение'}});
  const opened=await call('POST','tasks/sec-thread-task/threads',f.alice.headers,{id:thread,messageId:randomUUID(),body:'Человеческий ответ с деталями',requiresResolution:false});
  assert.equal(opened.statusCode,200,opened.body);
  const writer=await grant(['threads:write']),full=await grant(['threads:write','threads:read']);

  const appended=await call('POST',`threads/${thread}/messages`,writer,{id:randomUUID(),body:'Ответ агента',baseRevision:opened.json<Thread>().revision});
  assert.equal(appended.statusCode,200,appended.body);
  assert.equal(appended.json().receipt,'thread');
  assert.deepEqual(appended.json<Thread>().messages.map((m:Message)=>m.body),['Ответ агента']);

  const visible=await call('POST',`threads/${thread}/messages`,full,{id:randomUUID(),body:'Второй ответ',baseRevision:appended.json<Thread>().revision});
  assert.equal(visible.statusCode,200,visible.body);
  assert.ok(!('receipt' in visible.json()));
  assert.equal(visible.json<Thread>().messages.length,3);

  const planner=await grant(['tasks:write']);
  const preview=await call('POST','planning/previews',planner,{kind:'prepare',selection:{kind:'filter',filter:{openOnly:true}},preparation:'ready'});
  assert.equal(preview.statusCode,403,preview.body);
  assert.equal(preview.json().code,'FORBIDDEN');
});

test('SEC-02 a retry receipt stays bounded while the thread grows',async()=>{
  const thread=randomUUID();
  await call('PUT','tasks/sec-ledger-task',f.alice.headers,{baseRevision:0,task:{title:'Лента'}});
  const opened=await call('POST','tasks/sec-ledger-task/threads',f.alice.headers,{id:thread,messageId:randomUUID(),body:'Начало',requiresResolution:false});
  assert.equal(opened.statusCode,200,opened.body);
  let revision=opened.json<Thread>().revision;
  const body='Сообщение '.repeat(200),keys:`${string}-${string}-${string}-${string}-${string}`[]=[];
  for(let index=0;index<6;index++){
    const key=randomUUID();keys.push(key);
    const response=await call('POST',`threads/${thread}/messages`,f.alice.headers,{id:randomUUID(),body:body+index,baseRevision:revision},key);
    assert.equal(response.statusCode,200,response.body);revision=response.json<Thread>().revision;
  }
  const sizes=(await f.admin.query<{size:number}>(
    `SELECT length(result::text) AS size FROM app.idempotency WHERE project_id=$1 AND operation=$2 AND key=ANY($3) ORDER BY key`,
    [f.first.id,'thread.append:'+thread,keys])).rows.map(r=>Number(r.size));
  assert.equal(sizes.length,keys.length);
  assert.ok(Math.max(...sizes)<200,`retry receipt grew to ${Math.max(...sizes)} bytes`);
  assert.equal(new Set(sizes.map(size=>size<200)).size,1);

  // A replayed key still answers with the committed thread, not with the stored receipt shape.
  const replay=await call('POST',`threads/${thread}/messages`,f.alice.headers,{id:(await f.admin.query<{id:string}>(
    'SELECT id FROM app.messages WHERE project_id=$1 AND thread_id=$2 ORDER BY created_at DESC LIMIT 1',[f.first.id,thread])).rows[0]!.id,
    body:body+5,baseRevision:revision-1},keys[keys.length-1]!);
  assert.equal(replay.statusCode,200,replay.body);
  assert.equal(replay.json<Thread>().messages.length,7);
});

test('SEC-03 a queued discussion write cannot commit after the credential is revoked',{timeout:15000},async()=>{
  const thread=randomUUID();
  await call('PUT','tasks/sec-fence-task',f.alice.headers,{baseRevision:0,task:{title:'Гонка'}});
  const opened=await call('POST','tasks/sec-fence-task/threads',f.alice.headers,{id:thread,messageId:randomUUID(),body:'Первое',requiresResolution:false});
  assert.equal(opened.statusCode,200,opened.body);
  const messageId=randomUUID();
  await f.admin.query('BEGIN');
  await f.admin.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[f.first.id]);
  const started=deferred<number>();
  const write=f.db.authenticated({token:f.alice.token,kind:'session'},async(tx,actor)=>{
    started.resolve((await tx.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
    return appendMessage(tx,actor,f.first.id,thread,{id:messageId,body:'После отзыва',baseRevision:opened.json<Thread>().revision},randomUUID());
  });
  const outcome=write.then(value=>({value}),error=>({error}));
  try{
    await waitForProjectLock(await started.promise);
    await f.admin.query('UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=$1',[f.alice.credential]);
    await f.admin.query('COMMIT');
    const result=await outcome;
    assert.ok('error' in result,'a revoked credential committed a discussion write');
    assert.equal(result.error.code,'UNAUTHENTICATED');
    const stored=await f.admin.query('SELECT 1 FROM app.messages WHERE project_id=$1 AND id=$2',[f.first.id,messageId]);
    assert.equal(stored.rowCount,0);
  }finally{
    await f.admin.query('ROLLBACK').catch(()=>{});
    await f.admin.query('UPDATE auth.credentials SET revoked_at=NULL WHERE id=$1',[f.alice.credential]);
    await outcome;
  }
});

test('SEC-04 outstanding previews are budgeted and expired unapplied ones are collected',async()=>{
  await call('PUT','tasks/sec-budget-task',f.alice.headers,{baseRevision:0,task:{title:'Бюджет'}});
  const propose=()=>call('POST','planning/previews',f.alice.headers,{kind:'prepare',selection:{kind:'tasks',ids:['sec-budget-task']},preparation:'ready'});
  const before=(await f.admin.query<{n:string}>(`SELECT count(*) n FROM app.planning_plans p WHERE p.project_id=$1
    AND NOT EXISTS(SELECT 1 FROM app.planning_applied a WHERE a.project_id=p.project_id AND a.plan_id=p.id)`,[f.first.id])).rows[0]!.n;
  let refused:Awaited<ReturnType<typeof propose>>|null=null;
  for(let index=Number(before);index<=PREVIEW_BUDGET.actorPlans;index++){
    const response=await propose();
    if(response.statusCode===429){refused=response;break;}
    assert.equal(response.statusCode,200,response.body);
  }
  assert.ok(refused,'an unbounded number of project-sized previews was accepted');
  assert.equal(refused.json().code,'PREVIEW_QUOTA');
  await f.admin.query(`UPDATE app.planning_plans SET expires_at=clock_timestamp()-make_interval(mins=>$2::int) WHERE project_id=$1`,
    [f.first.id,PREVIEW_BUDGET.retentionMinutes+10]);
  const recovered=await propose();
  assert.equal(recovered.statusCode,200,recovered.body);
  const left=(await f.admin.query<{n:string}>('SELECT count(*) n FROM app.planning_plans WHERE project_id=$1 AND expires_at<clock_timestamp()',[f.first.id])).rows[0]!.n;
  assert.equal(Number(left),0,'expired unapplied previews were retained');
});

test('SEC-05 anonymous readiness shares one dependency probe and still fails closed',async()=>{
  let probes=0;
  const counting:ObjectStorage={put:async()=>{},get:async()=>new Uint8Array(),remove:async()=>{},
    ready:async()=>{probes++;await delay(25);}};
  const app=await createApp({db:f.db,origin,storage:counting});
  try{
    const burst=await Promise.all(Array.from({length:24},()=>app.inject('/ready')));
    assert.ok(burst.every(r=>r.statusCode===200),'readiness burst did not succeed');
    assert.ok(probes<24,`each anonymous request still probed storage (${probes} probes)`);
    const after=probes;
    assert.equal((await app.inject('/ready')).statusCode,200);
    assert.ok(probes>after,'a later request reused a cached result instead of re-probing');
    const failing=await createApp({db:f.db,origin,storage:{...counting,ready:async()=>{throw Error('storage down');}}});
    try{assert.equal((await failing.inject('/ready')).statusCode,503);}finally{await failing.close();}
  }finally{await app.close();}
});

test('SEC-06 the canonical map schema bounds image objects and parallel connections',()=>{
  const object=(id:string,extra:Record<string,unknown>={})=>({id,type:'sticky',text:'',x:0,y:0,width:100,height:100,...extra});
  const document=(objects:unknown[],connections:unknown[]=[])=>MapDocument.safeParse({schema:'iquipage.whiteboard/1',title:'Карта',revision:1,objects,connections});
  const image=(index:number)=>object('img-'+index,{type:'image',assetId:'asset-shared'});
  assert.equal(document(Array.from({length:40},(_,i)=>image(i))).success,true);
  const many=document(Array.from({length:41},(_,i)=>image(i)));
  assert.equal(many.success,false);
  assert.ok(many.error!.issues.some(issue=>issue.message==='Too many image objects.'));

  const pair=[object('a'),object('b')];
  const edge=(id:string,extra:Record<string,unknown>={})=>({id,from:'a',to:'b',...extra});
  const duplicate=document(pair,[edge('e1'),edge('e2')]);
  assert.equal(duplicate.success,false);
  assert.ok(duplicate.error!.issues.some(issue=>issue.message==='Duplicate connection geometry.'));
  const distinct=Array.from({length:16},(_,i)=>edge('e'+i,{bend:i+1}));
  assert.equal(document(pair,distinct).success,true);
  const crowded=document(pair,[...distinct,edge('e99',{bend:99})]);
  assert.equal(crowded.success,false);
  assert.ok(crowded.error!.issues.some(issue=>issue.message==='Too many connections between the same objects.'));
});
