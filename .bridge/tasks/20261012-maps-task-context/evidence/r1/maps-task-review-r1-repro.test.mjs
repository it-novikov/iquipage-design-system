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


import {readFileSync} from 'node:fs';
import {retainedRouteHash,sectionRouteHash} from '../web/section-route.js';
const trace=(id,data)=>console.log(id,JSON.stringify(data));

test('R1-F1: returning to A cancels an earlier B contextual map read',async()=>{
  const f=fixture();globalThis.HTMLElement ||= class {};
  const {MapsFeature}=await import('../ui/src/maps.js');
  const held=deferred(),started=deferred();
  try{
    Object.assign(f.maps,{alive:true,permissions:{read:true},project:{id:'p'},mapGeneration:0,mapReads:new Set(),positions:new Map(),view:'canvas',
      repository:{read:async()=>{started.resolve();return held.promise;}},
      buildBoard(){},renderChrome(){},message(){},
      config:{onOpenMap:({id})=>{const current=parseMapRoute(f.location.hash);f.history.replaceState(f.history.state,'',mapRouteHash(id,current?.mapId===id?current.taskKey:null,current?.section));}},
    });
    f.maps.openMap=(...args)=>MapsFeature.prototype.openMap.apply(f.maps,args);
    f.history.pushState(null,'','#maps/B/task/T1');
    const old=f.context.openRoute(f.location.hash);await started.promise;
    f.history.back();await f.flush();
    held.resolve({id:'B',projectId:'p',title:'B'});await old;
    trace('R1-F1 actual',{map:f.maps.current.id,task:f.context.currentTask(),hash:f.location.hash});
    assert.equal(f.maps.current.id,'A','the newer Back to A must win over B loading');
    assert.equal(f.context.currentTask(),null,'an abandoned B task must not open');
    assert.equal(f.location.hash,'#maps/A');
  }finally{f.restore();}
});

test('R1-F2: refused section navigation keeps the settled current route',async()=>{
  const f=fixture();try{
    await f.context.openTask('t1');f.maps.acceptLeave=false;
    // Execute the unchanged actual shell navigate function with its dependencies injected.
    const source=readFileSync(new URL('../web/main.js',import.meta.url),'utf8');
    const start=source.indexOf('async function navigate(mode){');
    const end=source.indexOf("root.addEventListener('click'",start);
    const navigate=Function('retainedRouteHash','sectionRouteHash','board','showProject','isWorkbenchPath',
      "let navigating=false,currentProject={id:'p'},viewMode='maps';return ("+source.slice(start,end).trim()+')')(
      retainedRouteHash,sectionRouteHash,f.context,async()=>f.context.closeTask(),()=>false);
    await navigate('planning');
    trace('R1-F2 actual',{task:f.context.currentTask(),hash:f.location.hash,retained:f.context.routeHash});
    assert.equal(f.context.currentTask(),null,'the accepted task has already closed');
    assert.equal(f.location.hash,f.context.routeHash,'the shell must retain the actual map route after the map guard refuses');
  }finally{f.restore();}
});

test('R1-F3: initial map loading does not reopen a contextual task after its route was abandoned',async()=>{
  const f=fixture(),held=deferred(),started=deferred(),opened=[];
  try{
    f.history.replaceState(null,'','#maps/A/task/T1');
    const source=readFileSync(new URL('../web/maps-host.js',import.meta.url),'utf8');
    const factory=Function('mountMaps','can','parseMapRoute','mapRouteHash','createMapsTaskContext',
      'return ('+source.slice(source.indexOf('export async function mountMapsHost')).replace('export ','').trim()+')');
    const mount=factory(async(_root,config)=>{started.resolve();await held.promise;config.onOpenMap({id:'A'});return f.maps;},()=>false,parseMapRoute,mapRouteHash,
      options=>createMapsTaskContext({...options,openDialog:async(task,dialogOptions)=>{
        const el=new EventTarget();Object.assign(el,{isConnected:true,close(){this.isConnected=false;this.dispatchEvent(new Event('iq-close'));}});
        el.taskController={taskId:task.id,taskKey:task.displayId,close:async()=>{el.close();return true;},setSection:value=>value};
        opened.push(task.id);return el;
      }}));
    const repository={context:{actorId:'a'},capabilities:{attachments:false},read:async(_collection,id)=>({id,displayId:id,projectId:'p'})};
    const pending=mount(f.root,{repository,project:{id:'p',workspaceId:'w'}});await started.promise;
    // During showProject's initial mount, board is still null and navigate ignores hash changes because navigating=true.
    f.history.replaceState(null,'','#maps/A');held.resolve();const host=await pending;
    trace('R1-F3 actual',{task:host.currentTask(),hash:f.location.hash,opened});
    assert.equal(host.currentTask(),null,'abandoned initial Task route must not reopen after map loading');
    assert.equal(f.location.hash,'#maps/A');
  }finally{f.restore();}
});
