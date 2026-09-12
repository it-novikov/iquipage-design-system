import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
import {startServer} from '../scripts/server.mjs';
const server=await startServer(0),out=new URL('../evidence/r3-map-lifecycle/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(10000);
const checks=[],errors=[];let failure;
page.on('pageerror',error=>errors.push(error.message));
const pass=text=>{checks.push(text);console.log('PASS',text);};
try{
  await page.goto(server.url+'/?fixture=r3-map-lifetime-'+crypto.randomUUID()+'#maps');
  await page.locator('iq-whiteboard').waitFor();
  await page.evaluate(async()=>{
    const f=window.planningFixture.view,r=window.planningFixture.repository;
    const {createMap}=await import('/packages/maps/src/model.js');
    window.mapLife={f,r,a:structuredClone(f.current),b:await r.write('maps',createMap({projectId:window.planningFixture.project.id,title:'Другая карта'}),0)};
  });
  const external=await page.evaluate(async()=>{
    const {f,r,a,b}=window.mapLife,read=r.read.bind(r);let resume,started;
    const began=new Promise(resolve=>{started=resolve;});
    r.read=(collection,id,...rest)=>collection==='maps'&&id===a.id?new Promise(resolve=>{resume=resolve;started();}):read(collection,id,...rest);
    const pending=f.externalUpdate({id:a.id,revision:a.revision+1});await began;
    await f.openMap(b.id);resume({...a,revision:a.revision+1});await pending;r.read=read;
    return {actual:f.current.id,expected:b.id,canvas:f.board.data.title};
  });
  assert.equal(external.actual,external.expected,'Late refresh of A must not replace open map B');
  assert.equal(external.canvas,'Другая карта');
  pass('Late external refresh cannot replace another open map, even when the adapter ignores abort');
  const opened=await page.evaluate(async()=>{
    const {f,r,a,b}=window.mapLife,read=r.read.bind(r);let resume,started;
    const began=new Promise(resolve=>{started=resolve;});
    r.read=(collection,id,...rest)=>collection==='maps'&&id===a.id?new Promise(resolve=>{resume=resolve;started();}):read(collection,id,...rest);
    const first=f.openMap(a.id);await began;await f.openMap(b.id);resume(a);
    const firstResult=await first;r.read=read;return {actual:f.current.id,expected:b.id,firstResult};
  });
  assert.equal(opened.actual,opened.expected);assert.equal(opened.firstResult,false);
  pass('The last requested map wins when open-map responses arrive out of order');
  const metadata=await page.evaluate(async()=>{
    const {f,r,a,b}=window.mapLife;await f.openMap(a.id);
    const write=r.write.bind(r);let resume,started;const began=new Promise(resolve=>{started=resolve;});
    r.write=(collection,value,...rest)=>collection==='maps'&&value.id===a.id?new Promise(resolve=>{resume=resolve;started();}):write(collection,value,...rest);
    const next={...structuredClone(f.current),title:'Название сохранено позднее'};
    const saving=f.saveMetadata(next);await began;await f.openMap(b.id);
    resume({...next,revision:next.revision+1});const result=await saving;r.write=write;
    return {actual:f.current.id,expected:b.id,result:result.title};
  });
  assert.equal(metadata.actual,metadata.expected);assert.equal(metadata.result,'Название сохранено позднее');
  pass('A completed metadata write returns its result without taking over a different map');
  const monotonic=await page.evaluate(async()=>{
    const {f,r,b}=window.mapLife;await f.openMap(b.id);
    const read=r.read.bind(r),waiting=[];
    r.read=(collection,id,...rest)=>collection==='maps'&&id===b.id?new Promise(resolve=>{waiting.push(resolve);}):read(collection,id,...rest);
    const newer=f.externalUpdate({id:b.id,revision:b.revision+2});
    const older=f.externalUpdate({id:b.id,revision:b.revision+1});
    const response=revision=>({...b,revision,document:{...b.document,revision}});
    waiting[1](response(b.revision+1));await older;
    waiting[0](response(b.revision+2));await newer;r.read=read;
    return {actual:f.current.revision,expected:b.revision+2};
  });
  assert.equal(monotonic.actual,monotonic.expected);
  pass('Concurrent refreshes of the same map keep the highest confirmed revision');
  const rejected=await page.evaluate(async()=>{
    const {f,r,a,b}=window.mapLife,read=r.read.bind(r);let reject,started;
    const began=new Promise(resolve=>{started=resolve;});
    r.read=(collection,id,...rest)=>collection==='maps'&&id===a.id?new Promise((_resolve,fail)=>{reject=fail;started();}):read(collection,id,...rest);
    const obsolete=f.openMap(a.id);await began;await f.openMap(b.id);
    reject(Error('Delayed failure in the previous map'));const result=await obsolete;r.read=read;
    return {result,actual:f.current.id,expected:b.id};
  });
  assert.equal(rejected.result,false);assert.equal(rejected.actual,rejected.expected);
  pass('An obsolete open-map error does not fail or replace the newer successful navigation');
  const disposed=await page.evaluate(async()=>{
    const {f,r,b}=window.mapLife,read=r.read.bind(r);let resume,started;
    const began=new Promise(resolve=>{started=resolve;});
    r.read=(collection,id,...rest)=>collection==='maps'&&id===b.id?new Promise(resolve=>{resume=resolve;started();}):read(collection,id,...rest);
    const pending=f.externalUpdate({id:b.id,revision:b.revision+1});await began;
    const destroyed=await f.destroy();f.root.textContent='Следующий раздел';
    resume({...b,revision:b.revision+1});await pending;r.read=read;
    return {destroyed,text:f.root.textContent,boards:f.root.querySelectorAll('iq-whiteboard').length};
  });
  assert.equal(disposed.destroyed,true);assert.equal(disposed.text,'Следующий раздел');assert.equal(disposed.boards,0);
  pass('A destroyed map cannot modify the next screen when a pending read resolves');
  assert.deepEqual(errors,[]);
}catch(error){failure=error;console.error(error);await page.screenshot({path:new URL('failure.png',out).pathname});}
finally{
  await writeFile(new URL('report.json',out),JSON.stringify({status:failure?'FAIL':'PASS',scope:'actual map component with isolated delayed adapters',checks,errors,error:failure?.stack},null,2)+'\n');
  await browser.close();await server.close();
}
if(failure)process.exitCode=1;
