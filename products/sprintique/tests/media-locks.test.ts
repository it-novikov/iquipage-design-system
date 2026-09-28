import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from './fixture.js';
import {S3ObjectStorage,objectKey} from './support/object-storage.js';

// R4-B03, first part (an upload still writing to storage and a task save attaching the same file take the project
// lock before the file, so they cannot deadlock) needs a storage that stalls a write: Kotlin MediaLockIntegrationTest.
let f:Awaited<ReturnType<typeof fixture>>,storage:S3ObjectStorage;
before(async()=>{
  storage=new S3ObjectStorage(JSON.parse(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8')));
  await storage.ready();f=await fixture({prefix:'ML',storage:true});
});
after(async()=>{
  if(f){
    const rows=(await f.admin.query('SELECT id,project_id AS "projectId",sha256 FROM app.assets WHERE project_id=$1',[f.first.id])).rows;
    for(const row of rows)for(const variant of ['original','display','thumb'])await storage.remove(objectKey(row,variant));
    await f.close();
  }
  storage?.close();
});
const bytes=Buffer.from('Isolated media lock regression');
const reservation=(id:string)=>({id,name:'lock.txt',targetType:'task' as const,targetId:'lock-task',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
const call=(method:'POST'|'PUT'|'DELETE',resource:string,payload?:unknown)=>f.app.inject({method,url:path(resource),headers:{...f.alice.headers,'idempotency-key':randomUUID(),
  ...(Buffer.isBuffer(payload)?{'content-type':'application/octet-stream'}:{})},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
async function reserve(id:string){const response=await call('POST','assets',reservation(id));assert.equal(response.statusCode,200,response.body);return response.json();}
/** The server's connection is not known over HTTP: wait for any session queued on the project row lock. */
async function waitForQueuedProjectWrite(){
  for(let attempt=0;attempt<100;attempt++){
    await f.admin.query('SELECT pg_stat_clear_snapshot()');
    const row=(await f.admin.query(`SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%app.projects%FOR UPDATE%'`)).rows[0];
    if(row)return;
    await delay(10);
  }
  assert.fail('Expected the write to queue behind the project lock');
}

test('R4-B03 queued reserve, upload and discard recheck credential revocation after the project lock',{timeout:10000},async()=>{
  for(const operation of ['reserve','upload','discard'] as const){
    const id='revoked-'+operation;
    if(operation!=='reserve')await reserve(id);
    await f.admin.query('BEGIN');
    await f.admin.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[f.first.id]);
    const write=(operation==='reserve'?call('POST','assets',reservation(id)):operation==='upload'?call('PUT','assets/'+id+'/content',bytes):call('DELETE','assets/'+id))
      .then(response=>{if(response.statusCode===200)return response.json();throw Object.assign(Error(response.body),{code:response.json<{code:string}>().code});});
    const outcome=write.then(value=>({value}),(error:{code?:string})=>({error}));
    try{
      await waitForQueuedProjectWrite();
      await f.admin.query('UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=$1',[f.alice.credential]);
      await f.admin.query('COMMIT');
      const result=await outcome;
      assert.ok('error' in result);
      assert.equal(result.error.code,'UNAUTHENTICATED');
      const row=(await f.admin.query('SELECT state FROM app.assets WHERE project_id=$1 AND id=$2',[f.first.id,id])).rows[0];
      assert.equal(row?.state,operation==='reserve'?undefined:'uploading');
    }finally{
      await f.admin.query('ROLLBACK');
      await f.admin.query('UPDATE auth.credentials SET revoked_at=NULL WHERE id=$1',[f.alice.credential]);
      await outcome;
    }
  }
});
