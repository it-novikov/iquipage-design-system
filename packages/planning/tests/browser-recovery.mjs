import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
import {startServer} from '../scripts/server.mjs';
const server=await startServer(0),out=new URL('../evidence/recovery/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(12000);const checks=[],errors=[];let failure;
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(server.url+'/?fixture=recovery-'+crypto.randomUUID());
  await page.locator('[data-select]').first().waitFor();
  await page.getByRole('button',{name:'Сроки',exact:true}).click();
  const map=page.locator('iq-roadmap');await map.locator('[data-rm-select]').first().waitFor();
  await map.locator('[data-rm-select="release:pn-release-current"]').first().click();
  await map.getByRole('button',{name:'На день позже',exact:true}).click();
  await map.getByRole('button',{name:'Применить',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'Изменение календарного плана',exact:true});
  await confirm.getByRole('button',{name:'Подтвердить',exact:true}).waitFor();
  await page.evaluate(()=>{const adapter=window.planningFixture.adapter,original=adapter.timeline;let once=true;adapter.timeline=async args=>{if(once){once=false;throw Error('Временный сбой чтения уже сохранённого плана');}return original(args);};});
  await confirm.getByRole('button',{name:'Подтвердить',exact:true}).click();
  await confirm.getByText(/Изменение сохранено, но/).waitFor();
  const saved=await page.evaluate(async()=>{const s=await window.planningFixture.repository.fixtureSnapshot();return {date:s.releases.find(r=>r.id==='pn-release-current').planningStart,receipts:s._pnFixture.filter(x=>x.kind==='receipt').length};});
  assert.equal(saved.date,'2026-09-15');assert.equal(saved.receipts,1);
  await confirm.getByRole('button',{name:'Закрыть',exact:true}).click();
  await confirm.waitFor({state:'hidden'});
  // Native close queues the DS iq-close event; wait for the documented lifecycle, not a timer.
  await page.waitForFunction(()=>document.querySelectorAll('iq-dialog').length===0);
  assert.equal(await page.evaluate(()=>window.planningFixture.view.readyToLeave()),true,'Committed read failure must not trap the user in a dirty preview');
  await page.getByRole('button',{name:'Обновить план',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('iq-roadmap').data.rows.find(r=>r.id==='release:pn-release-current')?.start==='2026-09-15');
  assert.equal(await page.evaluate(async()=> (await window.planningFixture.repository.fixtureSnapshot())._pnFixture.filter(x=>x.kind==='receipt').length),1);
  assert.equal(await map.getByRole('button',{name:'На день позже',exact:true}).isEnabled(),true,'Refreshed DS has no stale conflict or draft');
  checks.push('Committed calendar update survives failed refresh; close is not rollback, retry reads without another effect');
  assert.deepEqual(errors,[]);
}catch(error){failure=error;console.error(error);await page.screenshot({path:new URL('failure.png',out).pathname});}
finally{await writeFile(new URL('report.json',out),JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.stack},null,2));await browser.close();await server.close();}
if(failure)process.exitCode=1;else console.log('PASS calendar committed-result recovery');
