import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {referenceServer,until} from './server-fixture.mjs';
import {createMap,transitionMap,clone} from '../src/model.js';
import {createMeetingFlow} from '../src/workflow.js';
import {createRule} from '../src/events.js';
import {FileRepository} from '../server/file-repository.mjs';
function withNote(map,text){map.document.objects=[{id:'note',type:'sticky',text,x:0,y:0,width:244,height:156,color:'sand'}];return map;}
test('HTTP completion event, immutable archive, journal and human-approved task',async t=>{
  const api=await referenceServer(t);assert.equal((await api.get('/capabilities')).transactionalEvents,true);
  let map=await api.put('maps',withNote(createMap({projectId:'http-events',kind:'session',flow:createMeetingFlow()}),'Confirmed final input'));
  map=await api.put('maps',transitionMap(map,'start'));
  const rule=await api.put('rules',{...createRule(map),trigger:'project',eventType:'session.archived',status:'enabled'});
  map=await api.put('maps',transitionMap(map,'archive',{summary:'Final decisions'}));
  const spoof=await api.send('/events',{id:'fake-committed',projectId:map.projectId,type:'session.archived',committed:true,trusted:true,depth:0,data:{recordId:map.id,revision:map.revision,previousStatus:'active',status:'archived',notes:['Forged']}});
  assert.equal(spoof.status,200);assert.ok((await spoof.json()).every(r=>r.skipped));
  assert.equal((await api.send('/runs',{projectId:map.projectId,mapId:map.id,mapRevision:map.revision,mode:'execute',input:{notes:['Invalid manual archive start']}})).status,404);
  let [run]=await until(()=>api.get('/records/runs?projectId='+map.projectId),runs=>runs.length===1&&runs[0].status==='awaiting_approval');
  assert.deepEqual(run.input.notes,['Confirmed final input']);assert.equal(run.trigger.ruleId,rule.id);assert.equal(run.trigger.committed,true);
  assert.equal((await api.get('/records/tasks?projectId='+map.projectId)).length,0);
  const response=await api.send(`/runs/${run.id}/approve`,{projectId:map.projectId,accepted:true,actions:run.data.actions,baseRevision:run.revision});
  assert.equal(response.status,200);const completed=await response.json();assert.equal(completed.status,'succeeded');
  assert.notEqual((await api.send(`/runs/${run.id}/approve`,{projectId:map.projectId,accepted:true,actions:run.data.actions,baseRevision:run.revision})).status,200);
  const tasks=await api.get('/records/tasks?projectId='+map.projectId);assert.equal(tasks.length,1);assert.equal(tasks[0].sourceMapId,map.id);
  const journal=await until(()=>api.get('/event-deliveries?projectId='+map.projectId),items=>items.some(i=>i.status==='delivered'));
  assert.ok(journal[0].outcomes.some(o=>o.runId===run.id));assert.ok(!JSON.stringify(journal).includes('Confirmed final input'));
  assert.deepEqual(await api.get('/event-deliveries?projectId=other-project'),[]);
});
test('HTTP signed webhooks deduplicate and reject changed payloads and invalid signatures',async t=>{
  const secret='synthetic-test-key',api=await referenceServer(t,{webhookSecret:secret});
  const map=await api.put('maps',createMap({projectId:'http-hooks',flow:createMeetingFlow()}));
  const rule=await api.put('rules',{...createRule(map),trigger:'webhook',status:'enabled',inputSource:'event-notes'});
  const event={id:'hook-test',projectId:map.projectId,type:'test',data:{notes:['Hook action']}};
  const call=async(value,invalid=false)=>{const raw=JSON.stringify(value),timestamp=String(Math.floor(Date.now()/1000));const signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');return fetch(api.base+`/api/hooks/${rule.id}`,{method:'POST',headers:{'Content-Type':'application/json','X-Maps-Timestamp':timestamp,'X-Maps-Signature':invalid?'0'.repeat(64):signature},body:raw});};
  assert.equal((await call(event,true)).status,403);
  const first=await call(event);assert.equal(first.status,200);const run=await first.json();
  const repeat=await call(event);assert.equal(repeat.status,200);assert.equal((await repeat.json()).id,run.id);
  assert.equal((await call({...event,data:{notes:['Different action']}})).status,409);
  assert.equal((await api.get('/records/runs?projectId='+map.projectId)).length,1);
  assert.equal((await api.get('/records/tasks?projectId='+map.projectId)).length,0);
});
test('HTTP dead-letter retry is project-scoped, version-checked and uses frozen input',async t=>{
  let entry,map;
  const api=await referenceServer(t,{seed:async dir=>{
    const repo=await new FileRepository(dir).init();map=await repo.write('maps',withNote(createMap({projectId:'http-retry',flow:createMeetingFlow()}),'Original'),0);
    await repo.write('rules',{...createRule(map),trigger:'project',eventType:'map.updated',status:'enabled'},0);
    const changed=clone(map);changed.document.objects[0].text='Frozen retry';map=await repo.write('maps',changed,map.revision);
    entry=repo.outbox[0];entry.status='dead';entry.attempts=5;entry.totalAttempts=5;entry.lastError='OFFLINE';entry.nextAttemptAt=null;await repo.persist(repo.snapshot());
  }});
  assert.equal((await api.send(`/event-deliveries/${entry.id}/retry`,{projectId:'another',baseRevision:entry.revision})).status,404);
  assert.equal((await api.send(`/event-deliveries/${entry.id}/retry`,{projectId:map.projectId,baseRevision:entry.revision-1})).status,409);
  const reply=await api.send(`/event-deliveries/${entry.id}/retry`,{projectId:map.projectId,baseRevision:entry.revision});assert.equal(reply.status,200);assert.equal((await reply.json()).manualRetries,1);
  const [run]=await until(()=>api.get('/records/runs?projectId='+map.projectId),r=>r.length===1&&r[0].status==='awaiting_approval');assert.deepEqual(run.input.notes,['Frozen retry']);
});
test('HTTP task column change emits one committed event without auto-creating tasks',async t=>{
  const {createTask}=await import('../src/tasks.js'),api=await referenceServer(t);
  const map=await api.put('maps',createMap({projectId:'task-events',flow:createMeetingFlow()}));
  const rule=await api.put('rules',{...createRule(map),trigger:'project',eventType:'task.status_changed',status:'enabled',inputSource:'event-notes'});
  let task=await api.put('tasks',createTask({projectId:map.projectId,title:'Review this result'}));
  task=await api.put('tasks',{...task,status:'review'});
  const [run]=await until(()=>api.get('/records/runs?projectId='+map.projectId),r=>r.length===1&&r[0].status==='awaiting_approval');
  assert.deepEqual(run.input.notes,['Review this result']);assert.equal(run.trigger.ruleId,rule.id);
  assert.equal((await api.get('/records/tasks?projectId='+map.projectId)).length,1);
  const malformed=await api.send('/events',{id:'bad-event',projectId:map.projectId,type:'task.status_changed',depth:-10});assert.equal(malformed.status,400);
});
