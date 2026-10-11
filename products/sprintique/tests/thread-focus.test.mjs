import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createThreadFocus} from '../ui/src/board/thread-focus.js';

function fixture(){
 let active=null;
 const control=(attributes={},tagName='BUTTON')=>({tagName,attributes,disabled:false,value:'',hasAttribute(name){return Object.hasOwn(this.attributes,name);},getAttribute(name){return this.attributes[name];},closest(){return this.question?{}:null;},matches(){return this.disabled;},focus(){active=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}});
 const frame=(children=[],heading=null)=>({...control({},'ARTICLE'),contains(node){return node===this||children.includes(node);},querySelectorAll(selector){return selector==='[data-question] input'?children.filter(c=>c.tagName==='INPUT'):children.filter(c=>c.hasAttribute(selector.slice(1,-1)));},querySelector(selector){return selector==='[data-question] h3'?heading:children.find(c=>c.tagName==='TEXTAREA');}});
 return {control,frame,focus:node=>{active=node;},active:()=>active,manager:createThreadFocus(()=>active)};
}

test('question buttons preserve their question ID, not the surrounding thread ID, through pending and retry',()=>{
 const f=fixture(),button=f.control({'data-answer-question':'question-7'}),node=f.frame([button]);
 f.focus(button);const captured=f.manager.capture('thread-2',node);
 assert.deepEqual(captured,{action:'data-answer-question',value:'question-7'});
 const busy=f.control({'data-answer-question':'question-7'});busy.disabled=true;
 const pending=f.frame([busy]);f.manager.restore('thread-2',pending,captured);assert.equal(f.active(),pending);
 const next=f.manager.capture('thread-2',pending),retry=f.control({'data-answer-question':'question-7'});
 f.manager.restore('thread-2',f.frame([retry]),next);assert.equal(f.active(),retry);
});
test('resolution and draft removal move keyboard focus to the saved question heading',()=>{
 for(const key of ['data-answer-question','data-review-question','data-discard-answer']){
  const f=fixture(),button=f.control({[key]:'question-7'}),node=f.frame([button]);f.focus(button);
  const captured=f.manager.capture('thread-2',node),heading=f.control({},'H3');
  f.manager.restore('thread-2',f.frame([],heading),captured);
  assert.equal(f.active(),heading,key);assert.equal(heading.tabIndex,-1);
 }
});
test('a decision textarea keeps its value, caret and focus when a revision refresh redraws the question',()=>{
 const f=fixture(),field=f.control({},'TEXTAREA');Object.assign(field,{question:true,value:'My draft',selectionStart:2,selectionEnd:5});
 f.focus(field);const state=f.manager.capture('thread',f.frame([field])),next=f.control({},'TEXTAREA');Object.assign(next,{question:true,value:'My draft'});
 f.manager.restore('thread',f.frame([next]),state);
 assert.equal(f.active(),next);assert.equal(next.value,'My draft');assert.equal(next.selectionStart,2);assert.equal(next.selectionEnd,5);
});
test('a later refresh does not return focus after the person leaves the thread',()=>{
 const f=fixture(),button=f.control({'data-answer-question':'q'}),node=f.frame([button]);f.focus(button);
 f.manager.capture('t',node);f.focus(f.control());assert.equal(f.manager.capture('t',node),null);
 f.focus(node);assert.equal(f.manager.capture('t',node),null);
});
test('clearing the submitted draft keeps focus on the saved heading through the following server refresh',()=>{
 const f=fixture(),heading=f.control({},'H3');heading.question=true;
 f.focus(heading);const state=f.manager.capture('t',f.frame([heading],heading)),next=f.control({},'H3');next.question=true;
 f.manager.restore('t',f.frame([next],next),state);
 assert.equal(f.active(),next);assert.equal(next.tabIndex,-1);
});
