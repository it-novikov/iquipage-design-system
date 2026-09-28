import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,toDecimal,amountInput,formatMoney,fractionDigits,addMinor,MAX_AMOUNT_MINOR} from '../ui/finance/src/money.js';
import {periodRange,entryStatus,entryContext,formatDate,formatMonth,ledgerQuery,plural} from '../ui/finance/src/model.js';

const plain=text=>text.replace(/[  ]/g,' ');

test('FUI01 amounts typed the Russian or the English way become exact minor units',()=>{
  assert.equal(parseAmount('1 250,50','RUB'),125050);
  assert.equal(parseAmount('1250.5','RUB'),125050);
  assert.equal(parseAmount(' 12 000 ','RUB'),1200000);
  assert.equal(parseAmount('007','RUB'),700);
  assert.equal(parseAmount('1500','JPY'),1500);
  assert.equal(fractionDigits('KWD'),3);assert.equal(parseAmount('1,234','KWD'),1234);
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
});

test('FUI03 periods, statuses and the ledger query',()=>{
  const today=new Date(2026,8,29);
  assert.deepEqual(periodRange('month',today),{from:'2026-09-01',to:'2026-09-30'});
  assert.deepEqual(periodRange('previous-month',today),{from:'2026-08-01',to:'2026-08-31'});
  assert.deepEqual(periodRange('quarter',today),{from:'2026-07-01',to:'2026-09-30'});
  assert.deepEqual(periodRange('year',today),{from:'2026-01-01',to:'2026-12-31'});
  assert.deepEqual(periodRange('all',today),{from:null,to:null});
  assert.deepEqual(periodRange('previous-month',new Date(2026,0,15)),{from:'2025-12-01',to:'2025-12-31'});
  assert.deepEqual(entryStatus({state:'planned',dueDate:'2026-09-28'},'2026-09-29'),{label:'Просрочена',tone:'warning'});
  assert.deepEqual(entryStatus({state:'planned',dueDate:'2026-09-29'},'2026-09-29'),{label:'Ожидается',tone:'info'});
  assert.equal(entryStatus({state:'voided'}).tone,'danger');assert.equal(entryStatus({state:'posted'}).label,'Проведена');
  assert.equal(entryContext({category:'Хостинг',counterparty:'ООО «Облако»'}),'Хостинг, ООО «Облако»');
  assert.equal(entryContext({category:'Хостинг',counterparty:null}),'Хостинг');
  assert.equal(formatDate('2026-09-10'),'10.09.2026');assert.equal(formatMonth('2026-09'),'Сентябрь 2026');
  assert.equal(ledgerQuery({state:'planned',period:'month',limit:50},today),'limit=50&state=planned&from=2026-09-01&to=2026-09-30');
  assert.equal(ledgerQuery({cursor:'abc'},today),'limit=50&cursor=abc');
  assert.deepEqual([1,2,5,11,21].map(n=>plural(n,['операция','операции','операций'])),['операция','операции','операций','операций','операция']);
});
