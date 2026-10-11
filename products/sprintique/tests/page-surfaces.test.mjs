import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement ||= class {};
const {loadingMarkup,sectionLoadingShape}=await import('../ui/src/loading.js');
const {pageHeader}=await import('../ui/src/page-header.js');
const {renderTaskCard}=await import('../ui/src/board/card.js');
const {LINK_KINDS,linkRecord}=await import('../ui/src/board/task-create.js');
test('route loading models follow content, and settings forms differ from account lists',()=>{
 for(const [route,shape] of Object.entries({tasks:'board',planning:'planning',workbench:'workbench',finance:'overview',agents:'agents',maps:'maps'}))assert.equal(sectionLoadingShape(route),shape);
 for(const section of ['members','workspace-members'])assert.equal(sectionLoadingShape('settings',section),'people');
 for(const [section,shape] of Object.entries({account:'account',profile:'profile',workspace:'workspace',planning:'facts',templates:'templates',notifications:'preferences',operations:'operations','ai-connections':'connections',tags:'tags',access:'access',presets:'presets',invitations:'invitations',appearance:'none'}))assert.equal(sectionLoadingShape('settings',section),shape);
 for(const variant of ['board','planning','week','overview','ledger','agents','maps','form','people','history','search','notifications']){
  const markup=loadingMarkup('<Loading>',{variant});assert.match(markup,/&lt;Loading&gt;/);assert.match(markup,/aria-hidden="true"/);assert.equal((markup.match(/role="status"/g)||[]).length,1);assert.doesNotMatch(markup,/<button|<input|tabindex|role="option"/);
 }
 assert.equal((loadingMarkup('Board',{variant:'board'}).match(/class="load-column"/g)||[]).length,6);
 assert.equal((loadingMarkup('Week',{variant:'week'}).match(/class="load-day"/g)||[]).length,7);
});
test('common page header preserves a caller-owned h1 and contextual controls',()=>{
 const text=pageHeader({title:'A < B',description:'"Context"',actions:'<button data-create>Создать</button>'});assert.match(text,/A &lt; B/);assert.match(text,/description="&quot;Context&quot;"/);assert.match(text,/slot="actions"[^]*data-create/);
 const rich=pageHeader({titleHTML:'<h1 data-release><button>Релиз</button></h1>',back:'<a href="#agents">Агенты</a>'});assert.equal((rich.match(/<h1/g)||[]).length,1);assert.match(rich,/slot="back"/);assert.match(rich,/data-release/);
});
test('blocking is an independent confirmed signal and never promotes task priority',()=>{
 const make=t=>renderTaskCard({task:{id:'t',title:'Task',priority:'normal',type:'task',status:'ready',...t},children:[]},{index:{children:new Map()},canEdit:false});
 const blocked=make({effectiveBlocked:true,blockingTaskCount:2,blockers:[{displayId:'T-2',title:'First <blocker>'}]});assert.match(blocked,/iq-task-signals/);assert.match(blocked,/iq-task-blocker/);assert.doesNotMatch(blocked,/iq-badge danger/);assert.match(blocked,/2 блокера/);assert.match(blocked,/First &lt;blocker&gt;/);assert.match(blocked,/data-priority="normal"/);assert.doesNotMatch(blocked,/data-task-emphasis="critical"/);
 assert.doesNotMatch(make({}),/Заблокирована/);assert.doesNotMatch(make({effectiveBlocked:false,blockingTaskCount:4}),/Заблокирована/);
 assert.match(make({priority:'critical',effectiveBlocked:true}),/data-task-emphasis="critical"/);
});
test('link direction wording agrees with the saved dependency direction',()=>{
 assert.equal(LINK_KINDS.find(([id])=>id==='depends')[1],'Эта задача зависит от выбранной');
 const input={id:'link',otherId:'selected'},context={taskId:'current',projectId:'p'};
 assert.equal(linkRecord({...input,kind:'depends'},context).fromId,'current');assert.equal(linkRecord({...input,kind:'depends'},context).toId,'selected');
 assert.equal(linkRecord({...input,kind:'blocks'},context).fromId,'selected');assert.equal(linkRecord({...input,kind:'blocks'},context).toId,'current');
});
test('map header refresh preserves sync focus and does not reclaim focus after the person leaves',async()=>{
 const {MapsFeature}=await import('../ui/src/maps.js'),previous=globalThis.document,body={},outside={},calls=[];
 const old={dataset:{},hasAttribute:name=>name==='data-map-sync'},next={dataset:{},focus:()=>{calls.push('sync');globalThis.document.activeElement=next;},hasAttribute:name=>name==='data-map-sync'};
 globalThis.document={activeElement:old,querySelector:()=>null};
 const chip={insertAdjacentHTML:()=>{}},toolbar={contains:node=>node===old||node===next,querySelector:()=>chip,set innerHTML(_value){if(this.contains(globalThis.document.activeElement))globalThis.document.activeElement=body;}},subbar={contains:()=>false};
 const feature={alive:true,toolbar,subbar,current:{id:'m',title:'Map',kind:'permanent',status:'active'},permissions:{edit:true},uiCapabilities:{mapSwitcher:true},view:'canvas',storageLabel:'Сохранено',moreMenu:()=>'',renderTitleChip:()=>{},renderSessionCard:()=>{},updateTimer:()=>{},root:{querySelector:()=>next}};
 try{MapsFeature.prototype.renderChrome.call(feature);assert.equal(globalThis.document.activeElement,next);assert.equal(calls.length,1);globalThis.document.activeElement=outside;MapsFeature.prototype.renderChrome.call(feature);assert.equal(calls.length,1,'completion after leaving must not reclaim focus');assert.equal(globalThis.document.activeElement,outside);}finally{globalThis.document=previous;}
});
function historyFixture(read){
 const handlers=new Map(),status={},more={disabled:false,hidden:false,addEventListener:(name,fn)=>handlers.set('more:'+name,fn)},children=[];
 const list={children,addEventListener:()=>{},set innerHTML(markup){children.length=0;if(markup)children.push({loading:true});},querySelector:()=>children.find(x=>x.loading)?{remove:()=>children.splice(children.findIndex(x=>x.loading),1)}:null,insertAdjacentHTML:(_where,markup)=>{if(markup)children.push({markup});}};
 const el={querySelector:selector=>selector==='[data-history-more]'?more:selector==='[data-history-list]'?list:status,addEventListener:(name,fn)=>handlers.set(name,fn)};
 return {feature:{current:{id:'m',projectId:'p'},readyToLeave:async()=>true,dialog:()=>el,repository:{mapHistory:read}},handlers,status,more,children};
}
test('map history failure removes initial busy geometry; retry succeeds and a later failure preserves loaded versions',async()=>{
 const {showMapHistory}=await import('../ui/src/map-history.js');let step=0;
 const fixture=historyFixture(async()=>{if(step++!==1)throw Error('Offline');return {items:[{revision:1,title:'Map',createdAt:'2026-10-11T00:00:00Z'}],nextCursor:'next'};});
 await showMapHistory(fixture.feature);assert.equal(fixture.children.length,0);assert.equal(fixture.status.textContent,'Offline');assert.equal(fixture.more.textContent,'Повторить');assert.equal(fixture.more.disabled,false);
 await fixture.handlers.get('more:click')();assert.equal(fixture.children.length,1);assert.match(fixture.children[0].markup,/Версия 1/);
 await fixture.handlers.get('more:click')();assert.equal(fixture.children.length,1);assert.equal(fixture.children[0].loading,undefined);assert.equal(fixture.more.textContent,'Повторить');
});
test('closing a loading history aborts its request and ignores a late response',async()=>{
 const {showMapHistory}=await import('../ui/src/map-history.js');let resolve,signal;
 const fixture=historyFixture((_p,_id,_cursor,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});});
 const opening=showMapHistory(fixture.feature);await Promise.resolve();fixture.handlers.get('iq-close')();assert.equal(signal.aborted,true);resolve({items:[{revision:1}],nextCursor:null});await opening;assert.equal(fixture.children.filter(x=>x.markup).length,0);
});
test('initial map errors replace busy geometry; retry reuses the controller and can recover',async()=>{
 const {MapsFeature}=await import('../ui/src/maps.js');let reads=0,opened=0;
 const feature={alive:true,abort:new AbortController(),mapGeneration:0,config:{},surface:{innerHTML:''},renderChrome:()=>{},maps:[],repository:{},reloadList:async()=>{if(!reads++)throw Error('Offline');feature.maps=[{id:'m',status:'active'}];},openMap:async()=>{opened++;feature.current={id:'m'};feature.surface.innerHTML='canvas';},empty:()=>{}};
 await MapsFeature.prototype.loadInitial.call(feature);assert.match(feature.surface.innerHTML,/role="alert">Offline/);assert.match(feature.surface.innerHTML,/data-map-initial-retry/);assert.doesNotMatch(feature.surface.innerHTML,/aria-busy/);assert.equal(feature.initialLoading,false);
 await MapsFeature.prototype.loadInitial.call(feature);assert.equal(opened,1);assert.equal(feature.surface.innerHTML,'canvas');assert.equal(feature.abort.signal.aborted,false);
 await MapsFeature.prototype.loadInitial.call(feature);assert.equal(reads,2,'an existing map is preserved');
});
test('initial map late response cannot reopen a page that was left or replace a newer map',async()=>{
 const {MapsFeature}=await import('../ui/src/maps.js');let finish,opened=0;
 const feature={alive:true,abort:new AbortController(),mapGeneration:0,config:{},surface:{innerHTML:''},renderChrome:()=>{},maps:[{id:'m'}],repository:{},reloadList:()=>new Promise(resolve=>{finish=resolve;}),openMap:async()=>opened++};
 const pending=MapsFeature.prototype.loadInitial.call(feature);feature.alive=false;feature.abort.abort();finish();await pending;assert.equal(opened,0);
 feature.alive=true;feature.abort=new AbortController();const pendingNew=MapsFeature.prototype.loadInitial.call(feature);feature.mapGeneration++;feature.surface.innerHTML='newer canvas';finish();await pendingNew;assert.equal(opened,0);assert.equal(feature.surface.innerHTML,'newer canvas');
});

test('service account initial failure tears down listeners and reads; a fresh mount can recover',async()=>{
 const {mountServiceAccounts}=await import('../web/service-accounts.js'),previousFetch=globalThis.fetch,previousWindow=globalThis.window,previousDocument=globalThis.document;let attempts=0,listenerSignal;const reads=[];
 const root={innerHTML:'loading',addEventListener:(_name,_fn,options)=>{listenerSignal=options.signal;},replaceChildren(){this.innerHTML='';},querySelectorAll:()=>[]};
 const client={request:async(path,_method,_body,_key,signal)=>{if(signal)reads.push(signal);if(path==='/service-accounts'){if(!attempts++)throw Error('Offline');return {items:[]};}return path==='/permissions/catalog'?{project:[],workspace:[]}:path==='/workspaces'?[]:{projects:[]};}};
 globalThis.fetch=async()=>({ok:false});globalThis.window={addEventListener:()=>{}};globalThis.document={documentElement:{dataset:{motion:'reduced'}}};
 try{
  await assert.rejects(mountServiceAccounts(root,{repository:{client}}),/Offline/);assert.equal(listenerSignal.aborted,true);assert.ok(reads.every(signal=>signal.aborted));assert.equal(root.innerHTML,'');
  const recovered=await mountServiceAccounts(root,{repository:{client}});assert.match(root.innerHTML,/Сервисных аккаунтов нет/);assert.equal(listenerSignal.aborted,false);recovered.destroy();assert.equal(listenerSignal.aborted,true);
 }finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
test('leaving account settings aborts initial reads and a late success never paints the abandoned host',async()=>{
 const {mountServiceAccounts}=await import('../web/service-accounts.js'),previousFetch=globalThis.fetch,abort=new AbortController();let resolve,listSignal,paints=0;
 const root={addEventListener:()=>{},replaceChildren:()=>{},querySelectorAll:()=>[],set innerHTML(_){paints++;}};
 const client={request:async(path,_method,_body,_key,signal)=>{if(path==='/service-accounts'){listSignal=signal;return new Promise(done=>{resolve=done;});}return path==='/permissions/catalog'?{project:[],workspace:[]}:path==='/workspaces'?[]:{projects:[]};}};
 globalThis.fetch=async()=>({ok:false});
 try{const pending=mountServiceAccounts(root,{repository:{client},signal:abort.signal});abort.abort();assert.equal(listSignal.aborted,true);resolve({items:[]});const mounted=await pending;assert.equal(paints,0);mounted.destroy();}finally{globalThis.fetch=previousFetch;}
});


test('priority and effective blocker share one compact row without altering task emphasis or identity',()=>{
 const task={id:'signals',title:'Task',type:'task',priority:'critical',effectiveBlocked:true,blockingTaskCount:2,blockers:[{displayId:'T-2',title:'Await <review>'}]};
 const html=renderTaskCard({task,children:[]},{index:{children:new Map()},canEdit:true});
 const signals=html.match(/<div class="iq-task-signals">([\s\S]*?)<\/div>/)?.[1];
 assert.ok(signals);assert.match(signals,/Критический/);assert.match(signals,/Заблокирована/);assert.match(signals,/aria-label="Заблокирована. Блокирующих задач: 2. T-2 Await &lt;review&gt;"/);
 assert.equal((html.match(/task-urgency-label/g)||[]).length,1);assert.match(html,/data-task-emphasis="critical"/);assert.match(html,/data-open-task="signals"/);
 assert.doesNotMatch(html.split('task-card-title')[0],/task-urgency-label/);
});

test('blocker counts are factual and Russian labels cover teens, larger counts and unknown data',()=>{
 const make=count=>renderTaskCard({task:{id:'count',title:'Task',type:'task',priority:'critical',effectiveBlocked:true,blockingTaskCount:count},children:[]},{index:{children:new Map()},canEdit:false});
 for(const [n,label] of [[1,'1 блокер'],[2,'2 блокера'],[5,'5 блокеров'],[11,'11 блокеров'],[21,'21 блокер'],[22,'22 блокера'],[114,'114 блокеров'],[999,'999 блокеров']]){const h=make(n);assert.ok(h.includes(`<span>${label}</span>`));assert.ok(h.includes(`Блокирующих задач: ${n}`));}
 for(const count of [undefined,null,0,-1,1.5,'2',NaN]){const h=make(count);assert.match(h,/<span>Есть блокер<\/span>/);assert.doesNotMatch(h,/Блокирующих задач:/);assert.match(h,/aria-label="Заблокирована"/);}
});
