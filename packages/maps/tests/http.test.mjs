import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';
import {createMap,clone} from '../src/model.js';import {createMeetingFlow} from '../src/workflow.js';
test('local HTTP reference: static entry, CAS, CSRF, canonical flow and approval',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'maps-http-')),port=19000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/app.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,MAPS_PORT:String(port),MAPS_DATA_DIR:dir,MAPS_LLM_GATEWAY:'',MAPS_WEBHOOK_SECRET:''},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  try{
    let ready=false;for(let i=0;i<100;i++){try{const res=await fetch(base+'/api/capabilities');if(res.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,20));}assert.ok(ready,output);
    assert.equal((await fetch(base+'/demo/')).status,200);assert.equal((await fetch(base+'/.dev-state/records.json')).status,404);
    const map=createMap({projectId:'http-project',flow:createMeetingFlow()});const endpoint=base+`/api/records/maps/${map.id}`;
    let response=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({record:map,baseRevision:0})});assert.equal(response.status,403);
    const headers={'Content-Type':'application/json','X-Maps-Client':'reference'};
    response=await fetch(endpoint,{method:'PUT',headers:{...headers,Origin:'https://untrusted.example'},body:JSON.stringify({record:map,baseRevision:0})});assert.equal(response.status,403);
    response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({record:map,baseRevision:0})});assert.equal(response.status,200);const saved=await response.json();
    response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({record:map,baseRevision:0})});assert.equal(response.status,409);
    const forged=clone(map.flow);forged.nodes[0].title='FORGED FLOW';
    response=await fetch(base+'/api/runs',{method:'POST',headers,body:JSON.stringify({projectId:map.projectId,mapId:map.id,mapRevision:saved.revision,flow:forged,input:{notes:['HTTP task']},mode:'test'})});assert.equal(response.status,200);let run=await response.json();assert.equal(run.status,'awaiting_approval');assert.notEqual(run.flowSnapshot.nodes[0].title,'FORGED FLOW');
    response=await fetch(base+`/api/runs/${run.id}/approve`,{method:'POST',headers,body:JSON.stringify({projectId:map.projectId,accepted:true,actions:run.data.actions,baseRevision:run.revision})});assert.equal(response.status,200);run=await response.json();assert.equal(run.status,'succeeded');
    const tasks=await(await fetch(base+`/api/records/tasks?projectId=${map.projectId}`)).json();assert.equal(tasks.length,0);
    response=await fetch(base+'/api/records/runs/'+run.id,{method:'PUT',headers,body:JSON.stringify({record:run,baseRevision:run.revision})});assert.equal(response.status,400);
  }finally{const exited=once(child,'exit');child.kill('SIGTERM');await exited;await rm(dir,{recursive:true,force:true});}
});
