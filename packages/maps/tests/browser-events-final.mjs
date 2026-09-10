// Browser acceptance for event configuration and the delivery journal.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const origin=new URL(process.env.MAPS_TEST_URL||'http://127.0.0.1:4331').origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const modulePath=process.env.MAPS_PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const project='events-ui-'+Date.now(),modal=()=>page.locator('dialog[open]').last();
const choose=async(name,value)=>{await modal().locator(`iq-select[name="${name}"] .iq-select-trigger`).click();await page.getByRole('option',{name:value,exact:true}).click();};
const mark=name=>{checks.push({name,status:'PASS'});console.log('PASS',name);};
await mkdir('artifacts/final',{recursive:true});let failure;
try{
  await page.goto(origin+'/?project='+project+'#maps');await page.locator('iq-whiteboard').waitFor();
  await page.locator('.map-subbar [data-map-action=start]').click();await page.waitForFunction(()=>window.mapsDemo.feature.current.status==='active');
  await page.locator('.map-toolbar [data-map-action=workflow]').click();
  await modal().getByRole('button',{name:'Добавить сценарий',exact:true}).click();
  await page.locator('.map-subbar [data-map-action=automations]').click();
  await page.getByRole('button',{name:'Добавить правило',exact:true}).click();
  await modal().getByLabel('Название',{exact:true}).fill('Действия после обсуждения');
  await choose('trigger','По событию проекта');
  await choose('eventType','Обсуждение завершено и сохранено');
  await choose('status','Включено');
  await modal().getByRole('button',{name:'Сохранить правило',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  assert.ok(await page.locator('[data-map-action=edit-automation]').count());
  mark('configure enabled closing rule using visible controls');
  await page.locator('.map-subbar [data-map-action=finish]').click();
  await modal().getByLabel('Итоги и следующие шаги',{exact:true}).fill('Обсуждение завершено; действия требуют подтверждения.');
  await modal().getByRole('button',{name:'Сохранить итоги и завершить',exact:true}).click();
  await page.waitForFunction(()=>window.mapsDemo.feature.current.status==='archived');
  await page.locator('.map-subbar [data-map-action=automations]').click();
  await page.getByRole('button',{name:'Доставка событий',exact:true}).click();
  for(let i=0;i<20;i++){
    if(await page.locator('.map-delivery [data-map-action=run-details]').count())break;
    await page.waitForTimeout(250);await page.getByRole('button',{name:'Обновить журнал',exact:true}).click();
  }
  const link=page.locator('.map-delivery [data-map-action=run-details]').first();await link.waitFor();
  const runId=await link.getAttribute('data-run-id');
  assert.ok(await page.locator('.map-delivery').getByText('Передано исполнителю',{exact:true}).isVisible());
  await page.screenshot({path:'artifacts/final/delivery-journal.png'});
  mark('committed session completion appears in persisted delivery journal');
  await link.click();await page.locator('.map-approval-form').waitFor();
  await page.locator('.map-approval-form textarea').fill('Проверенная задача после обсуждения');
  await page.getByRole('button',{name:'Подтвердить и продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Открыть созданные задачи',exact:true}).waitFor();
  const data=await page.evaluate(async id=>{const d=window.mapsDemo;return {tasks:await d.repository.list('tasks',d.project.id),run:await d.repository.read('runs',id,d.project.id)};},runId);
  assert.equal(data.tasks.length,1);assert.equal(data.run.status,'succeeded');assert.equal(data.tasks[0].title,'Проверенная задача после обсуждения');
  assert.equal(data.run.trigger.committed,true);mark('approval creates one local task with committed-event provenance');
  await page.locator('.map-subbar [data-map-action=automations]').click();await page.getByRole('button',{name:'Доставка событий',exact:true}).click();
  await page.locator('#theme').click();await page.screenshot({path:'artifacts/final/delivery-dark.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  assert.ok(await page.getByRole('heading',{name:'Доставка событий',exact:true}).isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'artifacts/final/delivery-mobile.png'});
  mark('delivery journal remains available in dark theme and narrow viewport');
  assert.deepEqual(errors,[]);mark('no browser JavaScript errors');
}catch(e){failure=e;console.error(e);await page.screenshot({path:'artifacts/final/events-failure.png'});}
finally{
  await writeFile('artifacts/final/browser-events.json',JSON.stringify({status:failure?'FAIL':'PASS',browser:browser.version(),checks,errors,error:failure?.message},null,2));
  await browser.close();
}
if(failure)throw failure;
