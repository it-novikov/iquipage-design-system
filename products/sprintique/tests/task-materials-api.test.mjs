import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.ts';
import {TaskMaterial,TaskMaterialList,TaskMaterialReceipt} from '../contracts/task-materials.ts';

let f;
before(async()=>{f=await fixture({prefix:'TM'});});
after(async()=>{await f?.close();});
const route=(task,id,project=f.first.id)=>`/api/v1/projects/${project}/tasks/${task}/materials${id?'/'+id:''}`;
const call=(method,task,id,payload,headers=f.alice.headers,key=randomUUID(),project)=>
  f.app.inject({method,url:route(task,id,project),headers:{...headers,'idempotency-key':key},...(payload?{payload}:{})});
const value=(changes={})=>({category:changes.category??'design',title:changes.title??'Макет',url:changes.url??'https://example.com/design?version=1#screen',archived:changes.archived??false});
async function seed(task){
  const r=await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tasks/${task}`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'Материалы',description:'Свой текст'}}});
  assert.equal(r.statusCode,200,r.body);return r.json();
}
const expect=(r,status,code)=>{assert.equal(r.statusCode,status,r.body);if(code)assert.equal(r.json().code,code);return r.json();};
async function grant(capabilities){
  const r=await f.app.inject({method:'POST',url:`/api/v1/projects/${f.first.id}/agents`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{name:'Materials test',capabilities,expiresInSeconds:3600}});
  expect(r,200);return {authorization:'Bearer '+r.json().token};
}

test('TM1 create reload edit move archive and restore preserve task content and revision',async()=>{
  const task=await seed('tm-life');
  let row=expect(await call('PUT',task.id,'tm-a',{baseRevision:0,value:value()}),200);
  TaskMaterial.parse(row);assert.equal(row.revision,1);
  TaskMaterialList.parse(expect(await call('GET',task.id),200));
  row=expect(await call('PUT',task.id,row.id,{baseRevision:1,value:value({title:'Требования',category:'documentation',url:'https://пример.рф/документ?x=1#раздел'})}),200);
  assert.equal(row.url,'https://пример.рф/документ?x=1#раздел');assert.equal(row.category,'documentation');
  row=expect(await call('PUT',task.id,row.id,{baseRevision:2,value:value({...row,archived:true})}),200);
  assert.ok(row.archivedAt);assert.deepEqual(expect(await call('GET',task.id),200),[]);
  assert.equal(expect(await call('GET',task.id,row.id),200).revision,3);
  row=expect(await call('PUT',task.id,row.id,{baseRevision:3,value:value({...row,archived:false})}),200);
  assert.equal(row.archivedAt,null);assert.equal(expect(await call('GET',task.id),200).length,1);
  const unchanged=await f.app.inject({method:'GET',url:`/api/v1/projects/${f.first.id}/tasks/${task.id}`,headers:f.alice.headers});
  assert.equal(unchanged.json().revision,task.revision);assert.equal(unchanged.json().description,'Свой текст');
  const audits=(await f.admin.query("SELECT count(*)::int n FROM app.audit_events WHERE project_id=$1 AND resource_id='tm-a' AND action='task-material.updated'",[f.first.id])).rows[0].n;
  const outbox=(await f.admin.query("SELECT count(*)::int n FROM app.outbox WHERE project_id=$1 AND topic='task-material.updated' AND payload->>'resourceId'='tm-a'",[f.first.id])).rows[0].n;
  assert.equal(audits,4);assert.equal(outbox,4);
});

test('TM2 lost-answer replay returns the applied revision after a later write; stale competing edit loses',async()=>{
  await seed('tm-retry');const input={baseRevision:0,value:value()},key=randomUUID();
  const first=expect(await call('PUT','tm-retry','tm-replay',input,f.alice.headers,key),200);
  const attempts=await Promise.all(['A','B'].map(title=>call('PUT','tm-retry','tm-replay',{baseRevision:1,value:value({title})})));
  assert.deepEqual(attempts.map(r=>r.statusCode).sort(),[200,409]);
  const replay=expect(await call('PUT','tm-retry','tm-replay',input,f.alice.headers,key),200);
  assert.deepEqual(replay,first);assert.equal(replay.revision,1);
  assert.equal(expect(await call('GET','tm-retry','tm-replay'),200).revision,2);
  const n=(await f.admin.query("SELECT count(*)::int n FROM app.audit_events WHERE project_id=$1 AND resource_id='tm-replay' AND action='task-material.updated'",[f.first.id])).rows[0].n;
  assert.equal(n,2);
});

test('TM3 duplicate URLs are scoped to category and task, archived duplicates do not consume the active slot',async()=>{
  await seed('tm-duplicates');await seed('tm-other');
  expect(await call('PUT','tm-duplicates','tm-original',{baseRevision:0,value:value()}),200);
  expect(await call('PUT','tm-duplicates','tm-duplicate',{baseRevision:0,value:value()}),409,'MATERIAL_DUPLICATE');
  expect(await call('PUT','tm-duplicates','tm-doc',{baseRevision:0,value:value({category:'documentation'})}),200);
  expect(await call('PUT','tm-other','tm-other-material',{baseRevision:0,value:value()}),200);
  expect(await call('PUT','tm-duplicates','tm-original',{baseRevision:1,value:value({archived:true})}),200);
  expect(await call('PUT','tm-duplicates','tm-replacement',{baseRevision:0,value:value()}),200);
  expect(await call('PUT','tm-duplicates','tm-original',{baseRevision:2,value:value()}),409,'MATERIAL_DUPLICATE');
  expect(await call('GET','tm-other','tm-original'),404,'NOT_FOUND');
  expect(await call('PUT','tm-other','tm-original',{baseRevision:2,value:value()}),404,'NOT_FOUND');
});

test('TM4 readers can read but cannot mutate; foreign project and malformed URL never change the table',async()=>{
  await seed('tm-access');expect(await call('PUT','tm-access','tm-visible',{baseRevision:0,value:value()}),200);
  assert.equal(expect(await call('GET','tm-access',undefined,undefined,f.reader.headers),200).length,1);
  expect(await call('PUT','tm-access','tm-denied',{baseRevision:0,value:value()},f.reader.headers),403);
  expect(await call('GET','tm-access',undefined,undefined,f.bob.headers),404);
  expect(await call('GET','tm-access',undefined,undefined,f.alice.headers,randomUUID(),f.second.id),404);
  for(const url of ['javascript:alert(1)','https://user:pass@example.com/a','https://example.com/a b','https://example.com:65536'])
    expect(await call('PUT','tm-access','tm-url-'+randomUUID(),{baseRevision:0,value:value({url})}),422,'MATERIAL_URL');
  assert.equal(expect(await call('GET','tm-access'),200).length,1);
  await f.db.authenticated({token:f.reader.token,kind:'session'},async tx=>{
    assert.equal((await tx.query('SELECT id FROM app.task_material WHERE project_id=$1 AND task_id=$2',[f.first.id,'tm-access'])).rowCount,1);
    assert.equal((await tx.query('UPDATE app.task_material SET title=$1 WHERE project_id=$2 AND id=$3',['Недоступно',f.first.id,'tm-visible'])).rowCount,0);
  });
});

test('TM5 limited grants receive only their own write receipt and respect current grantor rights',async()=>{
  await seed('tm-grant');const writer=await grant(['tasks:write']),reader=await grant(['tasks:read']);
  const receipt=expect(await call('PUT','tm-grant','tm-writer',{baseRevision:0,value:value()},writer),200);
  TaskMaterialReceipt.parse(receipt);assert.ok(!('title' in receipt));assert.ok(!('createdAt' in receipt));
  expect(await call('GET','tm-grant',undefined,undefined,writer),403);
  assert.equal(expect(await call('GET','tm-grant',undefined,undefined,reader),200).length,1);
  expect(await call('PUT','tm-grant','tm-reader',{baseRevision:0,value:value()},reader),403);
  await f.admin.query("UPDATE app.project_members SET revoked=ARRAY['tasks.write'] WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);
  try{const denied=await call('PUT','tm-grant','tm-revoked',{baseRevision:0,value:value()},writer);assert.ok([403,404].includes(denied.statusCode),denied.body);}
  finally{await f.admin.query("UPDATE app.project_members SET revoked='{}' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);}
  assert.equal(expect(await call('GET','tm-grant'),200).length,1);
});

test('TM6 accepted results refuse new edits but an already applied command can be replayed safely',async()=>{
  await seed('tm-pinned');const input={baseRevision:0,value:value()},key=randomUUID();
  const applied=expect(await call('PUT','tm-pinned','tm-pinned-material',input,f.alice.headers,key),200);
  await f.admin.query("UPDATE app.tasks SET result='accepted' WHERE project_id=$1 AND id='tm-pinned'",[f.first.id]);
  expect(await call('PUT','tm-pinned','tm-pinned-material',{baseRevision:1,value:value({title:'Изменено'})}),409,'RESULT_PINNED');
  assert.deepEqual(expect(await call('PUT','tm-pinned','tm-pinned-material',input,f.alice.headers,key),200),applied);
});

test('TM7 the active bound is enforced without truncation and archiving frees a slot',async()=>{
  await seed('tm-limit');
  await f.admin.query(`INSERT INTO app.task_material(project_id,id,task_id,category,title,url,revision)
    SELECT $1,'tm-limit-'||i,'tm-limit','design','Материал '||i,'https://example.com/limit/'||i,1
    FROM generate_series(0,99) i`,[f.first.id]);
  assert.equal(expect(await call('GET','tm-limit'),200).length,100);
  expect(await call('PUT','tm-limit','tm-over-limit',{baseRevision:0,value:value()}),422,'MATERIAL_LIMIT');
  const first=expect(await call('GET','tm-limit','tm-limit-0'),200);
  expect(await call('PUT','tm-limit',first.id,{baseRevision:1,value:value({...first,archived:true})}),200);
  expect(await call('PUT','tm-limit','tm-over-limit',{baseRevision:0,value:value()}),200);
  expect(await call('PUT','tm-limit',first.id,{baseRevision:2,value:value(first)}),422,'MATERIAL_LIMIT');
  const existing=expect(await call('GET','tm-limit','tm-limit-1'),200);
  expect(await call('PUT','tm-limit',existing.id,{baseRevision:1,value:value({...existing,title:'Обновлено'})}),200);
  assert.equal(expect(await call('GET','tm-limit'),200).length,100);
});

test('TM8 unknown request fields and changed idempotency payload cannot create an extra material',async()=>{
  await seed('tm-contract');
  expect(await call('PUT','tm-contract','tm-unknown',{baseRevision:0,value:{...value(),taskId:'tm-other'}}),400);
  const input={baseRevision:0,value:value()},key=randomUUID();
  expect(await call('PUT','tm-contract','tm-key',input,f.alice.headers,key),200);
  const mismatch=await call('PUT','tm-contract','tm-key',{baseRevision:0,value:value({title:'Другой запрос'})},f.alice.headers,key);
  assert.equal(mismatch.statusCode,409,mismatch.body);
  assert.equal(expect(await call('GET','tm-contract'),200).length,1);
});

test('TM9 service account scopes and current owner rights bound materials and preserve service authorship',async()=>{
  await seed('tm-service');
  const preset=(await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'",[f.first.workspaceId])).rows[0].id;
  const made=expect(await f.app.inject({method:'POST',url:'/api/v1/service-accounts',headers:f.alice.headers,
    payload:{name:'Materials service',workspaceId:f.first.workspaceId,projects:[{projectId:f.first.id,presetId:preset,granted:[],revoked:[]}]}}),200);
  async function token(scopes){const r=expect(await f.app.inject({method:'POST',url:`/api/v1/service-accounts/${made.id}/tokens`,headers:f.alice.headers,
    payload:{name:'Materials scope',scopes,expiresInDays:1}}),200);return {authorization:'Bearer '+r.token};}
  const write=await token(['write']),read=await token(['read']);
  const saved=expect(await call('PUT','tm-service','tm-service-a',{baseRevision:0,value:value()},write),200);
  TaskMaterial.parse(saved); // Existing service scope policy: write includes read.
  assert.equal(expect(await call('GET','tm-service',undefined,undefined,write),200).length,1);
  TaskMaterial.parse(expect(await call('GET','tm-service','tm-service-a',undefined,read),200));
  expect(await call('PUT','tm-service','tm-service-b',{baseRevision:0,value:value()},read),403);
  const audit=(await f.admin.query("SELECT actor_id,initiator_id FROM app.audit_events WHERE project_id=$1 AND resource_id='tm-service-a'",[f.first.id])).rows[0];
  assert.equal(audit.actor_id,made.id);assert.equal(audit.initiator_id,f.alice.id);
  const member=(await f.admin.query('SELECT role FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[f.first.id,f.alice.id])).rows[0];
  try{
    await f.admin.query("UPDATE app.project_members SET role='reader' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);
    const denied=await call('PUT','tm-service','tm-service-denied',{baseRevision:0,value:value()},write);
    assert.ok([403,404].includes(denied.statusCode),denied.body);
    assert.equal(expect(await call('GET','tm-service',undefined,undefined,read),200).length,1);
  }finally{await f.admin.query('UPDATE app.project_members SET role=$3 WHERE project_id=$1 AND principal_id=$2',[f.first.id,f.alice.id,member.role]);}
});

test('TM10 two concurrent inserts into the final active slot cannot exceed the bound',async()=>{
  await seed('tm-race-limit');
  await f.admin.query(`INSERT INTO app.task_material(project_id,id,task_id,category,title,url,revision)
    SELECT $1,'tm-race-'||i,'tm-race-limit','design','Материал '||i,'https://example.com/race/'||i,1
    FROM generate_series(0,98) i`,[f.first.id]);
  const attempts=await Promise.all([1,2].map(i=>call('PUT','tm-race-limit','tm-race-new-'+i,
    {baseRevision:0,value:value({url:'https://example.com/race/new/'+i})})));
  assert.deepEqual(attempts.map(r=>r.statusCode).sort(),[200,422]);
  assert.equal(expect(await call('GET','tm-race-limit'),200).length,100);
});

test('TM11 the final safe numeric revision is read exactly and cannot overflow on mutation',async()=>{
  await seed('tm-revision-bound');
  await f.admin.query(`INSERT INTO app.task_material(project_id,id,task_id,category,title,url,revision)
    VALUES($1,'tm-final-revision','tm-revision-bound','design','Макет','https://example.com/final',9007199254740991)`,[f.first.id]);
  const row=expect(await call('GET','tm-revision-bound','tm-final-revision'),200);
  TaskMaterial.parse(row);assert.equal(row.revision,Number.MAX_SAFE_INTEGER);
  expect(await call('PUT','tm-revision-bound',row.id,{baseRevision:row.revision,value:value(row)}),422,'REVISION_LIMIT');
  assert.deepEqual(expect(await call('GET','tm-revision-bound',row.id),200),row);
});
