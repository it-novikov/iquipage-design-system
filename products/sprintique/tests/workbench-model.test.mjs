import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addDays,changeLine,changeOf,checkWhen,dayLabel,dueWhen,duePresets,neededWhen,parseRoute,plural,readFilter,snoozePresets,verbOf,viewPath,watchToggle,writeFilter}
  from '../web/workbench/model.js';

// The presentation rules of the Workbench interface (design-v2 §11), without a browser.
test('WM01 dates of a row: labelled, toned only when someone waits, never a time invented for a date',()=>{
  const today='2026-09-30';
  assert.equal(dayLabel(today,today),'сегодня');
  assert.equal(dayLabel('2026-10-01',today),'завтра, 01.10');
  assert.equal(dayLabel('2026-09-28',today),'было пн 28.09');
  assert.equal(dayLabel('2026-10-02',today),'пт 02.10');
  assert.deepEqual(neededWhen({request:{neededBy:'2026-09-28'}},today),{icon:'help',label:'Нужно до',value:'было пн 28.09',tone:'danger'});
  assert.equal(neededWhen({request:{neededBy:null}},today).value,'Без срока ответа');
  assert.equal(dueWhen({due:'2026-10-01',done:false},today).tone,'warning');
  assert.equal(dueWhen({due:'2026-09-01',done:true},today).tone,'','done work carries no alarm');
  assert.equal(dueWhen({plannedStart:'2026-09-30',plannedEnd:'2026-10-02'},today).value,'30.09 – 02.10');
  assert.equal(checkWhen({waiting:{checkBackAt:null}},today).value,'Без даты проверки');
  assert.equal(plural(21,'задача','задачи','задач'),'задача');assert.equal(plural(12,'задача','задачи','задач'),'задач');
  // Across a daylight-saving change a day is still one day.
  assert.equal(addDays('2026-10-24',2),'2026-10-26');
});

test('WM02 verbs by request kind and the change as "было → стало"',()=>{
  assert.deepEqual([verbOf({action:{kind:'review'}}).label,verbOf({action:{kind:'approve'}}).label,verbOf({action:{kind:'do'}}).label,
    verbOf({action:{kind:'question'}}).label,verbOf({action:{kind:'decision'}}).label],['Проверено','Утвердить','Решено','Ответить','Ответить']);
  assert.equal(verbOf({action:{kind:'review'}}).inline,true);assert.equal(verbOf({action:{kind:'decision'}}).inline,false);
  assert.equal(changeLine({kind:'due',detail:{from:'2026-10-02',to:'2026-10-09'}}),'срок перенесён 02.10 → 09.10');
  assert.equal(changeLine({kind:'status',detail:{from:'ready',to:'in_progress'}}),'статус «В работе»');
  assert.equal(changeLine({kind:'owner',detail:{from:{id:'a',name:'Ольга'},to:{id:'b',name:'Нина'}}}),'исполнитель сменился Ольга → Нина');
  assert.equal(changeOf({kind:'owner',detail:{from:{id:'a',name:null},to:null}}).from,'бывший участник','a person who left is not named');
  assert.equal(changeLine({kind:'resolution',detail:{resolved:true}}),'вопрос в обсуждении решён');
  assert.equal(changeLine(null,'запасной текст'),'запасной текст');
});

test('WM03 routes, the project filter, and presets bounded by the date someone waits for',()=>{
  assert.deepEqual(parseRoute('/workbench'),{view:'overview',task:null});
  assert.deepEqual(parseRoute('/workbench/list'),{view:'list',task:null});
  assert.deepEqual(parseRoute('/workbench/plan'),{view:'week',task:null});
  assert.deepEqual(parseRoute('/workbench/board'),{view:'overview',task:null},'the board is out of v1');
  assert.deepEqual(parseRoute('/workbench/tasks/p1/t-2'),{view:null,task:{projectId:'p1',taskId:'t-2'}});
  assert.equal(parseRoute('/workbench/tasks/p1'),null);assert.equal(parseRoute('/'),null);
  assert.equal(viewPath('week'),'/workbench/plan');
  assert.deepEqual(readFilter('?projects=b,a,a,bad%20id'),['a','b']);assert.equal(readFilter(''),null);assert.equal(writeFilter(['a','b']),'?projects=a,b');
  const now=new Date(2026,8,30,10,0,0);
  assert.equal(snoozePresets(null,now).length,3);
  const bounded=snoozePresets('2026-10-01',now);
  assert.ok(bounded.every(p=>p.until<=new Date('2026-10-01T00:00:00')),'never past the morning of neededBy');
  assert.equal(snoozePresets('2026-09-30',now).length,0,'nothing to offer on the day it is needed');
  assert.deepEqual(duePresets('2026-09-30').map(p=>p.date),['2026-10-01','2026-10-02','2026-10-05']);
});

test('WM04 «Наблюдаю» is an icon toggle among the drawer header\'s icon buttons: pressed state, name and tooltip',()=>{
  const off=watchToggle(false),on=watchToggle(true);
  assert.deepEqual([off.pressed,off.label,off.heading],['false','Наблюдать за задачей','Наблюдать за задачей']);
  assert.deepEqual([on.pressed,on.label,on.heading],['true','Наблюдаю — нажмите, чтобы перестать','Наблюдаю']);
  assert.match(off.text,/^Задача будет на вашем Рабочем столе, изменения придут в «Изменилось»\.$/);
  assert.match(on.text,/Автор задачи наблюдает с момента создания/,'the author is in from creation, and the tooltip says so');
  for(const view of [off,on])assert.doesNotMatch(Object.values(view).join(' '),/[Уу]част/,'the old name is gone');
  // The toggle has no visible text: the same button family as cover, full screen and close (task-dialog.js).
  const panel=readFileSync(new URL('../web/workbench/personal-panel.js',import.meta.url),'utf8');
  assert.match(panel,/join\.className='iq-btn ghost icon sm dsk-join'/);
  assert.match(panel,/join\.innerHTML=icon\('eye',18\)/);
  assert.match(panel,/document\.createElement\('iq-tooltip'\)/);
  assert.match(panel,/insertBefore\(tip,actions\.querySelector\(':scope > \.iq-btn\.icon'\)\)/,'placed right before the header\'s icon buttons');
  const dialog=readFileSync(new URL('../ui/src/board/task-dialog.js',import.meta.url),'utf8');
  assert.match(dialog,/class="iq-btn ghost icon sm" data-task-fullscreen[^`]*icon\('expand',18\)/,'the neighbours it matches');
  // J on a Workbench row still toggles it.
  const keyboard=readFileSync(new URL('../web/workbench/keyboard.js',import.meta.url),'utf8');
  assert.match(keyboard,/event\.key==='j'\|\|event\.key==='J'[^\n]*dsk-toggle-participation/);
  const lanes=readFileSync(new URL('../web/workbench/dashboard.js',import.meta.url),'utf8');
  assert.match(lanes,/\{key:'joined',title:'Наблюдаю',icon:'eye'/);
});
