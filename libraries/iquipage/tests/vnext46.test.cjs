const test=require('node:test'),assert=require('node:assert/strict');
global.document={activeElement:null};global.CSS={escape:s=>s};
global.HTMLElement=class extends EventTarget {
 constructor(){super();this.attrs=new Map();this.isConnected=false;this.rows=[];this.status={};this.content={querySelector:selector=>this.rows.find(x=>selector.includes('tabindex')?x.tabIndex===0:true)};Object.defineProperty(this.content,'innerHTML',{set:html=>{this.html=html;this.rows=[...html.matchAll(/data-node="([^"]+)"/g)].map(m=>this.row(m[1],html.includes(`data-node="${m[1]}"`)&&html.includes('data-disclosure')));}});}
 row(id,branch){const row={dataset:{node:id},tabIndex:-1,focus(){document.activeElement=row;},scrollIntoView(){},setAttribute(name,value){if(name==='tabindex')row.tabIndex=Number(value);},closest:selector=>selector==='[data-node]'?row:null,hasAttribute:()=>false,matches:()=>false};if(branch)row.button={focus(){document.activeElement=row.button;},closest:selector=>selector==='[data-node]'?row:row.button,hasAttribute:n=>n==='data-disclosure',matches:()=>false};row.querySelector=()=>row.button;return row;}
 contains(node){return this.rows.some(r=>r===node||r.button===node);}
 setAttribute(n,v){this.attrs.set(n,String(v));if(this.isConnected)this.attributeChangedCallback();}getAttribute(n){return this.attrs.get(n)??null;}hasAttribute(n){return this.attrs.has(n);}
 set innerHTML(v){this.markup=v;this.rows=[];}querySelector(s){if(s==='.tree-content')return this.content;if(s==='.tree-status')return this.status;if(s==='[data-node]')return this.rows[0];const id=s.match(/data-node="([^"]+)"/)?.[1],row=this.rows.find(x=>x.dataset.node===id);return s.endsWith('button')?row?.button:row;}
 querySelectorAll(){return this.rows;}
};
const {IqTree}=require('../src/modules/structured.js');
const nodes=[{id:'parent',label:'Parent <page>',children:[{id:'child',label:'Child'}]},{id:'other',label:'Other'}];
function tree(nav=true){const t=new IqTree();if(nav)t.setAttribute('navigation','');t.items=nodes;t.isConnected=true;t.connectedCallback();return t;}
function key(t,id,key){const row=t.rows.find(x=>x.dataset.node===id);let prevented=false;t.key({target:row,key,preventDefault(){prevented=true;}});return prevented;}
test('navigation parent activation is cancelable before selection or change, preserving dirty guard focus',()=>{
 const t=tree(),events=[];t.value=['other'];const controller=new AbortController();t.addEventListener('iq-navigate',e=>{events.push(e.detail);e.preventDefault();document.activeElement={guard:true};},{signal:controller.signal});let changes=0;t.addEventListener('iq-change',()=>changes++);
 assert.equal(key(t,'parent','Enter'),true);assert.deepEqual(t.value,['other']);assert.deepEqual(events,[{id:'parent',previousId:'other'}]);assert.equal(changes,0);assert.equal(document.activeElement.guard,true);
 controller.abort();key(t,'parent','Enter');assert.deepEqual(t.value,['parent']);assert.equal(t.expandedIds.length,0);assert.equal(changes,1);
});
test('expandedIds is silent and controlled; arrows expand without activating the parent',()=>{
 const t=tree(),expanded=[];let navigated=0;t.addEventListener('iq-expand',e=>expanded.push(e.detail.expandedIds));t.addEventListener('iq-navigate',()=>navigated++);
 t.expandedIds=['parent'];assert.equal(expanded.length,0);assert.match(t.html,/data-node="child"/);t.expandedIds=[];key(t,'parent','ArrowRight');assert.deepEqual(expanded,[['parent']]);assert.equal(navigated,0);key(t,'parent','ArrowRight');assert.equal(document.activeElement.dataset.node,'child');key(t,'child','ArrowLeft');assert.equal(document.activeElement.dataset.node,'parent');
});
test('navigation labels escape, optional chrome is omitted, refresh preserves focused expansion and selection',()=>{
 const t=tree();t.setAttribute('heading','');t.setAttribute('hide-search','');t.setAttribute('aria-label','Docs <all>');t.expandedIds=['parent'];t.value=['child'];t.focusNode('child');t.items=[...nodes,{id:'new',label:'New'}];assert.deepEqual(t.value,['child']);assert.deepEqual(t.expandedIds,['parent']);assert.equal(document.activeElement.dataset.node,'child');assert.doesNotMatch(t.markup,/<h3>|type="search"|Рабочие разделы/);assert.match(t.markup,/Docs &lt;all&gt;/);assert.match(t.html,/Раскрыть:|Свернуть:/);assert.match(t.html,/Parent &lt;page&gt;/);
 const outside={input:true};document.activeElement=outside;t.value=['other'];assert.equal(document.activeElement,outside);
});
test('legacy mode still expands a branch with Enter and selects a leaf, checkable takes precedence',()=>{
 const t=tree(false);key(t,'parent','Enter');assert.deepEqual(t.expandedIds,['parent']);key(t,'child','Enter');assert.deepEqual(t.value,['child']);assert.match(t.markup,/Рабочие разделы/);t.setAttribute('navigation','');t.setAttribute('checkable','');assert.equal(t.navigation,false);key(t,'parent',' ');assert.deepEqual(t.value,['child']);
});

test('independent disclosure keyboard delegates to native click and keeps focus without navigation',()=>{
 const t=tree(),row=t.rows[0],button=row.button;let prevented=false,navigations=0;t.addEventListener('iq-navigate',()=>navigations++);t.key({target:button,key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,false);const event=new Event('click');Object.defineProperty(event,'target',{value:button});t.dispatchEvent(event);assert.deepEqual(t.expandedIds,['parent']);assert.equal(navigations,0);assert.equal(document.activeElement.hasAttribute('data-disclosure'),true);
 t.focusNode('child');t.expandedIds=[];assert.equal(document.activeElement.dataset.node,'parent');
});

test('a thousand navigation nodes retain a full deep accessible path and controlled focus after refresh',()=>{
 const t=tree(),chain={id:'level-1',label:'Long root title'},all=[chain];let current=chain;for(let level=2;level<=12;level++){const node={id:'level-'+level,label:'Repeated title'};current.children=[node];current=node;}for(let i=12;i<1000;i++)all.push({id:'row-'+i,label:'Page '+i});t.items=all;t.expandedIds=Array.from({length:11},(_,i)=>'level-'+(i+1));assert.equal(t.rows.length,1000);assert.match(t.html,/aria-level="12"/);t.focusNode('level-12');t.items=all;assert.equal(document.activeElement.dataset.node,'level-12');assert.equal(t.rows.length,1000);
});

test('plain compact navigation styles target the actual generated labels and descendant counts',()=>{
 const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/styles/foundation.css'),'utf8'),t=tree();
 const count=t.html.match(/class="([^"]+)"[^>]*>1<\/span>/)?.[1];assert.equal(count,'tree-node-count');assert.ok(css.includes(`iq-tree[hide-counts] .${count}{display:none}`));
 const label=t.html.match(/class="([^"]+)"[^>]*>Other<\/span>/)?.[1];assert.equal(label,'tree-node-label');assert.ok(css.includes(`iq-tree[density=compact] .${label}{padding-block:8px;line-height:20px}`));assert.ok(css.includes(`iq-tree[density=compact] .${label}{padding-block:12px}`));
});
