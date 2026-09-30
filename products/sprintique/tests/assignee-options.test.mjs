import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SERVICE_HEADING,assigneeLabel,assignable,avatarName,describeOwner,groupOwners,ownerOptions,ownerWarning} from '../ui/src/board/assignees.js';

// SPR-7: who the owner pickers offer and how a task owner reads on the board and in dialogs.
const alice={id:'alice',kind:'human',name:'Алиса',role:'admin'};
const reader={id:'reader',kind:'human',name:'Наблюдатель',role:'reader'};
// The repository names a service account with its owner for discussions and keeps its own name as accountName.
const robot={id:'robot',kind:'service',accountName:'Робот',name:'Робот (сервисный аккаунт Алиса)',role:'editor',ownerId:'alice',ownerName:'Алиса',suspended:false};
const members=[alice,reader,robot,
  {id:'paused',kind:'service',accountName:'Пауза',name:'Пауза (сервисный аккаунт Алиса)',role:'editor',ownerId:'alice',ownerName:'Алиса',suspended:true},
  {id:'watcher',kind:'service',accountName:'Смотритель',name:'Смотритель',role:'reader',ownerId:'alice',ownerName:'Алиса',suspended:false},
  {id:'capped',kind:'service',accountName:'Потолок',name:'Потолок',role:'editor',ownerId:'reader',ownerName:'Наблюдатель',suspended:false}];

test('owner options: nobody, people, then editing service accounts under their heading with their owner',()=>{
  const options=ownerOptions(members,{});
  assert.deepEqual(options.map(o=>o.value),['','alice','reader',SERVICE_HEADING,'robot']);
  const heading=options[3];assert.equal(heading.label,'Сервисные аккаунты');assert.equal(heading.disabled,true);assert.equal(heading.separator,true);
  assert.deepEqual(options[4],{value:'robot',label:'Робот (сервисный аккаунт)',description:'Владелец — Алиса',icon:'bolt'});
  assert.deepEqual(ownerOptions([alice,reader],{}).map(o=>o.value),['','alice','reader'],'no heading without accounts');
});

test('assignable: a suspended account, one that only reads, or one whose owner only reads is not offered',()=>{
  assert.deepEqual(members.filter(m=>assignable(m,members)).map(m=>m.id),['alice','reader','robot']);
  // With the permission catalog the members list carries permissions; they decide instead of the role.
  const catalog=[{...alice,permissions:['tasks.read','tasks.write']},{...robot,role:'reader',permissions:['tasks.read','tasks.write']}];
  assert.equal(assignable(catalog[1],catalog),true);
  assert.equal(assignable({...catalog[1],permissions:['tasks.read']},catalog),false);
});

test('the current owner stays visible and says why it can no longer be chosen',()=>{
  const suspended=ownerOptions(members,{ownerId:'paused',ownerKind:'service',ownerState:'suspended',ownerName:'Пауза'}).at(-1);
  assert.equal(suspended.label,'Пауза (сервисный аккаунт, приостановлен)');assert.match(suspended.description,/приостановлен/);
  const deleted=ownerOptions(members,{ownerId:'gone',ownerKind:'service',ownerState:'deleted',ownerName:'Старый'}).at(-1);
  assert.equal(deleted.label,'Старый (сервисный аккаунт, удалён)');
  // Without the task's own state (a summary), the members list tells a suspended account.
  assert.equal(ownerOptions(members,{ownerId:'paused'}).at(-1).label,'Пауза (сервисный аккаунт, приостановлен)');
  assert.equal(ownerOptions(members,{ownerId:'watcher',ownerKind:'service',ownerState:'active',ownerName:'Смотритель'}).at(-1).description,'Может только читать задачи проекта.');
  assert.deepEqual(ownerOptions(members,{ownerId:'left',owner:'Бывший участник'}).at(-1),{value:'left',label:'Бывший участник',description:'Больше не участник проекта'});
});

test('owner labels, warnings and avatar names',()=>{
  assert.equal(assigneeLabel({name:'Алиса',kind:'human',state:'former'}),'Алиса');
  assert.equal(assigneeLabel({name:'Робот',kind:'service',state:'active'}),'Робот (сервисный аккаунт)');
  assert.equal(assigneeLabel({name:'Робот',kind:'service',state:'former'}),'Робот (сервисный аккаунт, не в проекте)');
  assert.equal(avatarName('Робот (сервисный аккаунт, удалён)'),'Робот');assert.equal(avatarName('Алиса Смирнова'),'Алиса Смирнова');assert.equal(avatarName('(x)'),'(x)');
  assert.match(ownerWarning({ownerKind:'service',ownerState:'deleted'}),/удалён.*снимите назначение/);
  assert.equal(ownerWarning({ownerKind:'service',ownerState:'active'}),'');assert.equal(ownerWarning({ownerKind:'human',ownerState:'former'}),'');
});

test('describeOwner: from the task read, from the members for board summaries, and a former person stays anonymous',()=>{
  const people=new Map(members.map(m=>[m.id,m]));
  assert.deepEqual(describeOwner({ownerId:'robot',ownerName:'Робот',ownerKind:'service',ownerState:'deleted'},people),{owner:'Робот (сервисный аккаунт, удалён)',ownerKind:'service',ownerState:'deleted'});
  assert.deepEqual(describeOwner({ownerId:'robot'},people),{owner:'Робот (сервисный аккаунт)',ownerKind:'service',ownerState:'active'});
  assert.deepEqual(describeOwner({ownerId:'paused'},people),{owner:'Пауза (сервисный аккаунт, приостановлен)',ownerKind:'service',ownerState:'suspended'});
  assert.deepEqual(describeOwner({ownerId:'alice'},people),{owner:'Алиса',ownerKind:'human',ownerState:'active'});
  assert.equal(describeOwner({ownerId:'someone'},people).owner,'Бывший участник');
  assert.equal(describeOwner({ownerId:'someone',ownerName:'Иван',ownerKind:'human',ownerState:'former'},people).owner,'Иван');
  assert.deepEqual(describeOwner({ownerId:null,legacyOwner:'Пётр'},people),{owner:'Пётр',ownerKind:null,ownerState:null});
});

test('board filter: people first, then service accounts under one heading',()=>{
  const grouped=groupOwners([{id:'user:robot',name:'Робот (сервисный аккаунт)',kind:'service'},{id:'none',name:'Без исполнителя'},{id:'user:alice',name:'Алиса',kind:'human'},{id:'user:bot',name:'Бот (сервисный аккаунт)',kind:'service'}]);
  assert.deepEqual(grouped.map(o=>[o.id,o.group]),[['none',undefined],['user:alice',undefined],['user:robot','Сервисные аккаунты'],['user:bot',undefined]]);
});
