import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const root='/workspace/scratch/b3dac59f68e2';
const dir=root+'/research/continuation/task-compact-source-review-temp';
const board=dir+'/products/sprintique/ui/src/board/';
const source=await readFile(board+'task-work-view.js','utf8');
const model=await import(pathToFileURL(board+'work-model.js'));
const originalModel=await import(pathToFileURL(root+'/repo-tabs/products/sprintique/ui/src/board/work-model.js'));
const helper=source.slice(source.indexOf('function resultPreview(value){'),source.indexOf('\n\n/** One durable story'));
assert(helper.startsWith('function resultPreview(value){'));
const resultPreview=Function('workText',helper+'\nreturn resultPreview;')(model.workText);
const escapeSource=await readFile(dir+'/escape-source.txt','utf8');
const esc=Function(escapeSource+'\nreturn escapeHTML;')();
const summaryCode=source.slice(source.indexOf('  if(summaryRoot){'),source.indexOf('  if(previousHistory&&p)'));
const project=Function('state','review','q','session','p','summaryRoot','workOverview','resultPreview','esc','ui',summaryCode);
const baseline=await readFile(root+'/repo-tabs/products/sprintique/ui/src/board/task-work-view.js','utf8');
const baseSummaryCode=baseline.slice(baseline.indexOf('  if(summaryRoot){'),baseline.indexOf('  if(previousHistory&&p)'));
const originalProject=Function('state','p','summaryRoot','workOverview','esc','ui',baseSummaryCode);
const btnCalls=[];
// Deliberately only an inert marker: this observation is not a DS button, DOM, or browser test.
const ui={btn:(...args)=>{btnCalls.push(args);return '<!-- existing-ui-btn -->';}};
function render(state){
 const focus=model.workFocus(state),review=focus.kind==='review'?focus.item:null,q=focus.kind==='question'?focus.item:null;
 const session=state?.sessions?.find(model.activeSession)||state?.sessions?.[0],out={};
 btnCalls.length=0;
 project(state,review,q,session,state?.workPlan,out,model.workOverview,resultPreview,esc,ui);
 return {focusKind:focus.kind,focusId:focus.item?.id||null,...out,buttonCalls:structuredClone(btnCalls)};
}
function originalRender(state){const out={};btnCalls.length=0;originalProject(state,state?.workPlan,out,originalModel.workOverview,esc,ui);return {...out,buttonCalls:structuredClone(btnCalls)};}

const samples=[
 ['empty',''],['whitespace',' \n\t '],['literal-html','<готово> & проверено'],
 ['exact-64','я'.repeat(64)],['over-65','я'.repeat(65)],
 ['word-boundary','Сохранены изменения, история и доступы. Проверено повторное открытие после обновления страницы.'],
 ['boundary-astral','😀'.repeat(15)+' '+ 'проверка '.repeat(10)],
 ['markdown','# Результат\n\n**Готово**: `пример`\n- Повторное открытие сохраняет состояние.\n- Дальнейшая проверка доступна.'],
 ['cjk','完了'.repeat(50)],['long-url','https://example.invalid/'+ 'a'.repeat(90)],
 ['combining-grapheme','e\u0301'.repeat(40)],['zwj-grapheme','👩‍👩‍👧‍👦'.repeat(11)],
 ['astral-64','😀'.repeat(64)],['astral-65','😀'.repeat(65)],
 ['literal-source-ellipsis','Результат завершён…'],
];
const excerpts=samples.map(([id,input])=>{
 const normalized=model.workText(input).trim(),out=resultPreview(input),n=Array.from(normalized).length;
 assert(Array.from(out.text).length<=64,id);
 assert(out.text.isWellFormed(),id);
 if(!normalized)assert.deepEqual(out,{label:'Описание результата не добавлено',text:''},id);
 else if(n<=64)assert.deepEqual(out,{label:'Результат шага',text:normalized},id);
 else {assert.equal(out.label,'Начало результата',id);assert(out.text.endsWith('…'),id);assert(normalized.startsWith(out.text.slice(0,-1)),id);}
 return {id,input,normalized,inputCodePoints:n,...out,outputCodePoints:Array.from(out.text).length};
});

const first={id:'S1',title:'Полный предмет первого шага <контекст> & условия',state:'done',approval:'pending',result:'<готово> & проверено',completedAt:'2026-01-01'};
const second={id:'S2',title:'Более поздний результат другого шага',state:'done',approval:'pending',result:'Другой текст, который не должен попасть в сводку',completedAt:'2026-10-12'};
const session={id:'A2',agentName:'Кодекс <имя> & контекст',state:'running'};
const states=[
 ['review-plan-order',{workPlan:{steps:[first,second],questions:[]},sessions:[session],permissions:{canDecide:false}}],
 ['review-empty',{workPlan:{steps:[{...first,result:'',evidence:['https://example.invalid/evidence']}]},sessions:[],permissions:{canDecide:false}}],
 ['question-before-review',{workPlan:{steps:[first,second],questions:[{id:'Q1',title:'Вопрос <текст> & условия',state:'open'}]},sessions:[session],permissions:{canAnswer:false}}],
 ['question-can-answer',{workPlan:{steps:[first],questions:[{id:'Q1',title:'Вопрос к вам',state:'open'}]},sessions:[session],permissions:{canAnswer:true}}],
 ['question-permission-absent',{workPlan:{steps:[first],questions:[{id:'Q1',title:'Вопрос к вам',state:'open'}]},sessions:[]}],
 ['rejected-step',{workPlan:{steps:[{...first,approval:'rejected'}]},sessions:[session],permissions:{}}],
 ['blocked-step',{workPlan:{steps:[{...first,state:'blocked'}]},sessions:[session],permissions:{}}],
 ['completed-session',{workPlan:{steps:[{...first,approval:'approved'}]},sessions:[{...session,state:'completed'}],permissions:{}}],
 ['plan-ready-no-session',{workPlan:{steps:[],questions:[]},sessions:[],permissions:{}}],
 ['no-plan',{workPlan:null,sessions:[],permissions:{canAssign:true}}],
];
const projections=states.map(([id,state])=>{
 const out=render(state),original=originalRender(state),overview=model.workOverview(state),focus=model.workFocus(state);
 assert.deepEqual(focus,originalModel.workFocus(state),id+' focus unchanged');
 assert.equal((out.innerHTML.match(/class="iq-work-story-head"/g)||[]).length,state.workPlan?1:0,id+' one head');
 if(out.innerHTML)assert(out.innerHTML.includes(esc(overview.text||overview.status)),id+' full subject');
 if(['review','question'].includes(out.focusKind)){
  assert(out.innerHTML.includes('<span data-work-summary-state>'+esc(overview.status)+'</span>'),id+' exact attention state');
  assert.deepEqual(out.buttonCalls,original.buttonCalls,id+' same existing button args');
 }
 if(out.focusKind==='review'){
  const p=resultPreview(focus.item.result);
  assert(out.innerHTML.includes(esc(p.label)),id+' excerpt label');
  if(p.text){assert(out.innerHTML.includes(esc(p.text)),id+' escaped excerpt');assert(out.innerHTML.indexOf('<!-- existing-ui-btn -->')<out.innerHTML.indexOf('data-work-summary-preview-text'),id+' CTA before excerpt');}
  assert(!out.innerHTML.includes(second.result),id+' no substitution from later review');
 } else assert(!out.innerHTML.includes('data-work-summary-preview-text'),id+' no review excerpt');
 if(!['review','question'].includes(out.focusKind))assert.deepEqual({hidden:out.hidden,innerHTML:out.innerHTML,buttonCalls:out.buttonCalls},original,id+' unrelated overview exactly baseline');
 assert(!out.innerHTML.includes('<готово>')&&!out.innerHTML.includes('<контекст>')&&!out.innerHTML.includes('<имя>'),id+' source values not HTML tags');
 return {id,overview,...out,unrelatedMarkupByteIdentical:['review','question'].includes(out.focusKind)?null:true};
});
assert.equal(projections.find(x=>x.id==='review-plan-order').focusId,'S1');
assert.equal(projections.find(x=>x.id==='question-before-review').focusId,'Q1');
assert.equal(projections.find(x=>x.id==='question-before-review').overview.status,'Вопрос ждёт ответа');
assert.equal(projections.find(x=>x.id==='question-permission-absent').overview.status,'Вопрос ждёт ответа');
assert.equal(projections.find(x=>x.id==='question-can-answer').overview.status,'Нужно ваше решение');
const output={kind:'exact-source pure observations; no DOM/browser/public button lifecycle',nodeVersion:process.version,excerptCases:excerpts,projectionCases:projections,assertions:'All passed; see saved script for scope'};
await writeFile(dir+'/source-observations.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({excerptCases:excerpts.length,projectionCases:projections.length,assertions:'PASS within the exact-source pure scope',runtime:'NOT_RUN'},null,2));
