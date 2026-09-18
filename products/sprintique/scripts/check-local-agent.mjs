import {readFile,writeFile,chmod} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root='output/infra',identity=JSON.parse(await readFile(root+'/identity.json','utf8'));
if(identity.origin!=='http://localhost:4312')throw Error('This QA script only targets the isolated local reference');
const state=JSON.parse(await readFile(root+'/oidc-browser-state.json','utf8'));
const cookie=state.cookies.find(c=>c.name==='__Host-sprintique');if(!cookie)throw Error('Run local OIDC verification first');
let csrf;
async function call(path,method='GET',body,token){
  const headers={Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{Cookie:cookie.name+'='+cookie.value,Origin:identity.origin,...(csrf?{'X-CSRF-Token':csrf}:{})}),...(body?{'Content-Type':'application/json'}:{}),'Idempotency-Key':randomUUID()};
  const r=await fetch(identity.origin+'/api/v1'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error('Local QA '+r.status+' '+value.code);return value;
}
const session=await call('/session');csrf=session.csrf;
const project=session.projects.find(p=>p.slug==='oidc-qa');if(!project)throw Error('Create the isolated OIDC QA project first');
const base='/projects/'+project.id;
if(process.argv.includes('--complete')){
  const pending=JSON.parse(await readFile(root+'/agent-qa.json','utf8'));
  const approval=await call(base+'/approvals/'+pending.approvalId);if(approval.status!=='approved')throw Error('The exact proposal must be approved in the QA UI first');
  const result=await call(base+'/agent-runs/'+pending.runId+'/commit','POST',{baseRevision:2,plan:{planId:pending.planId,token:pending.seal}},pending.token);
  if(result.receipt.status!=='committed')throw Error('Proposal did not commit: '+result.receipt.error?.code);
  const finished=await call(base+'/agent-runs/'+pending.runId+'/finish','POST',{baseRevision:3,state:'completed'},pending.token);
  await call(base+'/agents/'+pending.credentialId,'DELETE');
  // Persist evidence without a credential or preview seal after the grant is revoked.
  await writeFile(root+'/agent-qa.json',JSON.stringify({date:new Date().toISOString(),projectId:project.id,runId:pending.runId,approvalId:pending.approvalId,receipt:result.receipt,state:finished.state,grantRevoked:true},null,2),{mode:0o600});
  console.log('PASS: real human approval -> exact committed receipt -> completed run -> grant revoked.');
}else{
  try{const previous=JSON.parse(await readFile(root+'/agent-qa.json','utf8'));if(previous.token)throw Error('An existing QA proposal must be completed or explicitly cancelled first');}catch(error){if(error.code!=='ENOENT')throw error;}
  const grant=await call(base+'/agents','POST',{name:'Агент проверки интеграции',capabilities:['tasks:read','tasks:write'],expiresInSeconds:3600});
  const run=await call(base+'/agent-runs','POST',{id:randomUUID(),goal:'Проверить подтверждение человеком в интерфейсе',maxProposals:1,expiresInSeconds:3600},grant.token);
  const task=await call(base+'/tasks/oidc-smoke');
  const proposal=await call(base+'/agent-runs/'+run.id+'/proposals','POST',{baseRevision:1,command:{kind:'bulk',selection:{kind:'tasks',ids:[task.id]},fields:{priority:task.priority==='high'?'normal':'high'}}},grant.token);
  await writeFile(root+'/agent-qa.json',JSON.stringify({runId:run.id,credentialId:grant.credentialId,token:grant.token,planId:proposal.preview.id,seal:proposal.preview.token,approvalId:proposal.preview.approvalId}),{mode:0o600,flag:'w'});await chmod(root+'/agent-qa.json',0o600);
  console.log('QA proposal prepared. Review it in project settings -> agents. Secrets are mode 0600; none were logged.');
}
