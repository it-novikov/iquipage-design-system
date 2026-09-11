import test from 'node:test';
import assert from 'node:assert/strict';
import {taskMarkdown,markdownTaskChanges} from '../src/board/task-content.js';
import {packTags} from '../src/board/tag-packing.js';
import {allocateTaskKey,parseTaskRoute} from '../src/board/task-route.js';
import {prepareWorkspaceRecord,tagNameLength} from '../src/board/workspace-model.js';
import {starterTaskSettings,instantiateTaskTemplate,STARTER_TASK_TEMPLATES,upgradeLegacyTaskSettings,compileTaskTemplate} from '../src/board/task-templates.js';
test('v3 legacy checklists project into Markdown once and retain a recovery copy',()=>{
 const task={description:'## Контекст',checklists:[{id:'list',title:'Проверка',items:[{id:'one',text:'Готово [важно]',done:true},{id:'two',text:'Осталось',done:false}]}]};
 const markdown=taskMarkdown(task);assert.match(markdown,/- \[x\] Готово \\\[важно\\\]/);assert.match(markdown,/- \[ \] Осталось/);
 const saved={...task,...markdownTaskChanges(task,markdown)};assert.equal(taskMarkdown(saved),markdown);assert.deepEqual(saved.legacyChecklists,task.checklists);assert.equal(task.checklists.length,1);assert.equal(saved.checklists.length,0);
});
test('v3 tag packing respects one row, conditional second row and overflow reservation',()=>{
 assert.deepEqual(packTags([60,70,60],220,4,()=>28),{visible:3,rows:1});
 assert.deepEqual(packTags([160,60,60],220,4,()=>28),{visible:3,rows:2});
 assert.deepEqual(packTags([70,70,70,70],220,4,()=>28),{visible:2,rows:1});
 assert.deepEqual(packTags([190,190,190],220,4,()=>28),{visible:1,rows:2});
});
test('v3 human task numbers remain stable and advance past existing keys',()=>{
 const tasks=[{id:'one',projectId:'p',displayId:'SPR-241'},{id:'two',projectId:'p',displayId:'SPR-247'}];
 assert.equal(allocateTaskKey({id:'three',projectId:'p'},null,tasks).displayId,'SPR-248');
 assert.equal(allocateTaskKey({displayId:'SPR-1'},tasks[0],tasks).displayId,'SPR-241');
 assert.equal(parseTaskRoute('#/task/SPR-248'),'SPR-248');assert.equal(parseTaskRoute('#settings/tags'),null);
});
test('v3 tag limit counts graphemes and permits preserving legacy long names',()=>{
 const base={id:'tag',projectId:'p',tone:'blue',name:'я'.repeat(32)};
 assert.equal(tagNameLength('👨‍👩‍👦'),1);assert.doesNotThrow(()=>prepareWorkspaceRecord('tags',base,null));
 assert.throws(()=>prepareWorkspaceRecord('tags',{...base,name:'я'.repeat(33)},null),/32/);
 const legacy={...base,name:'я'.repeat(60)};assert.doesNotThrow(()=>prepareWorkspaceRecord('tags',{...legacy,tone:'green'},legacy));
});
test('v3 starter templates cover existing task kinds and do not share mutable settings',()=>{
 assert.equal(STARTER_TASK_TEMPLATES.length,5);const settings=starterTaskSettings('p');for(const type of ['task','bug','epic'])assert.match(instantiateTaskTemplate(settings,type).description,/- \[ \]/);
 settings.types.task.description='Мой шаблон';assert.notEqual(starterTaskSettings('p').types.task.description,'Мой шаблон');
});
test('v3 explicit template upgrade retains effective content for every legacy inheritance mode',()=>{
 const list=id=>({id,title:id,items:[{id:id+'-one',text:'Готовность '+id,done:false}]});
 const settings={id:'task-settings-p',projectId:'p',revision:3,base:{description:'База',checklists:[list('base')],priority:'high'},types:{task:{description:'Своё',descriptionMode:'append',checklists:[list('own')],checklistsMode:'append'},bug:{description:'Баг',descriptionMode:'replace',checklistsMode:'exclude'},epic:{descriptionMode:'exclude',checklistsMode:'inherit'}}};
 const before=structuredClone(settings),next=upgradeLegacyTaskSettings(settings);
 for(const type of ['task','bug','epic'])assert.equal(taskMarkdown(compileTaskTemplate(next,type)),taskMarkdown(compileTaskTemplate(settings,type)));
 assert.deepEqual(settings,before);assert.deepEqual(next.legacyTemplateSettings,{base:before.base,types:before.types});
});
