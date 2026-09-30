import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {fixture} from './fixture.js';
import {openMailbox,type Mailbox} from './support/mailbox.js';
// Permissions, presets, workspace people and invitations (docs/access/access-and-invitations.md, part I, section 9):
// PR02–PR07, PR10, PR11 and IN01–IN07 against the server over HTTP, letters through the local mail drop.
let f:Awaited<ReturnType<typeof fixture>>,mailbox:Mailbox;
before(async()=>{mailbox=await openMailbox();f=await fixture({prefix:'AC',mailDrop:mailbox.directory});});
after(async()=>{await f?.close();await mailbox?.close();});
type User=Awaited<ReturnType<typeof fixture>>['alice'];
const call=(method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',url:string,payload?:unknown,user:{headers:Record<string,string>}=f.alice)=>
  f.app.inject({method,url:'/api/v1/'+url,headers:{...user.headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
async function ok(method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',url:string,payload?:unknown,user:{headers:Record<string,string>}=f.alice){
  const r=await call(method,url,payload,user);assert.ok(r.statusCode===200,`${method} ${url}: ${r.statusCode} ${r.body}`);return r.json();
}
const project=()=>'projects/'+f.first.id,workspace=()=>'workspaces/'+f.first.workspaceId;
async function preset(key:string){return (await f.admin.query('SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key=$2',[f.first.workspaceId,key])).rows[0].id as string;}
async function member(id:string){return (await ok('GET',project()+'/members')).find((m:{id:string})=>m.id===id);}
/** A person who signed in by an e-mail code: the address is verified on an identity of theirs. */
async function person(name:string,email:string):Promise<User>{
  const id=randomUUID(),credential=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
  await f.admin.query("INSERT INTO auth.principals(id,kind,name,email) VALUES($1,'human',$2,$3)",[id,name,email]);
  await f.admin.query("INSERT INTO auth.identities(issuer,subject,principal_id,email) VALUES('urn:sprintique:email',$1,$2,$1)",[email,id]);
  await f.admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
  return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin:'http://localhost:4311','x-csrf-token':csrf}};
}
const tokenOf=(text:string)=>text.match(/#invite\/(invite_[A-Za-z0-9_-]{43})/)![1]!;

test('PR01 the catalog lists fourteen project and five workspace permissions with their dependencies',async()=>{
  const catalog=await ok('GET','permissions/catalog');
  const flat=(groups:{permissions:{id:string;includes:string[]}[]}[])=>groups.flatMap(g=>g.permissions);
  assert.equal(flat(catalog.project).length,14);assert.equal(flat(catalog.workspace).length,5);
  assert.deepEqual(flat(catalog.project).find(p=>p.id==='project.access')!.includes,['members.manage','project.settings']);
  assert.deepEqual(catalog.presets.reader,['tasks.read','threads.write','maps.read','finance.read']);
  assert.ok(catalog.neverService.includes('approvals.decide')&&!catalog.neverService.includes('finance.read'));
});

test('PR04 PR05 a preset change reaches every membership and keeps personal changes; the administrator preset is locked',async()=>{
  const presets=await ok('GET',workspace()+'/presets');
  const admin=presets.find((p:{key:string})=>p.key==='admin'),reader=presets.find((p:{key:string})=>p.key==='reader');
  assert.equal(admin.locked,true);assert.equal(reader.members,1);
  const locked=await call('PUT',workspace()+'/presets/'+admin.id,{baseRevision:admin.revision,name:'Администратор',permissions:['tasks.read']});
  assert.equal(locked.json().code,'PRESET_LOCKED');
  // Personal addition first, then the preset loses finance: the addition stays.
  const r=await member(f.reader.id);
  await ok('PUT',project()+'/members/'+f.reader.id+'/access',{baseRevision:r.revision,presetId:reader.id,granted:['maps.write'],revoked:[]});
  const changed=await ok('PUT',workspace()+'/presets/'+reader.id,{baseRevision:reader.revision,name:'Наблюдатель',hint:'Без финансов',permissions:['tasks.read','threads.write','maps.read']});
  assert.equal(changed.modified,true);
  const after=await member(f.reader.id);
  assert.ok(!after.permissions.includes('finance.read'));assert.ok(after.permissions.includes('maps.write'));assert.deepEqual(after.added,['maps.write']);
  const audit=(await f.admin.query("SELECT details FROM app.workspace_audit WHERE workspace_id=$1 AND action='preset.updated' ORDER BY created_at DESC LIMIT 1",[f.first.workspaceId])).rows[0].details;
  assert.deepEqual(audit.removed,['finance.read']);assert.equal(audit.memberships,1);
  const reset=await ok('POST',workspace()+'/presets/'+reader.id+'/reset',{baseRevision:changed.revision});
  assert.deepEqual(reset.permissions,['tasks.read','threads.write','maps.read','finance.read']);assert.equal(reset.modified,false);
  assert.ok((await member(f.reader.id)).permissions.includes('finance.read'));
});

test('PR04 custom presets: at most ten, unique names, removable only when unused',async()=>{
  const id=randomUUID();
  const created=await ok('POST',workspace()+'/presets',{id,name:'Подрядчик',hint:'Задачи и обсуждения',permissions:['tasks.write','threads.write']});
  assert.deepEqual(created.permissions,['tasks.read','tasks.write','threads.write']);assert.equal(created.custom,true);
  assert.equal((await call('POST',workspace()+'/presets',{id:randomUUID(),name:'подрядчик',permissions:[]})).json().code,'PRESET_NAME_TAKEN');
  const r=await member(f.reader.id);
  await ok('PUT',project()+'/members/'+f.reader.id+'/access',{baseRevision:r.revision,presetId:id,granted:[],revoked:[]});
  assert.equal((await call('DELETE',workspace()+'/presets/'+id)).json().code,'PRESET_IN_USE');
  const back=await member(f.reader.id);
  await ok('PUT',project()+'/members/'+f.reader.id+'/access',{baseRevision:back.revision,presetId:await preset('reader'),granted:[],revoked:[]});
  assert.equal((await ok('DELETE',workspace()+'/presets/'+id)).archived,true);
  for(let i=0;i<10;i++)await ok('POST',workspace()+'/presets',{id:randomUUID(),name:'Свой '+i,permissions:[]});
  assert.equal((await call('POST',workspace()+'/presets',{id:randomUUID(),name:'Одиннадцатый',permissions:[]})).json().code,'PRESET_LIMIT');
  assert.equal((await call('GET',workspace()+'/presets',undefined,f.bob)).statusCode,404);
});

test('PR02 PR03 PR10 personal changes: dependencies, the readable difference, not more than one\'s own, the last administrator',async()=>{
  // Борис joins as Редактор; «Менять права участников» is added for him below.
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[f.first.workspaceId,f.bob.id]);
  assert.ok((await ok('GET',project()+'/directory')).some((p:{id:string})=>p.id===f.bob.id));
  await ok('POST',project()+'/members',{principalId:f.bob.id,presetId:await preset('editor')});
  const b=await member(f.bob.id);assert.equal(b.presetName,'Редактор');
  const conflict=await call('PUT',project()+'/members/'+f.bob.id+'/access',{baseRevision:b.revision,presetId:await preset('editor'),granted:['releases.manage'],revoked:['tasks.write']});
  assert.equal(conflict.statusCode,422);assert.equal(conflict.json().code,'PERMISSION_DEPENDENCY');
  const changed=await ok('PUT',project()+'/members/'+f.bob.id+'/access',{baseRevision:b.revision,presetId:await preset('editor'),granted:['finance.write','members.manage','tasks.write'],revoked:['releases.manage']});
  assert.ok(changed.permissions.includes('finance.write')&&changed.permissions.includes('members.invite'));
  const row=await member(f.bob.id);assert.deepEqual(row.added,['finance.write','members.manage']);assert.deepEqual(row.removed,['releases.manage']);assert.equal(row.modified,true);
  const effective=await ok('GET',project()+'/members/'+f.bob.id+'/effective');
  assert.equal(effective.sources['finance.write'],'added');assert.equal(effective.sources['finance.read'],'preset');assert.equal(effective.sources['releases.manage'],'removed');assert.equal(effective.sources['project.access'],'absent');
  // About oneself always, about others only with «Менять права участников».
  assert.equal((await call('GET',project()+'/members/'+f.alice.id+'/effective',undefined,f.reader)).statusCode,403);
  assert.equal((await call('GET',project()+'/members/'+f.reader.id+'/effective',undefined,f.reader)).statusCode,200);
  // Борис may manage members, but not give what he lacks nor touch the administrator.
  const r=await member(f.reader.id);
  const beyond=await call('PUT',project()+'/members/'+f.reader.id+'/access',{baseRevision:r.revision,presetId:await preset('reader'),granted:['project.settings'],revoked:[]},f.bob);
  assert.equal(beyond.statusCode,403);assert.equal(beyond.json().code,'PERMISSION_EXCEEDS_ACTOR');
  const alice=await member(f.alice.id);
  const above=await call('PUT',project()+'/members/'+f.alice.id+'/access',{baseRevision:alice.revision,presetId:await preset('reader'),granted:[],revoked:[]},f.bob);
  assert.equal(above.json().code,'PERMISSION_EXCEEDS_ACTOR');
  await ok('PUT',project()+'/members/'+f.reader.id+'/access',{baseRevision:r.revision,presetId:await preset('reader'),granted:['finance.write'],revoked:[]},f.bob);
  // The last administrator leaves only through a handover.
  const last=await call('PUT',project()+'/members/'+f.alice.id+'/access',{baseRevision:alice.revision,presetId:await preset('editor'),granted:[],revoked:[]});
  assert.equal(last.statusCode,409);assert.equal(last.json().code,'LAST_ADMIN');
  const handover=await ok('POST',project()+'/members/'+f.bob.id+'/handover',{baseRevision:(await member(f.bob.id)).revision,presetId:await preset('editor')});
  assert.equal(handover.administratorId,f.bob.id);
  assert.equal((await member(f.bob.id)).role,'admin');assert.equal((await member(f.alice.id)).presetName,'Редактор');
  const again=await member(f.alice.id);
  await ok('PUT',project()+'/members/'+f.alice.id+'/access',{baseRevision:again.revision,presetId:await preset('admin'),granted:[],revoked:[]},f.bob);
  assert.equal((await member(f.alice.id)).role,'admin');
  const history=(await f.admin.query("SELECT action,details FROM app.audit_events WHERE project_id=$1 AND action LIKE 'member.%' ORDER BY created_at",[f.first.id])).rows;
  assert.ok(history.some(e=>e.action==='member.permissions.updated'&&e.details.added.includes('finance.write')));
  assert.ok(history.some(e=>e.action==='member.handover'));
});

test('PR06 a guest never manages project access and is added to projects only by invitation',async()=>{
  const guest=await person('Гость','guest-'+randomUUID().slice(0,8)+'@example.org');
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'guest')",[f.first.workspaceId,guest.id]);
  assert.equal((await call('POST',project()+'/members',{principalId:guest.id})).json().code,'GUEST_RESTRICTED');
  assert.ok(!(await ok('GET',project()+'/directory')).some((p:{id:string})=>p.id===guest.id));
  await f.admin.query('INSERT INTO app.project_members(project_id,workspace_id,principal_id,preset_id) VALUES($1,$2,$3,$4)',[f.first.id,f.first.workspaceId,guest.id,await preset('guest')]);
  const g=await member(guest.id);assert.equal(g.workspaceRole,'guest');assert.ok(!g.permissions.includes('finance.read'));
  const refused=await call('PUT',project()+'/members/'+guest.id+'/access',{baseRevision:g.revision,presetId:await preset('admin'),granted:[],revoked:[]});
  assert.equal(refused.json().code,'GUEST_RESTRICTED');
});

test('PR07 finance follows finance.read and finance.write',async()=>{
  const outsider=await person('Финансист','fin-'+randomUUID().slice(0,8)+'@example.org');
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member')",[f.first.workspaceId,outsider.id]);
  await ok('POST',project()+'/members',{principalId:outsider.id,presetId:await preset('reader')});
  assert.equal((await call('GET',project()+'/finance-summary',undefined,outsider)).statusCode,200);
  assert.equal((await call('PUT',project()+'/finance-settings',{baseRevision:0,value:{currencyCode:'USD'}},outsider)).statusCode,403);
  const m=await member(outsider.id);
  await ok('PUT',project()+'/members/'+outsider.id+'/access',{baseRevision:m.revision,presetId:await preset('guest'),granted:[],revoked:[]});
  assert.equal((await call('GET',project()+'/finance-summary',undefined,outsider)).statusCode,403);
  const g=await member(outsider.id);
  await ok('PUT',project()+'/members/'+outsider.id+'/access',{baseRevision:g.revision,presetId:await preset('guest'),granted:['finance.read'],revoked:[]});
  assert.equal((await call('GET',project()+'/finance-summary',undefined,outsider)).statusCode,200);
});

test('PR11 the matrix and project defaults need «Управлять доступом»; workspace administrators enter a project explicitly',async()=>{
  assert.equal((await call('GET',project()+'/access/matrix',undefined,f.reader)).statusCode,403);
  const matrix=await ok('GET',project()+'/access/matrix');assert.equal(matrix.permissions.length,14);
  const access=await ok('GET',project()+'/access');assert.equal(access.canManage,true);
  const saved=await ok('PUT',project()+'/access',{baseRevision:access.revision,defaultMemberPresetId:await preset('reader'),defaultGuestPresetId:null});
  assert.equal(saved.memberPresetId,await preset('reader'));
  assert.equal((await call('PUT',project()+'/access',{baseRevision:saved.revision,defaultMemberPresetId:null,defaultGuestPresetId:await preset('admin')})).json().code,'GUEST_RESTRICTED');
  // Борис owns another workspace; Алиса becomes its administrator and enters his project on the record.
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'admin')",[f.second.workspaceId,f.alice.id]);
  assert.equal((await call('GET','projects/'+f.second.id+'/tasks')).statusCode,404);
  assert.equal((await call('POST','projects/'+f.second.id+'/join-as-admin',{},f.reader)).statusCode,404);
  const joined=await ok('POST','projects/'+f.second.id+'/join-as-admin',{});assert.equal(joined.projectId,f.second.id);
  assert.equal((await call('GET','projects/'+f.second.id+'/tasks')).statusCode,200);
  const event=(await f.admin.query("SELECT actor_id FROM app.audit_events WHERE project_id=$1 AND action='access.workspace_admin_joined'",[f.second.id])).rows;
  assert.deepEqual(event.map(e=>e.actor_id),[f.alice.id]);
});

test('workspace roles: one owner, transfer of ownership, administrators removed only by the owner, the rule for new projects',async()=>{
  const ws=(await ok('POST','workspaces',{name:'Роли'})).id,base='workspaces/'+ws;
  const carol=await person('Карина','carol-'+randomUUID().slice(0,8)+'@example.org'),dan=await person('Данил','dan-'+randomUUID().slice(0,8)+'@example.org');
  for(const [id,role] of [[carol.id,'admin'],[dan.id,'member']] as const)await f.admin.query('INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,$3)',[ws,id,role]);
  const people=await ok('GET',base+'/members');assert.equal(people[0].role,'owner');assert.equal(people[0].id,f.alice.id);
  const danRow=people.find((p:{id:string})=>p.id===dan.id),carolRow=people.find((p:{id:string})=>p.id===carol.id);
  assert.equal((await call('PATCH',base+'/members/'+f.alice.id,{baseRevision:1,role:'admin'},carol)).json().code,'OWNER_PROTECTED');
  assert.equal((await call('POST','projects',{workspaceId:ws,name:'Проект',slug:'p-'+randomUUID().slice(0,8),key:'PRJ'},dan)).statusCode,403);
  const rules=await ok('GET',base+'/access');
  await ok('PUT',base+'/access',{baseRevision:rules.revision,projectsCreatedBy:'members',defaultMemberPresetId:null,defaultGuestPresetId:null});
  assert.equal((await call('POST','projects',{workspaceId:ws,name:'Проект',slug:'p-'+randomUUID().slice(0,8),key:'PRJ'},dan)).statusCode,200);
  await ok('PATCH',base+'/members/'+dan.id,{baseRevision:danRow.revision,role:'admin'},carol);
  const danAdmin=(await ok('GET',base+'/members')).find((p:{id:string})=>p.id===dan.id);
  assert.equal((await call('PATCH',base+'/members/'+dan.id,{baseRevision:danAdmin.revision,role:'member'},carol)).json().code,'OWNER_REQUIRED');
  assert.equal((await call('POST',base+'/owner/transfer',{toPrincipalId:carol.id},carol)).json().code,'OWNER_REQUIRED');
  await ok('POST',base+'/owner/transfer',{toPrincipalId:carol.id});
  const after=await ok('GET',base+'/members',undefined,carol);
  assert.equal(after.find((p:{id:string})=>p.id===carol.id).role,'owner');assert.equal(after.find((p:{id:string})=>p.id===f.alice.id).role,'admin');
  // A member who administers a project cannot become a guest.
  const dansProject=(await ok('GET',base+'/projects',undefined,dan))[0];assert.ok(dansProject);
  const danNow=after.find((p:{id:string})=>p.id===dan.id);
  assert.equal((await call('PATCH',base+'/members/'+dan.id,{baseRevision:danNow.revision,role:'guest'},carol)).json().code,'GUEST_RESTRICTED');
  const removal=await call('PATCH',base+'/members/'+dan.id,{baseRevision:danNow.revision,role:null},carol);assert.equal(removal.json().code,'PROJECT_ACCESS_REMAINS');
  assert.equal((await call('PATCH',base+'/members/'+dan.id,{baseRevision:danNow.revision,role:null,alsoFromProjects:true},carol)).json().code,'LAST_ADMIN');
  assert.ok(carolRow);
});

test('R4 F1 F3 a workspace administrator outside a project: a preset edit and a removal orphan the person\'s requests there',async()=>{
  const ws=(await ok('POST','workspaces',{name:'Сироты'})).id,base='workspaces/'+ws;
  const carol=await person('Карина','carol-'+randomUUID().slice(0,8)+'@example.org'),dan=await person('Данил','dan-'+randomUUID().slice(0,8)+'@example.org');
  for(const [id,role] of [[carol.id,'admin'],[dan.id,'member']] as const)await f.admin.query('INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,$3)',[ws,id,role]);
  const p=(await ok('POST','projects',{workspaceId:ws,name:'Без Карины',slug:'o-'+randomUUID().slice(0,8),key:'ORP'})).id;
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[p,dan.id]);
  const task='t-'+randomUUID().slice(0,8);
  await ok('PUT','projects/'+p+'/tasks/'+task,{baseRevision:0,task:{title:'Вопрос Данилу'}});
  const ask=async()=>{const id=randomUUID();await f.admin.query("INSERT INTO app.attention_requests(project_id,id,task_id,recipient_id,requested_by,kind) VALUES($1,$2,$3,$4,$5,'answer')",[p,id,task,dan.id,f.alice.id]);return id;};
  const status=async(id:string)=>(await f.admin.query('SELECT status FROM app.attention_requests WHERE id=$1',[id])).rows[0].status;
  // The editor preset loses «Менять задачи», edited by someone who is not in the project: Данил cannot act any more.
  const first=await ask();
  const editor=(await ok('GET',base+'/presets',undefined,carol)).find((x:{key:string})=>x.key==='editor');
  const narrowed=await ok('PUT',base+'/presets/'+editor.id,{baseRevision:editor.revision,name:editor.name,permissions:['tasks.read','threads.write','maps.read']},carol);
  assert.equal(await status(first),'orphaned');
  await ok('POST',base+'/presets/'+editor.id+'/reset',{baseRevision:narrowed.revision},carol);
  // Removed from the workspace with his projects by the same administrator: 200, and his open request is orphaned.
  const second=await ask();
  const row=(await ok('GET',base+'/members',undefined,carol)).find((x:{id:string})=>x.id===dan.id);
  await ok('PATCH',base+'/members/'+dan.id,{baseRevision:row.revision,role:null,alsoFromProjects:true},carol);
  assert.equal(await status(second),'orphaned');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p,dan.id])).rows[0].n,0);
  const events=(await f.admin.query("SELECT action,actor_id FROM app.audit_events WHERE project_id=$1 AND action IN ('member.removed','request.orphaned')",[p])).rows;
  assert.ok(events.some(e=>e.action==='member.removed'&&e.actor_id===carol.id));
  assert.equal(events.filter(e=>e.action==='request.orphaned').length,2);
});

test('IN01 IN02 letters to several addresses: multipart letter, hashed token, same answers for any address',async()=>{
  const known=await person('Иван','ivan-'+randomUUID().slice(0,8)+'@example.org');
  const unknown='nobody-'+randomUUID().slice(0,8)+'@example.org';
  const email=(await f.admin.query('SELECT email FROM auth.principals WHERE id=$1',[known.id])).rows[0].email as string;
  const sent=await ok('POST',workspace()+'/invitations',{emails:[email,' '+unknown.toUpperCase()+' '],workspaceRole:'member',presetId:await preset('editor'),projectIds:[f.first.id]});
  assert.equal(sent.invitations.length,2);
  // Nothing in the answer depends on whether the address has an account.
  const shape=(i:Record<string,unknown>)=>[i.delivery,i.state,i.workspaceRole,i.presetName,Object.keys(i).sort().join()].join('|');
  assert.equal(shape(sent.invitations[0]),shape(sent.invitations[1]));
  assert.ok(sent.invitations.every((i:{delivery:string})=>i.delivery==='sent'));
  const letter=(await mailbox.letters(email)).at(-1)!;
  assert.match(letter.subject,/приглашает вас в пространство «.+» — Sprintique/);
  assert.match(letter.text,/Ваша роль: Участник пространства/);assert.match(letter.text,/как редактор/);
  assert.ok(letter.html&&letter.html.includes('Принять приглашение')&&letter.html.includes('href="http://localhost:4311/#invite/'));
  const token=tokenOf(letter.text);
  const stored=(await f.admin.query('SELECT token_hash FROM auth.invitations WHERE email=$1',[email])).rows[0].token_hash;
  assert.equal(stored,createHash('sha256').update(token).digest('hex'));assert.ok(!JSON.stringify(sent).includes(token));
  // Anyone holding the link sees what it invites to, with the address masked; an unknown token says nothing more.
  const inspected=await f.app.inject({method:'POST',url:'/api/v1/invitations/inspect',headers:{origin:'http://localhost:4311'},payload:{token}});
  assert.equal(inspected.statusCode,200,inspected.body);assert.equal(inspected.json().state,'pending');assert.match(inspected.json().email,/^iv\*\*\*@example\.org$/);
  const missing=await f.app.inject({method:'POST',url:'/api/v1/invitations/inspect',payload:{token:'invite_'+'x'.repeat(43)}});
  assert.equal(missing.statusCode,404);assert.equal(missing.json().code,'INVITATION_INVALID');
  // IN04 someone else's session cannot accept it.
  const mismatch=await call('POST','invitations/accept',{token},f.bob);
  assert.equal(mismatch.statusCode,403);assert.equal(mismatch.json().code,'INVITATION_EMAIL_MISMATCH');assert.match(mismatch.json().action.invitedEmail,/^iv\*\*\*@/);
  // IN05 the invited person joins the workspace and the project with the preset.
  const accepted=await ok('POST','invitations/accept',{token},known);
  assert.equal(accepted.projectId,f.first.id);
  const joined=await member(known.id);assert.equal(joined.presetName,'Редактор');assert.equal(joined.workspaceRole,'member');
  assert.equal((await call('POST','invitations/accept',{token},known)).statusCode,200);
});

test('IN03 resend makes a new token and replaces the old one; revoke and expiry close an invitation',async()=>{
  const email='resend-'+randomUUID().slice(0,8)+'@example.org';
  const first=(await ok('POST',workspace()+'/invitations',{emails:[email],workspaceRole:'guest',presetId:await preset('guest'),projectIds:[f.first.id]})).invitations[0];
  const oldToken=tokenOf((await mailbox.letters(email)).at(-1)!.text);
  const early=await call('POST','invitations/'+first.id+'/resend',{});assert.equal(early.statusCode,429);assert.equal(early.json().code,'INVITATION_RESEND_WAIT');
  await f.admin.query("UPDATE auth.invitations SET created_at=created_at-interval '6 minutes' WHERE id=$1",[first.id]);
  const second=(await ok('POST','invitations/'+first.id+'/resend',{})).invitations[0];
  assert.notEqual(second.id,first.id);assert.equal(second.resendCount,1);
  const newToken=tokenOf((await mailbox.letters(email)).at(-1)!.text);assert.notEqual(newToken,oldToken);
  const inspect=(token:string)=>f.app.inject({method:'POST',url:'/api/v1/invitations/inspect',payload:{token}}).then(r=>r.json());
  assert.equal((await inspect(oldToken)).state,'replaced');
  const invitee=await person('Гостья',email);
  assert.equal((await call('POST','invitations/accept',{token:oldToken},invitee)).json().code,'INVITATION_REPLACED');
  await ok('DELETE','invitations/'+second.id);
  assert.equal((await inspect(newToken)).state,'revoked');
  assert.equal((await call('POST','invitations/accept',{token:newToken},invitee)).json().code,'INVITATION_REVOKED');
  const list=await ok('GET',workspace()+'/invitations');
  assert.deepEqual(list.filter((i:{email:string})=>i.email===email).map((i:{state:string})=>i.state).sort(),['replaced','revoked']);
});

test('IN06 limits: twenty at once, fifty a day per person, five a day to one address from the whole platform',async()=>{
  const many=Array.from({length:21},(_,i)=>`many-${i}-${randomUUID().slice(0,6)}@example.org`);
  assert.equal((await call('POST',workspace()+'/invitations',{emails:many,workspaceRole:'member'})).statusCode,400);
  const target='popular-'+randomUUID().slice(0,8)+'@example.org';
  // Five letters to one address from another workspace already today.
  for(let i=0;i<5;i++){
    await f.admin.query(`INSERT INTO auth.invitations(id,workspace_id,kind,email,token_hash,workspace_role,inviter_id,workspace_name,inviter_name,expires_at,delivery)
      VALUES($1,$2,'email',$3,$4,'member',$5,'Другое','Борис',now()+interval '7 days','sent')`,[randomUUID(),f.second.workspaceId,target,createHash('sha256').update(randomUUID()).digest('hex'),f.bob.id]);
  }
  const limited=(await ok('POST',workspace()+'/invitations',{emails:[target],workspaceRole:'member'})).invitations[0];
  assert.equal(limited.delivery,'failed');assert.match(limited.deliveryError,/много писем/);
  assert.equal((await mailbox.letters(target)).length,0);
  const sent=(await f.admin.query("SELECT count(*)::int AS n FROM auth.invitations WHERE inviter_id=$1 AND kind='email' AND created_at>now()-interval '1 day'",[f.alice.id])).rows[0].n as number;
  for(let i=sent;i<50;i++){
    await f.admin.query(`INSERT INTO auth.invitations(id,workspace_id,kind,email,token_hash,workspace_role,inviter_id,workspace_name,inviter_name,expires_at,delivery,revoked_at)
      VALUES($1,$2,'email',$3,$4,'member',$5,'Команда','Алиса',now()+interval '7 days','sent',now())`,[randomUUID(),f.first.workspaceId,`filler-${i}@example.org`,createHash('sha256').update(randomUUID()).digest('hex'),f.alice.id]);
  }
  const over=await call('POST',workspace()+'/invitations',{emails:['one-more-'+randomUUID().slice(0,6)+'@example.org'],workspaceRole:'member'});
  assert.equal(over.statusCode,429);assert.equal(over.json().code,'INVITATION_LIMIT');
});

test('IN07 from a project, someone who may invite only there invites guests of the workspace to that project',async()=>{
  const inviter=await person('Пригласивший','pr-'+randomUUID().slice(0,8)+'@example.org');
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member')",[f.first.workspaceId,inviter.id]);
  await ok('POST',project()+'/members',{principalId:inviter.id,presetId:await preset('reader')});
  const m=await member(inviter.id);
  await ok('PUT',project()+'/members/'+inviter.id+'/access',{baseRevision:m.revision,presetId:await preset('reader'),granted:['members.invite'],revoked:[]});
  assert.equal((await call('POST',workspace()+'/invitations',{emails:['x@example.org'],workspaceRole:'member'},inviter)).statusCode,403);
  const wider=await call('POST',project()+'/invitations',{emails:['w@example.org'],presetId:await preset('editor')},inviter);
  assert.equal(wider.json().code,'PERMISSION_EXCEEDS_ACTOR');
  const email='guest-'+randomUUID().slice(0,8)+'@example.org';
  const invitation=(await ok('POST',project()+'/invitations',{emails:[email]},inviter)).invitations[0];
  assert.equal(invitation.workspaceRole,'guest');assert.equal(invitation.presetName,'Гость');
  const invitee=await person('Внешний',email);
  await ok('POST','invitations/accept',{token:tokenOf((await mailbox.letters(email)).at(-1)!.text)},invitee);
  const joined=await member(invitee.id);assert.equal(joined.workspaceRole,'guest');assert.equal(joined.presetName,'Гость');
  assert.equal((await ok('GET',project()+'/invitations',undefined,inviter)).some((i:{id:string})=>i.id===invitation.id),true);
});

// Review R1 (F1–F7): the risky paths, each in a workspace of its own.
async function space(owner:User=f.alice){
  const ws=(await ok('POST','workspaces',{name:'Проверка '+randomUUID().slice(0,6)},owner)).id as string;
  const project=async(name:string)=>(await ok('POST','projects',{workspaceId:ws,name,slug:'r-'+randomUUID().slice(0,8),key:'R'+randomUUID().slice(0,4).toUpperCase().replace(/[^A-Z0-9]/g,'X')},owner)).id as string;
  const presetOf=async(key:string)=>(await f.admin.query('SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key=$2',[ws,key])).rows[0].id as string;
  const join=async(user:User,role:string)=>{await f.admin.query('INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,$3)',[ws,user.id,role]);};
  const add=async(projectId:string,user:User,key:string)=>ok('POST','projects/'+projectId+'/members',{principalId:user.id,presetId:await presetOf(key)},owner);
  const row=async(projectId:string,id:string)=>(await ok('GET','projects/'+projectId+'/members',undefined,owner)).find((m:{id:string})=>m.id===id);
  return {ws,project,presetOf,join,add,row};
}
const someone=(name:string)=>person(name,name.toLowerCase().replace(/[^a-z]/g,'')+'-'+randomUUID().slice(0,8)+'@example.org');

test('F1 a handover gives exactly the actor\'s access and keeps the actor within it',async()=>{
  const s=await space(),p=await s.project('Передача'),anna=await someone('anna'),boris=await someone('boris');
  await s.join(anna,'member');await s.join(boris,'member');await s.add(p,anna,'admin');await s.add(p,boris,'reader');
  const a=await s.row(p,anna.id);
  await ok('PUT','projects/'+p+'/members/'+anna.id+'/access',{baseRevision:a.revision,presetId:await s.presetOf('admin'),granted:[],revoked:['finance.write']});
  const b=await s.row(p,boris.id);
  const greedy=await call('POST','projects/'+p+'/members/'+boris.id+'/handover',{baseRevision:b.revision,presetId:await s.presetOf('admin')},anna);
  assert.equal(greedy.statusCode,403);assert.equal(greedy.json().code,'PERMISSION_EXCEEDS_ACTOR');
  await ok('POST','projects/'+p+'/members/'+boris.id+'/handover',{baseRevision:b.revision,presetId:await s.presetOf('editor')},anna);
  const after=await s.row(p,boris.id);
  assert.ok(after.permissions.includes('project.access'));assert.ok(!after.permissions.includes('finance.write'));
  assert.equal((await s.row(p,anna.id)).presetName,'Редактор');
});

test('F2 F4 a preset in use takes only what its editor holds wherever it is used, and never the last administrator',async()=>{
  const s=await space(),a=await s.project('А'),b=await s.project('Б'),dan=await someone('dan');
  await s.join(dan,'member');await s.add(a,dan,'editor');await s.add(b,dan,'admin');
  const d=(await ok('GET','workspaces/'+s.ws+'/members')).find((m:{id:string})=>m.id===dan.id);
  await ok('PUT','workspaces/'+s.ws+'/members/'+dan.id+'/access',{baseRevision:d.revision,granted:['workspace.settings'],revoked:[]});
  const editor=(await ok('GET','workspaces/'+s.ws+'/presets',undefined,dan)).find((p:{key:string})=>p.key==='editor');
  const wider=await call('PUT','workspaces/'+s.ws+'/presets/'+editor.id,{baseRevision:editor.revision,name:editor.name,hint:editor.hint,permissions:[...editor.permissions,'project.access']},dan);
  assert.equal(wider.statusCode,403);assert.equal(wider.json().code,'PERMISSION_EXCEEDS_ACTOR');
  // The only administrator of a project moves to a custom preset; removing its access is refused.
  const lead=randomUUID();
  await ok('POST','workspaces/'+s.ws+'/presets',{id:lead,name:'Руководитель',permissions:['project.access','tasks.write']});
  const me=await s.row(a,f.alice.id);
  await ok('PUT','projects/'+a+'/members/'+f.alice.id+'/access',{baseRevision:me.revision,presetId:lead,granted:[],revoked:[]});
  const custom=(await ok('GET','workspaces/'+s.ws+'/presets')).find((p:{id:string})=>p.id===lead);
  const orphan=await call('PUT','workspaces/'+s.ws+'/presets/'+lead,{baseRevision:custom.revision,name:'Руководитель',permissions:['tasks.write']});
  assert.equal(orphan.statusCode,409);assert.equal(orphan.json().code,'LAST_ADMIN');
  // A retry of the same creation answers with the same preset.
  assert.equal((await ok('POST','workspaces/'+s.ws+'/presets',{id:lead,name:'Руководитель',permissions:['project.access','tasks.write']})).revision,custom.revision);
});

test('F3 an administrator cannot strip another administrator, nor anyone change people above them',async()=>{
  const s=await space(),carol=await someone('carol'),dan=await someone('dan'),eva=await someone('eva');
  await s.join(carol,'admin');await s.join(dan,'admin');await s.join(eva,'member');
  const members=await ok('GET','workspaces/'+s.ws+'/members');const row=(id:string)=>members.find((m:{id:string})=>m.id===id);
  const strip=await call('PUT','workspaces/'+s.ws+'/members/'+dan.id+'/access',{baseRevision:row(dan.id).revision,granted:[],revoked:['workspace.invite']},carol);
  assert.equal(strip.json().code,'OWNER_REQUIRED');
  await ok('PUT','workspaces/'+s.ws+'/members/'+eva.id+'/access',{baseRevision:row(eva.id).revision,granted:['workspace.people'],revoked:[]});
  const people=await ok('GET','workspaces/'+s.ws+'/members',undefined,eva);
  const above=await call('PATCH','workspaces/'+s.ws+'/members/'+carol.id,{baseRevision:people.find((m:{id:string})=>m.id===carol.id).revision,role:'member'},eva);
  assert.equal(above.statusCode,403);
});

test('F6 another author\'s invitation to the same address is not replaced; a quick retry answers with the first',async()=>{
  const o=await someone('owner'),s=await space(o),p=await s.project('Письма'),carol=await someone('carol'),email='twice-'+randomUUID().slice(0,8)+'@example.org';
  await s.join(carol,'admin');
  const first=(await ok('POST','workspaces/'+s.ws+'/invitations',{emails:[email],workspaceRole:'member',presetId:await s.presetOf('editor'),projectIds:[p]},o)).invitations[0];
  const retry=(await ok('POST','workspaces/'+s.ws+'/invitations',{emails:[email],workspaceRole:'member',presetId:await s.presetOf('editor'),projectIds:[p]},o)).invitations[0];
  assert.equal(retry.id,first.id);assert.equal((await mailbox.letters(email)).length,1);
  const other=(await ok('POST','workspaces/'+s.ws+'/invitations',{emails:[email],workspaceRole:'guest',presetId:await s.presetOf('guest'),projectIds:[p]},carol)).invitations[0];
  assert.notEqual(other.id,first.id);
  const states=(await ok('GET','workspaces/'+s.ws+'/invitations',undefined,o)).filter((i:{email:string})=>i.email===email).map((i:{state:string})=>i.state);
  assert.deepEqual(states,['pending','pending']);
  // F7(d) the author of a workspace invitation who lost the right to invite no longer lets anyone in.
  const invitee=await person('Кому',email),token=tokenOf((await mailbox.letters(email)).at(-1)!.text);
  const c=(await ok('GET','workspaces/'+s.ws+'/members',undefined,o)).find((m:{id:string})=>m.id===carol.id);
  await ok('PATCH','workspaces/'+s.ws+'/members/'+carol.id,{baseRevision:c.revision,role:'member'},o);
  const refused=await call('POST','invitations/accept',{token},invitee);assert.equal(refused.statusCode,403);assert.equal(refused.json().code,'INVITATION_REVOKED');
});

test('F7 parallel acceptances, parallel sends at the daily limit, the 200-a-day, 500-pending and five-resend limits',async()=>{
  const o=await someone('racer'),s=await space(o),p=await s.project('Гонки');
  const link=await ok('POST','projects/'+p+'/invitation-links',{presetId:await s.presetOf('reader')},o);
  const x=await someone('xena'),y=await someone('yuri');
  const both=await Promise.all([call('POST','invitations/accept',{token:link.token},x),call('POST','invitations/accept',{token:link.token},y)]);
  assert.deepEqual(both.map(r=>r.statusCode).sort(),[200,409]);
  const again=await ok('POST','projects/'+p+'/invitation-links',{presetId:await s.presetOf('reader')},o);
  const z=await someone('zoya');
  const twice=await Promise.all([call('POST','invitations/accept',{token:again.token},z),call('POST','invitations/accept',{token:again.token},z)]);
  assert.deepEqual(twice.map(r=>r.statusCode),[200,200]);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p,z.id])).rows[0].n,1);
  // Sending: the owner of a fresh workspace has 48 letters today; two parallel sends of two cross 50 together.
  const owner=await someone('olga'),t=await space(owner);
  const fill=async(ws:string,inviter:string,count:number,pending=false)=>{for(let i=0;i<count;i++)await f.admin.query(`INSERT INTO auth.invitations(id,workspace_id,kind,email,token_hash,workspace_role,inviter_id,workspace_name,inviter_name,expires_at,delivery,revoked_at)
    VALUES($1,$2,'email',$3,$4,'member',$5,'Проверка','Кто-то',now()+interval '7 days','sent',$6)`,[randomUUID(),ws,`fill-${randomUUID().slice(0,8)}@example.org`,createHash('sha256').update(randomUUID()).digest('hex'),inviter,pending?null:new Date()]);};
  await fill(t.ws,owner.id,48);
  const addresses=()=>[0,1].map(()=>'par-'+randomUUID().slice(0,8)+'@example.org');
  const sends=await Promise.all([call('POST','workspaces/'+t.ws+'/invitations',{emails:addresses(),workspaceRole:'member'},owner),call('POST','workspaces/'+t.ws+'/invitations',{emails:addresses(),workspaceRole:'member'},owner)]);
  assert.deepEqual(sends.map(r=>r.statusCode).sort(),[200,429]);
  // 200 a day per workspace, whoever sends.
  const uo=await someone('ulya'),u=await space(uo),helper=await someone('helper');await u.join(helper,'admin');
  await fill(u.ws,helper.id,199);
  const busy=await call('POST','workspaces/'+u.ws+'/invitations',{emails:addresses(),workspaceRole:'member'},uo);
  assert.equal(busy.json().code,'INVITATION_LIMIT');assert.match(busy.json().message,/200/);
  // 500 pending in a workspace (links count too).
  const v=await space();
  await f.admin.query(`INSERT INTO auth.invitations(id,workspace_id,kind,token_hash,workspace_role,inviter_id,workspace_name,inviter_name,expires_at,delivery,created_at)
    SELECT gen_random_uuid(),$1,'link',md5(random()::text)||md5(random()::text),'member',$2,'Проверка','Алиса',now()+interval '7 days','link',now()-interval '2 days' FROM generate_series(1,500)`,[v.ws,f.alice.id]);
  assert.equal((await call('POST','workspaces/'+v.ws+'/invitation-links',{workspaceRole:'member'})).json().code,'INVITATION_LIMIT');
  // Five new letters for one invitation at most.
  const wo=await someone('wanda'),w=await space(wo),email='five-'+randomUUID().slice(0,8)+'@example.org';
  const one=(await ok('POST','workspaces/'+w.ws+'/invitations',{emails:[email],workspaceRole:'member'},wo)).invitations[0];
  await f.admin.query("UPDATE auth.invitations SET resend_count=5, created_at=created_at-interval '1 hour' WHERE id=$1",[one.id]);
  const sixth=await call('POST','invitations/'+one.id+'/resend',{},wo);assert.equal(sixth.statusCode,429);assert.equal(sixth.json().code,'INVITATION_RESEND_LIMIT');
});

// Review R2 (F1, F3): regression tests for the permission fixes of R1.
test('R2 F1 without projects.oversee an existing preset only narrows, even when only an invitation uses it',async()=>{
  const s=await space(),a=await s.project('А'),kim=await someone('kim');
  await s.join(kim,'member');await s.add(a,kim,'admin');
  const k=(await ok('GET','workspaces/'+s.ws+'/members')).find((m:{id:string})=>m.id===kim.id);
  await ok('PUT','workspaces/'+s.ws+'/members/'+kim.id+'/access',{baseRevision:k.revision,granted:['workspace.settings'],revoked:[]});
  const intern=randomUUID();
  await ok('POST','workspaces/'+s.ws+'/presets',{id:intern,name:'Стажёр',permissions:[]});
  await ok('POST','workspaces/'+s.ws+'/invitation-links',{workspaceRole:'member',presetId:intern,projectIds:[a]});
  const current=(await ok('GET','workspaces/'+s.ws+'/presets',undefined,kim)).find((p:{id:string})=>p.id===intern);
  const wider=await call('PUT','workspaces/'+s.ws+'/presets/'+intern,{baseRevision:current.revision,name:'Стажёр',permissions:['finance.read']},kim);
  assert.equal(wider.statusCode,403);assert.equal(wider.json().code,'PERMISSION_EXCEEDS_ACTOR');
  await ok('PUT','workspaces/'+s.ws+'/presets/'+intern,{baseRevision:current.revision,name:'Стажёр · задачи',permissions:[]},kim);
});

test('R2 F3 agent grants, release dates, a personal removal of projects.create, handover checks, project invitation lists',async()=>{
  const s=await space(),p=await s.project('Регресс'),other=await s.project('Секретный'),lea=await someone('lea'),max=await someone('max');
  await s.join(lea,'member');await s.join(max,'member');await s.add(p,lea,'reader');await s.add(p,max,'editor');
  // F11 an agent never gets what its issuer lacks, and its membership is only as wide as the grant.
  const l=await s.row(p,lea.id);
  await ok('PUT','projects/'+p+'/members/'+lea.id+'/access',{baseRevision:l.revision,presetId:await s.presetOf('reader'),granted:['agents.manage'],revoked:[]});
  const beyond=await call('POST','projects/'+p+'/agents',{name:'Помощник',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600},lea);
  assert.equal(beyond.statusCode,403);assert.equal(beyond.json().code,'PERMISSION_EXCEEDS_ACTOR');
  const reader=await ok('POST','projects/'+p+'/agents',{name:'Читатель',capabilities:['tasks:read','maps:read'],expiresInSeconds:600},lea);
  const agent=(await f.admin.query('SELECT permissions FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p,reader.id])).rows[0].permissions;
  assert.deepEqual(agent,['tasks.read','maps.read']);
  // F13 the dates of a release need «Управлять релизами и спринтами»; a task's do not.
  await ok('PUT','projects/'+p+'/releases/r1',{baseRevision:0,value:{name:'Релиз 1',status:'planned',targetDate:null}});
  await ok('PUT','projects/'+p+'/tasks/t1',{baseRevision:0,task:{title:'Задача'}});
  const m=await s.row(p,max.id);
  await ok('PUT','projects/'+p+'/members/'+max.id+'/access',{baseRevision:m.revision,presetId:await s.presetOf('editor'),granted:[],revoked:['releases.manage']});
  const release=await call('POST','projects/'+p+'/planning/view/preview',{kind:'schedule',entityId:'r1',entityKind:'release',values:{start:'2026-11-01',end:'2026-11-10'}},max);
  assert.equal(release.statusCode,403);
  const task=await call('POST','projects/'+p+'/planning/view/preview',{kind:'schedule',entityId:'t1',entityKind:'task',values:{start:'2026-11-01',end:'2026-11-03'}},max);
  assert.equal(task.statusCode,200,task.body);
  const view=await ok('POST','projects/'+p+'/planning/view/groups',{},max);
  assert.equal(view.capabilities.createRelease,false);assert.equal(view.capabilities.createTask,true);
  // F10 a handover goes to an active person, at the revision the actor saw.
  const target=await s.row(p,lea.id);
  await f.admin.query('UPDATE auth.principals SET disabled_at=now() WHERE id=$1',[lea.id]);
  assert.equal((await call('POST','projects/'+p+'/members/'+lea.id+'/handover',{baseRevision:target.revision,presetId:await s.presetOf('editor')})).json().code,'HANDOVER_INVALID');
  await f.admin.query('UPDATE auth.principals SET disabled_at=NULL WHERE id=$1',[lea.id]);
  assert.equal((await call('POST','projects/'+p+'/members/'+lea.id+'/handover',{baseRevision:target.revision-1,presetId:await s.presetOf('editor')})).json().code,'CONFLICT');
  // F9 a project's invitation list names only that project.
  await ok('POST','workspaces/'+s.ws+'/invitation-links',{workspaceRole:'member',presetId:await s.presetOf('reader'),projectIds:[p,other]});
  const listed=await ok('GET','projects/'+p+'/invitations');
  assert.ok(listed.length>0&&listed.every((i:{projectNames:string[]})=>!i.projectNames.includes('Секретный')));
  // F14 a personal removal of «Создавать проекты» holds while members may create projects.
  const rules=await ok('GET','workspaces/'+s.ws+'/access');
  await ok('PUT','workspaces/'+s.ws+'/access',{baseRevision:rules.revision,projectsCreatedBy:'members',defaultMemberPresetId:null,defaultGuestPresetId:null});
  const mx=(await ok('GET','workspaces/'+s.ws+'/members')).find((x:{id:string})=>x.id===max.id);
  await ok('PUT','workspaces/'+s.ws+'/members/'+max.id+'/access',{baseRevision:mx.revision,granted:[],revoked:['projects.create']});
  assert.equal((await call('POST','projects',{workspaceId:s.ws,name:'Нельзя',slug:'no-'+randomUUID().slice(0,8),key:'NOPE'},max)).statusCode,403);
  assert.equal((await call('POST','projects',{workspaceId:s.ws,name:'Можно',slug:'yes-'+randomUUID().slice(0,8),key:'YES'},lea)).statusCode,200);
});
