import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {fixture,startApp,origin} from './fixture.js';
import {startKotlinWorker} from './support/kotlin-app.js';
import type {NotificationPage,NotificationSettings} from '../contracts/notifications.js';

// Notifications and Telegram delivery (docs/decisions/0006-notifications-telegram.md) over HTTP against the real
// server and PostgreSQL: raising in the transaction of the cause, the bell's page, preferences, the webhook, the
// project switch, and the worker's queue against a fake Bot API.
type User=Awaited<ReturnType<typeof fixture>>['alice'];
const TOKEN='123456789:'+'A'.repeat(35),SECRET='s'.repeat(40),BOT='sprintique_test_bot';
const telegramSettings={SPRINTIQUE_TELEGRAM_BOT_TOKEN:TOKEN,SPRINTIQUE_TELEGRAM_BOT_USERNAME:BOT,SPRINTIQUE_TELEGRAM_WEBHOOK_SECRET:SECRET};
let f:Awaited<ReturnType<typeof fixture>>,worker:pg.Pool;
let carol:User,dan:User;
before(async()=>{
  f=await fixture({prefix:'NT',settings:telegramSettings});
  worker=new pg.Pool({connectionString:process.env['WORKER_DATABASE_URL']!,max:2});
  carol=await human('Карина Смирнова');dan=await human('Денис');
});
after(async()=>{await worker?.end();await f?.close();});

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function human(name:string):Promise<User>{
  const id=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),credential=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,name]);
  await f.admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
  return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf}};
}
const call=(method:string,url:string,payload?:unknown,user:User=f.alice,key:string=randomUUID())=>f.app.inject({method,url,
  headers:{...user.headers,'idempotency-key':key},...(payload===undefined?{}:{payload})});
async function ok<T=any>(response:Promise<{statusCode:number;body:string;json<R>():R}>,status=200):Promise<T>{
  const r=await response;assert.equal(r.statusCode,status,r.body);return r.json<T>();
}
let keys=0;
async function project(members:[User,'reader'|'editor'|'admin'][]=[]){
  const key='N'+(++keys).toString().padStart(3,'0')+'T';
  const workspace=await ok<{id:string}>(call('POST','/api/v1/workspaces',{name:'Пространство '+key}));
  const created=await ok<{id:string;slug:string}>(call('POST','/api/v1/projects',{workspaceId:workspace.id,name:'Проект '+key,slug:key.toLowerCase(),key}));
  for(const [user,role] of members){
    await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[workspace.id,user.id]);
    await f.admin.query('INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,$3)',[created.id,user.id,role]);
  }
  return {id:created.id,key};
}
const base=(p:string)=>`/api/v1/projects/${p}`;
async function task(p:string,id:string,fields:Record<string,unknown>={},user:User=f.alice,key?:string){
  return ok(call('PUT',`${base(p)}/tasks/${id}`,{baseRevision:0,task:{title:'Задача '+id,...fields}},user,key));
}
async function edit(p:string,id:string,changes:Record<string,unknown>,user:User=f.alice){
  const t=await ok<any>(call('GET',`${base(p)}/tasks/${id}`,undefined,user));
  const value={title:t.title,description:t.description,status:t.status,type:t.type,priority:t.priority,ownerId:t.ownerId,due:t.due,rank:t.rank,
    parentId:t.parentId,releaseId:t.releaseId,tagIds:t.tagIds,attachmentIds:t.attachmentIds??[],coverAttachmentId:t.coverAttachmentId??null,coverCrop:t.coverCrop??null,...changes};
  return ok(call('PUT',`${base(p)}/tasks/${id}`,{baseRevision:t.revision,task:value},user));
}
const newThread=(body:string)=>({id:'th-'+randomUUID().slice(0,8),messageId:'m-'+randomUUID().slice(0,8),body,requiresResolution:false});
async function say(p:string,taskId:string,body:string|ReturnType<typeof newThread>,user:User=f.alice,key:string=randomUUID()){
  return ok<any>(call('POST',`${base(p)}/tasks/${taskId}/threads`,typeof body==='string'?newThread(body):body,user,key));
}
async function bell(user:User,query=''){return ok<NotificationPage>(f.app.inject({url:'/api/v1/notifications'+query,headers:user.headers}));}
async function unread(user:User){return (await ok<{unread:number}>(f.app.inject({url:'/api/v1/notifications/unread',headers:user.headers}))).unread;}
const rows=async(user:User,p?:string)=>(await f.admin.query('SELECT * FROM app.notifications WHERE recipient_id=$1'+(p?' AND project_id=$2':'')+' ORDER BY created_at',p?[user.id,p]:[user.id])).rows;
const webhook=(update:unknown,secret:string|null=SECRET,app=f.app)=>app.inject({method:'POST',url:'/api/v1/telegram/webhook',
  headers:{'content-type':'application/json',...(secret===null?{}:{'x-telegram-bot-api-secret-token':secret})},payload:update});
let updates=1000;
const message=(chat:number,text:string,extra:Record<string,unknown>={})=>({update_id:++updates,message:{message_id:1,date:0,text,chat:{id:chat,type:'private'},from:{id:chat,is_bot:false,first_name:'T',username:'person_'+chat},...extra}});
/** Links a person's Telegram the way the product does: a one-time link, then /start in the chat. */
async function link(user:User,chat:number){
  const started=await ok<{url:string;expiresAt:string}>(call('POST','/api/v1/profile/telegram/link',{},user));
  const token=new URL(started.url).searchParams.get('start')!;
  const answer=await webhook(message(chat,'/start '+token));assert.equal(answer.statusCode,200,answer.body);
  assert.equal(answer.json<any>().text,'Готово: уведомления Sprintique будут приходить сюда.');
}

test('NT01 assignment by someone else notifies the assignee once; self-assignment and replays do not',async()=>{
  const p=await project([[f.bob,'editor']]);
  const key=randomUUID();
  await task(p.id,'a1',{ownerId:f.bob.id},f.alice,key);
  await task(p.id,'a1',{ownerId:f.bob.id},f.alice,key); // the same command again: replayed, nothing new
  await task(p.id,'a2',{ownerId:f.alice.id});
  await task(p.id,'a3',{ownerId:f.bob.id},f.bob);
  assert.equal((await rows(f.bob,p.id)).length,1);
  assert.equal((await rows(f.alice,p.id)).length,0,'nobody is told about their own action');
  const page=await bell(f.bob);
  const item=page.items.find(i=>i.project.id===p.id)!;
  assert.equal(item.kind,'assigned');assert.equal(item.text,`Вас назначили исполнителем задачи ${p.key}-1`);
  assert.equal(item.author,'Алиса');assert.deepEqual(item.actions,[{action:'take',label:'Взять в работу'}]);
  assert.equal(item.task.key,p.key+'-1');assert.equal(item.read,false);assert.equal(item.actor?.id,f.alice.id);
  // A renamed task reads with its new name: rows keep no text.
  await edit(p.id,'a1',{title:'Граф связей: подписи рёбер'});
  assert.equal((await bell(f.bob)).items.find(i=>i.project.id===p.id)!.task.title,'Граф связей: подписи рёбер');
  // Reassigning to someone else and back is a new assignment.
  await edit(p.id,'a1',{ownerId:f.alice.id});await edit(p.id,'a1',{ownerId:f.bob.id});
  assert.equal((await rows(f.bob,p.id)).length,2);
});

test('NT02 mentions: full or unique first name after @, case-insensitive, not the author, not in code or addresses',async()=>{
  const p=await project([[f.bob,'editor'],[carol,'editor'],[dan,'reader']]);
  await task(p.id,'m1');
  const key=randomUUID(),first=newThread('@карина, посмотри. И @Денис тоже. А @Алиса — это я.');
  await say(p.id,'m1',first,f.alice,key);
  await say(p.id,'m1',first,f.alice,key); // the same command again: replayed, nothing new
  assert.equal((await rows(carol,p.id)).length,1);assert.equal((await rows(dan,p.id)).length,1,'a reader can be mentioned');
  assert.equal((await rows(f.alice,p.id)).length,0);
  assert.equal((await bell(carol)).items[0]!.text,`Вас упомянули в обсуждении задачи ${p.key}-1`);
  await say(p.id,'m1','Пишите на mail@Денис или `@Борис`, а @Каринаа — опечатка.\n```\n@Борис\n```');
  assert.equal((await rows(dan,p.id)).length,1);assert.equal((await rows(f.bob,p.id)).length,0);assert.equal((await rows(carol,p.id)).length,1);
  // A reply in an existing thread mentions too; the full name works with any spacing.
  const thread=await say(p.id,'m1','Без упоминаний');
  await ok(call('POST',`${base(p.id)}/threads/${thread.id}/messages`,{id:'m-'+randomUUID().slice(0,8),body:'@Карина  Смирнова, ответь',baseRevision:thread.revision}));
  assert.equal((await rows(carol,p.id)).length,2);
});

test('NT03 a request notifies its recipient; the bell hides a project the person left',async()=>{
  const p=await project([[f.bob,'editor']]);
  await task(p.id,'r1');
  await ok(call('POST',`${base(p.id)}/tasks/r1/requests`,{id:randomUUID(),recipientId:f.bob.id,kind:'review'}));
  const item=(await bell(f.bob)).items.find(i=>i.project.id===p.id)!;
  assert.equal(item.kind,'request');assert.equal(item.text,`Вас попросили проверить задачу ${p.key}-1`);
  assert.deepEqual(item.actions.map(a=>a.action),['accept','return']);
  await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p.id,f.bob.id]);
  assert.equal((await bell(f.bob)).items.some(i=>i.project.id===p.id),false,'no access, no notification');
  assert.equal((await rows(f.bob,p.id)).length,1,'hidden, not deleted');
});

test('NT04 agents and outsiders never receive (service accounts do: tests/inbox.test.ts)',async()=>{
  const p=await project();
  await task(p.id,'s1');
  const agent=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name) VALUES($1,'agent','Агент')",[agent]);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[p.id,agent]);
  const raised=await f.admin.query("SELECT app.raise_notification($1,$2,'s1','assigned',$3,'{}','test:agent') AS id",[agent,p.id,f.alice.id]);
  assert.equal(raised.rows[0].id,null);
  const outsider=await f.admin.query("SELECT app.raise_notification($1,$2,'s1','assigned',$3,'{}','test:outsider') AS id",[f.bob.id,p.id,f.alice.id]);
  assert.equal(outsider.rows[0].id,null,'not a member of the project');
});

test('NT05 the bell: newest first, 20 a page with a cursor, unread count, read by id and «Прочитать все» up to a moment',async(t)=>{
  // NT02 already mentioned global dan. Own this recipient and every timestamp instead of relying on wall time.
  const recipient=await human('Получатель точной пагинации');
  const p=await project([[recipient,'editor']]);
  await task(p.id,'b1');
  const idPrefix=randomUUID().slice(0,24);
  const notificationId=(ordinal:number)=>idPrefix+ordinal.toString(16).padStart(12,'0');
  const seed=(ordinal:number,createdAt:string)=>f.admin.query(`
    INSERT INTO app.notifications(id,recipient_id,project_id,task_id,kind,actor_id,dedupe_key,created_at)
    VALUES($1,$2,$3,'b1','assigned',$4,$5,$6::timestamptz)`,
  [notificationId(ordinal),recipient.id,p.id,f.alice.id,'bell:'+ordinal,createdAt]);
  // These IDs oppose timestamp order: an id-only or millisecond-rounded order must fail.
  const newest=['2000-01-01T00:00:00.600002Z','2000-01-01T00:00:00.600001Z','2000-01-01T00:00:00.600Z'];
  for(let ordinal=1;ordinal<=25;ordinal++)await seed(ordinal,newest[ordinal-1]??'2000-01-01T00:00:00.500Z');
  // The other 22 rows tie on timestamp. Their descending IDs straddle the 20/5 cursor boundary.
  const expectedIds=[1,2,3,...Array.from({length:22},(_,i)=>25-i)].map(notificationId);
  const before=await unread(recipient);assert.equal(before,25);
  const first=await bell(recipient);
  // One-time counterexample evidence remains diagnostic: a future valid timestamp format need not keep this false.
  t.diagnostic('NT05 timestamp-order evidence '+JSON.stringify({
    legacyStringOrder:first.items.every((item,i)=>i===0||item.createdAt<=first.items[i-1]!.createdAt),
    firstTimes:first.items.slice(0,3).map(item=>item.createdAt)
  }));
  assert.equal(first.items.length,20);assert.ok(first.nextCursor);assert.equal(first.unread,before);
  assert.deepEqual(first.items.map(item=>item.id),expectedIds.slice(0,20),'newest first, including distinct microseconds and descending id ties');
  const second=await bell(recipient,'?cursor='+encodeURIComponent(first.nextCursor!));
  assert.equal(second.items.length,5);assert.equal(second.nextCursor,null);
  assert.deepEqual(second.items.map(item=>item.id),expectedIds.slice(20),'the cursor retains the remaining equal-time rows in order');
  assert.equal(first.items.at(-1)!.createdAt,second.items[0]!.createdAt,'a timestamp tie crosses the page boundary');
  assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,first.items.length+second.items.length,'pages do not overlap');
  assert.equal((await f.app.inject({url:'/api/v1/notifications?cursor=nope!',headers:recipient.headers})).statusCode,400);
  const marked=await ok<{unread:number}>(call('POST','/api/v1/notifications/read',{ids:[first.items[0]!.id]},recipient));
  assert.equal(marked.unread,before-1);
  assert.equal((await bell(recipient)).items[0]!.read,true);
  // Someone else's id changes nothing.
  assert.equal((await ok<{unread:number}>(call('POST','/api/v1/notifications/read',{ids:[first.items[1]!.id]},f.bob))).unread,await unread(f.bob));
  assert.equal((await bell(recipient)).items[1]!.read,false);
  await seed(26,'2000-01-01T00:00:00.600003Z');
  const all=await ok<{unread:number}>(call('POST','/api/v1/notifications/read',{before:first.items[0]!.createdAt},recipient));
  assert.equal(all.unread,1,'one that arrived after the person looked stays unread');
  assert.deepEqual((await bell(recipient)).items.filter(item=>!item.read).map(item=>item.id),[notificationId(26)],'read-all keeps the notification one microsecond after its cutoff unread');
  assert.equal((await call('POST','/api/v1/notifications/read',{},recipient)).statusCode,400);
  // The API role cannot write a notification or change anything but read_at.
  await assert.rejects(f.db.authenticated({token:recipient.token,kind:'session'},tx=>tx.query("INSERT INTO app.notifications(recipient_id,project_id,task_id,kind,actor_id,dedupe_key) VALUES($1,$2,'b1','assigned',$3,'x')",[recipient.id,p.id,f.alice.id])),{code:'42501'});
  await assert.rejects(f.db.authenticated({token:recipient.token,kind:'session'},tx=>tx.query("UPDATE app.notifications SET kind='mention' WHERE recipient_id=$1",[recipient.id])),{code:'42501'});
});

test('NT06 the webhook: secret, idempotency by update_id, /start with a fresh, used, expired or bad token, /stop, private chats only',async()=>{
  assert.equal((await webhook(message(1,'/start x'),null)).statusCode,401);
  assert.equal((await webhook(message(1,'/start x'),'wrong'+SECRET)).statusCode,401);
  const started=await ok<{url:string}>(call('POST','/api/v1/profile/telegram/link',{},carol));
  assert.match(started.url,new RegExp(`^https://t\\.me/${BOT}\\?start=[A-Za-z0-9_-]{43}$`));
  const token=new URL(started.url).searchParams.get('start')!;
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.telegram_link_tokens WHERE token_sha256=$1',[hash(token)])).rows[0].n,1,'only the hash is stored');
  const group=await webhook(message(7001,'/start '+token,{chat:{id:-7001,type:'group'}}));
  assert.equal(group.statusCode,200);assert.equal(group.body,'');
  const update=message(7001,'/start '+token);
  const linked=await webhook(update);
  assert.deepEqual(linked.json(),{method:'sendMessage',chat_id:7001,text:'Готово: уведомления Sprintique будут приходить сюда.'});
  const again=await webhook(update);assert.equal(again.statusCode,200);assert.equal(again.body,'','the same update is handled once');
  const settings=await ok<NotificationSettings>(f.app.inject({url:'/api/v1/profile/notifications',headers:carol.headers}));
  assert.equal(settings.telegram.available,true);assert.equal(settings.telegram.botUsername,BOT);assert.equal(settings.telegram.connection?.username,'person_7001');
  assert.equal((await webhook(message(7002,'/start '+token))).json<any>().text,'Ссылка недействительна. Откройте Sprintique → Настройки → Уведомления и подключите Telegram снова.');
  assert.equal((await webhook(message(7002,'/start nonsense'))).json<any>().text,'Ссылка недействительна. Откройте Sprintique → Настройки → Уведомления и подключите Telegram снова.');
  const stale=randomBytes(32).toString('base64url');
  await f.admin.query("INSERT INTO app.telegram_link_tokens(token_sha256,principal_id,created_at,expires_at) VALUES($1,$2,now()-interval '20 minutes',now()-interval '5 minutes')",[hash(stale),dan.id]);
  await assert.rejects(f.db.authenticated({token:dan.token,kind:'session'},tx=>tx.query("INSERT INTO app.telegram_link_tokens(token_sha256,principal_id,created_at,expires_at) VALUES($1,$2,now()+interval '1 year',now()+interval '1 year 10 minutes')",[hash('future'),dan.id])),{code:'42501'});
  assert.equal((await webhook(message(7003,'/start '+stale))).json<any>().text,'Ссылка устарела. Откройте Sprintique → Настройки → Уведомления и подключите Telegram снова.');
  assert.equal((await webhook(message(7003,'/start'))).json<any>().text,'Это бот уведомлений Sprintique. Чтобы подключить его, откройте Sprintique → Настройки → Уведомления.');
  assert.equal((await webhook(message(7003,'привет'))).body,'');
  // One chat, one person: the chat linked by another person moves to them.
  await link(dan,7001);
  assert.equal((await f.admin.query('SELECT principal_id FROM app.telegram_connections WHERE chat_id=7001')).rows[0].principal_id,dan.id);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.telegram_connections WHERE principal_id=$1',[carol.id])).rows[0].n,0);
  assert.equal((await webhook(message(7001,'/stop'))).json<any>().text,'Уведомления Sprintique отключены. Подключить снова можно в Sprintique → Настройки → Уведомления.');
  assert.equal((await webhook(message(7001,'/stop'))).json<any>().text,'Этот чат не подключён к Sprintique.');
  // Linking again from the profile and unlinking there.
  await link(carol,7004);
  const off=await ok<NotificationSettings>(call('DELETE','/api/v1/profile/telegram',undefined,carol));
  assert.equal(off.telegram.connection,null);
  // A link is for a person's session only, and limited.
  const eager=await human('Олег Ссылки');
  for(let i=0;i<5;i++)await ok(call('POST','/api/v1/profile/telegram/link',{},eager));
  assert.equal((await call('POST','/api/v1/profile/telegram/link',{},eager)).statusCode,429);
});

test('NT07 without configuration Telegram does not exist; a partial configuration does not start',async()=>{
  const plain=await startApp();
  try{
    assert.equal((await webhook(message(1,'/start x'),SECRET,plain)).statusCode,404);
    const settings=await plain.inject({url:'/api/v1/profile/notifications',headers:f.alice.headers});
    assert.equal(settings.json<NotificationSettings>().telegram.available,false);
    assert.equal(settings.json<NotificationSettings>().telegram.botUsername,null);
    assert.equal((await plain.inject({method:'POST',url:'/api/v1/profile/telegram/link',headers:f.alice.headers,payload:{}})).statusCode,404);
  }finally{await plain.close();}
  await assert.rejects(startApp({settings:{SPRINTIQUE_TELEGRAM_BOT_TOKEN:TOKEN}}),/Telegram needs/);
});

test('NT08 preferences and the project switch decide what is queued for Telegram',async()=>{
  const p=await project([[dan,'editor'],[f.reader,'reader']]);
  await link(dan,8001);
  await task(p.id,'q1',{ownerId:dan.id});
  const queued=async()=>(await f.admin.query("SELECT d.state FROM app.notification_deliveries d JOIN app.notifications n ON n.id=d.notification_id WHERE n.recipient_id=$1 AND n.project_id=$2 AND d.channel='telegram'",[dan.id,p.id])).rows.length;
  assert.equal(await queued(),1);
  const all={assigned:true,mention:true,request:true,deadline:true};
  const muted=await ok<NotificationSettings>(call('PUT','/api/v1/profile/notifications',{channels:{email:false,telegram:true},kinds:{...all,assigned:false}},dan));
  assert.deepEqual(muted.preferences,{channels:{email:false,telegram:true},kinds:{...all,assigned:false}});
  await task(p.id,'q2',{ownerId:dan.id});
  assert.equal(await queued(),1,'a muted kind stays in the product only');
  assert.equal((await rows(dan,p.id)).length,2);
  await ok(call('PUT','/api/v1/profile/notifications',{channels:{email:false,telegram:true},kinds:all},dan));
  // The old shape of the request is refused rather than half applied.
  assert.equal((await call('PUT','/api/v1/profile/notifications',{telegram:all},dan)).statusCode,400);
  const shown=await ok<any>(f.app.inject({url:`${base(p.id)}/notifications`,headers:f.reader.headers}));
  assert.deepEqual(shown,{available:true,enabled:true,revision:0,canChange:false});
  assert.equal((await call('PUT',`${base(p.id)}/notifications`,{enabled:false,baseRevision:0},f.reader)).statusCode,403);
  const changed=await ok<any>(call('PUT',`${base(p.id)}/notifications`,{enabled:false,baseRevision:0}));
  assert.equal(changed.enabled,false);assert.equal(changed.revision,1);assert.equal(changed.canChange,true);
  assert.equal((await call('PUT',`${base(p.id)}/notifications`,{enabled:true,baseRevision:0})).statusCode,409);
  await task(p.id,'q3',{ownerId:dan.id});
  assert.equal(await queued(),1,'the project switched external notifications off');
  await ok(call('PUT',`${base(p.id)}/notifications`,{enabled:true,baseRevision:1}));
  assert.equal((await f.app.inject({url:`${base(p.id)}/telegram`,headers:f.alice.headers})).statusCode,404,'the old route is gone');
  await quiet();
});

test('NT09 deadlines: once per task and date, in the person\'s time zone, never for done work',async()=>{
  const p=await project([[carol,'editor']]);
  // The project is already a day ahead (UTC+14); the person is at UTC−12, where the due date is today.
  await f.admin.query("UPDATE app.projects SET timezone='Etc/GMT-14' WHERE id=$1",[p.id]);
  await f.admin.query("INSERT INTO app.workbench_preferences(principal_id,timezone) VALUES($1,'Etc/GMT+12') ON CONFLICT (principal_id) DO UPDATE SET timezone=EXCLUDED.timezone",[carol.id]);
  const today=(await f.admin.query("SELECT to_char(now() AT TIME ZONE 'Etc/GMT+12','YYYY-MM-DD') AS d")).rows[0].d;
  await task(p.id,'d1',{ownerId:carol.id,due:today});
  await task(p.id,'d2',{ownerId:carol.id,due:today,status:'ready_for_release'});
  await task(p.id,'d3',{ownerId:carol.id,due:'2099-01-01'});
  await worker.query('SELECT work.raise_due_notifications()');
  await worker.query('SELECT work.raise_due_notifications()');
  const raised=(await rows(carol,p.id)).filter(r=>r.kind==='deadline');
  assert.deepEqual(raised.map(r=>r.task_id),['d1']);assert.equal(raised[0].actor_id,null);
  const due=(await bell(carol)).items.find(i=>i.task.id==='d1'&&i.kind==='deadline')!;
  assert.match(due.text,new RegExp(`^Срок задачи ${p.key}-1 — сегодня, \\d{1,2} [а-я]+$`));assert.equal(due.author,null);
  // Without the person's zone the project's applies, where that date has passed.
  await f.admin.query('DELETE FROM app.workbench_preferences WHERE principal_id=$1',[carol.id]);
  await task(p.id,'d4',{ownerId:carol.id,due:today});
  await worker.query('SELECT work.raise_due_notifications()');
  assert.equal((await rows(carol,p.id)).filter(r=>r.kind==='deadline').length,1);
  // The worker role still reads nothing directly.
  await assert.rejects(worker.query('SELECT * FROM app.notifications'),{code:'42501'});
  await assert.rejects(worker.query('SELECT * FROM app.notification_deliveries'),{code:'42501'});
  await assert.rejects(worker.query('SELECT * FROM app.notification_batches'),{code:'42501'});
});

/** A fake Bot API: answers by chat, records what it was sent. */
async function fakeTelegram(){
  const sent:{chat:number;text:string;markup:any;path:string}[]=[];const seen=new Map<number,number>();
  const server:Server=createServer((request,response)=>{
    let body='';request.on('data',chunk=>{body+=chunk;});
    request.on('end',()=>{
      const input=JSON.parse(body),chat=Number(input.chat_id),count=(seen.get(chat)??0)+1;seen.set(chat,count);
      const reply=(status:number,value:unknown)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(value));};
      sent.push({chat,text:input.text,markup:input.reply_markup,path:request.url!});
      if(chat===9002&&count===1)return reply(429,{ok:false,error_code:429,description:'Too Many Requests: retry after 7',parameters:{retry_after:7}});
      if(chat===9003)return reply(403,{ok:false,error_code:403,description:'Forbidden: bot was blocked by the user'});
      if(chat===9004)return reply(502,{ok:false,error_code:502,description:'Bad Gateway'});
      reply(200,{ok:true,result:{message_id:count}});
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  return {url:`http://127.0.0.1:${port}`,sent,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}
async function until(check:()=>Promise<boolean>,what:string,output:()=>string){
  for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.fail(what+'\n'+output());
}

/** Settles whatever earlier tests left waiting, so a claim sees only this test's queue. */
async function quiet(){
  await f.admin.query("UPDATE app.notification_deliveries SET state='skipped',last_error_code='TEST' WHERE state IN ('queued','batched')");
  await f.admin.query("UPDATE app.notification_batches SET state='skipped',lease_token=NULL,lease_until=NULL WHERE state IN ('pending','sending')");
}

test('NT10 the worker sends through the Bot API: success with buttons, 429 retry_after, 403 unlinks, five attempts at most',async()=>{
  await quiet();
  const people=[await human('Ева Получатель'),await human('Жанна Лимит'),await human('Зоя Блок'),await human('Инна Сбой')];
  const p=await project(people.map(u=>[u,'editor'] as [User,'editor']));
  for(const [i,user] of people.entries())await link(user,9001+i);
  for(const [i,user] of people.entries())await task(p.id,'w'+(i+1),{title:i===0?'Подписи <рёбер> & связи':'Задача w'+(i+1),ownerId:user.id});
  const batch=async(user:User)=>(await f.admin.query("SELECT b.* FROM app.notification_batches b WHERE b.recipient_id=$1 AND b.channel='telegram'",[user.id])).rows[0];
  // The fake Bot API is closed even when the worker fails to start, or its open socket keeps the file from exiting.
  const api=await fakeTelegram();
  let work:Awaited<ReturnType<typeof startKotlinWorker>>|undefined;
  try{
    work=await startKotlinWorker({...telegramSettings,SPRINTIQUE_TELEGRAM_API_BASE:api.url,SPRINTIQUE_PUBLIC_ORIGIN:'https://sprintique.example',
      SPRINTIQUE_NOTIFICATIONS_TELEGRAM_WINDOW_SECONDS:'0'});
    await until(async()=>(await batch(people[0]!))?.state==='sent','the message is sent',work.output);
    const first=api.sent.find(s=>s.chat===9001)!;
    assert.equal(first.path,`/bot${TOKEN}/sendMessage`);
    const link=`https://sprintique.example/?project=${p.key.toLowerCase()}#/task/${p.key}-1`;
    assert.equal(first.text,`<a href="${link}"><b>Подписи &lt;рёбер&gt; &amp; связи</b></a>\nВас назначили исполнителем задачи ${p.key}-1\n<i>Алиса · Проект ${p.key}</i>`);
    // The quick action rides above the links, its data signed and short enough for Telegram.
    assert.equal(first.markup.inline_keyboard[0][0].text,'Взять в работу');
    assert.match(first.markup.inline_keyboard[0][0].callback_data,/^q1\.t\.[A-Za-z0-9_-]{22}\.[0-9a-z]+\.[A-Za-z0-9_-]{16}$/);
    assert.deepEqual(first.markup.inline_keyboard[1],[{text:'Открыть задачу',url:link},{text:'Открыть Sprintique',url:'https://sprintique.example/'}]);
    await until(async()=>(await batch(people[2]!))?.state==='failed','blocked',work.output);
    assert.equal((await batch(people[2]!)).last_error_code,'BOT_BLOCKED');
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.telegram_connections WHERE principal_id=$1',[people[2]!.id])).rows[0].n,0,'blocked: unlinked');
    await until(async()=>(await batch(people[1]!))?.last_error_code==='RATE_LIMITED','rate limited',work.output);
    const limited=await batch(people[1]!);
    assert.equal(limited.state,'pending');assert.ok(new Date(limited.next_attempt_at).getTime()-Date.now()>=5000,'waits retry_after');
    await f.admin.query('UPDATE app.notification_batches SET next_attempt_at=now() WHERE id=$1',[limited.id]);
    await until(async()=>(await batch(people[1]!)).state==='sent','sent after the wait',work.output);
    await until(async()=>(await batch(people[3]!))?.attempts>=1&&(await batch(people[3]!)).state==='pending','a server error is retried',work.output);
    // Each due retry is made due at once; the worker settles the fifth failure as failed.
    await until(async()=>{
      await f.admin.query("UPDATE app.notification_batches SET next_attempt_at=now() WHERE recipient_id=$1 AND state='pending'",[people[3]!.id]);
      return (await batch(people[3]!)).state==='failed';
    },'five attempts',work.output);
    const failed=await batch(people[3]!);
    assert.equal(failed.state,'failed');assert.equal(failed.attempts,5);assert.equal(failed.last_error_code,'TELEGRAM_502');
    assert.equal((await f.admin.query("SELECT state FROM app.notification_deliveries WHERE batch_id=$1",[failed.id])).rows[0].state,'failed');
    assert.equal(api.sent.filter(s=>s.chat===9004).length,5);
    assert.ok(!work.output().includes(TOKEN),'the token never reaches the log');
  }finally{await work?.stop();await api.close();}
});

test('NT11 a queued message is not sent when its cause no longer holds or the person lost access',async()=>{
  const people=[await human('Кира Доступ'),await human('Лев Задача')];
  const p=await project(people.map(u=>[u,'editor'] as [User,'editor']));
  await link(people[0]!,9101);await link(people[1]!,9102);
  await task(p.id,'x1',{ownerId:people[0]!.id});await task(p.id,'x2',{ownerId:people[1]!.id});
  await f.admin.query('DELETE FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[p.id,people[0]!.id]);
  await edit(p.id,'x2',{ownerId:f.alice.id});
  await f.admin.query("UPDATE app.notification_deliveries SET state='skipped' WHERE state='queued' AND project_id<>$1",[p.id]);
  const claimed=await worker.query("SELECT work.claim_notification_batch(ARRAY['telegram'],0,0) AS c");
  assert.equal(claimed.rows[0].c,null);
  const states=(await f.admin.query('SELECT recipient_id,state,last_error_code FROM app.notification_deliveries WHERE project_id=$1',[p.id])).rows;
  assert.deepEqual(Object.fromEntries(states.map(s=>[s.recipient_id,s.last_error_code])),{[people[0]!.id]:'NO_ACCESS',[people[1]!.id]:'STALE'});
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.notification_batches WHERE recipient_id=ANY($1)',[people.map(u=>u.id)])).rows[0].n,0,'nothing left, nothing sent');
});
