import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'I'});});after(async()=>{await f?.close();});
const path=(s:string)=>'/api/v1/projects/'+f.first.id+'/'+s;
const call=(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:unknown,user=f.alice)=>f.app.inject({method,url,headers:{...user.headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
async function invite(role='editor'){
  const r=await call('POST',path('invitations'),{id:randomUUID(),role,expiresInSeconds:3600});assert.equal(r.statusCode,200,r.body);return r.json();
}
test('I01 invitations reveal a secret once, bind membership to the OIDC actor, and preserve existing roles',async()=>{
  const invitation=await invite();assert.match(invitation.token,/^invite_/);
  assert.ok(!(await call('GET',path('invitations'))).body.includes(invitation.token));
  const accepted=await call('POST','/api/v1/invitations/accept',{token:invitation.token},f.bob);assert.equal(accepted.statusCode,200,accepted.body);
  assert.equal(accepted.json().projectId,f.first.id);
  assert.equal((await call('POST','/api/v1/invitations/accept',{token:invitation.token},f.bob)).statusCode,200);
  assert.equal((await call('POST','/api/v1/invitations/accept',{token:invitation.token},f.reader)).statusCode,409);
  const members=(await call('GET',path('members'))).json();assert.equal(members.find((m:{id:string})=>m.id===f.bob.id).role,'editor');
  const readerInvitation=await invite('reader');assert.equal((await call('POST','/api/v1/invitations/accept',{token:readerInvitation.token},f.bob)).statusCode,200);
  assert.equal((await call('GET',path('members'))).json().find((m:{id:string})=>m.id===f.bob.id).role,'editor');
});
test('I02 revoked/expired invitations, non-admin management and cross-project reads fail closed',async()=>{
  const revoked=await invite();assert.equal((await call('DELETE',path('invitations/'+revoked.id))).statusCode,200);
  assert.equal((await call('POST','/api/v1/invitations/accept',{token:revoked.token},f.reader)).statusCode,410);
  const expired=await invite();await f.admin.query("UPDATE auth.project_invitations SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[expired.id]);
  assert.equal((await call('POST','/api/v1/invitations/accept',{token:expired.token},f.reader)).statusCode,410);
  assert.equal((await call('POST',path('invitations'),{id:randomUUID(),role:'admin'},f.reader)).statusCode,403);
  assert.equal((await call('GET',`/api/v1/projects/${f.second.id}/members`)).statusCode,404);
});
test('I03 CAS, last-admin protection and simultaneous demotions leave one human administrator',async()=>{
  const self=await call('PATCH',path('members/'+f.alice.id),{baseRevision:1,role:'reader'});assert.equal(self.statusCode,409);assert.equal(self.json().code,'LAST_ADMIN');
  assert.equal((await call('PATCH',path('members/'+f.bob.id),{baseRevision:1,role:'admin'})).statusCode,200);
  assert.equal((await call('PATCH',path('members/'+f.bob.id),{baseRevision:1,role:'reader'})).statusCode,409);
  const results=await Promise.all([
    call('PATCH',path('members/'+f.alice.id),{baseRevision:1,role:'editor'}),
    call('PATCH',path('members/'+f.bob.id),{baseRevision:2,role:'editor'},f.bob)
  ]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const admins=(await f.admin.query("SELECT principal_id FROM app.project_members WHERE project_id=$1 AND role='admin'",[f.first.id])).rows;assert.equal(admins.length,1);
  // Restore only this fixture to a deterministic state for subsequent access tests.
  await f.admin.query("UPDATE app.project_members SET role='admin' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);
});
test('I04 access removal invalidates existing grants and a revoked inviter cannot recruit',async()=>{
  const current=(await call('GET',path('members'))).json().find((m:{id:string})=>m.id===f.bob.id);
  await call('PATCH',path('members/'+f.bob.id),{baseRevision:current.revision,role:'admin'});
  const grant=await call('POST',path('agents'),{name:'Scoped helper',capabilities:['tasks:read'],expiresInSeconds:600},f.bob);assert.equal(grant.statusCode,200,grant.body);
  const invitation=(await call('POST',path('invitations'),{id:randomUUID(),role:'reader'},f.bob)).json();
  const member=(await call('GET',path('members'))).json().find((m:{id:string})=>m.id===f.bob.id);
  assert.equal((await call('PATCH',path('members/'+f.bob.id),{baseRevision:member.revision,role:null})).statusCode,200);
  assert.equal((await f.app.inject({method:'GET',url:path('tasks'),headers:{authorization:'Bearer '+grant.json().token}})).statusCode,401);
  assert.equal((await call('POST','/api/v1/invitations/accept',{token:invitation.token},f.reader)).statusCode,403);
  assert.equal((await call('GET',path('tasks'),undefined,f.bob)).statusCode,404);
});
test('I05 profile changes are CAS controlled and do not mutate OIDC identity or another actor',async()=>{
  const previous=(await call('GET','/api/v1/profile')).json();
  const updated=await call('PATCH','/api/v1/profile',{baseRevision:previous.revision,name:'Имя в Sprintique'});assert.equal(updated.statusCode,200,updated.body);
  assert.equal((await call('PATCH','/api/v1/profile',{baseRevision:previous.revision,name:'Потерянное изменение'})).statusCode,409);
  assert.equal((await call('GET','/api/v1/session')).json().principal.name,'Имя в Sprintique');
  const stored=(await f.admin.query('SELECT name,profile_name,subject FROM auth.principals WHERE id=$1',[f.alice.id])).rows[0];assert.equal(stored.name,'Алиса');assert.equal(stored.subject,f.alice.id);
  assert.equal((await call('GET','/api/v1/profile',undefined,f.bob)).json().name,'Борис');
});
