import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {referenceServer} from './server-fixture.mjs';
import {createTask} from '../src/tasks.js';
const cleanup=[],checks=[],errors=[];
const api=await referenceServer({after:fn=>cleanup.push(fn)});
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
let browser,failure;
await mkdir('artifacts/board-b1',{recursive:true});
try{
  for(let i=0;i<200;i++)await api.put('tasks',createTask({projectId:'board-b1',title:`Задача ${i+1}: проверить читаемость длинного названия и расположение содержимого карточки без наложения на соседнюю задачу`,owner:'Тестовый участник',priority:i===0?'critical':i===1?'high':'normal'}));
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===api.base?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(api.base+'/?project=board-b1#tasks');
  await page.locator('[data-drop-status=ready] .task-card').first().waitFor();
  for(const [width,height] of [[1440,900],[1280,720]]){
    await page.setViewportSize({width,height});
    const geometry=await page.locator('[data-drop-status=ready] .task-card').evaluateAll(cards=>cards.map(card=>{
      const a=card.getBoundingClientRect(),title=card.querySelector('.task-card-title').getBoundingClientRect(),foot=card.querySelector('.task-card-footer').getBoundingClientRect();
      return {top:a.top,bottom:a.bottom,titleTop:title.top,titleBottom:title.bottom,footTop:foot.top,footBottom:foot.bottom};
    }));
    await page.screenshot({path:`artifacts/board-b1/board-${width}.png`});
    for(const [i,r] of geometry.entries()){
      assert.ok(r.titleTop>=r.top&&r.titleBottom<=r.bottom+1,`Title outside card ${i}: ${JSON.stringify(r)}`);
      assert.ok(r.footTop>=r.titleBottom&&r.footBottom<=r.bottom+1,`Footer outside card ${i}: ${JSON.stringify(r)}`);
      if(i)assert.ok(r.top>=geometry[i-1].bottom,`Cards overlap at ${i}`);
    }
    checks.push({name:`200 long cards remain contained at ${width}×${height}`,status:'PASS'});
  }
  const board=page.locator('.iq-board'),headers=page.locator('.kanban-column-header');
  const before=await headers.first().boundingBox();
  await board.evaluate(el=>{el.scrollTop=900;});await page.waitForTimeout(100);
  const positions=await headers.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  assert.ok(positions.every(y=>Math.abs(y-before.y)<2),'Headers must share a sticky row');
  assert.equal(await page.locator('.kanban-column').evaluateAll(nodes=>nodes.filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)).length),0);
  assert.equal(await page.locator('[data-drop-status=ready] .kanban-count').textContent(),'200');
  checks.push({name:'one vertical scroll root, sticky headers and exact column count',status:'PASS'});
  assert.deepEqual(errors,[]);
}catch(e){failure=e;console.error(e);}
finally{
  await writeFile('artifacts/board-b1/layout.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.message,browser:browser?.version()},null,2));
  await browser?.close();for(const fn of cleanup.reverse())await fn();
}
if(failure)process.exitCode=1;
