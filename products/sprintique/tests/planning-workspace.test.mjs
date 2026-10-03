import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterPlan} from '../ui/planning/src/workspace-model.js';
const rows=[{id:'epic',key:'SPQ-1',title:'Платформа',parentId:null},{id:'sub',key:'SPQ-2',title:'Авторизация',parentId:'epic'},{id:'deep',key:'SPQ-3',title:'Вход по почте',parentId:'sub'},{id:'other',key:'SPQ-4',title:'Карта',parentId:null}];
const containers=[{id:'active',summary:{total:4},rows},{id:'backlog',summary:{total:0},rows:[]}];
test('finding a deep child keeps every ancestor, opens the path and preserves full summary',()=>{
 const found=filterPlan(containers,{query:' ПОЧТЕ '});
 assert.equal(found.matches,1);assert.deepEqual(found.containers[0].rows.map(r=>r.id),['epic','sub','deep']);
 assert.deepEqual([...found.ancestorIds],['sub','epic']);assert.equal(found.containers[0].summary.total,4);
 assert.equal(containers[0].rows.length,4);
});
test('key search is case insensitive; scope is respected; empty search restores original data',()=>{
 assert.equal(filterPlan(containers,{query:'spq-4'}).containers[0].rows[0].id,'other');
 assert.deepEqual(filterPlan(containers,{query:'spq-4',scope:'backlog'}).containers,[]);
 assert.equal(filterPlan(containers,{query:'  '}).containers,containers);
 assert.equal(filterPlan(containers,{scope:'active'}).containers.length,1);
});
test('missing and cyclic parents terminate without fabricating context',()=>{
 const c=[{id:'c',rows:[{id:'a',key:'A',title:'match',parentId:'b'},{id:'b',key:'B',title:'parent',parentId:'a'},{id:'x',key:'X',title:'match',parentId:'missing'}]}];
 const result=filterPlan(c,{query:'match'});assert.equal(result.matches,2);assert.equal(result.containers[0].rows.length,3);
});
