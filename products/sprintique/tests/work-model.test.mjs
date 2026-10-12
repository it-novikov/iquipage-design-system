import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workResultPreview,workText,sessionSentence,activeSession,uniqueEntries,workFocus,workOverview,createWorkAnswers,createWorkActionGate} from '../ui/src/board/work-model.js';
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

test('the overview names the agent and distinguishes answering from merely opening a question',()=>{
 const state={sessions:[{agentName:'Кодекс',state:'waiting'}],workPlan:{questions:[{id:'q',state:'open',title:'Кому передать?'}]},permissions:{canDecide:true,canAnswer:false}};
 assert.deepEqual(workOverview(state),{context:'Работа агента · Кодекс',status:'Агент ждёт ответа',text:'Кому передать?',action:'question:q',label:'Открыть вопрос',attention:false});
 state.permissions.canAnswer=true;assert.equal(workOverview(state).label,'Ответить агенту');assert.equal(workOverview(state).status,'Нужно ваше решение');assert.equal(workOverview(state).attention,true);
 state.workPlan.questions=[];assert.equal(workOverview(state).attention,false);assert.equal(workOverview(state).status,'Ждёт ответа');
});
test('the overview never implies that a completed step was accepted',()=>{
 const state={workPlan:{steps:[{id:'s',title:'Проверить форму',state:'done',approval:'pending'}]},permissions:{canDecide:true}};
 assert.equal(workOverview(state).label,'Проверить результат');assert.equal(workOverview(state).action,'review:s');
 state.workPlan.steps[0].approval='approved';assert.equal(workOverview(state).attention,false);
});
test('editing after a poll keeps the original revision and the draft until explicit review',()=>{
 const answers=createWorkAnswers();answers.edit('q',{selected:'a',answer:'Сохранить контекст'},10);
 answers.edit('q',{selected:'a',answer:'Сохранить весь контекст'},11);
 assert.equal(answers.get('q').revision,10);assert.equal(answers.dirty(),true);
 answers.review('q',{options:[{id:'a'}]},12);
 assert.deepEqual(answers.get('q'),{selected:'a',answer:'Сохранить весь контекст',revision:12});
 answers.delete('q');assert.equal(answers.dirty(),false);
});
test('review of changed options drops an obsolete selection, never the authored answer',()=>{
 const answers=createWorkAnswers();answers.edit('q',{selected:'old',answer:'Мой ответ'},3);
 answers.review('q',{options:[{id:'new'}]},4);
 assert.deepEqual(answers.get('q'),{selected:'',answer:'Мой ответ',revision:4});
 answers.edit('q',{selected:'__other',answer:'Другой ответ'},4);answers.review('q',{options:[]},5);
 assert.equal(answers.get('q').selected,'__other');
});
test('a slow action blocks duplicate entry points and a failure permits a deliberate retry',async()=>{
 const gate=createWorkActionGate();let finish,calls=0;
 const first=gate.run(()=>{calls++;return new Promise((_,reject)=>{finish=reject;});});
 const failed=assert.rejects(first,/conflict/);
 await gate.run(()=>{calls++;});assert.equal(calls,1);assert.equal(gate.pending(),true);
 finish(Error('conflict'));await failed;assert.equal(gate.pending(),false);
 await gate.run(()=>{calls++;});assert.equal(calls,2);
});
test('overview keeps useful context without a session or assignment permission',()=>{
 assert.deepEqual(workOverview({workPlan:null,permissions:{}}),{context:'Работа агента',status:'',text:'Поручите агенту работу по этой задаче.',action:'open',label:'Открыть работу',attention:false});
 assert.equal(workOverview({workPlan:{},sessions:[{agentName:'Клод',state:'failed'}]}).status,'Работа прервалась');
 assert.equal(workOverview({workPlan:null,permissions:{canAssign:true}}).action,'assign');
});

test('PF04: review overview shows the literal start of the selected result, never a summary',()=>{
 assert.deepEqual(workResultPreview(''),{label:'Результат шага',text:'Описание результата не добавлено',empty:true,truncated:false});
 assert.equal(workResultPreview('## Итог\n\n**Готово**: форма проверена').text,'Итог Готово: форма проверена');
 const long=workResultPreview('слово '.repeat(60));assert.equal(long.label,'Начало результата');assert.ok(long.truncated);assert.ok([...long.text].length<=161);assert.ok(long.text.endsWith('…'));
 assert.ok([...workResultPreview('я'.repeat(400)).text].length===161);
 const state={sessions:[{agentName:'Кодекс',state:'completed'}],workPlan:{steps:[{id:'s',state:'done',title:'Проверить форму',result:'Форма проверена на 3 браузерах.'}]},permissions:{}};
 const o=workOverview(state);assert.equal(o.text,'Проверить форму');assert.equal(o.result.text,'Форма проверена на 3 браузерах.');assert.equal(o.action,'review:s');
});
