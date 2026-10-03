import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {fixture} from './fixture.js';
import type {InboxPage} from '../contracts/inbox.js';

// Mentions picked from the @ list and the inbox of service accounts (docs/decisions/0008-mentions-and-service-inbox.md)
// against the real server: tokens by id, only members, renames, the limit; service accounts as recipients of every
// kind; the inbox over REST and MCP with pages, the trust envelope and marking read; row security between accounts.
let f:Awaited<ReturnType<typeof fixture>>,api:string,ui:string,bot:Awaited<ReturnType<typeof serviceAccount>>;
const freePort=()=>new Promise<number>((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const {port:p}=probe.address() as {port:number};probe.close(()=>resolve(p));});});
before(async()=>{const port=await freePort();ui=`http://127.0.0.1:${port}`;api=`http://localhost:${port}`;
  f=await fixture({prefix:'IB',port,appOrigin:ui,settings:{SPRINTIQUE_API_ORIGIN:api}});bot=await serviceAccount();});
after(async()=>{await f?.close();});

type User=Awaited<ReturnType<typeof fixture>>['alice'];
const runtime=process.env['DATABASE_RUNTIME_ROLE']!;
const token=(id:string,name:string)=>`@[${name}](user:${id})`;
async function ok<T=any>(response:Promise<{statusCode:number;body:string;json<R>():R}>,status=200):Promise<T>{
  const r=await response;assert.equal(r.statusCode,status,r.body);return r.json<T>();
}
const call=(method:string,url:string,payload?:unknown,user:User=f.alice)=>f.app.inject({method,url:ui+url,
  headers:{...user.headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload})});
const base=`/api/v1/projects/`;
async function task(p:string,id:string,fields:Record<string,unknown>={},user:User=f.alice){
  return ok(call('PUT',`${base}${p}/tasks/${id}`,{baseRevision:0,task:{title:'Задача '+id,...fields}},user));
}
async function say(p:string,taskId:string,body:string,user:User=f.alice){
  return ok<any>(call('POST',`${base}${p}/tasks/${taskId}/threads`,{id:'th-'+randomUUID().slice(0,8),messageId:'m-'+randomUUID().slice(0,8),body,requiresResolution:false},user));
}
const rows=async(principal:string,p?:string)=>(await f.admin.query('SELECT * FROM app.notifications WHERE recipient_id=$1'+(p?' AND project_id=$2':'')+' ORDER BY created_at',p?[principal,p]:[principal])).rows;

// A service account of a person in the first project, with «Сервис: задачи» (it may take tasks), and its tokens.
async function serviceAccount(user:User=f.alice,name='Робот релизов'){
  const preset=(await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'",[f.first.workspaceId])).rows[0].id;
  const made=await ok<{id:string;revision:number}>(f.app.inject({method:'POST',url:ui+'/api/v1/service-accounts',headers:user.headers,
    payload:{name,workspaceId:f.first.workspaceId,projects:[{projectId:f.first.id,presetId:preset,granted:[],revoked:[]}]}}));
  const mint=async(scopes:string[])=>(await ok<{token:string}>(f.app.inject({method:'POST',url:ui+`/api/v1/service-accounts/${made.id}/tokens`,headers:user.headers,
    payload:{name:'Агент '+scopes.join(' '),scopes,expiresInDays:1}}))).token;
  return {id:made.id,write:await mint(['read','write']),read:await mint(['read'])};
}
const bearer=(t:string)=>({authorization:'Bearer '+t});
const inbox=(t:string,query='')=>ok<InboxPage>(f.app.inject({url:api+'/api/v1/inbox'+query,headers:bearer(t)}));
let sequence=0;
async function tool(t:string,name:string,args:Record<string,unknown>){
  const r=await f.app.inject({method:'POST',url:api+'/mcp',headers:{accept:'application/json','content-type':'application/json','mcp-protocol-version':'2025-11-25',...bearer(t)},
    payload:{jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name,arguments:args}}});
  assert.equal(r.statusCode,200,r.body);
  return r.json<{result:{isError:boolean;structuredContent:any}}>().result;
}

test('IB01 a picked mention notifies by id: members only, renamed people still found, never the author, at most twenty',async()=>{
  const p=f.first.id;
  await task(p,'ib1');
  // Наблюдатель was picked under an older name; Борис is not in this project; the author mentions herself.
  await say(p,'ib1',`${token(f.reader.id,'Наблюдатель Старый')}, ${token(bot.id,'Робот')} и ${token(f.bob.id,'Борис')}, а ещё ${token(f.alice.id,'Алиса')}`);
  assert.equal((await rows(f.reader.id,p)).length,1,'a member mentioned by token');
  assert.equal((await rows(bot.id,p)).length,1,'a service account mentioned by token');
  assert.equal((await rows(f.bob.id,p)).length,0,'a token of a non-member notifies nobody');
  assert.equal((await rows(f.alice.id,p)).length,0,'never the author');
  // The reader is renamed: the quote reads the current name, the token still points at the same person.
  await f.admin.query('UPDATE auth.principals SET profile_name=$2 WHERE id=$1',[f.reader.id,'Нина Наблюдатель']);
  await say(p,'ib1',`Ещё раз, ${token(f.reader.id,'Наблюдатель Старый')}`);
  assert.equal((await rows(f.reader.id,p)).length,2,'a renamed person still resolves');
  const mine=await ok<InboxPage>(f.app.inject({url:ui+'/api/v1/inbox',headers:f.reader.headers}));
  const last=mine.items.at(-1)!;
  assert.equal(last.kind,'mention');assert.equal(last.quote,'Ещё раз, @Нина Наблюдатель');
  // Typed names keep working beside tokens; a code span is not a mention.
  await say(p,'ib1','@Нина Наблюдатель, и `'+token(f.reader.id,'X')+'`');
  assert.equal((await rows(f.reader.id,p)).length,3);
  // Twenty at most: fill a project with 25 people and mention all of them.
  const crowd:string[]=[];
  for(let i=0;i<25;i++){
    const id=randomUUID();crowd.push(id);
    await f.admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,'Гость '+i]);
    await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member')",[f.first.workspaceId,id]);
    await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'reader')",[p,id]);
  }
  await say(p,'ib1',crowd.map((id,i)=>token(id,'Гость '+i)).join(' '));
  const notified=(await f.admin.query("SELECT count(*)::int AS n FROM app.notifications WHERE recipient_id=ANY($1) AND kind='mention'",[crowd])).rows[0].n;
  assert.equal(notified,20);
  for(const id of crowd)await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p,id]);
});

test('IB02 a service account receives every kind like a person: its owner notifies it, its own action does not, no Telegram',async()=>{
  const p=f.first.id,before=(await rows(bot.id,p)).length;
  // Its owner assigns it a task due today: assigned, then deadline from the worker's function.
  const today=(await f.admin.query("SELECT (now() AT TIME ZONE coalesce(auth.project_timezone($1),'UTC'))::date::text AS d",[p])).rows[0].d;
  await task(p,'ib2',{ownerId:bot.id,due:today});
  await f.admin.query('SELECT work.raise_due_notifications()');
  // A request addressed to it, with a note.
  await ok(call('POST',`${base}${p}/tasks/ib2/requests`,{id:randomUUID(),recipientId:bot.id,kind:'review',note:'Проверь, пожалуйста, '+token(f.alice.id,'Алиса')}));
  const kinds=(await rows(bot.id,p)).slice(before).map(r=>r.kind).sort();
  assert.deepEqual(kinds,['assigned','deadline','request']);
  // Its own actions do not notify it: it takes a task itself and mentions itself.
  const own=await tool(bot.write,'create_task',{projectId:p,title:'Сам себе',assigneeId:'me'});assert.equal(own.isError,false);
  await tool(bot.write,'add_task_comment',{projectId:p,task:'ib2',body:token(bot.id,'Я')+' беру'});
  assert.equal((await rows(bot.id,p)).length,before+3);
  // No channel outside the product.
  // Whichever outbox this database has (Telegram's of V…042, or the channel queue that replaces it) holds nothing for it.
  for(const outbox of ['app.telegram_deliveries','app.notification_deliveries']){
    if(!(await f.admin.query('SELECT to_regclass($1) AS t',[outbox])).rows[0].t)continue;
    assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM ${outbox} WHERE recipient_id=$1`,[bot.id])).rows[0].n,0,outbox);
  }
  const page=await inbox(bot.read);
  const request=page.items.find(i=>i.kind==='request')!;
  assert.equal(request.quote,'Проверь, пожалуйста, @Алиса');assert.equal(request.request?.kind,'review');
  assert.equal(request.actor?.id,f.alice.id);assert.match(request.task.url,/#\/task\/IBSPR-\d+$/);
  assert.equal(page.items.find(i=>i.kind==='deadline')!.due,today);
  // The account has no Workbench: its owner (here also the one who asked) marks the request resolved.
  const open=(await f.admin.query("SELECT id::text AS id,revision FROM app.attention_requests WHERE recipient_id=$1 AND status='open'",[bot.id])).rows[0];
  await ok(call('POST',`${base}${p}/requests/${open.id}/resolve`,{baseRevision:Number(open.revision)}));
  // A reader who neither asked nor owns the account cannot.
  const other=await ok<any>(call('POST',`${base}${p}/tasks/ib2/requests`,{id:randomUUID(),recipientId:bot.id,kind:'answer'}));
  assert.equal((await call('POST',`${base}${p}/requests/${other.id}/resolve`,{baseRevision:other.revision},f.reader)).statusCode,403);
});

test('IB03 the inbox over MCP and REST: oldest first, pages, unread by default, untrusted content, marking by ids and upTo',async()=>{
  const p=f.first.id;
  await task(p,'ib3');
  // Clear what earlier tests left, then raise 25 in a known order.
  await f.admin.query('UPDATE app.notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL',[bot.id]);
  for(let i=0;i<25;i++)await f.admin.query("SELECT app.raise_notification($1,$2,'ib3','assigned',$3,'{}',$4)",[bot.id,p,f.alice.id,'inbox:'+i]);
  const first=await tool(bot.read,'list_inbox',{});
  assert.equal(first.isError,false);
  assert.equal(first.structuredContent.trust,'untrusted-content');assert.match(first.structuredContent.notice,/untrusted/);
  const page=first.structuredContent.data;
  assert.equal(page.items.length,20);assert.equal(page.unread,25);assert.ok(page.nextCursor);
  assert.ok(page.items.every((item:any,i:number)=>i===0||Date.parse(item.createdAt)>=Date.parse(page.items[i-1].createdAt)),'oldest first');
  assert.equal(page.items[0].task.key.startsWith('IBSPR-'),true);assert.equal(page.items[0].text,`Вас назначили исполнителем задачи ${page.items[0].task.key}`);assert.equal(page.items[0].task.title,'Задача ib3');
  const second=(await tool(bot.read,'list_inbox',{cursor:page.nextCursor,limit:20})).structuredContent.data;
  assert.equal(second.items.length,5);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...page.items,...second.items].map((i:any)=>i.id)).size,25,'pages do not overlap');
  // A read-only token lists but cannot mark: the tool is not offered and the REST call needs write.
  const listed=await f.app.inject({method:'POST',url:api+'/mcp',headers:{accept:'application/json','content-type':'application/json',...bearer(bot.read)},payload:{jsonrpc:'2.0',id:++sequence,method:'tools/list'}});
  const names=listed.json<any>().result.tools.map((t:any)=>t.name);
  assert.ok(names.includes('list_inbox'));assert.ok(!names.includes('mark_inbox_read'));
  assert.match(listed.json<any>().result.tools.find((t:any)=>t.name==='list_inbox').description,/^Start every work session here/);
  assert.equal((await f.app.inject({method:'POST',url:api+'/api/v1/inbox/read',headers:bearer(bot.read),payload:{ids:[page.items[0].id]}})).statusCode,403);
  // Marking: two by id, then everything up to the tenth.
  const byId=(await tool(bot.write,'mark_inbox_read',{ids:[page.items[0].id,page.items[1].id]})).structuredContent;
  assert.deepEqual(byId,{marked:2,unread:23});
  const upTo=await ok(f.app.inject({method:'POST',url:api+'/api/v1/inbox/read',headers:bearer(bot.write),payload:{upTo:page.items[9].id}}));
  assert.deepEqual(upTo,{marked:8,unread:15});
  const rest=await inbox(bot.read);
  assert.equal(rest.items[0]?.id,page.items[10].id,'unread only, oldest first');
  assert.equal((await inbox(bot.read,'?unreadOnly=false&limit=50')).items.filter(i=>i.read).length>=10,true);
  assert.equal((await f.app.inject({url:api+'/api/v1/inbox?unreadOnly=maybe',headers:bearer(bot.read)})).statusCode,400);
  assert.equal((await tool(bot.write,'mark_inbox_read',{})).isError,true,'ids or upTo');
  // The owner sees the backlog in the list of service accounts.
  const accounts=await ok<{items:any[]}>(f.app.inject({url:ui+'/api/v1/service-accounts',headers:f.alice.headers}));
  assert.equal(accounts.items.find(a=>a.id===bot.id).inboxUnread,15);
});

test('IB04 row security: an account reads and marks only its own items, only while it can read the project',async()=>{
  const p=f.first.id,other=await serviceAccount(f.alice,'Второй робот');
  await task(p,'ib4');
  const theirs=(await f.admin.query("SELECT app.raise_notification($1,$2,'ib4','assigned',$3,'{}','rls:other') AS id",[other.id,p,f.alice.id])).rows[0].id;
  assert.ok(theirs);
  assert.equal((await inbox(bot.read,'?unreadOnly=false&limit=50')).items.some(i=>i.id===theirs),false);
  const marked=await ok(f.app.inject({method:'POST',url:api+'/api/v1/inbox/read',headers:bearer(bot.write),payload:{ids:[theirs],upTo:theirs}}));
  assert.equal(marked.marked,0,'another account\'s ids change nothing');
  assert.equal((await rows(other.id,p))[0].read_at,null);
  // The database itself, as the runtime role acting as the first account.
  const visible=async(actor:string,sql:string,params:unknown[])=>{
    await f.admin.query('BEGIN');
    try{await f.admin.query(`SET LOCAL ROLE "${runtime}"`);await f.admin.query("SELECT set_config('app.actor_id',$1,true)",[actor]);
      return (await f.admin.query(sql,params)).rows;}finally{await f.admin.query('ROLLBACK');}
  };
  assert.equal((await visible(bot.id,'SELECT id FROM app.notifications WHERE recipient_id=$1',[other.id])).length,0);
  assert.ok((await visible(other.id,'SELECT id FROM app.notifications WHERE recipient_id=$1',[other.id])).length>=1);
  // The backlog count is the owner's or a workspace administrator's to see, nobody else's.
  assert.equal((await visible(f.bob.id,'SELECT * FROM auth.service_account_unread(ARRAY[$1])',[other.id])).length,0);
  assert.equal((await visible(f.alice.id,'SELECT * FROM auth.service_account_unread(ARRAY[$1])',[other.id]))[0].unread,1);
  // Out of the project: the items are hidden, not deleted, and nothing new arrives.
  await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p,other.id]);
  assert.equal((await inbox(other.read)).items.length,0);
  assert.equal((await rows(other.id,p)).length,1);
  const after=(await f.admin.query("SELECT app.raise_notification($1,$2,'ib4','assigned',$3,'{}','rls:gone') AS id",[other.id,p,f.alice.id])).rows[0].id;
  assert.equal(after,null);
  // An agent never receives.
  const agent=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name) VALUES($1,'agent','Агент')",[agent]);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[p,agent]);
  assert.equal((await f.admin.query("SELECT app.raise_notification($1,$2,'ib4','assigned',$3,'{}','rls:agent') AS id",[agent,p,f.alice.id])).rows[0].id,null);
});
