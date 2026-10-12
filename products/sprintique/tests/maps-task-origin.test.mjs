import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMapsTaskContext} from '../web/maps-task-context.js';
import {parseMapRoute,mapRouteHash} from '../web/maps-route.js';
import {taskURL,parseTaskRoute} from '../ui/src/board/task-route.js';
import {retainedRouteHash,sectionRouteHash} from '../web/section-route.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

function fixture({read,openDialog}={}){
  const previous={location:globalThis.location,history:globalThis.history,document:globalThis.document};
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
  Object.assign(globalThis,{location,history,document:{activeElement:opener}});
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
  const context=createMapsTaskContext({root,maps,repository,project:{id:'p'},canEdit:false,canManage:false,
    openDialog:openDialog?((task,options)=>openDialog(task,options,preparedDialog)):preparedDialog});
  return {context,maps,repository,root,opener,focus,reads,dialogs,location,history,entries,
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
      "let navigating=false,currentProject={id:'p'},viewMode='maps';return ("+source.slice(start,end).trim()+')')(
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
      "let viewMode='maps',currentProject={id:'p'};"+source.slice(start,end))(
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
