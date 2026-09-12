import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const config=JSON.parse(await readFile('output/infra/identity.json','utf8'));
assert.equal(config.origin,'http://localhost:4312');assert.equal(config.issuer,'https://localhost:9443/realms/sprintique');
const jars=new Map();
async function request(url,init={}){
  const origin=new URL(url).origin;assert.ok([config.origin,'https://localhost:9443'].includes(origin));
  const jar=jars.get(origin)||new Map();jars.set(origin,jar);
  const r=await fetch(url,{...init,redirect:'manual',headers:{cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...init.headers}});
  for(const raw of r.headers.getSetCookie()){const item=raw.split(';')[0],at=item.indexOf('=');jar.set(item.slice(0,at),item.slice(at+1));}
  return r;
}
const begin=await request(config.origin+'/auth/login');assert.equal(begin.status,302);
const authUrl=new URL(begin.headers.get('location'));assert.equal(authUrl.origin,'https://localhost:9443');assert.equal(authUrl.searchParams.get('code_challenge_method'),'S256');assert.ok(authUrl.searchParams.get('nonce'));
const form=await request(authUrl),html=await form.text();assert.equal(form.status,200);
const action=html.match(/<form\b[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1]?.replaceAll('&amp;','&');assert.ok(action);
const login=await request(action,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:config.testUser.username,password:config.testUser.password,credentialId:''})});
assert.equal(login.status,302,'Provider must issue an authorization code after real password authentication');
let callbackUrl=new URL(login.headers.get('location'));
if(callbackUrl.origin!==config.origin){
  assert.equal(callbackUrl.pathname,'/realms/sprintique/login-actions/required-action');
  const response=await request(callbackUrl),body=await response.text();assert.equal(response.status,200);
  const fields=[...body.matchAll(/<input[^>]*name="([^"]+)"/g)].map(m=>m[1]).sort();assert.deepEqual(fields,['email','firstName','lastName']);
  const target=body.match(/<form\b[^>]*action="([^"]+)"/)?.[1]?.replaceAll('&amp;','&');assert.ok(target);
  // Normal first-login profile form, reserved .invalid address; no email is sent.
  const completed=await request(target,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'sprintique-qa@example.invalid',firstName:'Sprintique',lastName:'QA'})});
  assert.equal(completed.status,302);callbackUrl=new URL(completed.headers.get('location'));
}
assert.equal(callbackUrl.origin,config.origin);assert.equal(callbackUrl.pathname,'/auth/callback');assert.ok(callbackUrl.searchParams.get('code'));
const callback=await request(callbackUrl);assert.equal(callback.status,302,'API must verify the signed ID token and redeem the code');
const sessionResponse=await request(config.origin+'/api/v1/session');assert.equal(sessionResponse.status,200);const session=await sessionResponse.json();assert.equal(session.principal.kind,'human');assert.ok(session.csrf);
assert.equal((await request(callbackUrl)).status,400,'Browser login state is consumed once');
async function api(path,method='GET',body){const r=await request(config.origin+'/api/v1'+path,{method,headers:{origin:config.origin,'content-type':'application/json','x-csrf-token':session.csrf,'idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,'Authenticated '+path);return r.json();}
let project=session.projects.find(p=>p.slug==='oidc-qa');
if(!project){const workspace=await api('/workspaces','POST',{name:'Локальная QA-команда',timezone:'Europe/Moscow'});project=await api('/projects','POST',{workspaceId:workspace.id,name:'Интеграционная проверка',slug:'oidc-qa',key:'QA'});}
await api('/projects/'+project.id+'/tasks/oidc-smoke','PUT',{baseRevision:(await api('/projects/'+project.id+'/tasks')).items.find(t=>t.id==='oidc-smoke')?.revision||0,task:{title:'Проверка настоящего входа',description:'OIDC → PostgreSQL → серверный контракт.'},createInBoard:true});
const ready=await request(config.origin+'/ready');assert.equal(ready.status,200);
const cookie=jars.get(config.origin).get('__Host-sprintique');assert.ok(cookie);
await writeFile('output/infra/oidc-browser-state.json',JSON.stringify({cookies:[{name:'__Host-sprintique',value:cookie,domain:'localhost',path:'/',expires:Date.now()/1000+28000,httpOnly:true,secure:true,sameSite:'Lax'}],origins:[]}),{mode:0o600});
const evidence={checkedAt:new Date().toISOString(),provider:'Keycloak',issuer:config.issuer,origin:config.origin,checks:['TLS verified using process-local CA','real authorization code + PKCE S256','nonce and signed ID token verified by API','one-use callback rejected on replay','real session + CSRF','project + task persisted with runtime role','database + S3 readiness'],projectId:project.id};
await writeFile('output/infra/oidc-verification.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
