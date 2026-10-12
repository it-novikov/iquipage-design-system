import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {can} from '../web/permissions.js';
const src=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('task and thread grants are independent in both directions',()=>{
  const discussOnly={permissions:['tasks.read','threads.write']},editOnly={permissions:['tasks.read','tasks.write']};
  assert.equal(can(discussOnly,'tasks.write'),false);assert.equal(can(discussOnly,'threads.write'),true);
  assert.equal(can(editOnly,'tasks.write'),true);assert.equal(can(editOnly,'threads.write'),false);
});
test('the task dialog takes discussion from its own grant, not from canEdit or the accepted result',async()=>{
  const s=await src('ui/src/board/task-dialog.js');
  assert.match(s,/const mayDiscuss=canDiscuss\?\?canEdit;/);
  assert.ok(s.indexOf('const mayDiscuss')<s.indexOf("canEdit=canEdit&&task?.result!=='accepted'"),'accepted Task keeps discussion');
  assert.match(s,/readOnly:!mayDiscuss/);assert.doesNotMatch(s,/const canDiscuss=canEdit/);
});
test('every task host passes threads.write and Workbench uses grants, not roles',async()=>{
  for(const p of ['web/main.js','web/planning-host.js','web/maps-host.js','web/workbench/host.js'])assert.match(await src(p),/canDiscuss:can\(project,'threads\.write'\)/,p);
  const h=await src('web/workbench/host.js');assert.doesNotMatch(h,/role!=='reader'|role==='admin'/);
});
test('Workbench open tells denied, missing and transient apart and drops late answers',async()=>{
  const h=await src('web/workbench/host.js');
  assert.doesNotMatch(h,/repository\.read\('tasks',target\.taskId,project\.id\)\.catch\(\(\)=>null\)/);
  assert.match(h,/status===404/);assert.match(h,/status===403/);assert.match(h,/label:'Повторить'/);
  assert.match(h,/if\(closed\|\|ticket!==generation\)return;/);
});
