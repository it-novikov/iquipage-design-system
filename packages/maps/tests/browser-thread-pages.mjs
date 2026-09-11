import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],checks=[],errors=[];let browser,page,failure;
const api=await referenceServer({after:fn=>cleanup.push(fn)});
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
const mark=name=>{checks.push({name,status:'PASS'});console.log('PASS',name);};
const panel=()=>page.locator('.task-edit-dialog dialog[open]').last();
await mkdir('artifacts/thread-pages',{recursive:true});
try{
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  for(const mode of ['server','browser']){
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===api.base?route.continue():route.abort());
    page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
    const requests=[],pages=[];page.on('request',request=>requests.push(request.url()));
    page.on('response',async response=>{if(/\/api\/tasks\/.*\/threads\?/.test(response.url())){try{pages.push(await response.json());}catch{}}});
    await page.goto(`${api.base}/?project=thread-pages-${mode}-${Date.now()}&storage=${mode}#tasks`);
    await page.getByRole('button',{name:'Новая задача',exact:true}).waitFor();
    const task=await page.evaluate(async()=>{
      const {repository,project}=window.mapsDemo;const {createTask}=await import('/src/tasks.js');
      const task=await repository.write('tasks',createTask({projectId:project.id,title:'Большое обсуждение'}),0);
      for(let i=0;i<61;i++)await repository.write('threads',{id:'thread-page-'+i,projectId:project.id,taskId:task.id,revision:0,requiresResolution:i%4===0,resolved:false,messages:[{id:'first',body:`Вопрос ${i}: `+'Контекст '.repeat(300)},{id:'reply',body:`Подробный ответ ${i}`} ]},0);
      return task;
    });
    await page.reload();
    await page.getByRole('button',{name:task.title,exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.task-thread').length===20);
    assert.equal(await panel().locator('[data-reply-editor]').count(),0);
    assert.equal(await panel().locator('.thread-message').count(),0);
    assert.ok((await panel().locator('[data-thread-count]').textContent()).includes('16'));
    if(mode==='server'){
      assert.equal(requests.filter(url=>/\/api\/records\/threads\?/.test(url)).length,0);
      assert.equal(pages[0].items.length,20);assert.equal(pages[0].items[0].messages[0].body.length,160);
      assert.ok(!JSON.stringify(pages[0]).includes('Подробный ответ'));
    }
    mark(mode+': the initial list loads twenty summaries without all project messages or reply editors');
    await panel().locator('[data-more-threads]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.task-thread').length===40);
    const discussion=panel().locator('.task-thread').last(),id=await discussion.getAttribute('data-thread');
    await discussion.locator('summary').click();
    await discussion.locator('.thread-message').nth(1).waitFor();
    assert.ok((await discussion.locator('.thread-message').last().textContent()).includes('Подробный ответ'));
    await discussion.locator('[data-reply-editor]').getByRole('textbox').fill('Черновик не должен пропасть');
    mark(mode+': opening a discussion fetches its actual messages on demand');
    await page.evaluate(async task=>{
      await window.mapsDemo.repository.write('threads',{id:'thread-new',projectId:task.projectId,taskId:task.id,revision:0,requiresResolution:true,resolved:false,messages:[{id:'first',body:'Новый вопрос между страницами'}]},0);
    },task);
    await panel().locator('[data-more-threads]').click();
    await panel().locator('[data-thread-error]').filter({hasText:'изменились'}).waitFor();
    const preserved=panel().locator(`[data-thread="${id}"]`);
    assert.equal(await preserved.locator('[data-reply-editor]').getByRole('textbox').inputValue(),'Черновик не должен пропасть');
    mark(mode+': a changed page snapshot refreshes explicitly while preserving an off-page reply draft');
    for(let attempt=0;attempt<5&&await panel().locator('[data-more-threads]').isVisible();attempt++){
      await panel().locator('[data-more-threads]').click();
      await page.waitForFunction(()=>document.querySelector('[data-thread-page-state]')?.textContent==='');
    }
    const identifiers=await panel().locator('[data-thread]').evaluateAll(nodes=>nodes.map(node=>node.dataset.thread));
    assert.equal(identifiers.length,62);assert.equal(new Set(identifiers).size,62);
    mark(mode+': continued paging reaches every discussion exactly once');
    await preserved.getByRole('button',{name:'Ответить',exact:true}).click();
    await page.waitForFunction(async({id,projectId})=>(await window.mapsDemo.repository.read('threads',id,projectId)).messages.length===3,{id,projectId:task.projectId});
    const current=await page.evaluate(task=>window.mapsDemo.repository.read('tasks',task.id,task.projectId),task);
    assert.equal(current.revision,task.revision);
    mark(mode+': a reply persists independently of the task document after pagination');
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    await panel().locator('[data-task-threads]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`artifacts/thread-pages/${mode}-dark.png`});
    await panel().locator('.iq-dialog-head [data-close]').click();
    await page.locator('.task-edit-dialog').waitFor({state:'detached'});await context.close();
  }
  assert.deepEqual(errors,[]);mark('no JavaScript errors in paginated discussion workflows');
}catch(error){failure=error;console.error(error);await page?.screenshot({path:'artifacts/thread-pages/failure.png'}).catch(()=>{});}
finally{
  await writeFile('artifacts/thread-pages/browser.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.message,browser:browser?.version()},null,2));
  await browser?.close();for(const fn of cleanup.reverse())await fn();
}
if(failure)process.exitCode=1;
