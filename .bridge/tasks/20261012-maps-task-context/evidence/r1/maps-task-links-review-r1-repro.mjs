/**
 * Independent WP01 R1 probe, not a product or browser test.
 * Run: node --experimental-vm-modules tests/maps-task-links-review-r1-repro.mjs
 *
 * Executes the frozen MapsTaskContext and mountTaskLinks implementation. Imports
 * unrelated to the exercised relation-map navigation are stubbed. The Task
 * dialog is a lifecycle double: its iq-close event destroys links, matching
 * task-dialog.js:472-474. Native rendering, native dialogs, and API transport
 * are not exercised. No source file is patched by this probe.
 */
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMapsTaskContext} from '../web/maps-task-context.js';

const revision='fbaf15fbcae32a672ec5975fc1106a2bff29b709';
// Independently matched to git show <revision>:products/sprintique/<path>.
const expected={
  '../web/maps-task-context.js':'b11299940b48b9a488935070119f948e96a2ff4d7e3cf662129e4115b48df9d0',
  '../ui/src/board/link-view.js':'4518c22a864c4ea35dc8ddb3c859f1af4371dd851c9dd25a419c2cf6a97a079c',
  '../ui/src/board/task-dialog.js':'bb84b79880e62d52269579149b0b7f63dd25a62c7eae2d63cde85eb02d2f66d0',
};
const source={};
for(const [relative,sha256] of Object.entries(expected)){
  source[relative]=await fs.readFile(new URL(relative,import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(source[relative]).digest('hex'),sha256,relative+' must be the frozen reviewed source');
}

class DetailEvent extends Event {
  constructor(type,detail){super(type);this.detail=detail;}
}
const sandbox=vm.createContext({AbortController,Event,EventTarget,CustomEvent:DetailEvent});
const stubs={
  dialog(){},select(){},input(){},icon(){return '';},esc:String,ui:{},
  linkCandidates(){},taskRelease(){},uid(){},TASK_COLUMNS:[],
  taskColumn:task=>task.status||'ready',taskURL(){},LINK_KINDS:[],PARENT_KIND:[],
  createLinkDrafts(){},saveLink(){},saveLinks(){},
};
const linksModule=new vm.SourceTextModule(source['../ui/src/board/link-view.js'],{
  context:sandbox,identifier:new URL('../ui/src/board/link-view.js',import.meta.url).href,
});
await linksModule.link(async()=>new vm.SyntheticModule(Object.keys(stubs),function(){
  for(const [key,value] of Object.entries(stubs))this.setExport(key,value);
},{context:sandbox}));
await linksModule.evaluate();
const {mountTaskLinks}=linksModule.namespace;

const previous={location:globalThis.location,history:globalThis.history,document:globalThis.document};
const results=[];
try{
  for(const mode of ['missing-target','server-read-error']){
    const location=new URL('https://probe.invalid/?project=p#maps/A');
    let state=null;
    const events=[],mapErrors=[];
    const history={
      get state(){return state;},
      replaceState(next,_title,url){state=next;location.href=new URL(url,location).href;},
      pushState(next,_title,url){state=next;location.href=new URL(url,location).href;},
      back(){throw Error('Unexpected back');},
      forward(){throw Error('Unexpected forward');},
    };
    const opener={isConnected:true,focus(){}};
    Object.assign(globalThis,{location,history,document:{activeElement:opener}});
    const root={isConnected:true,contains:element=>element===opener,querySelector:()=>opener};
    const maps={current:{id:'A'},readyToLeave:async()=>true,destroy(){},message:error=>mapErrors.push(error)};
    const firstTask={id:'t1',displayId:'T1',projectId:'p',title:'First'};
    const linkedTask={id:'t2',displayId:'T2',projectId:'p',title:'Unavailable second'};
    let linkMap,errorElement,firstDialog;
    const repository={
      read:async(_collection,id)=>{
        events.push('read:'+id);
        if(id==='t1')return firstTask;
        if(mode==='server-read-error')throw Error('Simulated service error, HTTP 503');
        return null; // ProductRepository.read maps HTTP 404 to null.
      },
      list:async()=>[{id:'l',fromId:'t1',toId:'t2',kind:'related'}],
      subscribe:()=>()=>events.push('unsubscribe:links'),
    };
    const host=createMapsTaskContext({root,maps,repository,project:{id:'p'},canEdit:true,canManage:true,
      openDialog:async(task,options)=>{
        const element=new EventTarget();element.isConnected=true;
        element.close=()=>{
          if(!element.isConnected)return;
          element.isConnected=false;events.push('close:'+task.id);
          element.dispatchEvent(new Event('iq-close'));
        };
        element.taskController={taskId:task.id,taskKey:task.displayId,setSection:value=>value,
          close:async()=>{element.close();return true;}};
        const linksRoot=new EventTarget();linksRoot.insertAdjacentHTML=()=>{};
        linkMap=new EventTarget();errorElement={hidden:true,textContent:''};
        const empty={hidden:true};
        linksRoot.querySelector=selector=>selector==='iq-relation-map'?linkMap:selector==='[role=alert]'?errorElement:empty;
        const links=mountTaskLinks(linksRoot,{repository,project:{id:'p'},task,tasks:[firstTask,linkedTask],
          onOpenTask:async id=>{await options.onOpenTask(id);}});
        // Task's actual iq-close cleanup calls links.destroy before the host reads the next Task.
        element.addEventListener('iq-close',()=>links.destroy(),{once:true});
        firstDialog=element;return element;
      },
    });
    await host.openTask('t1');
    linkMap.dispatchEvent(new DetailEvent('iq-open',{id:'t2'}));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(host.currentTask(),null);
    assert.equal(firstDialog.isConnected,false);
    assert.equal(location.hash,'#maps/A');
    assert.equal(maps.current.id,'A');
    assert.equal(errorElement.hidden,true);
    assert.equal(errorElement.textContent,'');
    assert.deepEqual(mapErrors,[]);
    assert.deepEqual(events,['read:t1','close:t1','unsubscribe:links','read:t2']);
    results.push({mode,currentTask:host.currentTask(),hash:location.hash,
      errorVisible:!errorElement.hidden,mapErrors,events});
  }
}finally{Object.assign(globalThis,previous);}
console.log(JSON.stringify({revision,sourceHashes:expected,
  method:'Actual MapsTaskContext and mountTaskLinks; synthetic Task close lifecycle',
  result:'CONFIRMED_SILENT_LINK_FAILURE',results},null,2));
