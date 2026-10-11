const test=require('node:test');const assert=require('node:assert/strict');
global.HTMLElement=global.HTMLElement||class {};
const {choiceGroups}=require('../src/modules/ui.js');
test('grouped choices escape content and keep completed choices disclosed',()=>{
 const markup=choiceGroups({name:'pick',value:'done',groups:[{id:'empty',label:'Empty',options:[]},{id:'done',label:'Done <x>',collapsible:true,options:[{value:'done',label:'<script>',description:'A & B'}]}]});
 assert.match(markup,/<details class="iq-work-details" data-choice-group="done">/);assert.match(markup,/type="radio" name="pick" value="done" checked/);assert.match(markup,/Done &lt;x&gt;/);assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/Empty|<script>/);
});
test('disclosure can remain open across host result updates',()=>assert.match(choiceGroups({name:'pick',groups:[{id:'a',label:'A',collapsible:true,expanded:true,options:[{value:'1',label:'One'}]}]}),/data-choice-group="a" open/));
test('the disclosed heading appears once visually while its fieldset remains named',()=>{
 const markup=choiceGroups({name:'pick',groups:[{id:'done',label:'Finished',collapsible:true,options:[{value:'1',label:'One'}]},{id:'open',label:'Open',options:[{value:'2',label:'Two'}]}]});
 assert.match(markup,/<summary>Finished \(1\)<\/summary><fieldset[^>]*><legend class="sr-only">Finished<\/legend>/);
 assert.match(markup,/<legend>Open<\/legend>/);
});
