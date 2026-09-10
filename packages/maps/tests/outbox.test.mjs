// Fault tests for the separate, unreleased transactional-event draft.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FileRepository} from '../server/file-repository.mjs';
import {OutboxWorker} from '../server/outbox.mjs';
import {EventService} from '../server/event-service.mjs';
import {WorkflowRuntime,localTasksAdapter} from '../src/runtime.js';
import {createMap,transitionMap,clone} from '../src/model.js';
import {createRule} from '../src/events.js';
import {createMeetingFlow} from '../src/workflow.js';
async function setup(t,{session=false,eventType='map.updated'}={}){
  const dir=await mkdtemp(path.join(os.tmpdir(),'maps-outbox-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const repo=await new FileRepository(dir).init();
  let value=createMap({projectId:'outbox-tests',kind:session?'session':'permanent',flow:createMeetingFlow()});
  value.document.objects.push({id:'test-note',type:'sticky',text:'Initial note',x:0,y:0,width:244,height:156,color:'sand'});
  let map=await repo.write('maps',value,0);
  if(session)map=await repo.write('maps',transitionMap(map,'start'),map.revision);
  const rule=await repo.write('rules',{...createRule(map),trigger:'project',status:'enabled',eventType},0);
  const runtime=new WorkflowRuntime(repo,{createTasks:localTasksAdapter(repo)});
  const service=new EventService(repo,runtime),worker=new OutboxWorker(repo,service);
  return{dir,repo,map,rule,runtime,worker};
}
async function update(f,text='Committed note'){
  const next=clone(f.map);next.document.objects[0].text=text;
  f.map=await f.repo.write('maps',next,f.map.revision);return f.map;
}
test('OUTBOX-01 committed record and queued event survive repository restart',async t=>{
  const f=await setup(t);await update(f);
  const restored=await new FileRepository(f.dir).init();
  assert.equal((await restored.pendingEvents()).length,1);
  assert.equal((await restored.read('maps',f.map.id,f.map.projectId)).document.objects[0].text,'Committed note');
});
test('OUTBOX-02 stale revision does not publish an event',async t=>{
  const f=await setup(t),old=clone(f.map);await update(f);
  await assert.rejects(f.repo.write('maps',old,old.revision),{code:'CONFLICT'});
  assert.equal((await f.repo.pendingEvents()).length,1);
});
test('OUTBOX-03 failed disk write changes neither document nor event queue',async t=>{
  const f=await setup(t),persist=f.repo.persist;
  f.repo.persist=async()=>{throw Object.assign(Error('Injected disk failure'),{code:'ENOSPC'});};
  await assert.rejects(update(f),{code:'ENOSPC'});f.repo.persist=persist;
  assert.equal((await f.repo.pendingEvents()).length,0);
  assert.equal((await f.repo.read('maps',f.map.id,f.map.projectId)).document.objects[0].text,'Initial note');
});
test('OUTBOX-04 pausing a rule before delivery prevents execution',async t=>{
  const f=await setup(t);await update(f);
  await f.repo.write('rules',{...f.rule,status:'paused'},f.rule.revision);
  await f.worker.drain();assert.equal((await f.repo.list('runs',f.map.projectId)).length,0);
});
test('OUTBOX-05 concurrent deliveries serialize and do not duplicate a run',async t=>{
  const f=await setup(t);await update(f);
  await Promise.all([f.worker.drain(),f.worker.drain()]);
  assert.equal((await f.repo.list('runs',f.map.projectId)).length,1);
  assert.equal((await f.repo.pendingEvents()).length,0);
});
test('OUTBOX-06 replay after acknowledgement failure does not duplicate a task',async t=>{
  const f=await setup(t);await update(f);
  const settle=f.repo.settleEvent.bind(f.repo);let fail=true;
  f.repo.settleEvent=async(id,error)=>{if(!error&&fail){fail=false;throw Error('Injected acknowledgement failure');}return settle(id,error);};
  await f.worker.drain();let [run]=await f.repo.list('runs',f.map.projectId);
  await f.runtime.approve(run.id,run.projectId,{accepted:true,actions:run.data.actions,baseRevision:run.revision});
  const restored=await new FileRepository(f.dir).init();
  const runtime=new WorkflowRuntime(restored,{createTasks:localTasksAdapter(restored)});
  await new OutboxWorker(restored,new EventService(restored,runtime)).drain(Date.now()+10000);
  assert.equal((await restored.list('runs',run.projectId)).length,1);
  assert.equal((await restored.list('tasks',run.projectId)).length,1);
  assert.equal((await restored.pendingEvents()).length,0);
});
test('OUTBOX-07 delivery consumes the committed input, not a later document revision',async t=>{
  const f=await setup(t);await update(f,'First committed input');
  const first=(await f.repo.pendingEvents())[0].event.id;
  await update(f,'Later document input');await f.worker.drain();
  const run=(await f.repo.list('runs',f.map.projectId)).find(r=>r.trigger.eventId===first);
  assert.deepEqual(run.input.notes,['First committed input']);
});
test('OUTBOX-08 session completion invokes its previously enabled closing rule once',async t=>{
  const f=await setup(t,{session:true,eventType:'session.archived'});
  f.map=await f.repo.write('maps',transitionMap(f.map,'archive',{summary:'Confirmed outcomes'}),f.map.revision);
  await f.worker.drain();
  const runs=await f.repo.list('runs',f.map.projectId);
  assert.equal(runs.length,1,'A committed session.archived event must not be discarded by the archive guard');
  assert.equal(runs[0].status,'awaiting_approval');
  await assert.rejects(f.repo.write('maps',f.map,f.map.revision),{code:'ARCHIVED'});
});

test('OUTBOX-09 a forged external completion event cannot start an archived map',async t=>{
  const f=await setup(t,{session:true,eventType:'session.archived'});
  f.map=await f.repo.write('maps',transitionMap(f.map,'archive'),f.map.revision);
  const entry=(await f.repo.pendingEvents())[0];
  const service=new EventService(f.repo,f.runtime);
  const result=await service.dispatch(f.rule,{...entry.event,committed:true,trusted:true});
  assert.equal(result.skipped,true);assert.equal((await f.repo.list('runs',f.map.projectId)).length,0);
  await f.worker.drain();assert.equal((await f.repo.list('runs',f.map.projectId)).length,1);
});
test('OUTBOX-10 another target map also uses its input at event commit',async t=>{
  const f=await setup(t);const other=await f.repo.write('maps',createMap({projectId:f.map.projectId,flow:createMeetingFlow()}),0);
  const second=await f.repo.write('rules',{...createRule(other),trigger:'project',status:'enabled',eventType:'map.updated'},0);
  await update(f);const eventId=(await f.repo.pendingEvents())[0].id;
  const modified=clone(other);modified.document.objects=clone(f.map.document.objects);await f.repo.write('maps',modified,other.revision);
  await f.worker.drain();
  const run=(await f.repo.list('runs',f.map.projectId)).find(r=>r.trigger.ruleId===second.id&&r.trigger.eventId===eventId);
  assert.deepEqual(run.input.notes,[]);assert.equal(run.trigger.inputMapRevision,other.revision);
});
test('OUTBOX-11 delivery stops after five failures and recovery retains its snapshot',async t=>{
  const f=await setup(t);await update(f,'Frozen input');
  let calls=0;const broken=new OutboxWorker(f.repo,{dispatchCommitted:async()=>{calls++;throw Object.assign(Error('Transient failure'),{code:'OFFLINE'});}});
  for(let i=0;i<7;i++)await broken.drain(Date.now()+i*1000000);
  let [entry]=await f.repo.pendingEvents();assert.equal(calls,5);assert.equal(entry.status,'dead');
  await assert.rejects(f.repo.recoverEvent(entry.id,'other-project','retry',entry.revision),{code:'NOT_FOUND'});
  await assert.rejects(f.repo.recoverEvent(entry.id,f.map.projectId,'retry',entry.revision-1),{code:'CONFLICT'});
  await f.repo.recoverEvent(entry.id,f.map.projectId,'retry',entry.revision);await f.worker.drain();
  const [run]=await f.repo.list('runs',f.map.projectId);assert.deepEqual(run.input.notes,['Frozen input']);
});
test('OUTBOX-12 history is scoped, bounded, and contains no note contents',async t=>{
  const f=await setup(t);await update(f,'Confidential fixture text');await f.worker.drain();
  const history=await f.repo.listDeliveries(f.map.projectId,f.map.id);
  assert.equal(history.length,1);assert.equal(history[0].status,'delivered');assert.ok(history[0].outcomes[0].runId);
  assert.ok(!JSON.stringify(history).includes('Confidential fixture text'));
  assert.deepEqual(await f.repo.listDeliveries('other-project'),[]);
  assert.deepEqual(await f.repo.listDeliveries(f.map.projectId,'other-map'),[]);
  const restored=await new FileRepository(f.dir).init();assert.deepEqual(await restored.listDeliveries(f.map.projectId),history);
});
test('OUTBOX-13 a failed target does not starve subsequent valid rules',async t=>{
  const f=await setup(t);const second=await f.repo.write('rules',{...createRule(f.map),trigger:'project',status:'enabled',eventType:'map.updated'},0);
  await update(f);f.repo.outbox[0].targets[0].inputSnapshot={notes:'invalid-fixture'};
  await f.worker.drain();const [entry]=await f.repo.pendingEvents();assert.equal(entry.status,'dead');assert.equal(entry.lastError,'INPUT_SCHEMA');
  const runs=await f.repo.list('runs',f.map.projectId);assert.equal(runs.length,1);assert.equal(runs[0].trigger.ruleId,second.id);
  await f.repo.recoverEvent(entry.id,f.map.projectId,'dismiss',entry.revision);
  assert.equal((await f.repo.pendingEvents()).length,0);assert.equal((await f.repo.listDeliveries(f.map.projectId))[0].status,'dismissed');
});
test('OUTBOX-14 legacy pending events cannot silently consume current input',async t=>{
  const f=await setup(t);await update(f);delete f.repo.outbox[0].schema;
  await f.repo.persist(f.repo.snapshot());const restored=await new FileRepository(f.dir).init();
  const [entry]=await restored.pendingEvents();assert.equal(entry.status,'dead');assert.equal(entry.lastError,'SNAPSHOT_MISSING');
  await assert.rejects(restored.recoverEvent(entry.id,f.map.projectId,'retry',entry.revision),{code:'SNAPSHOT_MISSING'});
});
test('OUTBOX-15 repository listener failure does not reject an already committed write',async t=>{
  const f=await setup(t);f.repo.subscribe(()=>{throw Error('Listener fixture');});await update(f);
  assert.equal((await f.repo.read('maps',f.map.id,f.map.projectId)).revision,f.map.revision);
});
