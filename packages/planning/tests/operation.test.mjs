import {test} from 'node:test';import assert from 'node:assert/strict';
import {PlanningOperation} from '../src/operation.js';
const preview=(token='one')=>({token,expiresAt:new Date(Date.now()+60000).toISOString(),summary:'Изменение',changes:[],blockers:[]});
const committed={state:'committed',operationId:'request-one'};
const adapter=()=>({preview:async()=>preview(),commit:async()=>committed,receipt:async()=>committed});
test('no write before confirmation; duplicate submit has one effect',async()=>{
  let calls=0,done;const port={...adapter(),commit:()=>{calls++;return new Promise(r=>{done=r;});}};
  const op=new PlanningOperation(port,'p1',()=>{},()=> 'same');await op.inspect({kind:'start',groupId:'r'});assert.equal(calls,0);const first=op.submit();await op.submit();assert.equal(calls,1);assert.equal(op.canClose(),false);done(committed);await first;assert.equal(op.state,'committed');assert.equal(op.canClose(),true);
});
test('lost response becomes uncertain; recovery reads receipt without retrying effect',async()=>{
  let calls=0;const op=new PlanningOperation({...adapter(),commit:async()=>{calls++;throw Error('timeout');}},'p1');await op.inspect({kind:'prepare',taskIds:['a']});await op.submit();assert.equal(op.state,'uncertain');assert.equal(op.canClose(),false);await op.submit();assert.equal(calls,1);await op.recover();assert.equal(op.state,'committed');assert.equal(calls,1);
});
test('pending/not-found receipt does not silently mark success or allow replay',async()=>{
  const op=new PlanningOperation({...adapter(),commit:async()=>{throw Error('timeout');},receipt:async()=>({state:'pending'})},'p1');await op.inspect({kind:'start',groupId:'r'});await op.submit();await op.recover();assert.equal(op.state,'uncertain');assert.equal(op.canClose(),false);
});
test('explicit rejection allows a new inspection but never claims success',async()=>{
  const op=new PlanningOperation({...adapter(),commit:async()=>{throw Object.assign(Error('stale'),{definitive:true});}},'p1');await op.inspect({kind:'start',groupId:'r'});await op.submit();assert.equal(op.state,'failed');assert.equal(op.result,null);await op.inspect({kind:'start',groupId:'r'});assert.equal(op.state,'ready');
});
test('expired previews and blockers cannot commit',async()=>{
  let calls=0;const op=new PlanningOperation({...adapter(),preview:async()=>({...preview(),expiresAt:'2020-01-01'}),commit:async()=>{calls++;return committed;}},'p1');await op.inspect({kind:'start',groupId:'r'});await op.submit();assert.equal(op.state,'stale');assert.equal(calls,0);
  op.adapter.preview=async()=>({...preview(),blockers:['draft']});await op.inspect({kind:'start',groupId:'r'});await op.submit();assert.equal(op.state,'ready');assert.equal(calls,0);
});
test('last inspection wins and cancelled preview never commits',async()=>{
  let done;const op=new PlanningOperation({...adapter(),preview:({intent})=>intent.groupId==='a'?new Promise(r=>{done=r;}):Promise.resolve(preview('b'))},'p1');const a=op.inspect({kind:'start',groupId:'a'});await op.inspect({kind:'start',groupId:'b'});done(preview('a'));await a;assert.equal(op.preview.token,'b');op.destroy();await op.submit();assert.equal(op.state,'ready');
});
test('malformed and unbounded previews do not reach confirmation',async()=>{
  for(const bad of [{token:''},{summary:undefined},{changes:[{label:'x'}]},{blockers:[{}]},{moreChanges:-1},{changes:Array(201).fill({label:'x',description:'y'})}]){
    const op=new PlanningOperation({...adapter(),preview:async()=>({...preview(),...bad})},'p1');
    await op.inspect({kind:'start',groupId:'r'});assert.equal(op.state,'failed');assert.equal(op.preview,null);
  }
});
test('preview is a defensive copy; malformed committed receipt stays uncertain',async()=>{
  const original=preview();let usedToken;
  const op=new PlanningOperation({...adapter(),preview:async()=>original,commit:async({token})=>{usedToken=token;return {state:'committed'};}},'p1');
  await op.inspect({kind:'start',groupId:'r'});original.token='changed';original.blockers.push('late');
  await op.submit();assert.equal(usedToken,'one');assert.equal(op.state,'uncertain');assert.equal(op.result,null);
  await op.recover();assert.equal(op.state,'committed');
});
