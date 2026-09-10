import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepository} from '../src/repository.js';
import {createTask} from '../src/tasks.js';
import {emptyTaskSettings} from '../src/board/task-templates.js';
import {newChecklist} from '../src/board/task-content.js';
import {newThread,postMessage,resolveThread,threadOrder} from '../src/board/thread-model.js';
import {referenceServer} from './server-fixture.mjs';
const task=()=>createTask({projectId:'b2-project',title:'Проверка B2'});
const tag=(id='tag-one',projectId='b2-project')=>({id,projectId,revision:0,name:'Android',tone:'blue',archivedAt:null});
const release=(id='release-one')=>({id,projectId:'b2-project',revision:0,name:'2.4',status:'planned',targetDate:null,archivedAt:null});
test('B2 catalogs reject duplicate normalized names and arbitrary color values',async()=>{
  const repo=new MemoryRepository();await repo.write('tags',tag(),0);
  await assert.rejects(repo.write('tags',{...tag('tag-two'),name:' android '},0),{code:'CATALOG_DUPLICATE'});
  await assert.rejects(repo.write('tags',{...tag('tag-two'),name:'Other',tone:'url(evil)'},0),{code:'TAG_TONE'});
});
test('B2 tag and release references are checked inside the task write',async()=>{
  const repo=new MemoryRepository(),t=task();
  await assert.rejects(repo.write('tasks',{...t,tagIds:['missing']},0),{code:'TASK_REFERENCE'});
  await repo.write('tags',tag('foreign','other-project'),0);
  await assert.rejects(repo.write('tasks',{...t,tagIds:['foreign']},0),{code:'TASK_REFERENCE'});
  await repo.write('tags',tag(),0);await repo.write('releases',release(),0);
  const saved=await repo.write('tasks',{...t,tagIds:['tag-one'],releaseId:'release-one'},0);
  assert.equal(saved.releaseId,'release-one');assert.deepEqual(saved.tagIds,['tag-one']);
});
test('B2 archival preserves assigned values but prevents a new assignment',async()=>{
  const repo=new MemoryRepository();const tg=await repo.write('tags',tag(),0);
  const saved=await repo.write('tasks',{...task(),tagIds:[tg.id]},0);
  await repo.write('tags',{...tg,archivedAt:new Date().toISOString()},tg.revision);
  await repo.write('tasks',{...saved,title:'Изменено'},saved.revision);
  await assert.rejects(repo.write('tasks',{...task(),tagIds:[tg.id]},0),{code:'TASK_REFERENCE_ARCHIVED'});
});
test('B2 templates apply once with independent checklist IDs',async()=>{
  const repo=new MemoryRepository(),s=emptyTaskSettings('b2-project');
  s.base.description='Базовое описание';s.base.checklists=[newChecklist('Приёмка',['Проверить'])];
  s.types.bug={descriptionMode:'append',description:'Шаги воспроизведения'};
  await repo.write('taskSettings',s,0);
  const a=await repo.write('tasks',{...task(),type:'bug'},0),b=await repo.write('tasks',task(),0);
  assert.equal(a.description,'Базовое описание\n\nШаги воспроизведения');assert.notEqual(a.checklists[0].id,b.checklists[0].id);
  const next=await repo.write('tasks',{...a,type:'task',description:''},a.revision);assert.equal(next.description,'');
});
test('B2 task editing and thread replies have independent revisions',async()=>{
  const repo=new MemoryRepository({actorId:'member'}),t=await repo.write('tasks',task(),0);
  const thread=await postMessage(repo,t,{body:'Нужна проверка',requiresResolution:true,threadId:'thread-one',messageId:'start'});
  await Promise.all([repo.write('tasks',{...t,description:'Новый текст'},t.revision),postMessage(repo,t,{threadId:thread.id,messageId:'reply',body:'Проверено'})]);
  assert.equal((await repo.read('tasks',t.id,t.projectId)).description,'Новый текст');
  const updated=await repo.read('threads',thread.id,t.projectId);assert.equal(updated.messages.length,2);assert.equal(updated.messages[1].authorId,'member');
  const resolved=await resolveThread(repo,updated,true);assert.equal(resolved.resolution.actorId,'member');
  const reopened=await resolveThread(repo,resolved,false);assert.equal(reopened.resolution,null);
});
test('B2 replies cannot move a thread, replace messages or resolve a plain comment',async()=>{
  const repo=new MemoryRepository(),t=await repo.write('tasks',task(),0),other=await repo.write('tasks',task(),0);
  const thread=await postMessage(repo,t,{threadId:'thread-one',messageId:'start',body:'Текст'});
  await assert.rejects(postMessage(repo,other,{threadId:thread.id,messageId:'reply',body:'Чужая задача'}),{code:'THREAD_TASK_MISMATCH'});
  await assert.rejects(repo.write('threads',{...thread,messages:[{...thread.messages[0],body:'Подмена'}]},thread.revision),{code:'THREAD_MESSAGE_IMMUTABLE'});
  await assert.rejects(resolveThread(repo,thread,true),{code:'THREAD_RESOLUTION'});
});
test('B2 unresolved discussions sort first independent of recency',()=>{
  const old={id:'a',requiresResolution:true,resolved:false,createdAt:'2026-01-01'},recent={id:'b',requiresResolution:false,resolved:false,createdAt:'2026-09-01'};
  assert.deepEqual([recent,old].sort(threadOrder).map(item=>item.id),['a','b']);
});
test('B2 dependencies reject cycles and symmetric links reject reverse duplicates',async()=>{
  const repo=new MemoryRepository(),a=await repo.write('tasks',task(),0),b=await repo.write('tasks',task(),0);
  const edge={id:'edge-one',projectId:a.projectId,revision:0,kind:'depends',fromId:a.id,toId:b.id};
  await repo.write('taskLinks',edge,0);
  await assert.rejects(repo.write('taskLinks',{...edge,id:'edge-two',fromId:b.id,toId:a.id},0),{code:'TASK_DEPENDENCY_CYCLE'});
  await repo.write('taskLinks',{...edge,id:'related-one',kind:'related'},0);
  await assert.rejects(repo.write('taskLinks',{...edge,id:'related-two',kind:'related',fromId:b.id,toId:a.id},0),{code:'TASK_LINK_DUPLICATE'});
});
test('B2 HTTP catalog, task defaults and discussion are persisted through the actual API',async t=>{
  const api=await referenceServer(t);await api.put('tags',tag());await api.put('releases',release());
  const item=await api.put('tasks',{...task(),tagIds:['tag-one'],releaseId:'release-one',checklists:[newChecklist('Проверки',['Пункт'])]});
  const thread=await api.put('threads',newThread(item,{body:'Проверить результат',requiresResolution:true}));
  assert.equal((await api.get(`/records/tasks/${item.id}?projectId=${item.projectId}`)).checklists.length,1);
  assert.equal((await api.get(`/records/threads/${thread.id}?projectId=${item.projectId}`)).messages.length,1);
});
test('B2 malformed catalog references and discussion messages have domain errors',async()=>{
  const repo=new MemoryRepository(),item=await repo.write('tasks',task(),0);
  await assert.rejects(repo.write('tasks',{...item,releaseId:false},item.revision),{code:'TASK_RELEASE'});
  await assert.rejects(repo.write('tasks',{...item,tagIds:false},item.revision),{code:'TASK_TAGS'});
  await assert.rejects(repo.write('threads',{id:'invalid-thread',projectId:item.projectId,revision:0,taskId:item.id,requiresResolution:false,resolved:false,messages:[null]},0),{code:'THREAD_MESSAGE'});
});
