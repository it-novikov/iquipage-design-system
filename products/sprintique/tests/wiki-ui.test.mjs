import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wikiRoute,wikiHash,wikiTree,wikiAncestors,wikiParents,wikiDraft,wikiReads,revealWikiVersion,wikiPathEntries,wikiRailScroll,wikiCatalogState} from '../web/wiki-model.js';
import {sectionRouteHash} from '../web/section-route.js';
const page=(id,changes={})=>({id,title:id,body:'Исходный текст',parentId:null,revision:2,archivedAt:null,...changes});
test('wiki addresses distinguish reserved view names from stable page ids, and reject unsafe versions',()=>{
 for(const id of ['archive','new','search','page_1'])assert.deepEqual(wikiRoute(wikiHash(id)),{kind:'page',id});
 assert.deepEqual(wikiRoute('#wiki/archive'),{kind:'archive'});assert.deepEqual(wikiRoute(wikiHash('a','history/3')),{kind:'version',id:'a',version:3});
 for(const hash of ['#wiki/page/a/history/0','#wiki/page/a/history/9007199254740992','#wiki/page/a/unknown','#wiki/page/a/history/1/extra','#wiki/page/a%2fb'])assert.equal(wikiRoute(hash).kind,'invalid');
 assert.equal(sectionRouteHash('wiki','#wiki/page/archive/history/2'),'#wiki/page/archive/history/2');assert.equal(sectionRouteHash('wiki','#maps/a'),'#wiki');
});
test('catalog builds parent documents with children, omits archive and sorts human titles',()=>{
 const rows=[page('child',{parentId:'parent',title:'Бета'}),page('parent',{title:'Альфа'}),page('archived',{archivedAt:'now'}),page('root',{title:'Язык'})];
 assert.deepEqual(wikiTree(rows),[{id:'parent',label:'Альфа',children:[{id:'child',label:'Бета'}]},{id:'root',label:'Язык'}]);
 assert.deepEqual(wikiAncestors(rows,'child'),['parent']);assert.deepEqual(wikiParents(rows,'parent').map(x=>x.id),['root']);
});
test('parent candidates exclude every descendant, archive and the moving page',()=>{
 const rows=[page('a'),page('b',{parentId:'a'}),page('c',{parentId:'b'}),page('d'),page('e',{archivedAt:'now'})];
 assert.deepEqual(wikiAncestors(rows,'c'),['a','b']);assert.deepEqual(wikiParents(rows,'a').map(p=>p.id),['d']);assert.deepEqual(wikiParents(rows,'b').map(p=>p.id),['a','d']);
});
test('drafts preserve entered body and base on CAS until current content is explicitly reviewed',()=>{
 const draft=wikiDraft(page('a'));assert.equal(draft.dirty,false);draft.value.body='Мой несохранённый текст';draft.setConflict(page('a',{body:'Чужой текст',revision:7}));
 assert.equal(draft.value.body,'Мой несохранённый текст');assert.equal(draft.revision,2);assert.throws(()=>draft.payload(),/прочитайте/);draft.review();assert.equal(draft.revision,7);assert.deepEqual(draft.payload(),{baseRevision:7,value:{title:'a',body:'Мой несохранённый текст',parentId:null,archived:false}});
 draft.setConflict(page('a',{revision:8}));assert.equal(draft.checked,false);assert.throws(()=>draft.payload(),/прочитайте/);
});
test('a create retry retains the same id and complete command, including its selected parent',()=>{
 const draft=wikiDraft();draft.value.title='  Инструкция  ';draft.value.body='Текст';draft.value.parentId='parent';const id=draft.id,first=draft.payload();
 assert.equal(draft.id,id);assert.deepEqual(draft.payload(),first);assert.equal(first.baseRevision,0);assert.equal(first.value.parentId,'parent');assert.equal(first.value.title,'Инструкция');
});
test('empty or oversized text fails before a command while retaining the draft for correction',()=>{
 const draft=wikiDraft();assert.throws(()=>draft.payload(),/название/);draft.value.title='Название';draft.value.body='x'.repeat(100001);assert.throws(()=>draft.payload(),/100 000/);assert.equal(draft.value.body.length,100001);draft.value.body='';assert.equal(draft.payload().value.body,'');
});
test('a superseded page or search response cannot overwrite the next route or query',async()=>{
 const requests=wikiReads(),paints=[];let resolveOld,resolveNew;
 const load=async(name,promise)=>{const request=requests.start(name);const value=await promise;if(request.current())paints.push(value);return request.signal.aborted;};
 const old=load('page',new Promise(done=>resolveOld=done)),next=load('page',new Promise(done=>resolveNew=done));resolveNew('Page B');await next;resolveOld('Page A');assert.equal(await old,true);assert.deepEqual(paints,['Page B']);
 const oldQuery=requests.start('search');requests.start('search');assert.equal(oldQuery.current(),false);assert.equal(oldQuery.signal.aborted,true);
});
test('close cancels page/catalog/search/history without relying on transports honoring abort',()=>{
 const requests=wikiReads(),reads=['page','catalog','search','history'].map(name=>requests.start(name));requests.close();for(const request of reads){assert.equal(request.signal.aborted,true);assert.equal(request.current(),false);}
});

test('content conflict review preserves a peer move and repeated conflict invalidates acknowledgement',()=>{const d=wikiDraft(page('a',{parentId:'old'}));d.value.body='Own text';d.setConflict(page('a',{revision:3,parentId:'new'}));d.review();assert.equal(d.payload().value.parentId,'new');assert.equal(d.payload().value.body,'Own text');d.setConflict(page('a',{revision:4,parentId:'newer'}));assert.throws(()=>d.payload(),/прочитайте/);d.review();assert.equal(d.payload().value.parentId,'newer');});
test('a peer archive requires explicit restore and fresh location, never implicit unarchive',()=>{const d=wikiDraft(page('a'));d.value.body='Keep me';d.setConflict(page('a',{revision:3,parentId:'archived-parent',archivedAt:'now'}));assert.throws(()=>d.review(),/явно подтвердите/);assert.equal(d.checked,false);d.review({restore:true,parentId:null});assert.deepEqual(d.payload(),{baseRevision:3,value:{title:'a',body:'Keep me',parentId:null,archived:false}});d.setConflict(page('a',{revision:4,archivedAt:'again'}));assert.throws(()=>d.payload(),/прочитайте/);});

test('numbered document names follow natural order without losing distinct equal titles',()=>{const rows=[page('ten',{title:'Инструкция 10'}),page('two',{title:'Инструкция 2'}),page('one',{title:'Инструкция 1'}),page('copy',{title:'Инструкция 2'})];assert.deepEqual(wikiTree(rows).map(x=>x.id),['one','two','copy','ten']);});

test('chosen history version is revealed within its rail without moving focus or the document',()=>{let row={top:900,bottom:980};const list={scrollTop:0,querySelector:()=>({getBoundingClientRect:()=>row}),getBoundingClientRect:()=>({top:100,bottom:700})};revealWikiVersion(list);assert.equal(list.scrollTop,280);row={top:50,bottom:130};revealWikiVersion(list);assert.equal(list.scrollTop,230);row={top:200,bottom:280};revealWikiVersion(list);assert.equal(list.scrollTop,230);});

test('late catalog resolves breadcrumb names while current page location wins over stale catalog metadata',()=>{const current=page('child',{parentId:'new'});assert.deepEqual(wikiPathEntries([],current),[{id:'new',title:'Страница'}]);assert.deepEqual(wikiPathEntries([page('child',{parentId:'old'}),page('new',{parentId:'root',title:'Новое место'}),page('root',{title:'Раздел'})],current),[{id:'root',title:'Раздел'},{id:'new',title:'Новое место'}]);});


test('distant history never carries its scroll into the catalog, including a deliberately scrolled catalog',()=>{
 for(const catalogPosition of [0,612]){
  const scroll=wikiRailScroll();let top=0,max=1560;
  const list={clientHeight:464,get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(max,value));}};
  const paint=(height)=>()=>{max=height;list.scrollTop=top;};
  scroll.render(list,'catalog',true,paint(1560));list.scrollTop=catalogPosition;
  scroll.render(list,'history:page',false,paint(0));
  scroll.render(list,'history:page',true,paint(6000));list.scrollTop=5816;
  scroll.render(list,'history:page',false,paint(0)); // Selecting version 1 loads a placeholder.
  scroll.render(list,'history:page',true,paint(6000));assert.equal(list.scrollTop,5816);
  scroll.render(list,'catalog',true,paint(1560));assert.equal(list.scrollTop,catalogPosition);
  scroll.render(list,'history:other',true,paint(6000));assert.equal(list.scrollTop,0);
  scroll.render(list,'history:page',true,paint(6000));assert.equal(list.scrollTop,5816);
 }
});

test('a hidden mobile rail and late placeholder scroll cannot erase the saved context',()=>{
 const scroll=wikiRailScroll(),list={clientHeight:500,scrollTop:0};
 scroll.render(list,'catalog',true,()=>{});list.scrollTop=420;scroll.capture(list);
 list.clientHeight=0;list.scrollTop=0;scroll.capture(list);
 scroll.render(list,'history:a',false,()=>{});scroll.capture(list);
 scroll.render(list,'catalog',true,()=>{});list.clientHeight=500;scroll.restore(list);
 assert.equal(list.scrollTop,420);
});


const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('pending catalog is unknown until success, including a genuinely empty catalog',async()=>{
 for(const rows of [[page('existing')],[]]){
  const state=wikiCatalogState(),reads=wikiReads(),response=deferred(),paints=[];
  const run=state.load(reads.start('catalog'),()=>response.promise,()=>paints.push({loaded:state.loaded,pending:state.pending,rows:state.rows,error:state.error}),e=>e.message);
  assert.deepEqual(paints,[{loaded:false,pending:true,rows:null,error:''}]);response.resolve(rows);await run;
  assert.deepEqual(paints.at(-1),{loaded:true,pending:false,rows,error:''});
 }
});
test('catalog failure is not an empty success and retry awaits the real rows',async()=>{
 const state=wikiCatalogState(),reads=wikiReads(),changed=()=>{};
 await state.load(reads.start('catalog'),()=>Promise.reject(Error('Unavailable')),changed,e=>e.message);
 assert.equal(state.loaded,false);assert.equal(state.error,'Unavailable');assert.equal(state.pending,false);
 const response=deferred(),run=state.load(reads.start('catalog'),()=>response.promise,changed,e=>e.message);
 assert.equal(state.loaded,false);assert.equal(state.pending,true);assert.equal(state.error,'');response.resolve([page('a')]);await run;assert.deepEqual(state.rows,[page('a')]);
});
test('refresh and failure retain the last successful catalog, even when empty',async()=>{
 for(const rows of [[page('cached')],[]]){
  const state=wikiCatalogState(),reads=wikiReads(),changed=()=>{};
  await state.load(reads.start('catalog'),()=>Promise.resolve(rows),changed,e=>e.message);
  const response=deferred(),run=state.load(reads.start('catalog'),()=>response.promise,changed,e=>e.message);
  assert.equal(state.loaded,true);assert.equal(state.pending,true);assert.equal(state.rows,rows);
  response.reject(Error('Offline'));await run;assert.equal(state.rows,rows);assert.equal(state.loaded,true);assert.equal(state.error,'Offline');
 }
});
test('aborted and superseded catalog reads cannot paint errors or late results',async()=>{
 const state=wikiCatalogState(),reads=wikiReads(),old=deferred(),next=deferred(),paints=[];
 const changed=()=>paints.push({rows:state.rows,error:state.error,pending:state.pending});
 const first=state.load(reads.start('catalog'),()=>old.promise,changed,e=>e.message);
 const second=state.load(reads.start('catalog'),()=>next.promise,changed,e=>e.message);
 next.resolve([page('new')]);await second;const count=paints.length;
 old.resolve([page('stale')]);await first;assert.equal(paints.length,count);assert.deepEqual(state.rows,[page('new')]);
 const last=deferred(),closed=state.load(reads.start('catalog'),()=>last.promise,changed,e=>e.message),beforeClose=paints.length;
 reads.close();last.reject(Error('Aborted'));await closed;assert.equal(paints.length,beforeClose);assert.equal(state.error,'');
});
