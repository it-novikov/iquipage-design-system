import test from 'node:test';
import assert from 'node:assert/strict';
import {appendCards,layoutCaptured,cardEntry,CARD_TYPES,SHAPES} from '../src/capture.js';
import {TASK_COLUMNS,createTask,placeTask,validateTask,taskOrder,taskColumn} from '../src/tasks.js';
import {createMap,clone} from '../src/model.js';
import {MemoryRepository} from '../src/repository.js';
import {BUILTIN_TEMPLATES} from '../src/templates.js';
import {previewDocument} from '../src/template-preview.js';
const empty=()=>createMap({projectId:'tests',title:'Проверка'}).document;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=';
const entry=(type,text='Содержание')=>({...cardEntry(type),text,...(type==='image'?{src:png}:{}),...(type==='task'?{owner:'Участник'}:{})});
test('batch creates all six document types atomically without mutating input',()=>{
  const before=empty(),snapshot=clone(before),result=appendCards(before,CARD_TYPES.map(([type])=>entry(type)));
  assert.deepEqual(before,snapshot);assert.equal(result.document.objects.length,6);
  assert.deepEqual(result.document.objects.map(o=>o.type),CARD_TYPES.map(([id])=>id));
  assert.equal(new Set(result.ids).size,6);assert.equal(result.document.revision,before.revision);
  assert.equal(result.document.objects.find(o=>o.type==='task').owner,'Участник');
});
test('batch supports all 14 shapes',()=>{
  const result=appendCards(empty(),SHAPES.map(([shape])=>({...entry('shape'),shape})));
  assert.deepEqual(result.document.objects.map(o=>o.shape),SHAPES.map(([id])=>id));
});
test('empty rows are omitted; image without a caption remains valid',()=>{
  const result=appendCards(empty(),[cardEntry(),entry('image','')]);assert.equal(result.ids.length,1);assert.equal(result.document.objects[0].type,'image');
});
test('empty, excessive and malformed batches fail before a mutation',()=>{
  for(const [items,code] of [[[cardEntry()],'EMPTY_BATCH'],[Array.from({length:101},()=>entry('text')),'BATCH_LIMIT'],[[{...entry('sticky'),text:'x'.repeat(10001)}],'TEXT_LIMIT'],[[{...entry('shape'),shape:'script'}],'CARD_SHAPE'],[[{...entry('image'),src:'https://example.invalid/x'}],'IMAGE']]){
    const doc=empty();assert.throws(()=>appendCards(doc,items),{code});assert.equal(doc.objects.length,0);
  }
});
test('batch cannot target a deleted or locked ancestor area',()=>{
  const doc=empty();assert.throws(()=>appendCards(doc,[entry('task')],{areaId:'missing'}),{code:'MISSING_AREA'});
  const parent=appendCards(doc,[entry('frame')]).document;parent.objects[0].locked=true;
  assert.throws(()=>appendCards(parent,[entry('text')],{areaId:parent.objects[0].id}),{code:'LOCKED_AREA'});
});
test('measured mixed-card layout does not overlap rows and grows its area',()=>{
  const doc=appendCards(empty(),[entry('frame')]).document,areaId=doc.objects[0].id;
  const first=appendCards(doc,[entry('text'),entry('task')],{areaId});first.document.objects[1].height=440;
  const out=layoutCaptured(first.document,first.ids,{areaId});const [area,a,b]=out.objects;
  assert.ok(b.y>=a.y+a.height+24);assert.ok(area.y+area.height>=b.y+b.height+24);
});
test('six task columns have exactly the requested order and names',()=>{
  assert.deepEqual(TASK_COLUMNS.map(c=>c.label),['Готово к работе','В работе','Ревью','Готово к тестированию','Тестирование','Готово к релизу']);
});
test('task status and rank validated at storage boundary',async()=>{
  const repository=new MemoryRepository(),task=createTask({projectId:'tests',title:'Проверить'});
  await assert.rejects(repository.write('tasks',{...task,status:'unknown'},0),{code:'TASK_STATUS'});
  assert.throws(()=>validateTask({...task,rank:Infinity}),{code:'TASK_RANK'});assert.equal((await repository.list('tasks','tests')).length,0);
});
test('task moves preserve content and provenance and support deterministic order',()=>{
  const a={...createTask({projectId:'tests',title:'A'}),id:'a',rank:1024,sourceMapId:'map-origin',sourceRunId:'run-origin'};
  const b={...createTask({projectId:'tests',title:'B',status:'review'}),id:'b',rank:2048};
  const moved=placeTask(a,[a,b],'review','b');assert.ok(moved.rank<b.rank);assert.equal(moved.sourceMapId,a.sourceMapId);assert.equal(moved.sourceRunId,a.sourceRunId);
  assert.deepEqual([b,moved].sort(taskOrder).map(t=>t.id),['a','b']);assert.equal(a.status,'ready');
});
test('legacy task statuses map for display but are not silently rewritten',()=>{
  for(const [status,expected] of [['planned','ready'],['active','in_progress'],['done','ready_for_release']]){
    const task={...createTask({projectId:'tests',title:'Старая задача'}),status};assert.equal(taskColumn(task),expected);assert.equal(validateTask(task).status,status);
  }
});
test('task compare-and-set rejects stale second edit',async()=>{
  const repo=new MemoryRepository(),task=await repo.write('tasks',createTask({projectId:'tests',title:'A'}),0);
  await repo.write('tasks',{...task,status:'review'},task.revision);
  await assert.rejects(repo.write('tasks',{...task,status:'testing'},task.revision),{code:'CONFLICT'});
});
test('all 16 template previews reflect distinct actual document geometry',()=>{
  const previews=BUILTIN_TEMPLATES.map(t=>previewDocument(t.document));assert.equal(new Set(previews).size,16);
  assert.ok(previews.every(s=>s.includes('<svg')));
});
test('template projection escapes markup and does not fetch embedded images',()=>{
  const doc=appendCards(empty(),[entry('text','<img src=x onerror=alert(1)>'),entry('image')]).document;
  const preview=previewDocument(doc);assert.ok(!preview.includes('<img'));assert.ok(!preview.includes('href='));assert.ok(!preview.includes('data:image'));
});
test('built-in layout updates are versioned and do not rewrite existing maps',()=>{
  const template=BUILTIN_TEMPLATES.find(t=>t.id==='ideas'),map=createMap({projectId:'tests',document:template.document});
  const before=clone(map);template.document.objects[0].text+='';assert.deepEqual(map,before);assert.equal(template.version,2);
});
test('a measured batch uses free space without covering existing objects',()=>{
  const initial=appendCards(empty(),[entry('frame')]).document;
  const before=clone(initial.objects),added=appendCards(initial,[entry('task'),entry('image')]);
  const result=layoutCaptured(added.document,added.ids);
  assert.deepEqual(result.objects.slice(0,before.length),before);
  for(const o of result.objects.filter(x=>added.ids.includes(x.id)))for(const old of before){
    assert.ok(o.x>=old.x+old.width||o.x+o.width<=old.x||o.y>=old.y+old.height||o.y+o.height<=old.y);
  }
});
