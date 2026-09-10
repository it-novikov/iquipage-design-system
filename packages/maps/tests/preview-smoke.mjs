// Offline file acceptance: a fresh browser profile, synthetic content, no network.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const modulePath=process.env.MAPS_PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
await context.route(/^https?:/,route=>route.abort());
let failure;
try{
  await page.goto(pathToFileURL(path.resolve(process.env.MAPS_PREVIEW_PATH||'preview.html')).href);
  await page.locator('.kanban-column').first().waitFor({timeout:10000});
  assert.equal(await page.locator('.kanban-column').count(),6);
  await page.getByRole('link',{name:'Карты',exact:true}).click();
  await page.locator('iq-whiteboard .wb-stage').waitFor();
  assert.equal(await page.evaluate(()=>window.mapsDemo.feature.repository.capabilities.storage),'browser');
  await page.getByRole('button',{name:'Шаблоны',exact:true}).click();
  await page.getByRole('heading',{name:'С чего начнём?'}).waitFor();
  assert.equal(await page.locator('.map-template-preview svg').count(),16);
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
}catch(e){failure=e;}finally{
  await mkdir('artifacts/r3',{recursive:true});await page.screenshot({path:'artifacts/r3/offline-preview.png'});
  await writeFile('artifacts/r3/preview-report.json',JSON.stringify({status:failure?'FAIL':'PASS',browser:browser.version(),checks:['file entry','six columns','browser storage','maps navigation','16 previews','no external requests'],errors,network,error:failure?.message},null,2));
  await browser.close();
}
if(failure)throw failure;console.log('PASS offline preview: file entry, browser storage, templates and no external requests');
