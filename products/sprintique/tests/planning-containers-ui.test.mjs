import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ||= class {};
const model=await import('../ui/planning/src/containers-model.js');
const {formatEstimate,formatSum,parseEstimate,estimateMismatch}=await import('../ui/src/estimate.js');

const row=(id,extra={})=>({id,key:id.toUpperCase(),title:id,kind:'task',type:'task',parentId:null,depth:0,status:'ready',done:false,priority:'normal',ownerId:null,ownerLabel:'',due:null,
  estimate:null,estimateHours:null,estimatePoints:null,estimateMismatch:false,rank:1,revision:1,crumb:null,afterSprintEnd:false,noDue:false,rollup:null,...extra});
const summary={total:0,done:0,open:0,estimateHours:0,remainingHours:0,estimatePoints:0,remainingPoints:0,noDue:0};
const sprint=(rows,extra={})=>({id:'s1',kind:'sprint',state:'active',name:'Спринт 14',goal:null,start:'2026-09-28',end:'2026-10-11',deadline:null,revision:1,summary,rows,...extra});

test('estimates keep their unit; sums of time are hours; points stay apart',()=>{
  assert.equal(formatEstimate({value:6,unit:'h'}),'6 ч');assert.equal(formatEstimate({value:2,unit:'d'}),'2 д');
  assert.equal(formatEstimate({value:1,unit:'w'}),'1 нед');assert.equal(formatEstimate({value:5,unit:'sp'}),'5 SP');
  assert.equal(formatEstimate({value:1.5,unit:'d'}),'1,5 д');assert.equal(formatEstimate(null),'');
  assert.equal(formatSum(64,'time'),'64 ч');assert.equal(formatSum(21,'points'),'21 SP');assert.equal(formatSum(0,'time'),'');
  assert.deepEqual(parseEstimate('6'),{value:6,unit:'h'});assert.deepEqual(parseEstimate('2 д'),{value:2,unit:'d'});
  assert.deepEqual(parseEstimate('1нед'),{value:1,unit:'w'});assert.deepEqual(parseEstimate('2,5',{unit:'d'}),{value:2.5,unit:'d'});
  assert.deepEqual(parseEstimate('5 SP',{format:'points',unit:'sp'}),{value:5,unit:'sp'});assert.equal(parseEstimate('  '),null);
  for(const bad of ['0','10000','1,234','abc','3 мин'])assert.throws(()=>parseEstimate(bad),Error,bad);
  assert.throws(()=>parseEstimate('5 SP'),/во времени/);assert.throws(()=>parseEstimate('6 ч',{format:'points',unit:'sp'}),/story points/);
  assert.equal(estimateMismatch({value:5,unit:'sp'},'time'),true);assert.equal(estimateMismatch({value:5,unit:'h'},'time'),false);
});

test('dates speak in the head of a card: range, days left, start, release deadline',()=>{
  assert.equal(model.shortDate('2026-10-08','2026-10-01'),'8 окт');assert.equal(model.shortDate('2027-01-08','2026-10-01'),'8 янв 2027');
  assert.equal(model.dateRange('2026-09-28','2026-10-11','2026-10-01'),'28 сен – 11 окт');assert.equal(model.dateRange('2026-10-12','2026-10-25','2026-10-01'),'12 – 25 окт');
  assert.equal(model.whenLabel(sprint([]),'2026-10-01'),'28 сен – 11 окт · осталось 10 дней');
  assert.equal(model.whenLabel(sprint([],{state:'planned',start:'2026-10-12',end:'2026-10-25'}),'2026-10-01'),'12 – 25 окт · начнётся через 11 дней');
  assert.equal(model.whenLabel({kind:'release',state:'planned',deadline:'2026-10-30'},'2026-10-01'),'к 30 окт · через 29 дней');
  assert.equal(model.whenLabel({kind:'backlog'},'2026-10-01'),'');
  assert.equal(model.locative('Спринт 15'),'Спринте 15');assert.equal(model.locative('Релиз 1.0'),'Релизе 1.0');assert.equal(model.locative('Бэклог'),'бэклоге');
  assert.equal(model.shortPerson('Анна Коваленко'),'Анна К.');assert.equal(model.shortPerson('Бот (сервисный аккаунт)'),'Бот');
});

test('one sum per head: progress of the running sprint, size of the next, open and undated work of a release',()=>{
  const s={...summary,total:14,done:5,open:9,estimateHours:130,remainingHours:64,noDue:0};
  assert.deepEqual(model.summaryParts(sprint([],{summary:s}),'time'),[{strong:'5',text:' из 14 готово · осталось 64 ч'}]);
  assert.deepEqual(model.summaryParts(sprint([],{state:'planned',summary:{...s,total:10,estimateHours:132}}),'time'),[{strong:'10',text:' задач · 132 ч'}]);
  assert.deepEqual(model.summaryParts({kind:'release',state:'planned',summary:{...s,open:4,noDue:1}},'time'),[{strong:'4',text:' открытых'},{warning:'1 без срока'}]);
  assert.deepEqual(model.summaryParts({kind:'backlog',state:'backlog',summary:{...s,total:13}},'time'),[{strong:'13',text:' задач'}]);
  assert.deepEqual(model.summaryParts(sprint([],{summary}),'time'),[]);
});

test('done work goes below «Готово» with a count and a sum; done subtasks stay muted under an open epic',()=>{
  const epic=row('e',{kind:'epic',type:'epic',rollup:{here:{total:2,done:1,estimateHours:12,estimatePoints:0},elsewhere:[{containerId:'s2',name:'Спринт 15',count:1}]}});
  const rows=[epic,row('k1',{parentId:'e',depth:1,estimateHours:4}),row('k2',{parentId:'e',depth:1,done:true,status:'ready_for_release',estimateHours:8}),
    row('t1',{done:true,status:'ready_for_release',estimateHours:6,estimate:{value:6,unit:'h'}}),row('t2'),
    row('e2',{kind:'epic',type:'epic',rollup:{here:{total:1,done:1,estimateHours:3,estimatePoints:0},elsewhere:[]}}),row('k3',{parentId:'e2',depth:1,done:true,estimateHours:3})];
  const items=model.arrange(sprint(rows),{expanded:()=>true,format:'time'});
  assert.deepEqual(items.map(i=>i.type==='row'?`${i.row.id}${i.muted?'~':''}`:'|'),['e','k1','k2~','t2','|','t1~','e2~','k3~']);
  const divider=items.find(i=>i.type==='divider');assert.equal(model.dividerLabel(divider,'time'),'Готово · 2 · 9 ч');
  const collapsed=model.arrange(sprint(rows),{expanded:id=>id!=='e',format:'time'});
  assert.deepEqual(collapsed.filter(i=>i.type==='row').map(i=>i.row.id),['e','t2','t1','e2','k3']);
  assert.equal(model.asideOf(epic),'1 в Спринте 15');
  const release=model.arrange({...sprint(rows),kind:'release'},{expanded:()=>true,format:'time'});
  assert.equal(model.dividerLabel(release.find(i=>i.type==='divider'),'time'),'Готово · 2');
});

test('cells: a grey word only for review and testing, «done of total» for an epic, warnings for late or missing dates',()=>{
  const c=sprint([]),today='2026-10-01';
  assert.equal(model.cells(row('a',{status:'in_progress'}),c,'time',today).state,'');
  assert.equal(model.cells(row('a',{status:'review'}),c,'time',today).state,'ревью');
  assert.equal(model.cells(row('a',{status:'ready_for_testing'}),c,'time',today).state,'к тестированию');
  assert.equal(model.cells(row('a',{status:'testing'}),c,'time',today).state,'тестирование');
  const late=model.cells(row('a',{due:'2026-10-14',afterSprintEnd:true,ownerLabel:'Пётр Волков',estimate:{value:8,unit:'h'}}),c,'time',today);
  assert.deepEqual([late.due,late.dueWarning,late.owner,late.estimate],['14 окт',true,'Пётр В.','8 ч']);
  const epic=model.cells(row('e',{kind:'epic',rollup:{here:{total:4,done:2,estimateHours:31,estimatePoints:0},elsewhere:[]}}),c,'time',today);
  assert.deepEqual([epic.state,epic.owner,epic.estimate],['2 из 4','','31 ч']);
  const undated=model.cells(row('r',{noDue:true}),{...c,kind:'release'},'time',today);assert.deepEqual([undated.due,undated.dueWarning,undated.estimate],['без срока',true,'']);
});

test('defaults of a new sprint follow the last one; completion facts and the next sprint come from the page',()=>{
  const containers=[sprint([]),sprint([],{id:'s2',state:'planned',name:'Спринт 15',start:'2026-10-12',end:'2026-10-25'}),{id:'backlog',kind:'backlog',state:'backlog',name:'Бэклог',rows:[],summary}];
  assert.deepEqual(model.nextSprintDates(containers,'2026-10-01',14),{start:'2026-10-26',end:'2026-11-08'});
  assert.equal(model.nextSprintName(containers),'Спринт 16');
  assert.equal(model.nextSprint(containers,'s1').id,'s2');
  const facts=model.completionFacts(sprint([row('a',{afterSprintEnd:true}),row('b')],{summary:{...summary,done:5,open:9,remainingHours:64}}),'time');
  assert.deepEqual(facts,{done:5,open:9,remaining:'64 ч',late:1});
  assert.equal(model.validContainers({protocol:model.PROTOCOL,containers}),true);assert.equal(model.validContainers({protocol:'x',containers}),false);
});

test('no bullet lists in the product text of the planning page',async()=>{
  const {readFile}=await import('node:fs/promises');
  for(const file of ['ui/planning/src/containers-view.js','ui/planning/src/containers-dialogs.js','ui/planning/src/index.js','ui/src/estimate.js']){
    const text=await readFile(file,'utf8');
    assert.doesNotMatch(text,/<(ul|li)\b|[•●▪]/,file);
  }
});
