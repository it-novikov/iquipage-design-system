// Independent R2 diagnostic. Executes immutable application source; writes no product state.
// The native DOM drawer is an EventTarget double; this is not a browser acceptance test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMapsTaskContext} from './review-67abc87/products/sprintique/web/maps-task-context.js';
import {parseMapRoute,mapRouteHash} from './review-67abc87/products/sprintique/web/maps-route.js';
import {parseTaskRoute} from './review-67abc87/products/sprintique/ui/src/board/task-route.js';
import {retainedRouteHash,sectionRouteHash} from './review-67abc87/products/sprintique/web/section-route.js';

const product=new URL('./review-67abc87/products/sprintique/',import.meta.url);
const text=path=>readFileSync(new URL(path,product),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const turn=()=>new Promise(r=>setImmediate(r));
console.log('R2_SOURCE',JSON.stringify(Object.fromEntries(['web/maps-host.js','web/maps-task-context.js','web/main.js','ui/src/board/task-dialog.js'].map(path=>[path,createHash('sha256').update(text(path)).digest('hex')]))));

function sourceFunction(path,start,end=null){
  const source=text(path),begin=source.indexOf(start),finish=end?source.indexOf(end,begin):source.length;
  assert.ok(begin>=0&&finish>begin,'actual source boundary exists');return source.slice(begin,finish);
}
const hostBody=sourceFunction('web/maps-host.js','export async function mountMapsHost').replace('export ','');
const showProjectBody=sourceFunction('web/main.js','async function showProject(id,mode=routeMode()){','async function navigate(mode){');
const navigateBody=sourceFunction('web/main.js','async function navigate(mode){',"root.addEventListener('click'");
const hashBody=sourceFunction('web/main.js',"window.addEventListener('hashchange'",'\ntry{session=');

function environment(initialHash){
  const previous={location:globalThis.location,history:globalThis.history,document:globalThis.document};
  const location=new URL('https://qa.invalid/?project=alpha'+initialHash),writes=[];
  let state=null,onHash;const errors=[];
  const history={get state(){return state;},replaceState(value,_title,url){state=value;location.href=new URL(url,location).href;writes.push(location.hash);},
    pushState(value,_title,url){this.replaceState(value,_title,url);},back(){throw Error('Unexpected diagnostic Back');},forward(){throw Error('Unexpected diagnostic Forward');}};
  const root={isConnected:true,contains:()=>false,querySelector:()=>null};
  Object.assign(globalThis,{location,history,document:{activeElement:null}});
  // These are the actual shell showProject, navigate and hashchange bodies. While mount is pending,
  // showProject has navigating=true and board=null (web/main.js:176,186,226), so its initial guard runs.
  Function('window','parseTaskRoute','retainedRouteHash','sectionRouteHash','report',
    "let navigating=true,board=null,viewMode='maps',currentProject={id:'p'};const isWorkbenchPath=()=>false;"+
    showProjectBody+navigateBody+hashBody)(
    {addEventListener:(_name,callback)=>{onHash=callback;}},parseTaskRoute,retainedRouteHash,sectionRouteHash,error=>errors.push(error));
  return {root,location,history,writes,errors,onHash:()=>onHash(),restore(){Object.assign(globalThis,previous);}};
}

for(const target of ['#maps/A','#maps/A/task/T2/work','#/task/T2'])test(`R2-F1: initial Task read must not overrule the newer ${target}`,async()=>{
  const env=environment('#maps/A/task/T1'),held=deferred(),started=deferred(),opened=[];
  try{
    const maps={current:{id:'A'},readyToLeave:async()=>true,message(){},destroy(){}};
    const repository={context:{actorId:'a'},capabilities:{attachments:false},read:async(collection,id)=>{
      assert.equal(collection,'tasks');started.resolve();await held.promise;return {id,displayId:id,projectId:'p'};
    }};
    const mount=Function('mountMaps','can','parseMapRoute','mapRouteHash','createMapsTaskContext','return ('+hostBody+')')(
      async(_root,config)=>{config.onOpenMap({id:'A'});return maps;},()=>false,parseMapRoute,mapRouteHash,
      options=>createMapsTaskContext({...options,openDialog:async task=>{
        const el=new EventTarget();Object.assign(el,{isConnected:true,close(){this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
        el.taskController={taskId:task.id,taskKey:task.displayId,close:async()=>{el.close();return true;},setSection:value=>value};
        opened.push(task.id);return el;
      }}));
    const pending=mount(env.root,{repository,project:{id:'p',workspaceId:'w'}});await started.promise;
    env.history.replaceState(null,'',target);env.onHash();await turn();
    held.resolve();const host=await pending;
    console.log('R2_F1_OBSERVED',JSON.stringify({attempted:target,task:host.currentTask(),hash:env.location.hash,opened,errors:env.errors.map(e=>e.message)}));
    assert.equal(env.errors.length,0);
    assert.equal(env.location.hash,target,'a delayed initial Task must not overwrite the later native hash intent');
    assert.equal(host.currentTask(),parseMapRoute(target)?.taskKey||null,'abandoned Task must not appear');
  }finally{env.restore();}
});

test('R2-F2: a successful actual initial-map retry must complete the contextual Task route',async()=>{
  globalThis.HTMLElement ||= class {};
  const {MapsFeature}=await import('./review-67abc87/products/sprintique/ui/src/maps.js');
  const env=environment('#maps/A/task/T1'),opened=[],taskReads=[];let failList=true,feature;
  try{
    const repository={context:{actorId:'a'},capabilities:{attachments:false},
      async list(collection){assert.equal(collection,'maps');if(failList)throw Error('Synthetic initial map list failed');return [{id:'A',projectId:'p',status:'active',updatedAt:'2026-01-01'}];},
      async read(collection,id){if(collection==='maps')return {id,projectId:'p',status:'active',updatedAt:'2026-01-01'};taskReads.push(id);return {id,displayId:id,projectId:'p'};}};
    const mount=Function('mountMaps','can','parseMapRoute','mapRouteHash','createMapsTaskContext','return ('+hostBody+')')(
      async(_root,config)=>{
        feature={alive:true,abort:new AbortController(),mapGeneration:0,mapReads:new Set(),positions:new Map(),config,repository,project:{id:'p'},permissions:{read:true},
          surface:{innerHTML:''},inspector:{hidden:true},renderChrome(){},message(){},buildBoard(){this.board={viewport:{x:0,y:0,zoom:1}};},readyToLeave:async()=>true};
        feature.reloadList=(...args)=>MapsFeature.prototype.reloadList.apply(feature,args);
        feature.openMap=(...args)=>MapsFeature.prototype.openMap.apply(feature,args);
        feature.loadInitial=(...args)=>MapsFeature.prototype.loadInitial.apply(feature,args);
        await feature.loadInitial();return feature;
      },()=>false,parseMapRoute,mapRouteHash,
      options=>createMapsTaskContext({...options,openDialog:async task=>{
        const el=new EventTarget();Object.assign(el,{isConnected:true,close(){this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
        el.taskController={taskId:task.id,taskKey:task.displayId,close:async()=>{el.close();return true;},setSection:value=>value};opened.push(task.id);return el;
      }}));
    const host=await mount(env.root,{repository,project:{id:'p',workspaceId:'w'}});
    assert.match(feature.surface.innerHTML,/Synthetic initial map list failed/);
    assert.match(feature.surface.innerHTML,/data-map-initial-retry/);
    assert.equal(host.currentTask(),null);
    failList=false;await feature.loadInitial();await turn();
    console.log('R2_F2_OBSERVED',JSON.stringify({map:feature.current?.id,hash:env.location.hash,task:host.currentTask(),taskReads,opened}));
    assert.equal(feature.current.id,'A');assert.equal(env.location.hash,'#maps/A/task/T1');
    assert.equal(host.currentTask(),'T1','retry should finish the contextual deep link, not leave its Task URL without its drawer');
  }finally{env.restore();}
});

test('R2-F3: a failed reload that retains the Task must preserve the guard for a newly typed comment',async()=>{
  const env=environment('#maps/A/task/T1');let failRead=false,seenReload,confirmations=0;
  const actualDirty=sourceFunction('ui/src/board/task-dialog.js','      let discarded=false;','      const saveState=');
  const actualReloadHandler=sourceFunction('ui/src/board/task-dialog.js',"        saveState.addEventListener('click'",'      let setSection=');
  // The last brace in this slice closes the unchanged autosave condition, outside the handler itself.
  const handlerBody=actualReloadHandler.slice(0,actualReloadHandler.lastIndexOf('      }'));
  const actualClose=sourceFunction('ui/src/board/task-dialog.js','      async function close({keepOpen=false}={}){','      el.taskController=');
  try{
    const maps={current:{id:'A'},readyToLeave:async()=>true,message(){},destroy(){}};
    const repository={read:async(_collection,id)=>{if(failRead)throw Error('Synthetic reload read failed');return {id,displayId:id,projectId:'p'};}};
    const context=createMapsTaskContext({root:env.root,maps,repository,project:{id:'p'},canEdit:true,canManage:false,openDialog:async(task,options)=>{
      const el=new EventTarget();Object.assign(el,{isConnected:true,close(){this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
      const state={comment:''};let reloadClick;
      const guard=Function('el','dialog','saveState','onReload','state',
        "const canEdit=true,autosave=true,current={},form={};let saving=false,confirming=false;const files={dirty:()=>false},links=null,materials=null,wikiLinks=null,personal=null,agents=null;const threads={dirty:()=>!!state.comment,isBusy:()=>false};const read=()=>({title:'Existing saved title'}),baseline=JSON.stringify(read());const flush=async()=>true;"+
        actualDirty+handlerBody+actualClose+"return {close,dirty};")(
        el,()=>{confirmations++;const dialog=new EventTarget();queueMicrotask(()=>dialog.dispatchEvent(new Event('iq-close')));return dialog;},
        {addEventListener:(_name,cb)=>{reloadClick=cb;}},
        ()=>{seenReload=options.onReload();seenReload.catch(()=>{});return seenReload;},state);
      el.taskController={...guard,taskId:task.id,taskKey:task.displayId,setSection:value=>value};
      el.editComment=value=>{state.comment=value;};el.clickReload=()=>reloadClick({target:{closest:()=>({dataset:{saveAction:'reload'}})}});
      return el;
    }});
    const first=await context.openTask('T1',{fromRoute:true});
    first.editComment('Control draft before any reload');assert.equal(first.taskController.dirty(),true);
    assert.equal(await first.taskController.close({keepOpen:true}),false,'the same actual guard asks before reload');
    assert.equal(first.isConnected,true);assert.equal(confirmations,1);confirmations=0;first.editComment('');
    // The reload control exists after a real autosave CONFLICT (task-dialog.js:375–376), or failed fresh plan read (399–402).
    failRead=true;first.clickReload();await assert.rejects(seenReload,/Synthetic reload read failed/);
    assert.equal(first.isConnected,true,'the new host intentionally retains the source drawer on preparation failure');
    first.editComment('A new unpublished comment typed AFTER the failed reload');
    const dirty=first.taskController.dirty(),accepted=await first.taskController.close();
    console.log('R2_F3_OBSERVED',JSON.stringify({dirty,accepted,connected:first.isConnected,confirmations,hash:env.location.hash,currentTask:context.currentTask()}));
    assert.equal(dirty,true,'a newly typed comment must be protected after failed reload');
    assert.equal(accepted,false);assert.equal(first.isConnected,true);assert.equal(confirmations,1);
  }finally{env.restore();}
});
