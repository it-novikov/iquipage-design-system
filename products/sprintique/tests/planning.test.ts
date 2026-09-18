import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {TaskInput} from '../contracts/index.js';
import type {Task} from '../contracts/index.js';
import type {PlanningCommand,Preview,Receipt,PlanningRow,Release,ReleaseData} from '../contracts/planning.js';
import {Database} from '../backend/infrastructure/database.js';
import {createApp} from '../backend/http/app.js';
import {PreviewResponse,ReceiptResponse,PlanningPageResponse,ReleaseResponse} from '../contracts/planning-responses.js';
import {recordEvent} from '../backend/application/commands.js';
import {validateTemporal} from '../backend/domain/planning.js';
import {SprintiqueClient} from '../client/api.js';
import {PlanningClient} from '../client/planning.js';
import {ReleasePageResponse,EffectsPageResponse,ConstraintPageResponse,RoadmapPageResponse,HistoryPageResponse,ApprovalResponse,PlanningCapabilitiesResponse} from '../contracts/planning-responses.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'P'});});after(async()=>{await f?.close();});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
const select=(...ids:string[])=>({kind:'tasks' as const,ids});
const content=(task:Task)=>TaskInput.parse(Object.fromEntries(Object.keys(TaskInput.shape).map(key=>[key,task[key as keyof Task]])));
async function request(method:'GET'|'POST'|'PUT',resource:string,payload?:unknown,headers=f.alice.headers,key=randomUUID()){
  return f.app.inject({method,url:path(resource),headers:{...headers,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
}
async function task(id:string,extra:Record<string,unknown>={}){
  const response=await request('PUT','tasks/'+id,{baseRevision:0,task:{title:id,...extra}});assert.equal(response.statusCode,200,response.body);return response.json<Task>();
}
async function release(id:string,extra:Partial<ReleaseData>={}){
  const response=await request('PUT','planning/releases/'+id,{baseRevision:0,value:{name:id,...extra}});assert.equal(response.statusCode,200,response.body);ReleaseResponse.parse(response.json());return response.json<Release>();
}
async function preview(command:PlanningCommand,headers=f.alice.headers){const response=await request('POST','planning/previews',command,headers);assert.equal(response.statusCode,200,response.body);PreviewResponse.parse(response.json());return response.json<Preview>();}
async function apply(command:PlanningCommand){
  const p=await preview(command),response=await request('POST','planning/commands',{planId:p.id,token:p.token});assert.equal(response.statusCode,200,response.body);
  const r=response.json<Receipt>();ReceiptResponse.parse(r);assert.equal(r.status,'committed',response.body);return {preview:p,receipt:r};
}
async function row(id:string){const response=await request('GET','tasks/'+id);assert.equal(response.statusCode,200,response.body);return response.json<Task>();}
async function rows(query=''){const response=await request('GET','planning/tasks'+query);assert.equal(response.statusCode,200,response.body);PlanningPageResponse.parse(response.json());return response.json<{items:PlanningRow[];nextCursor:string|null;total:number}>();}

test('P13 SDK projections validate against live response schemas, including counts, roadmap and approval effects',async()=>{
  const api=new SprintiqueClient(async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
    const headers={...f.alice.headers,...Object.fromEntries(new Headers(init?.headers))};
    const response=await f.app.inject({url,method:(init?.method||'GET') as 'GET'|'PUT'|'POST',headers,...(typeof init?.body==='string'?{payload:init.body}:{})});
    return new Response(response.body,{status:response.statusCode,headers:{'Content-Type':'application/json'}});
  });
  const sdk=new PlanningClient(api,f.first.id);
  PlanningCapabilitiesResponse.parse(await sdk.capabilities());
  const releaseId='sdk-release',created=await sdk.writeRelease(releaseId,0,{name:'SDK',format:'flexible',plannedStart:null,plannedEnd:null,deadline:null},randomUUID());
  ReleaseResponse.parse(created);
  const releasePage=ReleasePageResponse.parse(await sdk.releases());assert.equal(releasePage.items.find(r=>r.id===releaseId)?.counts.total,0);
  const plan=await sdk.preview({kind:'start',releaseId});EffectsPageResponse.parse(await sdk.effects(plan.id));
  const key=randomUUID(),result=await sdk.commit(plan,key);assert.equal(result.status,'committed');assert.deepEqual(await sdk.receipt(key),result);
  const history=HistoryPageResponse.parse(await sdk.history(releaseId));assert.equal(history.snapshots[0]?.kind,'started');assert.equal(history.snapshots[0]?.itemCount,0);
  ConstraintPageResponse.parse(await sdk.constraints());RoadmapPageResponse.parse(await sdk.roadmap({undated:true}));
  const grant=await f.app.inject({method:'POST',url:path('agents'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{name:'SDK Agent',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600}});
  assert.equal(grant.statusCode,200,grant.body);
  const agentHeaders={authorization:'Bearer '+grant.json().token} as unknown as typeof f.alice.headers;
  const agentPreview=await preview({kind:'release.edit',releaseId,value:{name:'SDK proposal',format:'flexible',plannedStart:null,plannedEnd:null,deadline:null}},agentHeaders);
  const approval=ApprovalResponse.parse(await sdk.approval(agentPreview.approvalId!));assert.equal(approval.status,'proposed');assert.equal(approval.application,null);
  EffectsPageResponse.parse(await sdk.approvalEffects(approval.id));
  assert.equal(ApprovalResponse.parse(await sdk.decideApproval(approval.id,approval.revision,'rejected',randomUUID())).status,'rejected');
});

test('P01 same task: draft -> prepare -> release -> start -> authorized board, without resetting work',async()=>{
  await release('launch');const t=await task('flow',{description:'- [ ] Проверить',owner:'Алиса',status:'testing'});assert.equal(t.preparation,'draft');
  assert.equal((await request('GET','board/tasks')).json().total,0);
  await apply({kind:'prepare',selection:select(t.id),preparation:'ready'});
  await apply({kind:'assign',selection:select(t.id),assignment:{mode:'assigned',releaseId:'launch'}});
  assert.equal((await request('GET','board/tasks')).json().total,0);
  await apply({kind:'start',releaseId:'launch'});
  const board=(await request('GET','board/tasks',undefined,f.reader.headers)).json<{items:PlanningRow[]}>();assert.equal(board.items[0]!.id,t.id);
  assert.ok(!('description' in board.items[0]!));assert.equal(board.items[0]!.status,'testing');
  const current=await row(t.id);assert.equal(current.description,t.description);assert.equal(current.owner,t.owner);assert.equal(current.id,t.id);
  assert.equal((await request('GET','tasks/'+t.displayId,undefined,f.reader.headers)).json().id,t.id);
});
test('P02 independent admission preserves state; draft and accepted result are separate',async()=>{
  await task('independent',{status:'in_progress'});
  assert.equal((await request('POST','planning/previews',{kind:'admission',selection:select('independent'),admitted:true})).statusCode,409);
  await apply({kind:'prepare',selection:select('independent'),preparation:'ready'});
  await apply({kind:'admission',selection:select('independent'),admitted:true});
  assert.equal((await rows('?q=independent')).items[0]!.boardEligible,true);
  await apply({kind:'admission',selection:select('independent'),admitted:false});assert.equal((await row('independent')).status,'in_progress');
});
test('P03 inherit and explicit none survive parent transfer and reparent; cycles denied',async()=>{
  await release('next');await task('parent');await task('inherited',{parentId:'parent'});await task('excluded',{parentId:'parent'});
  await apply({kind:'assign',selection:select('inherited'),assignment:{mode:'inherit'}});
  await apply({kind:'assign',selection:select('parent'),assignment:{mode:'assigned',releaseId:'launch'}});
  assert.equal((await rows('?q=inherited')).items[0]!.effectiveReleaseId,'launch');
  assert.equal((await rows('?q=excluded')).items[0]!.effectiveReleaseId,null);
  const p=await preview({kind:'assign',selection:select('parent'),assignment:{mode:'assigned',releaseId:'next'}});
  assert.deepEqual(p.effects.map(e=>e.id).sort(),['inherited','parent']);
  const saved=await request('POST','planning/commands',{planId:p.id,token:p.token});assert.equal(saved.json().status,'committed');
  await apply({kind:'reparent',taskId:'excluded',parentId:'flow'});assert.equal((await rows('?q=excluded')).items[0]!.effectiveReleaseId,null);
  assert.equal((await request('POST','planning/previews',{kind:'reparent',taskId:'parent',parentId:'inherited'})).statusCode,422);
});
test('P04 close pins accepted children, creates and moves remainder atomically, no implicit archive',async()=>{
  await release('closure');await task('epic-close',{type:'epic'});await task('done-child',{parentId:'epic-close',status:'ready_for_release'});
  await apply({kind:'assign',selection:select('done-child'),assignment:{mode:'inherit'}});
  await apply({kind:'assign',selection:select('epic-close'),assignment:{mode:'assigned',releaseId:'closure'}});
  await apply({kind:'prepare',selection:{kind:'release',releaseId:'closure'},preparation:'ready'});await apply({kind:'start',releaseId:'closure'});
  const p=await preview({kind:'close',releaseId:'closure',accepted:select('done-child'),destination:{kind:'new',id:'remainder',value:{name:'Остаток',format:'flexible',plannedStart:null,plannedEnd:null,deadline:null}}});
  const key=randomUUID(),body={planId:p.id,token:p.token};
  const responses=await Promise.all(Array.from({length:4},()=>request('POST','planning/commands',body,f.alice.headers,key)));
  responses.forEach(r=>{assert.equal(r.json().status,'committed',r.body);assert.deepEqual(r.json(),responses[0]!.json());});
  assert.equal((await row('done-child')).releaseId,'closure');assert.equal((await row('done-child')).result,'accepted');
  assert.equal((await rows('?q=epic-close')).items[0]!.effectiveReleaseId,'remainder');
  const closed=(await request('GET','planning/releases')).json().items.find((r:Release)=>r.id==='closure');assert.equal(closed.lifecycle,'closed');assert.equal(closed.archivedAt,null);
  assert.equal((await f.admin.query("SELECT 1 FROM app.releases WHERE project_id=$1 AND id='remainder'",[f.first.id])).rowCount,1);
  await apply({kind:'assign',selection:select('epic-close'),assignment:{mode:'assigned',releaseId:'next'}});
  assert.equal((await rows('?q=done-child')).items[0]!.effectiveReleaseId,'closure');
  const history=(await request('GET','planning/releases/closure/history')).json();assert.ok(history.items.some((i:{kind:string;task:PlanningRow})=>i.kind==='closed'&&i.task.id==='done-child'&&i.task.result==='accepted'));
  const transferred=history.items.find((i:{kind:string;task:PlanningRow})=>i.kind==='closed'&&i.task.id==='epic-close');
  assert.equal(transferred.before.effectiveReleaseId,'closure');assert.equal(transferred.task.effectiveReleaseId,'remainder');assert.equal(transferred.outcome,'transferred');
});
test('P05 persisted preview and lost ACK receipt survive app restart, new key cannot apply plan twice',async()=>{
  const p=await preview({kind:'prepare',selection:select('excluded'),preparation:'ready'}),key=randomUUID(),body={planId:p.id,token:p.token};
  const db=new Database(process.env['DATABASE_URL']!),app=await createApp({db,origin:'http://localhost:4311'});
  try{
    const response=await app.inject({method:'POST',url:path('planning/commands'),headers:{...f.alice.headers,'idempotency-key':key},payload:body});assert.equal(response.json().status,'committed',response.body);
    assert.deepEqual((await request('GET','planning/commands/'+key)).json(),response.json());
    assert.deepEqual((await request('POST','planning/commands',body,f.alice.headers)).json(),response.json());
    assert.equal((await request('POST','planning/commands',{...body,token:'A'.repeat(43)},f.alice.headers,key)).statusCode,409);
    const count=await f.admin.query('SELECT count(*)::int AS count FROM app.audit_events WHERE operation_id=$1',[response.json().operationId]);assert.equal(count.rows[0]!.count,1);
  }finally{await app.close();await db.close();}
});
test('P06 stale preview is a durable rejection; no cross-tenant preview/receipt disclosure',async()=>{
  const p=await preview({kind:'prepare',selection:select('excluded'),preparation:'draft'});
  const t=await row('excluded');await request('PUT','tasks/'+t.id,{baseRevision:t.revision,task:{...content(t),title:'Изменено'}});
  const body={planId:p.id,token:p.token},key=randomUUID(),response=await request('POST','planning/commands',body,f.alice.headers,key);
  assert.equal(response.json().status,'rejected');assert.equal(response.json().error.code,'PLAN_STALE');
  assert.deepEqual((await request('GET','planning/commands/'+key)).json(),response.json());
  for(const resource of ['planning/tasks','planning/releases','planning/previews/'+p.id+'/effects','planning/commands/'+key]){
    const denied=await request('GET',resource,undefined,f.bob.headers);assert.equal(denied.statusCode,404);assert.ok(!denied.body.includes('excluded'));
  }
  assert.equal((await request('POST','planning/previews',{kind:'prepare',selection:select('excluded'),preparation:'ready'},f.reader.headers)).statusCode,403);
});
test('P07 direct task, release lifecycle and admission writes cannot bypass Planning',async()=>{
  const t=await row('flow'),input=content(t);
  const changed=await request('PUT','tasks/'+t.id,{baseRevision:t.revision,task:{...input,releaseId:'next'}});assert.equal(changed.statusCode,409);assert.equal(changed.json().action.kind,'planning-preview');
  assert.equal((await request('PUT','tasks/'+t.id,{baseRevision:t.revision,task:{...input,admitted:true}})).statusCode,400);
  assert.equal((await request('PUT','tasks/'+t.id,{baseRevision:t.revision,createInBoard:true,task:input})).statusCode,400);
  const r=(await request('GET','planning/releases')).json().items.find((r:Release)=>r.id==='launch');
  assert.equal((await request('PUT','releases/launch',{baseRevision:r.revision,value:{name:'No',status:'released'}})).statusCode,409);
  const saved=await request('PUT','tasks/'+t.id,{baseRevision:t.revision,task:{...input,title:'Тот же объект'}});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().preparation,'ready');
});
test('P08 compact filtered pages bind cursors to query and revision',async()=>{
  const page=await rows('?limit=1');assert.ok(page.nextCursor);assert.ok(!('description' in page.items[0]!));
  assert.equal((await request('GET','planning/tasks?limit=1&q=x&cursor='+page.nextCursor)).statusCode,400);
  const next=await rows('?limit=1&cursor='+page.nextCursor);assert.notEqual(next.items[0]!.id,page.items[0]!.id);
  await task('cursor-change');assert.equal((await request('GET','planning/tasks?limit=1&cursor='+page.nextCursor)).statusCode,409);
});
test('P09 date ranges, timeboxes, temporal conflict and cycle detection, without auto-shift',async()=>{
  assert.equal((await request('PUT','planning/releases/bad-date',{baseRevision:0,value:{name:'Bad',format:'timeboxed'}})).statusCode,400);
  assert.equal((await request('PUT','planning/releases/bad-date',{baseRevision:0,value:{name:'Bad',plannedStart:'2026-02-30'}})).statusCode,400);
  await release('dated',{format:'timeboxed',plannedStart:'2026-09-01',plannedEnd:'2026-09-10'});
  assert.equal((await request('PUT','planning/milestones/gate',{baseRevision:0,value:{title:'Gate',date:'2026-09-11'}})).statusCode,200);
  const constraint={source:{kind:'release',id:'dated'},target:{kind:'milestone',id:'gate'},relation:'FS',lagDays:1};
  assert.equal((await request('PUT','planning/constraints/dependency',{baseRevision:0,value:constraint})).statusCode,200);
  assert.equal((await request('PUT','planning/milestones/gate',{baseRevision:1,value:{title:'Gate',date:'2026-09-09'}})).statusCode,409);
  const cyc=await request('PUT','planning/constraints/cycle',{baseRevision:0,value:{source:constraint.target,target:constraint.source,relation:'SS',lagDays:-100}});assert.equal(cyc.statusCode,422,cyc.body);
  const roadmap=(await request('GET','planning/roadmap?from=2026-09-01&to=2026-09-30&undated=false')).json();assert.equal(roadmap.timezone,'UTC');assert.equal(roadmap.items.find((i:{id:string})=>i.id==='gate').start,'2026-09-11');
});
test('P10 agent proposal requires a human action-bound approval, not execution or self-approval',async()=>{
  const issued=await request('POST','agents',{name:'Planning agent',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600});assert.equal(issued.statusCode,200,issued.body);
  const headers={authorization:'Bearer '+issued.json().token} as unknown as typeof f.alice.headers;
  const p=await preview({kind:'prepare',selection:select('cursor-change'),preparation:'ready'},headers);assert.equal(p.requiresApproval,true);
  assert.equal((await row('cursor-change')).preparation,'draft');
  const body={planId:p.id,token:p.token};
  assert.equal((await request('POST','planning/commands',body,headers)).json().error.code,'APPROVAL_REQUIRED');
  assert.equal((await request('POST','approvals/'+p.approvalId+'/decision',{baseRevision:1,status:'approved'},headers)).statusCode,403);
  assert.equal((await request('GET','approvals/'+p.approvalId)).json().actionHash,p.actionHash);
  assert.equal((await request('POST','approvals/'+p.approvalId+'/decision',{baseRevision:1,status:'approved'})).statusCode,200);
  assert.equal((await row('cursor-change')).preparation,'draft');
  const done=await request('POST','planning/commands',body,headers);assert.equal(done.json().status,'committed',done.body);assert.equal((await row('cursor-change')).preparation,'ready');
});
test('P11 failure writing outbox rolls back closure, recipient, tasks, history and receipt',async()=>{
  await release('fail-close');await task('fail-remainder');await apply({kind:'assign',selection:select('fail-remainder'),assignment:{mode:'assigned',releaseId:'fail-close'}});await apply({kind:'start',releaseId:'fail-close'});
  const p=await preview({kind:'close',releaseId:'fail-close',accepted:select(),destination:{kind:'new',id:'fail-recipient',value:{name:'Retry',format:'flexible',plannedStart:null,plannedEnd:null,deadline:null}}}),body={planId:p.id,token:p.token},key=randomUUID();
  await f.admin.query(`CREATE FUNCTION public.fail_planning_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.topic='release.closed' AND NEW.payload->>'resourceId'='fail-close' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER planning_outbox_failure BEFORE INSERT ON app.outbox FOR EACH ROW EXECUTE FUNCTION public.fail_planning_outbox()`);
  try{
    assert.equal((await request('POST','planning/commands',body,f.alice.headers,key)).statusCode,503);
    assert.equal((await f.admin.query("SELECT 1 FROM app.releases WHERE project_id=$1 AND id='fail-recipient'",[f.first.id])).rowCount,0);
    assert.equal((await row('fail-remainder')).releaseId,'fail-close');assert.equal((await request('GET','planning/commands/'+key)).statusCode,404);
  }finally{await f.admin.query('DROP TRIGGER planning_outbox_failure ON app.outbox; DROP FUNCTION public.fail_planning_outbox()');}
  assert.equal((await request('POST','planning/commands',body,f.alice.headers,key)).json().status,'committed');
});

test('P08 large release uses server selector, paged preview and atomic finalization above explicit batch bound',async()=>{
  await release('large');await task('large-root');
  const ids=Array.from({length:205},(_,i)=>'large-child-'+i);
  for(let i=0;i<ids.length;i+=10)await Promise.all(ids.slice(i,i+10).map(id=>task(id,{parentId:'large-root'})));
  for(let i=0;i<ids.length;i+=200)await apply({kind:'assign',selection:select(...ids.slice(i,i+200)),assignment:{mode:'inherit'}});
  await apply({kind:'assign',selection:select('large-root'),assignment:{mode:'assigned',releaseId:'large'}});
  assert.equal((await request('POST','planning/previews',{kind:'prepare',selection:select(...ids),preparation:'ready'})).statusCode,400);
  const p=await preview({kind:'prepare',selection:{kind:'release',releaseId:'large'},preparation:'ready'});
  assert.equal(p.selectedCount,206);assert.equal(p.affectedCount,206);assert.equal(p.effects.length,100);assert.ok(p.nextCursor);
  const second=(await request('GET',`planning/previews/${p.id}/effects?limit=100&cursor=${p.nextCursor}`)).json();assert.equal(second.items.length,100);assert.ok(second.nextCursor);
  const third=(await request('GET',`planning/previews/${p.id}/effects?limit=100&cursor=${second.nextCursor}`)).json();assert.equal(third.items.length,6);assert.equal(third.nextCursor,null);
  const response=await request('POST','planning/commands',{planId:p.id,token:p.token});assert.equal(response.json().status,'committed',response.body);
  assert.equal((await rows('?releaseId=large&preparation=ready')).total,206);
});
test('P06 expiry, credential revocation and initiator loss prevent an already prepared command',async()=>{
  const expired=await preview({kind:'prepare',selection:select('independent'),preparation:'draft'});
  await f.admin.query("UPDATE app.planning_plans SET expires_at=now()-interval '1 second' WHERE project_id=$1 AND id=$2",[f.first.id,expired.id]);
  const response=await request('POST','planning/commands',{planId:expired.id,token:expired.token});assert.equal(response.json().error.code,'PLAN_EXPIRED');
  const p=await preview({kind:'prepare',selection:select('independent'),preparation:'draft'});
  await f.admin.query('UPDATE auth.credentials SET revoked_at=now() WHERE id=$1',[f.alice.credential]);
  try{assert.equal((await request('POST','planning/commands',{planId:p.id,token:p.token})).statusCode,401);}
  finally{await f.admin.query('UPDATE auth.credentials SET revoked_at=NULL WHERE id=$1',[f.alice.credential]);}
  const issued=await request('POST','agents',{name:'Lost mandate',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600});
  const headers={authorization:'Bearer '+issued.json().token} as unknown as typeof f.alice.headers;
  const agentPlan=await preview({kind:'prepare',selection:select('independent'),preparation:'draft'},headers);
  await request('POST','approvals/'+agentPlan.approvalId+'/decision',{baseRevision:1,status:'approved'});
  await f.admin.query("UPDATE app.project_members SET role='reader' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);
  try{assert.equal((await request('POST','planning/commands',{planId:agentPlan.id,token:agentPlan.token},headers)).statusCode,403);}
  finally{await f.admin.query("UPDATE app.project_members SET role='admin' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);}
});
test('P05 racing independently prepared commands have one winner, one stale receipt',async()=>{
  const a=await preview({kind:'prepare',selection:select('independent'),preparation:'draft'}),b=await preview({kind:'prepare',selection:select('independent'),preparation:'draft'});
  const responses=await Promise.all([a,b].map(p=>request('POST','planning/commands',{planId:p.id,token:p.token})));
  assert.deepEqual(responses.map(r=>r.json().status).sort(),['committed','rejected']);
  assert.equal(responses.find(r=>r.json().status==='rejected')!.json().error.code,'PLAN_STALE');
});
test('P07 compact board position command never overwrites Markdown, tags, owner or hierarchy',async()=>{
  const response=await request('PUT','tasks/from-board',{baseRevision:0,createInBoard:true,task:{title:'Board',description:'## Сохрани меня',owner:'Алиса',rank:4096}});
  assert.equal(response.statusCode,200,response.body);const original=response.json<Task>();
  const move=await f.app.inject({method:'PATCH',url:path('tasks/from-board/position'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:1,status:'testing',rank:8192}});
  assert.equal(move.statusCode,200,move.body);const saved=move.json<Task>();assert.equal(saved.description,original.description);assert.equal(saved.owner,original.owner);assert.equal(saved.rank,8192);assert.equal(saved.status,'testing');
  assert.equal((await request('GET','board/tasks?q=Board')).json().items[0].rank,8192);
});
test('P10 approval rejection, wrong plan token and stale approval never execute agent intent',async()=>{
  const issued=await request('POST','agents',{name:'Approval states',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600});
  const headers={authorization:'Bearer '+issued.json().token} as unknown as typeof f.alice.headers;
  const p=await preview({kind:'prepare',selection:select('from-board'),preparation:'draft'},headers);
  const effects=await request('GET','approvals/'+p.approvalId+'/effects');assert.equal(effects.json().items[0].after.preparation,'draft');
  await request('POST','approvals/'+p.approvalId+'/decision',{baseRevision:1,status:'rejected'});
  assert.equal((await request('POST','planning/commands',{planId:p.id,token:p.token},headers)).json().error.code,'APPROVAL_REQUIRED');
  const a=await preview({kind:'prepare',selection:select('from-board'),preparation:'draft'},headers);
  await request('POST','approvals/'+a.approvalId+'/decision',{baseRevision:1,status:'approved'});
  assert.equal((await request('POST','planning/commands',{planId:a.id,token:'A'.repeat(43)},headers)).json().error.code,'PLAN_FORBIDDEN');
  await task('stale-approval-marker');
  assert.equal((await request('POST','planning/commands',{planId:a.id,token:a.token},headers)).json().error.code,'PLAN_STALE');
  assert.equal((await row('from-board')).preparation,'ready');
});
test('P12 durable event pages reconnect after a committed change and enforce project/grant boundaries',async()=>{
  let cursor:string|undefined;let count=0,correlated=0;
  for(;;){const p=(await request('GET','events'+(cursor?'?cursor='+cursor:''))).json();count+=p.items.length;
    for(const e of p.items)if(e.operationId){assert.equal(e.correlationId,e.operationId);assert.equal(e.causationId,e.operationId);correlated++;}
    cursor=p.cursor;if(!p.hasMore)break;}
  assert.ok(count>0);assert.ok(correlated>0);await task('event-task');
  const fresh=(await request('GET','events?cursor='+cursor)).json();assert.equal(fresh.items.length,1);assert.equal(fresh.items[0].resourceId,'event-task');
  assert.ok(!JSON.stringify(fresh).includes('description'));
  assert.equal((await request('GET','events',undefined,f.bob.headers)).statusCode,404);
  const issued=await request('POST','agents',{name:'Task feed only',capabilities:['tasks:read'],expiresInSeconds:600});
  const headers={authorization:'Bearer '+issued.json().token} as unknown as typeof f.alice.headers;
  await request('POST','tasks/event-task/threads',{id:'hidden-thread',messageId:'hidden-message',body:'Private to discussion grant',requiresResolution:false});
  const page=(await request('GET','events?cursor='+fresh.cursor,undefined,headers)).json();assert.equal(page.items.length,0);
  const threadGrant=await request('POST','agents',{name:'Thread feed only',capabilities:['threads:read'],expiresInSeconds:600});
  const threadHeaders={authorization:'Bearer '+threadGrant.json().token} as unknown as typeof f.alice.headers;
  const threadPage=(await request('GET','events?cursor='+fresh.cursor,undefined,threadHeaders)).json();assert.equal(threadPage.items.length,1);assert.ok(threadPage.items.every((e:{topic:string})=>e.topic.startsWith('thread.')));
});
test('P12 SSE transmits changes, then stops and requires cache eviction after credential revocation',async()=>{
  const db=new Database(process.env['DATABASE_URL']!),app=await createApp({db,origin:'http://localhost:4311'});
  const address=await app.listen({port:0,host:'127.0.0.1'}),controller=new AbortController();
  try{
    let cursor:string|undefined;for(;;){const p=(await request('GET','events'+(cursor?'?cursor='+cursor:''))).json();cursor=p.cursor;if(!p.hasMore)break;}
    const response=await fetch(address+path('events?stream=true&cursor='+cursor),{headers:f.alice.headers,signal:controller.signal});assert.equal(response.status,200);
    const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';
    async function until(text:string){const deadline=Date.now()+8000;while(!buffer.includes(text)){
      assert.ok(Date.now()<deadline,'SSE event deadline');const result=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('SSE timeout')),8000);t.unref();})]);
      if(result.done)break;buffer+=decoder.decode(result.value);
    }assert.ok(buffer.includes(text),buffer);}
    await task('sse-task');await until('sse-task');assert.ok(buffer.includes('event: change'));
    await f.admin.query('UPDATE auth.credentials SET revoked_at=now() WHERE id=$1',[f.alice.credential]);
    await until('access-revoked');assert.ok(buffer.includes('"clearCache":true'));
    reader.releaseLock();
  }finally{controller.abort();await f.admin.query('UPDATE auth.credentials SET revoked_at=NULL WHERE id=$1',[f.alice.credential]);await app.close();await db.close();}
});
test('P12 event cursor cannot skip a transaction that commits late',async()=>{
  let beforeCursor:string|undefined;for(;;){const p=(await request('GET','events'+(beforeCursor?'?cursor='+beforeCursor:''))).json();beforeCursor=p.cursor;if(!p.hasMore)break;}
  let entered!:()=>void,release!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
  const first=f.db.authenticated({token:f.alice.token,kind:'session'},async(tx,actor)=>{
    await recordEvent(tx,actor,f.first.id,'task.test','late-event',1);entered();await barrier;
  });
  await ready;
  const second=request('PUT','tasks/after-late-event',{baseRevision:0,task:{title:'After late commit'}});
  try{assert.equal((await request('GET','events?cursor='+beforeCursor)).json().items.length,0);}
  finally{release();}
  await first;assert.equal((await second).statusCode,200);
  const events=(await request('GET','events?cursor='+beforeCursor)).json().items;
  assert.deepEqual(events.map((e:{resourceId:string})=>e.resourceId),['late-event','after-late-event']);
});
test('P13 static response schemas are exposed and timezone input is validated',async()=>{
  const contract=await f.app.inject({url:'/api/v1/contracts',headers:f.alice.headers});assert.equal(contract.statusCode,200,contract.body);
  assert.equal(contract.json().version,2);assert.ok(contract.json().schemas.PreviewResponse);assert.ok(contract.json().schemas.ReceiptResponse);
  const bad=await f.app.inject({method:'POST',url:'/api/v1/workspaces',headers:f.alice.headers,payload:{name:'Bad timezone',timezone:'Mars/Unknown'}});assert.equal(bad.statusCode,400);
  const created=await f.app.inject({method:'POST',url:'/api/v1/workspaces',headers:f.alice.headers,payload:{name:'Timezone',timezone:'Europe/Moscow'}});assert.equal(created.statusCode,200,created.body);
  const project=await f.app.inject({method:'POST',url:'/api/v1/projects',headers:f.alice.headers,payload:{workspaceId:created.json().id,name:'Timezone',slug:'timezone-r2',key:'TZ'}});assert.equal(project.statusCode,200,project.body);
  const caps=await f.app.inject({url:`/api/v1/projects/${project.json().id}/planning/capabilities`,headers:f.alice.headers});assert.equal(caps.json().timezone,'Europe/Moscow');
});
test('P09 temporal relations use the correct start/end endpoints and inclusive day boundaries',()=>{
  const dates=(id:string,start:string,end:string):Release=>({id,projectId:'test',name:id,revision:1,scopeRevision:0,lifecycle:'planned',format:'flexible',plannedStart:start,plannedEnd:end,deadline:null,archivedAt:null});
  for(const [relation,boundary] of [['FS',-4],['SS',5],['FF',2],['SF',11]] as const){
    const state={tasks:[],releases:[dates('a','2026-09-01','2026-09-10'),dates('b','2026-09-06','2026-09-12')],milestones:[],
      constraints:[{id:'edge',revision:1,source:{kind:'release' as const,id:'a'},target:{kind:'release' as const,id:'b'},relation,lagDays:Number(boundary)}]};
    assert.doesNotThrow(()=>validateTemporal(state));state.constraints[0]!.lagDays=boundary+1;
    assert.throws(()=>validateTemporal(state),/Даты противоречат зависимости/);
  }
});
