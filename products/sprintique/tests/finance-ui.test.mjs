import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,toDecimal,amountInput,formatMoney,fractionDigits,addMinor,currencyCodes,MAX_AMOUNT_MINOR} from '../ui/finance/src/money.js';
import {periodRange,entryStatus,entryContext,formatDate,formatMonth,ledgerQuery,plural,projectToday} from '../ui/finance/src/model.js';

const plain=text=>text.replace(/[  ]/g,' ');

test('FUI01 amounts typed the Russian or the English way become exact minor units',()=>{
  assert.equal(parseAmount('1 250,50','RUB'),125050);
  assert.equal(parseAmount('1250.5','RUB'),125050);
  assert.equal(parseAmount(' 12 000 ','RUB'),1200000);
  assert.equal(parseAmount('007','RUB'),700);
  assert.equal(parseAmount('1500','JPY'),1500);
  assert.equal(fractionDigits('KWD'),3);assert.equal(parseAmount('1,234','KWD'),1234);
  // ISO 4217, not the browser's locale data: IQD has three digits, RSD two, JPY none.
  assert.deepEqual(['IQD','RSD','JPY','RUB','XYZ'].map(fractionDigits),[3,2,0,2,2]);
  assert.equal(plain(formatMoney(1500,'IQD')).replace(/[^\d,]/g,''),'1,500');
  assert.equal(parseAmount('9999999999999,99','RUB'),MAX_AMOUNT_MINOR);
  for(const [text,message] of [['','Введите'],['12,345','После запятой'],['1,5','копейки',"JPY"],['-5','число'],['1e3','число'],['0,00','больше нуля'],['10000000000000','Слишком большая']]){
    assert.throws(()=>parseAmount(text,message==='копейки'?'JPY':'RUB'),new RegExp(message),text);
  }
});

test('FUI02 minor units print exactly, including sums beyond 2^53',()=>{
  assert.equal(toDecimal(125050,'RUB'),'1250.50');assert.equal(toDecimal('-5','RUB'),'-0.05');assert.equal(toDecimal(7,'JPY'),'7');
  assert.equal(amountInput(125050,'RUB'),'1250,50');
  assert.equal(plain(formatMoney(125050,'RUB')),'1 250,50 ₽');
  assert.equal(plain(formatMoney(-125050,'RUB',{sign:true})),'-1 250,50 ₽');
  assert.equal(plain(formatMoney(700,'USD',{sign:true})),'+7,00 $');
  assert.equal(plain(formatMoney('1999999999999998','RUB')),'19 999 999 999 999,98 ₽');
  assert.equal(addMinor('999999999999999','999999999999999','-250'),'1999999999999748');
  // Any ISO code can be chosen, with the codes in use and the common ones first.
  const codes=currencyCodes('CHF');assert.equal(codes[0],'CHF');assert.equal(codes[1],'RUB');assert.ok(codes.includes('KWD'));assert.equal(new Set(codes).size,codes.length);
});

test('FUI03 periods, statuses and the ledger query',()=>{
  const today='2026-09-29';
  assert.deepEqual(periodRange('month',today),{from:'2026-09-01',to:'2026-09-30'});
  assert.deepEqual(periodRange('previous-month',today),{from:'2026-08-01',to:'2026-08-31'});
  assert.deepEqual(periodRange('quarter',today),{from:'2026-07-01',to:'2026-09-30'});
  assert.deepEqual(periodRange('year',today),{from:'2026-01-01',to:'2026-12-31'});
  assert.deepEqual(periodRange('all',today),{from:null,to:null});
  assert.deepEqual(periodRange('previous-month','2026-01-15'),{from:'2025-12-01',to:'2025-12-31'});
  // "Today" follows the project's time zone: late evening in Moscow is already the next day in Vladivostok.
  const evening=new Date('2026-09-30T18:30:00Z');
  assert.equal(projectToday('Europe/Moscow',evening),'2026-09-30');assert.equal(projectToday('Asia/Vladivostok',evening),'2026-10-01');
  assert.equal(projectToday('Not/AZone',evening),'2026-09-30');
  assert.deepEqual(periodRange('month',projectToday('Asia/Vladivostok',evening)),{from:'2026-10-01',to:'2026-10-31'});
  assert.deepEqual(entryStatus({state:'planned',dueDate:'2026-09-28'},'2026-09-29'),{label:'Просрочена',tone:'warning'});
  assert.deepEqual(entryStatus({state:'planned',dueDate:'2026-09-29'},'2026-09-29'),{label:'Ожидается',tone:'info'});
  assert.equal(entryStatus({state:'voided'},today).tone,'danger');assert.equal(entryStatus({state:'posted'},today).label,'Проведена');
  assert.equal(entryContext({category:'Хостинг',counterparty:'ООО «Облако»'}),'Хостинг, ООО «Облако»');
  assert.equal(entryContext({category:'Хостинг',counterparty:null}),'Хостинг');
  assert.equal(formatDate('2026-09-10'),'10.09.2026');assert.equal(formatMonth('2026-09'),'Сентябрь 2026');
  assert.equal(ledgerQuery({state:'planned',period:'month',limit:50},today),'limit=50&state=planned&from=2026-09-01&to=2026-09-30');
  assert.equal(ledgerQuery({cursor:'abc'},today),'limit=50&cursor=abc');
  assert.deepEqual([1,2,5,11,21].map(n=>plural(n,['операция','операции','операций'])),['операция','операции','операций','операций','операция']);
});
