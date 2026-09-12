import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {TaskSettingsInput} from '../contracts/workspace.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'W'});});after(async()=>{await f?.close();});
const url=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
async function request(method:'GET'|'PUT',resource:string,payload?:unknown,headers=f.alice.headers,key=randomUUID()){
  return f.app.inject({method,url:resource.startsWith('/')?resource:url(resource),headers:{...headers,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
}
async function task(id:string){const r=await request('PUT','tasks/'+id,{baseRevision:0,task:{title:'workspace '+id,description:'Сохранить содержание'}});assert.equal(r.statusCode,200,r.body);return r.json();}
test('W01 new project has versioned Markdown starter templates; admin edits never rewrite tasks',async()=>{
  const settings=(await request('GET','task-settings')).json();assert.equal(settings.revision,1);assert.match(settings.types.bug.description,/Как повторить/);assert.deepEqual(settings.base.checklists,[]);
  await task('template-existing');const value=TaskSettingsInput.parse({base:settings.base,types:settings.types});value.types.task.description='Новый шаблон';
  const key=randomUUID(),r=await request('PUT','task-settings',{baseRevision:1,value},f.alice.headers,key);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().revision,2);
  assert.deepEqual((await request('PUT','task-settings',{baseRevision:1,value},f.alice.headers,key)).json(),r.json());
  assert.equal((await request('PUT','task-settings',{baseRevision:1,value})).statusCode,409);
  assert.equal((await request('PUT','task-settings',{baseRevision:2,value},f.reader.headers)).statusCode,403);
  assert.equal((await request('GET','task-settings',undefined,f.bob.headers)).statusCode,404);
  assert.equal((await request('GET','tasks/template-existing')).json().description,'Сохранить содержание');
  const versions=await f.admin.query('SELECT revision FROM app.task_settings_versions WHERE project_id=$1 ORDER BY revision',[f.first.id]);assert.deepEqual(versions.rows.map(r=>r['revision']),[1,2]);
  await assert.rejects(f.db.authenticated({token:f.alice.token,kind:'session'},tx=>tx.query('UPDATE app.task_settings_versions SET value=value WHERE project_id=$1',[f.first.id])),{code:'42501'});
});
test('W02 compiled Markdown limit and legacy checklist structures cannot bypass the clean-start contract',async()=>{
  const current=(await request('GET','task-settings')).json();const value={base:current.base,types:current.types};
  value.base.description='a'.repeat(6000);value.types.task.description='b'.repeat(6000);value.types.task.descriptionMode='append';
  assert.equal((await request('PUT','task-settings',{baseRevision:2,value})).statusCode,400);
  value.base.description='';value.types.task.description='';value.base.checklists=[{items:[]}];
  assert.equal((await request('PUT','task-settings',{baseRevision:2,value})).statusCode,400);
});
test('W03 logical links are scoped, immutable, CAS protected and cycle safe',async()=>{
  await task('link-a');await task('link-b');await task('link-c');
  const put=(id:string,fromId:string,toId:string,kind='depends',baseRevision=0,archived=false)=>request('PUT','task-links/'+id,{baseRevision,value:{kind,fromId,toId,archived}});
  const first=await put('ab','link-a','link-b');assert.equal(first.statusCode,200,first.body);
  assert.equal((await put('bc','link-b','link-c')).statusCode,200);
  const cycle=await put('ca','link-c','link-a');assert.equal(cycle.statusCode,422);assert.equal(cycle.json().code,'TASK_DEPENDENCY_CYCLE');
  assert.equal((await put('ab','link-a','link-c','depends',1)).statusCode,422);
  assert.equal((await put('related','link-a','link-c','related')).statusCode,200);
  assert.equal((await put('related-reversed','link-c','link-a','related')).statusCode,409);
  const removed=await put('ab','link-a','link-b','depends',1,true);assert.equal(removed.statusCode,200);assert.ok(removed.json().archivedAt);
  assert.equal((await put('ca','link-c','link-a')).statusCode,200);
  assert.equal((await request('GET','task-links',undefined,f.bob.headers)).statusCode,404);
  assert.equal((await request('PUT','task-links/reader',{baseRevision:0,value:{kind:'related',fromId:'link-b',toId:'link-c'}},f.reader.headers)).statusCode,403);
});
test('W04 search includes authorized project/task keys and Markdown, excludes other tenants and validates cursors',async()=>{
  const response=await request('GET','/api/v1/search?q=workspace');assert.equal(response.statusCode,200,response.body);assert.ok(response.json().items.length>=4);
  assert.ok(response.json().items.every((r:{projectId:string;url:string})=>r.projectId===f.first.id&&r.url.startsWith('/?project=wspr#/task/WSPR-')));
  const other=await request('GET','/api/v1/search?q=workspace',undefined,f.bob.headers);assert.equal(other.statusCode,200);assert.equal(other.json().items.length,0);
  assert.ok((await request('GET','/api/v1/search?q='+encodeURIComponent('содержание'))).json().items.length>=4);
  assert.equal((await request('GET','/api/v1/search?q=workspace&cursor=invalid')).statusCode,400);
});
test('W05 logical and temporal dependency APIs cannot close each other\'s cycles',async()=>{
  await task('cross-a');await task('cross-b');
  const headers={...f.alice.headers,'idempotency-key':randomUUID()};
  const temporal=await f.app.inject({method:'PUT',url:url('planning/constraints/cross-temporal'),headers,payload:{baseRevision:0,value:{source:{kind:'task',id:'cross-a'},target:{kind:'task',id:'cross-b'},relation:'FS',lagDays:0}}});assert.equal(temporal.statusCode,200,temporal.body);
  const cycle=await request('PUT','task-links/cross-link',{baseRevision:0,value:{kind:'depends',fromId:'cross-a',toId:'cross-b'}});assert.equal(cycle.statusCode,422);assert.equal(cycle.json().code,'TEMPORAL_CYCLE');
});
