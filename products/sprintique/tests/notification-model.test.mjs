import {test} from 'node:test';
import assert from 'node:assert/strict';
import {badgeText,bellLabel,rowMeta,kindGlyph,telegramStatus,emailStatus,hasChannels,NOTIFICATION_KINDS} from '../web/notification-model.js';

// The presentation rules of the bell and the notification settings, without a browser.
test('NM01 the bell shows a count only above zero and names it for screen readers',()=>{
  assert.deepEqual([0,-3,null,1,42,99,100,1500].map(badgeText),['','','','1','42','99','99+','99+']);
  assert.equal(bellLabel(0),'Уведомления');
  assert.equal(bellLabel(1),'Уведомления: 1 непрочитанное');
  assert.equal(bellLabel(3),'Уведомления: 3 непрочитанных');
  assert.equal(bellLabel(21),'Уведомления: 21 непрочитанное');
});

test('NM02 a row says where and when; a notification without a person has a glyph',()=>{
  const now=Date.parse('2026-10-01T12:00:00Z');
  assert.equal(rowMeta({project:{name:'Sprintique'},createdAt:'2026-10-01T11:55:00Z'},now),'Sprintique · 5 мин назад');
  assert.equal(rowMeta({project:{name:'Sprintique'},createdAt:'2026-10-01T11:59:50Z'},now),'Sprintique · только что');
  assert.equal(kindGlyph('deadline'),'flag');assert.equal(kindGlyph('unknown'),'bell');
});

test('NM03 Telegram: hidden without the server, then connect, then connected as @name',()=>{
  assert.equal(telegramStatus({available:false}),null);
  assert.equal(telegramStatus({available:true,connection:null}).connected,false);
  assert.match(telegramStatus({available:true,connection:{username:'anya',linkedAt:'2026-10-01T00:00:00Z'}}).meta,/^Подключён как @anya\. /);
  assert.match(telegramStatus({available:true,connection:{username:null,linkedAt:'2026-10-01T00:00:00Z'}}).meta,/^Подключён\. /);
  assert.deepEqual(NOTIFICATION_KINDS.map(k=>k.kind),['assigned','mention','request','deadline']);
});

test('NM04 e-mail shows the account address read-only, and only when the server sends letters',()=>{
  assert.equal(emailStatus({available:false,address:null}),null);
  assert.equal(emailStatus({available:true,address:null}),null);
  assert.equal(emailStatus({available:true,address:'anya@example.org'}).address,'anya@example.org');
  assert.equal(hasChannels({email:{available:false},telegram:{available:false}}),false);
  assert.equal(hasChannels({email:{available:true,address:'a@b.c'},telegram:{available:false}}),true);
  assert.equal(hasChannels({email:{available:false},telegram:{available:true,connection:null}}),true);
  // No lists in product copy: every hint is a plain sentence.
  for(const k of NOTIFICATION_KINDS)assert.doesNotMatch(k.hint,/^[-•*]|\n/);
});
