const test=require('node:test'),assert=require('node:assert/strict');
// Minimal light-DOM harness: regions receive the actual supplied nodes, never copies.
global.document={activeElement:null};
global.HTMLElement=class {
 constructor(){this.attributes=new Map();this.nodes=[];this.regions=new Map();}
 contains(node){return this.nodes.includes(node);}
 getAttribute(name){return this.attributes.get(name)||null;}
 querySelectorAll(selector){return this.nodes.filter(n=>selector===`[slot=${n.slot}]`);}
 querySelector(selector){return this.regions.get(selector);}
 set innerHTML(value){this.markup=value;this.nodes=[];this.regions=new Map(['title','main','actions','context'].map(name=>[`.iq-work-header-${name}`,{append:(...nodes)=>this.nodes.push(...nodes),prepend:(...nodes)=>this.nodes.unshift(...nodes)}]));}
};
const {IqWorkHeader}=require('../src/modules/work-header.js');
test('rich title, back link and action retain identity and values across header updates',()=>{
 const header=new IqWorkHeader(),title={slot:'title',text:'Release selector'},back={slot:'back',href:'#agents'},action={slot:'actions',value:'unsaved',isConnected:true,focus:()=>{global.document.activeElement=action;}};
 header.nodes=[title,back,action];header.render();assert.doesNotMatch(header.markup,/<h1>/);assert.ok(header.nodes.includes(title));assert.ok(header.nodes.includes(back));assert.ok(header.nodes.includes(action));
 global.document.activeElement=action;header.attributes.set('description','A < B');header.render();assert.equal(global.document.activeElement,action);assert.match(header.markup,/A &lt; B/);assert.equal(header.nodes.find(n=>n.slot==='actions'),action);assert.equal(action.value,'unsaved');assert.equal(header.nodes.filter(n=>n.slot==='title').length,1);
});
test('a plain title remains a real escaped h1 and absent context stays hidden',()=>{
 const header=new IqWorkHeader();header.attributes.set('title','<Release>');header.render();assert.match(header.markup,/<h1>&lt;Release&gt;<\/h1>/);assert.match(header.markup,/iq-work-header-context" hidden/);
});
