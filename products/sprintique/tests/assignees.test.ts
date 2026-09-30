import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {fixture} from './fixture.js';
import type {Task} from '../contracts/index.js';

// SPR-7: a service account of the project may own a task, so work can be handed to an agent. The interface answers on
// http://127.0.0.1:<port> and the API (REST and MCP for the account's token) on http://localhost:<port>.
let f:Awaited<ReturnType<typeof fixture>>,ui:string,api:string;
const freePort=()=>new Promise<number>((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const {port}=probe.address() as {port:number};probe.close(()=>resolve(port));});});
before(async()=>{const port=await freePort();ui=`http://127.0.0.1:${port}`;api=`http://localhost:${port}`;
  f=await fixture({prefix:'ASG',port,appOrigin:ui,settings:{SPRINTIQUE_API_ORIGIN:api}});});
after(async()=>{await f?.close();});

type User=Awaited<ReturnType<typeof fixture>>['alice'];
const call=(user:User,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',url:string,payload?:unknown)=>f.app.inject({method,url:ui+url,
  headers:{...user.headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
const project=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
async function account(user:User,name:string,role:'reader'|'editor',projectId=f.first.id,workspaceId=f.first.workspaceId){
  const r=await call(user,'POST','/api/v1/service-accounts',{name,workspaceId,projects:[{projectId,role}]});
  assert.equal(r.statusCode,200,r.body);return r.json<{id:string;revision:number}>();
}
const put=(id:string,task:Record<string,unknown>,baseRevision=0,user=f.alice)=>call(user,'PUT',project('tasks/'+id),{baseRevision,task:{title:id,...task}});
async function saved(id:string,task:Record<string,unknown>,baseRevision=0){const r=await put(id,task,baseRevision);assert.equal(r.statusCode,200,r.body);return r.json<Task>();}
async function read(id:string){const r=await call(f.alice,'GET',project('tasks/'+id));assert.equal(r.statusCode,200,r.body);return r.json<Task>();}
function refused(r:Awaited<ReturnType<typeof put>>,message:RegExp){assert.equal(r.statusCode,422,r.body);assert.equal(r.json().code,'TASK_OWNER');assert.match(r.json().message,message);}
async function ownerOptions(query=''){
  const r=await call(f.alice,'POST',project('planning/view/options'),{kind:'owner',query});assert.equal(r.statusCode,200,r.body);
  return r.json<{options:{value:string;label:string;description?:string;disabled?:boolean}[]}>().options;
}
async function planningLabel(taskId:string){
  const groups=(await call(f.alice,'POST',project('planning/view/groups'),{query:taskId})).json();
  const page=(await call(f.alice,'POST',project('planning/view/rows'),{groupId:'backlog',revision:groups.revision,query:taskId})).json();
  return page.rows.find((row:{taskId:string})=>row.taskId===taskId)?.ownerLabel;
}

test('A01 an editing service account of the project owns tasks; others are refused in plain words; unassigning always works',async()=>{
  const robot=await account(f.alice,'Робот','editor');
  const task=await saved('asg-robot',{ownerId:robot.id});
  assert.equal(task.ownerId,robot.id);assert.equal(task.ownerName,'Робот');assert.equal(task.ownerKind,'service');assert.equal(task.ownerState,'active');
  const person=await saved('asg-person',{ownerId:f.alice.id});assert.equal(person.ownerKind,'human');assert.equal(person.ownerState,'active');
  assert.equal((await saved('asg-nobody',{})).ownerState,null);
  // Who may not own a task: an account that only reads, an account of another project, a person from outside.
  const reading=await account(f.reader,'Читатель','reader');
  refused(await put('asg-reader',{ownerId:reading.id}),/редактировать задачи/);
  const foreign=await account(f.bob,'Чужой','editor',f.second.id,f.second.workspaceId);
  // An account of another workspace reads as any stranger: nothing about it is told.
  refused(await put('asg-foreign',{ownerId:foreign.id}),/^Исполнителем может быть только участник проекта\.$/);
  refused(await put('asg-stranger',{ownerId:f.bob.id}),/только участник проекта/);
  // The author's Workbench names the owner as a service account.
  const workbench=await call(f.alice,'GET','/api/v1/workbench?mode=now&projects='+f.first.id);assert.equal(workbench.statusCode,200,workbench.body);
  assert.ok(workbench.body.includes('"name":"Робот (сервисный аккаунт)"'),workbench.body.slice(0,2000));
  // Planning assigns through the same rule.
  const preview=(owner:string|null)=>call(f.alice,'POST',project('planning/previews'),{kind:'bulk',selection:{kind:'tasks',ids:[person.id]},fields:{ownerId:owner}});
  assert.equal((await preview(reading.id)).json().code,'TASK_OWNER');
  const plan=(await preview(robot.id)).json();assert.ok(plan.id,JSON.stringify(plan));
  const committed=(await call(f.alice,'POST',project('planning/commands'),{planId:plan.id,token:plan.token})).json();assert.equal(committed.status,'committed');
  assert.equal((await read(person.id)).ownerId,robot.id);
  // The history names who assigned it: the person, through the session.
  const audit=(await f.admin.query("SELECT actor_id,credential_kind FROM app.audit_events WHERE project_id=$1 AND resource_id=$2 ORDER BY created_at",[f.first.id,task.id])).rows;
  assert.deepEqual(audit.map(row=>[row.actor_id,row.credential_kind]),[[f.alice.id,'session']]);
});

test('A02 owner pickers list service accounts apart, under their heading, with their owner',async()=>{
  const options=await ownerOptions();
  const heading=options.findIndex(o=>o.value==='__service_accounts__');
  assert.ok(heading>0,'a heading of its own');assert.equal(options[heading]!.label,'Сервисные аккаунты');assert.equal(options[heading]!.disabled,true);
  assert.ok(options.slice(0,heading).every(o=>!o.label.includes('сервисный аккаунт')),'people first');
  const robot=options.find(o=>o.label==='Робот (сервисный аккаунт)');assert.ok(robot&&options.indexOf(robot)>heading,JSON.stringify(options));
  assert.equal(robot!.description,'Владелец — Алиса');
  assert.ok(!options.some(o=>o.label.startsWith('Читатель')),'an account that only reads is not offered');
  assert.deepEqual((await ownerOptions('Алиса')).map(o=>o.value),[f.alice.id],'no heading without an account that matches');
  assert.equal((await ownerOptions('робот')).length,2,'the heading and the account');
  assert.equal(await planningLabel('asg-robot'),'Робот (сервисный аккаунт)');
});

test('A03 a suspended, removed or deleted account keeps its tasks, flagged; it cannot be given new ones; they can be reassigned',async()=>{
  const robot=(await call(f.alice,'GET','/api/v1/service-accounts')).json().items.find((a:{name:string})=>a.name==='Робот');
  const task=await read('asg-robot');
  await f.admin.query('UPDATE auth.service_accounts SET suspended_at=clock_timestamp() WHERE principal_id=$1',[robot.id]);
  try{
    const flagged=await read(task.id);assert.equal(flagged.ownerId,robot.id);assert.equal(flagged.ownerState,'suspended');
    assert.equal(await planningLabel(task.id),'Робот (сервисный аккаунт, приостановлен)');
    refused(await put('asg-suspended',{ownerId:robot.id}),/приостановлен/);
    assert.ok(!(await ownerOptions()).some(o=>o.value===robot.id),'not offered while suspended');
    // Other changes keep the owner as it is.
    const edited=await saved(task.id,{title:'Переименована',ownerId:robot.id},flagged.revision);assert.equal(edited.ownerId,robot.id);
  }finally{await f.admin.query('UPDATE auth.service_accounts SET suspended_at=NULL WHERE principal_id=$1',[robot.id]);}
  const second=await saved('asg-deleted',{ownerId:robot.id});
  const removed=await call(f.alice,'DELETE','/api/v1/service-accounts/'+robot.id);assert.equal(removed.statusCode,200,removed.body);
  const gone=await read(second.id);assert.equal(gone.ownerId,robot.id);assert.equal(gone.ownerName,'Робот');assert.equal(gone.ownerState,'deleted');
  assert.equal(await planningLabel(second.id),'Робот (сервисный аккаунт, удалён)');
  refused(await put('asg-after',{ownerId:robot.id}),/удалён/);
  const cleared=await saved(second.id,{ownerId:null},gone.revision);assert.equal(cleared.ownerId,null);assert.equal(cleared.ownerState,null);
  // An account taken out of the project reads as no longer in it.
  const helper=await account(f.alice,'Помощник','editor'),kept=await saved('asg-left',{ownerId:helper.id});
  const member=(await call(f.alice,'GET',project('members'))).json().find((m:{id:string})=>m.id===helper.id);
  assert.equal((await call(f.alice,'PATCH',project('members/'+helper.id),{baseRevision:member.revision,role:null})).statusCode,200);
  assert.equal((await read(kept.id)).ownerState,'former');assert.equal(await planningLabel(kept.id),'Помощник (сервисный аккаунт, не в проекте)');
  refused(await put('asg-left-again',{ownerId:helper.id}),/не участвует в этом проекте/);
});

test('A04 MCP: the account finds the work handed to it with assignee "me", takes a task, and its changes are its own',async()=>{
  const agent=await account(f.alice,'Агент','editor');
  const token=(await call(f.alice,'POST',`/api/v1/service-accounts/${agent.id}/tokens`,{name:'MCP',scopes:['read','write'],expiresInDays:1})).json<{token:string}>().token;
  let sequence=0;
  const tool=async(name:string,args:Record<string,unknown>)=>{
    const r=await f.app.inject({method:'POST',url:api+'/mcp',headers:{accept:'application/json, text/event-stream','content-type':'application/json','mcp-protocol-version':'2025-11-25',authorization:'Bearer '+token},
      payload:{jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name,arguments:args}}});
    assert.equal(r.statusCode,200,r.body);const result=r.json().result;assert.equal(result.isError,false,JSON.stringify(result));return result.structuredContent.data;
  };
  const handed=await saved('asg-handed',{ownerId:agent.id}),other=await saved('asg-other',{ownerId:f.alice.id});
  const mine=await tool('search_tasks',{projectId:f.first.id,assigneeId:'me'});
  assert.deepEqual(mine.tasks.map((t:{id:string})=>t.id),[handed.id]);
  assert.equal(mine.tasks[0].assigneeKind,'service');assert.equal(mine.tasks[0].assigneeState,'active');assert.equal(mine.tasks[0].assigneeName,'Агент');
  assert.deepEqual((await tool('search_tasks',{projectId:f.first.id,assigneeId:agent.id})).tasks.map((t:{id:string})=>t.id),[handed.id]);
  const detail=await tool('get_task',{projectId:f.first.id,task:handed.id});
  assert.equal(detail.assigneeId,agent.id);assert.equal(detail.assigneeKind,'service');assert.equal(detail.assigneeState,'active');
  const person=await tool('get_task',{projectId:f.first.id,task:other.id});assert.equal(person.assigneeKind,'human');
  const taken=await tool('update_task',{projectId:f.first.id,task:other.id,baseRevision:other.revision,assigneeId:'me',idempotencyKey:'take-task-0001'});
  assert.equal(taken.assigneeId,agent.id);
  const created=await tool('create_task',{projectId:f.first.id,title:'Сам себе',assigneeId:'me',idempotencyKey:'self-task-0001'});assert.equal(created.assigneeId,agent.id);
  assert.equal((await tool('search_tasks',{projectId:f.first.id,assigneeId:'me'})).tasks.length,3);
  // The account's own change is recorded as the account's, with its owner as initiator, and published once.
  const audit=(await f.admin.query("SELECT actor_id,initiator_id,credential_kind FROM app.audit_events WHERE project_id=$1 AND resource_id=$2 ORDER BY created_at",[f.first.id,other.id])).rows.at(-1);
  assert.deepEqual([audit.actor_id,audit.initiator_id,audit.credential_kind],[agent.id,f.alice.id,'service']);
  const published=(await f.admin.query("SELECT count(*)::int AS n FROM app.outbox o JOIN app.audit_events a ON a.id=o.id WHERE a.project_id=$1 AND a.resource_id=$2 AND a.actor_id=$3",[f.first.id,other.id,agent.id])).rows[0].n;
  assert.equal(published,1,'the change is published once, as the account\'s');
  // Unassigning through MCP is always possible.
  const released=await tool('update_task',{projectId:f.first.id,task:other.id,baseRevision:taken.revision,assigneeId:null,idempotencyKey:'free-task-0001'});
  assert.equal(released.assigneeId,null);assert.equal(released.assigneeState,null);
});

test('A05 board lists name owners that left or were deleted; an owner who leaves the project suspends its account there; agents never own tasks',async()=>{
  const list=async(q:string)=>{const r=await call(f.alice,'GET',project('planning/tasks?q='+encodeURIComponent(q)));assert.equal(r.statusCode,200,r.body);return r.json<{items:any[]}>().items;};
  const [deleted]=await list('Переименована');
  assert.deepEqual([deleted.ownerName,deleted.ownerKind,deleted.ownerState],['Робот','service','deleted']);
  const [left]=await list('asg-left');assert.deepEqual([left.ownerName,left.ownerKind,left.ownerState],['Помощник','service','former']);
  const [person]=await list('asg-person');assert.deepEqual([person.ownerKind,person.ownerState],['service','deleted'],'reassigned to the robot in A01');
  // Bob edits here for a while and hands a task to his account; then he leaves the project.
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[f.first.workspaceId,f.bob.id]);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[f.first.id,f.bob.id]);
  const helper=await account(f.bob,'Сменщик','editor'),handed=await saved('asg-bob',{ownerId:helper.id});
  assert.equal(handed.ownerState,'active');
  const bob=(await call(f.alice,'GET',project('members'))).json().find((m:{id:string})=>m.id===f.bob.id);
  assert.equal((await call(f.alice,'PATCH',project('members/'+f.bob.id),{baseRevision:bob.revision,role:null})).statusCode,200);
  assert.equal((await read(handed.id)).ownerState,'suspended');assert.equal(await planningLabel(handed.id),'Сменщик (сервисный аккаунт, приостановлен)');
  refused(await put('asg-bob-again',{ownerId:helper.id}),/его владелец могут редактировать/);
  // An owner accepted at preview is checked again when the plan is applied.
  const target=await saved('asg-late',{});const robot=await account(f.alice,'Опоздавший','editor');
  const plan=(await call(f.alice,'POST',project('planning/previews'),{kind:'bulk',selection:{kind:'tasks',ids:[target.id]},fields:{ownerId:robot.id}})).json();
  await f.admin.query('UPDATE auth.service_accounts SET suspended_at=clock_timestamp() WHERE principal_id=$1',[robot.id]);
  const late=await call(f.alice,'POST',project('planning/commands'),{planId:plan.id,token:plan.token});
  assert.notEqual(late.json().status,'committed',late.body);assert.equal((await read(target.id)).ownerId,null);
  // A project agent is never an owner.
  const agent=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name) VALUES($1,'agent','Агент проекта')",[agent]);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[f.first.id,agent]);
  refused(await put('asg-agent',{ownerId:agent}),/только участник проекта/);
});
