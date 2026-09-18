import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
import {startServer} from '../scripts/server.mjs';
const server=await startServer(0),out=new URL('../evidence/list-interactions/',import.meta.url);
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1400}});page.setDefaultTimeout(12000);
const checks=[],errors=[];let failure;page.on('pageerror',e=>errors.push(e.message));
const mark=text=>{checks.push(text);console.log('PASS',text);};
async function startDrag(id,selector){
  const source=page.locator(`[data-work-drag="${id}"]`),target=page.locator(selector);
  await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await target.boundingBox();
  assert.ok(a&&b);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+Math.min(12,b.height/4),{steps:14});
  await page.locator('[data-work-dragging]').waitFor();
}
const snapshot=()=>page.evaluate(()=>window.planningFixture.repository.fixtureSnapshot());
const idle=()=>page.waitForFunction(()=>document.querySelectorAll('iq-dialog').length===0&&!document.querySelector('[data-work-dragging]'));
try{
  await page.goto(server.url+'/?fixture=list-'+crypto.randomUUID());await page.locator('[data-work-drag="pn-task-2"]').waitFor();
  const original=await snapshot();
  await startDrag('pn-task-2','[data-group="pn-release-next"] .pn-group-header');
  await page.keyboard.press('Escape');await page.mouse.up();await idle();
  assert.equal((await snapshot()).tasks.find(t=>t.id==='pn-task-2').revision,original.tasks.find(t=>t.id==='pn-task-2').revision);
  assert.equal(await page.locator('.iq-list-drag-ghost').count(),0);mark('Escape cancels pointer drag with no write and removes overlay');
  await startDrag('pn-task-2','[data-group="pn-release-next"] .pn-group-header');await page.mouse.up();
  let dialog=page.getByRole('dialog',{name:'Изменение состава',exact:true});await dialog.getByRole('button',{name:'Подтвердить',exact:true}).waitFor();
  assert.equal((await snapshot()).tasks.find(t=>t.id==='pn-task-2').revision,original.tasks.find(t=>t.id==='pn-task-2').revision);
  await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();await idle();
  const moved=(await snapshot()).tasks.find(t=>t.id==='pn-task-2');assert.equal(moved.releaseId,'pn-release-next');assert.equal(moved.status,'review');assert.equal(moved.parentId,'pn-task-1');
  mark('Pointer transfer previews active scope and preserves task identity, parent and workflow');
  await page.locator('[data-work-drag="pn-task-2"]').focus();await page.keyboard.press('Space');await page.keyboard.press('Home');await page.keyboard.press('Enter');
  dialog=page.getByRole('dialog',{name:'Изменение состава',exact:true});await dialog.getByRole('button',{name:'Подтвердить',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Отмена',exact:true}).click();await idle();assert.equal((await snapshot()).tasks.find(t=>t.id==='pn-task-2').releaseId,'pn-release-next');
  mark('Keyboard drag reaches the same guarded command; cancellation preserves scope');
  await page.locator('.pn-scroll').evaluate(el=>el.scrollTop=0);
  await startDrag('pn-task-4','[data-work-row="pn-task-3"]');await page.mouse.up();
  dialog=page.getByRole('dialog',{name:'Порядок задач',exact:true});await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();await idle();
  const ordered=await snapshot();assert.ok(ordered.tasks.find(t=>t.id==='pn-task-4').planningRank<ordered.tasks.find(t=>t.id==='pn-task-3').planningRank);
  assert.equal(ordered.tasks.find(t=>t.id==='pn-task-4').parentId,'pn-task-1');mark('Manual reorder only changes planning ranks among siblings');
  await page.locator('[data-select="pn-task-4"]').check();await page.getByRole('button',{name:'Порядок…',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Порядок задач',exact:true});await dialog.getByRole('combobox',{name:'Положение в списке',exact:true}).fill('конец');
  await dialog.getByRole('option',{name:'В конец задач этого уровня',exact:true}).click();
  await dialog.getByRole('button',{name:'Проверить изменения',exact:true}).click();await dialog.getByRole('button',{name:'Подтвердить',exact:true}).click();await idle();
  const alternative=await snapshot();assert.ok(alternative.tasks.find(t=>t.id==='pn-task-3').planningRank<alternative.tasks.find(t=>t.id==='pn-task-4').planningRank);
  mark('Single-pointer order dialog changes the same rank without dragging');
  await page.locator('[data-sort]').getByRole('combobox').click();await page.getByRole('option',{name:'По приоритету',exact:true}).click();
  await page.locator('[data-work-drag="pn-task-4"]').waitFor();const count=(await snapshot())._pnFixture.filter(x=>x.kind==='receipt').length;
  await startDrag('pn-task-4','[data-work-row="pn-task-3"]');await page.mouse.up();await idle();
  assert.equal((await snapshot())._pnFixture.filter(x=>x.kind==='receipt').length,count);mark('Automatic sorting rejects deceptive same-group reorder');
  assert.deepEqual(errors,[]);await page.screenshot({path:new URL('list.png',out).pathname});
}catch(error){failure=error;console.error(error);await page.screenshot({path:new URL('failure.png',out).pathname});}
finally{await writeFile(new URL('report.json',out),JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.stack},null,2));await browser.close();await server.close();}
if(failure)process.exitCode=1;
