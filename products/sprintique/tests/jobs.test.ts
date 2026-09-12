import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixture} from './fixture.js';
import {S3ObjectStorage,objectKey} from '../backend/infrastructure/object-storage.js';
import {JobQueue} from '../backend/infrastructure/job-queue.js';
let f:Awaited<ReturnType<typeof fixture>>,queue:JobQueue,storage:S3ObjectStorage;
before(async()=>{storage=new S3ObjectStorage(JSON.parse(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8')));await storage.ready();f=await fixture({prefix:'J',storage});queue=new JobQueue(process.env['WORKER_DATABASE_URL']!);await queue.checkRole();});
after(async()=>{if(f){const rows=(await f.admin.query('SELECT id,project_id AS "projectId",sha256 FROM app.assets WHERE project_id=$1',[f.first.id])).rows;for(const row of rows)for(const variant of ['original','display','thumb'])await storage.remove(objectKey(row as {id:string;projectId:string;sha256:string},variant));await f.close();}await queue?.close();storage?.close();});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
const bytes=Buffer.from('Durable cleanup');
async function asset(id:string){
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const reserved=await f.app.inject({method:'POST',url:path('assets'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{id,name:'cleanup.txt',size:bytes.length,sha256,targetType:'task',targetId:'cleanup-task'}});assert.equal(reserved.statusCode,200,reserved.body);
  const uploaded=await f.app.inject({method:'PUT',url:path('assets/'+id+'/content'),headers:{...f.alice.headers,'content-type':'application/octet-stream'},payload:bytes});assert.equal(uploaded.statusCode,200,uploaded.body);
  return {id,projectId:f.first.id,sha256};
}
const discard=(id:string)=>f.app.inject({method:'DELETE',url:path('assets/'+id),headers:f.alice.headers});
test('J01 worker can call only narrow functions, API cannot claim jobs, pending uploads are not cleaned early',async()=>{
  await assert.rejects(queue.pool.query('SELECT * FROM app.tasks'),{code:'42501'});
  await assert.rejects(queue.pool.query('UPDATE app.assets SET state=\'deleted\''),{code:'42501'});
  await assert.rejects(queue.pool.query('SELECT * FROM work.jobs'),{code:'42501'});
  await assert.rejects(queue.pool.query('SELECT work.retry_asset_job($1,$2)',[f.first.id,randomUUID()]),{code:'42501'});
  await assert.rejects(f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query("SELECT * FROM work.claim('asset.gc')")),{code:'42501'});
  await asset('not-expired');assert.equal(await queue.collectOne(storage),false);
});
test('J02 expired leases are fenced, recovered deletes are idempotent, attached files survive stale cleanup jobs',async()=>{
  const reference=await asset('collect');assert.equal((await discard('collect')).statusCode,200);
  const first=await queue.claim();assert.ok(first);
  const prepared=await queue.pool.query('SELECT work.prepare_asset_gc($1,$2) AS asset',[first.id,first.lease_token]);assert.equal(prepared.rows[0]['asset'].id,'collect');
  await storage.remove(objectKey(reference,'original')); // Simulate death between object deletion and SQL settlement.
  await f.admin.query("UPDATE work.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.id]);
  const second=await queue.claim();assert.ok(second);assert.equal(second.id,first.id);assert.notEqual(second.lease_token,first.lease_token);
  assert.equal(await queue.settle(first,true),false);
  await storage.remove(objectKey(reference,'original'));
  assert.equal((await queue.pool.query('SELECT work.finish_asset_gc($1,$2) AS ok',[second.id,second.lease_token])).rows[0]['ok'],true);
  assert.equal((await f.admin.query('SELECT state FROM app.assets WHERE project_id=$1 AND id=$2',[f.first.id,'collect'])).rows[0]['state'],'deleted');
  const protectedAsset=await asset('protected');
  const saved=await f.app.inject({method:'PUT',url:path('tasks/cleanup-task'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'Keep attached',attachmentIds:['protected']}}});assert.equal(saved.statusCode,200,saved.body);
  await f.admin.query("UPDATE work.jobs SET available_at=clock_timestamp() WHERE project_id=$1 AND payload->>'assetId'='protected'",[f.first.id]);
  assert.equal(await queue.collectOne(storage),true);assert.deepEqual(Buffer.from(await storage.get(objectKey(protectedAsset,'original'))),bytes);
});
test('J03 failed object storage reschedules the durable job; exhausted crash attempts become terminal',async()=>{
  await asset('retry');await discard('retry');
  await queue.collectOne({put:async()=>{},get:async()=>new Uint8Array(),ready:async()=>{},remove:async()=>{throw Error('synthetic S3 outage');}});
  const row=(await f.admin.query("SELECT id,state,attempts,last_error FROM work.jobs WHERE project_id=$1 AND payload->>'assetId'='retry' AND attempts>0",[f.first.id])).rows[0]!;
  assert.equal(row['state'],'pending');assert.equal(row['attempts'],1);assert.equal(row['last_error'],'ASSET_GC_FAILED');
  await f.admin.query("UPDATE work.jobs SET state='running',attempts=10,lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[row['id']]);
  await queue.claim();assert.equal((await f.admin.query('SELECT state FROM work.jobs WHERE id=$1',[row['id']])).rows[0]['state'],'failed');
});
