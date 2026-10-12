// Exact DS minimal consumer, then actual Task/Board/Wiki. Synthetic adapters do not prove persistence or human usability.
// Build only: node tests/tabs-geometry-browser.mjs --build-only
// Browser: PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/tabs-geometry-browser.mjs
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {build,createServer} from 'vite';
import {validateTask} from '../ui/src/tasks.js';
import {readProjectContext} from '../ui/planning/src/navigation-model.js';
import {project,navigationContext,tasks} from './fixtures/tabs-geometry/repository.js';

const product=fileURLToPath(new URL('../',import.meta.url)),fixtureRoot=join(product,'tests/fixtures/tabs-geometry');
const evidence=resolve(process.env.TABS_EVIDENCE_DIR||join(product,'output/tabs-geometry'));
const buildOnly=process.argv.includes('--build-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'),'unknown runner argument');
const sha=value=>createHash('sha256').update(value).digest('hex');
const planBytes=await readFile(join(fixtureRoot,'acceptance-plan.json')),plan=JSON.parse(planBytes);
assert.ok(['baseline','candidate'].includes(plan.phase));
const candidate=plan.phase==='candidate';
const pkg=JSON.parse(await readFile(join(product,'package.json'))),installed=JSON.parse(await readFile(join(product,'node_modules/@iquipage/web/package.json')));
assert.equal(pkg.dependencies['@iquipage/web'],`file:vendor/iquipage-web-${plan.package_version}.tgz`);
assert.equal(installed.version,plan.package_version);
assert.equal(sha(await readFile(join(product,`vendor/iquipage-web-${plan.package_version}.tgz`))),plan.ds_archive_sha256);
await mkdir(evidence,{recursive:true});
const result={scope:'Exact public DS and actual Task/Board/Wiki frontend with synthetic adapters; no main bootstrap, authentication, backend, persistence or human-validation claim',
  status:'NOT_RUN',phase:plan.phase,buildOnly,sourceRevision:process.env.TABS_SOURCE_REVISION||null,createdAt:new Date().toISOString(),node:process.version,
  package:plan.package_version,archiveSHA256:plan.ds_archive_sha256,planSHA256:sha(planBytes),environment:plan.environment,
  profiles:[],pageErrors:[],externalRequests:[],sourceSHA256:{}};
for(const file of ['package.json','package-lock.json','ui/src/board/board.js','ui/src/board/task-dialog.js','ui/src/board/board.css','web/wiki.js','web/wiki.css',
  'tests/fixtures/tabs-geometry/minimal.html','tests/fixtures/tabs-geometry/minimal.js','tests/fixtures/tabs-geometry/product.html','tests/fixtures/tabs-geometry/product.js',
  'tests/fixtures/tabs-geometry/repository.js','tests/tabs-geometry-browser.mjs'])result.sourceSHA256[file]=sha(await readFile(join(product,file)));
let server,browser;
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const task=page=>page.locator('iq-dialog.task-edit-dialog').last();
const probe=page=>page.evaluate(()=>({version:window.tabsGeometryProbe.version,unsupported:window.tabsGeometryProbe.unsupported,attempts:window.tabsGeometryProbe.attempts}));

async function geometry(list){
  return list.evaluate(el=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};};
    const r=rect(el),s=getComputedStyle(el),before=el.scrollTop;el.scrollTop=1e6;const maxScrollTop=el.scrollTop;el.scrollTop=before;
    const viewport={left:r.left+el.clientLeft,top:r.top+el.clientTop,right:r.left+el.clientLeft+el.clientWidth,bottom:r.top+el.clientTop+el.clientHeight};
    return {rect:r,viewport,clientWidth:el.clientWidth,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight,
      scrollTop:el.scrollTop,scrollLeft:el.scrollLeft,maxScrollTop,overflowX:s.overflowX,overflowY:s.overflowY,
      borderBottom:s.borderBottomWidth,padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft],backgroundImage:s.backgroundImage,
      rootFontSize:getComputedStyle(document.documentElement).fontSize,devicePixelRatio,visualViewportScale:visualViewport?.scale||null,
      tabs:[...el.querySelectorAll('[role="tab"]')].map(tab=>{
        const b=rect(tab),t=getComputedStyle(tab),range=document.createRange();range.selectNodeContents(tab);const text=rect(range);
        const outset=Math.max(0,parseFloat(t.outlineWidth)+parseFloat(t.outlineOffset));
        return {key:tab.dataset.tab,label:tab.textContent,rect:b,textRect:text,disabled:tab.disabled,tabIndex:tab.tabIndex,
          selected:tab.getAttribute('aria-selected'),focused:document.activeElement===tab,focusVisible:tab.matches(':focus-visible'),
          fontSize:t.fontSize,lineHeight:t.lineHeight,marginBottom:t.marginBottom,borderBottomWidth:t.borderBottomWidth,borderBottomColor:t.borderBottomColor,color:t.color,
          outlineStyle:t.outlineStyle,outlineWidth:t.outlineWidth,outlineOffset:t.outlineOffset,outlineColor:t.outlineColor,boxShadow:t.boxShadow,
          focusPaint:{left:b.left-outset,right:b.right+outset,top:b.top-outset,bottom:b.bottom+outset},
          panel:{id:tab.getAttribute('aria-controls'),hidden:document.getElementById(tab.getAttribute('aria-controls'))?.hidden}};
      })};
  });
}

function validState(value,key,label){
  const selected=value.tabs.filter(tab=>tab.selected==='true');assert.equal(selected.length,1,label+': exactly one selected tab');
  assert.equal(selected[0].key,key,label+': selected key');
  assert.equal(selected[0].tabIndex,0,label+': selected tab is in Tab order');
  for(const tab of value.tabs){
    assert.equal(tab.panel.hidden,tab.key!==key,label+': matching panel visibility');
    assert.ok(tab.rect.width+0.5>=tab.textRect.width,label+': label fits its button');
    assert.ok(tab.textRect.top>=tab.rect.top-0.5&&tab.textRect.bottom<=tab.rect.bottom+0.5,label+': label fits vertically');
    if(tab.key!==key)assert.equal(tab.tabIndex,-1,label+': inactive tab is not in Tab order');
  }
}
function validGeometry(value,label,{focus=false}={}){
  if(!candidate)return;
  assert.equal(value.scrollHeight,value.clientHeight,label+': no overflow height');
  assert.equal(value.maxScrollTop,0,label+': no vertical scroll range');
  if(focus){
    const tab=value.tabs.find(item=>item.focused);assert.ok(tab?.focusVisible,label+': keyboard-visible focus');
    assert.equal(tab.outlineStyle,'solid',label+': outline remains painted');assert.ok(parseFloat(tab.outlineWidth)>=2,label+': focus outline width');
    const p=tab.focusPaint,v=value.viewport;
    assert.ok(p.top>=v.top-0.51&&p.bottom<=v.bottom+0.51,label+': full vertical focus ring inside scrollport');
    // A label wider than the scrollport cannot expose both horizontal edges at once; access is checked separately.
    if(tab.rect.width+8<=value.clientWidth){assert.ok(p.left>=v.left-0.51&&p.right<=v.right+0.51,label+': horizontal focus ring inside scrollport');}
    else assert.ok(tab.rect.right>v.left&&tab.rect.left<v.right,label+': oversized focused tab remains visible');
  }
}
async function capture(page,list,entry,name,{focus=false}={}){
  await settle(page);const value=await geometry(list);entry.measurements[name]=value;
  await list.screenshot({path:join(evidence,`${entry.name}-${name}.png`)});
  validGeometry(value,entry.name+'/'+name,{focus});return value;
}
async function keyboard(page,list,entry,prefix){
  const all=await list.locator('[role="tab"]:not(:disabled)').evaluateAll(tabs=>tabs.map(tab=>tab.dataset.tab));
  const first=all[0],last=all.at(-1);await list.locator(`[data-tab="${first}"]`).click();
  for(const [key,target] of [['End',last],['Home',first],['ArrowLeft',last],['ArrowRight',first]]){
    await page.keyboard.press(key);await settle(page);const value=await geometry(list);
    validState(value,target,prefix+'/'+key);assert.ok(value.tabs.find(tab=>tab.key===target)?.focusVisible,prefix+': keyboard focus');
    validGeometry(value,prefix+'/'+key,{focus:true});entry.keyboard.push({list:prefix,key,selected:target,scrollLeft:value.scrollLeft});
    if(key==='End'||key==='Home')await capture(page,list,entry,prefix+'-'+key,{focus:true});
  }
  // A full forward traversal makes a disabled middle tab observable to this assertion.
  for(const target of [...all.slice(1),first]){await page.keyboard.press('ArrowRight');await settle(page);const value=await geometry(list);validState(value,target,prefix+'/next');validGeometry(value,prefix+'/next',{focus:true});}
}
async function minimal(page,entry){
  const short=page.locator('#short-tabs [role="tablist"]'),long=page.locator('#long-tabs [role="tablist"]');
  const ordinary=await capture(page,short,entry,'short-initial');validState(ordinary,'task',entry.name);
  if(!candidate&&entry.profile==='desktop-light'){
    assert.equal(ordinary.maxScrollTop,plan.baseline.default_vertical_scroll_px,'minimal baseline must reproduce exact 1px scroll range');
    assert.equal(ordinary.scrollHeight-ordinary.clientHeight,1);assert.equal(ordinary.overflowY,'auto');
    assert.ok(ordinary.tabs.every(tab=>tab.marginBottom==='-1px'),'known negative-margin cause must be present');entry.baselineReproduced=true;
  }
  await keyboard(page,short,entry,'short');await keyboard(page,long,entry,'long');
  const overflow=await geometry(long);assert.ok(overflow.scrollWidth>overflow.clientWidth,'long labels must exercise horizontal overflow');
  const positions=await long.evaluate(el=>{
    const out=[];for(const tab of el.querySelectorAll('[role="tab"]:not(:disabled)')){
      const left=el.getBoundingClientRect().left+el.clientLeft,target=tab.getBoundingClientRect().left-left+el.scrollLeft;
      el.scrollLeft=target;const start=tab.getBoundingClientRect();
      el.scrollLeft=target+tab.getBoundingClientRect().width-el.clientWidth;const end=tab.getBoundingClientRect();
      out.push({key:tab.dataset.tab,startLeft:start.left-left,endRight:end.right-left,clientWidth:el.clientWidth});
    }return out;
  });
  for(const pos of positions){assert.ok(pos.startLeft>=-1,'horizontal scrolling exposes the label beginning');assert.ok(pos.endRight<=pos.clientWidth+1,'horizontal scrolling exposes the label ending');}
  entry.horizontalAccess=positions;
}
async function taskBoard(page,entry){
  const card=page.locator('[data-open-task="task-1"]');await card.waitFor({state:'visible'});await card.click();
  await task(page).locator('dialog[open]').waitFor({state:'visible'});
  const list=task(page).locator('[data-task-tabs] > [role="tablist"]');
  const initial=await capture(page,list,entry,'task-initial');validState(initial,'task',entry.name);
  if(!candidate&&entry.profile==='desktop-light'){
    assert.equal(initial.maxScrollTop,plan.baseline.default_vertical_scroll_px,'actual Task baseline must reproduce exact 1px scroll range');
    assert.equal(initial.scrollHeight-initial.clientHeight,1);entry.baselineReproduced=true;
  }
  await keyboard(page,list,entry,'task');
  await list.locator('[data-tab="work"]').click();await settle(page);validState(await geometry(list),'work','Task pointer switch');
  await page.screenshot({path:join(evidence,entry.name+'-work-panel.png')});
  await list.locator('[data-tab="task"]').click();await settle(page);
  await task(page).locator('.iq-dialog-head [data-close]').click();await task(page).waitFor({state:'detached'});
  await card.waitFor({state:'visible'});entry.boardCards=await page.locator('[data-open-task]').count();assert.ok(entry.boardCards>=2,'Board cards stay accessible');
  assert.deepEqual((await probe(page)).attempts,[],'tab switches must not attempt a write');
  await page.screenshot({path:join(evidence,entry.name+'-board-return.png')});
}
async function wiki(page,entry){
  await page.locator('[data-wiki-action="edit"]').click();
  const title=page.locator('[name="wikiTitle"]');await title.fill('Описание решения — мой черновик');
  await page.locator('[data-wiki-action="save"]').click();
  const list=page.locator('[data-wiki-compare] > [role="tablist"]');await list.waitFor({state:'visible'});
  await capture(page,list,entry,'wiki-initial');await keyboard(page,list,entry,'wiki');
  await list.locator('[data-tab="current"]').click();await settle(page);validState(await geometry(list),'current','Wiki comparison');
  await list.locator('[data-tab="mine"]').click();assert.equal(await title.inputValue(),'Описание решения — мой черновик');
  assert.equal((await probe(page)).attempts.length,1,'only the explicit synthetic rejected save is attempted');
  await page.screenshot({path:join(evidence,entry.name+'-draft-preserved.png')});
}
async function nested(page,entry){
  await task(page).locator('dialog[open]').waitFor({state:'visible'});
  await task(page).locator('iq-relation-map [data-rm-open="task-2"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('iq-dialog.task-edit-dialog dialog[open]').length===2);
  const list=task(page).locator('[data-task-tabs] > [role="tablist"]');await keyboard(page,list,entry,'nested');
  await page.screenshot({path:join(evidence,entry.name+'-nested-task.png')});
  await task(page).locator('.iq-dialog-head [data-close]').click();
  await page.waitForFunction(()=>document.querySelectorAll('iq-dialog.task-edit-dialog dialog[open]').length===1);
  entry.remainingTask=await task(page).evaluate(el=>el.taskController.taskId);assert.equal(entry.remainingTask,'task-1');
}
async function runProfile(profile,surface,baseURL){
  const entry={name:profile.name+'-'+surface,profile:profile.name,surface,status:'RUNNING',measurements:{},keyboard:[]};result.profiles.push(entry);
  const context=await browser.newContext({viewport:profile.viewport,deviceScaleFactor:1,locale:'ru-RU',timezoneId:'UTC',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>result.pageErrors.push({profile:entry.name,message:error.message}));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(baseURL).origin){result.externalRequests.push(route.request().url());return route.abort();}return route.continue();});
  try{
    const query=new URLSearchParams({theme:profile.theme,density:profile.density,text:String(profile.text),surface});
    await page.goto(`${baseURL}${surface==='minimal'?'minimal':'product'}.html?${query}`,{waitUntil:'load'});
    await page.waitForFunction(()=>window.tabsGeometryProbe?.ready||window.tabsGeometryProbe?.bootstrapError);
    assert.equal(await page.evaluate(()=>window.tabsGeometryProbe.bootstrapError||null),null,'actual fixture mount');
    assert.equal((await probe(page)).version,plan.package_version,'browser uses the exact public package');await settle(page);
    if(surface==='minimal')await minimal(page,entry);else if(surface==='board')await taskBoard(page,entry);else if(surface==='wiki')await wiki(page,entry);else await nested(page,entry);
    entry.adapter=await probe(page);assert.deepEqual(entry.adapter.unsupported,[],'no unsupported synthetic operations');
    entry.status=candidate?'PASS':'BASELINE_RECORDED';
  }catch(error){entry.status='FAIL';entry.error=error.stack;await page.screenshot({path:join(evidence,entry.name+'-failure.png')}).catch(()=>{});throw error;}
  finally{await context.close();}
}

try{
  tasks.forEach(validateTask);assert.equal(readProjectContext(navigationContext).id,project.id);result.fixtureContracts='PASS';
  if(buildOnly){
    const bundles=await build({configFile:false,root:fixtureRoot,logLevel:'error',build:{write:false,minify:false,emptyOutDir:false,
      rollupOptions:{input:{minimal:join(fixtureRoot,'minimal.html'),product:join(fixtureRoot,'product.html')}}}});
    const outputs=(Array.isArray(bundles)?bundles:[bundles]).flatMap(bundle=>bundle.output||[]);
    const modules=outputs.filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules||{}));
    const entries=['ui/src/board/board.js','ui/src/board/task-dialog.js','web/wiki.js'];
    for(const file of entries)assert.ok(modules.some(id=>id.endsWith('/'+file)),'actual module bundled: '+file);
    result.build={status:'PASS',checkedEntries:entries,outputs:outputs.map(item=>({file:item.fileName,kind:item.type}))};result.browserChecks='NOT_RUN';
  }else{
    const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
    server=await createServer({configFile:false,root:fixtureRoot,logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[product,await realpath(join(product,'node_modules'))]}}});
    await server.listen();const baseURL=`http://127.0.0.1:${server.httpServer.address().port}/`;
    browser=await chromium.launch({headless:true});result.browser=browser.version();
    // Cause is isolated first, then confirmed against actual consumer compositions with the same profiles.
    for(const surface of ['minimal','board','wiki'])for(const profile of plan.profiles)await runProfile(profile,surface,baseURL);
    await runProfile(plan.profiles[0],'nested',baseURL);
    assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.externalRequests,[]);
    if(!candidate)assert.equal(result.profiles.filter(entry=>entry.baselineReproduced).length,2,'minimal and actual Task baseline recognizers must both run');
    result.status=candidate?'PASS':'BASELINE_REPRODUCED';result.browserChecks=result.status;
  }
}catch(error){result.status=buildOnly||browser?'FAIL':'BLOCKED';result.error=error.stack;result.browserChecks=buildOnly?'NOT_RUN':result.status;process.exitCode=1;}
finally{
  await browser?.close();await server?.close();
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,build:result.build?.status,browserChecks:result.browserChecks,evidence,error:result.error},null,2));
}
