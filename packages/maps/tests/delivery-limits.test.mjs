import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FileRepository} from '../server/file-repository.mjs';
import {OutboxWorker,HISTORY_LIMIT,MAX_MANUAL_RETRIES} from '../server/outbox.mjs';
import {EventService} from '../server/event-service.mjs';
import {WorkflowRuntime} from '../src/runtime.js';
import {createMap} from '../src/model.js';
import {createMeetingFlow} from '../src/workflow.js';
import {createRule,validateRule} from '../src/events.js';
async function fixture(t){
  const dir=await mkdtemp(path.join(os.tmpdir(),'maps-limits-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const repo=await new FileRepository(dir).init();
  let map=await repo.write('maps',createMap({projectId:'limits',flow:createMeetingFlow()}),0);
  const rule=await repo.write('rules',{...createRule(map),trigger:'project',eventType:'map.updated',status:'enabled'},0);
  map=await repo.write('maps',{...map,title:'Committed change'},map.revision);
  return {repo,map,rule};
}
test('dead-letter recovery is bounded and stale acknowledgement cannot erase recovery',async t=>{
  const {repo,map}=await fixture(t);let entry=(await repo.pendingEvents())[0];const frozen=structuredClone(entry.targets);
  for(let i=0;i<MAX_MANUAL_RETRIES;i++){
    await repo.settleEvent(entry.id,{error:'OFFLINE',date:Date.now(),permanent:true},{baseRevision:entry.revision});
    entry=(await repo.pendingEvents())[0];const old=entry.revision;
    await repo.recoverEvent(entry.id,map.projectId,'retry',old);
    assert.equal(await repo.settleEvent(entry.id,null,{baseRevision:old}),false);
    entry=(await repo.pendingEvents())[0];assert.deepEqual(entry.targets,frozen);assert.equal(entry.manualRetries,i+1);
  }
  await repo.settleEvent(entry.id,{error:'OFFLINE',date:Date.now(),permanent:true},{baseRevision:entry.revision});entry=(await repo.pendingEvents())[0];
  await assert.rejects(repo.recoverEvent(entry.id,map.projectId,'retry',entry.revision),{code:'RETRY_LIMIT'});
  await repo.recoverEvent(entry.id,map.projectId,'dismiss',entry.revision);assert.equal((await repo.pendingEvents()).length,0);
});
test('delivery history enforces the actual 500-record retention bound',async t=>{
  const {repo,map}=await fixture(t);
  repo.deliveryHistory=Array.from({length:HISTORY_LIMIT},(_,i)=>({id:'old-'+i,projectId:map.projectId,targets:[],updatedAt:'2026-01-01T00:00:00Z'}));
  await new OutboxWorker(repo,new EventService(repo,new WorkflowRuntime(repo))).drain();
  const history=await repo.listDeliveries(map.projectId);assert.equal(history.length,HISTORY_LIMIT);
  assert.ok(!history.some(x=>x.id==='old-0'));assert.ok(history.some(x=>x.status==='delivered'));
});
test('aborted changes create neither a new revision nor an event',async t=>{
  const {repo,map}=await fixture(t),count=(await repo.pendingEvents()).length,controller=new AbortController();controller.abort();
  await assert.rejects(repo.write('maps',{...map,title:'Must not save'},map.revision,{signal:controller.signal}));
  assert.equal((await repo.read('maps',map.id,map.projectId)).revision,map.revision);assert.equal((await repo.pendingEvents()).length,count);
});
test('rule validation rejects inherited trigger names and malformed names without throwing',()=>{
  const rule=createRule(createMap({projectId:'limits',flow:createMeetingFlow()}));
  for(const trigger of ['__proto__','constructor','toString'])assert.ok(validateRule({...rule,trigger}).length);
  for(const name of [null,42,{},'',' '.repeat(3),'x'.repeat(241)])assert.ok(validateRule({...rule,name}).length);
});
