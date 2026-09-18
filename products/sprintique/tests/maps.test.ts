import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {MapInput} from '../contracts/maps.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'M'});});after(async()=>{await f?.close();});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
const note=(id='note')=>({id,type:'sticky' as const,text:'Идея',x:0,y:0,width:240,height:160,color:'sand' as const});
const draft=(kind:'permanent'|'session'='permanent')=>MapInput.parse({title:'Карта',kind,status:kind==='permanent'?'active':'draft',
  document:{schema:'iquipage.whiteboard/1',title:'Карта',revision:0,objects:[note()],connections:[]},
  session:kind==='session'?{phase:'collect',voteLimit:3}:null});
const get=(resource:string,headers=f.alice.headers)=>f.app.inject({method:'GET',url:path(resource),headers});
const put=(id:string,baseRevision:number,value:unknown,extra:Record<string,unknown>={},headers=f.alice.headers,key=randomUUID())=>f.app.inject({method:'PUT',url:path('maps/'+id),headers:{...headers,'idempotency-key':key},payload:{baseRevision,value,...extra}});
test('M01 maps persist canonical versions with CAS, receipts, tenant isolation and append-only history',async()=>{
  const value=draft(),key=randomUUID(),first=await put('map-a',0,value,{},f.alice.headers,key);assert.equal(first.statusCode,200,first.body);
  assert.equal(first.json().document.revision,1);assert.ok(first.json().createdAt);assert.deepEqual((await put('map-a',0,value,{},f.alice.headers,key)).json(),first.json());
  assert.equal((await put('map-a',0,{...value,title:'Другое'}, {},f.alice.headers,key)).statusCode,409);
  assert.equal((await put('map-a',0,value)).statusCode,409);
  value.title='Новая версия';const saved=await put('map-a',1,value);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().document.title,'Новая версия');
  assert.equal((await get('maps/map-a',f.bob.headers)).statusCode,404);assert.equal((await put('reader-map',0,value,{},f.reader.headers)).statusCode,403);
  assert.equal((await get('maps',f.reader.headers)).json().items.length,1);
  const history=await f.admin.query('SELECT revision FROM app.map_versions WHERE project_id=$1 AND id=$2 ORDER BY revision',[f.first.id,'map-a']);assert.deepEqual(history.rows.map(r=>r['revision']),[1,2]);
  await assert.rejects(f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query('UPDATE app.map_versions SET value=value WHERE project_id=$1',[f.first.id])),{code:'42501'});
});
test('M02 invalid diagrams, private URLs, oversized documents, forged metadata and references are rejected',async()=>{
  const value=draft();value.document.connections=[{id:'edge',from:'note',to:'missing'}];assert.equal((await put('bad-edge',0,value)).statusCode,400);
  const self=draft();self.document.objects[0]!.parentId='note';assert.equal((await put('self',0,self)).statusCode,400);
  const image={...note(),type:'image',src:'https://attacker.invalid/private'};assert.equal((await put('external',0,{...draft(),document:{...draft().document,objects:[image]}})).statusCode,400);
  const ref={...note(),type:'task',externalTaskId:'not-my-task'};const response=await put('ref',0,{...draft(),document:{...draft().document,objects:[ref]}});assert.equal(response.statusCode,422,response.body);
  assert.equal((await put('spoof',0,{...draft(),createdBy:f.bob.id})).statusCode,400);
  assert.equal((await put('huge',0,{...draft(),document:{...draft().document,objects:Array.from({length:601},(_,n)=>note('n'+n))}})).statusCode,400);
});
test('M03 session transitions, server timers and per-person votes remain independent and archived maps immutable',async()=>{
  const value=draft('session');assert.equal((await put('session',0,value,{timer:{remaining:300,running:true}})).statusCode,422);
  assert.equal((await put('session',0,value)).statusCode,200);
  value.status='active';const start=await put('session',1,value,{timer:{remaining:120,running:true},votes:{note:2}});assert.equal(start.statusCode,200,start.body);
  assert.ok(start.json().startedAt);assert.ok(Math.abs(Date.parse(start.json().session.timer.endsAt)-Date.now()-120000)<3000);
  await f.admin.query("UPDATE app.project_members SET role='editor' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.reader.id]);
  const second=await put('session',2,value,{votes:{note:3}},f.reader.headers);assert.equal(second.statusCode,200,second.body);assert.deepEqual(second.json().session.votes,{note:3});assert.deepEqual(second.json().session.voteTotals,{note:5});
  assert.deepEqual((await get('maps/session')).json().session.votes,{note:2});
  assert.equal((await put('session',3,value,{votes:{note:4}})).statusCode,422);
  value.status='paused';const paused=await put('session',3,value);assert.equal(paused.statusCode,200);assert.equal(paused.json().session.timer.endsAt,null);assert.ok(paused.json().session.timer.remaining<=120);
  value.status='archived';const archived=await put('session',4,value);assert.equal(archived.statusCode,200,archived.body);assert.ok(archived.json().archivedAt);
  assert.equal((await put('session',5,value)).statusCode,409);value.status='active';assert.equal((await put('session',5,value)).statusCode,409);
  const continuation=draft();continuation.sourceMapId='session';continuation.sourceRevision=4;assert.equal((await put('next',0,continuation)).statusCode,409);
  continuation.sourceRevision=5;assert.equal((await put('next',0,continuation)).statusCode,200);
});
test('M04 map templates obey personal/project/workspace scopes and require explicit workspace publishing authority',async()=>{
  const write=(id:string,scope:string,headers=f.alice.headers)=>f.app.inject({method:'PUT',url:path('map-templates/'+id),headers:{...headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:{title:id,scope,kind:'permanent',document:draft().document}}});
  assert.equal((await write('personal','personal')).statusCode,200);assert.equal((await write('shared','project')).statusCode,200);assert.equal((await write('workspace','workspace')).statusCode,200);
  const theirs=(await get('map-templates',f.reader.headers)).json();assert.deepEqual(theirs.map((r:{id:string})=>r.id),['shared','workspace']);
  assert.equal((await write('forged-workspace','workspace',f.reader.headers)).statusCode,403);
  assert.equal((await get('map-templates',f.bob.headers)).statusCode,404);
});
test('M05 concurrent writers have one winner and a failed audit rolls the document and receipt back',async()=>{
  const v=draft();await put('race',0,v);
  const results=await Promise.all([put('race',1,{...v,title:'Первый'}),put('race',1,{...v,title:'Второй'})]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  await f.admin.query(`CREATE FUNCTION app.reject_map_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='map-rollback' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_map_audit_test BEFORE INSERT ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.reject_map_audit_test()`);
  try{const response=await put('map-rollback',0,v);assert.equal(response.statusCode,503);assert.equal((await get('maps/map-rollback')).statusCode,404);}
  finally{await f.admin.query('DROP TRIGGER reject_map_audit_test ON app.audit_events; DROP FUNCTION app.reject_map_audit_test()');}
});
