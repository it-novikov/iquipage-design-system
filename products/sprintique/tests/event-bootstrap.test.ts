import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {EventHeadResponse} from '../contracts/events.js';

let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'EV'});});
after(async()=>{await f?.close();});
const path=(suffix:string)=>`/api/v1/projects/${f.first.id}/${suffix}`;
async function create(id:string){
  const response=await f.app.inject({method:'PUT',url:path('tasks/'+id),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:id}}});
  assert.equal(response.statusCode,200,response.body);
}
test('R4-FE-02 bootstrap skips historical events and catches commits during snapshot loading',async()=>{
  await create('before-snapshot');
  const response=await f.app.inject({url:path('events/head'),headers:f.alice.headers});
  assert.equal(response.statusCode,200,response.body);
  const head=EventHeadResponse.parse(response.json());
  const empty=await f.app.inject({url:path('events?cursor='+encodeURIComponent(head.cursor)),headers:f.alice.headers});
  assert.deepEqual(empty.json().items,[]);
  await create('during-snapshot');
  const catchUp=await f.app.inject({url:path('events?cursor='+encodeURIComponent(head.cursor)),headers:f.alice.headers});
  assert.equal(catchUp.statusCode,200,catchUp.body);
  assert.deepEqual(catchUp.json().items.map((item:{resourceId:string})=>item.resourceId),['during-snapshot']);
  assert.equal(response.headers['cache-control'],'no-store');
});
test('R4-FE-02 reconnect Last-Event-ID takes precedence over the original bootstrap URL',async()=>{
  const head=EventHeadResponse.parse((await f.app.inject({url:path('events/head'),headers:f.alice.headers})).json());
  await create('reconnect-first');
  const first=(await f.app.inject({url:path('events?cursor='+encodeURIComponent(head.cursor)),headers:f.alice.headers})).json();
  await create('reconnect-second');
  const response=await f.app.inject({url:path('events?cursor='+encodeURIComponent(head.cursor)),headers:{...f.alice.headers,'last-event-id':first.cursor}});
  assert.deepEqual(response.json().items.map((item:{resourceId:string})=>item.resourceId),['reconnect-second']);
});
test('R4-FE-02 event head enforces live credentials, project scope and read capabilities',async()=>{
  assert.equal((await f.app.inject(path('events/head'))).statusCode,401);
  assert.equal((await f.app.inject({url:path('events/head'),headers:f.bob.headers})).statusCode,404);
  assert.equal((await f.app.inject({url:path('events/head'),headers:f.reader.headers})).statusCode,200);
  const grant=await f.app.inject({method:'POST',url:path('agents'),headers:f.alice.headers,payload:{name:'Events test',capabilities:['maps:read'],expiresInSeconds:600}});
  assert.equal(grant.statusCode,200,grant.body);
  const headers={authorization:'Bearer '+grant.json().token};
  assert.equal((await f.app.inject({url:path('events/head'),headers})).statusCode,200);
  await f.admin.query('UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE principal_id=$1',[grant.json().id]);
  assert.equal((await f.app.inject({url:path('events/head'),headers})).statusCode,401);
  const doc=(await f.app.inject('/openapi.json')).json();
  assert.equal(doc.paths['/api/v1/projects/{projectId}/events/head'].get.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/EventHeadResponse');
});
