// Focused native regression for F-EST-01. Actual product modules; synthetic adapters do not prove backend writes.
// Local build: node tests/estimate-popover-browser.mjs --build-only
// Native run: PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/estimate-popover-browser.mjs
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,realpath,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve,relative} from 'node:path';
import {build,preview} from 'vite';
import {validateTask} from '../ui/src/tasks.js';
import {tasks} from './fixtures/tabs-geometry/repository.js';

const product=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(product,'../..');
const fixtures=join(product,'tests/fixtures'),ownFixture=join(fixtures,'estimate-popover');
const buildOnly=process.argv.includes('--build-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'),'Unknown runner argument');
const evidence=resolve(process.env.ESTIMATE_EVIDENCE_DIR||join(product,'output/estimate-popover',buildOnly?'build-only':'browser'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const hashFile=async path=>sha(await readFile(path));
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const planBytes=await readFile(join(ownFixture,'acceptance-plan.json')),plan=JSON.parse(planBytes);
await mkdir(evidence,{recursive:true});
const result={status:'NOT_RUN',scope:plan.scope,planId:plan.id,planSHA256:sha(planBytes),createdAt:new Date().toISOString(),
  node:process.version,buildOnly,environment:plan.environment,sourceRevision:null,sourceTree:null,reportedCIRevision:process.env.ESTIMATE_SOURCE_REVISION||null,
  sourceSHA256:{},cases:[],pageErrors:[],consoleErrors:[],externalRequests:[],
  nativeAcceptance:'NOT_RUN',visualInspection:'NOT_RUN',humanAcceptance:'NOT_RUN',backendAcceptance:'NOT_RUN',notRun:plan.not_run};
let temporary,server,browser;

async function files(root){
  const paths=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(entry.isDirectory())paths.push(...(await files(join(root,entry.name))).map(path=>entry.name+'/'+path));
    else {assert.ok(entry.isFile(),'Expected a regular file: '+entry.name);paths.push(entry.name);}
  }
  return paths.sort();
}
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
const task=page=>page.locator('iq-dialog.task-edit-dialog');
const adapter=page=>page.evaluate(()=>window.tabsGeometryProbe?{
  version:window.tabsGeometryProbe.version,ready:window.tabsGeometryProbe.ready,bootstrapError:window.tabsGeometryProbe.bootstrapError,
  unsupported:window.tabsGeometryProbe.unsupported,attempts:window.tabsGeometryProbe.attempts,reads:window.tabsGeometryProbe.reads,
}:window.estimatePopoverProbe?{
  version:window.estimatePopoverProbe.version,ready:window.estimatePopoverProbe.ready,saves:window.estimatePopoverProbe.saves,
  picks:window.estimatePopoverProbe.picks,lifecycle:window.estimatePopoverProbe.lifecycle,
}:null);

// Read only. A snapshot never reveals, scrolls, focuses or rearranges the surface it measures.
async function snapshot(page,anchorSelector){
  return page.evaluate(selector=>{
    const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const describe=node=>node?{tag:node.tagName,id:node.id,name:node.getAttribute('name'),role:node.getAttribute('role'),
      label:node.getAttribute('aria-label'),text:node.textContent?.trim().slice(0,120)}:null;
    const measure=node=>{
      if(!node)return null;
      const style=getComputedStyle(node),range=document.createRange();range.selectNodeContents(node);
      return {node:describe(node),rect:box(node),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,scrollLeft:node.scrollLeft,
        fontSize:style.fontSize,lineHeight:style.lineHeight,display:style.display,overflowX:style.overflowX,
        textRects:[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}))};
    };
    const anchor=document.querySelector(selector),owner=anchor?.closest('dialog'),popup=document.querySelector('.pl-pop');
    const form=popup?.querySelector('form'),input=popup?.querySelector('input[name="estimate"]');
    const parts=popup?[...popup.querySelectorAll('.pl-est,.pl-est-row,.pl-est-input,.pl-est-units,.pl-est-unit,[data-unit],[data-hint],.pl-est-actions,.pl-est-actions button')].map(measure):[];
    return {viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,visualViewportScale:visualViewport?.scale||null},
      theme:document.documentElement.dataset.theme,rootFontSize:getComputedStyle(document.documentElement).fontSize,
      windowScroll:{x:scrollX,y:scrollY},taskBodyScroll:document.querySelector('iq-dialog.task-edit-dialog .iq-dialog-body')?.scrollTop??null,
      active:describe(document.activeElement),focusWithinPopup:!!popup?.contains(document.activeElement),focusIsEstimateInput:!!input&&document.activeElement===input,
      anchor:anchor?{...measure(anchor),focused:document.activeElement===anchor,connected:anchor.isConnected}:null,
      owner:owner?{node:describe(owner),open:owner.open,modal:owner.matches(':modal')}:null,
      openDialogs:[...document.querySelectorAll('dialog[open]')].map(describe),popupCount:document.querySelectorAll('.pl-pop').length,
      popup:popup?{...measure(popup),nativeOpen:popup.matches(':popover-open'),connected:popup.isConnected,parent:describe(popup.parentElement),
        withinOwner:!!owner?.contains(popup),withinOpenDialog:!!popup.closest('dialog')?.open,nestedInForm:!!popup.closest('form'),
        editorFormNested:!!form?.parentElement.closest('form'),inputValue:input?.value??null,
        menuItems:[...popup.querySelectorAll('[role="menuitem"]')].map(node=>({index:node.dataset.index,disabled:node.disabled,focused:node===document.activeElement})),parts}:null};
  },anchorSelector);
}
async function capture(page,entry,name){
  const state=await snapshot(page,entry.anchorSelector),file=entry.id+'-'+name+'.png';
  const bytes=await page.screenshot({path:join(evidence,file)});
  entry.captures.push({name,state,screenshot:file,screenshotSHA256:sha(bytes)});
  return state;
}
function assertEstimate(value,label,{modal=false}={}){
  assert.equal(value.popupCount,1,label+': exactly one popup');
  assert.equal(value.popup?.nativeOpen,true,label+': native popover is open');
  assert.equal(value.focusIsEstimateInput,true,label+': actual focus is the editable estimate input');
  assert.equal(value.popup.nestedInForm,false,label+': popup is outside any outer form');
  assert.equal(value.popup.editorFormNested,false,label+': estimate form is not nested');
  if(modal){
    assert.equal(value.owner?.open,true,label+': owning native dialog is still open');
    assert.equal(value.owner?.modal,true,label+': owning dialog is modal');
    assert.equal(value.popup.withinOwner,true,label+': popup belongs to its native modal focus scope');
  }else assert.equal(value.popup.withinOpenDialog,false,label+': outside-modal path remains outside a modal');
}
function assertHorizontalGeometry(value,label){
  const popup=value.popup,rect=popup.rect,tolerance=.75;
  assert.ok(rect.left>=-tolerance&&rect.right<=value.viewport.width+tolerance,label+': whole popup fits viewport horizontally');
  assert.ok(popup.scrollWidth<=popup.clientWidth+1,label+': no horizontal popup overflow');
  assert.ok(popup.parts.some(part=>part.node.name==='estimate'),label+': actual input is measured');
  assert.ok(popup.parts.some(part=>part.node.tag==='P'),label+': actual hint is measured');
  for(const part of popup.parts){
    assert.ok(part.rect.width>0&&part.rect.height>0,label+': visible '+part.node.tag);
    assert.ok(part.rect.left>=rect.left-tolerance&&part.rect.right<=rect.right+tolerance,label+': whole '+part.node.tag+' fits popup horizontally');
    // A text input may scroll its own edit buffer; that is distinct from whole-form overflow.
    if(part.node.tag!=='INPUT'){
      assert.ok(part.scrollWidth<=part.clientWidth+1,label+': no horizontal overflow in '+part.node.tag);
      for(const text of part.textRects)assert.ok(text.left>=rect.left-tolerance&&text.right<=rect.right+tolerance,label+': rendered text fits popup horizontally');
    }
  }
}
async function assertCancelled(page,entry,{modal=false}={}){
  await page.keyboard.press('Escape');await settle(page);
  const value=await snapshot(page,entry.anchorSelector);
  assert.equal(value.popupCount,0,'Escape removes the popup');
  assert.equal(value.anchor?.focused,true,'Escape restores the original trigger focus');
  if(modal)assert.equal(value.owner?.open,true,'Escape keeps the owning Task open');
  return value;
}
async function taskCase(page,entry){
  await page.locator('article[data-task-surface="task-1"] > button.task-card-title[data-open-task="task-1"]:visible').click();
  await page.waitForFunction(()=>document.querySelector('iq-dialog.task-edit-dialog [data-task-estimate] > button')&&
    document.querySelector('iq-dialog.task-edit-dialog [data-task-agents] > .iq-work-story-head'));
  assert.equal(await task(page).count(),1,'Exactly one real Task opened from its own Board card');
  const trigger=page.locator(entry.anchorSelector),before=await trigger.innerText();
  await trigger.click();await settle(page);
  const opened=await capture(page,entry,'after-open');
  assertEstimate(opened,entry.id,{modal:true});assertHorizontalGeometry(opened,entry.id);
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('9.5');
  assert.equal(await page.locator('.pl-est-pop input[name="estimate"]').inputValue(),'9.5','Native keyboard edits the actually focused input');
  assert.equal(await trigger.innerText(),before,'Unsaved popup draft does not change the Task estimate');
  await assertCancelled(page,entry,{modal:true});
  assert.equal(await trigger.innerText(),before,'Cancellation retains the Task estimate');
  const state=await adapter(page);assert.deepEqual(state.unsupported,[],'No unsupported operation or adapter write');assert.deepEqual(state.attempts,[],'No synthetic write attempt');
}
async function outsideTime(page,entry){
  await page.locator(entry.anchorSelector).click();await settle(page);
  const opened=await capture(page,entry,'after-open');assertEstimate(opened,entry.id);assertHorizontalGeometry(opened,entry.id);
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('2.5');
  await page.locator('.pl-est-pop [data-unit="d"]').click();await settle(page);
  assert.equal((await snapshot(page,entry.anchorSelector)).focusIsEstimateInput,true,'Unit selection returns actual input focus');
  await page.keyboard.press('Enter');await settle(page);
  const value=await snapshot(page,entry.anchorSelector),state=await adapter(page);
  assert.equal(value.popupCount,0,'Successful synthetic callback closes the editor');assert.equal(value.anchor.focused,true,'Successful callback restores its existing trigger');
  assert.deepEqual(state.saves,[{value:2.5,unit:'d'}],'Exactly one estimate callback with the entered value and chosen unit');
  assert.deepEqual(state.picks,[]);
}
async function outsidePoints(page,entry){
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(entry.anchorSelector).evaluate(node=>node===document.activeElement),true,'First native Tab reaches the outside estimate trigger');
  await page.keyboard.press('Enter');await settle(page);
  const opened=await capture(page,entry,'after-open');assertEstimate(opened,entry.id);assertHorizontalGeometry(opened,entry.id);
  assert.equal(await page.locator('.pl-est-pop [data-unit]').count(),0,'Points use the existing fixed SP unit');
  assert.equal(await page.locator('.pl-est-unit').innerText(),'SP');
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('8');
  await assertCancelled(page,entry);assert.deepEqual((await adapter(page)).saves,[],'Keyboard cancellation makes no estimate callback');
}
async function outsideMenu(page,entry){
  await page.keyboard.press('Tab');await page.keyboard.press('Tab');
  assert.equal(await page.locator(entry.anchorSelector).evaluate(node=>node===document.activeElement),true,'Native Tab order reaches the menu trigger');
  await page.keyboard.press('Enter');await settle(page);
  const opened=await capture(page,entry,'after-open');
  assert.equal(opened.popupCount,1);assert.equal(opened.popup?.nativeOpen,true);assert.equal(opened.popup.withinOpenDialog,false);
  assert.deepEqual(opened.popup.menuItems.filter(item=>item.focused).map(item=>item.index),['0'],'First enabled menu row has actual focus');
  await page.keyboard.press('ArrowDown');
  assert.deepEqual((await snapshot(page,entry.anchorSelector)).popup.menuItems.filter(item=>item.focused).map(item=>item.index),['2'],'ArrowDown skips the disabled row');
  await assertCancelled(page,entry);assert.deepEqual((await adapter(page)).picks,[],'Escape selects nothing');
  await page.keyboard.press('Enter');await page.keyboard.press('End');await page.keyboard.press('Enter');await settle(page);
  assert.equal((await snapshot(page,entry.anchorSelector)).popupCount,0,'Selecting an enabled item closes the menu');
  assert.deepEqual((await adapter(page)).picks,['duplicate'],'Exactly one matching menu callback');
}
async function lifecycleCase(page,entry){
  await page.locator('#open-owner').click();await page.locator(entry.anchorSelector).click();await settle(page);
  const opened=await capture(page,entry,'after-open');assertEstimate(opened,entry.id,{modal:true});
  // Explicit lifecycle stimuli in the isolated host; no changes to product modules or popup DOM.
  await page.evaluate(kind=>{
    if(kind==='owner-close')window.estimatePopoverProbe.closeOwner();
    else if(kind==='owner-removal')window.estimatePopoverProbe.removeOwner();
    else window.estimatePopoverProbe.removeAnchor();
  },entry.kind);
  await settle(page);
  const value=await snapshot(page,entry.anchorSelector),state=await adapter(page);
  assert.equal(value.popupCount,0,entry.kind+': no orphaned popup');
  assert.equal(value.focusWithinPopup,false,entry.kind+': removed popup cannot retain focus');
  assert.deepEqual(state.saves,[],entry.kind+': lifecycle cleanup does not save a draft');
  if(entry.kind==='owner-close'){
    assert.equal(await page.locator('#fixture-owner').evaluate(node=>node.open),false,'Native close closes the owner');
    assert.deepEqual(state.lifecycle,['close-owner','owner-close-event'],'Native close event was observed');
  }else if(entry.kind==='owner-removal')assert.equal(await page.locator('#fixture-owner').count(),0,'Owner was disconnected');
  else {assert.equal(await page.locator('#owner-estimate').count(),0,'Anchor was disconnected');assert.equal(await page.locator('#fixture-owner').evaluate(node=>node.open),true,'Anchor removal leaves its owner open');}
}
async function runCase(spec,baseURL){
  const profile=plan.profiles[spec.profile];assert.ok(profile,'Known profile '+spec.profile);
  const entry={...spec,profileData:profile,status:'RUNNING',captures:[],anchorSelector:spec.kind==='task'?'iq-dialog.task-edit-dialog [data-task-estimate] > button':
    spec.kind==='menu'?'#outside-menu':spec.kind.startsWith('outside-')?'#outside-estimate':'#owner-estimate'};
  result.cases.push(entry);
  const context=await browser.newContext({viewport:profile.viewport,deviceScaleFactor:1,locale:'ru-RU',timezoneId:'UTC',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>result.pageErrors.push({case:entry.id,message:error.message}));
  page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push({case:entry.id,message:message.text()});});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(baseURL).origin){result.externalRequests.push({case:entry.id,url:route.request().url()});return route.abort();}return route.continue();});
  try{
    const query=new URLSearchParams({surface:'board',theme:profile.theme,density:profile.density,text:String(profile.text),format:spec.kind==='outside-points'?'points':'time'});
    const url=baseURL+(spec.kind==='task'?'tabs-geometry/product.html':'estimate-popover/index.html')+'?'+query;
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>window.tabsGeometryProbe?.ready||window.tabsGeometryProbe?.bootstrapError||window.estimatePopoverProbe?.ready);
    const ready=await adapter(page);assert.equal(ready.version,plan.package_version);assert.equal(ready.bootstrapError||null,null,'Actual fixture bootstrap');await settle(page);
    if(spec.kind==='task')await taskCase(page,entry);
    else if(spec.kind==='outside-time')await outsideTime(page,entry);
    else if(spec.kind==='outside-points')await outsidePoints(page,entry);
    else if(spec.kind==='menu')await outsideMenu(page,entry);
    else await lifecycleCase(page,entry);
    assert.deepEqual(result.pageErrors.filter(item=>item.case===entry.id),[],'No page error');
    assert.deepEqual(result.consoleErrors.filter(item=>item.case===entry.id),[],'No console error');
    assert.deepEqual(result.externalRequests.filter(item=>item.case===entry.id),[],'No off-origin request');
    entry.status='PASS';
  }catch(error){entry.status='FAIL';entry.error=error.stack||error.message;}
  finally{
    // Capture even a failed open or assertion before the browsing context is destroyed.
    try{entry.adapter=await adapter(page);await capture(page,entry,entry.status==='PASS'?'final':'failure');}
    catch(error){entry.captureError=error.stack||error.message;entry.status='FAIL';}
    await context.close();
  }
}

try{
  result.sourceRevision=git('rev-parse','HEAD');result.sourceTree=git('rev-parse','HEAD^{tree}');
  if(result.reportedCIRevision)assert.equal(result.sourceRevision,result.reportedCIRevision,'Actual checkout matches reported CI revision');
  const scope=['products/sprintique/ui','products/sprintique/tests/estimate-popover-browser.mjs','products/sprintique/tests/fixtures/tabs-geometry',
    'products/sprintique/tests/fixtures/estimate-popover','.github/workflows/tabs-geometry.yml'];
  result.workingSourceChanges=git('diff','--name-only','HEAD','--',...scope).split('\n').filter(Boolean);
  result.untrackedSource=git('ls-files','--others','--exclude-standard','--',...scope).split('\n').filter(Boolean);
  if(!buildOnly){assert.deepEqual(result.workingSourceChanges,[],'Native run serves a frozen source checkout');assert.deepEqual(result.untrackedSource,[],'Native source files are committed');}
  const deps=await realpath(join(product,'node_modules')),pkg=JSON.parse(await readFile(join(product,'package.json'))),installed=JSON.parse(await readFile(join(deps,'@iquipage/web/package.json')));
  const archive=join(product,`vendor/iquipage-web-${plan.package_version}.tgz`);
  assert.equal(pkg.dependencies['@iquipage/web'],`file:vendor/iquipage-web-${plan.package_version}.tgz`);assert.equal(installed.version,plan.package_version);
  assert.equal(await hashFile(archive),plan.ds_archive_sha256);
  temporary=await mkdtemp(join(evidence,'.package-'));execFileSync('tar',['-xzf',archive,'-C',temporary]);
  const packageFiles=await files(join(temporary,'package'));assert.deepEqual(await files(join(deps,'@iquipage/web')),packageFiles);
  for(const path of packageFiles)assert.equal(await hashFile(join(deps,'@iquipage/web',path)),await hashFile(join(temporary,'package',path)),'Installed DS archive byte equality: '+path);
  result.package={version:installed.version,archiveSHA256:plan.ds_archive_sha256,packageJSONSHA256:await hashFile(join(product,'package.json')),
    lockSHA256:await hashFile(join(product,'package-lock.json')),verifiedInstalledFiles:packageFiles.length};
  for(const path of ['package.json','package-lock.json','ui/src/popover.js','ui/src/estimate.js','ui/planning/src/planning.css','ui/src/board/board.js','ui/src/board/task-dialog.js',
    'tests/estimate-popover-browser.mjs','tests/fixtures/tabs-geometry/product.html','tests/fixtures/tabs-geometry/product.js','tests/fixtures/tabs-geometry/repository.js',
    'tests/fixtures/estimate-popover/index.html','tests/fixtures/estimate-popover/consumer.js','tests/fixtures/estimate-popover/acceptance-plan.json'])result.sourceSHA256[path]=await hashFile(join(product,path));
  result.sourceSHA256['.github/workflows/tabs-geometry.yml']=await hashFile(join(repo,'.github/workflows/tabs-geometry.yml'));
  tasks.forEach(validateTask);result.fixtureContracts='PASS';
  result.vite=JSON.parse(await readFile(join(deps,'vite/package.json'))).version;assert.equal(result.vite,pkg.devDependencies.vite);
  const modules=new Set(),outDir=join(evidence,'compiled');
  await build({configFile:false,root:fixtures,logLevel:'warn',plugins:[{name:'estimate-regression-input-provenance',moduleParsed(info){modules.add(info.id);}}],
    build:{outDir,emptyOutDir:true,minify:false,cssMinify:false,assetsInlineLimit:0,
      rollupOptions:{input:{task:join(fixtures,'tabs-geometry/product.html'),isolated:join(ownFixture,'index.html')}}}});
  for(const path of ['ui/src/board/board.js','ui/src/board/task-dialog.js','ui/src/estimate.js','ui/src/popover.js'])assert.ok(modules.has(join(product,path)),'Actual module is compiled: '+path);
  const inputs={};
  // Vite's inline-CSS module IDs contain a query; provenance hashes the physical HTML source, not a nonexistent query path.
  for(const id of [...new Set([...modules].map(id=>id.split('?')[0]))].sort())if(id.startsWith(product)||id.startsWith(deps+'/')){
    const label=id.startsWith(deps+'/')?'node_modules/'+relative(deps,id):relative(product,id);inputs[label]=await hashFile(id);
  }
  const outputs={};for(const path of await files(outDir))outputs[path]=await hashFile(join(outDir,path));
  assert.ok(outputs['tabs-geometry/product.html']&&outputs['estimate-popover/index.html'],'Both real-entry HTML bundles exist');
  result.build={status:'PASS',inputSHA256:inputs,inputGraphSHA256:sha(JSON.stringify(inputs)),filesSHA256:outputs,bundleSetSHA256:sha(JSON.stringify(outputs))};
  if(buildOnly)result.status='BUILT_NOT_RENDERED';
  else{
    assert.ok(process.env.PLAYWRIGHT_MODULE,'Use the workflow temporary Playwright package');
    const require=createRequire(import.meta.url),pw=resolve(process.env.PLAYWRIGHT_MODULE);
    result.playwright=require(join(pw,'package.json')).version;assert.equal(result.playwright,plan.environment.playwright);
    server=await preview({configFile:false,root:fixtures,logLevel:'warn',build:{outDir},preview:{host:'127.0.0.1',port:0,strictPort:true}});
    const baseURL=`http://127.0.0.1:${server.httpServer.address().port}/`;
    browser=await require(pw).chromium.launch({headless:true});result.browser=browser.version();
    for(const spec of plan.cases)await runCase(spec,baseURL);
    assert.ok(result.cases.every(entry=>entry.status==='PASS'),'One or more native cases failed; all cases retain separate artifacts');
    result.status='PASS';result.nativeAcceptance='PASS';
  }
}catch(error){result.status=buildOnly||browser?'FAIL':'BLOCKED';result.error=error.stack||error.message;result.nativeAcceptance=buildOnly?'NOT_RUN':result.status;process.exitCode=1;}
finally{
  await browser?.close();await server?.close();if(temporary)await rm(temporary,{recursive:true,force:true});
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,build:result.build?.status,nativeAcceptance:result.nativeAcceptance,cases:result.cases.map(({id,status})=>({id,status})),evidence,error:result.error},null,2));
}
