// Isolated actual Maps host + actual Task browser regression, using only synthetic adapter responses.
// Build only: node tests/maps-task-browser.mjs --build-only
// Browser: PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/maps-task-browser.mjs
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {build,createServer} from 'vite';
import {readProjectContext} from '../ui/planning/src/navigation-model.js';
import {validateMap} from '../ui/src/model.js';
import {validateTask} from '../ui/src/tasks.js';
import {project,navigationContext,maps,tasks} from './fixtures/maps-task-context/repository.js';

const product=fileURLToPath(new URL('../',import.meta.url));
const fixtureRoot=join(product,'tests/fixtures/maps-task-context');
const evidence=resolve(process.env.MAPS_EVIDENCE_DIR||join(product,'output/maps-task-context'));
const buildOnly=process.argv.includes('--build-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'),'unknown runner argument');
const sha=value=>createHash('sha256').update(value).digest('hex');
const version='0.6.0-vnext.52',archiveSHA='989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758';
const installed=JSON.parse(await readFile(join(product,'node_modules/@iquipage/web/package.json'),'utf8'));
assert.equal(installed.version,version,'fixture requires the current product package');
assert.equal(sha(await readFile(join(product,`vendor/iquipage-web-${version}.tgz`))),archiveSHA,'vendor archive changed');
await mkdir(evidence,{recursive:true});
const result={scope:'Isolated actual Maps host, whiteboard, Task and native history; synthetic reads; no main.js/bootstrap, backend, persistence or grants claim',
  status:'NOT_RUN',buildOnly,sourceRevision:process.env.MAPS_SOURCE_REVISION||null,createdAt:new Date().toISOString(),package:version,archiveSHA256:archiveSHA,node:process.version,profiles:[],pageErrors:[],externalRequests:[],sourceSHA256:{}};
for(const file of ['web/maps-host.js','web/maps-task-context.js','web/maps-route.js','ui/src/maps.js','ui/src/board/task-dialog.js','ui/src/board/link-view.js',
  'ui/src/maps.css','ui/src/board/board.css','tests/fixtures/maps-task-context/main.js','tests/fixtures/maps-task-context/repository.js'])
  result.sourceSHA256[file]=sha(await readFile(join(product,file)));
let server,browser;
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const inspect=page=>page.evaluate(()=>window.mapsTaskProbe.inspect());
const task=page=>page.locator('iq-dialog.task-edit-dialog');
const closeButton=page=>task(page).locator('.iq-dialog-head [data-close]');
async function waitTask(page,key){
  await page.waitForFunction(key=>window.mapsTaskProbe.inspect().currentTask===key,key);
  await task(page).locator('dialog[open]').waitFor({state:'visible'});await settle(page);
}
async function waitMap(page){
  await page.waitForFunction(()=>window.mapsTaskProbe.inspect().currentTask===null&&location.hash==='#maps/map-a');
  await task(page).waitFor({state:'detached'});await settle(page);
}
function sameMap(value,baseline,label){
  assert.equal(value.sameBoard,true,label+': original whiteboard instance remains connected');
  assert.equal(value.mapId,'map-a',label+': original map remains current');
  assert.equal(value.mapTitle,baseline.mapTitle,label+': newer map B is not substituted');
  assert.deepEqual(value.viewport,baseline.viewport,label+': actual canvas viewport is preserved');
  assert.deepEqual(value.selection,baseline.selection,label+': actual selection is preserved');
  assert.equal(value.inspectorOpen,true,label+': inspector remains available');
  assert.equal(value.sameInspector,true,label+': the same inspector form remains mounted');
}
async function openFromMap(page){await page.locator('[data-open-linked-task]').click();await waitTask(page,'MFX-101');}
async function linkTo(page,id){await task(page).locator(`iq-relation-map [data-rm-open="${id}"]`).click();}

async function handoffAndDraftChecks(page,entry,baseline){
  entry.phase='related task null response';
  await openFromMap(page);
  await page.evaluate(()=>{window.mapsTaskProbe.rememberTask();window.mapsTaskProbe.controls.nullNextTask();});
  await linkTo(page,'task-2');
  const error=task(page).locator('[data-task-links] [role="alert"]');
  await error.waitFor({state:'visible'});assert.match(await error.textContent(),/недоступна/);
  let value=await inspect(page);assert.equal(value.currentTask,'MFX-101');assert.equal(value.sameRememberedTask,true);sameMap(value,baseline,entry.phase);
  entry.checks.push('actual relation link null response keeps the same Task and exposes its error');

  entry.phase='related task support failure';
  await page.evaluate(()=>window.mapsTaskProbe.controls.rejectNextSupport());
  await linkTo(page,'task-2');
  await page.waitForFunction(()=>document.querySelector('.task-edit-dialog [data-task-links] [role="alert"]')?.textContent.includes('Synthetic support read failed'));
  value=await inspect(page);assert.equal(value.currentTask,'MFX-101');assert.equal(value.sameRememberedTask,true);
  entry.checks.push('actual Task support-read rejection preserves the old Task');

  entry.phase='successful actual relation handoff';
  await linkTo(page,'task-2');await waitTask(page,'MFX-102');
  value=await inspect(page);sameMap(value,baseline,entry.phase);assert.deepEqual(value.taskIds,['task-2']);
  assert.equal(value.sameRememberedTask,false);
  await page.screenshot({path:join(evidence,entry.name+'-related-task.png')});
  entry.checks.push('real relation link handoff reaches T2 with one native open Task');
  await linkTo(page,'task-1');await waitTask(page,'MFX-101');

  entry.phase='close while next Task support read is delayed';
  await page.evaluate(()=>window.mapsTaskProbe.controls.delayNextSupport());
  await linkTo(page,'task-2');
  await page.waitForFunction(()=>window.mapsTaskProbe.controls.supportState().pending);
  assert.equal((await inspect(page)).currentTask,'MFX-101');
  await closeButton(page).click();await waitMap(page);
  assert.equal(await page.evaluate(()=>window.mapsTaskProbe.controls.supportState().aborted),true);
  await page.evaluate(()=>window.mapsTaskProbe.controls.releaseSupport());await settle(page);
  value=await inspect(page);assert.equal(value.currentTask,null);assert.deepEqual(value.taskIds,[]);sameMap(value,baseline,entry.phase);
  entry.checks.push('Close aborts delayed replacement; ignored cancellation cannot reopen it after release');

  entry.phase='native Back refused by an actual comment draft';
  await openFromMap(page);
  const composer=task(page).locator('iq-markdown-editor[name="new-discussion"] textarea');
  const draft='Синтетический неопубликованный комментарий';await composer.fill(draft);
  await page.goBack();
  const confirmation=page.locator('iq-dialog:not(.task-edit-dialog)').filter({has:page.getByRole('heading',{name:'Закрыть без сохранения?',exact:true})});
  await confirmation.waitFor({state:'visible'});
  await confirmation.getByRole('button',{name:'Отмена',exact:true}).click();
  await confirmation.waitFor({state:'detached'});await waitTask(page,'MFX-101');
  await page.waitForFunction(()=>location.hash==='#maps/map-a/task/MFX-101');
  assert.equal(await composer.inputValue(),draft);sameMap(await inspect(page),baseline,entry.phase);
  await page.screenshot({path:join(evidence,entry.name+'-retained-draft.png')});
  await composer.fill('');await closeButton(page).click();await waitMap(page);
  entry.checks.push('native Back, actual draft confirmation refusal, restored contextual URL and retained text');
}

async function profile(options,baseURL){
  const context=await browser.newContext({viewport:options.viewport,deviceScaleFactor:1,reducedMotion:'reduce',locale:'ru-RU',timezoneId:'UTC'});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const entry={...options,density:'comfortable',zoom:'1x; browser UI zoom and iOS touch are not exercised',checks:[],status:'RUNNING'};
  result.profiles.push(entry);
  page.on('pageerror',error=>result.pageErrors.push({profile:options.name,message:error.message}));
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==new URL(baseURL).origin){result.externalRequests.push(route.request().url());return route.abort();}
    return route.continue();
  });
  try{
    entry.phase='mount';await page.goto(`${baseURL}?theme=${options.theme}&project=fixture#maps/map-a`);
    await page.waitForFunction(()=>window.mapsTaskProbe?.ready||window.mapsTaskProbe?.bootstrapError);
    assert.equal(await page.evaluate(()=>window.mapsTaskProbe.bootstrapError),null);
    // Fixture setup uses the real public board API. Opening Task below uses the actual inspector button.
    await page.locator('iq-whiteboard').evaluate(el=>{el.viewport={x:56,y:42,zoom:.85};el.select(['linked-a1']);});
    await page.locator('[data-open-linked-task]').waitFor({state:'visible'});await settle(page);
    const baseline=await page.evaluate(()=>window.mapsTaskProbe.capture());entry.baseline=baseline;
    assert.equal(baseline.mapId,'map-a');assert.deepEqual(baseline.selection,['linked-a1']);
    assert.equal(baseline.sameBoard,true);assert.equal(baseline.inspectorOpen,true);
    await page.screenshot({path:join(evidence,options.name+'-map.png')});

    entry.phase='open Task and Work tab';await openFromMap(page);sameMap(await inspect(page),baseline,entry.phase);
    await task(page).getByRole('tab',{name:'Работа агента',exact:true}).click();
    await page.waitForFunction(()=>location.hash==='#maps/map-a/task/MFX-101/work');
    await task(page).locator('[data-panel="work"]').waitFor({state:'visible'});
    await task(page).locator('[data-panel="work"] [data-task-agents]').getByRole('heading',{name:'Поручите первый шаг',exact:true}).waitFor();
    assert.equal((await inspect(page)).workTab,'work');sameMap(await inspect(page),baseline,entry.phase);
    await page.screenshot({path:join(evidence,options.name+'-work-tab.png')});
    entry.checks.push('actual inspector button, full Task mount and contextual Work tab');

    entry.phase='header Close and native Forward';await closeButton(page).click();await waitMap(page);
    let value=await inspect(page);sameMap(value,baseline,entry.phase);assert.equal(value.focusOnOpener,true);
    await page.goForward();await waitTask(page,'MFX-101');assert.equal((await inspect(page)).workTab,'work');
    entry.checks.push('header Close returns to the same map; native Forward reopens Work tab');

    entry.phase='Escape and native history';await page.keyboard.press('Escape');await waitMap(page);
    value=await inspect(page);sameMap(value,baseline,entry.phase);assert.equal(value.focusOnOpener,true);
    await page.goForward();await waitTask(page,'MFX-101');
    await page.goBack();await waitMap(page);sameMap(await inspect(page),baseline,'native Back');
    await page.goForward();await waitTask(page,'MFX-101');
    await task(page).getByRole('tab',{name:'Задача',exact:true}).click();
    await page.waitForFunction(()=>location.hash==='#maps/map-a/task/MFX-101');
    await closeButton(page).click();await waitMap(page);
    entry.checks.push('Escape, native Back/Forward and Task tab retain the contextual route');
    if(options.deep)await handoffAndDraftChecks(page,entry,baseline);
    entry.final=await inspect(page);sameMap(entry.final,baseline,'final return');
    entry.peakOpenTaskDialogs=await page.evaluate(()=>window.mapsTaskProbe.peakOpenTaskDialogs);
    assert.equal(entry.peakOpenTaskDialogs,1,'at most one native Task is observed open');
    assert.deepEqual(await page.evaluate(()=>window.mapsTaskProbe.unsupported),[],'no unsupported operation or write occurred');
    assert.deepEqual(await page.evaluate(()=>window.mapsTaskProbe.routeErrors),[],'no unhandled host-route failure');
    entry.reads=await page.evaluate(()=>window.mapsTaskProbe.reads);
    await page.screenshot({path:join(evidence,options.name+'-returned-map.png')});entry.status='PASS';
  }catch(error){entry.status='FAIL';entry.error=error.stack;await page.screenshot({path:join(evidence,options.name+'-failure.png')}).catch(()=>{});throw error;}
  finally{await context.close();}
}

try{
  result.fixtureContracts={status:'RUNNING',navigation:'readProjectContext',maps:maps.length,tasks:tasks.length};
  const confirmed=readProjectContext(navigationContext);
  assert.equal(confirmed.id,project.id,'navigation and Maps must identify the same synthetic project');
  maps.forEach(validateMap);tasks.forEach(validateTask);
  result.fixtureContracts.status='PASS';
  if(buildOnly){
    const bundles=await build({configFile:false,root:fixtureRoot,logLevel:'error',build:{write:false,minify:false,emptyOutDir:false}});
    const outputs=(Array.isArray(bundles)?bundles:[bundles]).flatMap(bundle=>bundle.output||[]);
    const modules=outputs.filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules||{}));
    const checkedEntries=['web/maps-host.js','web/maps-task-context.js','ui/src/maps.js','ui/src/canvas-inspector.js','ui/src/board/task-dialog.js'];
    for(const file of checkedEntries)assert.ok(modules.some(id=>id.endsWith('/'+file)),'real fixture module was not bundled: '+file);
    result.build={status:'PASS',checkedEntries,outputs:outputs.map(item=>({file:item.fileName,kind:item.type}))};
    result.browserChecks='NOT_RUN';
  }else{
    const require=createRequire(import.meta.url),{chromium}=require(process.env.MAPS_PLAYWRIGHT_MODULE||process.env.PLAYWRIGHT_MODULE||'playwright');
    server=await createServer({configFile:false,root:fixtureRoot,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[product]}}});
    await server.listen();const address=server.httpServer.address(),baseURL=`http://127.0.0.1:${address.port}/`;
    browser=await chromium.launch({headless:true});result.browser=browser.version();
    for(const options of [
      {name:'desktop-light',viewport:{width:1280,height:720},theme:'light',deep:true},
      {name:'desktop-dark',viewport:{width:1280,height:720},theme:'dark'},
      {name:'narrow-light',viewport:{width:390,height:844},theme:'light'},
      {name:'narrow-dark',viewport:{width:390,height:844},theme:'dark'},
    ])await profile(options,baseURL);
    assert.deepEqual(result.pageErrors,[],'no uncaught frontend error');assert.deepEqual(result.externalRequests,[],'only local fixture resources');
    result.status='PASS';result.browserChecks='PASS';
  }
}catch(error){
  result.status=buildOnly||browser?'FAIL':'BLOCKED';result.error=error.stack;process.exitCode=1;
  if(result.fixtureContracts?.status!=='PASS'){result.fixtureContracts.status='FAIL';result.status='FAIL';result.browserChecks='NOT_RUN';}
  if(buildOnly){result.build={status:result.fixtureContracts.status==='PASS'?'FAIL':'NOT_RUN'};result.browserChecks='NOT_RUN';}
}
finally{
  await browser?.close();await server?.close();
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,build:result.build?.status,browserChecks:result.browserChecks,evidence,error:result.error},null,2));
}
