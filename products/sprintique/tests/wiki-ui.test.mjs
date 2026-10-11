import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wikiRoute,wikiHash,wikiTree,wikiAncestors,wikiParents,wikiDraft,wikiReads} from '../web/wiki-model.js';
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
