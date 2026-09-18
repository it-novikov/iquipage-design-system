import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ||= class {};
const {MapsFeature}=await import('../ui/src/maps.js');
const {ProductRepository}=await import('../web/repository.js');
const {loadTaskSupport}=await import('../ui/src/board/catalog-picker.js');
const {createTemporalRecovery}=await import('../ui/planning/src/temporal-recovery.js');
const {renderTaskCard}=await import('../ui/src/board/card.js');
const {sectionRouteHash}=await import('../web/section-route.js');
const wait=()=>new Promise(resolve=>setTimeout(resolve,110));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
test('empty Maps navigation commits the section route without replacing an opened map URL',()=>{
  for(const hash of ['#planning','#tasks','#settings','#maps',''])assert.equal(sectionRouteHash('maps',hash),'#maps');
  assert.equal(sectionRouteHash('maps','#maps/map_123-abc'),'#maps/map_123-abc');
  assert.equal(sectionRouteHash('planning','#maps/map_123-abc'),'#planning');
  assert.equal(sectionRouteHash('tasks','#task/QA-2'),'#tasks');
});
function mapFeature(read){
  return Object.assign(Object.create(MapsFeature.prototype),{
    alive:true,mapGeneration:0,mapReads:new Set(),current:{id:'A',revision:1},project:{id:'p'},view:'canvas',
    permissions:{read:true,edit:true},board:{data:{title:'A'},viewport:{}},positions:new Map(),inspector:{hidden:false},
    repository:{read},readyToLeave:async()=>true,renderChrome(){},message(){},config:{},
    buildBoard(){this.board={data:this.current.document,viewport:{}};},
    dialogs:new Set(),abort:new AbortController(),pending:new Map(),root:{replaceChildren(){}}
  });
}
test('late external map response cannot replace the newly opened map',async()=>{
  const held=deferred(),feature=mapFeature(()=>held.promise);
  const read=feature.externalUpdate({id:'A',revision:3});
  feature.current={id:'B',revision:1};feature.board={data:{title:'B'}};
  held.resolve({id:'A',revision:3,document:{title:'stale A'}});await read;
  assert.equal(feature.current.id,'B');assert.equal(feature.board.data.title,'B');
});
test('latest map-open intent wins even when an adapter ignores cancellation',async()=>{
  const reads=new Map(),opened=[],feature=mapFeature((_collection,id)=>{const held=deferred();reads.set(id,held);return held.promise;});
  feature.config.onOpenMap=event=>opened.push(event.id);
  const first=feature.openMap('A');await Promise.resolve();
  const second=feature.openMap('B');await Promise.resolve();
  reads.get('B').resolve({id:'B',revision:1,document:{title:'B'}});await second;
  reads.get('A').resolve({id:'A',revision:2,document:{title:'A'}});await first;
  assert.equal(feature.current.id,'B');assert.deepEqual(opened,['B']);
});
test('destroy aborts map reads and suppresses late model/route writes',async()=>{
  const held=deferred();let signal,opened=0;
  const feature=mapFeature((_collection,_id,_project,options)=>{signal=options.signal;return held.promise;});
  feature.config.onOpenMap=()=>opened++;
  const opening=feature.openMap('B');await Promise.resolve();await feature.destroy({force:true});
  assert.equal(signal.aborted,true);held.resolve({id:'B',revision:2,document:{title:'B'}});
  assert.equal(await opening,false);assert.equal(feature.current.id,'A');assert.equal(opened,0);
});
test('same-map external refresh ignores responses older than current revision',async()=>{
  const held=deferred(),feature=mapFeature(()=>held.promise),read=feature.externalUpdate({id:'A',revision:2});
  feature.current.revision=3;held.resolve({id:'A',revision:2,document:{title:'old'}});await read;
  assert.equal(feature.current.revision,3);assert.equal(feature.board.data.title,'A');
});
class FakeStream extends EventTarget{
  static instances=[];
  constructor(url){super();this.url=url;FakeStream.instances.push(this);}
  close(){this.closed=true;}
  change(data){this.dispatchEvent(new MessageEvent('change',{data:JSON.stringify(data)}));}
}
globalThis.EventSource=FakeStream;
function repositoryFor(role='admin'){
  const state={role,calls:0},repository=new ProductRepository({request:async()=>{state.calls++;return {projects:state.role?[{id:'p',role:state.role}]:[]};}});
  repository.context.actorId='actor';return {repository,state};
}
test('watch starts at explicit watermark; historic unchanged membership does not close access',async()=>{
  const {repository,state}=repositoryFor(),changes=[];
  repository.watch('p',event=>changes.push(event),{cursor:'head-zero',role:'admin'});
  const stream=FakeStream.instances.at(-1);
  assert.equal(new URL(stream.url,'https://qa.invalid').searchParams.get('cursor'),'head-zero');
  stream.change({topic:'member.updated',resourceId:'actor',revision:1});await wait();
  assert.equal(state.calls,1);assert.deepEqual(changes,[]);assert.equal(repository.context.actorId,'actor');repository.stopWatch();
});
test('live role change is distinct from access loss and checks current membership',async()=>{
  const {repository,state}=repositoryFor(),changes=[];
  repository.watch('p',event=>changes.push(event),{role:'admin'});const stream=FakeStream.instances.at(-1);
  state.role='reader';stream.change({topic:'member.updated',resourceId:'actor',revision:2});await wait();
  assert.deepEqual(changes,[{roleChanged:true,role:'reader'}]);assert.equal(repository.context.actorId,'actor');
  state.role=null;stream.change({topic:'member.updated',resourceId:'actor',revision:3});await wait();
  assert.equal(changes.length,2);assert.equal(changes[1],undefined);assert.deepEqual(repository.context,{});assert.equal(stream.closed,true);
});
test('one hundred resource events coalesce to one collection invalidation',async()=>{
  const {repository}=repositoryFor(),changes=[];repository.subscribe(event=>changes.push(event));repository.watch('p',()=>{},{});
  const stream=FakeStream.instances.at(-1);
  for(let i=0;i<100;i++)stream.change({topic:'task.updated',resourceId:String(i),revision:1});
  await wait();assert.equal(changes.length,1);assert.equal(changes[0].collection,'tasks');assert.equal(changes[0].resync,true);repository.stopWatch();
});
test('resync reaches discussions and links; stop cancels queued invalidation',async()=>{
  const {repository}=repositoryFor(),changes=[];repository.subscribe(event=>changes.push(event));repository.watch('p',()=>{},{});
  const stream=FakeStream.instances.at(-1);stream.dispatchEvent(new Event('resync'));await wait();
  assert.deepEqual(new Set(changes.map(event=>event.collection)),new Set(['tasks','threads','tags','releases','maps','templates','taskLinks','taskSettings']));
  changes.length=0;stream.change({topic:'thread.created',resourceId:'t',revision:1});repository.stopWatch();await wait();assert.deepEqual(changes,[]);
});
test('task context uses 100-row pages, isolates cached copies, and invalidates across scoped adapters',async()=>{
  let calls=0;
  const repository=new ProductRepository({request:async path=>{
    calls++;const url=new URL(path,'https://qa.invalid'),start=Number(url.searchParams.get('cursor')||0),limit=Number(url.searchParams.get('limit'));
    assert.equal(limit,100);return {items:Array.from({length:Math.min(limit,2000-start)},(_,i)=>({id:String(start+i)})),nextCursor:start+limit<2000?String(start+limit):null};
  }});
  const all=await repository.taskContext('p');assert.equal(all.length,2000);assert.equal(calls,20);
  all[0].id='changed';assert.equal((await repository.taskContext('p'))[0].id,'0');assert.equal(calls,20);
  Object.create(repository).clearProjectCache('p');await repository.taskContext('p');assert.equal(calls,40);
});
test('task context cancellation stops draining subsequent pages and does not cache a partial result',async()=>{
  const controller=new AbortController();let calls=0;
  const repository=new ProductRepository({request:async()=>{calls++;controller.abort();return {items:[{id:'1'}],nextCursor:'next'};}});
  await assert.rejects(repository.taskContext('p',{signal:controller.signal}),{name:'AbortError'});
  assert.equal(calls,1);assert.equal(repository.cache.size,0);
});
test('task support no longer fetches unused all-project task links',async()=>{
  const calls=[];const support=await loadTaskSupport({list:async name=>{calls.push(name);return [];}},'p');
  assert.deepEqual(calls,['tags','releases','taskSettings']);assert.equal('links' in support,false);
});
test('committed timeline plus failed readback releases preview exactly once without replay',async()=>{
  let rejects=0,accepts=0,resets=0,failures=0;
  const recovery=createTemporalRecovery({detail:{reject:()=>rejects++,accept:()=>accepts++},load:async()=>false,canonical:()=>({}),reset:()=>resets++,onFailure:()=>failures++});
  await assert.rejects(recovery.committed(),/сохранено/);recovery.close();recovery.close();
  assert.deepEqual({rejects,accepts,resets,failures},{rejects:1,accepts:0,resets:1,failures:1});
});
test('timeline successful readback accepts canonical once; cancel only discards preview',async()=>{
  const events=[],detail={accept:value=>events.push(['accept',value]),reject:()=>events.push(['reject'])};
  const success=createTemporalRecovery({detail,load:async()=>true,canonical:()=>({revision:3}),reset:()=>events.push(['reset'])});
  await success.committed();success.close();assert.deepEqual(events,[['accept',{revision:3}]]);
  events.length=0;const cancelled=createTemporalRecovery({detail,load:async()=>true,canonical:()=>({}),reset:()=>events.push(['reset'])});
  cancelled.close();cancelled.close();assert.deepEqual(events,[['reject'],['reset']]);
});
test('accepted result cards preserve open action but omit move affordance',()=>{
  const html=renderTaskCard({task:{id:'t',title:'Accepted',type:'task',priority:'normal',result:'accepted'},depth:0},{index:{children:new Map()},canEdit:true});
  assert.equal(html.includes('move-menu:'),false);assert.ok(html.includes('open:t'));assert.match(html,/data-drag-handle[^>]*disabled/);
});
