import test from 'node:test';
import assert from 'node:assert/strict';
import {readProjectContext} from '../src/navigation-model.js';
const context={id:'opaque-project',workspaceName:'Команда',projectName:'Продукт'};
test('Context projection rejects missing, boolean, malformed and unbounded confirmations',()=>{
  for(const value of [undefined,null,false,true,[],{}, {...context,id:''},{...context,projectName:' '.repeat(3)},{...context,workspaceName:'x'.repeat(241)}]) {
    assert.throws(()=>readProjectContext(value),/подтверждённый контекст/);
  }
});
test('Confirmed context keeps identity separate from names and copies only public labels',()=>{
  const input={...context,grant:'must-not-enter-navigation'},result=readProjectContext(input);
  assert.deepEqual(result,context);assert.notEqual(result,input);assert.ok(Object.isFrozen(result));
  input.projectName='Changed later';assert.equal(result.projectName,'Продукт');
  assert.throws(()=>{result.id='different';},TypeError);
});
