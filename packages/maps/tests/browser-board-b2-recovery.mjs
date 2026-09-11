import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {referenceServer,until} from './server-fixture.mjs';
import {createTask} from '../src/tasks.js';
const cleanup=[],checks=[],errors=[],projectId='b2-recovery-'+Date.now();
const api=await referenceServer({after:fn=>cleanup.push(fn)});
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
let browser,page,failure;
const mark=name=>{checks.push({name,status:'PASS'});console.log('PASS',name);};
await mkdir('artifacts/board-b2',{recursive:true});
try{
  const task=await api.put('tasks',createTask({projectId,title:'Проверить восстановление'}));
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===api.base?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(api.base+'/?project='+projectId+'#tasks');await page.getByRole('button',{name:task.title,exact:true}).click();
  const panel=()=>page.locator('.task-edit-dialog dialog[open]').last();
  // A synthetic transport failure on the isolated fixture only, after the local commit.
  let dropped=false;
  await page.route('**/api/records/threads/*',async route=>{
    if(route.request().method()==='PUT'&&!dropped){dropped=true;await route.fetch();await route.abort('failed');}
    else await route.continue();
  });
  const compose=()=>panel().locator('.thread-compose iq-markdown-editor');
  await compose().getByRole('textbox').fill('Сообщение при потере ответа');
  await compose().getByRole('button',{name:'Опубликовать',exact:true}).click();
  await panel().locator('[data-thread-error]:not([hidden])').waitFor();
  assert.equal(await compose().getByRole('textbox').inputValue(),'Сообщение при потере ответа');
  await compose().getByRole('button',{name:'Опубликовать',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.thread-compose iq-markdown-editor')?.value==='');
  let saved=await api.get('/records/threads?projectId='+projectId);assert.equal(saved.length,1);assert.equal(saved[0].messages.length,1);
  mark('lost HTTP response retains the draft and a visible retry does not duplicate a published message');
  await page.unroute('**/api/records/threads/*');
  const discussion=panel().locator('.task-thread').first();
  if(!(await discussion.evaluate(element=>element.open)))await discussion.locator('summary').click();
  await discussion.locator('[data-reply-editor]').getByRole('textbox').fill('Черновик ответа');
  await compose().getByRole('textbox').fill('Другое обсуждение');await compose().getByRole('button',{name:'Опубликовать',exact:true}).click();
  await until(()=>api.get('/records/threads?projectId='+projectId),items=>items.length===2);
  const first=panel().locator(`[data-thread="${saved[0].id}"]`);
  assert.equal(await first.locator('[data-reply-editor]').getByRole('textbox').inputValue(),'Черновик ответа');
  mark('publishing another thread preserves a reply draft in the existing editor');
  await panel().locator('.iq-dialog-head [data-close]').click();
  await page.locator('dialog[open]').last().getByRole('button',{name:'Не сохранять',exact:true}).click();
  await page.locator('.task-edit-dialog').waitFor({state:'detached'});
  const migration=await page.evaluate(async()=>{
    const name='b2-upgrade-test-'+crypto.randomUUID(),oldTask={id:'legacy-task',projectId:'migration',revision:1,title:'Старая задача',status:'ready',type:'task',priority:'normal',description:'Не потерять',createdAt:'2026-01-01T00:00:00Z'};
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{for(const collection of ['maps','templates','runs','tasks','rules'])request.result.createObjectStore(collection,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').put(oldTask);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    const {BrowserRepository}=await import('/src/repository.js');const repo=new BrowserRepository(name,{actorId:'migration-user'});
    const preserved=await repo.read('tasks','legacy-task','migration');
    await repo.write('tags',{id:'migration-tag',projectId:'migration',revision:0,name:'Migration',tone:'blue'},0);
    const savedTask=await repo.write('tasks',{...preserved,tagIds:['migration-tag']},preserved.revision);
    const record=await repo.write('threads',{id:'migration-thread',projectId:'migration',revision:0,taskId:'legacy-task',requiresResolution:true,resolved:false,messages:[{id:'m1',body:'Проверка'}]},0);
    const version=(await repo.ready).version;await repo.close();
    const reopened=new BrowserRepository(name);const task=await reopened.read('tasks','legacy-task','migration');await reopened.close();
    await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});
    return {version,preserved,savedTask,record,task};
  });
  assert.equal(migration.version,4);assert.equal(migration.preserved.description,'Не потерять');assert.equal(migration.task.revision,2);
  assert.deepEqual(migration.task.tagIds,['migration-tag']);assert.equal(migration.record.messages[0].authorId,'migration-user');
  mark('IndexedDB v1 upgrade preserves existing task content and supports transactional catalogs and discussions');
  await page.getByRole('button',{name:task.title,exact:true}).click();
  await panel().getByLabel('Название',{exact:true}).fill('Локальный черновик при конфликте');
  const latest=await api.get(`/records/tasks/${task.id}?projectId=${projectId}`);
  await api.put('tasks',{...latest,description:'Обновлено другим участником'});
  await panel().getByRole('button',{name:'Сохранить задачу',exact:true}).click();
  await panel().locator('.map-dialog-form > .map-form-error:not([hidden])').waitFor();
  assert.equal(await panel().getByLabel('Название',{exact:true}).inputValue(),'Локальный черновик при конфликте');
  assert.equal((await api.get(`/records/tasks/${task.id}?projectId=${projectId}`)).description,'Обновлено другим участником');
  await panel().locator('.iq-dialog-head [data-close]').click();
  await page.locator('dialog[open]').last().getByRole('button',{name:'Не сохранять',exact:true}).click();
  await page.locator('.task-edit-dialog').waitFor({state:'detached'});
  mark('a stale task save retains the user draft and never overwrites a concurrent change');
  assert.deepEqual(errors,[]);
  mark('no browser JavaScript errors in recovery and migration scenarios');
}catch(error){failure=error;console.error(error);}
finally{
  const report={status:failure?'FAIL':'PASS',checks,errors,error:failure?.message,browser:browser?.version()};
  await writeFile('artifacts/board-b2/recovery.json',JSON.stringify(report,null,2));
  await browser?.close();
  for(const fn of cleanup.reverse())await fn();
}
if(failure)process.exitCode=1;
