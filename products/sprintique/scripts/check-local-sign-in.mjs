import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {STAND_ROOT as root,latestLetter,newestLetterId,readStand} from './stand-config.mjs';
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
const previous=await newestLetterId(stand,email);
// Reruns of this check are limited like any client: the synthetic address's earlier codes are cleared on the owned
// stand first, so neither the 30-second pause nor the hourly or daily limit fails a repeated run.
const admin=new pg.Client({host:'127.0.0.1',port:stand.database.port,user:'postgres',password:stand.database.admin,database:'sprintique'});
await admin.connect();try{await admin.query('DELETE FROM auth.email_challenges WHERE email=$1',[email]);}finally{await admin.end();}
const started=await post('/auth/email/start',{email});
assert.equal(started.status,200,'A code is sent');
const challenge=jar.get('__Host-sprintique-email');assert.ok(challenge,'The browser keeps the challenge');
const letter=await latestLetter(stand,email,previous);
const code=letter.Text.match(/код для входа в Sprintique: (\d{6})/)?.[1];assert.ok(code,'The letter carries a six-digit code');
assert.equal((await post('/auth/email/verify',{code:code==='000000'?'111111':'000000'})).status,400,'A wrong code is refused');
assert.equal((await post('/auth/email/verify',{code})).status,200,'The right code opens a session');
// The same code with the same challenge cookie again: spent.
jar.set('__Host-sprintique-email',challenge);
const again=await post('/auth/email/verify',{code});assert.equal(again.status,400);assert.equal((await again.json()).code,'EMAIL_CODE_EXPIRED','A code is spent once');
const session=await (await request('/api/v1/session')).json();assert.equal(session.principal.kind,'human');assert.ok(session.csrf);
async function api(path,method='GET',body){const r=await request('/api/v1'+path,{method,headers:{'content-type':'application/json','x-csrf-token':session.csrf,'idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});if(r.status!==200)assert.fail(`${method} ${path}: ${r.status} ${await r.text()}`);return r.json();}
let project=session.projects.find(p=>p.slug==='stand-qa');
if(!project){const workspace=await api('/workspaces','POST',{name:'Локальная QA-команда',timezone:'Europe/Moscow'});project=await api('/projects','POST',{workspaceId:workspace.id,name:'Проверка стенда',slug:'stand-qa',key:'QA'});}
// A private file on the task: the restore drill proves restored files are served to this session.
const note=Buffer.from('Файл проверки стенда: вход по почте → S3.'),base='/projects/'+project.id;
if((await request('/api/v1'+base+'/assets/stand-note')).status===404){
  await api(base+'/assets','POST',{id:'stand-note',name:'stand-note.md',targetType:'task',targetId:'stand-smoke',size:note.length,sha256:createHash('sha256').update(note).digest('hex')});
  const uploaded=await request('/api/v1'+base+'/assets/stand-note/content',{method:'PUT',headers:{'content-type':'application/octet-stream','x-csrf-token':session.csrf},body:note});
  assert.equal(uploaded.status,200,'The note file is stored');
}
// Repeatable: the task is created on the board once, then updated in place.
const revision=(await api(base+'/tasks')).items.find(t=>t.id==='stand-smoke')?.revision||0;
await api(base+'/tasks/stand-smoke','PUT',{baseRevision:revision,task:{title:'Проверка входа по почте',description:'Код из письма → сессия → PostgreSQL.',attachmentIds:['stand-note']},...(revision?{}:{createInBoard:true})});
assert.equal((await request('/ready')).status,200);
const cookie=jar.get('__Host-sprintique');assert.ok(cookie);
await writeFile(root+'/browser-state.json',JSON.stringify({cookies:[{name:'__Host-sprintique',value:cookie,domain:'localhost',path:'/',expires:Date.now()/1000+28000,httpOnly:true,secure:true,sameSite:'Lax'}],origins:[]}),{mode:0o600});
const evidence={checkedAt:new Date().toISOString(),method:'email code over SMTP',origin:stand.origin,checks:['letter delivered through the SMTP relay','wrong code refused','right code opens a session','code spent once','session + CSRF','project + task + private file persisted with runtime role','database + S3 readiness'],projectId:project.id};
await writeFile(root+'/sign-in-verification.json',JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify(evidence));
