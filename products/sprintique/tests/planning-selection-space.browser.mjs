// Dedicated frontend regression. Requires Playwright with Chromium; no backend or user session.
// Run: node tests/planning-selection-space.browser.mjs
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLANNING_PLAYWRIGHT_MODULE||process.env.PLAYWRIGHT_MODULE||'playwright');
const product=fileURLToPath(new URL('../',import.meta.url));
const evidence=resolve(process.env.PLANNING_EVIDENCE_DIR||join(product,'output/planning-selection'));
const expectedVersion='0.6.0-vnext.52';
const expectedArchive='989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const archive=join(product,'vendor',`iquipage-web-${expectedVersion}.tgz`);
const installed=JSON.parse(await readFile(join(product,'node_modules/@iquipage/web/package.json'),'utf8'));
assert.equal(installed.version,expectedVersion,'fixture must use the product .52 package');
assert.equal(hash(await readFile(archive)),expectedArchive,'unexpected vendor bytes');
await mkdir(evidence,{recursive:true});
const result={
  scope:'Planning selection frontend; adapter and Task content substituted; no persistence claim',
  package:expectedVersion,archiveSHA256:expectedArchive,
  sourceRevision:process.env.PLANNING_SOURCE_REVISION||'local worktree (see review packet)',
  planningCSS:hash(await readFile(join(product,'ui/planning/src/planning.css'))),
  node:process.version,profiles:[],geometryFailures:[],interactionFailures:[],pageErrors:[],externalRequests:[],status:'RUNNING',
};
let server,browser;

async function settle(page){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function layout(page,id){
  return page.evaluate(id=>{
    const row=document.querySelector(`[data-row="${id}"]`),bar=document.querySelector('[data-selbar]');
    const scrollable=[];
    for(let el=row.parentElement;el;el=el.parentElement)if(/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1)scrollable.push(el);
    const scroller=scrollable[0];
    const bounds=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const r=bounds(row),b=bounds(bar),label=bounds(row.querySelector('.tree-node-label'));
    const point={x:Math.min(innerWidth-1,Math.max(1,label.left+Math.min(label.width/2,100))),y:r.top+r.height/2};
    const hit=document.elementFromPoint(point.x,point.y);
    const children=[...bar.children].map(bounds),contentHeight=Math.max(...children.map(r=>r.bottom))-Math.min(...children.map(r=>r.top));
    return {row:r,bar:b,scroller:bounds(scroller),scrollTop:scroller.scrollTop,scrollOwner:scroller.id||scroller.className,
      scrollableAncestors:scrollable.length,rowHit:row.contains(hit),barWrapped:contentHeight>Math.max(...children.map(r=>r.height))+1,
      outerScrollTop:document.querySelector('#host-view').scrollTop,
      viewport:{width:innerWidth,height:innerHeight},activeRow:document.activeElement?.dataset.row||null,
      intersection:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left))*Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)),
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
      documentScrolls:document.documentElement.scrollHeight>innerHeight+1};
  },id);
}

async function focusNearBottom(page,id){
  await page.locator(`[data-row="${id}"]`).evaluate(row=>{
    let scroller=row.parentElement;
    while(scroller&&!( /auto|scroll/.test(getComputedStyle(scroller).overflowY)&&scroller.scrollHeight>scroller.clientHeight))scroller=scroller.parentElement;
    scroller.scrollTop+=row.getBoundingClientRect().bottom-(scroller.getBoundingClientRect().bottom-12);
    row.focus({preventScroll:true});
  });
  await settle(page);
}

function checkUncovered(value,label){
  // Collect geometry separately so a historical red run still exercises the last row and narrow wrap.
  const checks={
    overlap:value.intersection===0,
    viewportAboveBar:value.scroller.bottom<=value.bar.top+1,
    rowBottom:value.row.bottom<=value.scroller.bottom+1,
    rowTop:value.row.top>=value.scroller.top-1,
    rowHit:value.rowHit,
    barInViewport:value.bar.top>=0&&value.bar.bottom<=value.viewport.height+1&&value.bar.left>=0&&value.bar.right<=value.viewport.width+1,
    singleScrollport:value.scrollableAncestors===1&&!value.documentScrolls,
    horizontalOverflow:!value.horizontalOverflow,
  };
  for(const [check,passed] of Object.entries(checks))if(!passed)result.geometryFailures.push({label,check});
}

async function profile(options,baseURL){
  const context=await browser.newContext({viewport:options.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',error=>result.pageErrors.push(error.message));
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==new URL(baseURL).origin){result.externalRequests.push(route.request().url());return route.abort();}
    return route.continue();
  });
  const entry={...options,zoom:'1x headless viewport; browser UI zoom not exercised',checks:[]};
  result.profiles.push(entry);
  try{
    await page.goto(`${baseURL}?theme=${options.theme}&density=${options.density}`);
    await page.waitForFunction(()=>window.planningProbe?.ready===true);
    await focusNearBottom(page,'task-18');
    entry.unselected=await layout(page,'task-18');
    await page.keyboard.press('Space');
    await page.locator('[data-selbar]').waitFor({state:'visible'});
    await settle(page);
    entry.selection=await layout(page,'task-18');
    await page.screenshot({path:join(evidence,`${options.name}-selection.png`)});
    checkUncovered(entry.selection,`${options.name} selected middle row`);
    if(options.name==='narrow')assert.equal(entry.selection.barWrapped,true,'narrow fixture actually exercises wrapped actions');
    assert.equal(entry.selection.activeRow,'task-18','Space retains roving row focus');
    entry.checks.push('selected row and separately sized action area');

    await page.keyboard.press('Shift+ArrowDown');
    assert.equal(await page.locator('.tree-row.is-selected').count(),2,'range selection still works');
    await page.keyboard.press('m');
    await page.locator('.pl-menu').waitFor({state:'visible'});
    await settle(page);
    entry.menu=await page.locator('.pl-menu').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:innerWidth,height:innerHeight};});
    assert.ok(entry.menu.top>=0&&entry.menu.bottom<=entry.menu.height+1&&entry.menu.left>=0&&entry.menu.right<=entry.menu.width+1,'menu fits viewport');
    await page.screenshot({path:join(evidence,`${options.name}-menu.png`)});
    await page.keyboard.press('Escape');
    await page.locator('.pl-menu').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.row),'task-19','menu Escape returns row anchor');
    checkUncovered(await layout(page,'task-19'),`${options.name} keyboard menu return`);
    entry.checks.push('Space, range selection, M, menu bounds and Escape return');

    await page.keyboard.press('End');
    await page.keyboard.press('Space');
    await settle(page);
    entry.lastRow=await layout(page,'task-48');
    assert.equal(await page.locator('[data-row="task-48"]').getAttribute('aria-selected'),'true','last row is selected');
    checkUncovered(entry.lastRow,`${options.name} selected last row`);
    await page.screenshot({path:join(evidence,`${options.name}-last-row.png`)});
    const beforeTask=entry.lastRow.scrollTop;
    await page.keyboard.press('Enter');
    await page.locator('iq-dialog').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.locator('iq-dialog').waitFor({state:'detached'});
    await settle(page);
    entry.return=await layout(page,'task-48');
    assert.equal(entry.return.activeRow,'task-48','Planning onClose restores the same row');
    assert.ok(Math.abs(entry.return.scrollTop-beforeTask)<=1,'dialog return keeps scroll position');
    checkUncovered(entry.return,`${options.name} dialog return`);
    await page.keyboard.press('Escape');
    await page.locator('[data-selbar]').waitFor({state:'hidden'});
    assert.equal(await page.locator('.tree-row.is-selected').count(),0,'Escape clears selection');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.row),'task-48','clear from row keeps keyboard focus');
    entry.cleared=await layout(page,'task-48');
    assert.ok(Math.abs(entry.cleared.scroller.height-entry.unselected.scroller.height)<=1,'hidden bar leaves no reserved gap');
    entry.checks.push('last row, real product dialog wrapper / substituted Task callback, selection cancel');

    // Change of scroll owner must preserve the existing DS edge-scroll and cancel path.
    await focusNearBottom(page,'task-18');
    await page.keyboard.press('Space');
    await settle(page);
    const beforeDrag=await layout(page,'task-18');
    const label=await page.locator('[data-row="task-18"] .tree-node-label').boundingBox();
    await page.mouse.move(label.x+Math.min(100,label.width/2),label.y+Math.min(15,label.height/2));
    await page.mouse.down();
    await page.waitForTimeout(240); // existing DS hold-to-drag threshold is 200 ms
    await page.mouse.move(label.x+60,beforeDrag.scroller.bottom-6,{steps:6});
    await page.waitForTimeout(240); // allow several auto-scroll animation frames
    const afterDrag=await layout(page,'task-18');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.ok(afterDrag.scrollTop>beforeDrag.scrollTop,'drag edge moves the nearest Planning scrollport');
    assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-tree-drag-active')),false,'Escape cancels drag');
    assert.equal(await page.evaluate(()=>window.planningProbe.moves.length),0,'selection, menus, return and drag cancel do not move tasks');
    assert.deepEqual(await page.evaluate(()=>window.planningProbe.opened),['task-48'],'drag cancel does not dispatch a Task open');
    assert.equal(await page.locator('.tree-row.is-selected').count(),1,'drag cancel preserves the selection and action area');
    entry.drag={before:beforeDrag.scrollTop,after:afterDrag.scrollTop};
    entry.checks.push('DS drag edge scroll and cancellation without dispatch');

    await focusNearBottom(page,'task-18');
    await page.locator('[data-move-selection]').click();
    await page.getByRole('menuitem',{name:'Бэклог',exact:true}).click();
    await page.waitForFunction(()=>window.planningProbe.moves.length===1);
    await settle(page);
    entry.moveIntent=await page.evaluate(()=>window.planningProbe.moves);
    assert.equal(entry.moveIntent.length,1,'one activation dispatches one intent');
    assert.deepEqual(entry.moveIntent[0].ids,['task-18']);
    assert.equal(entry.moveIntent[0].containerId,'backlog');
    assert.deepEqual(await page.evaluate(()=>window.planningProbe.unsupported),[],'no unexpected fixture capability is used');
    await page.locator('[data-clear-selection]').click();
    await page.locator('[data-selbar]').waitFor({state:'hidden'});
    // Record the pre-existing clear-button focus behavior; do not freeze it as a desired contract.
    entry.clearButtonActiveElement=await page.evaluate(()=>document.activeElement.tagName);
    entry.checks.push('one recorded move intent; explicit no-persistence boundary; clear button hides bar');
  }catch(error){
    entry.error=error.stack;
    result.interactionFailures.push({profile:options.name,error:error.message});
  }finally{
    await context.close();
  }
}

try{
  server=await createServer({configFile:false,root:join(product,'tests/fixtures/planning-selection'),logLevel:'error',server:{host:'127.0.0.1',port:0,fs:{allow:[product]}}});
  await server.listen();
  const address=server.httpServer.address();
  const baseURL=`http://127.0.0.1:${address.port}/`;
  const launch={headless:true};
  if(process.env.PLANNING_CHROMIUM_EXECUTABLE)launch.executablePath=process.env.PLANNING_CHROMIUM_EXECUTABLE;
  if(process.env.PLANNING_CHROMIUM_ARGS)launch.args=JSON.parse(process.env.PLANNING_CHROMIUM_ARGS);
  browser=await chromium.launch(launch);
  result.browser=browser.version();
  for(const options of [
    {name:'desktop',viewport:{width:1363,height:936},theme:'light',density:'comfortable'},
    {name:'compact',viewport:{width:1280,height:720},theme:'light',density:'compact'},
    {name:'narrow',viewport:{width:320,height:568},theme:'dark',density:'comfortable'},
  ])await profile(options,baseURL);
  assert.deepEqual(result.pageErrors,[],'no uncaught application error');
  assert.deepEqual(result.externalRequests,[],'fixture did not request an external service');
  assert.deepEqual(result.interactionFailures,[],'geometry run must not hide interaction failures');
  assert.deepEqual(result.geometryFailures,[],'selection bar must not obscure selected rows or create a second scrollport');
  result.status='PASS';
}catch(error){
  result.status='FAIL';result.error=error.stack;process.exitCode=1;
}finally{
  await browser?.close();
  await server?.close();
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
