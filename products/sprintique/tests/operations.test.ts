import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {createApp} from '../backend/http/app.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'O'});});after(async()=>{await f?.close();});
test('O01 live OpenAPI inventory exposes bounded request schemas and exact command idempotency headers',async()=>{
  const r=await f.app.inject('/openapi.json');assert.equal(r.statusCode,200,r.body);const doc=r.json();assert.equal(doc.openapi,'3.1.0');
  assert.ok(Object.keys(doc.paths).length>45);assert.ok(doc.components.schemas.PutMap);assert.ok(doc.components.schemas.StartAgentRun);assert.ok(doc.components.schemas.PutProjectProfile);
  const put=doc.paths['/api/v1/projects/{projectId}/maps/{id}'].put;assert.equal(put.requestBody.content['application/json'].schema.$ref,'#/components/schemas/PutMap');assert.ok(put.parameters.some((p:{name:string;required:boolean})=>p.name==='Idempotency-Key'&&p.required));
  const preview=doc.paths['/api/v1/projects/{projectId}/planning/previews'].post;assert.ok(!preview.parameters.some((p:{name:string})=>p.name==='Idempotency-Key'));
  for(const match of r.body.matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g))assert.ok(doc.components.schemas[match[1]!],'Unresolved public schema');
});
test('O02 readiness fails closed on missing, changed and unknown migration checksums',async()=>{
  assert.equal((await f.app.inject('/ready')).statusCode,200);
  const row=(await f.admin.query('SELECT name,sha256,applied_at FROM public.schema_migrations ORDER BY name LIMIT 1')).rows[0];
  try{await f.admin.query('UPDATE public.schema_migrations SET sha256=$2 WHERE name=$1',[row.name,'wrong']);const bad=await f.app.inject('/ready');assert.equal(bad.statusCode,503);assert.equal(bad.json().code,'SCHEMA_MISMATCH');}
  finally{await f.admin.query('UPDATE public.schema_migrations SET sha256=$2 WHERE name=$1',[row.name,row.sha256]);}
  try{await f.admin.query('DELETE FROM public.schema_migrations WHERE name=$1',[row.name]);assert.equal((await f.app.inject('/ready')).statusCode,503);}
  finally{await f.admin.query('INSERT INTO public.schema_migrations(name,sha256,applied_at) VALUES($1,$2,$3)',[row.name,row.sha256,row.applied_at]);}
  try{await f.admin.query("INSERT INTO public.schema_migrations(name,sha256) VALUES('999_unknown.sql','unknown')");assert.equal((await f.app.inject('/ready')).statusCode,503);}
  finally{await f.admin.query("DELETE FROM public.schema_migrations WHERE name='999_unknown.sql'");}
  assert.equal((await f.app.inject('/ready')).statusCode,200);
});
test('O04 only a live project admin can inspect or retry failed asset jobs, with atomic audit and replay',async()=>{
  const id=randomUUID(),foreign=randomUUID(),base=`/api/v1/projects/${f.first.id}/operations`;
  await f.admin.query("INSERT INTO work.jobs(id,project_id,kind,dedupe_key,payload,state,attempts,last_error) VALUES($1::uuid,$2,'asset.gc',$1::text,'{}','failed',10,'ATTEMPTS_EXHAUSTED'),($3::uuid,$4,'asset.gc',$3::text,'{}','failed',10,'ATTEMPTS_EXHAUSTED')",[id,f.first.id,foreign,f.second.id]);
  const retry=(job:string,headers=f.alice.headers,key=randomUUID())=>f.app.inject({method:'POST',url:base+'/jobs/'+job+'/retry',headers:{...headers,'idempotency-key':key},payload:{}});
  const inventory=await f.app.inject({url:base,headers:f.alice.headers});assert.equal(inventory.statusCode,200,inventory.body);assert.equal(inventory.json().jobs.length,1);assert.equal(inventory.json().jobs[0].id,id);assert.ok(!('payload' in inventory.json().jobs[0]));
  assert.equal((await f.app.inject({url:base,headers:f.reader.headers})).statusCode,403);
  assert.equal((await retry(id,f.reader.headers)).statusCode,403);assert.equal((await retry(id,f.bob.headers)).statusCode,404);
  await assert.rejects(f.db.authenticated({token:f.reader.token,kind:'session'},tx=>tx.query('SELECT work.retry_asset_job($1,$2)',[f.first.id,id])),{code:'42501'});
  assert.equal((await retry(foreign)).statusCode,409);
  const key=randomUUID(),response=await retry(id,f.alice.headers,key);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().state,'pending');
  assert.deepEqual((await retry(id,f.alice.headers,key)).json(),response.json());
  assert.equal((await retry(id)).statusCode,409);
  const row=(await f.admin.query('SELECT state,attempts,last_error,lease_token FROM work.jobs WHERE id=$1',[id])).rows[0];assert.deepEqual(row,{state:'pending',attempts:0,last_error:null,lease_token:null});
  const audit=(await f.admin.query("SELECT count(*)::int AS n FROM app.audit_events WHERE project_id=$1 AND action='job.retried'",[f.first.id])).rows[0];assert.equal(audit.n,1);
});
test('O03 login throttling ignores spoofed forwarding headers and returns Retry-After',async()=>{
  for(let i=0;i<20;i++)assert.notEqual((await f.app.inject({url:'/auth/login',headers:{'x-forwarded-for':'203.0.113.'+i}})).statusCode,429);
  const denied=await f.app.inject({url:'/auth/login',headers:{'x-forwarded-for':'198.51.100.9'}});assert.equal(denied.statusCode,429);assert.equal(denied.headers['retry-after'],'60');
  assert.equal((await f.app.inject('/health')).statusCode,200);
});
test('O05 private aggregate metrics do not reveal path values, bodies, credentials or arbitrary labels',async()=>{
  assert.equal((await f.app.inject('/internal/metrics')).statusCode,404);
  const token='synthetic-metrics-token-not-a-credential',app=await createApp({db:f.db,origin:'http://localhost:4311',metricsToken:token});
  try{
    await app.inject({url:'/api/v1/projects/private-project-value/tasks?secret=do-not-log',headers:f.alice.headers});
    await app.inject('/random-private-url');
    assert.equal((await app.inject('/internal/metrics')).statusCode,404);
    assert.equal((await app.inject({url:'/internal/metrics',headers:{authorization:'Bearer wrong'}})).statusCode,404);
    const response=await app.inject({url:'/internal/metrics',headers:{authorization:'Bearer '+token}});assert.equal(response.statusCode,200);
    const data=response.json();assert.equal(data.scope,'process');assert.ok(data.completedHttpRequests.some((m:{route:string})=>m.route==='/api/v1/projects/:projectId/tasks'));
    for(const secret of ['private-project-value','do-not-log','random-private-url',token,f.alice.token,f.alice.id])assert.ok(!response.body.includes(secret));
  }finally{await app.close();}
});
