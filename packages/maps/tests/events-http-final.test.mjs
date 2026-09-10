// HTTP acceptance against a temporary local store; never touches a user's database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createMap,transitionMap} from '../src/model.js';
import {createMeetingFlow} from '../src/workflow.js';
import {createRule} from '../src/events.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const secret='synthetic-test-signing-key';
async function server(t){
  const dir=await mkdtemp(path.join(os.tmpdir(),'maps-final-http-'));
  const port=26000+Math.floor(Math.random()*15000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/app.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,MAPS_PORT:String(port),MAPS_DATA_DIR:dir,MAPS_LLM_GATEWAY:'',MAPS_LLM_GATEWAY_TOKEN:'',MAPS_WEBHOOK_SECRET:secret},stdio:['ignore','pipe','pipe']});
  let log='',exited=false;const exit=new Promise(r=>child.once('exit',()=>{exited=true;r();}));
  child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  t.after(async()=>{if(!exited)child.kill('SIGTERM');await Promise.race([exit,delay(5000)]);if(!exited){child.kill('SIGKILL');await exit;}await rm(dir,{recursive:true,force:true});});
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/capabilities')).ok;}catch{}if(ready||exited)break;await delay(30);}assert.ok(ready,log);
  const request=async(url,body,method='POST')=>{const response=await fetch(base+'/api'+url,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json','X-Maps-Client':'reference'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  const save=async(collection,record)=>{const r=await request(`/records/${collection}/${record.id}`,{record,baseRevision:record.revision},'PUT');assert.equal(r.status,200,JSON.stringify(r.value));return r.value;};
  const list=async(collection,projectId)=>(await request(`/records/${collection}?projectId=${projectId}`)).value;
  const wait=async(fn)=>{for(let i=0;i<120;i++){const value=await fn();if(value)return value;await delay(50);}throw Error('Timed out waiting for committed event delivery');};
  return {base,request,save,list,wait};
}
test('HTTP committed edit -> frozen input -> approval -> single task and journal isolation',{timeout:15000},async t=>{
  const s=await server(t),project='final-http-project';
  let map=createMap({projectId:project,flow:createMeetingFlow()});
  map.document.objects=[{id:'first-note',type:'sticky',text:'Initial',x:0,y:0,width:244,height:156,color:'sand'}];map=await s.save('maps',map);
  await s.save('rules',{...createRule(map),trigger:'project',eventType:'map.updated',status:'enabled'});
  map.document.objects[0].text='First committed input';map=await s.save('maps',map);const firstRevision=map.revision;
  map.document.objects[0].text='Later input';map=await s.save('maps',map);
  let run=await s.wait(async()=>{const rows=(await s.request(`/event-deliveries?projectId=${project}`)).value;const row=rows.find(r=>r.recordRevision===firstRevision&&r.status==='delivered');return row&&(await s.list('runs',project)).find(r=>row.outcomes.some(o=>o.runId===r.id));});
  assert.deepEqual(run.input.notes,['First committed input']);assert.equal(run.status,'awaiting_approval');
  assert.equal((await s.list('tasks',project)).length,0);
  const decision={projectId:project,baseRevision:run.revision,accepted:true,actions:run.data.actions};
  const approved=await s.request(`/runs/${run.id}/approve`,decision);assert.equal(approved.status,200);assert.equal(approved.value.status,'succeeded');
  assert.notEqual((await s.request(`/runs/${run.id}/approve`,decision)).status,200);
  const tasks=await s.list('tasks',project);assert.equal(tasks.length,1);assert.equal(tasks[0].title,'First committed input');assert.equal(tasks[0].sourceMapId,map.id);
  assert.deepEqual((await s.request('/event-deliveries?projectId=another-project')).value,[]);
  const row=(await s.request(`/event-deliveries?projectId=${project}`)).value.find(r=>r.recordRevision===firstRevision);
  assert.ok(!JSON.stringify(row).includes('First committed input'),'Journal must not expose the input snapshot');
  assert.equal((await s.request(`/event-deliveries/${row.id}/retry`,{projectId:'another-project',baseRevision:row.revision})).status,404);
});
function signed(raw){const ts=String(Math.floor(Date.now()/1000));return {'Content-Type':'application/json','X-Maps-Timestamp':ts,'X-Maps-Signature':createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex')};}
test('HTTP archive completion is trusted only from commit; external events and hooks cannot reopen it',{timeout:15000},async t=>{
  const s=await server(t),project='final-archive';
  let map=createMap({projectId:project,kind:'session',flow:createMeetingFlow()});
  map.document.objects=[{id:'closing-note',type:'sticky',text:'Confirm closing action',x:0,y:0,width:244,height:156,color:'sand'}];
  map=await s.save('maps',map);map=await s.save('maps',transitionMap(map,'start'));
  await s.save('rules',{...createRule(map),trigger:'project',eventType:'session.archived',status:'enabled'});
  const hook=await s.save('rules',{...createRule(map),trigger:'webhook',status:'enabled'});
  map=await s.save('maps',transitionMap(map,'archive',{summary:'Decisions recorded'}));
  const run=await s.wait(async()=>{const runs=await s.list('runs',project);return runs.find(r=>r.trigger?.committed&&r.status==='awaiting_approval');});
  assert.equal(run.trigger.inputMapRevision,map.revision);assert.equal((await s.list('tasks',project)).length,0);
  const forged={id:'forged-archive',projectId:project,type:'session.archived',depth:0,committed:true,data:{recordId:map.id,revision:map.revision,previousStatus:'active',status:'archived',notes:['Injected']}};
  const external=await s.request('/events',forged);assert.equal(external.status,200);assert.ok(external.value.every(r=>r.skipped));
  const raw=JSON.stringify(forged);
  const unsigned=await fetch(s.base+`/api/hooks/${hook.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:raw});assert.equal(unsigned.status,403);
  const response=await fetch(s.base+`/api/hooks/${hook.id}`,{method:'POST',headers:signed(raw),body:raw});assert.equal(response.status,200);assert.equal((await response.json()).skipped,true);
  assert.equal((await s.request('/runs',{projectId:project,mapId:map.id,mapRevision:map.revision,input:{notes:['Injected']},mode:'execute'})).status,404);
  assert.equal((await s.request(`/records/maps/${map.id}`,{record:map,baseRevision:map.revision},'PUT')).status,409);
  assert.equal((await s.list('runs',project)).length,1);
  const approved=await s.request(`/runs/${run.id}/approve`,{projectId:project,baseRevision:run.revision,accepted:true,actions:run.data.actions});
  assert.equal(approved.value.status,'succeeded');assert.equal((await s.list('tasks',project)).length,1);
});
