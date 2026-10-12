import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMapsTaskContext} from '../web/maps-task-context.js';
import {parseMapRoute,mapRouteHash} from '../web/maps-route.js';
import {taskURL} from '../ui/src/board/task-route.js';
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
      close:async()=>{el.normal++;const accepted=typeof el.accepted==='function'?await el.accepted():el.accepted;if(accepted)el.close();return accepted;},
      setSection:value=>(el.section=value),
    };dialogs.push(el);return el;
  };
  const context=createMapsTaskContext({root,maps,repository,project:{id:'p'},canEdit:false,canManage:false,
    openDialog:openDialog?((task,options)=>openDialog(task,options,makeDialog)):async(task,options)=>makeDialog(task,options)});
  return {context,maps,root,opener,focus,reads,dialogs,location,history,entries,
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
    assert.equal(f.context.currentTask(),'T2');assert.equal(first.normal,1);assert.equal(first.forced,0);assert.equal(f.entries.length,2);
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
  const held=deferred();const f=fixture({read:(_collection,id)=>id==='old'?held.promise:{id,displayId:'NEW'}});
  try{
    const old=f.context.openTask('old');await Promise.resolve();await Promise.resolve();
    await f.context.openRoute('#maps/A');await f.context.openTask('new');
    held.resolve({id:'old',displayId:'OLD'});assert.equal(await old,false);
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
