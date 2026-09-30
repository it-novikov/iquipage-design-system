import {test} from 'node:test';import assert from 'node:assert/strict';
import {planLabel,parseDay,normalizePlan,planHelp,planPreset,monthGrid,spanDays,shortDay,onlyPlanChanged} from '../ui/src/board/plan-range.js';
import {PlanningOperation,commitInPlace} from '../ui/planning/src/operation.js';

test('the plan reads short in the current year, full otherwise, and one day as one date',()=>{
  assert.equal(planLabel('2026-09-29','2026-10-10',2026),'29.09 – 10.10');
  assert.equal(planLabel('2026-12-28','2027-01-08',2026),'28.12.2026 – 08.01.2027');
  assert.equal(planLabel('2026-10-04','2026-10-04',2026),'04.10');
  assert.equal(planLabel('2026-10-04',null,2026),'04.10');
  assert.equal(planLabel(null,null,2026),'');
  assert.equal(shortDay('2027-03-01',2026),'01.03.2027');
});
test('typed dates: dd.mm.yyyy, dd.mm for the current year, empty and invalid apart',()=>{
  assert.equal(parseDay('29.09.2026',2026),'2026-09-29');
  assert.equal(parseDay('4.10',2026),'2026-10-04');
  assert.equal(parseDay('04.10.27',2026),'2027-10-04');
  assert.equal(parseDay('  ',2026),'');
  assert.equal(parseDay('31.02.2026',2026),null);
  assert.equal(parseDay('завтра',2026),null);
});
test('saved plans keep their ends in order and a single end is a one-day plan',()=>{
  assert.deepEqual(normalizePlan('2026-10-10','2026-09-29'),{start:'2026-09-29',end:'2026-10-10'});
  assert.deepEqual(normalizePlan('2026-10-10',null),{start:'2026-10-10',end:'2026-10-10'});
  assert.deepEqual(normalizePlan(null,'2026-10-10'),{start:'2026-10-10',end:'2026-10-10'});
  assert.deepEqual(normalizePlan('',''),{start:null,end:null});
  assert.equal(spanDays('2026-09-29','2026-10-10'),12);
});
test('the rules are words under the calendar: a late start warns, it never blocks',()=>{
  assert.deepEqual(planHelp({start:'2026-09-29',end:'2026-10-10',deadline:'2026-10-14',year:2026}),{tone:'muted',text:'12 дней. Срок задачи 14.10 отмечен на календаре.'});
  assert.deepEqual(planHelp({start:'2026-10-05',end:'2026-10-10',deadline:'2026-10-04',year:2026}),{tone:'warning',text:'Начало не позже срока 04.10.'});
  assert.deepEqual(planHelp({start:'2026-10-01',end:'2026-10-08',deadline:'2026-10-05',year:2026}),{tone:'warning',text:'Конец позже срока 05.10: срок не сдвинется сам.'});
  assert.equal(planHelp({start:'2026-10-01',end:null,year:2026}).text,'Конец не задан: план на один день.');
  assert.equal(planHelp({start:'2026-10-10',end:'2026-10-01',year:2026}).tone,'warning');
  assert.equal(planHelp({start:'2026-10-01',end:'2026-10-01',year:2026}).text,'1 день.');
  assert.equal(planHelp({start:'2026-10-01',end:'2026-10-02',year:2026}).text,'2 дня.');
  assert.equal(planHelp({start:null,end:null,year:2026}).text,'Выберите начало и конец плана.');
});
test('presets start at the plan start or today and never end before they begin',()=>{
  assert.deepEqual(planPreset('week',{start:'2026-09-29',now:'2026-09-01'}),{start:'2026-09-29',end:'2026-10-05'});
  assert.deepEqual(planPreset('two-weeks',{start:null,now:'2026-09-30'}),{start:'2026-09-30',end:'2026-10-13'});
  assert.deepEqual(planPreset('deadline',{start:'2026-09-29',deadline:'2026-10-04'}),{start:'2026-09-29',end:'2026-10-04'});
  assert.deepEqual(planPreset('deadline',{start:'2026-10-09',deadline:'2026-10-04'}),{start:'2026-10-04',end:'2026-10-04'});
});
test('the month grid starts on Monday and fills whole weeks with the neighbouring days',()=>{
  const weeks=monthGrid(2026,9);
  assert.equal(weeks[0][0].value,'2026-09-28');assert.equal(weeks[0][0].inMonth,false);
  assert.equal(weeks[0][3].value,'2026-10-01');assert.equal(weeks[0][3].inMonth,true);
  assert.equal(weeks.at(-1).at(-1).value,'2026-11-01');
  assert.ok(weeks.every(week=>week.length===7));
});

const preview=(changes=1,extra={})=>({token:'plan.secret',expiresAt:new Date(Date.now()+60000).toISOString(),summary:'Затронуто задач: 1.',changes:Array.from({length:changes},(_,i)=>({label:'SPQ-'+i,description:'План'})),blockers:[],...extra});
const intent={kind:'schedule',entityKind:'task',entityId:'t1',values:{start:'2026-09-29',end:'2026-10-10'}};
test('a plan confirmed in place commits once when it touches only the task',async()=>{
  let commits=0;const keys=[];
  const adapter={preview:async()=>preview(),commit:async({idempotencyKey})=>{commits++;keys.push(idempotencyKey);return {state:'committed',operationId:'op-1'};},receipt:async()=>({state:'committed',operationId:'op-1'})};
  assert.equal(await commitInPlace(new PlanningOperation(adapter,'p1'),intent),'committed');
  assert.equal(commits,1);assert.equal(keys.length,1);
});
test('more effects or a blocker ask for the full check instead of committing',async()=>{
  let commits=0;const commit=async()=>{commits++;return {state:'committed',operationId:'op'};};
  assert.equal(await commitInPlace(new PlanningOperation({preview:async()=>preview(2),commit},'p1'),intent),'confirm');
  assert.equal(await commitInPlace(new PlanningOperation({preview:async()=>preview(1,{blockers:['Нужно уточнение']}),commit},'p1'),intent),'confirm');
  assert.equal(await commitInPlace(new PlanningOperation({preview:async()=>preview(1,{moreChanges:3}),commit},'p1'),intent),'confirm');
  assert.equal(commits,0);
});
test('a lost answer is checked by its receipt, never sent again; a rejection throws its reason',async()=>{
  let commits=0;
  const lost={preview:async()=>preview(),commit:async()=>{commits++;throw Error('timeout');},receipt:async()=>({state:'committed',operationId:'op-2'})};
  assert.equal(await commitInPlace(new PlanningOperation(lost,'p1'),intent),'committed');assert.equal(commits,1);
  const unknown={preview:async()=>preview(),commit:async()=>{throw Error('timeout');},receipt:async()=>({state:'pending'})};
  assert.equal(await commitInPlace(new PlanningOperation(unknown,'p1'),intent),'uncertain');
  const rejected={preview:async()=>preview(),commit:async()=>({state:'rejected',message:'Задача закрыта.'})};
  await assert.rejects(commitInPlace(new PlanningOperation(rejected,'p1'),intent),/Задача закрыта/);
  await assert.rejects(commitInPlace(new PlanningOperation({preview:async()=>{throw Error('План изменился.');}},'p1'),intent),/План изменился/);
});
test('after scheduling, a newer reading replaces the base revision only if nothing but the plan changed',()=>{
  const before={revision:5,title:'A',priority:'normal',tagIds:['b','a'],ownerId:null,plannedStart:null,plannedEnd:null,updatedAt:'x'};
  assert.equal(onlyPlanChanged(before,{...before,revision:6,plannedStart:'2026-10-01',plannedEnd:'2026-10-04',tagIds:['a','b'],updatedAt:'y'}),true);
  assert.equal(onlyPlanChanged(before,{...before,revision:7,priority:'critical',plannedStart:'2026-10-01'}),false);
  assert.equal(onlyPlanChanged(before,{...before,revision:7,tagIds:['a']}),false);
});
