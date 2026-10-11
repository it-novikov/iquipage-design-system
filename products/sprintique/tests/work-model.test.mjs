import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workText,sessionSentence,activeSession,uniqueEntries,workFocus} from '../ui/src/board/work-model.js';
test('an external assignment never claims the agent has started',()=>{
 const run={agentName:'Кодекс',state:'awaiting_agent'};
 assert.equal(activeSession(run),true);
 assert.match(sessionSentence(run),/ещё не принял работу/);
 assert.doesNotMatch(sessionSentence(run),/работает над/);
});
test('cancellation and completion retain distinct effects and acceptance wording',()=>{
 assert.match(sessionSentence({agentName:'Агент',state:'cancelled'}),/сохранённые изменения остались/);
 assert.match(sessionSentence({agentName:'Агент',state:'completed'}),/можно проверить/);
 assert.match(sessionSentence({agentName:'Агент',state:'running',stopRequested:true}),/Запрошена остановка/);
});
test('stored report markup reads as connected prose without changing the source',()=>{
 const raw='# Проверка\n- Проверил форму.\n- Исправил ошибку.\n\nДальше проверю сохранение.';
 assert.equal(workText(raw),'Проверка Проверил форму. Исправил ошибку.\n\nДальше проверю сохранение.');
 assert.ok(raw.startsWith('#'));
});
test('replayed events do not duplicate saved history',()=>{
 assert.deepEqual(uniqueEntries([{id:'a',text:'Прочитал'}],[{id:'a',text:'Прочитал'},{id:'b',text:'Сохранил'}]).map(x=>x.id),['a','b']);
});

test('inline emphasis reads as prose while preserving its words',()=>{assert.equal(workText('**Проверено:** файл `app.js` сохранён.'),'Проверено: файл app.js сохранён.');});

test('workspace focuses a decision before a review and keeps both out of the overview narrative',()=>{
 const state={workPlan:{questions:[{id:'q',state:'open',title:'Кому передать?'}],steps:[{id:'s',state:'done',approval:'pending'}],checkpoint:{nextStep:'Передать работу'}}};
 assert.equal(workFocus(state).kind,'question');state.workPlan.questions[0].state='answered';assert.equal(workFocus(state).kind,'review');state.workPlan.steps[0].approval='approved';assert.equal(workFocus(state).kind,'next');
});

test('agent workspace links preserve the task identity and select only a supported tab',async()=>{const {parseTaskRoute,parseTaskSection}=await import('../ui/src/board/task-route.js');assert.equal(parseTaskRoute('#/task/WRK-1/work'),'WRK-1');assert.equal(parseTaskSection('#/task/WRK-1/work'),'work');assert.equal(parseTaskSection('#/task/WRK-1'),'task');assert.equal(parseTaskRoute('#/task/WRK-1/unknown'),null);});
