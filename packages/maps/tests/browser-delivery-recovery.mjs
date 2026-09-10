import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {referenceServer,until} from './server-fixture.mjs';
import {FileRepository} from '../server/file-repository.mjs';
import {createMap,clone} from '../src/model.js';
import {createRule} from '../src/events.js';
import {createMeetingFlow} from '../src/workflow.js';
const cleanups=[],checks=[],errors=[];let browser,failure,map;
const api=await referenceServer({after:fn=>cleanups.push(fn)},{seed:async dir=>{
  const repo=await new FileRepository(dir).init();
  let value=createMap({projectId:'browser-recovery',title:'Проверка восстановления',flow:createMeetingFlow()});
  value.document.objects=[{id:'sample',type:'sticky',text:'Начальное значение',x:0,y:0,width:244,height:156,color:'sand'}];
  map=await repo.write('maps',value,0);
  await repo.write('rules',{...createRule(map),trigger:'project',eventType:'map.updated',status:'enabled'},0);
  for(const text of ['Сохранённый вход первой доставки','Сохранённый вход второй доставки']){
    value=clone(map);value.document.objects[0].text=text;map=await repo.write('maps',value,map.revision);
  }
  for(const entry of repo.outbox){entry.status='dead';entry.attempts=5;entry.totalAttempts=5;entry.lastError='OFFLINE';entry.nextAttemptAt=null;}
  await repo.persist(repo.snapshot());
}});
const mark=name=>{checks.push({name,status:'PASS'});console.log('PASS '+name);};
await mkdir('artifacts/final',{recursive:true});
try{
  const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===api.base?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(api.base+'/?project=browser-recovery#maps');await page.locator('iq-whiteboard').waitFor();
  await page.locator('.map-toolbar [data-map-action=workflow]').click();
  await page.locator('.map-subbar [data-map-action=automations]').click();
  await page.getByRole('button',{name:'Доставка событий',exact:true}).click();
  const retry=page.locator('[data-map-action=retry-delivery]').first(),id=await retry.getAttribute('data-delivery-id');
  await retry.click();await page.locator('dialog[open]').getByRole('button',{name:'Повторить доставку',exact:true}).click();
  await page.locator('iq-dialog.map-dialog').waitFor({state:'detached'});
  const runs=await until(()=>api.get('/records/runs?projectId=browser-recovery'),x=>x.length===1&&x[0].status==='awaiting_approval');
  assert.equal(runs[0].trigger.eventId,id);assert.ok(runs[0].input.notes[0].startsWith('Сохранённый вход'));
  assert.equal((await api.get('/records/tasks?projectId=browser-recovery')).length,0);
  mark('dead-letter retry through UI keeps its committed input and requires approval');
  await page.getByRole('button',{name:'Обновить журнал',exact:true}).click();
  const dismiss=page.locator('[data-map-action=dismiss-delivery]').first(),dismissId=await dismiss.getAttribute('data-delivery-id');
  await dismiss.click();await page.locator('dialog[open]').getByRole('button',{name:'Закрыть событие',exact:true}).click();
  await page.locator('iq-dialog.map-dialog').waitFor({state:'detached'});
  const history=await api.get('/event-deliveries?projectId=browser-recovery');
  assert.equal(history.find(x=>x.id===dismissId).status,'dismissed');
  await page.reload();await page.locator('iq-whiteboard').waitFor();
  assert.equal((await api.get('/records/runs?projectId=browser-recovery')).length,1);
  assert.equal((await api.get('/records/maps/'+map.id+'?projectId=browser-recovery')).revision,map.revision);
  assert.deepEqual(errors,[]);mark('dismissal is persisted without deleting the map or creating another run');
}catch(error){failure=error;console.error(error);}
finally{
  await writeFile('artifacts/final/browser-recovery.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,error:failure?.message,browser:browser?.version()},null,2)+'\n');
  await browser?.close();for(const fn of cleanups.reverse())await fn();
}
if(failure)process.exitCode=1;
