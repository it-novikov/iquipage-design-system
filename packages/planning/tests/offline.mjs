import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),network=[],errors=[];
page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
const url=new URL('../dist/Sprintique-Planning-Frontend-R1.html',import.meta.url);url.searchParams.set('fixture',crypto.randomUUID());let failure;
try{
 await page.goto(url.href);await page.getByRole('heading',{name:'Планирование',exact:true}).waitFor();
 await page.locator('[data-select=pn-task-1]').waitFor();
 await page.locator('[data-select=pn-task-1]').check();assert.equal(await page.locator('[data-select]:checked').count(),1);
 await page.getByRole('button',{name:'Снять выделение',exact:true}).click();
 await page.getByRole('button',{name:'Новая задача',exact:true}).click();const form=page.getByRole('dialog',{name:'Новая задача',exact:true});
 await form.getByRole('textbox',{name:/^Название задачи/}).fill('Офлайн задача PN2');await form.getByRole('button',{name:'Создать задачу',exact:true}).click();await form.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Офлайн задача PN2',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Офлайн задача PN2',exact:true}).waitFor();
 await page.getByRole('link',{name:'Доска задач',exact:true}).click();await page.getByRole('heading',{name:'Доска задач',exact:true}).waitFor();assert.equal(await page.locator('.kanban-column').count(),6);
 assert.deepEqual(network,[]);assert.deepEqual(errors,[]);console.log('PASS file:// open, own IndexedDB data, create/reload, original board, zero HTTP requests');
}catch(e){failure=e;console.error(e);console.error(errors);}
finally{await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});await writeFile(new URL('../evidence/offline.json',import.meta.url),JSON.stringify({status:failure?'FAIL':'PASS',network,errors,error:failure?.stack,scope:'local-fixture'},null,2));await browser.close();}
if(failure)process.exitCode=1;
