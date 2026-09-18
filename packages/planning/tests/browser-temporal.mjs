import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
import {startServer} from '../scripts/server.mjs';
const server=await startServer(0),out=new URL('../evidence/temporal/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(12000);const checks=[],errors=[];let failure;
page.on('pageerror',e=>errors.push(e.message));const mark=label=>{checks.push(label);console.log('PASS',label);};
try {
  await page.goto(server.url+'/?fixture=time-'+crypto.randomUUID());await page.locator('[data-select]').first().waitFor();
  await page.getByRole('button',{name:'Сроки',exact:true}).click();
  const roadmap=page.locator('iq-roadmap');await roadmap.locator('[data-rm-select]').first().waitFor();
  const initial=await page.evaluate(()=>document.querySelector('iq-roadmap').data);
  assert.ok(initial.rows.some(r=>r.id==='release:pn-release-current'));assert.ok(initial.rows.some(r=>r.entityKind==='task'&&!r.start));
  await roadmap.locator('[data-rm-select="release:pn-release-current"]').first().click();
  await roadmap.getByRole('button',{name:'На день позже',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.planningFixture.view.readyToLeave()),false);
  await roadmap.getByRole('button',{name:'Применить',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'Изменение календарного плана',exact:true});
  await confirm.getByRole('button',{name:'Подтвердить',exact:true}).click();await confirm.waitFor({state:'hidden'});
  const after=await page.evaluate(async()=>window.planningFixture.repository.fixtureSnapshot());
  assert.equal(after.releases.find(r=>r.id==='pn-release-current').planningStart,'2026-09-15');
  assert.equal(after.tasks.find(t=>t.id==='pn-task-1').planningStart,'2026-09-15');
  mark('Existing DS roadmap moves release interval through preview/commit without shifting task dates');
  await page.getByRole('button',{name:'Отметить событие',exact:true}).click();
  const milestone=page.getByRole('dialog',{name:'Отметить событие',exact:true});await milestone.locator('input[name=title]').fill('Демонстрация клиентам');
  await milestone.locator('iq-date-field').evaluate(el=>el.value='2026-09-28');
  await milestone.getByRole('button',{name:'Проверить изменения',exact:true}).click();
  await milestone.getByRole('button',{name:'Подтвердить',exact:true}).click();await milestone.waitFor({state:'hidden'});
  await roadmap.getByRole('button',{name:/Демонстрация клиентам/}).first().waitFor();
  assert.equal(await page.evaluate(async()=> (await window.planningFixture.repository.fixtureSnapshot()).tasks.length),12);
  mark('Milestone persists as a planning object, not another task');
  await page.getByRole('button',{name:'Зависимость',exact:true}).click();
  const dep=page.getByRole('dialog',{name:'Новая зависимость',exact:true});
  await dep.getByRole('combobox',{name:'Предшествующая задача',exact:true}).fill('SPR-2');await dep.getByRole('option',{name:/SPR-2 ·/}).click();
  await dep.getByRole('combobox',{name:'Зависимая задача',exact:true}).fill('SPR-3');await dep.getByRole('option',{name:/SPR-3 ·/}).click();
  await dep.getByRole('button',{name:'Проверить изменения',exact:true}).click();await dep.getByRole('button',{name:'Подтвердить',exact:true}).click();await dep.waitFor({state:'hidden'});
  const edges=await page.evaluate(async()=>{const s=await window.planningFixture.repository.fixtureSnapshot();return {links:s.taskLinks,temporal:s._pnFixture.filter(x=>x.kind==='constraint'&&!x.removed)};});
  assert.equal(edges.temporal.length,1);assert.equal(edges.temporal[0].relationId,edges.links[0].id);
  assert.equal(edges.links[0].fromId,'pn-task-3');mark('Calendar dependency references the same business task relation and persists through its command');
  await page.getByRole('button',{name:'Календарь',exact:true}).click();await page.locator('iq-plan').waitFor();
  await page.locator('iq-plan').getByRole('button',{name:/Демонстрация клиентам/}).waitFor();
  await page.reload();await page.locator('iq-plan').waitFor();
  await page.getByRole('button',{name:'Гант',exact:true}).click();await roadmap.locator('[data-rm-select]').first().waitFor();
  await roadmap.locator('[data-rm-select="task:pn-task-2"]').first().click();
  await roadmap.getByRole('button',{name:'На день позже',exact:true}).click();
  await roadmap.getByRole('button',{name:'Отменить',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.planningFixture.view.readyToLeave()),true);
  mark('Calendar shares stored milestones, remembers its view and cancelled interval preview never writes');
  for(const width of [1440,390])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:new URL(`${theme}-${width}.png`,out).pathname});
  }
  assert.deepEqual(errors,[]);mark('DS timeline and agenda render in both themes and narrow layout without page errors');
} catch(error){failure=error;console.error(error);await page.screenshot({path:new URL('failure.png',out).pathname});}
finally{await writeFile(new URL('report.json',out),JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.stack},null,2));await browser.close();await server.close();}
if(failure)process.exitCode=1;
