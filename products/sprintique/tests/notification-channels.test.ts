import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac,randomBytes} from 'node:crypto';
import pg from 'pg';
import {fixture,origin} from './fixture.js';
import {startKotlinWorker} from './support/kotlin-app.js';
import {startFakeSmtp,parseLetter,decodeWords,type FakeSmtp} from './support/fake-smtp.js';
import {startFakeTelegram} from './support/fake-telegram.js';
import type {NotificationSettings} from '../contracts/notifications.js';

// Channels and batches of external notifications (docs/decisions/0007-notification-channels.md) over HTTP against the
// real server, PostgreSQL and the worker: the person's choice of e-mail and Telegram, the batch window and the early
// flush, duplicates collapsed, items checked again before they leave, the letter's MIME and headers, the one-click
// unsubscribe token, Telegram's 4096-character split and retries. Telegram and SMTP are local fakes.
type User=Awaited<ReturnType<typeof fixture>>['alice'];
const TOKEN='123456789:'+'B'.repeat(35),SECRET='w'.repeat(40),BOT='sprintique_channels_bot',LINK_SECRET='L'.repeat(48);
const FROM='Sprintique <no-reply@sprintique.test>',PUBLIC='https://sprintique.example';
let f:Awaited<ReturnType<typeof fixture>>,worker:pg.Pool,smtp:FakeSmtp;
const mail=()=>({SPRINTIQUE_SMTP_HOST:'127.0.0.1',SPRINTIQUE_SMTP_PORT:String(smtp.port),SPRINTIQUE_SMTP_SECURITY:'none',SPRINTIQUE_MAIL_FROM:FROM,
  SPRINTIQUE_NOTIFICATIONS_LINK_SECRET:LINK_SECRET});
const telegram={SPRINTIQUE_TELEGRAM_BOT_TOKEN:TOKEN,SPRINTIQUE_TELEGRAM_BOT_USERNAME:BOT,SPRINTIQUE_TELEGRAM_WEBHOOK_SECRET:SECRET};
before(async()=>{
  smtp=await startFakeSmtp();
  f=await fixture({prefix:'NC',settings:{...telegram,...mail()}});
  worker=new pg.Pool({connectionString:process.env['WORKER_DATABASE_URL']!,max:2});
});
after(async()=>{await worker?.end();await f?.close();await smtp?.close();});

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function human(name:string,email:string|null=null):Promise<User>{
  const id=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),credential=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject,email) VALUES($1,'human',$2,'https://test.example',$1,$3)",[id,name,email]);
  await f.admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
  return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf}};
}
const call=(method:string,url:string,payload?:unknown,user:User=f.alice)=>f.app.inject({method,url,
  headers:{...user.headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload})});
async function ok<T=any>(response:Promise<{statusCode:number;body:string;json<R>():R}>,status=200):Promise<T>{
  const r=await response;assert.equal(r.statusCode,status,r.body);return r.json<T>();
}
let keys=0;
async function project(members:User[]){
  const key='C'+(++keys).toString().padStart(3,'0')+'N';
  const workspace=await ok<{id:string}>(call('POST','/api/v1/workspaces',{name:'Пространство '+key}));
  const created=await ok<{id:string;slug:string}>(call('POST','/api/v1/projects',{workspaceId:workspace.id,name:'Проект '+key,slug:key.toLowerCase(),key}));
  for(const user of members){
    await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[workspace.id,user.id]);
    await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[created.id,user.id]);
  }
  return {id:created.id,key,slug:key.toLowerCase()};
}
const base=(p:string)=>`/api/v1/projects/${p}`;
const task=(p:string,id:string,fields:Record<string,unknown>={},user:User=f.alice)=>
  ok(call('PUT',`${base(p)}/tasks/${id}`,{baseRevision:0,task:{title:'Задача '+id,...fields}},user));
async function edit(p:string,id:string,changes:Record<string,unknown>){
  const t=await ok<any>(call('GET',`${base(p)}/tasks/${id}`));
  const value={title:t.title,description:t.description,status:t.status,type:t.type,priority:t.priority,ownerId:t.ownerId,due:t.due,rank:t.rank,
    parentId:t.parentId,releaseId:t.releaseId,tagIds:t.tagIds,attachmentIds:t.attachmentIds??[],coverAttachmentId:t.coverAttachmentId??null,coverCrop:t.coverCrop??null,...changes};
  return ok(call('PUT',`${base(p)}/tasks/${id}`,{baseRevision:t.revision,task:value}));
}
const say=(p:string,taskId:string,body:string,user:User=f.alice)=>ok<any>(call('POST',`${base(p)}/tasks/${taskId}/threads`,
  {id:'th-'+randomUUID().slice(0,8),messageId:'m-'+randomUUID().slice(0,8),body,requiresResolution:false},user));
const KINDS={assigned:true,mention:true,request:true,deadline:true};
const choose=(user:User,channels:{email:boolean;telegram:boolean},kinds=KINDS)=>call('PUT','/api/v1/profile/notifications',{channels,kinds},user);
const settings=(user:User)=>ok<NotificationSettings>(f.app.inject({url:'/api/v1/profile/notifications',headers:user.headers}));
/** A linked chat, as the webhook would leave it after /start. */
const linkChat=(user:User,chat:number)=>f.admin.query('INSERT INTO app.telegram_connections(principal_id,chat_id,username) VALUES($1,$2,$3)',[user.id,chat,'chat_'+chat]);
/** A mention raised directly: it has no cause to go stale, so only the channel, access and read state decide. */
const mention=(user:User,p:string,taskId:string,key=randomUUID())=>
  f.admin.query("SELECT app.raise_notification($1,$2,$3,'mention',$4,'{}',$5) AS id",[user.id,p,taskId,f.alice.id,'nc:'+key]).then(r=>r.rows[0].id as string);
const deliveries=async(user:User)=>(await f.admin.query('SELECT * FROM app.notification_deliveries WHERE recipient_id=$1 ORDER BY created_at,id',[user.id])).rows;
const batches=async(user:User,channel:string)=>(await f.admin.query('SELECT * FROM app.notification_batches WHERE recipient_id=$1 AND channel=$2 ORDER BY created_at',[user.id,channel])).rows;
const claim=async(channels:string[],telegramWindow:number,emailWindow:number)=>
  (await worker.query('SELECT work.claim_notification_batch($1::text[],$2,$3) AS c',[channels,telegramWindow,emailWindow])).rows[0].c;
const settle=(batch:any,outcome:string,delivered:string[]|null=null)=>
  worker.query('SELECT work.settle_notification_batch($1,$2,$3,NULL,NULL,$4::uuid[]) AS ok',[batch.id,batch.leaseToken,outcome,delivered]);
/** Settles whatever earlier tests left waiting, so a claim sees only this test's queue. */
async function quiet(){
  await f.admin.query("UPDATE app.notification_deliveries SET state='skipped',last_error_code='TEST' WHERE state IN ('queued','batched')");
  await f.admin.query("UPDATE app.notification_batches SET state='skipped',lease_token=NULL,lease_until=NULL WHERE state IN ('pending','sending')");
}
async function until(check:()=>Promise<boolean>,what:string,output:()=>string){
  for(let i=0;i<200;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.fail(what+'\n'+output());
}
const startWorker=(extra:Record<string,string>={})=>startKotlinWorker({...mail(),SPRINTIQUE_PUBLIC_ORIGIN:PUBLIC,
  SPRINTIQUE_NOTIFICATIONS_TELEGRAM_WINDOW_SECONDS:'0',SPRINTIQUE_NOTIFICATIONS_EMAIL_WINDOW_SECONDS:'0',...extra});

test('NC01 channel selection: e-mail off and Telegram on by default; each combination queues exactly its channels',async()=>{
  const eve=await human('Ева Каналы','eve@example.org'),plain=await human('Без Адреса');
  const p=await project([eve,plain]);
  await linkChat(eve,11001);
  const initial=await settings(eve);
  assert.deepEqual(initial.preferences,{channels:{email:false,telegram:true},kinds:KINDS});
  assert.deepEqual(initial.email,{available:true,address:'eve@example.org'});
  let n=0;
  for(const [email,tg] of [[false,false],[true,false],[false,true],[true,true]] as [boolean,boolean][]){
    const saved=await ok<NotificationSettings>(choose(eve,{email,telegram:tg}));
    assert.deepEqual(saved.preferences.channels,{email,telegram:tg});
    const taskId='c'+(++n);await task(p.id,taskId);
    const id=await mention(eve,p.id,taskId);
    const channels=(await f.admin.query('SELECT channel FROM app.notification_deliveries WHERE notification_id=$1 ORDER BY channel',[id])).rows.map(r=>r.channel);
    assert.deepEqual(channels,[...(email?['email']:[]),...(tg?['telegram']:[])],`email=${email} telegram=${tg}`);
  }
  // A muted kind goes nowhere outside the product, whatever the channels.
  await ok(choose(eve,{email:true,telegram:true},{...KINDS,mention:false}));
  const muted=await mention(eve,p.id,'c1');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.notification_deliveries WHERE notification_id=$1',[muted])).rows[0].n,0);
  // No address: e-mail is not offered and cannot be turned on; Telegram on without a chat queues nothing.
  const none=await settings(plain);
  assert.deepEqual(none.email,{available:false,address:null});
  const refused=await choose(plain,{email:true,telegram:true});
  assert.equal(refused.statusCode,409);assert.equal(refused.json<any>().code,'EMAIL_UNAVAILABLE');
  const unlinked=await mention(plain,p.id,'c1');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.notification_deliveries WHERE notification_id=$1',[unlinked])).rows[0].n,0);
  // Service accounts and agents never get external deliveries, even with rows and a chat of their own.
  const agent=randomUUID();
  await f.admin.query("INSERT INTO auth.principals(id,kind,name,email) VALUES($1,'agent','Агент','agent@example.org')",[agent]);
  await f.admin.query('INSERT INTO app.notification_preferences(principal_id,email_enabled) VALUES($1,true)',[agent]);
  await f.admin.query('INSERT INTO app.telegram_connections(principal_id,chat_id) VALUES($1,11099)',[agent]);
  const row=await f.admin.query("INSERT INTO app.notifications(recipient_id,project_id,task_id,kind,actor_id,dedupe_key) VALUES($1,$2,'c1','mention',$3,'nc:agent') RETURNING id",[agent,p.id,f.alice.id]);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.notification_deliveries WHERE notification_id=$1',[row.rows[0].id])).rows[0].n,0);
  // The project switch «Внешние уведомления» stops both channels.
  await ok(call('PUT',`${base(p.id)}/notifications`,{enabled:false,baseRevision:0}));
  await ok(choose(eve,{email:true,telegram:true}));
  const off=await mention(eve,p.id,'c1');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM app.notification_deliveries WHERE notification_id=$1',[off])).rows[0].n,0);
  await quiet();
});

test('NC02 batches wait for the window from the first item, per channel, and leave early at twenty',async()=>{
  await quiet();
  const zoe=await human('Зоя Окно','zoe@example.org');
  const p=await project([zoe]);
  await task(p.id,'w1');
  await linkChat(zoe,12001);
  await ok(choose(zoe,{email:true,telegram:true}));
  // The person's own time zone dates the batch (UTC+14 is a day ahead of most of the world).
  await f.admin.query("INSERT INTO app.workbench_preferences(principal_id,timezone) VALUES($1,'Etc/GMT-14')",[zoe.id]);
  for(let i=0;i<3;i++)await mention(zoe,p.id,'w1');
  assert.equal(await claim(['telegram','email'],300,900),null,'the window is still open');
  // The window starts at the first waiting item: only that one is older than five minutes.
  const [first]=(await deliveries(zoe)).filter(d=>d.channel==='telegram');
  await f.admin.query("UPDATE app.notification_deliveries SET created_at=now()-interval '301 seconds' WHERE id=$1",[first.id]);
  const batch=await claim(['telegram','email'],300,900);
  assert.equal(batch.channel,'telegram');assert.equal(batch.items.length,3);assert.equal(batch.chatId,'12001');
  assert.equal(batch.zone,'Etc/GMT-14');
  assert.equal(batch.today,(await f.admin.query("SELECT to_char(now() AT TIME ZONE 'Etc/GMT-14','YYYY-MM-DD') AS d")).rows[0].d);
  assert.equal(await claim(['telegram','email'],300,900),null,'e-mail keeps its own, longer window');
  assert.equal((await claim(['email'],300,0)).items.length,3,'the e-mail batch of the same items');
  assert.equal((await settle(batch,'sent')).rows[0].ok,true);
  assert.ok((await deliveries(zoe)).filter(d=>d.channel==='telegram').every(d=>d.state==='sent'&&d.batch_id===batch.id));
  assert.equal((await batches(zoe,'telegram'))[0].state,'sent');
  await quiet();
  // Twenty waiting leave at once, whatever the window; the twenty-first waits for the next batch.
  for(let i=0;i<21;i++)await mention(zoe,p.id,'w1');
  const full=await claim(['telegram'],3600,3600);
  assert.equal(full.items.length,20);
  assert.equal(await claim(['telegram'],3600,3600),null);
  assert.equal((await deliveries(zoe)).filter(d=>d.channel==='telegram'&&d.state==='queued').length,1);
  await quiet();
});

test('NC03 several updates about one task become one entry with all reasons; a repeated reason is said once',async()=>{
  await quiet();
  const kim=await human('Ким Сводка');
  const p=await project([kim]);
  await linkChat(kim,13001);
  await task(p.id,'d1',{title:'Граф связей: подписи рёбер',ownerId:kim.id});
  await edit(p.id,'d1',{ownerId:f.alice.id});await edit(p.id,'d1',{ownerId:kim.id});
  await say(p.id,'d1','@Ким посмотри, пожалуйста, подписи на рёбрах');
  await task(p.id,'d2',{title:'Онбординг',ownerId:kim.id});
  const api=await startFakeTelegram();
  const work=await startWorker({...telegram,SPRINTIQUE_TELEGRAM_API_BASE:api.url});
  try{
    await until(async()=>(await batches(kim,'telegram'))[0]?.state==='sent','the batch is sent',work.output);
    const messages=api.sent.filter(s=>s.chat===13001);
    assert.equal(messages.length,1,'one message for the whole batch');
    const text=messages[0]!.text,link=(id:number)=>`${PUBLIC}/?project=${p.slug}#/task/${p.key}-${id}`;
    assert.equal(text,`<b>Sprintique · 3 новых</b>\n\n<i>Проект ${p.key}</i>\n`+
      `<a href="${link(1)}"><b>Граф связей: подписи рёбер</b></a>\nАлиса назначает вас исполнителем\n`+
      'Алиса упоминает вас: “@Ким посмотри, пожалуйста, подписи на рёбрах”\n\n'+
      `<a href="${link(2)}"><b>Онбординг</b></a>\nАлиса назначает вас исполнителем`);
    assert.deepEqual(messages[0]!.markup,{inline_keyboard:[[{text:'Открыть Sprintique',url:PUBLIC+'/'}]]});
    assert.deepEqual((await deliveries(kim)).map(d=>d.state),['sent','sent','sent','sent'],'four items, three reasons');
  }finally{await work.stop();await api.close();}
});

test('NC04 every item is checked again before it leaves; dead items are dropped, and nothing is sent when none is left',async()=>{
  await quiet();
  const lea=await human('Лея Проверка','lea@example.org');
  const p=await project([lea]),other=await project([lea]);
  await linkChat(lea,14001);
  await ok(choose(lea,{email:true,telegram:true}));
  await task(p.id,'k1',{ownerId:lea.id});                 // stays: assigned, still hers
  await task(p.id,'k2',{ownerId:lea.id});                 // STALE: given to someone else
  const read=await mention(lea,p.id,'k1');                // READ in the product
  const old=await mention(lea,p.id,'k1');                 // EXPIRED: older than a day
  await task(other.id,'o1',{ownerId:lea.id});            // PROJECT_OFF
  const away=(await f.admin.query("SELECT id FROM app.notifications WHERE recipient_id=$1 AND project_id=$2",[lea.id,other.id])).rows[0].id as string;
  await task(p.id,'k3');const muted=await mention(lea,p.id,'k3');        // MUTED later
  await edit(p.id,'k2',{ownerId:f.alice.id});
  await ok(call('POST','/api/v1/notifications/read',{ids:[read]},lea));
  await f.admin.query("UPDATE app.notifications SET created_at=now()-interval '25 hours' WHERE id=$1",[old]);
  await ok(call('PUT',`${base(other.id)}/notifications`,{enabled:false,baseRevision:0}));
  await ok(choose(lea,{email:true,telegram:true},{...KINDS,mention:false}));
  const batch=await claim(['telegram'],0,0);
  assert.equal(batch.items.length,1);assert.equal(batch.items[0].taskTitle,'Задача k1');assert.equal(batch.items[0].kind,'assigned');
  const code=async(notification:string,channel:string)=>(await f.admin.query('SELECT last_error_code FROM app.notification_deliveries WHERE notification_id=$1 AND channel=$2',[notification,channel])).rows[0].last_error_code;
  assert.equal(await code(read,'telegram'),'READ');assert.equal(await code(old,'telegram'),'EXPIRED');
  assert.equal(await code(away,'telegram'),'PROJECT_OFF');assert.equal(await code(muted,'telegram'),'MUTED');
  const stale=(await f.admin.query("SELECT d.last_error_code FROM app.notification_deliveries d JOIN app.notifications n ON n.id=d.notification_id WHERE n.task_id='k2' AND n.recipient_id=$1 AND d.channel='telegram'",[lea.id])).rows[0];
  assert.equal(stale.last_error_code,'STALE');
  await settle(batch,'sent');
  // E-mail turned off and the chat unlinked: the rest is dropped, and nothing is sent at all.
  await ok(choose(lea,{email:false,telegram:true}));
  await f.admin.query('DELETE FROM app.telegram_connections WHERE principal_id=$1',[lea.id]);
  await f.admin.query("UPDATE app.notification_deliveries SET state='queued',batch_id=NULL,sent_at=NULL,last_error_code=NULL WHERE recipient_id=$1 AND notification_id=(SELECT id FROM app.notifications WHERE recipient_id=$1 AND task_id='k1' AND kind='assigned')",[lea.id]);
  assert.equal(await claim(['telegram','email'],0,0),null);
  const left=(await deliveries(lea)).filter(d=>d.state==='skipped').map(d=>d.channel+':'+d.last_error_code);
  assert.ok(left.includes('email:CHANNEL_OFF')&&left.includes('telegram:NOT_LINKED'),left.join(' '));
  assert.equal((await batches(lea,'email')).length,0,'no empty letter');
});

let letterToken='';
test('NC05 a letter: multipart/alternative with a text part, its headers, one-click unsubscribe, no injected header',async()=>{
  await quiet();
  const nina=await human('Нина Почта','nina@example.org');
  const odd=await human('Ева\r\nBcc: evil@example.org');
  const p=await project([nina,odd]);
  await ok(choose(nina,{email:true,telegram:false}));
  await task(p.id,'m1',{title:'Граф связей: подписи рёбер',ownerId:nina.id},odd);
  await task(p.id,'m2',{title:'Онбординг',ownerId:nina.id});
  const before=smtp.letters.length;
  const work=await startWorker();
  try{
    await until(async()=>(await batches(nina,'email'))[0]?.state==='sent','the letter is sent',work.output);
    const letters=smtp.letters.slice(before).filter(l=>l.to.includes('nina@example.org'));
    assert.equal(letters.length,1,'one letter for the batch');
    const letter=letters[0]!;
    assert.equal(letter.from,'no-reply@sprintique.test');assert.deepEqual(letter.to,['nina@example.org'],'nobody else on the envelope');
    const parsed=parseLetter(letter.raw);
    const batch=(await batches(nina,'email'))[0];
    assert.equal(decodeWords(parsed.headers.get('subject')!),'2 задачи требуют внимания · Sprintique');
    assert.match(parsed.headers.get('from')!,/no-reply@sprintique\.test/);
    assert.equal(parsed.headers.get('to'),'nina@example.org');
    assert.equal(parsed.headers.has('bcc'),false);
    assert.equal(parsed.headers.get('auto-submitted'),'auto-generated');
    assert.equal(parsed.headers.get('message-id'),`<notifications.${batch.id}@sprintique.test>`);
    assert.equal(parsed.headers.get('list-unsubscribe-post'),'List-Unsubscribe=One-Click');
    const unsubscribe=/^<(https:\/\/sprintique\.example\/api\/v1\/notifications\/unsubscribe\?token=([A-Za-z0-9_.-]+))>$/.exec(parsed.headers.get('list-unsubscribe')!);
    assert.ok(unsubscribe,parsed.headers.get('list-unsubscribe'));
    letterToken=unsubscribe![2]!;
    assert.ok(!parsed.headers.get('list-unsubscribe')!.includes('nina'),'the link holds no address');
    assert.match(parsed.contentType,/^multipart\/alternative/);
    assert.deepEqual(parsed.parts.map(part=>part.type),['text/plain','text/html']);
    assert.ok(parsed.parts.every(part=>/charset=UTF-8/i.test(part.headers.get('content-type')!)));
    const [text,html]=parsed.parts.map(part=>part.text) as [string,string];
    assert.match(text,new RegExp(`Граф связей: подписи рёбер \\(${p.key}-1\\)`));
    assert.match(text,new RegExp(`Открыть задачу: https://sprintique\\.example/\\?project=${p.slug}#/task/${p.key}-2`));
    assert.match(text,/Ева B\. назначает вас исполнителем/);
    assert.ok(text.includes('Отключить письма: '+unsubscribe![1]));
    assert.ok(!text.split('\n').some(line=>/^\s*([-•*]|\d+\.)\s/.test(line)),'no lists in the text');
    assert.ok(html.includes(`href="https://sprintique.example/?project=${p.slug}#/task/${p.key}-1"`));
    assert.ok(html.includes('Настроить уведомления')&&html.includes('Отключить письма'));
    assert.ok(!/<(ul|ol|li|img|script)\b/i.test(html),'no lists, images or scripts');
    assert.ok(!work.output().includes('nina@example.org'),'the address never reaches the log');
  }finally{await work.stop();}
});

test('NC06 the one-click unsubscribe token: the page asks, the post turns e-mail off; tampered, expired and odd links do nothing',async()=>{
  assert.ok(letterToken,'NC05 left a token');
  const nina=(await f.admin.query("SELECT id FROM auth.principals WHERE email='nina@example.org'")).rows[0].id as string;
  const emailOn=async()=>(await f.admin.query('SELECT email_enabled FROM app.notification_preferences WHERE principal_id=$1',[nina])).rows[0].email_enabled as boolean;
  const url='/api/v1/notifications/unsubscribe?token=';
  const page=await f.app.inject({url:url+letterToken});
  assert.equal(page.statusCode,200);assert.match(String(page.headers['content-type']),/^text\/html/);
  assert.ok(page.body.includes('Отключить письма')&&page.body.includes(`action="/api/v1/notifications/unsubscribe?token=${letterToken}"`));
  assert.match(String(page.headers['content-security-policy']),/default-src 'none'/);
  assert.equal(page.headers['referrer-policy'],'no-referrer');
  assert.equal(await emailOn(),true,'opening the link changes nothing');
  const form={'content-type':'application/x-www-form-urlencoded'};
  // A tampered signature, a tampered payload, a foreign key, an expired token, extra query: refused, nothing changes.
  const [payload,signature]=letterToken.split('.') as [string,string];
  const flipped=signature.slice(0,5)+(signature[5]==='A'?'B':'A')+signature.slice(6);
  const forged=(person:string,expiry:number,key=LINK_SECRET)=>{
    const body=Buffer.from(`u1|${expiry}|${person}`).toString('base64url');
    const derived=createHmac('sha256',key).update('sprintique/email-unsubscribe/v1').digest();
    return body+'.'+createHmac('sha256',derived).update(body).digest('base64url');
  };
  const other=Buffer.from(Buffer.from(payload,'base64url').toString().replace(nina,f.bob.id)).toString('base64url');
  for(const [token,status] of [[payload+'.'+flipped,400],[other+'.'+signature,400],[forged(nina,Math.floor(Date.now()/1000)+3600,'X'.repeat(48)),400],
      [forged(nina,Math.floor(Date.now()/1000)-60),410],['nonsense',400]] as [string,number][]){
    const answer=await f.app.inject({method:'POST',url:url+token,headers:form,payload:'List-Unsubscribe=One-Click'});
    assert.equal(answer.statusCode,status,token);
  }
  assert.equal((await f.app.inject({method:'POST',url:url+letterToken+'&x=1',headers:form,payload:'List-Unsubscribe=One-Click'})).statusCode,400);
  assert.equal(await emailOn(),true);
  // A valid signature made with the server's key for another time works: the token is the key's, not stored.
  assert.equal((await f.app.inject({url:url+forged(nina,Math.floor(Date.now()/1000)+3600)})).statusCode,200);
  // RFC 8058: the provider posts without cookies or an Origin; e-mail goes off, and again changes nothing.
  const done=await f.app.inject({method:'POST',url:url+letterToken,headers:form,payload:'List-Unsubscribe=One-Click'});
  assert.equal(done.statusCode,200);assert.ok(done.body.includes('Письма отключены'));
  assert.equal(await emailOn(),false);
  assert.equal((await f.app.inject({method:'POST',url:url+letterToken,headers:form,payload:'List-Unsubscribe=One-Click'})).statusCode,200);
  // Only e-mail: the other preferences stay.
  const row=(await f.admin.query('SELECT telegram_enabled,muted_kinds FROM app.notification_preferences WHERE principal_id=$1',[nina])).rows[0];
  assert.equal(row.telegram_enabled,false);assert.deepEqual(row.muted_kinds,[]);
});

test('NC07 a long Telegram batch is split under 4096 characters at task boundaries; a failed part is retried alone',async()=>{
  await quiet();
  const max=await human('Макс Длинный');
  const p=await project([max]);
  await linkChat(max,17001);
  for(let i=1;i<=20;i++)await task(p.id,'l'+i,{title:`Задача ${i}: `+'очень длинное название, чтобы пачка не уместилась в одно сообщение Telegram '.repeat(2).trim(),ownerId:max.id});
  // The second message fails once with 502: the first part is settled as sent and never repeated.
  const api=await startFakeTelegram((chat,count)=>chat===17001&&count===2?{status:502,body:{ok:false,error_code:502,description:'Bad Gateway'}}:null);
  const work=await startWorker({...telegram,SPRINTIQUE_TELEGRAM_API_BASE:api.url});
  try{
    await until(async()=>(await batches(max,'telegram'))[0]?.last_error_code==='TELEGRAM_502','the second part failed',work.output);
    const sentFirst=(await deliveries(max)).filter(d=>d.state==='sent').length;
    assert.ok(sentFirst>0&&sentFirst<20,`the first part is settled as sent (${sentFirst})`);
    await f.admin.query("UPDATE app.notification_batches SET next_attempt_at=now() WHERE recipient_id=$1 AND state='pending'",[max.id]);
    await until(async()=>(await batches(max,'telegram'))[0]?.state==='sent','the rest is sent',work.output);
    const messages=api.sent.filter(s=>s.chat===17001);
    assert.ok(messages.length>=3);
    assert.ok(messages.every(m=>m.text.length<=4096),'under the limit');
    const delivered=messages.filter(m=>m.count!==2);
    const titles=delivered.flatMap(m=>[...m.text.matchAll(/<b>(Задача \d+):/g)].map(x=>x[1]));
    assert.equal(titles.length,20,'each task once');assert.equal(new Set(titles).size,20);
    // Parts end on a whole task: a reason line, never a title.
    assert.ok(delivered.every(m=>m.text.split('\n').at(-1)==='Алиса назначает вас исполнителем'),'parts end at a task');
    assert.ok(delivered[0]!.text.startsWith(`<b>Sprintique · 20 новых</b>\n\n<i>Проект ${p.key}</i>\n<a href=`));
    assert.ok(delivered.slice(0,-1).every(m=>!m.markup)&&delivered.at(-1)!.markup,'buttons on the last part');
    assert.ok((await deliveries(max)).every(d=>d.state==='sent'));
    assert.equal((await batches(max,'telegram'))[0].attempts,2);
  }finally{await work.stop();await api.close();}
});

test('NC08 letters are retried after a temporary refusal and fail for good after a permanent one',async()=>{
  await quiet();
  const temp=await human('Тим Повтор','temp@example.org'),gone=await human('Гоша Нет','gone@example.org');
  const p=await project([temp,gone]);
  for(const user of [temp,gone])await ok(choose(user,{email:true,telegram:false}));
  await task(p.id,'r1',{ownerId:temp.id});await task(p.id,'r2',{ownerId:gone.id});
  smtp.refuse('temp@example.org',451,1);smtp.refuse('gone@example.org',550);
  const work=await startWorker();
  try{
    await until(async()=>(await batches(gone,'email'))[0]?.state==='failed','a permanent refusal',work.output);
    assert.equal((await batches(gone,'email'))[0].last_error_code,'SMTP_REJECTED');
    assert.equal((await deliveries(gone))[0].state,'failed');
    await until(async()=>(await batches(temp,'email'))[0]?.last_error_code==='SMTP_UNAVAILABLE','a temporary refusal',work.output);
    const waiting=(await batches(temp,'email'))[0];
    assert.equal(waiting.state,'pending');assert.ok(new Date(waiting.next_attempt_at).getTime()>Date.now(),'backs off');
    await f.admin.query('UPDATE app.notification_batches SET next_attempt_at=now() WHERE id=$1',[waiting.id]);
    await until(async()=>(await batches(temp,'email'))[0]?.state==='sent','sent on the retry',work.output);
    assert.equal((await batches(temp,'email'))[0].attempts,2);
    assert.equal(smtp.letters.filter(l=>l.to.includes('temp@example.org')).length,1);
  }finally{await work.stop();}
});
