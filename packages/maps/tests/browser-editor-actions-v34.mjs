import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],checks=[],errors=[],api=await referenceServer({after:fn=>cleanup.push(fn)}),out='output/playwright/editor-actions-v34';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
const settled=()=>page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
const mark=s=>{checks.push(s);console.log('PASS',s);};
let failure;
try{
 await page.route('**/__editor-actions',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="stylesheet" href="/dist/vendor/iquipage.css"><style>main{max-width:680px;margin:24px auto;padding:16px}iq-markdown-editor{margin-block:16px}</style><main><button class="iq-btn" id="outside">Снаружи</button><iq-markdown-editor id="early" label="Обсуждение" submit-label="Опубликовать" maxlength="20000"></iq-markdown-editor><iq-markdown-editor id="default" label="Описание"></iq-markdown-editor></main></html>'}));
 await page.goto(api.base+'/__editor-actions');
 await page.evaluate(async()=>{
  const early=document.querySelector('#early');early.density='compact';early.footerActions=[{id:'decision',label:'Требует решения',pressed:false,tone:'warning'}];
  (await import('/dist/vendor/core.js')).registerCore();early.value='Черновик';document.querySelector('#default').value='Черновик';
  window.intent=[];window.acceptActions=false;window.inputIdentity=early.querySelector('textarea');
  early.addEventListener('iq-editor-action',e=>{window.intent.push(e.detail);if(window.acceptActions)early.footerActions=early.footerActions.map(a=>a.id===e.detail.id?{...a,pressed:e.detail.pressed}:a);});
 });
 const editor=page.locator('#early'),normal=page.locator('#default'),action=editor.getByRole('button',{name:'Требует решения',exact:true}),input=editor.getByRole('textbox');
 await settled();assert.equal(await editor.evaluate(el=>el.density),'compact');assert.equal(await normal.evaluate(el=>el.density),'comfortable');
 assert.ok((await editor.boundingBox()).height<(await normal.boundingBox()).height);assert.equal(await editor.locator('[data-md]').count(),17);
 assert.equal(await editor.locator('.md-hint').isVisible(),false);assert.equal(await normal.locator('.md-hint').isVisible(),true);
 assert.ok(await action.isVisible());await action.click();assert.equal(await action.getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>window.intent.length),1);
 await page.evaluate(()=>window.acceptActions=true);await action.focus();await page.keyboard.press('Space');assert.equal(await action.getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Enter');assert.equal(await action.getAttribute('aria-pressed'),'false');await page.keyboard.press('Enter');assert.equal(await action.getAttribute('aria-pressed'),'true');
 const identity=await editor.evaluate(el=>{window.actionIdentity=el.querySelector('[data-editor-action]');const copy=el.footerActions;copy[0].pressed=false;return el.footerActions[0].pressed;});assert.equal(identity,true);
 await editor.evaluate(el=>el.footerActions=el.footerActions.map(a=>({...a,label:'Нужно решение'})));assert.ok(await editor.evaluate(el=>el.querySelector('[data-editor-action]')===window.actionIdentity));assert.equal(await page.evaluate(()=>window.intent.length),4);
 const invalid=await editor.evaluate(el=>[null,{},[{id:undefined,label:'X',pressed:false}],[{id:'x',label:'X',pressed:'yes'}],[{id:'x',label:'X',pressed:false,tone:'red'}],[{id:'x',label:'X',pressed:false},{id:'x',label:'Y',pressed:false}]].map(value=>{try{el.footerActions=value;return false;}catch{return true;}}));assert.ok(invalid.every(Boolean));
 await editor.evaluate(el=>{el.footerActions=[{id:'decision',label:'Требует решения',pressed:false,tone:'warning'}];el.density='comfortable';el.density='compact';});assert.ok(await editor.evaluate(el=>el.querySelector('textarea')===window.inputIdentity));assert.equal(await input.inputValue(),'Черновик');
 assert.equal(await editor.evaluate(el=>{try{el.density='tiny';return false;}catch{return true;}}),true);
 await editor.evaluate(el=>el.setAttribute('density','invalid'));assert.equal(await editor.evaluate(el=>el.density),'comfortable');await editor.evaluate(el=>el.density='compact');
 mark('Pre-upgrade public properties, validated copied actions, controlled intent, keyboard activation and stable textarea/button identity');
 for(const prop of ['disabled','readOnly']){
  await editor.evaluate((el,prop)=>el[prop]=true,prop);assert.ok(await action.isDisabled());const count=await page.evaluate(()=>window.intent.length);await action.dispatchEvent('click');assert.equal(await page.evaluate(()=>window.intent.length),count);await editor.evaluate((el,prop)=>el[prop]=false,prop);
 }
 await editor.evaluate(el=>el.footerActions=el.footerActions.map(a=>({...a,disabled:true})));assert.ok(await action.isDisabled());await input.fill('Обновление не разблокирует действие');assert.ok(await action.isDisabled());await editor.evaluate(el=>el.footerActions=el.footerActions.map(a=>({...a,disabled:false})));
 await editor.evaluate(el=>el.footerActions=[{id:'safe',label:'<img src=x onerror=alert(1)>',pressed:false}]);assert.equal(await editor.locator('.md-footer-actions img').count(),0);
 await editor.evaluate(el=>el.footerActions=[{id:'decision',label:'Требует решения',pressed:false,tone:'warning'}]);
 const motion=await action.evaluate(el=>{el.click();return el.getAnimations().map(a=>a.effect.getTiming().duration);});assert.ok(motion.includes(230));await settled();
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await action.evaluate(el=>{el.click();return el.getAnimations().filter(a=>a.playState==='running').length;}),0);await page.emulateMedia({reducedMotion:'no-preference'});
 mark('Readonly/disabled actions reject activation, labels are text-only and feedback honors reduced motion');
 await input.fill('Чек-лист');await editor.getByRole('button',{name:'Чек-лист',exact:true}).click();assert.match(await input.inputValue(),/- \[ \]/);await editor.getByRole('button',{name:'Отменить',exact:true}).click();assert.equal(await input.inputValue(),'Чек-лист');
 for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const pressed of [false,true]){
   await editor.evaluate((el,pressed)=>{el.value='Короткий комментарий';el.footerActions=[{id:'decision',label:'Требует решения',pressed,tone:'warning'}];},pressed);await settled();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const boxes=await editor.locator('.md-footer-actions>button,[data-md-submit]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));assert.ok(boxes.every(r=>r.height>=34&&r.width>=24));
   if(width>=390)assert.ok(Math.abs(boxes[0].y-boxes[1].y)<2,JSON.stringify({width,boxes}));
   await editor.screenshot({path:out+'/'+width+'-'+theme+'-'+(pressed?'selected':'normal')+'.png'});
  }
  await editor.evaluate(el=>{el.value='Длинная строка '.repeat(1000);el.footerActions=[{id:'long',label:'Очень длинное действие для проверки переноса в компактном редакторе',pressed:true}];});await settled();assert.ok(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth));assert.ok(await input.evaluate(el=>el.scrollHeight>el.clientHeight));
 }
 mark('All Markdown tools and undo retained; short/long content, both themes and 320/390/768/1440 layouts without overflow');
 await page.setViewportSize({width:1440,height:900});await editor.evaluate(el=>{el.value='Короткое описание';el.footerActions=[];el.removeAttribute('submit-label');el.previewOnBlur=true;el.previewMode=true;});await settled();
 assert.equal(await editor.locator('.md-editor-head').isVisible(),false);assert.equal(await editor.locator('footer').isVisible(),false);await editor.getByText('Короткое описание',{exact:true}).click();assert.equal(await editor.evaluate(el=>el.previewMode),false);await page.locator('#outside').click();assert.equal(await editor.evaluate(el=>el.previewMode),true);
 await editor.screenshot({path:out+'/description-preview.png'});
 await editor.evaluate(el=>el.remove());await page.locator('#outside').click();assert.deepEqual(errors,[]);mark('Compact description has no duplicate header/footer; preview/edit/outside click and cleanup still work');
}catch(error){failure=error;console.error(error);await page.screenshot({path:out+'/failure.png'});}
finally{await writeFile(out+'/report.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.stack},null,2));await browser.close();for(const fn of cleanup.reverse())await fn();}
if(failure)process.exitCode=1;
