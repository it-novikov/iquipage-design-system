// Independent R5 narrow source-composition diagnostic. No browser/render/focus acceptance.
// Executes exact pinned IqElement + IqTabs and product setSection; DOM/query/click delivery are doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const revision='ac68af1e1c4c213ba307d35ec8706998802db447';
const repository='/workspace/scratch/b3dac59f68e2/repo-maps';
const snapshot='/workspace/scratch/b3dac59f68e2/research/wp01/review-r5-ac68af1e';
const taskPath='products/sprintique/ui/src/board/task-dialog.js';
const archive=snapshot+'/products/sprintique/vendor/iquipage-web-0.6.0-vnext.52.tgz';
const digest=value=>createHash('sha256').update(value).digest('hex');
const source=readFileSync(snapshot+'/'+taskPath,'utf8');
assert.equal(digest(source),digest(execFileSync('git',['show',revision+':'+taskPath],{cwd:repository})));
assert.equal(digest(readFileSync(archive)),'989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758');
const components=execFileSync('tar',['-xOf',archive,'package/dist/modules/components.js'],{encoding:'utf8'});
const base=components.slice(components.indexOf('class IqElement extends'),components.indexOf('exports.IqElement = IqElement;'));
const tabsSource=components.slice(components.indexOf('class IqTabs extends'),components.indexOf('exports.IqTabs = IqTabs;'));
const block=source.slice(source.indexOf("      let setSection=()=> 'task';"),source.indexOf('      // keepOpen:'));
assert.ok(base.startsWith('class IqElement')&&tabsSource.startsWith('class IqTabs')&&block.includes('settingSection'));
const initialExpression=source.match(/<iq-tabs label="Разделы задачи" value="\$\{([^}]+)\}" data-task-tabs>/)?.[1];
assert.ok(initialExpression);
const initialValue=new Function('initialSection','return '+initialExpression);
const routeSource=readFileSync(snapshot+'/products/sprintique/ui/src/board/task-route.js','utf8');
const urlFunction=routeSource.slice(routeSource.indexOf('export function taskURL'),routeSource.indexOf('export function parseTaskRoute')).replace('export ','');
const taskURL=new Function('location','taskKey',urlFunction+';return taskURL;')({href:'https://fixture.invalid/?project=P#maps/A/task/T1'},task=>task.displayId||task.id);
const document={activeElement:null};

class ElementDouble extends EventTarget {
  constructor(tag='div') {super();this.tag=tag;this.attributes=new Map();this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.clicks=0;this.focusCalls=0;const active=new Set();this.classList={toggle(name,yes){if(yes)active.add(name);else active.delete(name);},contains:name=>active.has(name)};}
  setAttribute(name,value) {this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  getAttribute(name) {return this.attributes.get(name)??null;}
  append(...nodes) {for(const node of nodes){node.parent=this;this.children.push(node);}}
  matches(selector) {if(selector==='iq-tabs')return this.tag==='iq-tabs';if(selector==='.iq-dialog-footer')return this.tag==='footer';const m=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);return !!m&&this.attributes.has(m[1])&&(m[2]===undefined||this.getAttribute(m[1])===m[2]);}
  querySelectorAll(selector) {return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector) {return this.querySelectorAll(selector)[0]??null;}
  closest(selector) {return this.matches(selector)?this:this.parent?.closest(selector)??null;}
  focus() {this.focusCalls++;document.activeElement=this;}
  click() {this.clicks++;if(this.disabled)return;const event=new Event('click',{bubbles:true});Object.defineProperty(event,'target',{value:this});this.parent.dispatchEvent(event);}
}
let id=0;
const IqTabs=new Function('HTMLElement','uid','document',base+'\n'+tabsSource+'\nreturn IqTabs;')(ElementDouble,()=>`fixture-${++id}`,document);
const install=new Function('form','workTabs','initialSection','onSectionChange','history','task','taskURL',block+'\nreturn setSection;');

function fixture(initialSection,callback=true) {
  const tabs=new IqTabs();tabs.tag='iq-tabs';tabs.setAttribute('data-task-tabs','');tabs.setAttribute('value',initialValue(initialSection));
  const form=new ElementDouble('form'),list=new ElementDouble('div'),footer=new ElementDouble('footer');list.setAttribute('data-tablist','');
  const buttons={},panels={};
  for(const section of ['task','work']){const button=new ElementDouble('button'),panel=new ElementDouble('section');button.setAttribute('data-tab',section);panel.setAttribute('data-panel',section);buttons[section]=button;panels[section]=panel;list.append(button);tabs.append(panel);}
  tabs.append(list);form.append(tabs,footer);tabs.connectedCallback();
  const callbacks=[],writes=[],state={nested:{preserve:'history-entry'}};
  const history={state,replaceState(...args){writes.push(args);}};
  const setSection=install(form,true,initialSection,callback?value=>callbacks.push(value):null,history,{id:'T1'},taskURL);
  let changes=0;tabs.addEventListener('iq-change',()=>changes++);
  const assertSelection=section=>{assert.equal(tabs.getAttribute('value'),section);assert.equal(footer.hidden,section==='work');for(const key of ['task','work']){assert.equal(buttons[key].getAttribute('aria-selected'),String(key===section));assert.equal(buttons[key].tabIndex,key===section?0:-1);assert.equal(buttons[key].classList.contains('active'),key===section);assert.equal(panels[key].hidden,key!==section);assert.equal(panels[key].getAttribute('role'),'tabpanel');assert.equal(buttons[key].getAttribute('aria-controls'),panels[key].id);}};
  return {tabs,buttons,panels,footer,callbacks,writes,state,setSection,assertSelection,get changes(){return changes;}};
}

test('actual initialSection expression whitelists task/work and pinned DS mounts the requested panel',()=>{
  for(const initial of ['work','task',undefined,'WORK','task" data-hostile="true']){const f=fixture(initial);f.assertSelection(initial==='work'?'work':'task');assert.deepEqual(f.callbacks,[]);assert.deepEqual(f.writes,[]);}
});

for(const callback of [true,false]) {
  test(`programmatic Task ↔ Work synchronizes panels and ARIA with zero ${callback?'callback':'replaceState'} writes`,()=>{
    const f=fixture('task',callback),sentinel=new ElementDouble('textarea');document.activeElement=sentinel;
    assert.equal(f.setSection('work'),'work');f.assertSelection('work');assert.equal(f.changes,1);
    assert.equal(f.setSection('task'),'task');f.assertSelection('task');assert.equal(f.changes,2);
    assert.equal(f.setSection('task'),'task');assert.equal(f.setSection('invalid'),'task');assert.equal(f.changes,2);
    assert.deepEqual(f.callbacks,[]);assert.deepEqual(f.writes,[]);assert.equal(document.activeElement,sentinel);
    assert.equal(f.buttons.task.focusCalls+f.buttons.work.focusCalls,0);
  });
  test(`manual supplied button action emits one ${callback?'callback':'replaceState'} route update synchronously`,()=>{
    const f=fixture('task',callback);f.buttons.work.click();f.assertSelection('work');assert.equal(f.changes,1);
    if(callback){assert.deepEqual(f.callbacks,['work']);assert.deepEqual(f.writes,[]);}
    else{assert.deepEqual(f.callbacks,[]);assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],f.state);assert.equal(f.writes[0][2],'https://fixture.invalid/?project=P#/task/T1/work');}
    f.setSection('task');f.assertSelection('task');assert.equal(f.changes,2);
    assert.equal(callback?f.callbacks.length:f.writes.length,1);
  });
}

console.log(JSON.stringify({revision,taskDialogSha256:digest(source),archiveSha256:digest(readFileSync(archive)),componentsSha256:digest(components),method:'actual pinned classes and product block; DOM/event-delivery doubles; no native browser, rendered visibility, or focus acceptance'}));
