// Copy regression only; native delivery/unlink behavior is documented in WP05 evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WorkbenchApi} from '../web/workbench/api.js';
const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('WP05 waiting acknowledgment is labelled personally, not as result approval',async()=>{
 const rows=await source('web/workbench/rows.js');
 const waiting=rows.slice(rows.indexOf('export function waitingItem('),rows.indexOf('export function watchingItem('));
 assert.match(waiting,/verbButton\('Больше не жду','check',`data-accept aria-label="Больше не жду:/);
 assert.match(waiting,/w.done&&parts.waiting/);
 assert.doesNotMatch(waiting,/verbButton\('Принять'/);
});
test('WP05 personal acknowledgment and collective decision retain distinct endpoints',async()=>{
 const calls=[],api=new WorkbenchApi({request(...args){calls.push(args);return Promise.resolve({revision:3});}});
 await api.accept('p','t',2,true,'personal-key');await api.accept('p','t',3,false,'undo-key');await api.decide('p','a',4,'approved','approval-key');
 assert.deepEqual(calls.map(c=>c.slice(0,3)),[
 ['/projects/p/tasks/t/personal/accept','PUT',{baseRevision:2,accepted:true}],
 ['/projects/p/tasks/t/personal/accept','PUT',{baseRevision:3,accepted:false}],
 ['/projects/p/approvals/a/decision','POST',{baseRevision:4,status:'approved'}]]);
 assert.deepEqual(calls.map(c=>c[3]),['personal-key','undo-key','approval-key']);
});
test('WP05 Telegram actions and request zero-count copy stay distinct',async()=>{
 const telegram=await source('web/notification-settings.js'),dashboard=await source('web/workbench/dashboard.js'),actions=await source('web/workbench/actions.js');
 assert.match(telegram,/ui.btn\('Отвязать Telegram'/);assert.match(telegram,/ui.toggle\('Доставлять уведомления'/);
 assert.match(telegram,/request\('\/profile\/telegram','DELETE'\)/);assert.match(telegram,/request\('\/profile\/notifications','PUT',body\)/);
 assert.match(dashboard,/label:'Запросы к вам',count:action.count\|\|null/);assert.doesNotMatch(dashboard,/Нужно действие/);
 assert.match(actions,/<b>Вы больше не ждёте<\/b>/);
});

test('WP05 labels distinguish executor catalog, legacy grants and account AI mode',async()=>{
 const settings=await source('web/settings-sections.js'),grants=await source('web/agents.js'),profile=await source('web/agent-profile.js'),catalog=await source('web/agents-directory.js');
 assert.match(settings,/{id:'agents',label:'Предложения и API-доступ'/);
 assert.match(grants,/ui.btn\('Выдать API-доступ'/);
 assert.match(grants,/title:'API-доступ ещё не выдан'/);
 assert.match(profile,/title:'Работа с ИИ в Sprintique'/);
 assert.match(profile,/ui.toggle\('Работа с ИИ включена'/);
 assert.match(catalog,/title:'Агенты'/);
});
