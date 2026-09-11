import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],checks=[],errors=[],api=await referenceServer({after:fn=>cleanup.push(fn)}),out='output/playwright/focus-navigation-v33';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
const settled=()=>page.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState!=='running'));
const mark=text=>{checks.push(text);console.log('PASS',text);};
const snapshot=el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,shadow:s.boxShadow,border:s.borderColor,outline:s.outlineStyle,transform:s.transform};};
let failure;
try{
 await page.route('**/__focus-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="stylesheet" href="/dist/vendor/iquipage.css"><main style="padding:32px;display:grid;gap:24px"><div class="row">${['primary','secondary','ghost','accent','danger','white'].map(type=>`<button class="iq-btn ${type}" data-check>${type}</button>`).join('')}<button class="iq-btn ghost icon sm" aria-label="Закрыть" data-check>×</button><button class="iq-btn primary pill sm" aria-pressed="true" data-check>Выбранный тег</button><button class="iq-btn secondary pill sm" aria-pressed="false" data-check>Тег</button></div><div class="iq-menu-popup"><button data-check>Пункт меню</button></div><div class="wb-shell"><button class="wb-tool" data-check>Инструмент</button><div class="wb-dock"><button data-check>Добавить</button></div></div><iq-select name="select" label="Тип"><option value="task">Задача</option></iq-select><iq-calendar></iq-calendar><iq-markdown-editor label="Описание" variant="compact"></iq-markdown-editor><div class="iq-field"><label for="field">Поле</label><span class="iq-input-shell"><input id="field"></span></div></main></html>`}));
 await page.goto(api.base+'/__focus-fixture');await page.evaluate(async()=>{(await import('/dist/vendor/core.js')).registerCore();document.querySelector('iq-markdown-editor').value='Черновик';});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.mouse.move(1400,930);
  const buttons=page.locator('[data-check],iq-select button,iq-calendar button,iq-markdown-editor button');
  for(const button of await buttons.all()){
   if(!await button.isVisible()||!await button.isEnabled())continue;
   await button.evaluate(el=>el.blur());await settled();const before=await button.evaluate(snapshot);
   await button.focus();await settled();const after=await button.evaluate(snapshot);
   assert.deepEqual(after,before,theme+' / '+await button.innerText());assert.ok(await button.evaluate(el=>document.activeElement===el));
  }
  const field=page.locator('#field'),shell=page.locator('.iq-input-shell');await field.evaluate(el=>el.blur());const before=await shell.evaluate(snapshot);await field.focus();await settled();assert.notDeepEqual(await shell.evaluate(snapshot),before);
 }
 mark('Button focus is visually neutral across variants, tags, menu, calendar, select and Markdown tools; input focus remains visible in both themes');
 await page.goto(api.base+'/?storage=browser&uxPreview=1&project=ux-v33#tasks');await page.locator('.host-task-board').waitFor();
 assert.equal(await page.locator('.platform-brand').count(),0);assert.equal(await page.locator('[data-workspace-path]>svg').count(),1);assert.equal(await page.locator('[data-workspace-path]>iq-menu>button>.project-avatar').count(),1);
 const space=page.getByRole('button',{name:'Выбрать пространство',exact:true}),project=page.getByRole('button',{name:'Выбрать проект',exact:true});
 assert.ok(await space.innerText());assert.match(await project.innerText(),/Команда продукта/);
 await space.click();await page.getByRole('menuitem',{name:'Все пространства',exact:true}).click();await page.getByRole('heading',{name:'Пространства',exact:true}).waitFor();
 await project.click();await page.getByRole('menuitem',{name:'Все проекты пространства',exact:true}).click();await page.getByRole('heading',{name:'Проекты',exact:true}).waitFor();
 await page.locator('[data-directory-id=ux-v33]').click();await page.locator('.host-task-board').waitFor();
 for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:950});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await settled();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await space.isVisible());assert.ok(await project.isVisible());
  const centers=await page.locator('[data-workspace-path]>iq-menu>button,.platform-navigation>a:visible,.platform-navigation>iq-menu:visible,.platform-search-trigger').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;}));assert.ok(Math.max(...centers)-Math.min(...centers)<2,JSON.stringify(centers));
  assert.ok(await space.locator('.workspace-path-name').isVisible());await page.screenshot({path:out+'/navigation-'+width+'-'+theme+'.png'});
  const names=page.locator('[data-workspace-path]>iq-menu>button>.workspace-path-name'),originalNames=await names.allTextContents();
  await names.evaluateAll(els=>els.forEach((el,i)=>el.textContent=i?'Длинное название проекта команды продуктовой разработки':'Длинное название рабочего пространства'));
  const rects=await page.locator('[data-workspace-path]>iq-menu>button,.platform-navigation>iq-menu:visible,.platform-search-trigger').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,center:r.y+r.height/2};}));
  assert.ok(rects.every(r=>r.x>=0&&r.right<=width),JSON.stringify({width,rects}));assert.ok(Math.max(...rects.map(r=>r.center))-Math.min(...rects.map(r=>r.center))<2);
  assert.ok(await names.evaluateAll(els=>els.every(el=>el.getBoundingClientRect().width>=35)));
  await page.screenshot({path:out+'/long-names-'+width+'-'+theme+'.png'});await names.evaluateAll((els,names)=>els.forEach((el,i)=>el.textContent=names[i]),originalNames);
 }
 mark('Logo-free workspace/project path with one project avatar; both directories and 1440/768/390/320 aligned navigation work');
 await page.setViewportSize({width:1440,height:950});await project.click();await page.getByRole('menuitem',{name:/Исследования/}).click();await page.waitForURL(/project=demo-research/);await page.locator('.host-task-board').waitFor();assert.match(await page.getByRole('button',{name:'Выбрать проект',exact:true}).innerText(),/Исследования/);
 await page.getByRole('button',{name:'Выбрать пространство',exact:true}).click();await page.getByRole('menuitem',{name:'Личное',exact:true}).click();await page.waitForURL(/project=demo-personal/);await page.getByRole('heading',{name:'Проекты',exact:true}).waitFor();
 mark('Project and workspace switching retain route semantics');
 const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request.url());});await page.goto(api.base+'/?guest=1');await page.getByRole('heading',{name:'От идеи — к результату.',exact:true}).waitFor();assert.deepEqual(requests,[]);assert.equal(await page.locator('.platform-header').isVisible(),false);
 await page.goto(api.base+'/?storage=browser&standalone=1');await page.locator('iq-whiteboard').waitFor();assert.equal(await page.title(),'IQUIPAGE Maps');assert.equal(await page.locator('.platform-brand').count(),0);
 mark('Guest stays API-free; standalone map still opens without brand references');assert.deepEqual(errors,[]);
}catch(error){failure=error;console.error(error);await page.screenshot({path:out+'/failure.png'});}
finally{await writeFile(out+'/report.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.stack},null,2));await browser.close();for(const fn of cleanup.reverse())await fn();}
if(failure)process.exitCode=1;
