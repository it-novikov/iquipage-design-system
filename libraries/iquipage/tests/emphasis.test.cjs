const {test}=require('node:test');
const assert=require('node:assert/strict');
const {taskEmphasis,taskSignal}=require('../src/modules/task-kind.js');
for(const type of ['task','epic']) for(const priority of ['critical','high','normal','low']) for(const status of ['backlog','active','review','done']){
 test(`${type}/${priority}/${status}: emphasis only follows priority and type`,()=>{
  const expected=['critical','high'].includes(priority)?priority:type==='epic'?'epic':'none';
  assert.equal(taskEmphasis({type,priority,status}),expected);
 });
}
test('Missing or invalid input is neutral',()=>{
 for(const value of [null,undefined,{}, {type:'something',priority:'urgent'}, {type:'__proto__',priority:'toString'}]) assert.equal(taskEmphasis(value),'none');
});
test('Textual critical and epic meaning is retained without dependence on colour',()=>{
 const text=taskSignal({type:'epic',priority:'critical'});
 assert.ok(text.includes('Эпик'));assert.ok(text.includes('Критический'));
});
test('Normal and low tasks have no gratuitous signal label',()=>{
 for(const priority of ['normal','low']) assert.ok(!taskSignal({priority,type:'task'}).includes('task-urgency-label'));
});
