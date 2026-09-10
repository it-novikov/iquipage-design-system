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
