import {test} from 'node:test';
import assert from 'node:assert/strict';
// SPR-13: the board title is the release switcher, the DS switcher of the workspace and project in the top bar (DS
// vnext.36). The title mounts on a small DOM with the packed release's own iq-menu, so opening, picking, the keyboard
// and the current mark are the ones the browser runs.

// ---- A small DOM with an HTML reader and custom-element upgrade: enough for ui.switcher and iq-menu. ----
const VOID=new Set(['hr','input','img','br']),registry=new Map();
class El{
  constructor(tag='div'){this.tagName=String(tag).toUpperCase();this.attrs=new Map();this.childNodes=[];this.parentNode=null;this.text='';this.listeners=new Map();this.style={};this.hidden=false;this.disabled=false;this.tabIndex=0;this.classes=new Set();}
  get classList(){const c=this.classes;return {add:(...x)=>x.forEach(y=>c.add(y)),remove:(...x)=>x.forEach(y=>c.delete(y)),contains:x=>c.has(x),toggle:(x,f)=>(f??!c.has(x))?c.add(x):c.delete(x)};}
  get dataset(){const self=this;return new Proxy({},{get:(_,k)=>self.getAttribute('data-'+String(k).replace(/[A-Z]/g,m=>'-'+m.toLowerCase()))??undefined});}
  get id(){return this.attrs.get('id')||'';} set id(v){this.attrs.set('id',String(v));}
  get textContent(){return this.text+this.childNodes.map(c=>c.textContent).join('');}
  get isConnected(){let n=this;while(n.parentNode)n=n.parentNode;return n===document;}
  get offsetWidth(){return 240;} get offsetHeight(){return 160;}
  set innerHTML(html){for(const c of this.childNodes){c.parentNode=null;for(const n of [c,...c.all()])n.disconnectedCallback?.();}this.childNodes=[];for(const c of parse(html))this.append(c);if(this.isConnected)for(const n of this.all())n.connectedCallback?.();}
  setAttribute(k,v){if(k==='class')this.classes=new Set(String(v).split(/\s+/).filter(Boolean));else this.attrs.set(k,String(v));}
  getAttribute(k){return k==='class'?[...this.classes].join(' '):this.attrs.has(k)?this.attrs.get(k):null;}
  hasAttribute(k){return k==='class'?this.classes.size>0:this.attrs.has(k);}
  removeAttribute(k){this.attrs.delete(k);}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.childNodes.push(n);}}
  contains(n){while(n){if(n===this)return true;n=n.parentNode;}return false;}
  *all(){for(const c of this.childNodes){yield c;yield* c.all();}}
  matches(sel){
    return sel.split(',').some(part=>{
      let rest=part.trim(),m;
      if((m=/^[a-z][\w-]*/.exec(rest))){if(this.tagName!==m[0].toUpperCase())return false;rest=rest.slice(m[0].length);}
      while(rest){
        if((m=/^\.([\w-]+)/.exec(rest))){if(!this.classes.has(m[1]))return false;}
        else if((m=/^\[([\w-]+)(?:=([^\]]*))?\]/.exec(rest))){if(!this.hasAttribute(m[1])||(m[2]!==undefined&&this.getAttribute(m[1])!==m[2]))return false;}
        else if((m=/^:not\(:disabled\)/.exec(rest))){if(this.disabled)return false;}
        else throw Error('Unsupported selector '+sel);
        rest=rest.slice(m[0].length);
      }
      return true;
    });
  }
  closest(sel){let n=this;while(n&&n.matches){if(n.matches(sel))return n;n=n.parentNode;}return null;}
  querySelectorAll(sel){return [...this.all()].filter(n=>n.matches(sel));}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  getBoundingClientRect(){return {left:40,top:40,right:280,bottom:72,width:240,height:32};}
  focus(){document.activeElement=this;}
  scrollIntoView(){}
  animate(){return {finished:Promise.resolve(),cancel(){}};}
  addEventListener(type,fn,opts={}){if(opts?.signal?.aborted)return;if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);opts?.signal?.addEventListener('abort',()=>{this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn));});}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn));}
  dispatchEvent(event){let stopped=false;const stop=event.stopPropagation?.bind(event);event.stopPropagation=()=>{stopped=true;stop?.();};
    for(let n=this;n&&!stopped;n=event.bubbles?n.parentNode:null)for(const fn of [...(n.listeners.get(event.type)||[])])fn(event);return true;}
  fire(type,props={}){const event={type,target:this,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...props};this.dispatchEvent(event);return event;}
}
/** Elements, quoted attributes and text; a defined custom element is created as its class, as the browser upgrades it. */
function parse(html){
  const top=new El('#fragment'),stack=[top],decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  for(const [,close,tag,attrs,self,text] of String(html).matchAll(/<(\/?)([a-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)){
    if(text!==undefined){const t=new El('#text');t.text=decode(text);t.matches=()=>false;stack.at(-1).append(t);continue;}
    if(close){stack.pop();continue;}
    const Kind=registry.get(tag)||El,el=new Kind(tag);el.tagName=tag.toUpperCase();
    for(const [,k,v] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))el.setAttribute(k,v===undefined?'':decode(v));
    stack.at(-1).append(el);if(!self&&!VOID.has(tag))stack.push(el);
  }
  return top.childNodes.map(n=>{n.parentNode=null;return n;});
}
const document=new El('#document');document.body=new El('body');document.append(document.body);document.activeElement=null;
Object.assign(globalThis,{HTMLElement:El,document,window:new El('#window'),innerWidth:1440,innerHeight:1000,matchMedia:()=>({matches:true,addEventListener(){}}),
  requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},getComputedStyle:()=>({getPropertyValue:()=>''}),
  customElements:{define:(name,kind)=>registry.set(name,kind),get:name=>registry.get(name)}});
const {registerComponents}=await import('@iquipage/web/core');registerComponents();
const {mountReleaseTitle}=await import('../ui/src/board/release-title.js');
const {boardShown}=await import('../ui/src/board/model.js');

const releases=[
  {id:'running',name:'Спринт 12',lifecycle:'active',archivedAt:null,plannedEnd:'2026-10-10'},
  {id:'next',name:'Спринт 13',lifecycle:'planned',archivedAt:null,plannedStart:'2026-10-11'},
  {id:'later',name:'Спринт 14',lifecycle:'planned',archivedAt:null,plannedStart:'2026-10-25'},
  {id:'done',name:'Спринт 11',lifecycle:'closed',archivedAt:null},
];
/** The board heading's title with the switcher, as board.js mounts it; `picked` records what the board is asked to show. */
function mount(chosen=null){
  const title=new El('h1');document.body.append(title);const picked=[],events=new AbortController();
  let shown=boardShown(chosen,releases);
  const view=mountReleaseTitle(title,{signal:events.signal,onPick:value=>{picked.push(value);shown=boardShown(value,releases);view.render(releases,shown);}});
  view.render(releases,shown);
  const trigger=()=>title.querySelector('button.iq-switcher'),popup=()=>title.querySelector('[data-menu]'),rows=()=>popup().querySelectorAll('button');
  return {title,view,picked,trigger,popup,rows,checked:()=>rows().filter(r=>r.getAttribute('aria-checked')==='true').map(r=>r.textContent),
    destroy(){events.abort();title.innerHTML='';document.body.childNodes.splice(document.body.childNodes.indexOf(title),1);}};
}

test('the title is the release name as the top bar\'s switcher: a text label, a chevron, no border and no layers icon',()=>{
  const board=mount();const button=board.trigger();
  assert.equal(board.title.querySelectorAll('button.iq-switcher').length,1);
  assert.deepEqual([...button.classes],['iq-btn','ghost','iq-switcher'],'ghost, no compact size: the 24px/600 title decides');
  assert.equal(button.getAttribute('data-size'),'title');
  assert.equal(button.querySelector('.iq-switcher-label').textContent,'Спринт 12');
  assert.equal(button.getAttribute('aria-label'),'Релиз на доске: Спринт 12');
  assert.deepEqual(button.querySelectorAll('svg').map(s=>s.getAttribute('data-glyph')),['down']);
  assert.equal(board.title.querySelector('[data-glyph=stack]'),null);assert.equal(board.title.querySelector('[data-glyph=flag]'),null);
  board.destroy();
});

test('opening the menu lists the same releases as before: running, planned by start, a rule, «Без релиза»',()=>{
  const board=mount();const button=board.trigger();
  assert.equal(button.getAttribute('aria-haspopup'),'menu');assert.equal(button.getAttribute('aria-expanded'),'false');
  button.fire('click');
  assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(board.popup().hidden,false);assert.equal(board.popup().getAttribute('role'),'menu');
  assert.deepEqual(board.rows().map(r=>r.childNodes.find(c=>c.tagName==='SPAN'&&!c.classes.has('iq-switcher-mark')).textContent),['Спринт 12','Спринт 13','Спринт 14','Без релиза']);
  assert.deepEqual(board.rows().map(r=>r.querySelector('.iq-switcher-meta')?.textContent??null),['идёт','запланирован','запланирован',null]);
  assert.ok(board.popup().querySelector('hr.iq-switcher-separator'),'a rule before «Без релиза»');
  assert.ok(!board.rows().some(r=>r.textContent.includes('Спринт 11')),'a finished release is not offered');
  board.destroy();
});

test('the current mark: the shown release is the one checked row, with the check, and the menu opens on it',()=>{
  const board=mount('next');
  assert.equal(board.trigger().querySelector('.iq-switcher-label').textContent,'Спринт 13');
  assert.deepEqual(board.checked(),['Спринт 13запланирован']);
  const current=board.rows().find(r=>r.getAttribute('aria-checked')==='true');
  assert.equal(current.getAttribute('role'),'menuitemradio');assert.equal(current.querySelector('svg').getAttribute('data-glyph'),'check');
  assert.ok(board.rows().filter(r=>r!==current).every(r=>r.querySelector('.iq-switcher-mark')&&!r.querySelector('svg')),'the others keep the mark column empty');
  board.trigger().fire('click');assert.equal(document.activeElement,current);
  board.destroy();
  const backlog=mount('backlog');
  assert.equal(backlog.trigger().querySelector('.iq-switcher-label').textContent,'Без релиза');assert.deepEqual(backlog.checked(),['Без релиза']);
  backlog.destroy();
});

test('picking a release asks the board for it, retitles the board and moves the mark; the shown one asks nothing',()=>{
  const board=mount();
  board.trigger().fire('click');board.popup().fire('click',{target:board.rows()[1]});
  assert.deepEqual(board.picked,['next']);
  assert.equal(board.trigger().querySelector('.iq-switcher-label').textContent,'Спринт 13');
  assert.equal(board.trigger().getAttribute('aria-label'),'Релиз на доске: Спринт 13');
  assert.deepEqual(board.checked(),['Спринт 13запланирован']);
  assert.equal(document.activeElement,board.trigger(),'focus stays on the title after the pick');
  board.trigger().fire('click');board.popup().fire('click',{target:board.rows().at(-1)});
  assert.deepEqual(board.picked,['next','backlog']);assert.equal(board.trigger().querySelector('.iq-switcher-label').textContent,'Без релиза');
  board.trigger().fire('click');board.popup().fire('click',{target:board.rows().at(-1)});
  assert.deepEqual(board.picked,['next','backlog'],'the release already shown is not asked for again');
  // A reload with the same releases leaves the switcher (and an open menu) as it is.
  const before=board.trigger();board.view.render(releases,boardShown('backlog',releases));assert.equal(board.trigger(),before);
  board.destroy();
});

test('keyboard: ArrowDown opens on the current release, arrows move, Escape returns, Enter picks',()=>{
  const board=mount('next');const button=board.trigger();button.focus();
  assert.ok(button.fire('keydown',{key:'ArrowDown'}).defaultPrevented);
  assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(document.activeElement,board.rows()[1]);
  board.popup().fire('keydown',{key:'ArrowDown'});assert.equal(document.activeElement,board.rows()[2]);
  board.popup().fire('keydown',{key:'ArrowDown'});assert.equal(document.activeElement,board.rows()[3],'the rule is skipped');
  board.popup().fire('keydown',{key:'Home'});assert.equal(document.activeElement,board.rows()[0]);
  board.popup().fire('keydown',{key:'Escape'});
  assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,button);assert.deepEqual(board.picked,[]);
  button.fire('keydown',{key:'ArrowUp'});assert.equal(document.activeElement,board.rows()[3],'ArrowUp opens on the last row');
  for(let i=0;i<3;i++)board.popup().fire('keydown',{key:'ArrowUp'});
  assert.equal(document.activeElement,board.rows()[0]);
  // Enter on a focused menu button is its click in the browser.
  board.popup().fire('click',{target:document.activeElement});
  assert.deepEqual(board.picked,['running']);assert.equal(board.trigger().querySelector('.iq-switcher-label').textContent,'Спринт 12');
  assert.equal(document.activeElement,board.trigger(),'focus is on the new title');
  board.destroy();
});

test('the top bar and the board title are the same DS control',async()=>{
  const {readFile}=await import('node:fs/promises');
  const navigation=await readFile(new URL('../ui/planning/src/project-navigation.js',import.meta.url),'utf8'),board=await readFile(new URL('../ui/src/board/board.js',import.meta.url),'utf8');
  assert.equal((navigation.match(/ui\.switcher\(/g)||[]).length,2,'workspace and project');
  assert.doesNotMatch(navigation,/class="iq-btn ghost sm iq-switcher/,'no hand-made switcher markup left');
  assert.doesNotMatch(board,/board-release"|iq-select name="board-release/,'the bordered release select is gone from the tools');
  assert.match(board,/<div class="host-task-tools sq-page-tools"><div class="host-board-sort" data-board-sort><\/div><div class="board-filter-bar" data-board-filters><\/div>/);
});
