import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRows} from '../src/model.js';
const row={id:'r/t',taskId:'t',key:'T-1',title:'Task',type:'task',priority:'normal',preparation:'ready',statusLabel:'Ready',depth:0,childrenCount:0,contextOnly:false,selectable:true};
const page=r=>({projectId:'p',groupId:'r',revision:'v1',rows:[r],nextCursor:null});
test('Direct editor accepts canonical member ID separately from its display label',()=>{
  const projected={...row,ownerId:'agent-opaque-id',ownerLabel:'Мира',dueValue:null};
  assert.equal(validateRows(page(projected),'p','r','v1').rows[0].ownerId,'agent-opaque-id');
  assert.throws(()=>validateRows(page({...row,ownerId:{name:'Мира'}}),'p','r','v1'));
  assert.throws(()=>validateRows(page({...row,ownerId:'a'.repeat(241)}),'p','r','v1'));
});
test('Direct date field rejects impossible dates and does not require legacy projections to include editable values',()=>{
  assert.doesNotThrow(()=>validateRows(page(row),'p','r','v1'));
  assert.doesNotThrow(()=>validateRows(page({...row,dueValue:'2028-02-29'}),'p','r','v1'));
  assert.throws(()=>validateRows(page({...row,dueValue:'2027-02-29'}),'p','r','v1'));
  assert.throws(()=>validateRows(page({...row,dueValue:'Q2'}),'p','r','v1'));
});
