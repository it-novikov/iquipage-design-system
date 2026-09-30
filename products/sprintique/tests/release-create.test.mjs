import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInRelease as createInRunningRelease,commitIntent} from '../web/release-create.js';
import {runningRelease} from '../ui/src/board/model.js';

const release={id:'r1',name:'Спринт 12',lifecycle:'active',archivedAt:null,plannedEnd:'2026-10-10'};
const intent={kind:'taskCreate',taskId:'t1',task:{title:'Новая'},createInBoard:true};
const preview=()=>({token:'plan.secret',expiresAt:new Date(Date.now()+60000).toISOString(),summary:'Создать задачу',changes:[],blockers:[]});
/** A planning adapter that records what reached the server. */
function adapter(overrides={}){
  const calls=[];
  return {calls,projectId:'p1',preview:async request=>{calls.push(['preview',request.intent]);return preview();},
    commit:async request=>{calls.push(['commit',request.idempotencyKey]);return {state:'committed',operationId:'op-1'};},
    receipt:async()=>({state:'committed',operationId:'op-1'}),...overrides};
}
/** A client whose profile says whether to ask, and which records preference writes. */
function client(confirmReleaseScope=true){
  const writes=[];
  return {writes,request:async(path,method='GET',body)=>{
    if(path==='/profile'&&method==='GET')return {preferences:{confirmReleaseScope}};
    if(path==='/profile/preferences'&&method==='PUT'){writes.push(body);return body;}
    throw Error('unexpected '+method+' '+path);
  }};
}
const run=({port=adapter(),people=client(),answer={stopAsking:false},backlog=async()=>{throw Error('no backlog');}}={})=>{
  const asked=[],told=[];
  return {port,people,asked,told,result:createInRunningRelease({adapter:port,client:people,intent,release,createInBacklog:backlog,
    ask:async options=>{asked.push(options.release.name);return answer;},notify:message=>told.push(message)})};
};

test('the board asks before a new task joins the running release, then commits it through planning',async()=>{
  const r=run();assert.equal(await r.result,'release');
  assert.deepEqual(r.asked,['Спринт 12']);
  assert.deepEqual(r.port.calls.map(c=>c[0]),['preview','commit']);assert.deepEqual(r.port.calls[0][1],intent);
  assert.deepEqual(r.people.writes,[]);
});

test('a cancelled question creates nothing and keeps the form',async()=>{
  const r=run({answer:null});
  await assert.rejects(r.result,error=>error.cancelled===true);assert.deepEqual(r.port.calls,[]);
});

test('«Больше не показывать» is stored for the person, and then nobody asks',async()=>{
  const first=run({answer:{stopAsking:true}});await first.result;assert.deepEqual(first.people.writes,[{confirmReleaseScope:false}]);
  const later=run({people:client(false)});assert.equal(await later.result,'release');assert.deepEqual(later.asked,[]);
});

test('without the right to change the release scope the task goes to the backlog and the person is told',async()=>{
  let created=false;
  const refused=adapter({preview:async()=>{throw Object.assign(Error('Недостаточно прав.'),{status:403});}});
  const r=run({port:refused,backlog:async()=>{created=true;}});
  assert.equal(await r.result,'backlog');assert.equal(created,true);
  assert.equal(r.told.length,1);assert.equal(r.told[0].tone,'warning');assert.match(r.told[0].message,/бэклоге/);
});

test('a finished release, a blocker or a lost answer never pass as created',async()=>{
  const finished=adapter({preview:async()=>{throw Object.assign(Error('Релиз уже завершён.'),{status:409});}});
  await assert.rejects(commitIntent(finished,intent),/завершён/);
  const blocked=adapter({preview:async()=>({...preview(),blockers:['Задача-родитель в другом релизе.']})});
  await assert.rejects(commitIntent(blocked,intent),/родитель/);assert.equal(blocked.calls.length,0);
  let commits=0;
  const lost=adapter({commit:async()=>{commits++;throw Error('timeout');},receipt:async()=>({state:'pending'})});
  await assert.rejects(commitIntent(lost,intent),error=>error.uncertain===true);assert.equal(commits,1,'a lost answer is never sent twice');
  const settle=outcome=>createInRunningRelease({adapter:lost,client:client(false),intent,release,createInBacklog:async()=>{throw Error('no backlog');},ask:async()=>null,notify:()=>{},recover:async()=>outcome});
  assert.equal(await settle({state:'committed',operationId:'op-1'}),'release','a receipt that says committed means created');
  await assert.rejects(settle({state:'rejected',message:'Релиз уже завершён.'}),/завершён/,'a rejected receipt tells its reason');
  await assert.rejects(settle(null),error=>error.uncertain===true,'an unsettled answer is never taken for created');
  const answered=adapter({commit:async()=>{throw Error('timeout');}});
  assert.equal(await commitIntent(answered,intent),true,'the receipt settles a lost answer');
});

test('the running release is the active one; with several, the one that ends first',()=>{
  assert.equal(runningRelease([{...release,lifecycle:'planned'},{...release,id:'c',lifecycle:'closed'}]),null);
  assert.equal(runningRelease([{...release,id:'x',archivedAt:'2026-09-01'}]),null);
  assert.equal(runningRelease([{...release,id:'late',plannedEnd:'2026-12-01'},{...release,id:'soon',plannedEnd:'2026-10-01'},{...release,id:'open',plannedEnd:null}]).id,'soon');
});
