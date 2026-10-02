import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {fixture} from './fixture.js';
import {FinanceCategoryResponse,FinanceCategoryListResponse,FinanceEntryResponse,FinancePlanResponse,FinancePlanListResponse,
  FinanceOverviewResponse,FinanceVarianceNoteResponse} from '../contracts/finance.js';
import type {FinancePlan,FinanceOverview} from '../contracts/finance.js';

// The budget plan of the first finance delivery (docs/decisions/0009-finance-plan.md), the acceptance of section 5
// of the specification: categories, the release of an entry, plan versions, approval under concurrency, the overview
// and explanations of variances, against a real server. The interface answers on 127.0.0.1 and the public API on
// localhost, as in production, so a service account's token is tried where it is accepted.
let f:Awaited<ReturnType<typeof fixture>>,ui:string,api:string;
const freePort=()=>new Promise<number>((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const {port:p}=probe.address() as {port:number};probe.close(()=>resolve(p));});});
before(async()=>{const port=await freePort();ui=`http://127.0.0.1:${port}`;api=`http://localhost:${port}`;
  f=await fixture({prefix:'FP',port,appOrigin:ui,settings:{SPRINTIQUE_API_ORIGIN:api}});});
after(async()=>{await f?.close();});

type User=Awaited<ReturnType<typeof fixture>>['alice'];
type Method='GET'|'POST'|'PUT'|'PATCH';
const call=(method:Method,project:string,resource:string,payload?:unknown,user:User=f.alice,key=randomUUID())=>
  f.app.inject({method,url:`${ui}/api/v1/projects/${project}/${resource}`,headers:{...user.headers,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
async function ok<T=any>(method:Method,project:string,resource:string,payload?:unknown,user:User=f.alice,key=randomUUID()):Promise<T>{
  const response=await call(method,project,resource,payload,user,key);
  assert.equal(response.statusCode,200,`${method} ${resource}: ${response.body}`);return response.json<T>();
}
const code=async(response:Promise<{statusCode:number;json:<T>()=>T}>,status:number,expected?:string)=>{
  const r=await response;assert.equal(r.statusCode,status,JSON.stringify(r.json()));if(expected)assert.equal(r.json<{code:string}>().code,expected);
};
/** A project of its own for each scenario, administered by Алиса. */
async function project(key:string){
  const response=await f.app.inject({method:'POST',url:ui+'/api/v1/projects',headers:f.alice.headers,payload:{workspaceId:f.first.workspaceId,name:'Бюджет '+key,slug:key.toLowerCase()+'-'+randomUUID().slice(0,6),key}});
  assert.equal(response.statusCode,200,response.body);return response.json<{id:string}>().id;
}
const category=async(p:string,id:string,name:string,direction:'income'|'expense'|'both')=>
  FinanceCategoryResponse.parse(await ok('PUT',p,'finance-categories/'+id,{baseRevision:0,value:{name,direction}}));
interface EntrySeed {direction?:'income'|'expense';state?:'planned'|'posted';amount:number;currency?:string;date:string;category:string;release?:string|null}
async function entry(p:string,id:string,{direction='expense',state='posted',amount,currency='RUB',date,category:categoryId,release=null}:EntrySeed){
  return FinanceEntryResponse.parse(await ok('PUT',p,'finance-entries/'+id,{baseRevision:0,value:{direction,state,amountMinor:amount,currencyCode:currency,
    dueDate:state==='planned'?date:null,postedDate:state==='posted'?date:null,categoryId,releaseId:release,description:'Операция '+id}}));
}
interface Line {direction:'income'|'expense';categoryId:string;amountMinor:number;currencyCode?:string;releaseId?:string|null;note?:string|null}
const lines=(items:Line[])=>items.map(l=>({currencyCode:'RUB',releaseId:null,note:null,...l}));
const plan=async(p:string,id:string,periodStart='2025-01-01',periodEnd='2099-12-31',releaseId:string|null=null)=>
  FinancePlanResponse.parse(await ok('PUT',p,'finance-plans/'+id,{baseRevision:0,value:{name:'План '+id,periodStart,periodEnd,releaseId}}));
const draft=async(p:string,current:FinancePlan,items:Line[],note:string|null=null)=>
  FinancePlanResponse.parse(await ok('PUT',p,`finance-plans/${current.id}/draft`,{baseRevision:current.selected!.revision,version:current.selected!.version,value:{note,lines:lines(items)}}));
const approve=async(p:string,current:FinancePlan)=>
  FinancePlanResponse.parse(await ok('POST',p,`finance-plans/${current.id}/approve`,{baseRevision:current.selected!.revision,version:current.selected!.version}));
const overview=async(p:string,query='',user:User=f.alice)=>FinanceOverviewResponse.parse(await ok('GET',p,'finance-overview'+query,undefined,user));
const release=async(p:string,id:string)=>{await f.admin.query("INSERT INTO app.releases(id,project_id,name,status,revision) VALUES($1,$2,$3,'planned',1)",[id,p,'Релиз '+id]);};
/** A person signed in with a session, a member of [p] with the reader preset and the changes given. */
async function person(name:string,p:string,{granted=[] as string[],revoked=[] as string[]}={}):Promise<User>{
  const id=randomUUID(),credential=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
  await f.admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,name]);
  await f.admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member')",[f.first.workspaceId,id]);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role,granted,revoked) VALUES($1,$2,'reader',$3,$4)",[p,id,granted,revoked]);
  return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin:ui,'x-csrf-token':csrf}} as User;
}
const session=(user:User)=>({token:user.token,kind:'session' as const});
const row=(o:FinanceOverview,categoryId:string,currency='RUB',direction?:string)=>o.categories.find(c=>c.categoryId===categoryId&&c.currencyCode===currency&&(!direction||c.direction===direction))!;

test('FP01 categories: one list per project, names compared without case and «ё», archive and direction keep history intact',async()=>{
  const p=await project('FPCAT');
  const key=randomUUID(),body={baseRevision:0,value:{name:'Подрядчики',direction:'expense'}};
  const made=FinanceCategoryResponse.parse(await ok('PUT',p,'finance-categories/contractors',body,f.alice,key));
  assert.deepEqual([made.name,made.direction,made.archived,made.revision],['Подрядчики','expense',false,1]);
  assert.deepEqual(await ok('PUT',p,'finance-categories/contractors',body,f.alice,key),made,'a retry answers the same');
  await code(call('PUT',p,'finance-categories/other',{baseRevision:0,value:{name:'  ПОДРЯДЧИКИ ',direction:'expense'}}),409,'FINANCE_CATEGORY_NAME');
  await category(p,'trees','Ёлки','both');
  await code(call('PUT',p,'finance-categories/trees-2',{baseRevision:0,value:{name:'елки',direction:'both'}}),409,'FINANCE_CATEGORY_NAME');
  await code(call('PUT',p,'finance-categories/x',{baseRevision:0,value:{name:'',direction:'expense'}}),400);
  await code(call('PUT',p,'finance-categories/x',{baseRevision:0,value:{name:'Икс',direction:'transfer'}}),400);
  // An entry takes a category of its direction; an unknown one is refused.
  await code(call('PUT',p,'finance-entries/e-wrong',{baseRevision:0,value:{direction:'income',state:'posted',amountMinor:100,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'contractors',description:'Доход'}}),422,'FINANCE_CATEGORY_DIRECTION');
  await code(call('PUT',p,'finance-entries/e-unknown',{baseRevision:0,value:{direction:'expense',state:'posted',amountMinor:100,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'missing',description:'Расход'}}),422,'FINANCE_CATEGORY');
  const kept=await entry(p,'e-kept',{amount:100,date:'2026-09-01',category:'contractors'});
  assert.deepEqual([kept.category,kept.categoryName],['Подрядчики','Подрядчики']);
  // Renaming shows the new name everywhere; the entry keeps the name it was written with as its label.
  const renamed=FinanceCategoryResponse.parse(await ok('PUT',p,'finance-categories/contractors',{baseRevision:1,value:{name:'Подрядчики и фрилансеры',direction:'expense'}}));
  const read=FinanceEntryResponse.parse(await ok('GET',p,'finance-entries/e-kept'));
  assert.deepEqual([read.category,read.categoryName],['Подрядчики','Подрядчики и фрилансеры']);
  // Archived: no longer for new entries, still valid on the entry that has it.
  const archived=FinanceCategoryResponse.parse(await ok('PUT',p,'finance-categories/contractors',{baseRevision:renamed.revision,value:{name:renamed.name,direction:'expense',archived:true}}));
  assert.equal(archived.archived,true);assert.ok(archived.archivedAt);
  await code(call('PUT',p,'finance-entries/e-new',{baseRevision:0,value:{direction:'expense',state:'posted',amountMinor:100,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'contractors',description:'Расход'}}),422,'FINANCE_CATEGORY_ARCHIVED');
  assert.equal((await ok('PUT',p,'finance-entries/e-kept',{baseRevision:1,value:{direction:'expense',state:'posted',amountMinor:200,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'contractors',description:'Расход'}})).revision,2);
  // A category with entries of both directions cannot be narrowed to one.
  await entry(p,'e-tree-in',{direction:'income',amount:5,date:'2026-09-02',category:'trees'});
  await entry(p,'e-tree-out',{amount:5,date:'2026-09-02',category:'trees'});
  await code(call('PUT',p,'finance-categories/trees',{baseRevision:1,value:{name:'Ёлки',direction:'expense'}}),409,'FINANCE_CATEGORY_IN_USE');
  const list=FinanceCategoryListResponse.parse(await ok('GET',p,'finance-categories'));
  assert.deepEqual(list.items.map(c=>[c.id,c.archived]),[['trees',false],['contractors',true]]);
  // 200 categories a project.
  await f.admin.query(`INSERT INTO app.finance_category(project_id,id,name,direction,revision,created_by,updated_by)
    SELECT $1,'bulk-'||n,'Категория '||n,'expense',1,$2,$2 FROM generate_series(1,198) n`,[p,f.alice.id]);
  await code(call('PUT',p,'finance-categories/one-more',{baseRevision:0,value:{name:'Ещё одна',direction:'expense'}}),409,'FINANCE_LIMIT');
});

test('FP02 an entry and a plan name only a release of their own project; archiving or moving it keeps the money where it was',async()=>{
  const p=await project('FPREL');await category(p,'hosting','Хостинг','expense');
  await release(p,'r1');
  await f.admin.query("INSERT INTO app.releases(id,project_id,name,status,revision) VALUES('foreign-release',$1,'Чужой релиз','planned',1)",[f.second.id]);
  const linked=await entry(p,'with-release',{amount:1000,date:'2026-09-01',category:'hosting',release:'r1'});
  assert.equal(linked.releaseId,'r1');
  await code(call('PUT',p,'finance-entries/foreign',{baseRevision:0,value:{direction:'expense',state:'posted',amountMinor:1,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'hosting',releaseId:'foreign-release',description:'Чужое'}}),422,'FINANCE_RELEASE');
  // The database holds the same boundary for any writer: the key is the release of this project.
  await assert.rejects(f.db.authenticated(session(f.alice),tx=>tx.query(`INSERT INTO app.finance_entry(project_id,id,direction,state,amount_minor,currency_code,posted_date,category,category_id,release_id,description,revision,created_by,updated_by)
    VALUES($1,'sql-foreign','expense','posted',1,'RUB','2026-09-01','Хостинг','hosting','foreign-release','Чужое',1,$2,$2)`,[p,f.alice.id])),/foreign key/);
  // A plan for the release; its lines do not name releases again.
  const forRelease=await plan(p,'release-plan','2026-01-01','2026-12-31','r1');
  assert.deepEqual([forRelease.releaseId,forRelease.releaseName,forRelease.releaseArchived],['r1','Релиз r1',false]);
  await code(call('PUT',p,'finance-plans/release-plan/draft',{baseRevision:1,version:1,value:{note:null,lines:lines([{direction:'expense',categoryId:'hosting',amountMinor:5000,releaseId:'r1'}])}}),422,'FINANCE_PLAN_LINE_RELEASE');
  await code(call('PUT',p,'finance-plans/foreign-plan',{baseRevision:0,value:{name:'Чужой',periodStart:'2026-01-01',periodEnd:'2026-12-31',releaseId:'foreign-release'}}),422,'FINANCE_RELEASE');
  const approved=await approve(p,await draft(p,forRelease,[{direction:'expense',categoryId:'hosting',amountMinor:5000}]));
  // A release plan counts the entries of its release only.
  await entry(p,'no-release',{amount:7,date:'2026-09-01',category:'hosting'});
  const before=await overview(p,'?plan=release-plan');
  assert.deepEqual([row(before,'hosting').fact,row(before,'hosting').plan],['1000','5000']);
  // Moving and then archiving the release moves no money and erases no history.
  await f.admin.query("UPDATE app.releases SET planned_start='2027-01-01',planned_end='2027-02-01',revision=revision+1 WHERE project_id=$1 AND id='r1'",[p]);
  await f.admin.query("UPDATE app.releases SET archived_at=now(),revision=revision+1 WHERE project_id=$1 AND id='r1'",[p]);
  const after=await overview(p,'?plan=release-plan');
  assert.deepEqual(after.categories,before.categories);assert.equal(after.plan!.releaseArchived,true);assert.equal(approved.selected!.state,'approved');
  assert.equal(FinanceEntryResponse.parse(await ok('GET',p,'finance-entries/with-release')).releaseId,'r1');
  assert.equal((await ok('PUT',p,'finance-entries/with-release',{baseRevision:1,value:{direction:'expense',state:'posted',amountMinor:1100,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'hosting',releaseId:'r1',description:'Правка'}})).releaseId,'r1');
  await code(call('PUT',p,'finance-entries/late',{baseRevision:0,value:{direction:'expense',state:'posted',amountMinor:1,currencyCode:'RUB',postedDate:'2026-09-01',categoryId:'hosting',releaseId:'r1',description:'Поздно'}}),422,'FINANCE_RELEASE_ARCHIVED');
});

test('FP03 a plan is a series of versions: approval under concurrency leaves exactly one approved, revision keeps the old one',async()=>{
  const p=await project('FPVER');await category(p,'hosting','Хостинг','expense');await category(p,'sales','Продажи','income');
  const created=await plan(p,'year');
  assert.deepEqual([created.selected!.version,created.selected!.state,created.selected!.lines.length,created.draftVersion,created.approvedVersion],[1,'draft',0,1,null]);
  await code(call('POST',p,'finance-plans/year/approve',{baseRevision:1,version:1}),422,'FINANCE_PLAN_EMPTY');
  await code(call('PUT',p,'finance-plans/missing/draft',{baseRevision:1,version:1,value:{note:null,lines:[]}}),404);
  const filled=await draft(p,created,[{direction:'expense',categoryId:'hosting',amountMinor:100000,note:'Серверы и резерв'},{direction:'income',categoryId:'sales',amountMinor:0}],'Первый бюджет');
  assert.deepEqual([filled.selected!.revision,filled.selected!.lineCount,filled.selected!.note],[2,2,'Первый бюджет']);
  assert.deepEqual(filled.selected!.lines.map(l=>[l.position,l.categoryName,l.amountMinor]),[[1,'Хостинг',100000],[2,'Продажи',0]]);
  // «Approve what I saw»: a stale revision is refused.
  await code(call('POST',p,'finance-plans/year/approve',{baseRevision:1,version:1}),409,'CONFLICT');
  // Two approvals of the same draft at once: one wins, the other conflicts; a retry of the winner answers the same.
  const keys=[randomUUID(),randomUUID()],body={baseRevision:2,version:1};
  const results=await Promise.all(keys.map(key=>call('POST',p,'finance-plans/year/approve',body,f.alice,key)));
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409],results.map(r=>r.body).join('\n'));
  const winner=results.findIndex(r=>r.statusCode===200);
  assert.deepEqual((await call('POST',p,'finance-plans/year/approve',body,f.alice,keys[winner])).json(),results[winner]!.json());
  const approved=(await f.admin.query("SELECT count(*)::int AS n FROM app.finance_plan_version WHERE project_id=$1 AND state='approved'",[p])).rows[0].n;
  assert.equal(approved,1);
  // An approved version does not change through the API; its period neither, its name may.
  await code(call('PUT',p,'finance-plans/year/draft',{baseRevision:3,version:1,value:{note:null,lines:[]}}),409,'FINANCE_PLAN_VERSION_FROZEN');
  await code(call('PUT',p,'finance-plans/year',{baseRevision:1,value:{name:'План',periodStart:'2025-02-01',periodEnd:'2099-12-31',releaseId:null}}),409,'FINANCE_PLAN_APPROVED');
  assert.equal((await ok('PUT',p,'finance-plans/year',{baseRevision:1,value:{name:'Бюджет года',periodStart:'2025-01-01',periodEnd:'2099-12-31',releaseId:null}})).name,'Бюджет года');
  // Revision: a new draft from a copy of the approved lines; one draft at a time.
  const v1=FinancePlanResponse.parse(await ok('GET',p,'finance-plans/year?version=1'));
  const revised=FinancePlanResponse.parse(await ok('POST',p,'finance-plans/year/revise',{baseRevision:v1.selected!.revision,version:1,note:'Выросли цены'}));
  assert.deepEqual([revised.selected!.version,revised.selected!.state,revised.selected!.note,revised.draftVersion,revised.approvedVersion],[2,'draft','Выросли цены',2,1]);
  assert.deepEqual(revised.selected!.lines.map(l=>[l.categoryId,l.amountMinor,l.note]),[['hosting',100000,'Серверы и резерв'],['sales',0,null]]);
  await code(call('POST',p,'finance-plans/year/revise',{baseRevision:v1.selected!.revision,version:1,note:null}),409,'FINANCE_PLAN_DRAFT_EXISTS');
  await code(call('POST',p,'finance-plans/year/revise',{baseRevision:1,version:2,note:null}),409,'FINANCE_PLAN_NOT_APPROVED');
  await entry(p,'host',{amount:110000,date:'2026-03-01',category:'hosting'});
  const second=await approve(p,await draft(p,revised,[{direction:'expense',categoryId:'hosting',amountMinor:120000}]));
  assert.deepEqual(second.versions.map(v=>[v.version,v.state]),[[2,'approved'],[1,'superseded']]);
  assert.equal(second.versions[0]!.approvedBy!.name,'Алиса');
  // The previous version stays for comparison.
  const now=await overview(p),old=await overview(p,'?plan=year&version=1');
  assert.deepEqual([now.version!.version,now.state.code,row(now,'hosting').variance],[2,'within_plan','10000']);
  assert.deepEqual([old.version!.state,old.state.code,row(old,'hosting').variance,row(old,'hosting').status],['superseded','not_approved','-10000','ok']);
  const list=FinancePlanListResponse.parse(await ok('GET',p,'finance-plans'));
  assert.deepEqual(list.items.map(i=>[i.id,i.approvedVersion,i.draftVersion,i.versionCount]),[['year',2,null,2]]);
  const topics=(await f.admin.query("SELECT topic FROM app.outbox WHERE project_id=$1 AND topic LIKE 'finance-plan.%' ORDER BY project_sequence",[p])).rows.map(r=>r.topic);
  for(const topic of ['finance-plan.created','finance-plan.draft-updated','finance-plan.approved','finance-plan.revised'])assert.ok(topics.includes(topic),topic);
});

test('FP04 an approved version and its lines do not change even by direct SQL as the runtime role',async()=>{
  const p=await project('FPSQL');await category(p,'hosting','Хостинг','expense');
  const approved=await approve(p,await draft(p,await plan(p,'frozen'),[{direction:'expense',categoryId:'hosting',amountMinor:5000}]));
  const alice=session(f.alice);
  const refused=async(sql:string,pattern:RegExp)=>{await assert.rejects(f.db.authenticated(alice,tx=>tx.query(sql,[p,f.alice.id])),pattern,sql);};
  await refused("UPDATE app.finance_plan_version SET note='Подправим',revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE project_id=$1 AND plan_id='frozen'",/cannot change/);
  await refused("UPDATE app.finance_plan_version SET state='draft',approved_by=NULL,approved_at=NULL,revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE project_id=$1 AND plan_id='frozen' AND $2::text IS NOT NULL",/cannot change|check constraint/);
  await refused("UPDATE app.finance_plan_line SET amount_minor=1 WHERE project_id=$1 AND plan_id='frozen' AND $2::text IS NOT NULL",/cannot change/);
  await refused("DELETE FROM app.finance_plan_line WHERE project_id=$1 AND plan_id='frozen' AND $2::text IS NOT NULL",/cannot change/);
  await refused("INSERT INTO app.finance_plan_line(project_id,plan_id,version,position,direction,category_id,amount_minor,currency_code) SELECT $1,'frozen',1,2,'expense','hosting',1,'RUB' WHERE $2::text IS NOT NULL",/cannot change/);
  await refused("DELETE FROM app.finance_plan_version WHERE project_id=$1 AND $2::text IS NOT NULL",/permission denied/);
  // A second approved version cannot be made by hand either, nor an approval in someone else's name.
  const revised=FinancePlanResponse.parse(await ok('POST',p,'finance-plans/frozen/revise',{baseRevision:approved.selected!.revision,version:1,note:null}));
  await refused("UPDATE app.finance_plan_version SET state='approved',approved_by=$2,approved_at=clock_timestamp(),revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE project_id=$1 AND plan_id='frozen' AND version=2",/ux_finance_plan_version__approved|duplicate key/);
  await refused(`UPDATE app.finance_plan_version SET state='approved',approved_by='${f.bob.id}',approved_at=clock_timestamp(),revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE project_id=$1 AND plan_id='frozen' AND version=2`,/row-level security|duplicate key/);
  // Nothing moved: the approved lines are as approved.
  const v1=FinancePlanResponse.parse(await ok('GET',p,'finance-plans/frozen?version=1'));
  assert.deepEqual(v1.selected!.lines.map(l=>l.amountMinor),[5000]);assert.equal(v1.selected!.state,'approved');assert.equal(revised.selected!.state,'draft');
});

test('FP05 the overview: signs, a zero plan, voided entries, separate currencies, «не было в плане» and overdue expectations',async()=>{
  const p=await project('FPSUM');
  for(const [id,name,direction] of [['hosting','Хостинг','expense'],['contractors','Подрядчики','expense'],['sales','Продажи','income'],['misc','Разное','expense'],['zero','Обучение','expense']] as const)await category(p,id,name,direction);
  // Without a plan: the ledger is visible, no variance is judged.
  await entry(p,'h1',{amount:60000,date:'2026-03-01',category:'hosting'});
  const none=await overview(p);
  assert.deepEqual([none.state.code,none.plan,none.period,row(none,'hosting').planned,row(none,'hosting').variance,row(none,'hosting').status],['no_plan',null,null,false,null,'ok']);
  const year=await plan(p,'year');
  assert.equal((await overview(p)).state.code,'not_approved');
  await approve(p,await draft(p,year,[
    {direction:'expense',categoryId:'hosting',amountMinor:100000},{direction:'expense',categoryId:'contractors',amountMinor:200000},
    {direction:'income',categoryId:'sales',amountMinor:500000},{direction:'expense',categoryId:'zero',amountMinor:0},
    {direction:'expense',categoryId:'hosting',amountMinor:1000,currencyCode:'USD'}]));
  await entry(p,'h2',{state:'planned',amount:30000,date:'2099-01-01',category:'hosting'});
  await entry(p,'c1',{amount:150000,date:'2026-04-01',category:'contractors'});
  await entry(p,'c2',{state:'planned',amount:100000,date:'2025-06-01',category:'contractors'});
  await entry(p,'s1',{direction:'income',amount:400000,date:'2026-05-01',category:'sales'});
  await entry(p,'s2',{direction:'income',state:'planned',amount:50000,date:'2099-02-01',category:'sales'});
  await entry(p,'z1',{amount:5000,date:'2026-06-01',category:'zero'});
  await entry(p,'m1',{amount:7000,date:'2026-06-02',category:'misc'});
  await entry(p,'u1',{amount:1500,currency:'USD',date:'2026-06-03',category:'hosting'});
  await entry(p,'u2',{direction:'income',amount:100,currency:'USD',date:'2026-06-04',category:'sales'});
  await entry(p,'outside',{amount:11111,date:'2024-12-31',category:'hosting'});
  const voided=await entry(p,'v1',{amount:999999,date:'2026-07-01',category:'hosting'});
  await ok('PATCH',p,'finance-entries/v1/state',{state:'voided',baseRevision:voided.revision,voidReason:'Ошибка'});
  const o=await overview(p);
  assert.deepEqual([o.plan!.id,o.version!.state,o.period],['year','approved',{from:'2025-01-01',to:'2099-12-31'}]);
  const pick=(c:FinanceOverview['categories'][number])=>[c.planned,c.plan,c.fact,c.expected,c.forecast,c.variance,c.variancePercent,c.status];
  // Expense: plan − forecast, positive is a saving.
  assert.deepEqual(pick(row(o,'hosting')),[true,'100000','60000','30000','90000','10000',10,'ok']);
  assert.deepEqual(pick(row(o,'contractors')),[true,'200000','150000','100000','250000','-50000',-25,'needs_explanation']);
  assert.deepEqual([row(o,'contractors').overdueCount,row(o,'contractors').overdue],[1,'100000']);
  // Income: forecast − plan; a shortfall of exactly 10% does not yet need an explanation.
  assert.deepEqual(pick(row(o,'sales')),[true,'500000','400000','50000','450000','-50000',-10,'ok']);
  // A zero plan has no percentage; spending against it still needs an explanation.
  assert.deepEqual(pick(row(o,'zero')),[true,'0','5000','0','5000','-5000',null,'needs_explanation']);
  // Not in the plan: no plan, no variance, no percentage — and an unplanned expense needs an explanation.
  assert.deepEqual(pick(row(o,'misc')),[false,null,'7000','0','7000',null,null,'needs_explanation']);
  // Currencies never add up: dollars stand on their own.
  assert.deepEqual(pick(row(o,'hosting','USD')),[true,'1000','1500','0','1500','-500',-50,'needs_explanation']);
  assert.deepEqual(pick(row(o,'sales','USD')),[false,null,'100','0','100',null,null,'ok']);
  const rub=o.currencies.find(c=>c.currencyCode==='RUB')!,usd=o.currencies.find(c=>c.currencyCode==='USD')!;
  assert.deepEqual(rub.expense,{plan:'300000',fact:'222000',expected:'130000',forecast:'352000',variance:'-52000'});
  assert.deepEqual(rub.income,{plan:'500000',fact:'400000',expected:'50000',forecast:'450000',variance:'-50000'});
  assert.deepEqual(rub.net,{fact:'178000',forecast:'98000'});
  assert.deepEqual(rub.overdue,{count:1,income:'0',expense:'100000'});
  assert.deepEqual(usd.income,{plan:null,fact:'100',expected:'0',forecast:'100',variance:null});
  assert.deepEqual(o.state,{code:'variance_unexplained',attentionCount:4,detail:{currencyCode:'RUB',categoryId:'contractors',categoryName:'Подрядчики',direction:'expense',planned:true,amountMinor:'50000'}});
  // The same data gives the same numbers on every read, and the voided and out-of-period entries count nowhere.
  assert.deepEqual(await overview(p),{...o,today:o.today});
  assert.ok(!o.categories.some(c=>c.fact.includes('999999')||c.fact==='71111'));
  await code(call('GET',p,'finance-overview?version=1'),422,'FINANCE_PLAN_VERSION');
  await code(call('GET',p,'finance-overview?plan=missing'),404);
  await code(call('GET',p,'finance-overview?other=1'),400);
});

test('FP06 an explanation names the forecast it was written for and creates its task exactly once',async()=>{
  const p=await project('FPNOTE');await category(p,'contractors','Подрядчики','expense');
  const year=await plan(p,'year');
  await code(call('PUT',p,'finance-variance-notes/early',{baseRevision:0,value:{planId:'year',version:1,categoryId:'contractors',direction:'expense',currencyCode:'RUB',text:'Рано'},createTask:null}),409,'FINANCE_PLAN_NOT_APPROVED');
  await approve(p,await draft(p,year,[{direction:'expense',categoryId:'contractors',amountMinor:200000}]));
  await entry(p,'c1',{amount:250000,date:'2026-04-01',category:'contractors'});
  const key=randomUUID();
  const body={baseRevision:0,value:{planId:'year',version:1,categoryId:'contractors',direction:'expense',currencyCode:'RUB',text:'Добавили второго подрядчика на интеграцию.'},createTask:{title:'Пересмотреть договор с подрядчиком',ownerId:f.alice.id,due:'2026-11-01'}};
  const note=FinanceVarianceNoteResponse.parse(await ok('PUT',p,'finance-variance-notes/n1',body,f.alice,key));
  assert.ok(note.taskId);assert.match(note.taskDisplayId!,/^FPNOTE-\d+$/);assert.equal(note.forecastMinorAtNote,'250000');assert.equal(note.revision,1);
  // A retry with the same key answers the same and makes no second task.
  assert.deepEqual(await ok('PUT',p,'finance-variance-notes/n1',body,f.alice,key),note);
  const tasks=async()=>(await f.admin.query("SELECT count(*)::int AS n FROM app.tasks WHERE project_id=$1",[p])).rows[0].n;
  assert.equal(await tasks(),1);
  const task=await f.admin.query('SELECT title,owner_id,due::text AS due FROM app.tasks WHERE project_id=$1 AND id=$2',[p,note.taskId]);
  assert.deepEqual(task.rows[0],{title:'Пересмотреть договор с подрядчиком',owner_id:f.alice.id,due:'2026-11-01'});
  // Asking again under a new key: the explanation already has its task.
  await code(call('PUT',p,'finance-variance-notes/n1',{...body,baseRevision:1}),409,'FINANCE_NOTE_TASK_EXISTS');
  assert.equal(await tasks(),1);
  await code(call('PUT',p,'finance-variance-notes/n2',{...body,createTask:null}),409,'FINANCE_NOTE_EXISTS');
  await code(call('PUT',p,'finance-variance-notes/n1',{baseRevision:1,value:{...body.value,currencyCode:'USD'},createTask:null}),409,'FINANCE_NOTE_FIXED');
  let o=await overview(p);
  assert.deepEqual([row(o,'contractors').status,row(o,'contractors').note!.current,row(o,'contractors').note!.taskDisplayId,o.state.code],['explained',true,note.taskDisplayId,'variance_explained']);
  // The forecast moves on: the explanation is now about another figure.
  await entry(p,'c2',{amount:1000,date:'2026-05-01',category:'contractors'});
  o=await overview(p);
  assert.deepEqual([row(o,'contractors').status,row(o,'contractors').note!.current,row(o,'contractors').note!.forecastMinorAtNote,o.state.code],['explanation_outdated',false,'250000','explanation_outdated']);
  const updated=FinanceVarianceNoteResponse.parse(await ok('PUT',p,'finance-variance-notes/n1',{baseRevision:1,value:{...body.value,text:'Второй подрядчик и доплата.'},createTask:null}));
  assert.deepEqual([updated.forecastMinorAtNote,updated.taskId,updated.revision],['251000',note.taskId,2]);
  // Keeping the books without task rights: the explanation is written, its task is refused and nothing of it stays.
  const keeper=await person('Казначей',p,{granted:['finance.write'],revoked:[]});
  await f.admin.query("INSERT INTO app.finance_category(project_id,id,name,direction,revision,created_by,updated_by) VALUES($1,'travel','Командировки','expense',1,$2,$2)",[p,f.alice.id]);
  await entry(p,'t1',{amount:9,date:'2026-05-01',category:'travel'});
  const withTask={baseRevision:0,value:{planId:'year',version:1,categoryId:'travel',direction:'expense',currencyCode:'RUB',text:'Не планировали.'},createTask:{title:'Решить про командировки',ownerId:null,due:null}};
  await code(call('PUT',p,'finance-variance-notes/n3',withTask,keeper),403,'FORBIDDEN');
  assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM app.finance_variance_note WHERE project_id=$1 AND id='n3'",[p])).rows[0].n,0);
  assert.equal(await tasks(),1);
  assert.equal((await ok('PUT',p,'finance-variance-notes/n3',{...withTask,createTask:null},keeper)).taskId,null);
});

test('FP07 without finance.read nothing of finance shows, not even that a plan exists; agents and service accounts need an explicit grant',async()=>{
  const p=await project('FPSEC');await category(p,'hosting','Хостинг','expense');
  await approve(p,await draft(p,await plan(p,'secret'),[{direction:'expense',categoryId:'hosting',amountMinor:5000}]));
  await ok('PUT',p,'tasks/visible-task',{baseRevision:0,task:{title:'Обычная задача'}});
  const outsider=await person('Без финансов',p,{revoked:['finance.read']});
  const existing=await call('GET',p,'finance-plans/secret',undefined,outsider),missing=await call('GET',p,'finance-plans/nothing',undefined,outsider);
  assert.equal(existing.statusCode,403);assert.equal(missing.statusCode,403);
  const {requestId:_a,...first}=existing.json<Record<string,unknown>>(),{requestId:_b,...second}=missing.json<Record<string,unknown>>();
  assert.deepEqual(first,second,'a plan that exists answers exactly as one that does not');
  for(const resource of ['finance-plans','finance-overview','finance-overview?plan=secret','finance-categories'])await code(call('GET',p,resource,undefined,outsider),403);
  await code(call('PUT',p,'finance-variance-notes/x',{nonsense:true},outsider),403);
  // The project's events show the task, never a finance event.
  const events=(await ok('GET',p,'events',undefined,outsider)).items.map((i:{topic:string})=>i.topic);
  assert.ok(events.includes('task.created'));assert.ok(!events.some((t:string)=>t.startsWith('finance-')),events.join());
  assert.ok((await ok('GET',p,'events')).items.some((i:{topic:string})=>i.topic==='finance-plan.approved'));
  // Row security says the same without the application.
  const seen=await f.db.authenticated(session(outsider),tx=>tx.query(`SELECT (SELECT count(*) FROM app.finance_plan WHERE project_id=$1)::int AS plans,
    (SELECT count(*) FROM app.finance_plan_line WHERE project_id=$1)::int AS lines,(SELECT count(*) FROM app.finance_category WHERE project_id=$1)::int AS categories`,[p]));
  assert.deepEqual(seen.rows[0],{plans:0,lines:0,categories:0});
  // Not a member: the project itself is unknown.
  await code(call('GET',p,'finance-plans/secret',undefined,f.bob),404);
  // An agent holds no finance capability.
  const grant=await ok('POST',p,'agents',{name:'Probe',capabilities:['tasks:read','tasks:write'],expiresInSeconds:600});
  for(const resource of ['finance-plans','finance-plans/secret','finance-overview','finance-categories']){
    const r=await f.app.inject({url:`${ui}/api/v1/projects/${p}/${resource}`,headers:{authorization:'Bearer '+grant.token}});assert.equal(r.statusCode,403,resource);
  }
  // A service account of the administrator: finance only once granted explicitly, and writing only with finance.write.
  const presetOf=async(key:string)=>(await f.admin.query('SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key=$2',[f.first.workspaceId,key])).rows[0].id;
  const sessionCall=(method:Method,url:string,payload?:unknown)=>f.app.inject({method,url:ui+url,headers:{...f.alice.headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
  const made=await sessionCall('POST','/api/v1/service-accounts',{name:'Отчёты',workspaceId:f.first.workspaceId,projects:[{projectId:p,presetId:await presetOf('service_read'),granted:[],revoked:[]}]});
  assert.equal(made.statusCode,200,made.body);const account=made.json<{id:string}>();
  const token=(await sessionCall('POST',`/api/v1/service-accounts/${account.id}/tokens`,{name:'Бюджет',scopes:['read','write'],expiresInDays:1})).json<{token:string}>().token;
  const bearer=(method:Method,resource:string,payload?:unknown)=>f.app.inject({method,url:`${api}/api/v1/projects/${p}/${resource}`,headers:{authorization:'Bearer '+token,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
  for(const resource of ['finance-plans','finance-plans/secret','finance-overview','finance-categories'])await code(bearer('GET',resource),403,'FORBIDDEN');
  await code(bearer('PUT','finance-categories/sa',{baseRevision:0,value:{name:'Сервис',direction:'expense'}}),403);
  assert.equal((await sessionCall('PUT',`/api/v1/service-accounts/${account.id}/projects/${p}`,{presetId:await presetOf('service_read'),granted:['finance.read'],revoked:[]})).statusCode,200);
  assert.equal((await bearer('GET','finance-overview')).statusCode,200);
  await code(bearer('POST','finance-plans/secret/approve',{baseRevision:1,version:1}),403,'FORBIDDEN');
});

test('FP08 events and retry receipts carry identifiers and revisions, never amounts or texts',async()=>{
  const p=await project('FPOUT');await category(p,'hosting','Хостинг для приватного клиента','expense');
  const year=await approve(p,await draft(p,await plan(p,'year'),[{direction:'expense',categoryId:'hosting',amountMinor:7654321,note:'Секретное основание'}],'Секретная причина'));
  await entry(p,'e1',{amount:8765432,date:'2026-03-01',category:'hosting'});
  await ok('PUT',p,'finance-variance-notes/n1',{baseRevision:0,value:{planId:'year',version:1,categoryId:'hosting',direction:'expense',currencyCode:'RUB',text:'Секретное объяснение'},createTask:null});
  await ok('POST',p,'finance-plans/year/revise',{baseRevision:year.selected!.revision,version:1,note:'Ещё одна причина'});
  const events=(await f.admin.query("SELECT topic,payload FROM app.outbox WHERE project_id=$1 AND topic LIKE 'finance-%'",[p])).rows;
  assert.ok(events.length>=6);
  for(const {topic,payload} of events)assert.deepEqual(Object.keys(payload).sort(),['id','projectId','resourceId','revision'],topic);
  const receipts=(await f.admin.query("SELECT operation,result FROM app.idempotency WHERE project_id=$1 AND operation LIKE 'finance-%'",[p])).rows;
  assert.ok(receipts.length>=6);
  for(const {operation,result} of receipts)assert.ok(Object.keys(result).every(k=>['id','revision','version'].includes(k)),operation+': '+JSON.stringify(result));
  const text=JSON.stringify([events,receipts]);
  for(const secret of ['7654321','8765432','Секрет','приватного'])assert.ok(!text.includes(secret),secret);
  const audit=(await f.admin.query("SELECT action FROM app.audit_events WHERE project_id=$1 AND action LIKE 'finance-%' ORDER BY created_at",[p])).rows.map(r=>r.action);
  for(const action of ['finance-category.created','finance-plan.created','finance-plan.draft-updated','finance-plan.approved','finance-variance.noted','finance-plan.revised'])assert.ok(audit.includes(action),action);
});

test('FP09 limits: 50 plans a project, 500 lines a version, and contracts refuse malformed plans before anything is written',async()=>{
  const p=await project('FPLIM');await category(p,'hosting','Хостинг','expense');
  const year=await plan(p,'year');
  const many=Array.from({length:501},()=>({direction:'expense',categoryId:'hosting',amountMinor:1,currencyCode:'RUB',releaseId:null,note:null}));
  await code(call('PUT',p,'finance-plans/year/draft',{baseRevision:1,version:1,value:{note:null,lines:many}}),400);
  const full=await draft(p,year,many.slice(0,500) as Line[]);assert.equal(full.selected!.lineCount,500);
  for(const value of [{name:'',periodStart:'2026-01-01',periodEnd:'2026-12-31',releaseId:null},{name:'Плохой',periodStart:'2026-12-31',periodEnd:'2026-01-01',releaseId:null},
    {name:'Плохой',periodStart:'2026-02-30',periodEnd:'2026-12-31',releaseId:null},{name:'Плохой',periodStart:'2026-01-01',periodEnd:'2026-12-31',releaseId:null,extra:1}]){
    await code(call('PUT',p,'finance-plans/bad',{baseRevision:0,value}),400);
  }
  await code(call('PUT',p,'finance-plans/bad',{baseRevision:0,value:{name:'Плохой',periodStart:'1800-01-01',periodEnd:'2026-12-31',releaseId:null}}),422,'FINANCE_DATE');
  for(const line of [{direction:'expense',categoryId:'hosting',amountMinor:-1},{direction:'expense',categoryId:'hosting',amountMinor:1.5},{direction:'both',categoryId:'hosting',amountMinor:1},{direction:'expense',categoryId:'hosting',amountMinor:1,currencyCode:'rub'}]){
    await code(call('PUT',p,'finance-plans/year/draft',{baseRevision:2,version:1,value:{note:null,lines:[{currencyCode:'RUB',releaseId:null,note:null,...line}]}}),400);
  }
  await code(call('POST',p,'finance-plans/year/approve',{baseRevision:2,version:101}),400);
  await f.admin.query(`INSERT INTO app.finance_plan(project_id,id,name,period_start,period_end,revision,created_by,updated_by)
    SELECT $1,'bulk-'||n,'План '||n,'2026-01-01','2026-12-31',1,$2,$2 FROM generate_series(1,49) n`,[p,f.alice.id]);
  await code(call('PUT',p,'finance-plans/one-more',{baseRevision:0,value:{name:'Лишний',periodStart:'2026-01-01',periodEnd:'2026-12-31',releaseId:null}}),409,'FINANCE_LIMIT');
});

test('FP10 the published contract names every plan route with its schemas',async()=>{
  const doc=(await f.app.inject(ui+'/openapi.json')).json<any>();
  const route=(p:string)=>doc.paths['/api/v1/projects/{projectId}/'+p];
  assert.equal(route('finance-plans/{id}/approve').post.requestBody.content['application/json'].schema.$ref,'#/components/schemas/ApproveFinancePlan');
  assert.equal(route('finance-plans/{id}/approve').post['x-idempotency'],'required');
  assert.equal(route('finance-plans/{id}/draft').put.requestBody.content['application/json'].schema.$ref,'#/components/schemas/PutFinancePlanDraft');
  assert.equal(route('finance-overview').get.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/FinanceOverviewResponse');
  assert.deepEqual(route('finance-overview').get.parameters.filter((x:{in:string})=>x.in==='query').map((x:{name:string})=>x.name),['plan','version']);
  assert.equal(route('finance-variance-notes/{id}').put.requestBody.content['application/json'].schema.$ref,'#/components/schemas/PutFinanceVarianceNote');
  assert.equal(route('finance-categories/{id}').put.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/FinanceCategoryResponse');
  assert.ok(route('finance-plans/{id}/revise').post);assert.ok(route('finance-plans').get);
});

test('FP11 a draft is discarded with its lines; a plan that only had that draft goes with it; an approved version never',async()=>{
  const p=await project('FPDROP');await category(p,'hosting','Хостинг','expense');
  const only=await draft(p,await plan(p,'only'),[{direction:'expense',categoryId:'hosting',amountMinor:5000}]);
  const key=randomUUID(),body={baseRevision:only.selected!.revision,version:1};
  const gone=await ok('POST',p,'finance-plans/only/discard',body,f.alice,key);
  assert.deepEqual(gone,{planId:'only',planDeleted:true,plan:null});
  assert.deepEqual(await ok('POST',p,'finance-plans/only/discard',body,f.alice,key),gone,'a retry answers the same');
  await code(call('GET',p,'finance-plans/only'),404);
  const approved=await approve(p,await draft(p,await plan(p,'year'),[{direction:'expense',categoryId:'hosting',amountMinor:7000}]));
  const revised=FinancePlanResponse.parse(await ok('POST',p,'finance-plans/year/revise',{baseRevision:approved.selected!.revision,version:1,note:null}));
  await code(call('POST',p,'finance-plans/year/discard',{baseRevision:approved.selected!.revision,version:1}),409,'FINANCE_PLAN_VERSION_FROZEN');
  const kept=await ok('POST',p,'finance-plans/year/discard',{baseRevision:revised.selected!.revision,version:2});
  assert.equal(kept.planDeleted,false);
  const plan1=FinancePlanResponse.parse(kept.plan);
  assert.deepEqual([plan1.versions.map(v=>[v.version,v.state]),plan1.draftVersion,plan1.approvedVersion],[[[1,'approved']],null,1]);
  assert.ok((await f.admin.query("SELECT 1 FROM app.outbox WHERE project_id=$1 AND topic='finance-plan.draft-discarded'",[p])).rowCount);
  // The next revision takes the next free number again.
  const again=FinancePlanResponse.parse(await ok('POST',p,'finance-plans/year/revise',{baseRevision:approved.selected!.revision,version:1,note:null}));
  assert.equal(again.selected!.version,2);
});
