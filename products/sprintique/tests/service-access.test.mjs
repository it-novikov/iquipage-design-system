import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogIndex,difference,serviceBase,serviceForbidden,serviceEffective,inactiveGrants,serviceSources,workspaceRowRights,mayCreateProjects} from '../web/permissions.js';
import {invitationRights} from '../web/invitation-model.js';
// The server catalog (access/domain/Permission.kt) with what service accounts may hold.
const rows=[['tasks.read','preset'],['tasks.write','preset','tasks.read'],['threads.write','preset','tasks.read'],['releases.manage','preset','tasks.write'],
  ['maps.read','preset','tasks.read'],['maps.write','preset','maps.read'],['finance.read','explicit','tasks.read'],['finance.write','explicit','finance.read'],
  ['approvals.decide','never','tasks.write'],['agents.manage','never','tasks.read'],['members.invite','never','tasks.read'],['members.manage','never','members.invite'],
  ['project.settings','never','tasks.read'],['project.access','never','members.manage','project.settings']];
const index=catalogIndex([{group:'Все',permissions:rows.map(([id,service,...includes])=>({id,title:id,description:'',includes,service}))}]);
const list=s=>[...s],ALL=[...index.keys()];
const SERVICE_READ=['tasks.read','maps.read'],SERVICE_TASKS=['tasks.write','threads.write','maps.read'];
const READER=['tasks.read','threads.write','maps.read','finance.read'];

test('a service preset brings only what service accounts may hold by preset',()=>{
  assert.deepEqual(serviceBase(index,[...SERVICE_TASKS,'finance.read','members.manage']),SERVICE_TASKS);
  assert.ok(serviceForbidden(index,ALL).includes('project.access'));
  assert.ok(!serviceForbidden(index,ALL).includes('finance.write'));
  assert.ok(serviceForbidden(index,READER).includes('tasks.write'),'what the owner lacks');
  assert.equal(serviceForbidden(index,null).filter(id=>id!=='tasks.read').length,ALL.length-1,'no owner in the project: nothing');
});
test('the account never holds more than its owner, and explicit finance only when added',()=>{
  assert.deepEqual(list(serviceEffective(index,{preset:SERVICE_TASKS,owner:ALL})),['tasks.read','tasks.write','threads.write','maps.read']);
  assert.deepEqual(list(serviceEffective(index,{preset:SERVICE_TASKS,owner:READER})),['tasks.read','threads.write','maps.read']);
  assert.deepEqual(list(serviceEffective(index,{preset:SERVICE_READ,granted:['finance.read'],owner:READER})),['tasks.read','maps.read','finance.read']);
  assert.deepEqual(list(serviceEffective(index,{preset:SERVICE_READ,granted:['finance.write'],owner:READER})),['tasks.read','maps.read','finance.read'],'the owner only reads finance: reading stays');
  assert.ok(!serviceEffective(index,{preset:SERVICE_READ,granted:['approvals.decide'],owner:ALL}).has('approvals.decide'),'never, even when added');
  assert.deepEqual(list(serviceEffective(index,{preset:SERVICE_TASKS,owner:null})),['tasks.read']);
});
test('a grant within the owner is what the server accepts: the preset with what the owner lacks removed',()=>{
  const effective=serviceEffective(index,{preset:SERVICE_TASKS,owner:['tasks.read','maps.read']});
  assert.deepEqual(difference(index,serviceBase(index,SERVICE_TASKS),effective),{granted:[],revoked:['tasks.write','threads.write']});
  const withFinance=serviceEffective(index,{preset:SERVICE_READ,granted:['finance.read'],owner:READER});
  assert.deepEqual(difference(index,SERVICE_READ,withFinance),{granted:['finance.read'],revoked:[]});
});
test('additions the owner lost since are named as not applying',()=>{
  assert.deepEqual(inactiveGrants(index,['finance.write','maps.write'],READER),['maps.write','finance.write']);
  assert.deepEqual(inactiveGrants(index,['finance.read'],READER),[]);
});
test('«Что может» of a service account from its row',()=>{
  const sources=serviceSources(index,{permissions:['tasks.read','threads.write','maps.read','finance.read'],added:['finance.read'],removed:['tasks.write']},SERVICE_TASKS);
  assert.equal(sources['maps.read'],'preset');assert.equal(sources['finance.read'],'added');assert.equal(sources['tasks.write'],'removed');
  assert.equal(sources['project.access'],'forbidden');assert.equal(sources['maps.write'],'absent');
});
test('what the owner\'s ceiling takes reads as unavailable, not as removed',()=>{
  // «Сервис: задачи» under an owner who only reads: nobody removed tasks.write, the owner lacks it.
  const sources=serviceSources(index,{permissions:['tasks.read','threads.write','maps.read'],granted:['finance.write'],added:['finance.write'],removed:[]},SERVICE_TASKS);
  assert.equal(sources['tasks.write'],'forbidden');assert.equal(sources['finance.write'],'forbidden');assert.equal(sources['threads.write'],'preset');
});

test('workspace people: nobody touches the owner row; only the owner changes administrators; appointing needs all five',()=>{
  const OWNER={actorId:'o',role:'owner',permissions:['workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings']};
  const ADMIN={actorId:'a',role:'admin',permissions:OWNER.permissions};
  const MANAGER={actorId:'m',role:'member',permissions:['workspace.invite','workspace.people']};
  const owner={id:'o',role:'owner'},admin={id:'a2',role:'admin',permissions:OWNER.permissions},member={id:'x',role:'member',permissions:[]},guest={id:'g',role:'guest',permissions:[]};
  assert.deepEqual(workspaceRowRights(ADMIN,owner),{roles:[],remove:false,transfer:false});
  assert.deepEqual(workspaceRowRights(ADMIN,admin),{roles:[],remove:false,transfer:false});
  assert.deepEqual(workspaceRowRights(OWNER,admin),{roles:['admin','member','guest'],remove:true,transfer:true});
  assert.deepEqual(workspaceRowRights(ADMIN,member).roles,['admin','member','guest']);
  assert.deepEqual(workspaceRowRights(MANAGER,member),{roles:['member','guest'],remove:true,transfer:false});
  assert.deepEqual(workspaceRowRights(MANAGER,guest).roles,['guest','member']);
  assert.deepEqual(workspaceRowRights(MANAGER,{id:'y',role:'member',permissions:['projects.oversee']}),{roles:[],remove:false,transfer:false},'wider than the actor');
  assert.deepEqual(workspaceRowRights({actorId:'z',role:'member',permissions:[]},member),{roles:[],remove:false,transfer:false});
  assert.deepEqual(workspaceRowRights(OWNER,{id:'o',role:'owner'}).remove,false);
});
test('creating projects: permissions for the owner and administrators, the rule without a personal revocation for members',()=>{
  assert.equal(mayCreateProjects({role:'owner',permissions:['projects.create']}),true);
  assert.equal(mayCreateProjects({role:'admin',permissions:['workspace.people']}),false,'the owner took it away');
  assert.equal(mayCreateProjects({role:'member',permissions:[]},{projectsCreatedBy:'members',permissions:['projects.create']}),true);
  assert.equal(mayCreateProjects({role:'member',permissions:[]},{projectsCreatedBy:'members',permissions:[]}),false,'revoked personally');
  assert.equal(mayCreateProjects({role:'member',permissions:[]},{projectsCreatedBy:'members'}),true,'an older answer: the rule');
  assert.equal(mayCreateProjects({role:'member',permissions:[]},{projectsCreatedBy:'admins',permissions:[]}),false);
  assert.equal(mayCreateProjects({role:'guest',permissions:[]},{projectsCreatedBy:'members',permissions:[]}),false);
});
test('invitation actions follow the server: the project it came from, the author, people managers',()=>{
  const here=id=>id==='p1';
  const fromHere={fromProjectId:'p1',inviterId:'someone'},fromThere={fromProjectId:'p2',inviterId:'someone'},space={fromProjectId:null,inviterId:'me'};
  assert.deepEqual(invitationRights(fromHere,{actorId:'me',workspacePermissions:[],projectInvite:here}),{resend:true,revoke:true});
  assert.deepEqual(invitationRights(fromThere,{actorId:'me',workspacePermissions:[],projectInvite:here}),{resend:false,revoke:false});
  assert.deepEqual(invitationRights(space,{actorId:'me',workspacePermissions:[],projectInvite:here}),{resend:false,revoke:false});
  assert.deepEqual(invitationRights(space,{actorId:'me',workspacePermissions:['workspace.invite'],projectInvite:here}),{resend:true,revoke:true});
  assert.deepEqual(invitationRights({...space,inviterId:'other'},{actorId:'me',workspacePermissions:['workspace.invite'],projectInvite:here}),{resend:true,revoke:false});
  assert.deepEqual(invitationRights(fromThere,{actorId:'me',workspacePermissions:['workspace.invite','workspace.people'],projectInvite:here}),{resend:false,revoke:true});
  // Inviting an administrator again needs all five workspace permissions.
  const admin={...space,workspaceRole:'admin'},all=['workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings'];
  assert.equal(invitationRights(admin,{actorId:'me',workspacePermissions:['workspace.invite'],projectInvite:here}).resend,false);
  assert.equal(invitationRights(admin,{actorId:'me',workspacePermissions:all,projectInvite:here}).resend,true);
});
