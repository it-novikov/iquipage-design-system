import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMaterialDrafts,materialValues,saveMaterialDrafts} from '../ui/src/board/task-materials-model.js';
import {createTaskOnce} from '../ui/src/board/task-create.js';
globalThis.HTMLElement ||= class {};
const {materialsMarkup,mountTaskMaterials}=await import('../ui/src/board/task-materials.js');
const fields=(changes={})=>({category:'design',title:'Макет оплаты',url:'https://example.test/design?v=1#screen',...changes});
const context={taskId:'t',projectId:'p'};
const failure=(code,message=code)=>Object.assign(Error(message),{code});
function server(){
 const rows=new Map(),tasks=new Map(),receipts=new Map(),calls=[];let lose=false,refuse=false;
 const repository={
  async write(_collection,value,base){const old=tasks.get(value.id);if((old?.revision||0)!==base)throw failure('CONFLICT');const result={...value,revision:base+1};tasks.set(value.id,result);return result;},
  async read(_collection,id){return tasks.get(id);},
  async listTaskMaterials(){return [...rows.values()].filter(x=>!x.archivedAt);},
  async readTaskMaterial(_task,id){return rows.get(id)||null;},
  async putTaskMaterial(taskId,value,baseRevision,{projectId}){
   calls.push({taskId,value:{...value},baseRevision});const key=JSON.stringify([value,baseRevision]);if(receipts.has(key))return {...receipts.get(key)};
   if(refuse){refuse=false;throw failure('FORBIDDEN','Право на запись отозвано.');}
   const old=rows.get(value.id);if((old?.revision||0)!==baseRevision)throw failure('CONFLICT');
   const row={...value,taskId,projectId,revision:baseRevision+1,archivedAt:value.archived?'2026-10-11T01:00:00Z':null};rows.set(row.id,row);receipts.set(key,row);
   if(lose){lose=false;throw Error('Ответ потерян');}return {...row};
  }
 };
 return {repository,rows,tasks,calls,loseNext(){lose=true;},refuseNext(){refuse=true;}};
}
test('HTTP URLs preserve exact Unicode/query/fragment; unsafe or oversized values are refused',()=>{
 const url='https://EXAMPLE.test/макет?q=%2f#A';assert.equal(materialValues(fields({url:' '+url+' '})).url,url);
 const idn='https://пример.рф/макет?q=1#экран';assert.equal(materialValues(fields({url:idn})).url,idn);
 for(const url of ['javascript:alert(1)','data:text/html,hi','//example.test','https:example.test','https://u:p@example.test','https://@example.test/a','https://example.test/a b','https://example.test/\\bad'])assert.throws(()=>materialValues(fields({url})),/ссылку/);
 for(const url of ['https:///example.com/a','https://example.test/\u0080','https://example.test/a[b]','https://example.test/<x>','https://example.test/\"x','https://example.test/{x}','https://example.test/a|b','https://example.test/a^b','https://example.test/a`b','https://example.test/%zz','https://exa%6dple.test/a','https://bad_host.test','https://-bad.test','https://bad-.test','https://a..test','https://example.test../a','https://'+ 'a'.repeat(64)+'.test'])assert.throws(()=>materialValues(fields({url})),/ссылку/);
 for(const url of ['https://[::1]/a','https://example.test/a?filter[]=x#part','https://example.test/a%5Bb%5D','https://example.test:8443/a','https://example.com./a'])assert.equal(materialValues(fields({url})).url,url);
 assert.throws(()=>materialValues(fields({url:'https://example.test/'+ 'я'.repeat(1100)})),/ссылку/);
 assert.throws(()=>materialValues(fields({title:' '})),/название/);assert.throws(()=>materialValues(fields({category:'wiki'})),/раздел/);
});
test('duplicates are exact per category; archiving frees one of 100 active places',()=>{
 const drafts=createMaterialDrafts();drafts.add(fields());assert.throws(()=>drafts.add(fields()),/уже добавлена/);drafts.add(fields({category:'documentation'}));
 for(let i=2;i<100;i++)drafts.add(fields({url:`https://example.test/${i}`}));assert.throws(()=>drafts.add(fields({url:'https://example.test/last'})),/100/);
 drafts.adopt({...drafts.items()[0],revision:2,archivedAt:'now'});drafts.add(fields({url:'https://example.test/last'}));assert.equal(drafts.items().length,100);
});
test('partial creation failure retries only unsaved materials, preserving task identity and saved values',async()=>{
 const s=server(),drafts=createMaterialDrafts(),bad=drafts.add(fields()),good=drafts.add(fields({category:'documentation'}));
 const task=await createTaskOnce(s.repository,{id:'t',title:'Task'},{projectId:'p',edit:x=>x});s.refuseNext();
 assert.equal(await saveMaterialDrafts(s.repository,drafts,context),1);assert.equal(bad.state,'failed');assert.equal(good.state,'saved');assert.match(bad.error,/отозвано/);
 assert.equal(await saveMaterialDrafts(s.repository,drafts,context),0);assert.equal(s.calls.filter(x=>x.value.id===good.id).length,1);assert.equal(s.tasks.size,1);assert.equal(task.revision,1);assert.equal((await s.repository.listTaskMaterials()).length,2);
});
test('lost response repeats the same material id and payload without creating a duplicate',async()=>{
 const s=server(),drafts=createMaterialDrafts(),row=drafts.add(fields());s.loseNext();assert.equal(await saveMaterialDrafts(s.repository,drafts,context),1);
 assert.equal(await saveMaterialDrafts(s.repository,drafts,context),0);assert.equal(s.rows.size,1);assert.deepEqual(s.calls[0],s.calls[1]);assert.equal(row.revision,1);
});
test('CAS accepts identical active data, but changed or archived data requires explicit review',async()=>{
 for(const mode of ['identical','changed','archived']){
  const s=server(),drafts=createMaterialDrafts(),row=drafts.add(fields());s.rows.set(row.id,{...row,title:mode==='changed'?'Чужая правка':row.title,revision:3,archivedAt:mode==='archived'?'now':null});
  assert.equal(await saveMaterialDrafts(s.repository,drafts,context),mode==='identical'?0:1);
  if(mode!=='identical'){assert.equal(row.title,'Макет оплаты');assert.equal(row.conflict.revision,3);assert.equal(s.rows.get(row.id).revision,3);}
 }
});
test('realtime updates saved rows while preserving unsaved drafts',()=>{
 const drafts=createMaterialDrafts(),unsaved=drafts.add(fields());drafts.adopt({id:'saved',...fields({category:'documentation'}),revision:1});
 drafts.sync([{id:'saved',...fields({category:'documentation',title:'Updated'}),revision:2}]);assert.equal(drafts.items()[0],unsaved);assert.equal(drafts.items()[1].title,'Updated');drafts.sync([]);assert.deepEqual(drafts.items(),[unsaved]);
});
test('abort between material commands stops further writes without discarding the next draft',async()=>{
 const s=server(),drafts=createMaterialDrafts();drafts.add(fields());drafts.add(fields({category:'documentation'}));const abort=new AbortController();
 await assert.rejects(saveMaterialDrafts(s.repository,drafts,{...context,signal:abort.signal,onChange:()=>{if(drafts.items()[0].state==='saved')abort.abort();}}),{name:'AbortError'});assert.equal(s.calls.length,1);assert.equal(drafts.unsaved().length,1);
});
test('compact markup exposes three links, safely escapes names, and removes editing for readers',()=>{
 const rows=Array.from({length:4},(_,i)=>({id:`m${i}`,...fields({title:i===0?'<script>bad</script>':`Макет ${i}`})}));const html=materialsMarkup(rows);
 assert.equal((html.split('<details')[0].match(/data-material-link=/g)||[]).length,3);assert.match(html,/Ещё материалов: 1/);assert.match(html,/&lt;script&gt;bad/);assert.doesNotMatch(html,/<script>/);assert.match(html,/rel="noopener noreferrer"/);
 assert.equal(materialsMarkup([],{readOnly:true}),'');assert.match(materialsMarkup([]),/Добавить макет/);assert.match(materialsMarkup([]),/Добавить документ/);assert.doesNotMatch(materialsMarkup(rows,{readOnly:true}),/<button|<iq-menu/);assert.match(materialsMarkup(rows,{locked:true}),/disabled/);
});
function mountFixture(repository,options={}){
 const previous={CSS:globalThis.CSS,document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 globalThis.CSS={escape:value=>value};globalThis.document={activeElement:null};globalThis.window={addEventListener:()=>{},matchMedia:()=>({matches:true})};globalThis.matchMedia=globalThis.window.matchMedia;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const handlers=new Map();let writes=0;const root={hidden:false,contains:()=>false,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(name,fn)=>handlers.set(name,fn),replaceChildren(){this.innerHTML='';},set innerHTML(value){this.markup=value;writes++;},get innerHTML(){return this.markup;}};
 const controller=mountTaskMaterials(root,{repository,...context,...options});return {root,controller,handlers,writes:()=>writes,restore:()=>Object.assign(globalThis,previous)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('initial loading failure has retry; later errors retain loaded material rows',async()=>{
 let step=0;const fixture=mountFixture({listTaskMaterials:async()=>{if(step++!==1)throw Error('Offline');return [{id:'m',...fields()}];}});
 try{await settle();assert.doesNotMatch(fixture.root.innerHTML,/aria-busy="true"/);assert.match(fixture.root.innerHTML,/Offline/);const button={hasAttribute:name=>name==='data-material-reload'};
  fixture.handlers.get('click')({target:{closest:()=>button}});await settle();assert.match(fixture.root.innerHTML,/Макет оплаты/);fixture.handlers.get('click')({target:{closest:()=>button}});await settle();assert.match(fixture.root.innerHTML,/Макет оплаты/);assert.match(fixture.root.innerHTML,/Offline/);
 }finally{fixture.controller.destroy();fixture.restore();}
});
test('realtime ignores unrelated tasks; close aborts reads, unsubscribes and prevents late paint',async()=>{
 let notify,resolve,signal,reads=0,unsubscribed=false;const fixture=mountFixture({subscribe:fn=>{notify=fn;return ()=>{unsubscribed=true;};},listTaskMaterials:(_task,_project,options)=>{reads++;signal=options.signal;return new Promise(done=>{resolve=done;});}});
 try{notify({collection:'taskMaterials',projectId:'other',taskId:'t'});notify({collection:'taskMaterials',projectId:'p',taskId:'other'});assert.equal(reads,1);notify({collection:'taskMaterials',projectId:'p',resync:true});assert.equal(reads,2);
  fixture.controller.destroy();const count=fixture.writes();assert.equal(signal.aborted,true);assert.equal(unsubscribed,true);resolve([{id:'m',...fields()}]);await settle();assert.equal(fixture.writes(),count);
 }finally{fixture.restore();}
});
test('overlapping material refreshes keep the newest response',async()=>{
 const responses=[];let notify;const fixture=mountFixture({subscribe:fn=>{notify=fn;return ()=>{};},listTaskMaterials:()=>new Promise(resolve=>responses.push(resolve))});
 try{notify({collection:'taskMaterials',projectId:'p',taskId:'t'});responses[1]([{id:'new',...fields({title:'New'})}]);await settle();responses[0]([{id:'old',...fields({title:'Old'})}]);await settle();assert.match(fixture.root.innerHTML,/>New</);assert.doesNotMatch(fixture.root.innerHTML,/>Old</);}
 finally{fixture.controller.destroy();fixture.restore();}
});
test('archive and undo use each returned revision; repeated pending actions cannot send twice',async()=>{
 const s=server();s.rows.set('m',{id:'m',...fields(),revision:1,archivedAt:null});const fixture=mountFixture(s.repository);
 try{await settle();const event={target:{closest:()=>({dataset:{materialRow:'m'}})},detail:{action:'material-remove'}};fixture.handlers.get('iq-action')(event);fixture.handlers.get('iq-action')(event);await settle();assert.equal(s.calls.length,1);assert.equal(s.calls[0].baseRevision,1);assert.equal(s.rows.get('m').revision,2);assert.match(fixture.root.innerHTML,/Ссылка убрана/);assert.doesNotMatch(fixture.root.innerHTML,/data-material-link="m"/);
 const button={dataset:{},hasAttribute:name=>name==='data-material-restore'};fixture.handlers.get('click')({target:{closest:()=>button}});await settle();assert.equal(s.calls.length,2);assert.equal(s.calls[1].baseRevision,2);assert.equal(s.rows.get('m').archivedAt,null);assert.match(fixture.root.innerHTML,/data-material-link="m"/);
 }finally{fixture.controller.destroy();fixture.restore();}
});
test('readonly material surface cannot dispatch archival commands',async()=>{
 const s=server();s.rows.set('m',{id:'m',...fields(),revision:1});const fixture=mountFixture(s.repository,{readOnly:true});
 try{await settle();fixture.handlers.get('iq-action')({target:{closest:()=>({dataset:{materialRow:'m'}})},detail:{action:'material-remove'}});await settle();assert.equal(s.calls.length,0);assert.doesNotMatch(fixture.root.innerHTML,/<button|<iq-menu/);}
 finally{fixture.controller.destroy();fixture.restore();}
});
