import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
import {startServer} from '../scripts/server.mjs';
const server=await startServer(0),out=new URL('../evidence/large-list/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(15000);const checks=[],errors=[],metrics={};let failure;page.on('pageerror',e=>errors.push(e.message));
const mark=text=>{checks.push(text);console.log('PASS',text);};
try{
  await page.goto(server.url+'/?fixture=large-'+crypto.randomUUID());await page.locator('[data-select]').first().waitFor();
  await page.evaluate(async()=>{
    const f=window.planningFixture,rows=Array.from({length:10000},(_,i)=>({id:'large/item-'+i,taskId:'item-'+i,key:'PERF-'+i,title:'Проверяемый результат '+i+' '+('с подробным названием '.repeat(i%4)),type:'task',priority:'normal',preparation:'ready',statusLabel:'Готово к работе',depth:0,childrenCount:0,contextOnly:false,selectable:true}));
    f.adapter.listGroups=async({projectId})=>({projectId,protocol:'sprintique.planning-view/1',revision:'large-1',items:[{id:'large',title:'Большой релиз',state:'planned',total:10000,matched:10000}],nextCursor:null,capabilities:{}});
    f.adapter.listRows=async({projectId,groupId,cursor})=>{const at=Number(cursor||0);return {projectId,groupId,revision:'large-1',rows:rows.slice(at,at+200),nextCursor:at+200<rows.length?String(at+200):null};};
    await f.view.controller.filter({query:'',preparation:'all',history:'current'});
  });
  await page.locator('[data-select="item-0"]').waitFor();
  for(let size=400;size<=10000;size+=200){
    await page.getByRole('button',{name:'Показать ещё задачи',exact:true}).click();
    await page.waitForFunction(n=>window.planningFixture.view.controller.groups[0].rows.length===n,size);
  }
  metrics.loaded=await page.evaluate(()=>window.planningFixture.view.controller.groups[0].rows.length);
  metrics.rendered=await page.locator('[data-window-id]').count();assert.equal(metrics.loaded,10000);assert.ok(metrics.rendered<70);
  mark('Planning accepts 10,000 rows through bounded pages while keeping fewer than 70 DOM rows');
  await page.locator('.pn-scroll').evaluate(el=>el.scrollTop=0);await page.locator('[data-select="item-0"]').waitFor();
  await page.locator('[data-open="item-0"]').focus();
  await page.locator('.pn-scroll').evaluate(el=>el.scrollTop=350000);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-open')),'item-0');
  assert.ok(await page.locator('[data-window-id]').count()<70);mark('Focus is retained outside the viewport without retaining the complete list');
  await page.keyboard.press('Control+End');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-open')==='item-9999');
  await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-open')==='item-9998');
  mark('Keyboard moves through offscreen rows without losing the current control');
  metrics.scroll=await page.evaluate(async()=>{
    document.activeElement.blur();const el=document.querySelector('.pn-scroll'),frames=[];let last;
    for(let i=0;i<90;i++)await new Promise(resolve=>requestAnimationFrame(time=>{if(last!==undefined)frames.push(time-last);last=time;el.scrollTop=Math.max(0,el.scrollTop-220);resolve();}));
    frames.sort((a,b)=>a-b);return {p95FrameIntervalMs:frames[Math.floor(frames.length*.95)],samples:frames.length,environment:'headless Chromium; not a device FPS guarantee'};
  });
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await page.locator('[data-window-id]').count()<70);
    await page.screenshot({path:new URL('window-'+width+'.png',out).pathname});
  }
  mark('Viewport resize preserves bounded rendering and does not overflow the document');
  await page.getByRole('link',{name:'Доска задач',exact:true}).click();await page.getByRole('heading',{name:'Доска задач',exact:true}).waitFor();
  await page.waitForTimeout(100);assert.deepEqual(errors,[]);mark('Large-list teardown leaves no late callback errors');
}catch(error){failure=error;console.error(error);await page.screenshot({path:new URL('failure.png',out).pathname});}
finally{await writeFile(new URL('report.json',out),JSON.stringify({status:failure?'FAIL':'PASS',scope:'frontend port with synthetic paginated projection',checks,metrics,errors,error:failure?.stack},null,2));await browser.close();await server.close();}
if(failure)process.exitCode=1;
