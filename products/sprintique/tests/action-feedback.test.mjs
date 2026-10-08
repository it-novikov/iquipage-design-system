import {test} from 'node:test';
import assert from 'node:assert/strict';
// Action feedback in the product (DS vnext.35): the request layer reports every request, a press of a DS button holds
// that button pending, failures are said next to it, background reads stay silent, a lost connection is named.

// ---- A small DOM: enough tree, attributes and events for the DS feedback module. ----
const listeners=new Map();
const on=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
const fire=(type,event={})=>{for(const fn of listeners.get(type)||[])fn(event);};
class Node{
  constructor(tag='div',text=null){this.tagName=tag.toUpperCase();this.text=text;this.childNodes=[];this.parentNode=null;this.attrs=new Map();this.dataset={};this.style={width:'',setProperty(){}};this.classes=new Set();this.clicks=0;}
  get className(){return [...this.classes].join(' ');} set className(v){this.classes=new Set(String(v).split(/\s+/).filter(Boolean));}
  get classList(){const c=this.classes;return {contains:x=>c.has(x),add:x=>c.add(x),remove:(...x)=>x.forEach(y=>c.delete(y)),toggle:(x,f)=>(f??!c.has(x))?c.add(x):c.delete(x)};}
  get isConnected(){let n=this;while(n.parentNode)n=n.parentNode;return n===doc.body;}
  get textContent(){return this.text??this.childNodes.map(n=>n.textContent).join('');} set textContent(v){this.childNodes=[];this.text=String(v);}
  set innerHTML(v){this.html=v;this.childNodes=[];} get innerHTML(){return this.html||'';}
  get firstChild(){return this.childNodes[0]||null;} get firstElementChild(){return this.childNodes.find(n=>n.text===null)||null;}
  append(...nodes){for(const n of nodes){n.parentNode?.childNodes.splice(n.parentNode.childNodes.indexOf(n),1);n.parentNode=this;this.childNodes.push(n);}}
  prepend(n){this.append(n);this.childNodes.unshift(this.childNodes.pop());}
  after(n){const p=this.parentNode;p.append(n);p.childNodes.splice(p.childNodes.indexOf(this)+1,0,p.childNodes.pop());}
  remove(){if(this.parentNode){this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null;}}
  replaceWith(...nodes){const p=this.parentNode;if(!p)return;const i=p.childNodes.indexOf(this);this.remove();for(const n of nodes){n.parentNode?.childNodes.splice(n.parentNode.childNodes.indexOf(n),1);n.parentNode=p;}p.childNodes.splice(i,0,...nodes);}
  setAttribute(k,v){this.attrs.set(k,String(v));} getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;} hasAttribute(k){return this.attrs.has(k);}
  removeAttribute(k){this.attrs.delete(k);} toggleAttribute(k,f){f?this.attrs.set(k,''):this.attrs.delete(k);}
  matches(sel){return sel.split(',').some(s=>{s=s.trim();return s.startsWith('.')?this.classes.has(s.slice(1)):s.startsWith('[')?this.attrs.has(s.slice(1,-1)):this.tagName===s.toUpperCase();});}
  closest(sel){let n=this;while(n&&n.matches){if(n.matches(sel))return n;n=n.parentNode;}return null;}
  contains(n){while(n){if(n===this)return true;n=n.parentNode;}return false;}
  querySelector(sel){for(const c of this.childNodes){if(c.text!==null)continue;if(sel.startsWith('#')?c.id===sel.slice(1):sel.includes('[role="')?c.classes.has('iq-toast-live')&&c.getAttribute('role')===sel.match(/role="(\w+)"/)[1]:c.matches(sel))return c;const d=c.querySelector(sel);if(d)return d;}return null;}
  querySelectorAll(){return [];} addEventListener(){}
  getBoundingClientRect(){return {width:96,left:10,top:10,bottom:46};} get scrollWidth(){return 60;} get clientWidth(){return 96;}
  focus(){doc.activeElement=this;} click(){this.clicks++;} showPopover(){} hidePopover(){}
  get offsetWidth(){return 200;} get offsetHeight(){return 40;}
}
const doc={body:new Node('body'),activeElement:null,createElement:tag=>new Node(tag),querySelector:sel=>doc.body.querySelector(sel),documentElement:{dataset:{}}};
globalThis.document=doc;globalThis.window=globalThis;globalThis.addEventListener=(type,fn)=>on(type,fn);
globalThis.innerWidth=1440;globalThis.innerHeight=1000;globalThis.HTMLElement||=class{};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const button=label=>{const b=new Node('button');b.className='iq-btn primary sm';b.append(new Node('#text',label));doc.body.append(b);return b;};
const press=b=>{b.focus();fire('click',{target:{closest:sel=>sel.includes('.iq-btn')?b:null}});};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

let nextFetch=null;
globalThis.fetch=()=>nextFetch.promise;
const core=await import('@iquipage/web/core');
const {trackedFetch,background,failed}=await import('../ui/src/action-feedback.js');
const {SprintiqueClient,ApiError,NO_CONNECTION}=await import('../client/api.ts');
core.autoPending();

test('a request that answers within 150 ms after a press never shows the pending look (no flicker)',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const b=button('Сохранить');press(b);nextFetch=deferred();
  const client=new SprintiqueClient(trackedFetch);
  const saved=client.request('/x','PUT',{a:1},'key');
  assert.ok(core.isPending(b),'the button takes no second press at once');
  t.mock.timers.tick(120);assert.equal(b.getAttribute('aria-busy'),null);
  nextFetch.resolve({ok:true,status:200,json:async()=>({ok:1})});await flush();
  assert.deepEqual(await saved,{ok:1});
  t.mock.timers.tick(core.FEEDBACK_TIMING.grace+1);
  assert.equal(core.isPending(b),false);assert.equal(b.getAttribute('aria-busy'),null,'never shown');
});

test('a slow request after a press: pending look after 150 ms, line after 1 s, no second request while it runs',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const b=button('Создать');press(b);nextFetch=deferred();let sent=0;
  globalThis.fetch=()=>{sent++;return nextFetch.promise;};
  const client=new SprintiqueClient(trackedFetch);
  const created=client.request('/projects/p/tasks/t','PUT',{a:1},'key');
  t.mock.timers.tick(150);assert.equal(b.getAttribute('aria-busy'),'true');assert.equal(b.style.width,'96px','the width is kept');
  let stopped=false;fire('click',{target:{closest:()=>b},preventDefault(){},stopImmediatePropagation(){stopped=true;}});
  assert.ok(stopped,'a second press is swallowed: no double submit');assert.equal(sent,1);
  t.mock.timers.tick(850);assert.equal(core.activityState().long,true,'the line under the top bar runs');
  nextFetch.resolve({ok:true,status:200,json:async()=>({})});await created;await flush();
  t.mock.timers.tick(core.FEEDBACK_TIMING.grace+1);
  assert.equal(b.getAttribute('aria-busy'),null);assert.equal(core.activityState().active,0);
  globalThis.fetch=()=>nextFetch.promise;
});

test('error recovery: an HTTP failure re-enables the button and is said next to it with «Повторить»',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const b=button('Пригласить');press(b);nextFetch=deferred();
  const client=new SprintiqueClient(trackedFetch);
  const call=client.request('/invitations','POST',{},'key');
  t.mock.timers.tick(300);
  nextFetch.resolve({ok:false,status:503,json:async()=>({code:'UNAVAILABLE',message:'Сервис временно недоступен.'})});
  const error=await call.catch(e=>e);
  assert.ok(error instanceof ApiError);assert.equal(error.status,503);
  t.mock.timers.tick(core.FEEDBACK_TIMING.grace+1);
  assert.equal(core.isPending(b),false,'enabled again');
  assert.equal(failed(error,{message:'Не удалось открыть приглашение'}),true,'shown next to the pressed button');
  const note=b.parentNode.childNodes[b.parentNode.childNodes.indexOf(b)+1];
  assert.equal(note.getAttribute('role'),'alert');
  assert.match(note.innerHTML,/Не удалось открыть приглашение\.<\/b> Сервис временно недоступен\./);
  assert.match(note.innerHTML,/data-action-retry>Повторить</);
});

test('background reads (polls, prefetch, read markers) light nothing and hold no button',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const b=button('Обновить');press(b);nextFetch=deferred();
  const client=new SprintiqueClient(trackedFetch);
  const poll=background(()=>client.request('/notifications/unread'));
  assert.equal(core.isPending(b),false);assert.equal(core.activityState().active,0);
  t.mock.timers.tick(9000);assert.equal(core.activityState().slow,false);
  nextFetch.resolve({ok:true,status:200,json:async()=>({unread:0})});await poll;
});

test('no answer at all: the product says it in Russian and, when the browser is offline, the offline notice appears',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const stop=core.watchConnection();
  navigator.onLine=false;nextFetch=deferred();
  const client=new SprintiqueClient(trackedFetch);
  const call=client.request('/session');
  nextFetch.reject(new TypeError('Failed to fetch'));
  const error=await call.catch(e=>e);
  assert.equal(error.code,'NETWORK');assert.equal(error.message,NO_CONNECTION);assert.equal(error.status,0);
  await flush();
  assert.equal(core.connectionState().offline,true);
  const notice=()=>doc.body.querySelector('#iq-toasts')?.childNodes.find(n=>n.classes.has('iq-connection-notice'));
  assert.equal(notice().dataset.notice,'offline');
  assert.match(notice().innerHTML,/Нет подключения к интернету.*Изменения не отправятся, пока связь не вернётся/);
  navigator.onLine=true;fire('online');
  assert.equal(notice().dataset.notice,'online');assert.match(notice().innerHTML,/Связь восстановлена/);
  stop();
});

test('a slow request shows the calm slow notice after 8 s and removes it when the answer comes',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const stop=core.watchConnection();nextFetch=deferred();
  const client=new SprintiqueClient(trackedFetch);
  const call=client.request('/projects/p/tasks/t','PUT',{},'key');
  const notice=()=>doc.body.querySelector('#iq-toasts')?.childNodes.find(n=>n.classes.has('iq-connection-notice'));
  t.mock.timers.tick(7999);assert.equal(notice(),undefined);
  t.mock.timers.tick(1);assert.equal(notice().dataset.notice,'slowWrite');
  assert.match(notice().innerHTML,/Связь медленная.*Действие ещё выполняется/);
  nextFetch.resolve({ok:true,status:200,json:async()=>({})});await call;await flush();
  assert.equal(notice(),undefined);
  stop();
});
