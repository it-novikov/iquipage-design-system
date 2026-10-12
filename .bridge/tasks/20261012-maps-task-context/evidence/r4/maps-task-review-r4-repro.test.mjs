// Independent R4 closure probe. Product source is immutable e1e33787; original R3 diagnostic is unchanged.
// Browser event delivery, DOM painting and fixture reads are explicit diagnostic doubles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMapsTaskContext} from './review-r4-e1e33787/products/sprintique/web/maps-task-context.js';
import {parseMapRoute,mapRouteHash} from './review-r4-e1e33787/products/sprintique/web/maps-route.js';
import {parseTaskRoute} from './review-r4-e1e33787/products/sprintique/ui/src/board/task-route.js';
import {retainedRouteHash,sectionRouteHash} from './review-r4-e1e33787/products/sprintique/web/section-route.js';

const product=new URL('./review-r4-e1e33787/products/sprintique/',import.meta.url);
const read=path=>readFileSync(new URL(path,product),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {resolve,reject,promise};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const slice=(source,start,end=null)=>{const first=source.indexOf(start),last=end?source.indexOf(end,first):source.length;assert.ok(first>=0&&last>first);return source.slice(first,last);};
const showBody=slice(read('web/main.js'),'async function showProject(id,mode=routeMode()){','async function navigate(mode){');
const navigateBody=slice(read('web/main.js'),'async function navigate(mode){',"root.addEventListener('click'");
const hashBody=slice(read('web/main.js'),"window.addEventListener('hashchange'",'\ntry{session=');
console.log('R4_SOURCE',JSON.stringify(Object.fromEntries(['web/maps-host.js','web/maps-task-context.js','web/main.js','ui/src/board/task-dialog.js'].map(path=>[path,createHash('sha256').update(read(path)).digest('hex')]))));

function environment(initialHash){
  const previous={location:globalThis.location,history:globalThis.history,document:globalThis.document,window:globalThis.window};
  const location=new URL('https://qa.invalid/?project=alpha'+initialHash),window=new EventTarget(),writes=[];let state=null;
  const history={get state(){return state;},replaceState(value,_title,url){state=value;location.href=new URL(url,location).href;writes.push(location.hash);},
    pushState(value,_title,url){this.replaceState(value,_title,url);},back(){throw Error('Unexpected history traversal');},forward(){throw Error('Unexpected history traversal');}};
  const root={isConnected:true,contains:()=>false,querySelector:()=>null};
  Object.assign(globalThis,{location,history,document:{activeElement:null},window});
  return {root,location,history,window,writes,nativeHash(hash,nativeState=null){location.hash=hash;state=nativeState;window.dispatchEvent(new Event('hashchange'));},restore(){Object.assign(globalThis,previous);}};
}
function taskDouble(task,options){
  const el=new EventTarget();Object.assign(el,{isConnected:true,options,close(){this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
  el.taskController={taskId:task.id,taskKey:task.displayId,close:async({keepOpen=false}={})=>{if(!keepOpen)el.close();return true;},setSection:value=>value};
  options.replace?.close(true);return el;
}
function installShell(initialBoard,errors){
  return Function('initialBoard','window','parseTaskRoute','retainedRouteHash','sectionRouteHash','report',
    "let board=initialBoard,viewMode='maps',currentProject={id:'p'},navigating=false,routeVersion=0,pendingHashRoute=null;const isWorkbenchPath=()=>false,track=()=>{};"+
    showBody+navigateBody+hashBody+"return {navigate,getState:()=>({navigating,routeVersion,pendingHashRoute,viewMode})};")(
      initialBoard,window,parseTaskRoute,retainedRouteHash,sectionRouteHash,error=>errors.push(error));
}

test('R3-F1: the queued newest Maps Task must survive an older section leave whose Map guard refuses',async()=>{
  const env=environment('#maps/A/task/T1'),held=deferred(),started=deferred(),errors=[],reads=[];
  try{
    const maps={current:{id:'A'},async readyToLeave(){started.resolve();return held.promise;},message(){},destroy(){}};
    const context=createMapsTaskContext({root:env.root,maps,project:{id:'p'},repository:{read:async(_collection,id)=>{reads.push(id);return {id,displayId:id,projectId:'p'};}},openDialog:async(task,options)=>taskDouble(task,options)});
    await context.openTask('T1',{fromRoute:true});const shell=installShell(context,errors);
    env.nativeHash('#/task/T2');await started.promise;
    assert.equal(context.currentTask(),null,'the earlier leave has accepted T1 close and is now waiting on the Map guard');
    const latestState={latestNativeRoute:'return-to-T1',nested:{map:'A',task:'T1'}};
    env.nativeHash('#maps/A/task/T1',latestState);assert.deepEqual(shell.getState().pendingHashRoute,{hash:'#maps/A/task/T1',state:latestState,version:2},'new native intent and state are actually queued');
    held.resolve(false);await turn();await turn();
    console.log('R4_R3_F1_OBSERVED',JSON.stringify({task:context.currentTask(),hash:env.location.hash,state:env.history.state,reads,writes:env.writes,shell:shell.getState(),errors:errors.map(e=>e.message)}));
    assert.deepEqual(errors,[]);
    assert.equal(context.currentTask(),'T1','the latest route goes back inside the same Map and does not need its rejected leave');
    assert.equal(env.location.hash,'#maps/A/task/T1');
    assert.deepEqual(env.history.state,latestState,'replay keeps the exact state of the latest native target');
  }finally{env.restore();}
});
