import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],checks=[];let browser,page,failure;
const api=await referenceServer({after:fn=>cleanup.push(fn)});
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
try{
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  page=await browser.newPage();await page.goto(api.base+'/?project=linked-task-test#maps');await page.waitForFunction(()=>!!window.mapsDemo);
  const identity=await page.evaluate(async()=>{
    const {repository,project,feature}=window.mapsDemo;const {createTask}=await import('/src/tasks.js');
    let task=await repository.write('tasks',createTask({projectId:project.id,title:'Название на карте'}),0);
    const original=(await repository.list('maps',project.id))[0];
    const map=await repository.write('maps',{...original,document:{...original.document,objects:[{id:'reference-card',type:'task',externalTaskId:task.id,text:task.title,owner:'',done:false,x:100,y:100,width:280,height:160}],connections:[]}},original.revision);
    task=await repository.write('tasks',{...task,title:'Актуальная задача',description:'Сохранённый документ'},task.revision);
    await feature.openMap(map.id);return {taskId:task.id,mapId:map.id,mapRevision:map.revision};
  });
  const link=page.locator('iq-whiteboard [data-object="reference-card"] [data-wb-action="task-toggle"]');
  await link.click();
  const panel=page.locator('.task-edit-dialog dialog[open]');await panel.waitFor();
  assert.equal(await panel.getByLabel('Название',{exact:true}).inputValue(),'Актуальная задача');
  assert.equal(await panel.locator('iq-markdown-editor[name=description]').evaluate(editor=>editor.value),'Сохранённый документ');
  checks.push('map task reference opens the current canonical task document, not a copied source snapshot');
  await panel.getByLabel('Название',{exact:true}).fill('Изменено из связанной задачи');
  await panel.getByRole('button',{name:'Сохранить задачу',exact:true}).click();await panel.waitFor({state:'detached'});
  const saved=await page.evaluate(async identity=>{
    const {repository,project}=window.mapsDemo;
    return {task:await repository.read('tasks',identity.taskId,project.id),map:await repository.read('maps',identity.mapId,project.id),count:(await repository.list('tasks',project.id)).length};
  },identity);
  assert.equal(saved.task.title,'Изменено из связанной задачи');assert.equal(saved.count,1);
  assert.equal(saved.map.revision,identity.mapRevision);assert.equal(saved.map.document.objects[0].externalTaskId,identity.taskId);
  checks.push('editing the linked task creates no duplicate task and does not rewrite the map snapshot');
  for(const name of checks)console.log('PASS',name);
}catch(error){failure=error;console.error(error);}
finally{
  await mkdir('artifacts/map-task-link',{recursive:true});
  await writeFile('artifacts/map-task-link/browser.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,error:failure?.message},null,2));
  await browser?.close();for(const fn of cleanup.reverse())await fn();
}
if(failure)process.exitCode=1;
