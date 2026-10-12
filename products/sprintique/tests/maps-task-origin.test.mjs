import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMapsTaskContext} from '../web/maps-task-context.js';
import {parseMapRoute,mapRouteHash} from '../web/maps-route.js';
import {taskURL,parseTaskRoute,parseTaskSection} from '../ui/src/board/task-route.js';
import {retainedRouteHash,sectionRouteHash} from '../web/section-route.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

function fixture({read,openDialog,canEdit=false}={}){
  const previous={location:globalThis.location,history:globalThis.history,document:globalThis.document,window:globalThis.window};
  const routes=[],entries=[{url:'https://qa.invalid/?project=alpha#maps/A',state:null}];let index=0;
  const location=new URL(entries[0].url);
  const history={get state(){return entries[index].state;},
    replaceState(state,_title,url){entries[index]={state,url:new URL(url,location).href};location.href=entries[index].url;},
    pushState(state,_title,url){entries.splice(++index,entries.length,{state,url:new URL(url,location).href});location.href=entries[index].url;},
    back(){if(index){location.href=entries[--index].url;routes.push(location.hash);}},
    forward(){if(index+1<entries.length){location.href=entries[++index].url;routes.push(location.hash);}},
  };
  const focus=[],opener={isConnected:true,focus:options=>focus.push(['opener',options])},fallback={focus:options=>focus.push(['fallback',options])};
  const root={isConnected:true,contains:node=>node===opener,querySelector:()=>fallback};
  const window=new EventTarget();Object.assign(globalThis,{location,history,document:{activeElement:opener},window});
  const maps={current:{id:'A',updatedAt:'2026-01-01'},board:{viewport:{x:230,y:-45,zoom:1.3},selection:['linked'],search:'план'},
    inspector:{draft:'Не потерять'},leaveCalls:0,destroyCalls:0,acceptLeave:true,
    async readyToLeave(){this.leaveCalls++;return this.acceptLeave;},
    async openMap(id){if(id!=='B')throw Error('Карта недоступна');this.current={id:'B'};return true;},
    destroy(){this.destroyCalls++;},
  };
  const reads=[],dialogs=[];
  const repository={attachmentAdapter:{},read:async(...args)=>{reads.push(args);return read?read(...args):{id:args[1],displayId:args[1].toUpperCase(),projectId:'p'};}};
  const makeDialog=(task,options)=>{
    const el=new EventTarget();Object.assign(el,{options,isConnected:true,accepted:true,forced:0,normal:0,section:'task',
      close(force=false){if(!this.isConnected)return;this.forced+=Number(force);this.isConnected=false;this.dispatchEvent(new Event('iq-close'));},
    });
    el.taskController={taskId:task.id,taskKey:task.displayId||task.id,
      close:async({keepOpen=false}={})=>{el.normal++;const accepted=typeof el.accepted==='function'?await el.accepted():el.accepted;if(accepted&&!keepOpen)el.close();return accepted;},
      setSection:value=>(el.section=value),
    };dialogs.push(el);options.replace?.close(true);return el;
  };
  const preparedDialog=async(task,options)=>{if(options.beforeOpen&&!await options.beforeOpen())return null;return makeDialog(task,options);};
  const context=createMapsTaskContext({root,maps,repository,project:{id:'p'},canEdit,canManage:false,
    openDialog:openDialog?((task,options)=>openDialog(task,options,preparedDialog)):preparedDialog});
  return {context,maps,repository,root,opener,focus,reads,dialogs,location,history,entries,window,
    async flush(){while(routes.length)await context.openRoute(routes.shift());},
    restore(){Object.assign(globalThis,previous);},
  };
}

test('a linked task and its tabs preserve the live non-default map; Back and Forward reuse its context',async()=>{
  const f=fixture(),board=f.maps.board,inspector=f.maps.inspector;
  try{
    const dialog=await f.context.openTask('t1');assert.equal(f.location.hash,'#maps/A/task/T1');
    assert.equal(f.maps.leaveCalls,0,'viewing a task must not flush or close the map inspector');
    assert.equal(dialog.options.canEdit,false,'task grants are separate from map editing');
    dialog.options.onSectionChange('work');assert.equal(f.location.hash,'#maps/A/task/T1/work');
    await f.context.openRoute(f.location.hash);dialog.options.onSectionChange('task');
    assert.equal(f.location.hash,'#maps/A/task/T1','a history visit must not disable later tab navigation');
    f.history.back();await f.flush();assert.equal(f.context.currentTask(),null);assert.equal(f.location.hash,'#maps/A');
    assert.equal(f.maps.board,board);assert.equal(f.maps.inspector,inspector);assert.deepEqual(board.viewport,{x:230,y:-45,zoom:1.3});
    assert.deepEqual(board.selection,['linked']);assert.equal(board.search,'план');assert.equal(inspector.draft,'Не потерять');
    f.history.forward();await f.flush();assert.equal(f.context.currentTask(),'T1');assert.equal(f.maps.current.id,'A');
    assert.equal(f.entries.length,2);assert.equal(f.maps.destroyCalls,0);assert.equal(f.maps.leaveCalls,0);
  }finally{f.restore();}
});
test('linked task chains occupy one history step and close back to the original opener',async()=>{
  const f=fixture();try{
    const first=await f.context.openTask('t1');await first.options.onOpenTask('t2');
    assert.equal(f.context.currentTask(),'T2');assert.equal(first.normal,1,'handoff settles the normal draft guard');
    assert.equal(first.forced,1,'an accepted guard permits the existing instantaneous dialog replacement');assert.equal(f.entries.length,2);
    f.dialogs.at(-1).close();await f.flush();assert.equal(f.location.hash,'#maps/A');assert.equal(f.context.currentTask(),null);
    assert.equal(f.focus.at(-1)[0],'opener');assert.equal(f.focus.at(-1)[1].preventScroll,true);
    f.history.forward();await f.flush();assert.equal(f.context.currentTask(),'T2');
  }finally{f.restore();}
});
test('refusing Back preserves the dirty task and the existing history pair; a later accepted Back works',async()=>{
  const f=fixture();try{
    const dialog=await f.context.openTask('t1');dialog.accepted=false;
    f.history.back();await f.flush();assert.equal(f.location.hash,'#maps/A/task/T1');assert.equal(f.context.currentTask(),'T1');
    assert.equal(dialog.isConnected,true);assert.equal(dialog.forced,0);assert.equal(f.maps.leaveCalls,0);assert.equal(f.entries.length,2);
    dialog.accepted=true;f.history.back();await f.flush();assert.equal(f.location.hash,'#maps/A');assert.equal(f.context.currentTask(),null);
  }finally{f.restore();}
});
test('leaving settles the task and then the map guard, preserving the map when its save refuses',async()=>{
  const f=fixture();try{
    const dialog=await f.context.openTask('t1');dialog.accepted=false;
    assert.equal(await f.context.closeTask(),false);assert.equal(f.maps.leaveCalls,0);assert.equal(dialog.isConnected,true);
    dialog.accepted=true;f.maps.acceptLeave=false;
    assert.equal(await f.context.closeTask(),false);assert.equal(f.context.currentTask(),null);assert.equal(f.location.hash,'#maps/A');
    assert.equal(f.maps.inspector.draft,'Не потерять');assert.equal(f.maps.destroyCalls,0);
  }finally{f.restore();}
});
test('a cancelled task read cannot open or rewrite the route after a newer intent, even if abort is ignored',async()=>{
  const held=deferred();const f=fixture({read:(_collection,id)=>id==='old'?held.promise:{id,displayId:'NEW',projectId:'p'}});
  try{
    const old=f.context.openTask('old');await Promise.resolve();await Promise.resolve();
    await f.context.openRoute('#maps/A');await f.context.openTask('new');
    held.resolve({id:'old',displayId:'OLD',projectId:'p'});assert.equal(await old,false);
    assert.equal(f.context.currentTask(),'NEW');assert.equal(f.dialogs.length,1);assert.equal(f.location.hash,'#maps/A/task/NEW');
    assert.equal(f.reads[0][3].signal.aborted,true);
  }finally{f.restore();}
});
test('destroy aborts task support loading and suppresses late drawer, URL and focus effects',async()=>{
  const held=deferred();let supportOptions;
  const f=fixture({openDialog:async(task,options,create)=>{supportOptions=options;await held.promise;return create(task,options);}});
  try{
    const opening=f.context.openTask('t1');while(!supportOptions)await Promise.resolve();
    f.history.replaceState(null,'','#planning');f.context.destroy();held.resolve();assert.equal(await opening,false);
    assert.equal(supportOptions.signal.aborted,true);assert.equal(supportOptions.isActive(),false);
    assert.equal(f.dialogs[0].isConnected,false);assert.equal(f.location.hash,'#planning');assert.equal(f.focus.length,0);assert.equal(f.maps.destroyCalls,1);
  }finally{f.restore();}
});
test('unavailable tasks leave the working map and a missing opener uses the map fallback',async()=>{
  const f=fixture({read:()=>null});try{
    f.opener.isConnected=false;await assert.rejects(f.context.openTask('gone'),/Задача недоступна/);
    assert.equal(f.location.hash,'#maps/A');assert.equal(f.context.currentTask(),null);assert.equal(f.maps.current.id,'A');
    assert.equal(f.focus.at(-1)[0],'fallback');
  }finally{f.restore();}
});
test('direct contextual links close to the named map without navigating back to an unrelated page',async()=>{
  const f=fixture();try{
    f.history.replaceState(null,'','#maps/A/task/T1/work');await f.context.openRoute(f.location.hash);
    assert.equal(f.dialogs[0].options.initialSection,'work');assert.equal(f.context.routeHash,'#maps/A/task/T1/work');
    f.dialogs[0].close();await f.flush();assert.equal(f.location.hash,'#maps/A');assert.equal(f.entries.length,1);
  }finally{f.restore();}
});
test('contextual map routes retain identity and canonical task copies keep their original destination',()=>{
  const previous=globalThis.location;globalThis.location=new URL('https://qa.invalid/?project=alpha&map=A&task=T1#maps/A/task/T1/work');
  try{
    assert.deepEqual(parseMapRoute('#maps/A/task/T%201/work'),{mapId:'A',taskKey:'T 1',section:'work'});
    assert.equal(mapRouteHash('A','T 1','work'),'#maps/A/task/T%201/work');
    for(const hash of ['#maps/A/task/%zz','#maps/A/task/T1/extra','#maps/<x>'])assert.equal(parseMapRoute(hash),null);
    assert.equal(taskURL({id:'t1',displayId:'T1'}),'https://qa.invalid/?project=alpha#/task/T1');
  }finally{globalThis.location=previous;}
});

test('an explicitly unavailable initial map never substitutes the more recently updated map',async()=>{
  globalThis.HTMLElement ||= class {};
  const {MapsFeature}=await import('../ui/src/maps.js');let opened=0;
  const feature={alive:true,abort:new AbortController(),mapGeneration:0,config:{mapId:'A'},surface:{innerHTML:''},
    renderChrome(){},repository:{},maps:[{id:'B',status:'active'}],reloadList:async()=>{},openMap:async()=>opened++,empty(){}};
  await MapsFeature.prototype.loadInitial.call(feature);
  assert.equal(opened,0);assert.match(feature.surface.innerHTML,/Карта не найдена/);assert.match(feature.surface.innerHTML,/data-map-initial-retry/);
});

// These cases cross the owner boundary missed by controller-only doubles in the first checkpoint.
// MapsFeature.openMap, the shell navigation function and the mounting host execute from current source.
async function actualMapReads(f,read){
  globalThis.HTMLElement ||= class {};
  const {MapsFeature}=await import('../ui/src/maps.js');
  Object.assign(f.maps,{alive:true,permissions:{read:true},project:{id:'p'},mapGeneration:0,mapReads:new Set(),positions:new Map(),view:'canvas',
    repository:{read},buildBoard(){throw Error('An abandoned map must never repaint');},renderChrome(){},message(){},
    config:{onOpenMap:({id})=>f.history.replaceState(f.history.state,'',mapRouteHash(id))},
  });
  f.maps.openMap=(...args)=>MapsFeature.prototype.openMap.apply(f.maps,args);
}
for(const newer of ['map-only','another-task'])test(`R1-F1: a late map read cannot replace a newer ${newer} intent on A`,async()=>{
  const f=fixture(),held=deferred(),started=deferred();let signal;const board=f.maps.board,inspector=f.maps.inspector;
  try{
    await actualMapReads(f,async(_collection,_id,_project,options)=>{signal=options.signal;started.resolve();return held.promise;});
    f.history.pushState(null,'','#maps/B/task/T1');const old=f.context.openRoute(f.location.hash);await started.promise;
    if(newer==='map-only'){f.history.back();await f.flush();}else await f.context.openTask('new');
    held.resolve({id:'B',projectId:'p'});assert.equal(await old,false);assert.equal(signal.aborted,true);
    assert.equal(f.maps.current.id,'A');assert.equal(f.maps.board,board);assert.equal(f.maps.inspector,inspector);
    assert.equal(f.context.currentTask(),newer==='map-only'?null:'NEW');
    assert.equal(f.location.hash,newer==='map-only'?'#maps/A':'#maps/A/task/NEW');
  }finally{f.restore();}
});
test('R1-F1: route cancellation during the map guard prevents the subsequent read',async()=>{
  const f=fixture(),held=deferred(),started=deferred();let reads=0;
  try{
    await actualMapReads(f,async()=>{reads++;return {id:'B',projectId:'p'};});
    f.maps.readyToLeave=async()=>{started.resolve();return held.promise;};
    f.history.pushState(null,'','#maps/B/task/T1');const old=f.context.openRoute(f.location.hash);await started.promise;
    f.history.back();await f.flush();held.resolve(true);assert.equal(await old,false);
    assert.equal(reads,0);assert.equal(f.maps.current.id,'A');assert.equal(f.location.hash,'#maps/A');
  }finally{f.restore();}
});

test('R1-F2: the actual shell retains the settled route after the map guard refuses a section switch',async()=>{
  const f=fixture();try{
    await f.context.openTask('t1');f.maps.acceptLeave=false;
    const source=readFileSync(new URL('../web/main.js',import.meta.url),'utf8');
    const start=source.indexOf('async function navigate(mode){'),end=source.indexOf("root.addEventListener('click'",start);
    assert.ok(start>=0&&end>start,'load the actual shell navigation body');
    const navigate=Function('retainedRouteHash','sectionRouteHash','board','showProject','isWorkbenchPath',
      "let navigating=false,routeVersion=0,pendingHashRoute=null,currentProject={id:'p'},viewMode='maps';return ("+source.slice(start,end).trim()+')')(
      retainedRouteHash,sectionRouteHash,f.context,async()=>f.context.closeTask(),()=>false);
    await navigate('planning');assert.equal(f.context.currentTask(),null);assert.equal(f.location.hash,f.context.routeHash);
    assert.equal(f.location.hash,'#maps/A');assert.equal(f.maps.inspector.draft,'Не потерять');
  }finally{f.restore();}
});
test('R1-F2: the actual canonical Task hash handler retains the settled map when leaving refuses',async()=>{
  const f=fixture();try{
    await f.context.openTask('t1');f.maps.acceptLeave=false;
    const source=readFileSync(new URL('../web/main.js',import.meta.url),'utf8');
    const start=source.indexOf("window.addEventListener('hashchange'"),end=source.indexOf('\ntry{session=',start);
    assert.ok(start>=0&&end>start,'load the actual canonical hash handler');let onHash,error;
    Function('window','parseTaskRoute','board','showProject','isWorkbenchPath','report',
      "let navigating=false,routeVersion=0,pendingHashRoute=null,viewMode='maps',currentProject={id:'p'};"+source.slice(start,end))(
      {addEventListener:(_name,callback)=>{onHash=callback;}},parseTaskRoute,f.context,async()=>f.context.closeTask(),()=>false,cause=>{error=cause;});
    f.history.pushState(null,'','#/task/T2');onHash();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(error,undefined);assert.equal(f.context.currentTask(),null);assert.equal(f.location.hash,'#maps/A');
  }finally{f.restore();}
});

for(const target of ['#maps/A','#maps/A/task/T2/work','#maps/B/task/T2','#maps/A/task/T1'])test(`R1-F3: initial host loading reconciles the current route ${target}`,async()=>{
  const f=fixture(),held=deferred(),started=deferred(),opened=[];
  try{
    f.history.replaceState(null,'','#maps/A/task/T1');
    const source=readFileSync(new URL('../web/maps-host.js',import.meta.url),'utf8');
    const factory=Function('mountMaps','can','parseMapRoute','mapRouteHash','createMapsTaskContext',
      'return ('+source.slice(source.indexOf('export async function mountMapsHost')).replace('export ','').trim()+')');
    const mount=factory(async(_root,config)=>{started.resolve();await held.promise;config.onOpenMap({id:'A'});return f.maps;},()=>false,parseMapRoute,mapRouteHash,
      options=>createMapsTaskContext({...options,openDialog:async(task)=>{
        const el=new EventTarget();Object.assign(el,{isConnected:true,close(){this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
        el.taskController={taskId:task.id,taskKey:task.displayId,close:async()=>{el.close();return true;},setSection:value=>value};opened.push(task.id);return el;
      }}));
    const repository={context:{actorId:'a'},capabilities:{attachments:false},read:async(_collection,id)=>({id,displayId:id,projectId:'p'})};
    const pending=mount(f.root,{repository,project:{id:'p',workspaceId:'w'}});await started.promise;
    f.history.replaceState(null,'',target);held.resolve();const host=await pending;
    const expected=parseMapRoute(target);assert.equal(host.currentTask(),expected.taskKey);assert.equal(f.location.hash,target);
    assert.deepEqual(opened,expected.taskKey?[expected.taskKey]:[]);assert.equal(f.maps.current.id,expected.mapId);
  }finally{f.restore();}
});

for(const failure of ['missing-target','support-read-error'])test(`R1-F4: the actual Task links view retains its task and explains ${failure}`,async()=>{
  globalThis.HTMLElement ||= class {};const {mountTaskLinks}=await import('../ui/src/board/link-view.js');
  const f=fixture({read:(_collection,id)=>id==='t2'&&failure==='missing-target'?null:{id,displayId:id.toUpperCase(),projectId:'p'},
    openDialog:async(task,options,create)=>{if(task.id==='t2'&&failure==='support-read-error')throw Error('Не удалось загрузить сведения задачи');return create(task,options);}});
  try{
    const first=await f.context.openTask('t1'),root=new EventTarget(),linkMap=new EventTarget(),error={hidden:true,textContent:''};
    root.insertAdjacentHTML=()=>{};root.querySelector=selector=>selector==='iq-relation-map'?linkMap:selector==='[role=alert]'?error:{hidden:true};
    f.repository.list=async()=>[{id:'l',fromId:'t1',toId:'t2',kind:'related'}];
    const task={id:'t1',projectId:'p',displayId:'T1',title:'Первая',status:'ready',type:'task'};
    const links=mountTaskLinks(root,{repository:f.repository,project:{id:'p'},task,tasks:[task,{...task,id:'t2',displayId:'T2'}],onOpenTask:first.options.onOpenTask});
    first.addEventListener('iq-close',()=>links.destroy(),{once:true});
    linkMap.dispatchEvent(new CustomEvent('iq-open',{detail:{id:'t2'}}));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.context.currentTask(),'T1');assert.equal(first.isConnected,true);assert.equal(f.location.hash,'#maps/A/task/T1');
    assert.equal(error.hidden,false);assert.match(error.textContent,failure==='missing-target'?/Задача недоступна/:/сведения задачи/);
    assert.equal(first.normal,0,'failed preparation must not ask to discard or close the current task');links.destroy();
  }finally{f.restore();}
});
test('R1-F4: refusing a prepared replacement preserves the current draft and URL',async()=>{
  const f=fixture();try{
    const first=await f.context.openTask('t1');first.accepted=false;
    assert.equal(await first.options.onOpenTask('t2'),false);assert.equal(f.context.currentTask(),'T1');
    assert.equal(f.location.hash,'#maps/A/task/T1');assert.equal(first.forced,0);assert.equal(f.dialogs.length,1);
  }finally{f.restore();}
});
test('R1-F4: closing the current Task while replacement support loads cancels that replacement',async()=>{
  const held=deferred(),started=deferred();let support;
  const f=fixture({openDialog:async(task,options,create)=>{if(task.id==='t2'){support=options;started.resolve();await held.promise;}return create(task,options);}});
  try{
    const first=await f.context.openTask('t1'),pending=first.options.onOpenTask('t2');await started.promise;
    first.close();await f.flush();held.resolve();assert.equal(await pending,false);
    assert.equal(support.signal.aborted,true);assert.equal(f.context.currentTask(),null);assert.equal(f.location.hash,'#maps/A');assert.equal(f.dialogs.length,1);
  }finally{f.restore();}
});
test('a section leave during replacement draft settlement still closes the accepted task before a map refusal',async()=>{
  const f=fixture(),held=deferred(),started=deferred();
  try{
    const first=await f.context.openTask('t1');first.accepted=async()=>{started.resolve();return held.promise;};f.maps.acceptLeave=false;
    const replacement=first.options.onOpenTask('t2');await started.promise;const leaving=f.context.closeTask();
    held.resolve(true);assert.equal(await replacement,false);assert.equal(await leaving,false);
    assert.equal(f.context.currentTask(),null);assert.equal(first.isConnected,false);assert.equal(f.location.hash,'#maps/A');
    assert.equal(f.maps.inspector.draft,'Не потерять');assert.equal(f.dialogs.length,1);
  }finally{f.restore();}
});

// R2 executes the current host, shell routing and Task preparation/guard blocks. Only DOM painting,
// external services and repository I/O are adapted here. EventTarget hash notifications are a Node
// composition check; native browser traversal and rendered controls remain the separate browser gate.
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function sourceBlock(path,start,end=null){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8'),begin=source.indexOf(start),finish=end?source.indexOf(end,begin):source.length;
  assert.ok(begin>=0&&finish>begin,`actual ${path} boundary exists: ${start}`);return source.slice(begin,finish);
}
function actualHost(mountMaps,openDialog){
  const body=sourceBlock('web/maps-host.js','export async function mountMapsHost').replace('export ','');
  return Function('mountMaps','can','parseMapRoute','mapRouteHash','createMapsTaskContext','return ('+body+')')(
    mountMaps,()=>false,parseMapRoute,mapRouteHash,options=>createMapsTaskContext({...options,openDialog}));
}
async function actualTaskPreparation(create){
  globalThis.HTMLElement ||= class {};
  const {loadTaskSupport}=await import('../ui/src/board/catalog-picker.js');
  const prefix=sourceBlock('ui/src/board/task-dialog.js','export async function openTaskDialog(','  const settings=');
  return Function('loadTaskSupport','parseTaskSection','create','return ('+prefix.replace('export ','')+'\nreturn create(task,arguments[1]);\n})')(
    loadTaskSupport,parseTaskSection,create);
}
function plainTask(task,options,opened){
  const el=new EventTarget();Object.assign(el,{isConnected:true,options,close(){if(!this.isConnected)return;this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
  el.taskController={taskId:task.id,taskKey:task.displayId,close:async({keepOpen=false}={})=>{if(!keepOpen)el.close();return true;},setSection:value=>value};
  options.replace?.close(true);opened.push({id:task.id,section:options.initialSection});return el;
}
function hashNotification(f,hash){f.history.replaceState(f.history.state,'',hash);f.window.dispatchEvent(new Event('hashchange'));}
function actualMountingShell(f,mount,repository,{initialBoard=null}={}){
  const errors=[],canonicalOpened=[],hostView={...f.root,dataset:{},childElementCount:0,innerHTML:'',firstElementChild:null};
  const root={...f.root,querySelector:selector=>selector==='#host-view'?hostView:null};
  Object.assign(repository,{holdChanges:()=>()=>{},clearProjectCache(){}});
  let show=sourceBlock('web/main.js','async function showProject(id,mode=routeMode()){','async function navigate(mode){');
  const loader="await import('./maps-host.js')";assert.equal(show.split(loader).length,2,'replace only the actual module-loader seam');
  show=show.replace(loader,'await mountMapsModule()');
  const navigate=sourceBlock('web/main.js','async function navigate(mode){',"root.addEventListener('click'");
  const hash=sourceBlock('web/main.js',"window.addEventListener('hashchange'",'\ntry{session=');
  const shell=Function('env',`
    const {root,repository,initialBoard,mountMapsModule,mountTaskBoard,parseTaskRoute,retainedRouteHash,sectionRouteHash,report}=env;
    const session={projects:[{id:'p',slug:'alpha',workspaceId:'w'}],principal:{id:'actor'}},viewStates=new Map();
    let board=initialBoard,currentProject=session.projects[0],viewMode='maps',navigating=false,routeVersion=0,pendingHashRoute=null,planningAdapter;
    let watching={projectId:'p',access:'fixture'};const accessSignature=()=> 'fixture',stopWatching=()=>{},prefetchSection=()=>{},track=()=>{};
    const workbenchOn=()=>false,isWorkbenchPath=()=>false,routeMode=()=> 'maps',LAST_PROJECT_KEY='fixture:';
    class PlanningAdapter{};const creatableReady=Promise.resolve(),ensureShell=()=>{},recoverPlanningAttempt=async()=>{},can=()=>false;
    const loadingMarkup=()=>'',sectionLoadingShape=()=>'';
    ${show}\n${navigate}\n${hash}
    return {start:()=>showProject('p','maps'),state:()=>({board,viewMode,navigating,pendingHashRoute})};
  `)({root,repository,initialBoard,mountMapsModule:async()=>({mountMapsHost:mount}),
    mountTaskBoard:async()=>({openTask:async key=>canonicalOpened.push(key),closeTask:async()=>true,destroy(){}}),
    parseTaskRoute,retainedRouteHash,sectionRouteHash,report:error=>errors.push(error)});
  return {...shell,errors,canonicalOpened};
}

for(const phase of ['task-read','support-read'])for(const target of ['#maps/A','#maps/A/task/T2','#maps/A/task/T2/work','#/task/T2'])
test(`R2-F1: ${phase} during initial mount yields to ${target} through the actual shell`,async()=>{
  const held=deferred(),started=deferred(),opened=[],signals=new WeakMap();let delayedSignal,pending;
  const f=fixture({read:async(_collection,id,_project,{signal})=>{
    signals.set(signal,id);if(id==='T1'&&phase==='task-read'){delayedSignal=signal;started.resolve();await held.promise;}
    return {id,displayId:id,projectId:'p'};
  }});
  try{
    Object.assign(f.repository,{context:{actorId:'actor'},capabilities:{attachments:false,members:false,tags:false,releases:false,taskSettings:true},
      list:async(_collection,_project,{signal})=>{if(signals.get(signal)==='T1'&&phase==='support-read'){delayedSignal=signal;started.resolve();await held.promise;}return [];}});
    f.history.replaceState(null,'','#maps/A/task/T1');
    const prepare=await actualTaskPreparation((task,options)=>plainTask(task,options,opened));
    const mount=actualHost(async(_root,config)=>{config.onOpenMap({id:'A'});return f.maps;},prepare);
    const shell=actualMountingShell(f,mount,f.repository);pending=shell.start();await started.promise;
    hashNotification(f,target);
    held.resolve();await pending;await turn();await turn();
    assert.deepEqual(shell.errors,[]);
    assert.equal(f.location.hash,target,'an old continuation cannot rewrite the new route');
    const contextual=parseMapRoute(target);
    assert.deepEqual(opened,contextual?.taskKey?[{id:contextual.taskKey,section:contextual.section}]:[],'no abandoned Task is mounted even briefly');
    if(contextual){assert.equal(shell.state().viewMode,'maps');assert.equal(shell.state().board.currentTask(),contextual.taskKey);}
    else{assert.equal(shell.state().viewMode,'tasks');assert.ok(shell.canonicalOpened.includes('T2'),'canonical Task reaches the Board owner');}
    assert.equal(delayedSignal.aborted,true,'the mounting host cancels its pending Task/support request');
  }finally{held.resolve();await pending?.catch(()=>{});await turn();f.restore();}
});

for(const failure of ['list','map-read'])for(const section of ['task','work'])
test(`R2-F2: actual initial ${failure} retry completes the ${section} deep link on A`,async()=>{
  globalThis.HTMLElement ||= class {};
  const {MapsFeature}=await import('../ui/src/maps.js');const f=fixture(),opened=[],taskReads=[];let fail=true,feature,mounts=0;
  try{
    const hash=mapRouteHash('A','T1',section);f.history.replaceState(null,'',hash);
    const repository={context:{actorId:'actor'},capabilities:{attachments:false,members:false,tags:false,releases:false,taskSettings:false},
      async list(collection){
        assert.equal(collection,'maps');if(fail&&failure==='list')throw Error('Synthetic initial list failed');
        return [{id:'A',projectId:'p',status:'active',updatedAt:'2026-01-01'},{id:'B',projectId:'p',status:'active',updatedAt:'2026-02-01'}];
      },
      async read(collection,id){
        if(collection==='maps'){assert.equal(id,'A','the retry must not substitute the newer map B');if(fail&&failure==='map-read')throw Error('Synthetic initial map read failed');return {id,projectId:'p',status:'active',updatedAt:'2026-01-01'};}
        taskReads.push(id);return {id,displayId:id,projectId:'p'};
      }};
    const prepare=await actualTaskPreparation((task,options)=>plainTask(task,options,opened));
    const mount=actualHost(async(_root,config)=>{
      mounts++;feature={alive:true,abort:new AbortController(),mapGeneration:0,mapReads:new Set(),positions:new Map(),config,repository,project:{id:'p'},permissions:{read:true},
        surface:{innerHTML:''},inspector:{hidden:true},renderChrome(){},message(){},destroy(){},buildBoard(){this.board={viewport:{x:0,y:0,zoom:1}};},readyToLeave:async()=>true};
      for(const method of ['loadInitial','reloadList','openMap'])feature[method]=(...args)=>MapsFeature.prototype[method].apply(feature,args);
      await feature.loadInitial();return feature;
    },prepare);
    const host=await mount(f.root,{repository,project:{id:'p',workspaceId:'w'}}),sameFeature=feature;
    assert.match(feature.surface.innerHTML,/Synthetic initial/);assert.match(feature.surface.innerHTML,/data-map-initial-retry/);
    assert.equal(host.currentTask(),null);assert.deepEqual(taskReads,[]);assert.deepEqual(opened,[]);
    fail=false;await feature.loadInitial();await turn();
    assert.equal(feature,sameFeature);assert.equal(mounts,1);assert.equal(feature.current.id,'A');
    assert.equal(host.currentTask(),'T1');assert.equal(f.location.hash,hash);assert.equal(host.routeHash,hash);
    assert.deepEqual(taskReads,['T1']);assert.deepEqual(opened,[{id:'T1',section}]);
  }finally{f.restore();}
});

function guardedTask(task,options){
  const el=new EventTarget(),state={comment:'',reload:null,messages:[],confirmations:[]};let reloadClick;
  Object.assign(el,{isConnected:true,options,close(){if(!this.isConnected)return;this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
  const dirty=sourceBlock('ui/src/board/task-dialog.js','      let discarded=false;','      const saveState=');
  const reload=sourceBlock('ui/src/board/task-dialog.js',"        saveState.addEventListener('click'",'      let setSection=');
  const reloadHandler=reload.slice(0,reload.lastIndexOf('      }'));
  const close=sourceBlock('ui/src/board/task-dialog.js','      async function close({keepOpen=false}={}){','      el.taskController=');
  const guard=Function('el','dialog','saveState','onReload','state','showState',
    "const canEdit=true,autosave=true,current={},form={};let saving=false,confirming=false;const files={dirty:()=>false,isBusy:()=>false},links=null,materials=null,wikiLinks=null,personal=null,agents=null;const threads={dirty:()=>!!state.comment,isBusy:()=>false};const read=()=>({title:'Existing saved title'}),baseline=JSON.stringify(read());const flush=async()=>true;"+
    dirty+reloadHandler+close+'return {close,dirty};')(
    el,options=>{const modal=new EventTarget();state.confirmations.push({modal,options,settled:false});return modal;},
    {addEventListener:(_name,callback)=>{reloadClick=callback;}},
    ()=>{state.reload=options.onReload();state.reload.catch(()=>{});return state.reload;},state,
    (text,options)=>state.messages.push({text,...options}));
  el.taskController={...guard,taskId:task.id,taskKey:task.displayId,setSection:value=>value};
  el.editComment=value=>{state.comment=value;};el.state=state;
  el.clickReload=()=>reloadClick({target:{closest:()=>({dataset:{saveAction:'reload'}})}});
  el.respond=async accepted=>{
    await turn();const confirmation=state.confirmations.find(item=>!item.settled);assert.ok(confirmation,'the actual close guard must ask');
    confirmation.settled=true;if(accepted)await confirmation.options.onSubmit();confirmation.modal.dispatchEvent(new Event('iq-close'));
  };
  options.replace?.close(true);return el;
}
async function guardControl(first){
  first.editComment('Control draft before reload');assert.equal(first.taskController.dirty(),true);
  const close=first.taskController.close({keepOpen:true});await first.respond(false);assert.equal(await close,false);
  assert.equal(first.isConnected,true);first.editComment('');
}
async function refuseNewComment(first,f){
  assert.equal(first.taskController.dirty(),true,'the retained Task guards text entered after failure or during cancellation');
  const hash=f.location.hash,close=first.taskController.close();await first.respond(false);assert.equal(await close,false);
  assert.equal(first.isConnected,true);assert.equal(f.context.currentTask(),'T1');assert.equal(f.location.hash,hash);
  const discard=first.taskController.close();await first.respond(true);assert.equal(await discard,true);await f.flush();
  assert.equal(f.context.currentTask(),null);assert.equal(f.location.hash,'#maps/A','explicit discard still permits a normal return');
}

for(const failure of ['read-error','null','support-error','support-cancel'])
test(`R2-F3: ${failure} reload keeps the actual guard for new comment text`,async()=>{
  let mode='normal';const held=deferred(),started=deferred();
  const f=fixture({canEdit:true,read:async(_collection,id)=>{
    if(mode==='read-error')throw Error('Synthetic reload read failed');if(mode==='null')return null;
    return {id,displayId:id.toUpperCase(),projectId:'p'};
  },openDialog:async(task,options)=>(await actualTaskPreparation(guardedTask))(task,options)});
  try{
    Object.assign(f.repository,{capabilities:{members:false,tags:false,releases:false,taskSettings:true},list:async()=>{
      if(mode==='support-error')throw Error('Synthetic reload support failed');
      if(mode==='support-cancel'){started.resolve();await held.promise;}return [];
    }});
    const first=await f.context.openTask('t1');await guardControl(first);mode=failure;first.clickReload();await turn();
    assert.ok(first.state.reload,'the actual reload click handler delegates to the contextual host');
    if(failure==='support-cancel'){
      await started.promise;first.editComment('New comment typed while reload is still pending');
      f.history.replaceState(f.history.state,'','#maps/A/task/T1/work');await f.context.openRoute(f.location.hash);
      held.resolve();assert.equal(await first.state.reload,false);assert.deepEqual(first.state.messages,[]);
    }else{
      await assert.rejects(first.state.reload);await turn();first.editComment('New comment typed after failed reload');
      assert.ok(first.state.messages.some(message=>message.error&&message.action==='reload'),'actual reload error sink remains available');
    }
    assert.equal(first.isConnected,true);await refuseNewComment(first,f);
  }finally{held.resolve();f.restore();}
});

test('R2-F3: a superseded handoff after accepted keepOpen cannot disable the retained Task guard',async()=>{
  const f=fixture({canEdit:true,openDialog:async(task,options)=>(await actualTaskPreparation(guardedTask))(task,options)});
  try{
    f.repository.capabilities={members:false,tags:false,releases:false,taskSettings:false};
    const first=await f.context.openTask('t1');await guardControl(first);first.editComment('Draft at the time of replacement');
    const replacement=first.options.onOpenTask('t2');await turn();
    f.history.replaceState(f.history.state,'','#maps/A/task/T1/work');await f.context.openRoute(f.location.hash);
    await first.respond(true);assert.equal(await replacement,false,'the newer route cancels the already-confirmed replacement');
    assert.equal(first.isConnected,true);assert.equal(f.context.currentTask(),'T1');
    first.editComment('A later unpublished comment on the retained Task');await refuseNewComment(first,f);
  }finally{f.restore();}
});

test('R3-F1: a refused older section leave cannot replace the queued Task route or its history state',async()=>{
  const f=fixture(),held=deferred(),started=deferred();const board=f.maps.board,inspector=f.maps.inspector;let mapGuards=0;
  try{
    await f.context.openTask('t1');
    f.maps.readyToLeave=async()=>{mapGuards++;started.resolve();return held.promise;};
    const shell=actualMountingShell(f,async()=>{throw Error('The retained Maps must not remount');},f.repository,{initialBoard:f.context});
    hashNotification(f,'#/task/T2');await started.promise;
    assert.equal(f.context.currentTask(),null,'the old leave has closed T1 and now awaits the map guard');
    const latestState={...f.history.state,latestNativeRoute:'return-to-T1'};
    f.history.replaceState(latestState,'','#maps/A/task/T1');f.window.dispatchEvent(new Event('hashchange'));
    held.resolve(false);await turn();await turn();
    assert.deepEqual(shell.errors,[]);assert.equal(f.context.currentTask(),'T1');assert.equal(f.location.hash,'#maps/A/task/T1');
    assert.equal(f.history.state.latestNativeRoute,'return-to-T1','replay keeps the state belonging to the latest history entry');
    assert.equal(shell.state().viewMode,'maps');assert.equal(shell.state().board,f.context);assert.deepEqual(shell.canonicalOpened,[]);
    assert.equal(f.maps.board,board);assert.equal(f.maps.inspector,inspector);assert.equal(mapGuards,1,'returning within Maps does not repeat its refused leave');
  }finally{held.resolve(false);await turn();f.restore();}
});
