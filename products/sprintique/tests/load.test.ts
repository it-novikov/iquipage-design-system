import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fixture} from './fixture.js';

let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'L'});});after(async()=>{await f?.close();});
test('L01 SME projection profile: 2000 tasks, eight concurrent readers, bounded transport and conflicting writers',async t=>{
  // Synthetic bulk fixture only: never insert around application policy in a real project.
  await f.admin.query(`INSERT INTO app.tasks(project_id,id,number,title,description,status,type,priority,owner_label,rank,revision)
    SELECT $1,'load-'||n,n,'Load '||n,repeat('x',1000),'ready','task','normal','',n*1024,1 FROM generate_series(1,2000) n`,[f.first.id]);
  await f.admin.query('UPDATE app.projects SET next_task_number=2001 WHERE id=$1',[f.first.id]);
  const base='/api/v1/projects/'+f.first.id,latencies:number[]=[],sizes:number[]=[];
  await Promise.all(Array.from({length:8},async()=>{
    const start=performance.now(),groups=await f.app.inject({method:'POST',url:base+'/planning/view/groups',headers:f.alice.headers,payload:{query:'Load'}});
    assert.equal(groups.statusCode,200,groups.body);
    const page=await f.app.inject({method:'POST',url:base+'/planning/view/rows',headers:f.alice.headers,payload:{query:'Load',groupId:'backlog',revision:groups.json().revision}});
    assert.equal(page.statusCode,200,page.body);assert.equal(page.json().rows.length,200);assert.ok(page.json().nextCursor);assert.ok(!page.body.includes('xxxxxxxxxx'));
    latencies.push(performance.now()-start);sizes.push(Buffer.byteLength(page.body));
  }));
  const writes=await Promise.all(['first','second'].map(title=>f.app.inject({method:'PUT',url:base+'/tasks/load-1',headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:1,task:{title}}})));
  assert.deepEqual(writes.map(r=>r.statusCode).sort(),[200,409]);
  latencies.sort((a,b)=>a-b);const p95=latencies.at(-1)!;
  assert.ok(p95<10000,'Local regression threshold is 10s, not a production SLA.');assert.ok(Math.max(...sizes)<200*1024);
  t.diagnostic(JSON.stringify({profile:'synthetic-local-not-SLA',tasks:2000,concurrentReaders:8,p95GroupAndPageMs:Math.round(p95),maxPageBytes:Math.max(...sizes),conflictingWrites:'one winner'}));
});
