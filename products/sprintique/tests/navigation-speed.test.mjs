import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ||= class {};
const {MapsFeature}=await import('../ui/src/maps.js');
const {ProductRepository}=await import('../web/repository.js');
const wait=(ms=110)=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
class FakeStream extends EventTarget{
  static instances=[];
  constructor(url){super();this.url=url;FakeStream.instances.push(this);}
  close(){this.closed=true;}
  change(data){this.dispatchEvent(new MessageEvent('change',{data:JSON.stringify(data)}));}
}
globalThis.EventSource=FakeStream;

test('a held stream keeps its events for the mounting section and hands them over in order on release',async()=>{
  const repository=new ProductRepository({request:async()=>({projects:[{id:'p',role:'admin'}]})}),changes=[];
  repository.context.actorId='actor';repository.subscribe(change=>changes.push(change));
  repository.watch('p',()=>{},{cursor:'c0'});const stream=FakeStream.instances.at(-1);
  repository.cache.set('p:tags',{value:[],until:Date.now()+30000});
  const release=repository.holdChanges();
  stream.change({topic:'task.updated',resourceId:'t1',revision:2});stream.change({topic:'tags.updated',resourceId:'g',revision:1});
  await wait();
  // Nothing reaches the views, and the cache is left to the release, while the section mounts.
  assert.deepEqual(changes,[]);assert.ok(repository.cache.has('p:tags'));
  release();release();
  await wait();
  assert.deepEqual(changes.map(change=>[change.collection,change.id]),[['tasks','t1'],['tags','g']]);
  assert.equal(repository.cache.has('p:tags'),false);
  // Released, the stream flows as before.
  stream.change({topic:'task.updated',resourceId:'t2',revision:3});await wait();
  assert.equal(changes.at(-1).id,'t2');repository.stopWatch();
});

test('loss of access during a held mount is reported after it, once',async()=>{
  const repository=new ProductRepository({request:async()=>({projects:[]})}),reports=[];
  repository.context.actorId='actor';
  repository.watch('p',change=>reports.push(change),{});const stream=FakeStream.instances.at(-1);
  const release=repository.holdChanges();
  stream.dispatchEvent(new Event('access-revoked'));await wait();
  assert.deepEqual(reports,[]);assert.equal(stream.closed,true);
  release();assert.deepEqual(reports,[undefined]);assert.deepEqual(repository.context,{});
});

test('nested holds release the stream only after the last one, and a stopped watch drops what it held',async()=>{
  const repository=new ProductRepository({request:async()=>({projects:[]})}),changes=[];repository.subscribe(change=>changes.push(change));
  repository.watch('p',()=>{},{});const stream=FakeStream.instances.at(-1);
  const outer=repository.holdChanges(),inner=repository.holdChanges();
  stream.change({topic:'task.updated',resourceId:'a',revision:1});
  inner();await wait();assert.deepEqual(changes,[]);
  outer();await wait();assert.equal(changes.length,1);
  const again=repository.holdChanges();stream.change({topic:'task.updated',resourceId:'b',revision:2});
  repository.stopWatch();again();await wait();assert.equal(changes.length,1);
});

test('parallel reads of one cached collection share a single request; a cancelled first reader does not fail the next',async()=>{
  const answer=deferred();let calls=0;
  const repository=new ProductRepository({request:async path=>{calls++;assert.match(path,/\/tags$/);return answer.promise;}});
  const first=repository.list('tags','p'),second=repository.list('tags','p');
  answer.resolve([{id:'g',name:'Дизайн'}]);
  const [a,b]=await Promise.all([first,second]);
  assert.equal(calls,1);assert.deepEqual(a,b);a[0].name='changed';assert.equal(b[0].name,'Дизайн');
  assert.equal((await repository.list('tags','p'))[0].name,'Дизайн');assert.equal(calls,1);

  const controller=new AbortController(),slow=deferred();let pages=0;
  const other=new ProductRepository({request:async(path,_method,_body,_key,signal)=>{
    if(path.endsWith('/members'))return [];pages++;
    if(pages===1){await slow.promise;signal?.throwIfAborted();}
    return {items:[{id:'t'+pages}],nextCursor:null};
  }});
  const prefetch=other.taskContext('p',{signal:controller.signal}),drawer=other.taskContext('p');
  controller.abort();slow.resolve();
  await assert.rejects(prefetch,{name:'AbortError'});
  assert.deepEqual((await drawer).map(task=>task.id),['t2']);
});

test('a read started after a change is never answered by one shared from before it',async()=>{
  const answers=[deferred(),deferred()];let calls=0;
  const repository=new ProductRepository({request:async()=>answers[calls++].promise});
  const before=repository.list('tags','p');repository.clearProjectCache('p');const after=repository.list('tags','p');
  answers[0].resolve([{id:'old'}]);answers[1].resolve([{id:'new'}]);
  assert.equal(calls,2);assert.equal((await before)[0].id,'old');assert.equal((await after)[0].id,'new');
  // The older answer is not cached either.
  assert.equal((await repository.list('tags','p'))[0].id,'new');assert.equal(calls,2);
});

test('the drawer reads its discussions, agents and estimate settings alongside the task, each taken once',async()=>{
  const requests=[];
  const request=async path=>{requests.push(path);return path.endsWith('/task-links')?[]:{path};};
  const repository=new ProductRepository({request,threads:(project,task,{limit,cursor})=>request(`/projects/${project}/tasks/${task}/threads?limit=${limit}${cursor?'&cursor='+cursor:''}`)});
  repository.capabilities.aiAgents=true;
  repository.warmTask('p','t');
  assert.deepEqual(requests.map(path=>path.replace(/\?.*$/,'')).sort(),['/projects/p/planning/view/settings','/projects/p/task-links','/projects/p/tasks/t/agents','/projects/p/tasks/t/threads'].sort());
  assert.match((await repository.pageThreads('p','t',{limit:20,cursor:null})).path,/threads\?limit=20$/);
  await repository.taskAgents('p','t');await repository.viewSettings('p');await repository.list('taskLinks','p');
  assert.equal(requests.length,4);
  // Taken once: the next reads go to the server, as does a later page.
  await repository.pageThreads('p','t',{limit:20,cursor:null});await repository.taskAgents('p','t');await repository.pageThreads('p','t',{limit:20,cursor:'next'});
  assert.equal(requests.length,7);
});

test('an early drawer read is dropped once anything in the project changed',async()=>{
  const requests=[];
  const request=async path=>{requests.push(path);return path.endsWith('/task-links')?[]:{n:requests.length};};
  const repository=new ProductRepository({request,threads:(project,task)=>request(`/projects/${project}/tasks/${task}/threads`)});
  repository.warmTask('p','t');const warmed=requests.length;
  repository.clearProjectCache('p');
  await repository.pageThreads('p','t',{limit:20,cursor:null});await repository.viewSettings('p');
  assert.equal(requests.length,warmed+2);
});

function mapFeature(read){
  return Object.assign(Object.create(MapsFeature.prototype),{
    alive:true,mapGeneration:0,mapReads:new Set(),current:null,project:{id:'p'},view:'canvas',
    permissions:{read:true,edit:true},board:null,positions:new Map(),inspector:{hidden:false},
    repository:{read},readyToLeave:async()=>true,renderChrome(){},message(){},config:{},
    buildBoard(){this.board={data:this.current.document,viewport:{}};},
    dialogs:new Set(),abort:new AbortController(),pending:new Map(),root:{replaceChildren(){}}
  });
}
test('Maps opens the map read alongside the list, and reads it again when that early read failed',async()=>{
  let reads=0;const feature=mapFeature(async id=>{reads++;return {id,revision:2,document:{title:'fresh'}};});
  assert.equal(await feature.openMap('A',{early:Promise.resolve({id:'A',revision:1,document:{title:'early'}})}),true);
  assert.equal(reads,0);assert.equal(feature.current.document.title,'early');
  assert.equal(await feature.openMap('A',{early:Promise.resolve(null)}),true);
  assert.equal(reads,1);assert.equal(feature.current.document.title,'fresh');
});
