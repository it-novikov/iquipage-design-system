import {test} from 'node:test';
import assert from 'node:assert/strict';
import {money,periodHint,shortDate,shortName,varianceWords,varianceTone,stateSentence,scaleLabel,tooltipText,overdueText,
  overdueOf,containerTitle,editorTitle,planOptions,categoryRows,editorLines,editorTotal,amountText} from '../ui/finance/src/overview-model.js';
import {ledgerQuery,dayBefore} from '../ui/finance/src/model.js';
import {formatMoney} from '../ui/finance/src/money.js';

const plain=text=>text.replace(/[\u00a0\u202f]/g,' ');
const side=(plan,fact,expected,variance)=>({plan,fact,expected,forecast:String(BigInt(fact)+BigInt(expected)),variance});
const overview=(state,{version={version:3,state:'approved'},expense=side('208000000','155200000','60300000','-7500000')}={})=>({
  plan:{id:'budget',name:'Весь проект',periodStart:'2026-09-01',periodEnd:'2026-12-31',releaseId:null,releaseName:null,releaseArchived:false},
  version,period:{from:'2026-09-01',to:'2026-12-31'},today:'2026-10-02',state,
  currencies:[{currencyCode:'RUB',income:side(null,'25000000','15000000',null),expense,net:{fact:'-130200000',forecast:'-175500000'},overdue:{count:3,income:'0',expense:'8600000'}}],
  categories:[]});

test('FOV01 money reads as summaries show it: no «,00» on whole amounts, a typographic minus, exact beyond 2^53',()=>{
  assert.equal(plain(money('208000000','RUB')),'2 080 000 ₽');
  assert.equal(plain(money('-12000000','RUB',{sign:true})),'−120 000 ₽');
  assert.equal(plain(money('7000000','RUB',{sign:true})),'+70 000 ₽');
  assert.equal(plain(money('125050','RUB')),'1 250,50 ₽');
  assert.equal(plain(money('1999999999999998','RUB')),'19 999 999 999 999,98 ₽');
  assert.equal(plain(formatMoney(125000,'RUB')),'1 250,00 ₽','the ledger keeps its kopecks');
  assert.equal(plain(amountText(132000000,'RUB')),'1 320 000');assert.equal(amountText(125050,'RUB'),'1 250,50');
});

test('FOV02 the one sentence of state follows the server code',()=>{
  const detail={currencyCode:'RUB',categoryId:'infra',categoryName:'Инфраструктура',direction:'expense',planned:true,amountMinor:'2500000'};
  assert.equal(plain(stateSentence(overview({code:'variance_unexplained',attentionCount:1,detail}))),'Прогноз расходов выше плана на 75 000 ₽, по категории Инфраструктура объяснения нет.');
  const within=side('208000000','100000000','60000000','48000000');
  assert.equal(stateSentence(overview({code:'within_plan',attentionCount:0,detail:null},{expense:within})),'Прогноз расходов в пределах плана.');
  assert.equal(plain(stateSentence(overview({code:'variance_unexplained',attentionCount:1,detail},{expense:within}))),'Прогноз расходов в пределах плана, но по категории Инфраструктура расходы выше плана на 25 000 ₽, объяснения нет.');
  assert.match(stateSentence(overview({code:'variance_unexplained',attentionCount:1,detail:{...detail,planned:false,categoryName:'Разное'}})),/расходов по категории Разное не было в плане, объяснения нет\.$/);
  assert.match(stateSentence(overview({code:'variance_explained',attentionCount:0,detail})),/, отклонения объяснены\.$/);
  assert.match(stateSentence(overview({code:'explanation_outdated',attentionCount:1,detail})),/прогноз по категории Инфраструктура изменился после объяснения\.$/);
  assert.equal(stateSentence({...overview({code:'no_plan',attentionCount:0,detail:null}),plan:null,version:null}),'Плана нет: операции видны, но отклонение оценить нельзя.');
  assert.equal(stateSentence(overview({code:'not_approved',attentionCount:0,detail:null},{version:null})),'План ещё не утверждён: операции видны, но отклонение оценить нельзя.');
  assert.equal(stateSentence(overview({code:'not_approved',attentionCount:0,detail:null},{version:{version:4,state:'draft'}})),'Показан черновик версии 4: план ещё не утверждён.');
});

test('FOV03 variance in words and tone: positive is good for expense and income alike',()=>{
  assert.equal(plain(varianceWords('-7500000','RUB')),'выше плана на 75 000 ₽');
  assert.equal(plain(varianceWords('7000000','RUB')),'ниже плана на 70 000 ₽');
  assert.equal(plain(varianceWords('-100','RUB','income')),'ниже плана на 1 ₽');
  assert.equal(varianceWords('0','RUB'),'по плану');assert.equal(varianceWords(null,'RUB'),'');
  assert.deepEqual(['-1','1','0',null].map(varianceTone),['danger','success','','']);
});

test('FOV04 period, dates and names read in Russian, in the project time zone',()=>{
  assert.equal(periodHint('2026-09-01','2026-12-31'),'сен — дек 2026');
  assert.equal(periodHint('2026-11-01','2027-02-28'),'ноя 2026 — фев 2027');
  assert.equal(periodHint('2026-09-01','2026-09-30'),'сентябрь 2026');
  assert.equal(shortDate('2026-09-27T22:30:00Z','Europe/Moscow',new Date('2026-10-02T00:00:00Z')),'28 сен');
  assert.equal(shortDate('2025-09-27T10:00:00Z','UTC',new Date('2026-10-02T00:00:00Z')),'27 сен 2025');
  assert.deepEqual([shortName('Аня Карпова'),shortName('Администратор'),shortName('')],['Аня К.','Администратор','']);
  assert.equal(containerTitle(null),'Весь проект');assert.equal(containerTitle({releaseName:'Релиз 1.0'}),'Релиз 1.0');
  assert.equal(editorTitle(null),'План на весь проект');assert.equal(editorTitle({releaseName:'Релиз 1.0'}),'План на релиз «Релиз 1.0»');
});

test('FOV05 scales and tooltips carry the same figures as text for screen readers',()=>{
  const row={categoryId:'c',categoryName:'Подрядчики',direction:'expense',currencyCode:'RUB',planned:true,plan:'120000000',fact:'98000000',expected:'34000000',forecast:'132000000',variance:'-12000000',
    note:{text:'Второй подрядчик',updatedAt:'2026-09-28T09:00:00Z',updatedBy:{id:'u',name:'Аня Карпова'},taskDisplayId:'SPR-212'}};
  assert.equal(plain(scaleLabel(row,'RUB')),'план 1 200 000 ₽, факт 980 000 ₽, ещё ожидается 340 000 ₽, прогноз 1 320 000 ₽: выше плана на 120 000 ₽.');
  assert.equal(plain(scaleLabel({plan:null,fact:'100',expected:'0',forecast:'100'},'RUB')),'плана нет, факт 1 ₽, ещё ожидается 0 ₽, прогноз 1 ₽.');
  assert.equal(plain(tooltipText(row,'UTC',new Date('2026-10-02T00:00:00Z'))),'План\t1 200 000 ₽\nФакт\t980 000 ₽\nЕщё ожидается\t340 000 ₽\nПрогноз\t1 320 000 ₽\nАня К., 28 сен · SPR-212');
  assert.doesNotMatch(tooltipText({...row,plan:null,note:null}),/План/);
});

test('FOV06 overdue line, plan options and the order of categories',()=>{
  assert.equal(plain(overdueText(3,'8600000','RUB')),'3 ожидаемые операции на 86 000 ₽ просрочены.');
  assert.equal(plain(overdueText(1,'100','RUB')),'1 ожидаемая операция на 1 ₽ просрочена.');
  assert.equal(plain(overdueText(5,'100','RUB')),'5 ожидаемых операций на 1 ₽ просрочены.');
  assert.equal(overdueText(0,'0','RUB'),'');
  assert.deepEqual(overdueOf({overdue:{count:2,income:'100',expense:'250'}}),{count:2,amount:'350'});
  assert.deepEqual(planOptions([{id:'a',name:'Весь проект',approvedVersion:3},{id:'b',name:'Релиз 1.0',approvedVersion:null}]),
    [{value:'a',label:'Весь проект',meta:'версия 3'},{value:'b',label:'Релиз 1.0',meta:'не утверждён'}]);
  const rows=[{categoryId:'x',direction:'expense',currencyCode:'RUB',forecast:'10'},{categoryId:'y',direction:'expense',currencyCode:'RUB',forecast:'30'},{categoryId:'z',direction:'expense',currencyCode:'USD',forecast:'99'},
    {categoryId:'in',direction:'income',currencyCode:'RUB',forecast:'500',planned:false},{categoryId:'in-plan',direction:'income',currencyCode:'RUB',forecast:'5',planned:true}];
  assert.deepEqual(categoryRows({version:{version:1},categories:rows},'RUB').rows.map(r=>r.categoryId),['x','y','in-plan'],'with a plan: the server order; income only where planned');
  const free=categoryRows({version:null,categories:rows},'RUB');
  assert.deepEqual([free.rows.map(r=>r.categoryId),free.max],[['y','x'],'30'],'without a plan: the largest forecast first, never another currency');
});

test('FOV07 editor lines: empty rows are left out, a half-filled row names the field, zero is a plan',()=>{
  const rows=[{index:0,categoryId:'c1',amount:'1 320 000',direction:'expense',currencyCode:'RUB',releaseId:'r1'},{index:1,categoryId:'',amount:'',direction:'expense'},
    {index:2,categoryId:'c2',amount:'0',direction:'expense',currencyCode:'RUB'},{index:3,categoryId:'c3',amount:'250,5',direction:'income',currencyCode:'RUB'}];
  const lines=editorLines(rows,'RUB');
  assert.deepEqual(lines.map(l=>[l.categoryId,l.amountMinor,l.releaseId,l.direction]),[['c1',132000000,'r1','expense'],['c2',0,null,'expense'],['c3',25050,null,'income']]);
  assert.equal(editorTotal(lines,'RUB'),'132000000','the total is the expense side');
  assert.throws(()=>editorLines([{index:4,categoryId:'c1',amount:''}],'RUB'),e=>e.row===4&&e.field==='amount');
  assert.throws(()=>editorLines([{index:5,categoryId:'',amount:'10'}],'RUB'),e=>e.row===5&&e.field==='category');
  assert.throws(()=>editorLines([{index:6,categoryId:'c',amount:'abc'}],'RUB'),e=>e.field==='amount'&&/число/.test(e.message));
});

test('FOV08 «В журнал» opens the ledger on overdue expectations',()=>{
  assert.equal(dayBefore('2026-10-01'),'2026-09-30');assert.equal(dayBefore('2026-01-01'),'2025-12-31');
  assert.equal(ledgerQuery({overdue:true,period:'month',state:'posted'},'2026-10-02'),'limit=50&state=planned&to=2026-10-01');
});
