import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTask,validateTask} from '../src/tasks.js';
import {MemoryRepository} from '../src/repository.js';
import {FileRepository} from '../server/file-repository.mjs';
import {boardComparator,buildTaskIndex,projectColumn,reparentTask,childOwners,taskKindLabel} from '../src/board/model.js';
const make=(id,fields={})=>({...createTask({projectId:'board-tests',title:id}),id,...fields});
test('board priority order is explicit, stable and does not mutate records',()=>{
 const input=[make('b',{priority:'normal'}),make('a',{priority:'high'}),make('c',{priority:'critical'})];
 const before=structuredClone(input);assert.deepEqual([...input].sort(boardComparator()).map(t=>t.id),['c','a','b']);assert.deepEqual(input,before);
});
test('deadline order leaves missing deadlines last and breaks ties by ID',()=>{
 const tasks=[make('z'),make('b',{due:'2026-09-19'}),make('a',{due:'2026-09-19'})];
 assert.deepEqual(tasks.sort(boardComparator('due')).map(t=>t.id),['a','b','z']);
});
test('subtask is a relationship role, not a fourth type',()=>{
 assert.equal(taskKindLabel(make('s',{parentId:'p'})),'Подзадача');assert.equal(taskKindLabel(make('s',{type:'bug',parentId:'p'})),'Баг · подзадача');
 assert.throws(()=>validateTask(make('s',{type:'subtask'})),{code:'TASK_TYPE'});
});
test('same-status children nest; other-status children remain in their own column',()=>{
 const tasks=[make('p'),make('same',{parentId:'p'}),make('other',{parentId:'p',status:'review'})];
 const ready=projectColumn(tasks,'ready'),review=projectColumn(tasks,'review');
 assert.equal(ready.total,2);assert.deepEqual(ready.rows.map(r=>[r.task.id,r.depth]),[['p',0],['same',1]]);
 assert.equal(ready.rows[0].otherChildren,1);assert.equal(review.rows[0].task.id,'other');assert.equal(review.rows[0].parent.id,'p');
});
test('collapsed children remain counted; a matching child survives a parent filter',()=>{
 const tasks=[make('p'),make('c',{parentId:'p'})];
 const hidden=projectColumn(tasks,'ready',{collapsed:new Set(['p'])});assert.equal(hidden.total,2);assert.equal(hidden.rows.length,1);
 const filtered=projectColumn(tasks,'ready',{predicate:t=>t.id==='c',filtering:true,collapsed:new Set(['p'])});
 assert.equal(filtered.matched,1);assert.equal(filtered.rows[0].task.id,'c');assert.equal(filtered.rows[0].parent.id,'p');
});
test('moving a parent never moves its descendants',()=>{
 const tasks=[make('p',{status:'review'}),make('c',{parentId:'p'})];
 assert.deepEqual(projectColumn(tasks,'ready').rows.map(r=>r.task.id),['c']);assert.deepEqual(projectColumn(tasks,'review').rows.map(r=>r.task.id),['p']);
});
test('reparent, change parent and detach retain content and identity',()=>{
 const task=make('c',{description:'Keep me',checklists:[{id:'checks'}],sourceRunId:'run-1'}),parents=[make('p'),make('q')];
 const linked=reparentTask(task,'p',parents),changed=reparentTask(linked,'q',parents),detached=reparentTask(changed,null,parents);
 assert.deepEqual(detached,{...task,parentId:null});assert.equal(task.parentId,undefined);
});
test('self, ancestor cycles, missing parents and foreign projects are rejected',()=>{
 const p=make('p'),c=make('c',{parentId:'p'}),foreign=make('foreign',{projectId:'other'});
 for(const parent of ['p','c'])assert.throws(()=>reparentTask(p,parent,[p,c]),{code:'TASK_CYCLE'});
 for(const parent of ['missing','foreign'])assert.throws(()=>reparentTask(c,parent,[p,c,foreign]),{code:'TASK_PARENT'});
});
test('child avatars count unique owners, not tasks',()=>{
 const tasks=[make('p'),...['Мария','Анна','Иван','Дмитрий','Мария'].map((owner,i)=>make('c'+i,{parentId:'p',owner}))];
 assert.equal(childOwners('p',buildTaskIndex(tasks)).length,4);
});
test('deep hierarchies are projected iteratively without duplicate rows',()=>{
 const tasks=Array.from({length:5000},(_,i)=>make('task-'+i,{parentId:i?'task-'+(i-1):null}));
 const p=projectColumn(tasks,'ready');assert.equal(p.rows.length,5000);assert.equal(p.rows.at(-1).depth,4999);
});
test('invalid types, priorities and impossible dates fail before persistence',async()=>{
 const repo=new MemoryRepository();
 for(const fields of [{type:'research'},{priority:'constructor'},{due:'2026-02-30'},{due:'oops'}])await assert.rejects(repo.write('tasks',make('bad',fields),0));
 assert.equal((await repo.list('tasks','board-tests')).length,0);
});
test('status entry time is server-owned and stable during non-status edits',async()=>{
 const repo=new MemoryRepository();let task=await repo.write('tasks',make('t',{statusEnteredAt:'1900-01-01'}),0);
 assert.notEqual(task.statusEnteredAt,'1900-01-01');const entered=task.statusEnteredAt;
 task=await repo.write('tasks',{...task,title:'Updated',statusEnteredAt:'1900-01-01'},task.revision);assert.equal(task.statusEnteredAt,entered);
});
test('concurrent reciprocal parents cannot commit a cycle to disk',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'board-parents-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const repo=await new FileRepository(dir).init();const a=await repo.write('tasks',make('a'),0),b=await repo.write('tasks',make('b'),0);
 const result=await Promise.allSettled([repo.write('tasks',{...a,parentId:'b'},a.revision),repo.write('tasks',{...b,parentId:'a'},b.revision)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'TASK_CYCLE');
 const reopened=await new FileRepository(dir).init();assert.equal((await reopened.read('tasks','b','board-tests')).parentId,undefined);
});
test('MemoryRepository rejects cross-project parent writes without changing the task',async()=>{
 const repo=new MemoryRepository();const a=await repo.write('tasks',make('a'),0);await repo.write('tasks',make('b',{projectId:'other'}),0);
 await assert.rejects(repo.write('tasks',{...a,parentId:'b'},a.revision),{code:'TASK_PARENT'});
 assert.equal((await repo.read('tasks','a','board-tests')).revision,a.revision);
});
