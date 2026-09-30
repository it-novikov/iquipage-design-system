import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
let f:Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'PC'});});after(async()=>{await f?.close();});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
async function call(method:'GET'|'POST'|'PUT'|'PATCH',url:string,payload?:unknown,headers=f.alice.headers){
  const r=await f.app.inject({method,url,headers:{...headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
  return r;
}
async function ok(method:'GET'|'POST'|'PUT'|'PATCH',url:string,payload?:unknown,headers=f.alice.headers){const r=await call(method,url,payload,headers);assert.equal(r.statusCode,200,r.body);return r.json();}
async function apply(intent:unknown){const plan=await ok('POST',path('planning/view/preview'),intent);const [planId,token]=plan.token.split('.');const result=await ok('POST',path('planning/commands'),{planId,token});assert.equal(result.status,'committed',JSON.stringify(result));}

test('members show when they joined and when they were last active',async()=>{
  await ok('PUT',path('tasks/activity-task'),{baseRevision:0,task:{title:'Активность'}});
  const members=await ok('GET',path('members'));
  const alice=members.find((m:{id:string})=>m.id===f.alice.id),reader=members.find((m:{id:string})=>m.id===f.reader.id);
  assert.ok(alice.joinedAt&&Number.isFinite(Date.parse(alice.joinedAt)),'creator join date');
  assert.ok(Date.parse(alice.lastActiveAt)>=Date.parse(alice.joinedAt),'activity after joining');
  assert.equal(reader.lastActiveAt,null,'no activity yet');
});
test('invitations name who invited and who accepted',async()=>{
  const created=await ok('POST',path('invitation-links'),{expiresInSeconds:86400});
  const list=await ok('GET',path('invitations'));
  const mine=list.find((i:{id:string})=>i.id===created.id);
  assert.equal(mine.inviterName,'Алиса');assert.equal(mine.acceptedByName,null);
});
test('tags report how many tasks carry them',async()=>{
  await ok('PUT',path('tags/usage-tag'),{baseRevision:0,value:{name:'Используемый',tone:'#3A7BD5'}});
  await ok('PUT',path('tags/unused-tag'),{baseRevision:0,value:{name:'Свободный',tone:'green'}});
  await ok('PUT',path('tasks/tagged-1'),{baseRevision:0,task:{title:'С тегом 1',tagIds:['usage-tag']}});
  await ok('PUT',path('tasks/tagged-2'),{baseRevision:0,task:{title:'С тегом 2',tagIds:['usage-tag']}});
  const tags=await ok('GET',path('tags'));
  assert.equal(tags.find((t:{id:string})=>t.id==='usage-tag').usageCount,2);
  assert.equal(tags.find((t:{id:string})=>t.id==='unused-tag').usageCount,0);
});
test('approvals report how many wait for a decision',async()=>{
  const page=await ok('GET',path('approvals'));
  assert.equal(page.pendingCount,0);assert.ok(Array.isArray(page.items));
});
test('the project time zone can follow the workspace and says where it comes from',async()=>{
  const initial=await ok('GET',path('planning/view/settings'));
  assert.equal(initial.timeZoneInherited,true);assert.equal(initial.timeZone,initial.workspaceTimeZone);
  await apply({kind:'settings',values:{format:'flexible',days:14,timeZone:'Europe/Moscow'}});
  const own=await ok('GET',path('planning/view/settings'));
  assert.equal(own.timeZoneInherited,false);assert.equal(own.timeZone,'Europe/Moscow');
  await ok('PATCH',`/api/v1/workspaces/${f.first.workspaceId}`,{baseRevision:(await ok('GET',`/api/v1/workspaces/${f.first.workspaceId}`)).revision,name:'Команда продукта',timezone:'Asia/Tokyo'});
  await apply({kind:'settings',values:{format:'flexible',days:14,timeZone:'Asia/Tokyo',inheritTimeZone:true}});
  const inherited=await ok('GET',path('planning/view/settings'));
  assert.equal(inherited.timeZoneInherited,true);assert.equal(inherited.timeZone,'Asia/Tokyo');assert.equal(inherited.workspaceTimeZone,'Asia/Tokyo');
  const row=(await f.admin.query('SELECT timezone FROM app.projects WHERE id=$1',[f.first.id])).rows[0];
  assert.equal(row.timezone,null,'an inherited zone is stored as NULL');
});
test('workspace catalog: administrators see every project, members only their own, outsiders nothing',async()=>{
  const extra=await ok('POST','/api/v1/projects',{workspaceId:f.first.workspaceId,name:'Второй проект',slug:'cat'+randomUUID().slice(0,6),key:'CAT'});
  const forAdmin=await ok('GET',`/api/v1/workspaces/${f.first.workspaceId}/projects`);
  assert.ok(forAdmin.some((p:{id:string})=>p.id===f.first.id)&&forAdmin.some((p:{id:string})=>p.id===extra.id));
  const first=forAdmin.find((p:{id:string})=>p.id===f.first.id);assert.equal(first.role,'admin');assert.ok(first.members>=2);
  const forReader=await ok('GET',`/api/v1/workspaces/${f.first.workspaceId}/projects`,undefined,f.reader.headers);
  assert.deepEqual(forReader.map((p:{id:string})=>p.id),[f.first.id]);assert.equal(forReader[0].role,'reader');
  assert.equal((await call('GET',`/api/v1/workspaces/${f.first.workspaceId}/projects`,undefined,f.bob.headers)).statusCode,404);
});
test('the profile carries the verified e-mail only for its owner',async()=>{
  assert.equal((await ok('GET','/api/v1/profile')).email,null);
  await f.admin.query("UPDATE auth.principals SET email='alice@example.test' WHERE id=$1",[f.alice.id]);
  assert.equal((await ok('GET','/api/v1/profile')).email,'alice@example.test');
  const members=await ok('GET',path('members'),undefined,f.reader.headers);
  assert.ok(members.every((m:Record<string,unknown>)=>!('email' in m)),'members never expose e-mail');
});
test('thread summaries name the first author, the last author and the participants',async()=>{
  await ok('PUT',path('tasks/talk-task'),{baseRevision:0,task:{title:'Обсуждаемая задача'}});
  await ok('POST',path('tasks/talk-task/threads'),{id:'talk-one',messageId:'talk-one-m1',body:'Делаем сейчас или переносим?',requiresResolution:true});
  await ok('POST',path('threads/talk-one/messages'),{id:'talk-one-m2',body:'Переносим',baseRevision:1});
  const page=await ok('GET',path('tasks/talk-task/threads'));
  const summary=page.items.find((t:{id:string})=>t.id==='talk-one');
  assert.equal(summary.summary,true);assert.equal(summary.messageCount,2);
  assert.equal(summary.messages[0].authorId,f.alice.id);assert.ok(Number.isFinite(Date.parse(summary.messages[0].createdAt)));
  assert.equal(summary.lastAuthorId,f.alice.id);assert.deepEqual(summary.participants,[f.alice.id]);
});
test('read markers are personal, move forward only and never past the thread activity',async()=>{
  await ok('PUT',path('tasks/read-task'),{baseRevision:0,task:{title:'Прочтение'}});
  await ok('POST',path('tasks/read-task/threads'),{id:'read-one',messageId:'read-one-m1',body:'Посмотрите макет',requiresResolution:false});
  const page=async(headers=f.alice.headers)=>ok('GET',path('tasks/read-task/threads'),undefined,headers);
  const mine=await page();assert.equal(mine.unread,0,'the author has nothing new');assert.equal(mine.items[0].readAt,null);
  const theirs=await page(f.reader.headers);assert.equal(theirs.unread,1,'a teammate sees one new thread');
  const activity=theirs.items[0].lastActivityAt;
  const marked=await ok('POST',path('threads/read-one/read'),{seenActivityAt:'2999-01-01T00:00:00.000Z'},f.reader.headers);
  assert.equal(marked.readAt,activity,'the marker stops at the thread activity');
  assert.equal((await page(f.reader.headers)).unread,0);assert.equal((await page(f.reader.headers)).items[0].readAt,activity);
  assert.equal((await page()).items[0].readAt,null,'markers are never shared');
  await ok('POST',path('threads/read-one/read'),{seenActivityAt:'2000-01-01T00:00:00.000Z'},f.reader.headers);
  assert.equal((await page(f.reader.headers)).items[0].readAt,activity,'a marker never moves back');
  await ok('POST',path('threads/read-one/messages'),{id:'read-one-m2',body:'Обновил',baseRevision:1});
  assert.equal((await page(f.reader.headers)).unread,1,'new activity is unread again');
  const rows=(await f.admin.query('SELECT principal_id FROM app.thread_reads WHERE project_id=$1 AND thread_id=$2',[f.first.id,'read-one'])).rows;
  assert.deepEqual(rows.map(r=>r.principal_id),[f.reader.id]);
  assert.equal((await call('POST',path('threads/missing/read'),{seenActivityAt:activity},f.reader.headers)).statusCode,404);
});
test('a comment can become a question after posting; a resolved question keeps its kind',async()=>{
  await ok('PUT',path('tasks/kind-task'),{baseRevision:0,task:{title:'Тип обсуждения'}});
  await ok('POST',path('tasks/kind-task/threads'),{id:'kind-one',messageId:'kind-one-m1',body:'Кажется, это вопрос',requiresResolution:false});
  const question=await ok('PATCH',path('threads/kind-one/kind'),{requiresResolution:true,baseRevision:1});
  assert.equal(question.requiresResolution,true);assert.equal(question.revision,2);
  assert.equal((await ok('GET',path('tasks/kind-task/threads'))).unresolved,1);
  await ok('PATCH',path('threads/kind-one/resolution'),{resolved:true,baseRevision:2});
  const refused=await call('PATCH',path('threads/kind-one/kind'),{requiresResolution:false,baseRevision:3});
  assert.equal(refused.statusCode,422);assert.equal(refused.json().code,'THREAD_KIND');
  assert.equal((await call('PATCH',path('threads/kind-one/kind'),{requiresResolution:true,baseRevision:1})).statusCode,409);
  // Наблюдатель writes in discussions (owner decision): the rule of the resolved question refuses, not the permission.
  assert.equal((await call('PATCH',path('threads/kind-one/kind'),{requiresResolution:false,baseRevision:3},f.reader.headers)).json().code,'THREAD_KIND');
});
test('a person photo is re-encoded, visible only to people who share a project or workspace, and cached by revision',async()=>{
  const sharp=(await import('sharp')).default;
  const png=await sharp({create:{width:300,height:200,channels:3,background:'#3a7bd5'}}).png().toBuffer();
  const put=(body:Buffer,headers=f.alice.headers)=>f.app.inject({method:'PUT',url:'/api/v1/profile/avatar',headers:{...headers,'content-type':'application/octet-stream'},payload:body});
  const first=await put(png);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().avatarRevision,1);
  assert.equal((await ok('GET','/api/v1/profile')).avatarRevision,1);
  const members=await ok('GET',path('members'),undefined,f.reader.headers);
  assert.equal(members.find((m:{id:string})=>m.id===f.alice.id).avatarRevision,1);assert.equal(members.find((m:{id:string})=>m.id===f.reader.id).avatarRevision,null);
  const seen=await f.app.inject({method:'GET',url:`/api/v1/people/${f.alice.id}/avatar?v=1`,headers:f.reader.headers});
  assert.equal(seen.statusCode,200);assert.equal(seen.headers['content-type'],'image/webp');assert.match(String(seen.headers['cache-control']),/immutable/);
  const meta=await sharp(seen.rawPayload).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,256);assert.equal(meta.height,256);
  assert.equal((await f.app.inject({method:'GET',url:`/api/v1/people/${f.alice.id}/avatar`,headers:f.bob.headers})).statusCode,404,'an outsider never sees it');
  assert.equal((await f.app.inject({method:'GET',url:`/api/v1/people/${f.alice.id}/avatar`})).statusCode,401);
  assert.equal((await f.app.inject({method:'PUT',url:'/api/v1/profile/avatar',headers:{'content-type':'application/octet-stream'},payload:png})).statusCode,401);
  assert.equal((await put(Buffer.from('not an image'))).statusCode,422);
  assert.equal((await put(png)).json().avatarRevision,2);
  const stale=await f.app.inject({method:'GET',url:`/api/v1/people/${f.alice.id}/avatar?v=1`,headers:f.reader.headers});assert.match(String(stale.headers['cache-control']),/no-cache/);
  assert.equal((await f.app.inject({method:'DELETE',url:'/api/v1/profile/avatar',headers:f.alice.headers})).statusCode,200);
  assert.equal((await f.app.inject({method:'GET',url:`/api/v1/people/${f.alice.id}/avatar`,headers:f.alice.headers})).statusCode,404);
  assert.equal((await ok('GET','/api/v1/profile')).avatarRevision,null);
});
