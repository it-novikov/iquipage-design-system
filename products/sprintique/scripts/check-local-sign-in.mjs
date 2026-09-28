import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {STAND_ROOT as root,latestLetter,readStand} from './stand-config.mjs';
// Signs in to the running local reference stand the way a person does: a code by e-mail through the real SMTP relay,
// then a project and a task on the runtime role. Leaves a browser state for the container check, the agent check and
// the restore drill.
const stand=await readStand();
assert.equal(stand.origin,'http://localhost:4312');
const email='sprintique-qa@example.invalid',jar=new Map();
async function request(path,init={}){
  const response=await fetch(stand.origin+path,{...init,redirect:'manual',headers:{origin:stand.origin,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...init.headers}});
  for(const raw of response.headers.getSetCookie()){const item=raw.split(';')[0],at=item.indexOf('=');jar.set(item.slice(0,at),item.slice(at+1));}
  return response;
}
const post=(path,body)=>request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const methods=await (await request('/api/v1/auth/methods')).json();assert.equal(methods.email,true,'The stand must offer sign-in by e-mail');
assert.equal((await post('/auth/email/start',{email})).status,200);
const letter=await latestLetter(stand,email);
const code=letter.Text.match(/код для входа в Sprintique: (\d{6})/)?.[1];assert.ok(code,'The letter carries a six-digit code');
assert.equal((await post('/auth/email/verify',{code:code==='000000'?'111111':'000000'})).status,400,'A wrong code is refused');
assert.equal((await post('/auth/email/verify',{code})).status,200,'The right code opens a session');
assert.equal((await post('/auth/email/verify',{code})).status,400,'A code is spent once');
const session=await (await request('/api/v1/session')).json();assert.equal(session.principal.kind,'human');assert.ok(session.csrf);
async function api(path,method='GET',body){const r=await request('/api/v1'+path,{method,headers:{'content-type':'application/json','x-csrf-token':session.csrf,'idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,'Authenticated '+path);return r.json();}
let project=session.projects.find(p=>p.slug==='stand-qa');
if(!project){const workspace=await api('/workspaces','POST',{name:'Локальная QA-команда',timezone:'Europe/Moscow'});project=await api('/projects','POST',{workspaceId:workspace.id,name:'Проверка стенда',slug:'stand-qa',key:'QA'});}
await api('/projects/'+project.id+'/tasks/stand-smoke','PUT',{baseRevision:(await api('/projects/'+project.id+'/tasks')).items.find(t=>t.id==='stand-smoke')?.revision||0,task:{title:'Проверка входа по почте',description:'Код из письма → сессия → PostgreSQL.'},createInBoard:true});
assert.equal((await request('/ready')).status,200);
const cookie=jar.get('__Host-sprintique');assert.ok(cookie);
await writeFile(root+'/browser-state.json',JSON.stringify({cookies:[{name:'__Host-sprintique',value:cookie,domain:'localhost',path:'/',expires:Date.now()/1000+28000,httpOnly:true,secure:true,sameSite:'Lax'}],origins:[]}),{mode:0o600});
const evidence={checkedAt:new Date().toISOString(),method:'email code over SMTP',origin:stand.origin,checks:['letter delivered through the SMTP relay','wrong code refused','right code opens a session','code spent once','session + CSRF','project + task persisted with runtime role','database + S3 readiness'],projectId:project.id};
await writeFile(root+'/sign-in-verification.json',JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify(evidence));
