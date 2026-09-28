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
  // Settings subsections are linkable and survive re-mounting the section.
  assert.equal(sectionRouteHash('settings','#settings/members'),'#settings/members');
  assert.equal(sectionRouteHash('settings','#settings/<x>'),'#settings');assert.equal(sectionRouteHash('tasks','#settings/members'),'#tasks');
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
    if(path.endsWith("/members"))return [{id:"u1",name:"Алиса",kind:"human"}];calls++;const url=new URL(path,'https://qa.invalid'),start=Number(url.searchParams.get('cursor')||0),limit=Number(url.searchParams.get('limit'));
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
  assert.equal(html.includes('move-to:'),false);assert.ok(html.includes('open:t'));assert.match(html,/data-drag-handle[^>]*disabled/);
});
test('board cards show hierarchy without repeating task numbers',()=>{
  const parent={id:'p',displayId:'SPQ-1',title:'Эпик',type:'epic',status:'in_progress'};
  const done={id:'c1',displayId:'SPQ-2',title:'Готовая',status:'ready_for_release',parentId:'p'},open={id:'c2',displayId:'SPQ-3',title:'Открытая',status:'review',parentId:'p'};
  const index={children:new Map([['p',[done,open]]]),byId:new Map([[parent.id,parent]])};
  const child=renderTaskCard({task:open,parent,children:[]},{index,canEdit:true});
  assert.equal((child.match(/SPQ-1/g)||[]).length,0,'the parent is named by title, not by a second number');assert.match(child,/class="task-card-parent"[^>]*>.*Эпик/s);
  const collapsed=renderTaskCard({task:parent,parent:null,children:[done,open]},{index,canEdit:true});
  assert.match(collapsed,/data-toggle-children="p" aria-expanded="false"/);assert.match(collapsed,/task-subtasks-count">1\/2</);assert.match(collapsed,/class="task-subtask-list" id="subtasks-p" hidden/,'collapsed lists stay in the markup, hidden, so toggling never re-renders the board');
  const expanded=renderTaskCard({task:parent,parent:null,children:[done,open]},{index,canEdit:true,expanded:true});
  assert.match(expanded,/aria-expanded="true"/);assert.doesNotMatch(expanded,/id="subtasks-p" hidden/);assert.ok(expanded.includes('Готовая')&&expanded.includes('Открытая')&&expanded.includes('Ревью'));
});
test('calendar entries carry card facts, never raw entity ids or title suffixes',async()=>{
  const {calendarProjection}=await import('../ui/planning/src/temporal-model.js');
  const [entry]=calendarProjection([{id:'task:spq-login-bug',entityId:'spq-login-bug',entityKind:'task',title:'SPQ-4 · Ошибка',deadline:'2026-09-28',status:'review',card:{key:'SPQ-4',name:'Ошибка',type:'bug',priority:'high',owner:'Борис Петров'}}]);
  assert.equal(entry.title,'Ошибка');assert.equal(entry.key,'SPQ-4');assert.equal(entry.kind,'deadline');assert.equal(entry.owner,'Борис Петров');assert.equal(entry.priority,'high');
});
test('planning tree marks the last child of each sibling run',async()=>{
  const {lastChildren}=await import('../ui/planning/src/markup.js');
  const rows=[{id:'a',depth:0},{id:'b',depth:1},{id:'c',depth:2},{id:'d',depth:1},{id:'e',depth:0}];
  assert.deepEqual([...lastChildren(rows)].sort(),['c','d']);
});
test('loading markup is one DS skeleton look that stays hidden while loads are fast',async()=>{
  const {loadingMarkup}=await import('../ui/src/loading.js');
  const html=loadingMarkup('Загружаем <задачи>',{rows:2,title:true});
  assert.match(html,/class="iq-loading product-loading "/);assert.match(html,/aria-busy="true"/);assert.match(html,/Загружаем &lt;задачи&gt;/);
  assert.equal((html.match(/iq-skeleton product-loading-row/g)||[]).length,2);
});
test('template previews show structure: titled areas, lined notes, arrowed links, staggered hover order',async()=>{
  const {previewDocument}=await import('../ui/src/template-preview.js');
  const html=previewDocument({objects:[{id:'f',type:'frame',text:'Что сработало',x:0,y:0,width:400,height:200},{id:'a',type:'sticky',text:'Длинный текст заметки',x:20,y:40,width:120,height:90,color:'mint',parentId:'f'},{id:'b',type:'task',text:'Шаг',x:200,y:40,width:120,height:60}],connections:[{id:'c',from:'a',to:'b'}]});
  assert.equal((html.match(/<text/g)||[]).length,1,'only the area title is text');assert.match(html,/Что сработало/);
  assert.doesNotMatch(html,/Длинный текст/);assert.match(html,/class="map-preview-head" data-link="0"/);assert.doesNotMatch(html,/marker-end|style="/);
  assert.match(html,/data-role="outcome" data-order="1"/,'the action is the outcome of the story');
});
test('template previews keep an inset, route links around objects and reach the outcome in time',async()=>{
  const {BUILTIN_TEMPLATES}=await import('../ui/src/templates.js');
  const {previewDocument,routeLinks,PREVIEW_VARIANTS}=await import('../ui/src/template-preview.js');
  const hits=(a,b,r)=>Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h;
  for(const template of BUILTIN_TEMPLATES){
    const {objects,connections}=template.document;
    for(const route of routeLinks(objects,connections))for(let i=1;i<route.points.length;i++)for(const o of objects){
      if(o.type==='frame'||o.id===route.from||o.id===route.to)continue;
      assert.ok(!hits(route.points[i-1],route.points[i],{x:o.x,y:o.y,w:o.width,h:o.height}),`${template.id}: ${route.id} passes under ${o.id}`);
    }
    for(const variant of ['card','detail']){
      const {W,H,inset}=PREVIEW_VARIANTS[variant],html=previewDocument(template.document,{variant});
      for(const m of html.matchAll(/<rect class="map-preview-(?:frame|note|card|shape)"(?: pathLength="1")? x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)){
        const [x,y,w,h]=m.slice(1).map(Number);
        assert.ok(x>=inset-.5&&y>=inset-.5&&x+w<=W-inset+.5&&y+h<=H-inset+.5,`${template.id} ${variant}: object outside the inset`);
      }
      assert.match(html,new RegExp(`viewBox="0 0 ${W} ${H}"`));
    }
  }
});
test('a comment may become a question and back while open; a resolved question keeps its kind',async()=>{
  const {prepareThread}=await import('../ui/src/board/thread-model.js');
  const tasks=[{id:'t1',projectId:'p1'}],base={id:'th1',projectId:'p1',taskId:'t1',requiresResolution:false,resolved:false,messages:[{id:'m1',body:'Вопрос?',authorId:'a',createdAt:'2026-09-27T10:00:00.000Z'}]};
  const question=prepareThread({...base,requiresResolution:true},base,tasks,'a');assert.equal(question.requiresResolution,true);
  const resolved={...question,resolved:true};
  assert.throws(()=>prepareThread({...resolved,requiresResolution:false,resolved:false},resolved,tasks,'a'),/Решённый вопрос/);
});
test('template area titles fit the band above their first object',async()=>{
  const {previewDocument}=await import('../ui/src/template-preview.js');const {BUILTIN_TEMPLATES}=await import('../ui/src/templates.js');
  const html=previewDocument(BUILTIN_TEMPLATES.find(t=>t.id==='start-stop').document);
  const titles=[...html.matchAll(/<text class="map-preview-title" x="[\d.]+" y="([\d.]+)" font-size="([\d.]+)">/g)].map(m=>({y:+m[1],size:+m[2]}));
  const frames=[...html.matchAll(/<rect class="map-preview-frame" pathLength="1" x="[\d.]+" y="([\d.]+)"/g)].map(m=>+m[1]);
  const notes=[...html.matchAll(/<rect class="map-preview-note" x="[\d.]+" y="([\d.]+)"/g)].map(m=>+m[1]);
  assert.equal(titles.length,3);
  titles.forEach((title,i)=>{const firstNote=Math.min(...notes.filter(y=>y>frames[i]&&y<(frames[i+1]??Infinity)));assert.ok(title.y+title.size*.25<=firstNote,`title ${i} ends above its notes`);assert.ok(title.size>=5.5&&title.size<=10);});
});
