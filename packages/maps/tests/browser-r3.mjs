// Browser acceptance on an isolated local reference server, using synthetic data only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const origin=new URL(process.env.MAPS_TEST_URL||'http://127.0.0.1:4331').origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Only a local test server is allowed');
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[],checks=[],measurements={};
page.on('pageerror',e=>errors.push(e.message));
const project='r3-ui-'+Date.now(),url=origin+'/?project='+project;
await mkdir('artifacts/r3',{recursive:true});
const mark=name=>{checks.push({name,status:'PASS'});console.log('PASS',name);};
const modal=()=>page.locator('dialog[open]').last();
const close=async()=>{await modal().locator('.iq-dialog-head [data-close]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));};
async function choose(scope,name,label){await scope.locator(`iq-select[name="${name}"] .iq-select-trigger`).click();await page.getByRole('option',{name:label,exact:true}).click();}
async function menu(action){await page.locator('.map-toolbar [data-map-action=more]').click();await modal().locator(`[data-map-action="${action}"]`).click();}
const count=()=>page.evaluate(()=>window.mapsDemo.feature.current.document.objects.length);
const settled=()=>page.waitForFunction(()=>!window.mapsDemo.feature.board.dirty&&!window.mapsDemo.feature.savingPromise);
async function shot(name){await page.screenshot({path:`artifacts/r3/${name}.png`});}
let failure;
try{
  await page.goto(url);await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.getByRole('link',{name:'Обзор',exact:true}).count(),0);
  assert.deepEqual(await page.locator('.kanban-column-header h3').allTextContents(),['Готово к работе','В работе','Ревью','Готово к тестированию','Тестирование','Готово к релизу']);
  measurements.tasks=await page.locator('.host-task-board').boundingBox();assert.equal(measurements.tasks.x,24);assert.equal(measurements.tasks.width,1392);
  mark('default task route, six ordered columns, full-width 24px inset');
  await page.getByRole('button',{name:'Новая задача',exact:true}).click();
  await modal().getByLabel('Название',{exact:true}).fill('Проверить интерфейс R3');
  await modal().getByLabel('Ответственный',{exact:true}).fill('Тестовый участник');
  await modal().getByRole('button',{name:'Сохранить задачу',exact:true}).click();
  await page.locator('iq-dialog.map-dialog').waitFor({state:'detached'}); // Native close restores focus before keyboard interaction.
  await page.getByRole('button',{name:'Проверить интерфейс R3',exact:true}).waitFor();
  const handle=page.getByRole('button',{name:'Переместить задачу: Проверить интерфейс R3',exact:true});
  await handle.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await page.locator('[data-drop-status=in_progress] .task-card').waitFor();
  await page.reload();await page.locator('[data-drop-status=in_progress] .task-card').waitFor();
  await shot('tasks-populated');mark('task form, keyboard move and persisted reload');
  await page.getByRole('link',{name:'Карты',exact:true}).click();await page.locator('iq-whiteboard').waitFor();await settled();
  assert.equal(await page.locator('.wb-command-row').isVisible(),false);
  measurements.canvas=await page.locator('.wb-stage').boundingBox();assert.equal(measurements.canvas.x,0);assert.equal(measurements.canvas.width,1440);
  await page.locator('.wb-object[data-type=sticky]').first().click();assert.ok(await page.locator('.wb-context').isVisible());
  await page.keyboard.press('Escape');await shot('map-light');mark('edge-to-edge canvas; idle strip hidden; selected actions retained');
  await menu('help');await modal().locator('summary').click();
  assert.equal(await modal().locator('.map-shortcuts > div').count(),8);
  await modal().locator('.map-dialog-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  measurements.help=await modal().evaluate(el=>{const note=el.querySelector('.map-help-navigation'),prev=note.previousElementSibling;const r=note.getBoundingClientRect(),p=prev.getBoundingClientRect(),body=note.parentElement.getBoundingClientRect();return {above:r.top-p.bottom,below:body.bottom-r.bottom};});
  assert.ok(Math.abs(measurements.help.above-measurements.help.below)<=1,JSON.stringify(measurements.help));
  await shot('help');await close();mark('readable shortcuts and symmetrical navigation-note spacing');
  await page.locator('.map-toolbar [data-map-action=templates]').click();await modal().locator('.map-template-card').first().waitFor();
  const previews=await modal().locator('.map-preview-svg').evaluateAll(nodes=>nodes.map(n=>n.outerHTML));assert.equal(previews.length,16);assert.equal(new Set(previews).size,16);
  const title=await modal().locator('.iq-dialog-head').boundingBox();assert.ok(title.y>=0&&title.y+title.height<900);
  await shot('templates');await modal().getByLabel('Поиск шаблонов',{exact:true}).fill('система');
  assert.ok((await modal().locator('.map-template-card').count())<16);await close();mark('16 distinct data-driven previews; searchable library and visible header');
  const before=await count();await page.locator('.map-toolbar [data-map-action=add]').click();
  await modal().getByLabel('Текст карточки 1',{exact:true}).fill('Пакетная заметка');
  const typeName=await modal().locator('.map-capture-card').nth(1).locator('iq-select').first().getAttribute('name');
  await choose(modal(),typeName,'Задача');await modal().getByLabel('Текст карточки 2',{exact:true}).fill('Пакетная задача');
  await modal().getByLabel('Ответственный',{exact:true}).fill('Команда');
  await choose(modal(),'defaultType','Фигура');await modal().getByRole('button',{name:'Ещё карточка',exact:true}).click();
  await modal().getByLabel('Текст карточки 3',{exact:true}).fill('Проверка решения');
  const shapeName=await modal().locator('iq-select[name^=shape-]').getAttribute('name');await choose(modal(),shapeName,'Решение');
  for(const [i,label] of [[4,'Текст'],[5,'Область'],[6,'Изображение']]){await choose(modal(),'defaultType',label);await modal().getByRole('button',{name:'Ещё карточка',exact:true}).click();await modal().getByLabel('Текст карточки '+i,{exact:true}).fill('Пакет: '+label);}
  await modal().locator('[data-image]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGOMqljAAANMDEgAhQMANdABeANxQ28AAAAASUVORK5CYII=','base64')});
  await modal().locator('.map-capture-image').waitFor();
  await shot('mixed-capture');await modal().getByRole('button',{name:'Добавить объекты',exact:true}).click();
  await page.waitForFunction(n=>window.mapsDemo.feature.current.document.objects.length===n,before+6);await settled();
  const types=await page.evaluate(()=>window.mapsDemo.feature.current.document.objects.slice(-6).map(o=>o.type));assert.deepEqual(types,['sticky','task','shape','text','frame','image']);
  await page.locator('.wb-dock [data-wb-action=undo]').click();await settled();assert.equal(await count(),before);
  await page.locator('.wb-dock [data-wb-action=redo]').click();await settled();assert.equal(await count(),before+6);
  await page.reload();await page.locator('iq-whiteboard').waitFor();await settled();assert.equal(await count(),before+6);mark('mixed card types, actual shape selection, atomic undo/redo and reload');
  await menu('save-template');await modal().getByLabel('Название шаблона',{exact:true}).fill('Проверка команды');
  await modal().getByRole('button',{name:'Сохранить шаблон',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  await page.locator('.map-toolbar [data-map-action=templates]').click();await modal().getByLabel('Поиск шаблонов',{exact:true}).fill('Проверка команды');await modal().locator('.map-template-card').first().waitFor();assert.equal(await modal().locator('.map-template-card').count(),1);await close();mark('custom template persists and is searchable');
  measurements.workflowTab=await page.locator('.map-view-tabs [data-map-action=workflow]').evaluate(el=>{const icon=el.querySelector('svg').getBoundingClientRect(),text=el.querySelector('span').getBoundingClientRect();return {gap:text.left-icon.right,centerDelta:Math.abs((icon.top+icon.bottom-text.top-text.bottom)/2)};});
  assert.equal(measurements.workflowTab.gap,8);assert.ok(measurements.workflowTab.centerDelta<=1);
  await page.locator('.map-toolbar [data-map-action=workflow]').click();await modal().locator('.map-flow-intro li').first().waitFor();assert.equal(await modal().locator('.map-flow-intro li').count(),5);await shot('workflow-intro');
  await modal().getByRole('button',{name:'Добавить сценарий',exact:true}).click();await page.waitForFunction(()=>window.mapsDemo.feature.view==='workflow');
  await page.locator('.map-subbar [data-map-action=run]').click();await modal().getByLabel('Входные заметки — одна на строку',{exact:true}).fill('Проверить одну договорённость');
  await modal().getByRole('button',{name:'Начать',exact:true}).click();await page.getByRole('button',{name:'Подтвердить и продолжить',exact:true}).waitFor();
  await page.getByRole('button',{name:'Подтвердить и продолжить',exact:true}).click();await page.getByRole('heading',{name:'Итог',exact:true}).waitFor();
  let tasks=await page.evaluate(()=>window.mapsDemo.repository.list('tasks',window.mapsDemo.project.id));assert.equal(tasks.length,1);mark('test execution and approval do not create tasks');
  await page.locator('.map-subbar [data-map-action=run]').click();await choose(modal(),'mode','Исполнить — записать подтверждённый результат');
  await modal().getByLabel('Входные заметки — одна на строку',{exact:true}).fill('Создать подтверждённую задачу R3');await modal().getByRole('button',{name:'Начать',exact:true}).click();
  await page.getByRole('button',{name:'Подтвердить и продолжить',exact:true}).click();await page.getByRole('button',{name:'Открыть созданные задачи',exact:true}).waitFor();
  await shot('execution');await page.getByRole('button',{name:'Открыть созданные задачи',exact:true}).click();await page.getByRole('button',{name:'Создать подтверждённую задачу R3',exact:true}).waitFor();
  tasks=await page.evaluate(()=>window.mapsDemo.repository.list('tasks',window.mapsDemo.project.id));assert.equal(tasks.length,2);assert.ok(tasks.find(t=>t.sourceMapId));mark('execution creates one real local task with map provenance');
  await page.getByRole('link',{name:'Карты',exact:true}).click();await page.locator('.map-toolbar [data-map-action=canvas]').click();
  await page.locator('.map-subbar [data-map-action=start]').click();await page.locator('.map-subbar [data-map-action=finish]').click();
  await modal().getByLabel('Итоги и следующие шаги',{exact:true}).fill('Решения проверены; задача создана.');await modal().getByRole('button',{name:'Сохранить итоги и завершить',exact:true}).click();
  await page.waitForFunction(()=>window.mapsDemo.feature.current.status==='archived');assert.ok(await page.locator('iq-whiteboard').evaluate(el=>el.readOnly));
  const archived=await page.evaluate(()=>window.mapsDemo.feature.current.id);await page.locator('.map-subbar [data-map-action=continue]').click();await modal().getByRole('button',{name:'Создать продолжение',exact:true}).click();
  await page.waitForFunction(id=>window.mapsDemo.feature.current.id!==id,archived);assert.equal(await page.evaluate(()=>window.mapsDemo.feature.current.sourceMapId),archived);mark('session archive readonly, persisted summary and independent continuation');
  await page.locator('#theme').click();await shot('map-dark');await page.locator('#theme').click();
  for(const [width,height] of [[1280,720],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.ok(await page.locator('.platform-navigation').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await menu('help');const box=await modal().boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify(box));await shot('help-'+width);await close();await shot('map-'+width);}
  mark('dark theme, short desktop and mobile: bounded dialog and available project navigation');
  await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/?standalone=1&project='+project);await page.locator('iq-whiteboard').waitFor();assert.equal(new URL(page.url()).hash,'#maps');await shot('standalone');mark('standalone starts with maps rather than the host task board');
  assert.deepEqual(errors,[]);mark('no browser JavaScript errors');
}catch(error){failure=error;checks.push({name:'browser regression',status:'FAIL',error:error.message});await shot('failure');console.error(error);}
finally{await writeFile('artifacts/r3/browser-report.json',JSON.stringify({status:failure?'FAIL':'PASS',browser:browser.version(),project,checks,measurements,errors,limitations:['Real device touch, screen reader and production integration not tested']},null,2));await browser.close();}
if(failure)process.exitCode=1;
