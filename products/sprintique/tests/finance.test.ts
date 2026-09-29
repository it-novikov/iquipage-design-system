import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
import {FinanceEntryResponse,FinanceEntryPageResponse,FinanceEntryHistoryResponse,FinanceSummaryResponse,FinanceSettingsResponse} from '../contracts/finance.js';
import type {FinanceEntry} from '../contracts/finance.js';

let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{
  f=await fixture({prefix:'FN'});
  // Борис edits tasks in the first project but does not administer it.
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[f.first.id,f.bob.id]);
});
after(async()=>{await f?.close();});
type User=typeof f.alice;
const path=(resource:string,project=f.first.id)=>`/api/v1/projects/${project}/${resource}`;
const call=(method:'GET'|'POST'|'PUT'|'PATCH',resource:string,payload?:unknown,user:User=f.alice,key=randomUUID(),project=f.first.id)=>
  f.app.inject({method,url:path(resource,project),headers:{...user.headers,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
const posted={direction:'expense',state:'posted',amountMinor:1250050,currencyCode:'RUB',postedDate:'2026-09-10',category:'Хостинг',description:'Серверы за сентябрь',counterparty:'ООО «Облако»',reference:'Счёт 42'};
const planned={direction:'income',state:'planned',amountMinor:30000000,currencyCode:'RUB',dueDate:'2026-10-05',category:'Оплата заказчика',description:'Второй этап'};
async function create(id:string,value:Record<string,unknown>,user:User=f.alice){
  const response=await call('PUT','finance-entries/'+id,{baseRevision:0,value},user);assert.equal(response.statusCode,200,response.body);
  return FinanceEntryResponse.parse(response.json());
}

test('FN01 an administrator records entries; CAS, retries and history follow every revision',async()=>{
  const key=randomUUID(),body={baseRevision:0,value:posted};
  const first=await call('PUT','finance-entries/fn01-hosting',body,f.alice,key);assert.equal(first.statusCode,200,first.body);
  const entry=FinanceEntryResponse.parse(first.json());
  assert.equal(entry.state,'posted');assert.equal(entry.amountMinor,1250050);assert.equal(entry.entryDate,'2026-09-10');assert.equal(entry.dueDate,null);
  assert.equal(entry.revision,1);assert.equal(entry.createdByName,'Алиса');assert.equal(entry.counterparty,'ООО «Облако»');
  // The same key and body replays the stored answer without a second revision; another body under that key conflicts.
  assert.deepEqual((await call('PUT','finance-entries/fn01-hosting',body,f.alice,key)).json(),first.json());
  const reused=await call('PUT','finance-entries/fn01-hosting',{...body,value:{...posted,amountMinor:1}},f.alice,key);
  assert.equal(reused.statusCode,409);assert.equal(reused.json().code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await call('PUT','finance-entries/fn01-hosting',body)).json().code,'CONFLICT');
  const edited=await call('PUT','finance-entries/fn01-hosting',{baseRevision:1,value:{...posted,amountMinor:1300000,counterparty:null,reference:null}});
  assert.equal(edited.statusCode,200,edited.body);assert.equal(edited.json().revision,2);assert.equal(edited.json().counterparty,null);
  // Text is trimmed and optional text may be left out.
  const trimmed=await create('fn01-trimmed',{...planned,category:'  Аванс ',description:' Предоплата  '});
  assert.equal(trimmed.category,'Аванс');assert.equal(trimmed.description,'Предоплата');assert.equal(trimmed.counterparty,null);
  const history=FinanceEntryHistoryResponse.parse((await call('GET','finance-entries/fn01-hosting/history')).json());
  assert.deepEqual(history.items.map(v=>[v.revision,v.change,v.amountMinor]),[[2,'updated',1300000],[1,'created',1250050]]);
  assert.equal(history.items[1]!.reference,'Счёт 42');assert.equal(history.nextCursor,null);
  const audit=(await f.admin.query("SELECT action,revision FROM app.audit_events WHERE project_id=$1 AND resource_id='fn01-hosting' ORDER BY created_at",[f.first.id])).rows;
  assert.deepEqual(audit.map(r=>[r.action,r.revision]),[['finance-entry.created',1],['finance-entry.updated',2]]);
  assert.equal((await call('GET','finance-entries/missing')).statusCode,404);
  // Retry receipts name the entry and its revision; amounts and texts stay in the finance tables.
  const receipts=(await f.admin.query("SELECT result FROM app.idempotency WHERE project_id=$1 AND operation LIKE 'finance-entry%'",[f.first.id])).rows;
  assert.ok(receipts.length>0);for(const {result} of receipts)assert.deepEqual(Object.keys(result).sort(),['id','revision']);
});

test('FN02 posting records the actual date and amount; voiding needs a reason, is final and leaves the entry immutable',async()=>{
  const entry=await create('fn02-invoice',planned);
  assert.equal((await call('PUT','finance-entries/fn02-invoice',{baseRevision:1,value:{...planned,state:'posted',postedDate:'2026-10-01',dueDate:null}})).json().code,'FINANCE_STATE_CHANGE');
  const postedEntry=await call('PATCH','finance-entries/fn02-invoice/state',{state:'posted',baseRevision:entry.revision,postedDate:'2026-10-07',amountMinor:29500000});
  assert.equal(postedEntry.statusCode,200,postedEntry.body);
  const value=FinanceEntryResponse.parse(postedEntry.json());
  assert.deepEqual([value.state,value.postedDate,value.dueDate,value.entryDate,value.amountMinor,value.revision],['posted','2026-10-07','2026-10-05','2026-10-07',29500000,2]);
  assert.equal((await call('PATCH','finance-entries/fn02-invoice/state',{state:'posted',baseRevision:2,postedDate:'2026-10-08',amountMinor:1})).json().code,'FINANCE_ENTRY_POSTED');
  assert.equal((await call('PATCH','finance-entries/fn02-invoice/state',{state:'voided',baseRevision:2,voidReason:'   '})).statusCode,400);
  assert.equal((await call('PATCH','finance-entries/fn02-invoice/state',{state:'voided',baseRevision:2})).statusCode,400);
  const key=randomUUID(),voiding={state:'voided',baseRevision:2,voidReason:'Платёж возвращён заказчику'};
  const voided=await call('PATCH','finance-entries/fn02-invoice/state',voiding,f.alice,key);assert.equal(voided.statusCode,200,voided.body);
  assert.equal(voided.json().state,'voided');assert.equal(voided.json().voidReason,'Платёж возвращён заказчику');assert.equal(voided.json().amountMinor,29500000);
  assert.deepEqual((await call('PATCH','finance-entries/fn02-invoice/state',voiding,f.alice,key)).json(),voided.json());
  for(const response of [
    await call('PATCH','finance-entries/fn02-invoice/state',{...voiding,baseRevision:3}),
    await call('PUT','finance-entries/fn02-invoice',{baseRevision:3,value:{...planned,state:'posted',postedDate:'2026-10-07'}})
  ]){assert.equal(response.statusCode,409,response.body);assert.equal(response.json().code,'FINANCE_ENTRY_VOIDED');}
  const history=FinanceEntryHistoryResponse.parse((await call('GET','finance-entries/fn02-invoice/history')).json());
  assert.deepEqual(history.items.map(v=>[v.revision,v.change,v.state]),[[3,'voided','voided'],[2,'posted','posted'],[1,'created','planned']]);
  // A planned entry may be voided directly and keeps its due date.
  const cancelled=await create('fn02-cancelled',planned);
  const direct=await call('PATCH','finance-entries/fn02-cancelled/state',{state:'voided',baseRevision:cancelled.revision,voidReason:'Этап отменён'});
  assert.equal(direct.statusCode,200,direct.body);assert.equal(direct.json().dueDate,'2026-10-05');assert.equal(direct.json().postedDate,null);
});

test('FN03 people of the project read finance, only administrators change it; agents and other projects are refused',async()=>{
  await create('fn03-visible',posted);
  assert.equal((await call('PUT','tasks/fn03-task',{baseRevision:0,task:{title:'Задача, которую видит агент'}})).statusCode,200);
  for(const user of [f.reader,f.bob]){
    assert.equal((await call('GET','finance-entries',undefined,user)).statusCode,200);
    assert.equal((await call('GET','finance-entries/fn03-visible',undefined,user)).statusCode,200);
    assert.equal((await call('GET','finance-summary',undefined,user)).statusCode,200);
    assert.equal((await call('GET','finance-settings',undefined,user)).statusCode,200);
    for(const response of [
      await call('PUT','finance-entries/fn03-forbidden',{baseRevision:0,value:posted},user),
      await call('PUT','finance-entries/fn03-visible',{baseRevision:1,value:posted},user),
      await call('PATCH','finance-entries/fn03-visible/state',{state:'voided',baseRevision:1,voidReason:'Нет'},user),
      await call('PUT','finance-settings',{baseRevision:0,value:{currencyCode:'USD'}},user),
    ]){assert.equal(response.statusCode,403,response.body);}
  }
  // The rules of the contract stay hidden from people who may not write: the fence answers before the body is read.
  assert.equal((await call('PUT','finance-entries/fn03-forbidden',{nonsense:true},f.reader)).statusCode,403);
  assert.equal((await call('GET','finance-entries',undefined,f.alice,randomUUID(),f.second.id)).statusCode,404);
  assert.equal((await call('PUT','finance-entries/fn03-foreign',{baseRevision:0,value:posted},f.alice,randomUUID(),f.second.id)).statusCode,404);
  assert.equal((await f.app.inject({url:path('finance-entries')})).statusCode,401);
  const grant=await call('POST','agents',{name:'Finance probe',capabilities:['tasks:read','tasks:write','threads:read','maps:read'],expiresInSeconds:600});
  assert.equal(grant.statusCode,200,grant.body);
  const agent={authorization:'Bearer '+grant.json().token};
  for(const url of ['finance-entries','finance-entries/fn03-visible','finance-entries/fn03-visible/history','finance-summary','finance-settings']){
    const response=await f.app.inject({url:path(url),headers:agent});assert.equal(response.statusCode,403,url+': '+response.body);
  }
  const write=await f.app.inject({method:'PUT',url:path('finance-entries/fn03-agent'),headers:{...agent,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:posted}});
  assert.equal(write.statusCode,403);
  // Finance events reach the people of the project, never an agent.
  const topics=async(headers:Record<string,string>)=>{
    const items:{topic:string}[]=[];let cursor='';
    for(;;){const page=(await f.app.inject({url:path('events'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),headers})).json();items.push(...page.items);if(!page.hasMore)break;cursor=page.cursor;}
    return items.map(item=>item.topic);
  };
  assert.ok((await topics(f.reader.headers)).includes('finance-entry.created'));
  const agentTopics=await topics(agent);assert.ok(agentTopics.length>0);assert.ok(!agentTopics.some(topic=>topic.startsWith('finance-')));
  const stored=(await f.admin.query("SELECT count(*)::int AS n FROM app.finance_entry WHERE id LIKE 'fn03-forbidden%' OR id IN ('fn03-agent','fn03-foreign')")).rows[0].n;
  assert.equal(stored,0);
});

test('FN04 the database refuses finance writes outside the policy, even for a project member',async()=>{
  await create('fn04-policy',posted);
  // A reader with a live session: row security lets them read but not insert, change or remove.
  const reader={token:f.reader.headers.cookie.split('=')[1]!,kind:'session' as const};
  const visible=await f.db.authenticated(reader,tx=>tx.query("SELECT count(*)::int AS n FROM app.finance_entry WHERE project_id=$1 AND id='fn04-policy'",[f.first.id]));
  assert.equal(visible.rows[0].n,1);
  await assert.rejects(f.db.authenticated(reader,tx=>tx.query(`INSERT INTO app.finance_entry(project_id,id,direction,state,amount_minor,currency_code,posted_date,category,description,revision,created_by,updated_by)
    VALUES($1,'fn04-sql','income','posted',100,'RUB','2026-09-01','x','y',1,$2,$2)`,[f.first.id,f.reader.id])),/row-level security/);
  const changed=await f.db.authenticated(reader,tx=>tx.query("UPDATE app.finance_entry SET description='hijack',revision=revision+1 WHERE project_id=$1 AND id='fn04-policy'",[f.first.id]));
  assert.equal(changed.rowCount,0);
  await assert.rejects(f.db.authenticated(reader,tx=>tx.query("DELETE FROM app.finance_entry WHERE project_id=$1",[f.first.id])),/permission denied/);
  // Versions are append-only for the administrator too.
  const alice={token:f.alice.headers.cookie.split('=')[1]!,kind:'session' as const};
  await assert.rejects(f.db.authenticated(alice,tx=>tx.query("UPDATE app.finance_entry_version SET amount_minor=1 WHERE project_id=$1",[f.first.id])),/permission denied/);
  await assert.rejects(f.db.authenticated(alice,tx=>tx.query("DELETE FROM app.finance_entry_version WHERE project_id=$1",[f.first.id])),/permission denied/);
  // Outside the project nothing is visible.
  const bob={token:f.bob.headers.cookie.split('=')[1]!,kind:'session' as const};
  const hidden=await f.db.authenticated(bob,tx=>tx.query('SELECT count(*)::int AS n FROM app.finance_entry WHERE project_id=$1',[f.second.id]));
  assert.equal(hidden.rows[0].n,0);
});

test('FN05 the summary totals each currency without voided entries, keeps plan apart and splits by month and category',async()=>{
  const created=await f.app.inject({method:'POST',url:'/api/v1/projects',headers:f.alice.headers,payload:{workspaceId:f.first.workspaceId,name:'Финансы проекта',slug:'fn05-'+randomUUID().slice(0,8),key:'FNSUM'}});
  assert.equal(created.statusCode,200,created.body);const project=created.json<{id:string}>();
  const at=(resource:string,payload?:unknown,method:'GET'|'PUT'|'PATCH'='GET')=>call(method,resource,payload,f.alice,randomUUID(),project.id);
  const put=async(id:string,value:Record<string,unknown>)=>{const r=await at('finance-entries/'+id,{baseRevision:0,value},'PUT');assert.equal(r.statusCode,200,r.body);return r.json<FinanceEntry>();};
  const max=999_999_999_999_999;
  await put('a',{...posted,direction:'income',amountMinor:max,postedDate:'2026-08-15',category:'Продажи'});
  await put('b',{...posted,direction:'income',amountMinor:max,postedDate:'2026-09-01',category:'Продажи'});
  await put('c',{...posted,amountMinor:250,postedDate:'2026-09-02',category:'Хостинг'});
  await put('d',{...planned,amountMinor:1000,dueDate:'2026-09-30',category:'Продажи'});
  await put('e',{...planned,direction:'expense',amountMinor:400,dueDate:'2026-10-10',category:'Хостинг'});
  await put('f',{...posted,direction:'income',amountMinor:7000,currencyCode:'USD',postedDate:'2026-09-03',category:'Продажи'});
  const voided=await put('g',{...posted,amountMinor:99999,postedDate:'2026-09-04',category:'Хостинг'});
  assert.equal((await at('finance-entries/g/state',{state:'voided',baseRevision:voided.revision,voidReason:'Ошибка'},'PATCH')).statusCode,200);
  const summary=FinanceSummaryResponse.parse((await at('finance-summary')).json());
  assert.equal(summary.truncated,false);
  const rub=summary.currencies.find(c=>c.currencyCode==='RUB')!;
  // Two maximal amounts sum beyond 2^53; the text stays exact.
  assert.equal(rub.postedIncome,'1999999999999998');assert.equal(rub.postedExpense,'250');assert.equal(rub.balance,'1999999999999748');
  assert.equal(rub.plannedIncome,'1000');assert.equal(rub.plannedExpense,'400');assert.equal(rub.forecast,'2000000000000348');
  assert.deepEqual([rub.postedCount,rub.plannedCount,rub.voidedCount],[3,2,1]);
  assert.deepEqual(summary.currencies.find(c=>c.currencyCode==='USD'),{currencyCode:'USD',postedIncome:'7000',postedExpense:'0',balance:'7000',plannedIncome:'0',plannedExpense:'0',forecast:'7000',postedCount:1,plannedCount:0,voidedCount:0});
  assert.deepEqual(summary.months.map(m=>[m.month,m.currencyCode]),[['2026-10','RUB'],['2026-09','RUB'],['2026-09','USD'],['2026-08','RUB']]);
  const september=summary.months.find(m=>m.month==='2026-09'&&m.currencyCode==='RUB')!;
  assert.deepEqual([september.postedIncome,september.postedExpense,september.plannedIncome,september.plannedExpense],['999999999999999','250','1000','0']);
  const hosting=summary.categories.find(c=>c.category==='Хостинг'&&c.currencyCode==='RUB')!;
  assert.deepEqual([hosting.direction,hosting.posted,hosting.planned],['expense','250','400']);
  const period=FinanceSummaryResponse.parse((await at('finance-summary?from=2026-09-01&to=2026-09-30')).json());
  assert.deepEqual(period.currencies.map(c=>[c.currencyCode,c.postedIncome,c.plannedIncome,c.plannedExpense]),[['RUB','999999999999999','1000','0'],['USD','7000','0','0']]);
  assert.equal((await at('finance-summary?from=2026-13-01')).statusCode,400);
  assert.equal((await at('finance-summary?from=1800-01-01')).json().code,'FINANCE_DATE');
  assert.equal((await at('finance-summary?from=2026-10-01&to=2026-09-01')).json().code,'FINANCE_DATE');
  assert.equal((await at('finance-entries?from=2026-10-01&to=2026-09-01')).json().code,'FINANCE_DATE');
  assert.equal((await at('finance-summary?extra=1')).statusCode,400);
  // Lists follow the entry date, newest first, in stable keyset pages bound to their filter.
  const firstPage=FinanceEntryPageResponse.parse((await at('finance-entries?limit=3')).json());
  assert.deepEqual(firstPage.items.map(e=>e.id),['e','d','g']);assert.equal(firstPage.total,7);assert.ok(firstPage.nextCursor);
  const secondPage=FinanceEntryPageResponse.parse((await at('finance-entries?limit=3&cursor='+encodeURIComponent(firstPage.nextCursor!))).json());
  assert.deepEqual(secondPage.items.map(e=>e.id),['f','c','b']);
  const lastPage=FinanceEntryPageResponse.parse((await at('finance-entries?limit=3&cursor='+encodeURIComponent(secondPage.nextCursor!))).json());
  assert.deepEqual(lastPage.items.map(e=>e.id),['a']);assert.equal(lastPage.nextCursor,null);
  assert.equal((await at('finance-entries?state=posted&cursor='+encodeURIComponent(firstPage.nextCursor!))).json().code,'CURSOR_INVALID');
  const filtered=FinanceEntryPageResponse.parse((await at('finance-entries?state=planned&direction=expense')).json());
  assert.deepEqual(filtered.items.map(e=>e.id),['e']);assert.equal(filtered.total,1);
  assert.deepEqual(FinanceEntryPageResponse.parse((await at('finance-entries?from=2026-09-02&to=2026-09-03')).json()).items.map(e=>e.id),['f','c']);
  assert.equal((await at('finance-entries?state=archived')).statusCode,400);
});

test('FN06 the project currency starts as RUB and changes under CAS and retry',async()=>{
  const initial=FinanceSettingsResponse.parse((await call('GET','finance-settings')).json());
  assert.deepEqual([initial.currencyCode,initial.revision,initial.updatedAt],['RUB',0,null]);
  const key=randomUUID(),body={baseRevision:0,value:{currencyCode:'EUR'}};
  const changed=await call('PUT','finance-settings',body,f.alice,key);assert.equal(changed.statusCode,200,changed.body);
  assert.deepEqual([changed.json().currencyCode,changed.json().revision],['EUR',1]);
  assert.deepEqual((await call('PUT','finance-settings',body,f.alice,key)).json(),changed.json());
  assert.equal((await call('PUT','finance-settings',body)).json().code,'CONFLICT');
  assert.equal((await call('PUT','finance-settings',{baseRevision:1,value:{currencyCode:'eur'}})).statusCode,400);
  assert.equal((await call('GET','finance-settings',undefined,f.reader)).json().currencyCode,'EUR');
});

test('FN07 contracts refuse malformed entries before anything is written',async()=>{
  const invalid=[
    {...posted,amountMinor:0},{...posted,amountMinor:1_000_000_000_000_000},{...posted,amountMinor:12.5},{...posted,amountMinor:'100'},
    {...posted,currencyCode:'rub'},{...posted,currencyCode:'RUBL'},{...posted,postedDate:null},{...posted,postedDate:'2026-02-30'},
    {...planned,dueDate:null},{...planned,postedDate:'2026-10-01'},{...posted,state:'voided'},{...posted,direction:'transfer'},
    {...posted,category:''},{...posted,category:'x'.repeat(81)},{...posted,description:'x'.repeat(501)},{...posted,counterparty:'x'.repeat(161)},
    {...posted,reference:''},{...posted,unknown:true},(({description:_,...rest})=>rest)(posted)
  ];
  for(const value of invalid){
    const response=await call('PUT','finance-entries/fn07-invalid',{baseRevision:0,value});
    assert.equal(response.statusCode,400,JSON.stringify(value)+': '+response.body);
  }
  assert.equal((await call('PUT','finance-entries/fn07-invalid',{baseRevision:0,value:{...posted,postedDate:'1899-12-31'}})).json().code,'FINANCE_DATE');
  assert.equal((await call('PUT','finance-entries/'+'x'.repeat(101),{baseRevision:0,value:posted})).statusCode,400);
  assert.equal((await call('PATCH','finance-entries/fn07-invalid/state',{state:'planned',baseRevision:0})).statusCode,400);
  assert.equal((await call('PATCH','finance-entries/fn07-invalid/state',{state:'voided',baseRevision:0,voidReason:'Нет такой'})).statusCode,404);
  assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM app.finance_entry WHERE id='fn07-invalid'")).rows[0].n,0);
});

test('FN08 simultaneous changes of one revision: exactly one wins, the history has no gap',async()=>{
  const entry=await create('fn08-race',planned);
  const results=await Promise.all([
    call('PUT','finance-entries/fn08-race',{baseRevision:entry.revision,value:{...planned,amountMinor:31000000}}),
    call('PATCH','finance-entries/fn08-race/state',{state:'posted',baseRevision:entry.revision,postedDate:'2026-10-04',amountMinor:30000000}),
    call('PATCH','finance-entries/fn08-race/state',{state:'voided',baseRevision:entry.revision,voidReason:'Отмена'})
  ]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409,409]);
  const versions=(await f.admin.query("SELECT revision FROM app.finance_entry_version WHERE project_id=$1 AND entry_id='fn08-race' ORDER BY revision",[f.first.id])).rows;
  assert.deepEqual(versions.map(v=>v.revision),[1,2]);
});

test('FN09 the published contract names every finance route with its schemas',async()=>{
  const doc=(await f.app.inject('/openapi.json')).json();
  const route=(p:string)=>doc.paths['/api/v1/projects/{projectId}/'+p];
  assert.equal(route('finance-entries/{id}').put.requestBody.content['application/json'].schema.$ref,'#/components/schemas/PutFinanceEntry');
  assert.equal(route('finance-entries/{id}/state').patch.requestBody.content['application/json'].schema.$ref,'#/components/schemas/ChangeFinanceEntryState');
  assert.equal(route('finance-entries/{id}/state').patch['x-idempotency'],'required');
  assert.equal(route('finance-entries').get.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/FinanceEntryPageResponse');
  assert.equal(route('finance-summary').get.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/FinanceSummaryResponse');
  assert.deepEqual(route('finance-entries').get.parameters.filter((p:{in:string})=>p.in==='query').map((p:{name:string})=>p.name),['cursor','limit','state','direction','from','to']);
  assert.ok(doc.components.schemas.FinanceEntryHistoryResponse);assert.ok(route('finance-settings').put);
});
