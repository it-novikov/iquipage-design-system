import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withoutUntouchedTemplate,normalizeTemplateText,instantiateTaskTemplate,starterTaskSettings,STARTER_TASK_TEMPLATES} from '../ui/src/board/task-templates.js';
import {taskMarkdown} from '../ui/src/board/task-content.js';

test('SPR-12: every starter template left untouched is saved as an empty description',()=>{
  for(const template of STARTER_TASK_TEMPLATES)assert.equal(withoutUntouchedTemplate(template.description,template.description),'',template.id);
});
test('SPR-12: every task type of the project settings, as the dialog inserts it, is recognised',()=>{
  const settings=starterTaskSettings('project-1');
  for(const type of ['task','bug','epic']){
    const inserted=taskMarkdown(instantiateTaskTemplate(settings,type));
    assert.ok(inserted.length>0,type);
    assert.equal(withoutUntouchedTemplate(inserted,inserted),'',type);
  }
  // A legacy template with checklists is compared in the Markdown form the editor showed.
  const legacy={id:'task-settings-p',projectId:'p',revision:3,base:{description:'## Проблема\n\nЧто не так?',checklists:[{id:'c1',title:'Проверка',items:[{id:'i1',text:'Тест',done:false}]}]},types:{task:{},bug:{},epic:{}}};
  const inserted=taskMarkdown(instantiateTaskTemplate(legacy,'bug'));
  assert.match(inserted,/- \[ \] Тест/);
  assert.equal(withoutUntouchedTemplate(inserted,inserted),'');
});
test('SPR-12: whitespace alone is not an edit',()=>{
  const bug=STARTER_TASK_TEMPLATES.find(t=>t.id==='bug').description;
  assert.equal(withoutUntouchedTemplate('\n\n  '+bug.replace(/\n/g,'\r\n').replace(/\n\n/g,'\n  \n\n')+'  \n',bug),'');
  assert.equal(normalizeTemplateText(' a\n\n\tb  '),'a b');
});
test('SPR-12: any edit keeps the whole description, and nothing inserted means nothing removed',()=>{
  const bug=STARTER_TASK_TEMPLATES.find(t=>t.id==='bug').description;
  const edited=bug.replace('Что работает неправильно?','Кнопка «Создать» не реагирует');
  assert.equal(withoutUntouchedTemplate(edited,bug),edited);
  assert.equal(withoutUntouchedTemplate(bug+'\n\nПодробности в логе.',bug),bug+'\n\nПодробности в логе.');
  assert.equal(withoutUntouchedTemplate(bug.replace('- [ ] Исправление проверено','- [x] Исправление проверено'),bug),bug.replace('- [ ] Исправление проверено','- [x] Исправление проверено'),'a ticked checkbox is an edit');
  assert.equal(withoutUntouchedTemplate(bug.slice(0,40),bug),bug.slice(0,40),'a shortened template is an edit');
  assert.equal(withoutUntouchedTemplate('Своё описание',null),'Своё описание');
  assert.equal(withoutUntouchedTemplate('Своё описание',''),'Своё описание');
  assert.equal(withoutUntouchedTemplate('',bug),'');
  // Another template than the one inserted is a deliberate choice, not the untouched insert.
  const epic=STARTER_TASK_TEMPLATES.find(t=>t.id==='epic').description;
  assert.equal(withoutUntouchedTemplate(epic,bug),epic);
});
test('SPR-12: the task dialog applies the rule to new tasks only and tracks every template it inserts',()=>{
  const source=readFileSync(new URL('../ui/src/board/task-dialog.js',import.meta.url),'utf8');
  assert.ok(source.includes('if(!task){const kept=withoutUntouchedTemplate(changes.description,lastTemplateContent);if(kept!==changes.description){changes.description=kept;delete changes.legacyChecklists;}}'));
  assert.ok(source.includes('lastTemplateContent=(task||initialValues.description===undefined)?taskMarkdown(initial):null;'),'the first template inserted');
  assert.ok(source.includes('lastTemplateContent=editor.value;\n      }'),'a project template applied from the menu or by a type change');
  assert.ok(source.includes('description.refresh();lastTemplateContent=editor.value;}'),'a starter template chosen from the menu');
});
