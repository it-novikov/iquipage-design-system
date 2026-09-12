import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture} from './fixture.js';
import {TaskInput} from '../contracts/index.js';
import {S3ObjectStorage} from '../backend/infrastructure/object-storage.js';
import type {ObjectStorage} from '../backend/infrastructure/object-storage.js';
import {reserveAsset,uploadAsset,discardAsset,objectKey} from '../backend/application/media.js';
import {putTask} from '../backend/application/tasks.js';

let f:Awaited<ReturnType<typeof fixture>>,storage:S3ObjectStorage;
before(async()=>{
  storage=new S3ObjectStorage(JSON.parse(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8')));
  await storage.ready();f=await fixture({prefix:'ML',storage});
});
after(async()=>{
  if(f){
    const rows=(await f.admin.query('SELECT id,project_id AS "projectId",sha256 FROM app.assets WHERE project_id=$1',[f.first.id])).rows;
    for(const row of rows)for(const variant of ['original','display','thumb'])await storage.remove(objectKey(row,variant));
    await f.close();
  }
  storage?.close();
});
const credential=()=>({token:f.alice.token,kind:'session' as const});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const bytes=Buffer.from('Isolated media lock regression');
const reservation=(id:string)=>({id,name:'lock.txt',targetType:'task' as const,targetId:'lock-task',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
async function reserve(id:string){return f.db.authenticated(credential(),(tx,actor)=>reserveAsset(tx,actor,f.first.id,reservation(id),randomUUID()));}
async function waitForProjectLock(pid:number){
  for(let attempt=0;attempt<100;attempt++){
    await f.admin.query('SELECT pg_stat_clear_snapshot()');
    const row=(await f.admin.query<{waiting:boolean}>(`SELECT wait_event_type='Lock' AND query LIKE '%app.projects%FOR UPDATE%' AS waiting FROM pg_stat_activity WHERE pid=$1`,[pid])).rows[0];
    if(row?.waiting)return;
    await delay(10);
  }
  assert.fail('Expected project-first lock wait, not an asset-first inversion');
}

test('R4-B03 upload and concurrent task attachment use one project -> asset lock order',{timeout:10000},async()=>{
  await reserve('concurrent-file');
  await f.db.authenticated(credential(),(tx,actor)=>putTask(tx,actor,f.first.id,'lock-task',0,TaskInput.parse({title:'Lock task'})));
  const entered=deferred<void>(),release=deferred<void>(),savePid=deferred<number>();
  const delayed:ObjectStorage={
    put:async(key,value,mime)=>{entered.resolve();await release.promise;await storage.put(key,value,mime);},
    get:key=>storage.get(key),remove:key=>storage.remove(key),ready:()=>storage.ready(),
  };
  const upload=f.db.authenticated(credential(),(tx,actor)=>uploadAsset(tx,actor,f.first.id,'concurrent-file',bytes,delayed));
  // Collect outcomes immediately: failures must never become unhandled rejections.
  const uploadResult=upload.then(value=>({value}),error=>({error}));
  await entered.promise;
  const save=f.db.authenticated(credential(),async(tx,actor)=>{
    savePid.resolve((await tx.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
    return putTask(tx,actor,f.first.id,'lock-task',1,TaskInput.parse({title:'Lock task',attachmentIds:['concurrent-file']}));
  });
  const saveResult=save.then(value=>({value}),error=>({error}));
  try{await waitForProjectLock(await savePid.promise);}
  finally{release.resolve();}
  const [uploaded,saved]=await Promise.all([uploadResult,saveResult]);
  assert.ok('value' in uploaded,JSON.stringify('error' in uploaded?{code:uploaded.error?.code}:{}));
  assert.ok('value' in saved,JSON.stringify('error' in saved?{code:saved.error?.code}:{}));
  assert.deepEqual(saved.value.attachmentIds,['concurrent-file']);
});

test('R4-B03 queued reserve, upload and discard recheck credential revocation after the project lock',{timeout:10000},async()=>{
  for(const operation of ['reserve','upload','discard'] as const){
    const id='revoked-'+operation;
    if(operation!=='reserve')await reserve(id);
    await f.admin.query('BEGIN');
    await f.admin.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[f.first.id]);
    const started=deferred<number>();
    const write=f.db.authenticated(credential(),async(tx,actor)=>{
      started.resolve((await tx.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      if(operation==='reserve')return reserveAsset(tx,actor,f.first.id,reservation(id),randomUUID());
      if(operation==='upload')return uploadAsset(tx,actor,f.first.id,id,bytes,storage);
      return discardAsset(tx,actor,f.first.id,id);
    });
    const outcome=write.then(value=>({value}),error=>({error}));
    try{
      await waitForProjectLock(await started.promise);
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
