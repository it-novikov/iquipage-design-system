import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ||= class {};
const {showAccessNotice}=await import('../web/access-notice.js');
test('rights notice is a vertical shell sibling, preserving the existing workspace and preventing duplicates',()=>{
 const old=globalThis.document;let mounted,called=0;const button={};const main={before(node){mounted=node;}};const draft={value:'Несохранённый текст'};const root={querySelector:s=>s==='[data-access-change]'?mounted:s==='.platform-main'?main:null};globalThis.document={createElement:()=>({dataset:{},querySelector:s=>s==='button'?button:null})};
 try{showAccessNotice(root,()=>called++);assert.equal(mounted.dataset.accessChange,'');assert.match(mounted.innerHTML,/Обновить доступ/);assert.match(mounted.innerHTML,/открытой форме/);const first=mounted;showAccessNotice(root,()=>called+=100);assert.equal(mounted,first);button.onclick();assert.equal(called,1);assert.equal(draft.value,'Несохранённый текст');}finally{globalThis.document=old;}
});
