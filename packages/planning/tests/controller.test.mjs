import {test} from 'node:test';import assert from 'node:assert/strict';
import {PlanningController} from '../src/controller.js';
import {Selection,PROTOCOL,validateGroups,validateRows,mergeRows} from '../src/model.js';
const g=(id='r1')=>({id,title:'Релиз',state:'planned',total:10,matched:10});
const row=id=>({id,taskId:id,key:id,title:'Задача '+id,type:'task',priority:'normal',preparation:'ready',statusLabel:'Ревью',depth:0,childrenCount:0,contextOnly:false,selectable:true});
const groups=()=>({protocol:PROTOCOL,projectId:'p1',revision:'v1',items:[g()],nextCursor:null,capabilities:{move:true}});
const rows=(ids=['a','b'])=>({projectId:'p1',groupId:'r1',revision:'v1',rows:ids.map(row),nextCursor:null});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const port=()=>({listGroups:async()=>groups(),listRows:async()=>rows()});
test('projection rejects wrong project, protocol, counts and duplicate groups',()=>{
  for(const p of [{...groups(),projectId:'other'},{...groups(),protocol:'wrong'},{...groups(),items:[g(),g()]},{...groups(),items:[{...g(),matched:11}]}])assert.throws(()=>validateGroups(p,'p1'));
  assert.equal(validateGroups(groups(),'p1').revision,'v1');
});
test('projection rejects stale/wrong group, malformed rows and overlapping pages',()=>{
  for(const p of [{...rows(),revision:'v0'},{...rows(),groupId:'other'},{...rows(),rows:[row('a'),row('a')]},{...rows(),rows:[{...row('a'),depth:Infinity}]}])assert.throws(()=>validateRows(p,'p1','r1','v1'));
  assert.throws(()=>mergeRows([row('a')],[row('a')]));assert.equal(mergeRows([row('a')],[row('b')]).length,2);
});
test('selection never cascades parent to child; range and visible-only all',()=>{
  const selection=new Selection(),all=['parent','child','other'].map(row);
  selection.toggle('parent',all);assert.deepEqual([...selection.ids],['parent']);
  selection.toggle('other',all,true);assert.equal(selection.ids.size,3);
  selection.all([all[0]]);assert.deepEqual([...selection.ids],['child','other']);
  assert.deepEqual(selection.summary([all[2]]),{total:2,hidden:1});selection.clear();assert.equal(selection.ids.size,0);
});
test('context rows cannot be selected through the controller',async()=>{
  const c=new PlanningController({projectId:'p1',adapter:{...port(),listRows:async()=>({...rows(),rows:[{...row('parent'),contextOnly:true},row('child')]})}});await c.load();await c.rows('r1');c.toggle('parent');assert.equal(c.selection.ids.size,0);c.all();assert.deepEqual([...c.selection.ids],['child']);c.destroy();
});
test('late filter answer cannot overwrite newer query even if adapter ignores AbortSignal',async()=>{
  const old=deferred(),adapter={...port(),listGroups:o=>o.query==='old'?old.promise:Promise.resolve({...groups(),items:[g(o.query||'initial')]})};
  const c=new PlanningController({projectId:'p1',adapter});const first=c.filter({query:'old'});await c.filter({query:'new'});old.resolve({...groups(),items:[g('old')]});await first;assert.equal(c.groups[0].id,'new');c.destroy();
});
test('row answer from previous dataset never installs after refresh',async()=>{
  const late=deferred();const c=new PlanningController({projectId:'p1',adapter:{...port(),listRows:()=>late.promise}});await c.load();const task=c.rows('r1');await c.load();late.resolve(rows(['old']));await task;assert.equal(c.groups[0].rows.length,0);assert.equal(c.groups[0].busy,false);c.destroy();
});
test('page failures preserve prior rows and retry uses the same cursor',async()=>{
  const calls=[];let fail=true;
  const c=new PlanningController({projectId:'p1',adapter:{...port(),listRows:async o=>{calls.push(o.cursor);if(!o.cursor)return {...rows(['a']),nextCursor:'next'};if(fail)throw Error('offline');return rows(['b']);}}});
  await c.load();await c.rows('r1');await c.rows('r1',{append:true});assert.equal(c.groups[0].rows.length,1);assert.equal(c.groups[0].nextCursor,'next');fail=false;await c.rows('r1',{append:true});assert.deepEqual(calls,[null,'next','next']);assert.equal(c.groups[0].rows.length,2);c.destroy();
});
test('repeat cursor becomes an error rather than infinite requests',async()=>{
  const c=new PlanningController({projectId:'p1',adapter:{...port(),listRows:async()=>({...rows(),nextCursor:'next'})}});await c.load();await c.rows('r1');await c.rows('r1',{append:true});assert.match(c.groups[0].error,/страница/);c.destroy();
});
test('filter clears selection; collapse preserves canonical count and selection',async()=>{
  const c=new PlanningController({projectId:'p1',adapter:port()});await c.load();await c.rows('r1');c.toggle('a');c.fold('r1');assert.equal(c.groups[0].total,10);assert.equal(c.selection.ids.size,1);await c.filter({preparation:'draft'});assert.equal(c.selection.ids.size,0);assert.match(c.message,/снято/);c.destroy();
});
test('destroy aborts requests and produces no late callbacks',async()=>{
  const late=deferred();let changes=0,signal;const c=new PlanningController({projectId:'p1',onChange:()=>changes++,adapter:{...port(),listGroups:o=>{signal=o.signal;return late.promise;}}});
  const load=c.load();const before=changes;c.destroy();assert.equal(signal.aborted,true);late.resolve(groups());await load;assert.equal(changes,before);
});
test('rejected adapter never grants edit capability',async()=>{
  const c=new PlanningController({projectId:'p1',adapter:{...port(),listGroups:async()=>{throw Error('Нет доступа');}}});await c.load();assert.equal(c.capabilities.move,undefined);assert.equal(c.groups.length,0);assert.equal(c.error,'Нет доступа');c.destroy();
});
