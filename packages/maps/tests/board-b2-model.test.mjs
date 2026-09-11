import test from 'node:test';
import assert from 'node:assert/strict';
import {newChecklist,validateChecklists,updateChecklistItem,checklistProgress} from '../src/board/task-content.js';
import {emptyTaskSettings,compileTaskTemplate,instantiateTaskTemplate,validateTaskSettings,applyCreationTemplate} from '../src/board/task-templates.js';
import {newThread,prepareThread,postMessage,resolveThread,threadOrder} from '../src/board/thread-model.js';

const settings=()=>{const value=emptyTaskSettings('project');value.base.description='База';value.base.checklists=[newChecklist('Проверки',['Проверить'])];return value;};
test('B2 independent same-title checklists retain IDs and do not edit Markdown',()=>{
  const a=newChecklist('Проверки',['Первое']),b=newChecklist('Проверки',['Второе']);
  const next=updateChecklistItem([a,b],a.id,a.items[0].id,{done:true});
  assert.deepEqual(checklistProgress(next),{done:1,total:2});assert.equal(a.items[0].done,false);assert.deepEqual(next[1],b);
});
test('B2 invalid and duplicate checklist items fail before save',()=>{
  const value=newChecklist('Проверки',['Первое']);
  assert.throws(()=>validateChecklists([value,value]),{code:'CHECKLIST_ID'});
  assert.throws(()=>updateChecklistItem([value],value.id,value.items[0].id,{text:''}),{code:'CHECKLIST_TEXT'});
});
for(const [mode,expected] of [['inherit','База'],['append','База\n\nБаг'],['replace','Баг'],['exclude','']])test('B2 description '+mode,()=>{
  const value=settings();value.types.bug={description:'Баг',descriptionMode:mode};assert.equal(compileTaskTemplate(value,'bug').description,expected);
});
for(const [mode,total] of [['inherit',1],['append',2],['replace',1],['exclude',0]])test('B2 checklist '+mode,()=>{
  const value=settings();value.types.bug={checklists:[newChecklist('Вторая',['Пункт'])],checklistsMode:mode};assert.equal(compileTaskTemplate(value,'bug').checklists.length,total);
});
test('B2 every task gets new checklist identities and unchecked items',()=>{
  const value=settings();value.base.checklists[0].items[0].done=true;
  const a=instantiateTaskTemplate(value),b=instantiateTaskTemplate(value);assert.notEqual(a.checklists[0].id,b.checklists[0].id);assert.equal(a.checklists[0].items[0].done,false);
});
test('B2 scalar inheritance and explicit empty description remain predictable',()=>{
  const value=settings();value.base.priority='high';value.types.bug={priority:'critical'};
  assert.equal(compileTaskTemplate(value,'task').priority,'high');assert.equal(compileTaskTemplate(value,'bug').priority,'critical');
  assert.equal(applyCreationTemplate({description:'Авторский текст'},value).description,'Авторский текст');
  assert.equal(applyCreationTemplate({description:'',templateVersion:{revision:1}},value).description,'');
});
test('B2 unknown template rules and combined oversized descriptions are rejected',()=>{
  const value=settings();value.types.bug={descriptionMode:'other'};assert.throws(()=>validateTaskSettings(value),{code:'TASK_SETTINGS'});
  value.base.description='a'.repeat(6000);value.types.bug={descriptionMode:'append',description:'b'.repeat(6000)};assert.throws(()=>validateTaskSettings(value),{code:'TASK_SETTINGS'});
});
const task={id:'task-one',projectId:'project',revision:1};
function threadRepository(){
  const values=new Map();
  return {values,async read(collection,id,projectId){const value=values.get(id);return value?.projectId===projectId?structuredClone(value):null;},async write(collection,value,base){
    const prior=values.get(value.id);if((prior?.revision||0)!==base)throw Object.assign(Error('Conflict'),{code:'CONFLICT'});
    const next={...prepareThread(value,prior,[task],'member'),revision:base+1};values.set(next.id,next);return structuredClone(next);
  }};
}
test('B2 duplicate message retry after response loss is idempotent',async()=>{
  const repo=threadRepository(),command={threadId:'thread-one',messageId:'message-one',body:'Вопрос',requiresResolution:true};
  await postMessage(repo,task,command);await postMessage(repo,task,command);
  assert.equal(repo.values.get('thread-one').messages.length,1);assert.equal(repo.values.get('thread-one').revision,1);
  await assert.rejects(postMessage(repo,task,{...command,body:'Другой текст'}),{code:'THREAD_MESSAGE_CONFLICT'});
  await assert.rejects(postMessage(repo,task,{...command,requiresResolution:false}),{code:'THREAD_KIND_CONFLICT'});
  assert.equal(repo.values.get('thread-one').requiresResolution,true);
});
test('B2 concurrent replies preserve every message',async()=>{
  const repo=threadRepository();await postMessage(repo,task,{threadId:'thread-one',messageId:'start',body:'Начало'});
  await Promise.all(['a','b'].map(id=>postMessage(repo,task,{threadId:'thread-one',messageId:id,body:id})));
  assert.equal(repo.values.get('thread-one').messages.length,3);
});
