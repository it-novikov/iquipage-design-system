import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogIndex,closure,compile,enable,disable,difference,source,within,wouldEnable,wouldDisable,can,accessSignature,projectPermissions} from '../web/permissions.js';
import {splitAddresses,validEmail,emailProblem,invitationBadge,isWaiting,invitationSummary,invitationState,goneState} from '../web/invitation-model.js';
// The server catalog (access/domain/Permission.kt): id and what it includes, in catalog order.
const groups=[{group:'Задачи',permissions:[['tasks.read'],['tasks.write','tasks.read']]},{group:'Обсуждения',permissions:[['threads.write','tasks.read']]},
  {group:'Планирование и релизы',permissions:[['releases.manage','tasks.write']]},{group:'Карты идей',permissions:[['maps.read','tasks.read'],['maps.write','maps.read']]},
  {group:'Финансы',permissions:[['finance.read','tasks.read'],['finance.write','finance.read']]},{group:'Агенты',permissions:[['approvals.decide','tasks.write'],['agents.manage','tasks.read']]},
  {group:'Участники',permissions:[['members.invite','tasks.read'],['members.manage','members.invite']]},{group:'Настройки',permissions:[['project.settings','tasks.read'],['project.access','members.manage','project.settings']]}]
  .map(g=>({group:g.group,permissions:g.permissions.map(([id,...includes])=>({id,title:id,description:'',includes}))}));
const index=catalogIndex(groups),set=(...ids)=>new Set(ids),list=s=>[...s];
const EDITOR=['tasks.write','threads.write','releases.manage','maps.write','finance.read','approvals.decide'];
const ALL=[...index.keys()];

test('closure adds what a permission includes, in catalog order',()=>{
  assert.deepEqual(list(closure(index,['project.access'])),['tasks.read','members.invite','members.manage','project.settings','project.access']);
  assert.deepEqual(list(closure(index,['releases.manage','unknown'])),['tasks.read','tasks.write','releases.manage']);
});
test('compile matches the server rule: removal takes whatever needs it, tasks.read always stays',()=>{
  assert.deepEqual(list(compile(index,{base:EDITOR,revoked:['tasks.write']})),['tasks.read','threads.write','maps.read','maps.write','finance.read']);
  assert.deepEqual(list(compile(index,{base:[],revoked:['tasks.read']})),['tasks.read']);
  assert.ok(!compile(index,{base:ALL,forbidden:['project.access']}).has('project.access'));
  assert.ok(compile(index,{base:ALL,forbidden:['project.access']}).has('members.manage'));
  assert.deepEqual(list(compile(index,{base:EDITOR,granted:['finance.write'],revoked:['releases.manage']})),['tasks.read','tasks.write','threads.write','maps.read','maps.write','finance.read','finance.write','approvals.decide']);
});
test('turning on brings its dependencies; turning off takes its dependents',()=>{
  const on=enable(index,set('tasks.read'),'finance.write');
  assert.deepEqual(list(on.effective),['tasks.read','finance.read','finance.write']);assert.deepEqual(on.also,['finance.read']);
  const off=disable(index,compile(index,{base:EDITOR}),'tasks.write');
  assert.deepEqual(off.also,['releases.manage','approvals.decide']);assert.ok(!off.effective.has('tasks.write'));
  assert.deepEqual(list(disable(index,set('tasks.read'),'tasks.read').effective),['tasks.read']);
  assert.deepEqual(wouldEnable(index,set('tasks.read'),'project.access'),['members.invite','members.manage','project.settings']);
  assert.deepEqual(wouldDisable(index,compile(index,{base:ALL}),'members.invite'),['members.manage','project.access']);
});
test('difference keeps the fewest additions and removals, and compiles back to the same set',()=>{
  const target=compile(index,{base:EDITOR,granted:['finance.write'],revoked:['releases.manage']});
  const change=difference(index,EDITOR,target);
  assert.deepEqual(change,{granted:['finance.write'],revoked:['releases.manage']});
  assert.deepEqual(list(compile(index,{base:EDITOR,...change})),list(target));
  const cascade=disable(index,compile(index,{base:EDITOR}),'tasks.write').effective,small=difference(index,EDITOR,cascade);
  assert.deepEqual(small.revoked,['tasks.write']);assert.deepEqual(list(compile(index,{base:EDITOR,...small})),list(cascade));
  assert.deepEqual(difference(index,EDITOR,compile(index,{base:EDITOR})),{granted:[],revoked:[]});
  // Every reachable set compiles back from its difference, whichever preset it started from.
  for(const preset of [[],EDITOR,ALL,['maps.read','finance.read']])for(const id of ALL)for(const on of [true,false]){
    const start=compile(index,{base:preset}),next=compile(index,{base:list((on?enable:disable)(index,start,id).effective)});
    assert.deepEqual(list(compile(index,{base:preset,...difference(index,preset,next)})),list(next),`${preset.join()} ${id} ${on}`);
  }
});
test('source labels and reach',()=>{
  const effective=compile(index,{base:EDITOR,granted:['finance.write'],revoked:['releases.manage']});
  assert.equal(source(index,EDITOR,effective,'tasks.write'),'preset');assert.equal(source(index,EDITOR,effective,'finance.write'),'added');
  assert.equal(source(index,EDITOR,effective,'releases.manage'),'removed');assert.equal(source(index,EDITOR,effective,'project.access'),'');
  assert.ok(within(index,EDITOR,list(compile(index,{base:EDITOR}))));assert.ok(!within(index,ALL,list(compile(index,{base:EDITOR}))));
});
test('session permissions, with the derived role as a fallback',()=>{
  assert.ok(can({permissions:['tasks.read','members.invite']},'members.invite'));assert.ok(!can({permissions:['tasks.read'],role:'admin'},'members.invite'));
  assert.ok(can({role:'admin'},'project.access'));assert.ok(!can({role:'reader'},'tasks.write'));assert.deepEqual(projectPermissions(null),[]);
  assert.equal(accessSignature({permissions:['b','a']}),'a,b');
});
test('pasted address lists split, keep the address of «Name <address>» and drop repeats',()=>{
  assert.deepEqual(splitAddresses('a@x.ru, b@x.ru;c@x.ru\nd@x.ru  A@X.RU'),['a@x.ru','b@x.ru','c@x.ru','d@x.ru']);
  assert.deepEqual(splitAddresses('Иван Петров <ivan@x.ru>; mailto:olga@x.ru',['olga@x.ru']),['ivan@x.ru']);
  assert.ok(validEmail('ivan.s@romashka.ru'));assert.ok(!validEmail('oleg@romashka'));assert.ok(!validEmail('olegromashka.ru'));
  assert.equal(emailProblem('oleg@romashka'),'без домена');assert.equal(emailProblem('oleg'),'нет символа @');assert.equal(emailProblem('a@b.ru'),'');
});
test('invitation badges, waiting and the recipient texts',()=>{
  const future=new Date(Date.now()+864e5).toISOString(),past=new Date(Date.now()-1e3).toISOString();
  assert.deepEqual(invitationBadge({state:'pending',kind:'email',delivery:'sent',expiresAt:future}),['Отправлено','info']);
  assert.deepEqual(invitationBadge({state:'pending',kind:'email',delivery:'failed',expiresAt:future}),['Не отправлено','danger']);
  assert.deepEqual(invitationBadge({state:'pending',kind:'email',delivery:'sent',expiresAt:past}),['Истекло','neutral']);
  assert.deepEqual(invitationBadge({state:'pending',kind:'link',delivery:'link',expiresAt:future}),['Активна','info']);
  assert.deepEqual(invitationBadge({state:'accepted'}),['Принято','success']);
  assert.ok(isWaiting({state:'expired'}));assert.ok(!isWaiting({state:'replaced'}));
  assert.equal(invitationSummary({workspaceRole:'member',projectNames:['Платформа','Сайт'],presetName:'Редактор'}),'Роль — участник пространства. Проекты: «Платформа» и «Сайт», пресет «Редактор».');
  assert.equal(invitationState('revoked')[0],'Приглашение отменено');assert.equal(invitationState('nonsense')[0],'Ссылка не работает');
  assert.equal(goneState('INVITATION_USED'),'accepted');assert.equal(goneState('FORBIDDEN'),'');
});
