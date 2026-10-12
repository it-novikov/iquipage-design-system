import {test} from 'node:test';import assert from 'node:assert/strict';
const store=new Map();globalThis.sessionStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const {PlanningAdapter}=await import('../web/planning-adapter.js');
const net=()=>Object.assign(Error('offline'),{code:'NETWORK',status:0});
const make=script=>{const calls=[];const client={request:async(path,method,body,key)=>{calls.push({body:JSON.stringify(body),key});return script(calls.length);}};
  return {calls,adapter:new PlanningAdapter({client,context:{actorId:'u'},subscribe(){}},'p1')};};
const body={ids:['a'],containerId:'s1',afterId:null,withChildren:true,expectedRevision:'7'};
test('lost response replays the same key and body once and confirms',async()=>{
  const {calls,adapter}=make(n=>{if(n===1)throw net();return {moved:['a'],containers:[],warnings:[],undo:null};});
  const r=await adapter.move(body);assert.deepEqual(r.moved,['a']);assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.equal(calls[0].body,calls[1].body);
});
test('two lost responses are unknown, not rejected; manual retry keeps identity',async()=>{
  const {calls,adapter}=make(n=>{if(n<=2)throw net();return {moved:['a'],containers:[],warnings:[],undo:null};});
  await assert.rejects(adapter.move(body),e=>e.code==='MOVE_UNKNOWN');await adapter.move(body);assert.equal(new Set(calls.map(c=>c.key)).size,1);
});
test('definitive rejection is not replayed and next command gets a new identity',async()=>{
  const {calls,adapter}=make(n=>{if(n===1)throw Object.assign(Error('stale'),{code:'PROJECTION_STALE',status:409});return {moved:[],containers:[],warnings:[],undo:null};});
  await assert.rejects(adapter.move(body),e=>e.code==='PROJECTION_STALE');assert.equal(calls.length,1);await adapter.move(body);assert.notEqual(calls[0].key,calls[1].key);
});
test('undo has its own identity and surfaces UNDO_STALE',async()=>{
  const {calls,adapter}=make(n=>{if(n===1)return {moved:['a'],containers:[],warnings:[],undo:{kind:'restore',expectedRevision:'8',items:[{id:'a',containerId:'b0',inherit:true,rank:1}]}};throw Object.assign(Error('stale'),{code:'UNDO_STALE',status:409});});
  const r=await adapter.move(body);await assert.rejects(adapter.move({restore:r.undo}),e=>e.code==='UNDO_STALE');assert.notEqual(calls[0].key,calls[1].key);
});
