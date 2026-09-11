import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],api=await referenceServer({after:fn=>cleanup.push(fn)}),out='output/playwright/ds-v3',checks=[],errors=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1100,height:850}});page.on('pageerror',e=>errors.push(e.message));let failure;
try{
 await page.route('**/__ux-v3-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="/dist/vendor/iquipage.css"></head><body><main><iq-image-crop></iq-image-crop><iq-markdown-viewer></iq-markdown-viewer></main></body></html>'}));
 await page.goto(api.base+'/__ux-v3-fixture');
 await page.evaluate(async()=>{const api=await import('/dist/vendor/advanced.js');api.registerAdvanced();});
 const crop=page.locator('iq-image-crop');await crop.evaluate(async el=>{const c=document.createElement('canvas');c.width=900;c.height=600;c.getContext('2d').fillRect(0,0,900,600);const blob=await new Promise(r=>c.toBlob(r));await el.load(new File([blob],'test.png',{type:'image/png'}));});
 assert.equal(await crop.evaluate(el=>el.aspectRatio),1);const square=await crop.evaluate(el=>el.value);assert.equal(square.width,square.height);
 for(const ratio of [1,2.4,.5]){
  const result=await crop.evaluate(async(el,ratio)=>{el.aspectRatio=ratio;const b=await el.export({size:1024}),image=await createImageBitmap(b);return {ratio:el.value.width/el.value.height,w:image.width,h:image.height,source:el.source.size};},ratio);
  assert.ok(Math.abs(result.ratio-ratio)<.0001);assert.equal(Math.max(result.w,result.h),1024);assert.ok(Math.abs(result.w/result.h-ratio)<.01);
 }
 assert.ok(await crop.evaluate(el=>{try{el.aspectRatio=0;return false;}catch{return true;}}));await crop.evaluate(el=>el.setAttribute('aspect-ratio','broken'));assert.equal(await crop.evaluate(el=>el.aspectRatio),1);
 await crop.evaluate(el=>{el.aspectRatio=2.4;el.controlled=true;window.cropRequests=[];el.addEventListener('iq-crop-request',e=>window.cropRequests.push(e.detail));});await crop.locator('[data-crop-action=apply]').click();await page.waitForFunction(()=>window.cropRequests.length===1);
 assert.equal(await crop.evaluate(el=>el.pending),true);await crop.evaluate(el=>el.aspectRatio=1);assert.equal(await page.evaluate(()=>window.cropRequests[0].accept()),false);
 await crop.locator('[data-crop-action=apply]').click();await page.waitForFunction(()=>window.cropRequests.length===2);assert.equal(await page.evaluate(()=>window.cropRequests[1].accept()),true);assert.equal(await page.evaluate(()=>window.cropRequests[1].accept()),false);
 checks.push('Square compatibility, rectangular/portrait export bound, invalid ratios, controlled cancellation and single acceptance');
 const viewer=page.locator('iq-markdown-viewer');
 const md='## Контекст\r\n\r\n- [ ] Первый\r\n- [x] Второй\r\n\r\n```md\r\n- [ ] Не задача\r\n```\r\n\r\n- [ ] Третий';
 await viewer.evaluate((el,md)=>el.value=md,md);assert.equal(await viewer.getByRole('checkbox').count(),0);
 await viewer.evaluate(el=>{el.interactiveTasks=true;window.toggleRequests=[];el.addEventListener('iq-task-toggle',e=>window.toggleRequests.push(e.detail));});assert.equal(await viewer.getByRole('checkbox').count(),3);
 await viewer.getByRole('checkbox',{name:'Третий',exact:true}).click();const request=await page.evaluate(()=>window.toggleRequests[0]);assert.equal(request.source,md);assert.equal(request.value,md.replace('- [ ] Третий','- [x] Третий'));assert.equal(await viewer.evaluate(el=>el.value),md);
 await viewer.evaluate(el=>{el.value=window.toggleRequests[0].value;});assert.equal(await viewer.getByRole('checkbox',{name:'Третий',exact:true}).getAttribute('aria-checked'),'true');
 checks.push('Shared viewer is passive by default; opt-in toggles exact Markdown position, excludes fenced code and preserves CRLF');
 await page.evaluate(async()=>{
  const {copyAtButton}=await import('/dist/vendor/core.js');
  document.querySelector('main').insertAdjacentHTML('beforeend','<button type="button" id="copy-default" class="iq-btn ghost icon sm" aria-label="Копировать">D</button><button type="button" id="copy-neutral" class="iq-btn ghost icon sm" data-copy-tone="neutral" aria-label="Копировать нейтрально">N</button>');
  window.copyFixture=copyAtButton;
 });
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 for(const theme of ['light','dark']){
  await page.evaluate(async theme=>{document.documentElement.dataset.theme=theme;await Promise.all(['copy-default','copy-neutral'].map(id=>window.copyFixture(document.getElementById(id),'Проверка копирования')));},theme);
  await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
  const colors=await page.locator('#copy-default,#copy-neutral').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));assert.notEqual(colors[0],colors[1]);assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Проверка копирования');
 }
 checks.push('Neutral copy is additive in both themes; default success appearance and clipboard remain intact');
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:out+'/'+theme+'.png',fullPage:true});}
 assert.deepEqual(errors,[]);console.log('PASS',checks.join('; '));
}catch(error){failure=error;console.error(error);await page.screenshot({path:out+'/failure.png'});}
finally{await writeFile(out+'/report.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.stack},null,2));await browser.close();for(const fn of cleanup.reverse())await fn();}
if(failure)process.exitCode=1;
