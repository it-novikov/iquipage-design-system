import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'Q'});});after(async()=>{await f?.close();});
const call=(method:'GET'|'POST'|'PUT'|'PATCH',path:string,payload?:unknown,user=f.alice,key=randomUUID())=>f.app.inject({method,url:'/api/v1/'+path,headers:{...user.headers,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
test('Q01 project profile CAS and replay preserve human URLs and reject foreign/staged file references',async()=>{
  const path='projects/'+f.first.id+'/profile',previous=(await call('GET',path)).json();
  const key=randomUUID(),body={baseRevision:1,name:'Переименованный проект',avatarAssetId:null};
  const updated=await call('PUT',path,body,f.alice,key);assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().slug,previous.slug);assert.equal(updated.json().key,previous.key);
  assert.deepEqual((await call('PUT',path,body,f.alice,key)).json(),updated.json());
  assert.equal((await call('PUT',path,body)).statusCode,409);
  assert.equal((await call('PUT',path,{...body,baseRevision:2,avatarAssetId:'foreign'})).statusCode,422);
  assert.equal((await call('PUT',path,{...body,baseRevision:2},f.reader)).statusCode,403);
});
test('Q02 workspace profile and roles are independent, CAS protected and cannot remove the last administrator',async()=>{
  const base='workspaces/'+f.first.workspaceId;
  assert.equal((await call('GET',base,undefined,f.bob)).statusCode,404);
  assert.equal((await call('PATCH',base,{baseRevision:1,name:'Изменено',timezone:'Europe/Moscow'},f.reader)).statusCode,403);
  const updated=await call('PATCH',base,{baseRevision:1,name:'Продукты',timezone:'Europe/Moscow'});assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().revision,2);
  assert.equal((await call('PATCH',base,{baseRevision:1,name:'Устарело',timezone:'UTC'})).statusCode,409);
  const last=await call('PATCH',base+'/members/'+f.alice.id,{baseRevision:1,role:'member'});assert.equal(last.json().code,'LAST_ADMIN');
  const removal=await call('PATCH',base+'/members/'+f.reader.id,{baseRevision:1,role:null});assert.equal(removal.json().code,'PROJECT_ACCESS_REMAINS');
  assert.equal((await call('PATCH',base+'/members/'+f.reader.id,{baseRevision:1,role:'admin'})).statusCode,200);
  const results=await Promise.all([call('PATCH',base+'/members/'+f.alice.id,{baseRevision:1,role:'member'}),call('PATCH',base+'/members/'+f.reader.id,{baseRevision:2,role:'member'},f.reader)]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const projectRole=(await call('GET','session',undefined,f.reader)).json().projects.find((p:{id:string})=>p.id===f.first.id).role;assert.equal(projectRole,'reader');
});
test('Q03 workspace catalog authority does not grant project content or profile write authority',async()=>{
  const workspace=(await call('POST','workspaces',{name:'Directory only'})).json();
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'admin')",[workspace.id,f.bob.id]);
  const project=await call('POST','projects',{workspaceId:workspace.id,name:'Private project',slug:'private-'+randomUUID(),key:'PRIVATE'},f.bob);assert.equal(project.statusCode,200,project.body);
  const id=project.json().id;
  assert.equal((await call('GET','projects/'+id+'/tasks')).statusCode,404);
  assert.equal((await call('GET','projects/'+id+'/profile')).statusCode,404);
  assert.equal((await call('PUT','projects/'+id+'/profile',{baseRevision:1,name:'Hijack',avatarAssetId:null})).statusCode,404);
  assert.equal((await call('PATCH','workspaces/'+workspace.id+'/members/'+f.bob.id,{baseRevision:1,role:null})).json().code,'PROJECT_ACCESS_REMAINS');
});
