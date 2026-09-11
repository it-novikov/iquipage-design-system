import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],checks=[],errors=[];let browser,page,failure,releaseHeld;
const api=await referenceServer({after:fn=>cleanup.push(fn)});
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
const images=await Promise.all(['#34758b','#b3795d','#5c6aab'].map(background=>sharp({create:{width:720,height:360,channels:3,background}}).png().toBuffer()));
const mark=name=>{checks.push(name);console.log('PASS',name);};
const panel=()=>page.locator('.task-edit-dialog dialog[open]').last();
const records=()=>page.evaluate(()=>window.mapsDemo.repository.list('tasks',window.mapsDemo.project.id));
const choose=async(name,index)=>panel().locator('[data-cover-input]').setInputFiles({name,mimeType:'image/png',buffer:images[index]});
const ready=async name=>panel().locator('[data-file-row][data-state=ready]').filter({hasText:name}).waitFor();
const selected=()=>panel().locator('[data-file-cover][aria-pressed=true]');
const save=async()=>{await panel().getByRole('button',{name:'Сохранить задачу',exact:true}).click();await page.locator('.task-edit-dialog').waitFor({state:'detached'});};
await mkdir('artifacts/cover-finish',{recursive:true});
try{
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());return !['http:','https:'].includes(url.protocol)||url.origin===api.base?route.continue():route.abort();});
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(api.base+'/?project=cover-final-'+Date.now()+'#tasks');
  await page.getByRole('button',{name:'Новая задача',exact:true}).click();
  await panel().getByLabel('Название',{exact:true}).fill('Обложка: последнее действие');
  await choose('initial.png',0);await ready('initial.png');await save();
  let task=(await records()).find(item=>item.title==='Обложка: последнее действие');
  const originalId=task.coverAttachmentId;
  await page.getByRole('button',{name:task.title,exact:true}).click();
  await panel().locator('.task-detail-cover[data-state=ready]').waitFor();await ready('initial.png');
  await panel().locator('[data-remove-cover]').click();
  assert.equal(await selected().count(),0,'Removing a cover must clear the attachment pressed state');
  assert.ok(!(await panel().locator('[data-file-status]').allTextContents()).some(text=>text.includes('Обложка')));
  mark('removing a cover synchronizes the attachment label and pressed state immediately');
  await panel().locator(`[data-file-cover="${originalId}"]`).click();await save();
  async function holdUpload(name){
    let received;const started=new Promise(resolve=>received=resolve);
    const gate=new Promise(resolve=>releaseHeld=resolve);
    await context.route('**/api/files/**',async route=>{
      if(route.request().method()==='PUT'&&new URL(route.request().url()).searchParams.get('name')===name){
        const response=await route.fetch();received();await gate;await route.fulfill({response});
      }else await route.continue();
    });
    return {started,release:()=>{releaseHeld();releaseHeld=null;}};
  }
  await page.getByRole('button',{name:task.title,exact:true}).click();await ready('initial.png');
  const delayed=await holdUpload('earlier.png');await choose('earlier.png',1);await delayed.started;
  await choose('latest.png',2);await ready('latest.png');
  const latestId=await panel().locator('[data-file-row]').filter({hasText:'latest.png'}).getAttribute('data-file-row');
  delayed.release();await ready('earlier.png');
  assert.equal(await selected().getAttribute('data-file-cover'),latestId,'An older upload response must not overwrite a later cover selection');
  await save();task=(await records()).find(item=>item.id===task.id);assert.equal(task.coverAttachmentId,latestId);
  mark('two concurrent replacements respect selection order instead of response order');
  await context.unroute('**/api/files/**');
  await page.getByRole('button',{name:task.title,exact:true}).click();await ready('latest.png');
  const removing=await holdUpload('late-after-remove.png');await choose('late-after-remove.png',1);await removing.started;
  await panel().locator('[data-remove-cover]').click();removing.release();await ready('late-after-remove.png');
  assert.equal(await selected().count(),0,'Explicit removal must supersede an in-flight replacement');
  assert.equal(await panel().locator('.task-detail-cover').count(),0);await save();
  task=(await records()).find(item=>item.id===task.id);assert.equal(task.coverAttachmentId,null);
  mark('explicit removal wins over an earlier pending upload while preserving the attachment');
  await context.unroute('**/api/files/**');
  await page.getByRole('button',{name:task.title,exact:true}).click();await ready('initial.png');
  const selecting=await holdUpload('late-after-select.png');await choose('late-after-select.png',2);await selecting.started;
  await panel().locator(`[data-file-cover="${originalId}"]`).click();selecting.release();await ready('late-after-select.png');
  assert.equal(await selected().getAttribute('data-file-cover'),originalId);await save();
  mark('choosing an existing attachment supersedes an earlier pending replacement');
  await context.unroute('**/api/files/**');
  await page.locator('.task-card-cover[data-state=ready]').waitFor();
  // Actual pointer gesture with normal motion: cover clicks are not drag handles.
  const handle=page.getByRole('button',{name:'Переместить задачу: '+task.title,exact:true});
  const start=await handle.boundingBox(),column=await page.locator('[data-drop-status="in_progress"]').boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
  await page.mouse.move(column.x+column.width/2,column.y+160,{steps:18});await page.mouse.up();
  await page.waitForFunction(id=>document.querySelector(`[data-drop-status="in_progress"] [data-drag-id="${id}"]`),task.id);
  await page.locator(`[data-drag-id="${task.id}"] .task-card-cover[data-state=ready]`).waitFor();
  assert.equal((await records()).find(item=>item.id===task.id).coverAttachmentId,originalId);
  mark('normal-motion pointer DnD preserves the selected cover and renders it in the new column');
  await page.screenshot({path:'artifacts/cover-finish/board-final-light.png'});
  await page.evaluate(async id=>{
    const {openTaskDialog}=await import('/src/board/task-dialog.js');
    const {repository,project}=window.mapsDemo;
    const tasks=await repository.list('tasks',project.id);
    await openTaskDialog(tasks.find(item=>item.id===id),{repository,project,tasks,canEdit:false,attachmentAdapter:null});
  },task.id);
  assert.match(await panel().locator('[data-cover-status]').textContent(),/не подключено/i);
  assert.equal(await panel().locator('[data-add-cover]').count(),0);
  await panel().locator('.iq-dialog-head [data-close]').click();
  mark('a host without an attachment adapter presents an explicit unavailable state, not endless loading');
  await context.route('**/api/files/*/display?*',route=>route.fulfill({status:200,contentType:'image/webp',body:'invalid raster bytes'}));
  await page.getByRole('button',{name:task.title,exact:true}).click();
  await panel().locator('.task-detail-cover[data-state=unavailable]').waitFor();
  assert.equal(await panel().locator('[data-preview-cover]').isDisabled(),true);
  assert.match(await panel().locator('[data-cover-status]').textContent(),/недоступна/i);
  assert.equal((await records()).find(item=>item.id===task.id).coverAttachmentId,originalId);
  mark('undecodable display bytes show a recoverable state and preserve the saved cover');
  await panel().locator('.iq-dialog-head [data-close]').click();
  await context.unroute('**/api/files/*/display?*');
  assert.deepEqual(errors,[]);mark('no JavaScript errors during cover final acceptance');
}catch(error){failure=error;console.error(error);await page?.screenshot({path:'artifacts/cover-finish/failure.png'}).catch(()=>{});}
finally{
  releaseHeld?.();await browser?.close();for(const fn of cleanup.reverse())await fn();
  await writeFile('artifacts/cover-finish/browser.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.message},null,2));
}
if(failure)process.exitCode=1;
