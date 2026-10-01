import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ||= class {};
const {mentionCandidates,mentionNames,closeCutMention}=await import('../ui/src/board/mention-options.js');
const {filterMentionCandidates,mentionToken,mentionsHTML,mentionPlainText}=await import('@iquipage/web/core');

// The @ list of a discussion (docs/decisions/0008-mentions-and-service-inbox.md): who it offers, in which order, and
// how mentions read in previews. The members list as the repository keeps it (a service account named with its owner).
const WRITES=['tasks.read','tasks.write','threads.write'],READS=['tasks.read'];
const members=[
  {id:'robot',kind:'service',accountName:'Робот',name:'Робот (сервисный аккаунт Алиса)',permissions:WRITES,ownerName:'Алиса',suspended:false},
  {id:'alice',kind:'human',name:'Алиса Ким',permissions:WRITES,avatarRevision:2},
  {id:'reader',kind:'human',name:'Ёжик Наблюдатель',permissions:READS},
  {id:'paused',kind:'service',accountName:'Пауза',name:'Пауза',permissions:WRITES,ownerName:'Алиса',suspended:true},
  {id:'blind',kind:'service',accountName:'Слепой',name:'Слепой',permissions:[],ownerName:'Алиса',suspended:false},
  {id:'agent',kind:'agent',name:'Агент'}];

test('the @ list offers people first, then active service accounts that read tasks, each with its owner',()=>{
  const list=mentionCandidates(members,{image:m=>m.avatarRevision?`/api/v1/people/${m.id}/avatar`:undefined});
  assert.deepEqual(list.map(m=>m.id),['alice','reader','robot']);
  assert.deepEqual(list[0],{id:'alice',name:'Алиса Ким',kind:'human',image:'/api/v1/people/alice/avatar'});
  assert.deepEqual(list[2],{id:'robot',name:'Робот',kind:'service',description:'Владелец — Алиса'});
});

test('filtering as people type: case-insensitive, «ё» as «е», people before service accounts',()=>{
  const list=mentionCandidates(members);
  assert.deepEqual(filterMentionCandidates(list,'ЕЖ').map(m=>m.id),['reader']);
  assert.deepEqual(filterMentionCandidates(list,'наб').map(m=>m.id),['reader']);
  assert.deepEqual(filterMentionCandidates(list,'').map(m=>m.id),['alice','reader','robot']);
  assert.equal(mentionToken(list[2]),'@[Робот](user:robot)');
});

test('previews read mentions with current names; a cut token and a non-member are plain text',()=>{
  const names=mentionNames(members);
  assert.deepEqual(names.find(m=>m.id==='robot'),{id:'robot',name:'Робот',kind:'service'});
  assert.equal(names.some(m=>m.id==='agent'),false);
  assert.match(mentionsHTML('@[Старое имя](user:alice), глянь',names),/^<span class="md-mention" data-mention="alice">@Алиса Ким<\/span>, глянь$/);
  assert.equal(mentionsHTML('@[Чужой <b>](user:zz)',names),'@Чужой &lt;b&gt;');
  const cut=('x'.repeat(140)+' @[Алиса Ким](user:ali').slice(0,160);
  assert.equal(closeCutMention(cut).endsWith('@Алиса Ким…'),true);
  assert.equal(closeCutMention('коротко @['),'коротко @[','a short message is never cut');
  assert.equal(mentionPlainText(closeCutMention('y'.repeat(150)+' @[Алиса](user:alice) и'),names),'y'.repeat(150)+' @Алиса Ким и');
});
