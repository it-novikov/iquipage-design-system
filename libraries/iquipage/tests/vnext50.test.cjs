const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../src/styles/foundation.css'),'utf8'),component=fs.readFileSync(path.join(__dirname,'../src/modules/components.js'),'utf8');
test('menu sizing targets the actual popup on narrow or coarse input while retaining desktop density',()=>{
 const cls=component.match(/this\.popup\.classList\.add\('iq-popup', '([^']+)'\)/)[1];assert.equal(cls,'iq-menu-popup');
 const base=css.match(new RegExp('\\.'+cls+' button\\{([^}]+)\\}'))[1];assert.match(base,/min-height:40px/);
 const media=css.slice(css.indexOf('@media(pointer:coarse),(max-width:720px)'));assert.match(media,new RegExp('\\.'+cls+' button,[^{]+\\{min-height:44px;min-width:44px\\}'));
});

test('public document and dialog controls share the same touch floor without widening desktop rules',()=>{const media=css.slice(css.indexOf('@media(pointer:coarse),(max-width:720px)'));assert.match(media,/:is\(\.iq-document-bar,\.iq-document-rail,\.iq-dialog\) \.iq-btn\{min-height:44px;min-width:44px\}/);const before=css.slice(0,css.indexOf('@media(pointer:coarse),(max-width:720px)'));assert.doesNotMatch(before,/:is\(\.iq-document-bar,\.iq-document-rail,\.iq-dialog\) \.iq-btn/);});
