// Isolated storage contract. This does not claim integration with task persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FileAttachmentStore} from '../server/attachment-store.mjs';
import {STAGING_TTL} from '../src/board/attachment-model.js';

async function fixture(t){
  const directory=await mkdtemp(path.join(os.tmpdir(),'board-file-contract-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const repository={directory,queue:Promise.resolve(),context:{actorId:'test-author'},data:{tasks:new Map(),attachments:new Map()},
    snapshot(){return {tasks:[...this.data.tasks.values()],attachments:[...this.data.attachments.values()]};},
    async persist(value,signal){
      signal?.throwIfAborted();
      await writeFile(path.join(directory,'test-records.pending'),JSON.stringify(value));
      signal?.throwIfAborted();await rename(path.join(directory,'test-records.pending'),path.join(directory,'test-records.json'));
    }};
  const store=await new FileAttachmentStore(repository).init();
  return {store,repository,directory};
}
const input={id:'upload-one',projectId:'project-one',taskId:'task-one',name:'notes.txt'};
const bytes=Buffer.from('Example task attachment');

test('file store: stage persists bytes separately and does not create a task',async t=>{
  const {store,repository,directory}=await fixture(t);
  const meta=await store.upload(input,bytes);
  assert.equal(meta.state,'staged');assert.equal(repository.data.tasks.size,0);
  assert.deepEqual((await store.blob({...input,variant:'original'})).bytes,bytes);
  assert.equal((await readFile(path.join(directory,'test-records.json'),'utf8')).includes('Example task attachment'),false);
});
test('file store: response-loss retry is idempotent; changed bytes conflict',async t=>{
  const {store,repository}=await fixture(t);
  const first=await store.upload(input,bytes),second=await store.upload(input,bytes);
  assert.deepEqual(second,first);assert.equal(repository.data.attachments.size,1);
  await assert.rejects(store.upload(input,Buffer.from('Different content')),{code:'FILE_CONFLICT'});
  assert.deepEqual((await store.blob({...input,variant:'original'})).bytes,bytes);
});
test('file store: metadata can be reloaded and original bytes survive restart',async t=>{
  const {store,repository,directory}=await fixture(t);await store.upload(input,bytes);
  const records=JSON.parse(await readFile(path.join(directory,'test-records.json'),'utf8'));
  repository.data.attachments=new Map(records.attachments.map(item=>[item.id,item]));
  const restarted=await new FileAttachmentStore(repository).init();
  assert.deepEqual((await restarted.blob({...input,variant:'original'})).bytes,bytes);
});
test('file store: another project, task or staged-file author cannot read',async t=>{
  const {store,repository}=await fixture(t);await store.upload(input,bytes);
  await assert.rejects(store.describe({...input,projectId:'other'}),{code:'FILE_ACCESS'});
  await assert.rejects(store.describe({...input,taskId:'other'}),{code:'FILE_ACCESS'});
  repository.context.actorId='other-author';
  await assert.rejects(store.describe(input),{code:'FILE_ACCESS'});
  await assert.rejects(store.discard(input),{code:'FILE_ACCESS'});
});
test('file store: invalid variants, path-like IDs and foreign tasks fail',async t=>{
  const {store,repository}=await fixture(t);await store.upload(input,bytes);
  await assert.rejects(store.blob({...input,variant:'../original'}),{code:'FILE_VARIANT'});
  await assert.rejects(store.upload({...input,id:'../outside'},bytes),{code:'FILE_ID'});
  repository.data.tasks.set(input.taskId,{id:input.taskId,projectId:'other'});
  await assert.rejects(store.upload({...input,id:'upload-two'},bytes),{code:'FILE_ACCESS'});
});
test('file store: failed metadata commit rolls back newly written blobs',async t=>{
  const {store,repository}=await fixture(t);
  repository.persist=async()=>{throw Object.assign(Error('Simulated disk failure'),{code:'EIO'});};
  await assert.rejects(store.upload(input,bytes),{code:'EIO'});
  assert.equal(repository.data.attachments.size,0);
  assert.deepEqual(await readdir(store.directory),[]);
});
test('file store: abort before upload writes nothing',async t=>{
  const {store,repository}=await fixture(t),controller=new AbortController();controller.abort();
  await assert.rejects(store.upload(input,bytes,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(repository.data.attachments.size,0);assert.deepEqual(await readdir(store.directory),[]);
});
test('file store: discarding staging prevents read and later collection reclaims bytes',async t=>{
  const {store,repository}=await fixture(t);await store.upload(input,bytes);
  assert.equal(await store.discard(input),true);
  await assert.rejects(store.describe(input),{code:'FILE_ACCESS'});
  assert.equal(await store.collect(Date.now()+STAGING_TTL+1000),1);
  assert.equal(repository.data.attachments.size,0);assert.deepEqual(await readdir(store.directory),[]);
});
test('file store: concurrent same-ID staging publishes only one record',async t=>{
  const {store,repository}=await fixture(t);
  const [first,second]=await Promise.all([store.upload(input,bytes),store.upload(input,bytes)]);
  assert.deepEqual(first,second);assert.equal(repository.data.attachments.size,1);
});
