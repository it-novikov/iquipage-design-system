import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.ts';
import {WikiPage,WikiCatalog,WikiHistory,WikiSearch,WikiVersion,WikiReceipt,WikiTaskLinks,WikiBacklinks} from '../contracts/wiki.ts';

let f;
before(async()=>{f=await fixture({prefix:'WK'});});
after(async()=>{await f?.close();});
const path=(id='',suffix='',project=f.first.id)=>`/api/v1/projects/${project}/wiki${id?'/'+id:''}${suffix}`;
const call=(method,id='',payload,headers=f.alice.headers,key=randomUUID(),suffix='',project)=>
  f.app.inject({method,url:path(id,suffix,project),headers:{...headers,'idempotency-key':key},...(payload?{payload}:{})});
const value=(changes={})=>({title:'Документ',body:'# Требования\nСохранённый текст',parentId:null,archived:false,...changes});
const input=(revision,changes={})=>({baseRevision:revision,value:value(changes)});
const expect=(r,status,code)=>{assert.equal(r.statusCode,status,r.body);if(code)assert.equal(r.json().code,code);return r.json();};
async function grant(capabilities){
  const r=await f.app.inject({method:'POST',url:`/api/v1/projects/${f.first.id}/agents`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{name:'Wiki test',capabilities,expiresInSeconds:3600}});
  return {authorization:'Bearer '+expect(r,200).token};
}

test('WK1 create edit immutable history and restore preserve current parent and later versions',async()=>{
  expect(await call('PUT','wk-parent',input(0)),200);
  const first=expect(await call('PUT','wk-life',input(0)),200);WikiPage.parse(first);
  const changed=expect(await call('PUT','wk-life',input(1,{title:'Изменённый',body:'Другой текст',parentId:'wk-parent'})),200);
  assert.equal(changed.parentId,'wk-parent');WikiCatalog.parse(expect(await call('GET'),200));
  const version=expect(await call('GET','wk-life',undefined,undefined,undefined,'/versions/1'),200);WikiVersion.parse(version);
  assert.equal(version.body,value().body);
  const restored=expect(await call('POST','wk-life',{baseRevision:2,version:1},undefined,undefined,'/restore'),200);
  assert.equal(restored.revision,3);assert.equal(restored.body,value().body);assert.equal(restored.parentId,'wk-parent');
  const history=expect(await call('GET','wk-life',undefined,undefined,undefined,'/history'),200);WikiHistory.parse(history);
  assert.deepEqual(history.items.map(v=>v.revision),[3,2,1]);
  await f.db.authenticated({token:f.alice.token,kind:'session'},async tx=>{
    assert.equal((await tx.query("UPDATE app.wiki_version SET title='Изменено' WHERE project_id=$1 AND page_id='wk-life'",[f.first.id])).rowCount,0);
    await assert.rejects(tx.query("DELETE FROM app.wiki_version WHERE project_id=$1 AND page_id='wk-life'",[f.first.id]));
  });
  const audit=(await f.admin.query("SELECT count(*)::int n FROM app.audit_events WHERE project_id=$1 AND resource_id='wk-life' AND action='wiki-page.updated'",[f.first.id])).rows[0].n;
  assert.equal(audit,3);
});

test('WK2 concurrent CAS and lost-answer replay do not duplicate history',async()=>{
  const key=randomUUID(),body=input(0),first=expect(await call('PUT','wk-retry',body,undefined,key),200);
  const competing=await Promise.all(['A','B'].map(title=>call('PUT','wk-retry',input(1,{title}))));
  assert.deepEqual(competing.map(r=>r.statusCode).sort(),[200,409]);
  assert.deepEqual(expect(await call('PUT','wk-retry',body,undefined,key),200),first);
  assert.equal(expect(await call('GET','wk-retry'),200).revision,2);
  assert.equal(expect(await call('GET','wk-retry',undefined,undefined,undefined,'/history'),200).items.length,2);
  expect(await call('PUT','wk-retry',input(0,{title:'Changed key payload'}),undefined,key),409);
});

test('WK3 tree prevents cycles missing parents depth overflow and parent archive with active children',async()=>{
  expect(await call('PUT','wk-tree',input(0)),200);
  expect(await call('PUT','wk-child',input(0,{parentId:'wk-tree'})),200);
  expect(await call('PUT','wk-tree',input(1,{parentId:'wk-child'})),422,'WIKI_CYCLE');
  expect(await call('PUT','wk-tree',input(1,{archived:true})),409,'WIKI_CHILDREN');
  expect(await call('PUT','wk-missing',input(0,{parentId:'missing'})),422,'WIKI_PARENT');
  for(let i=1;i<=12;i++)expect(await call('PUT','wk-depth-'+i,input(0,{parentId:i===1?null:'wk-depth-'+(i-1)})),200);
  expect(await call('PUT','wk-depth-13',input(0,{parentId:'wk-depth-12'})),422,'WIKI_DEPTH');
  expect(await call('PUT','wk-depth-1',input(1,{parentId:'wk-tree'})),422,'WIKI_DEPTH');
  expect(await call('PUT','wk-child',input(1,{parentId:'wk-tree',archived:true})),200);
  expect(await call('PUT','wk-tree',input(1,{archived:true})),200);
  expect(await call('PUT','wk-child',input(2,{parentId:'wk-tree'})),422,'WIKI_PARENT');
  expect(await call('PUT','wk-tree',input(2)),200);
  expect(await call('PUT','wk-child',input(2,{parentId:'wk-tree'})),200);
});

test('WK4 archive remains directly readable but excludes search and blocks content changes until restore',async()=>{
  expect(await call('PUT','wk-archive',input(0,{title:'Архивный документ'})),200);
  expect(await call('PUT','wk-archive',input(1,{title:'Архивный документ',archived:true})),200);
  assert.ok(expect(await call('GET','wk-archive'),200).archivedAt);
  assert.ok(!expect(await call('GET'),200).some(r=>r.id==='wk-archive'));
  assert.ok(expect(await call('GET','',undefined,undefined,undefined,'?includeArchive=true'),200).some(r=>r.id==='wk-archive'));
  expect(await call('PUT','wk-archive',input(2,{title:'Другой',archived:true})),409,'WIKI_ARCHIVED');
  expect(await call('POST','wk-archive',{baseRevision:2,version:1},undefined,undefined,'/restore'),409,'WIKI_ARCHIVED');
});

test('WK5 task permissions reader isolation strict payload and limited agent receipt',async()=>{
  const reader=await grant(['tasks:read']),writer=await grant(['tasks:write']);
  expect(await call('GET','wk-life',undefined,f.reader.headers),200);
  expect(await call('PUT','wk-denied',input(0),f.reader.headers),403);
  expect(await call('GET','wk-life',undefined,f.bob.headers),404);
  expect(await call('GET','wk-life',undefined,f.alice.headers,undefined,'',f.second.id),404);
  const receipt=expect(await call('PUT','wk-writer',input(0),writer),200);WikiReceipt.parse(receipt);
  assert.ok(!('body' in receipt));expect(await call('GET','wk-writer',undefined,writer),403);
  expect(await call('GET','wk-writer',undefined,reader),200);expect(await call('PUT','wk-agent-denied',input(0),reader),403);
  expect(await call('PUT','wk-strict',{...input(0),actorId:f.bob.id}),400);
  await f.admin.query("UPDATE app.project_members SET revoked=ARRAY['tasks.write'] WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);
  try{const denied=await call('PUT','wk-revoked',input(0),writer);assert.ok([403,404].includes(denied.statusCode),denied.body);}
  finally{await f.admin.query("UPDATE app.project_members SET revoked='{}' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);}
});

test('WK6 bounded history and search cursor are stable and query/project bound',async()=>{
  const search=async(q,cursor,project=f.first.id)=>f.app.inject({method:'GET',url:`/api/v1/projects/${project}/wiki-search?${new URLSearchParams({q,...(cursor?{cursor}:{})})}`,headers:f.alice.headers});
  for(let i=0;i<52;i++)expect(await call('PUT','wk-search-'+String(i).padStart(2,'0'),input(0,{title:'Уникальное слово '+i,body:'needlebody'})),200);
  const a=expect(await search('Уникальное'),200);WikiSearch.parse(a);assert.equal(a.items.length,50);assert.ok(a.nextCursor);
  const b=expect(await search('Уникальное',a.nextCursor),200);assert.equal(b.items.length,2);
  assert.equal(new Set([...a.items,...b.items].map(r=>r.id)).size,52);
  expect(await search('Другой',a.nextCursor),400,'CURSOR_INVALID');
  assert.equal(expect(await search('needlebody'),200).items.length,50);
  expect(await search(''),400);
  let rev=0;for(let i=0;i<52;i++)rev=expect(await call('PUT','wk-history',input(rev,{body:String(i)})),200).revision;
  const h=expect(await call('GET','wk-history',undefined,undefined,undefined,'/history'),200);assert.equal(h.items.length,50);
  const tail=expect(await call('GET','wk-history',undefined,undefined,undefined,'/history?before='+h.nextCursor),200);assert.deepEqual(tail.items.map(v=>v.revision),[2,1]);
});

test('WK7 task links are typed project scoped recoverable and protect accepted task results',async()=>{
  const task=expect(await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tasks/wk-task`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'Связь',description:'Свой текст'}}}),200);
  const link=async(method,page='wk-life',payload,key=randomUUID())=>f.app.inject({method,url:`/api/v1/projects/${f.first.id}/tasks/wk-task/wiki-links${page?'/'+page:''}`,headers:{...f.alice.headers,'idempotency-key':key},...(payload?{payload}:{})});
  const key=randomUUID(),body={baseRevision:0,archived:false},saved=expect(await link('PUT','wk-life',body,key),200);
  WikiTaskLinks.parse(expect(await link('GET',''),200));
  const back=expect(await call('GET','wk-life',undefined,undefined,undefined,'/tasks'),200);WikiBacklinks.parse(back);assert.equal(back.items[0].id,task.id);
  expect(await link('PUT','wk-life',{baseRevision:1,archived:true}),200);assert.deepEqual(expect(await link('GET',''),200),[]);
  expect(await link('PUT','wk-life',{baseRevision:2,archived:false}),200);
  await f.admin.query("UPDATE app.tasks SET result='accepted' WHERE project_id=$1 AND id='wk-task'",[f.first.id]);
  expect(await link('PUT','wk-life',{baseRevision:3,archived:true}),409,'RESULT_PINNED');
  assert.deepEqual(expect(await link('PUT','wk-life',body,key),200),saved);
  const unchanged=expect(await f.app.inject({method:'GET',url:`/api/v1/projects/${f.first.id}/tasks/wk-task`,headers:f.alice.headers}),200);
  assert.equal(unchanged.description,'Свой текст');
});

test('WK8 service PAT scopes and current owner rights apply to wiki and author its versions',async()=>{
  const preset=(await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'",[f.first.workspaceId])).rows[0].id;
  const made=expect(await f.app.inject({method:'POST',url:'/api/v1/service-accounts',headers:f.alice.headers,
    payload:{name:'Wiki service',workspaceId:f.first.workspaceId,projects:[{projectId:f.first.id,presetId:preset,granted:[],revoked:[]}]}}),200);
  async function token(scopes){return {authorization:'Bearer '+expect(await f.app.inject({method:'POST',url:`/api/v1/service-accounts/${made.id}/tokens`,headers:f.alice.headers,payload:{name:'Wiki scope',scopes,expiresInDays:1}}),200).token};}
  const write=await token(['write']),read=await token(['read']);
  WikiPage.parse(expect(await call('PUT','wk-service',input(0),write),200));
  expect(await call('GET','wk-service',undefined,read),200);
  expect(await call('PUT','wk-service-denied',input(0),read),403);
  const authors=(await f.admin.query("SELECT actor_id,initiator_id FROM app.audit_events WHERE project_id=$1 AND resource_id='wk-service'",[f.first.id])).rows[0];
  assert.equal(authors.actor_id,made.id);assert.equal(authors.initiator_id,f.alice.id);
  assert.equal(expect(await call('GET','wk-service',undefined,read,undefined,'/versions/1'),200).actorId,made.id);
  const member=(await f.admin.query('SELECT role FROM app.project_members WHERE project_id=$1 AND principal_id=$2',[f.first.id,f.alice.id])).rows[0];
  try{
    await f.admin.query("UPDATE app.project_members SET role='reader' WHERE project_id=$1 AND principal_id=$2",[f.first.id,f.alice.id]);
    const denied=await call('PUT','wk-service',input(1),write);assert.ok([403,404].includes(denied.statusCode),denied.body);
    expect(await call('GET','wk-service',undefined,read),200);
  }finally{await f.admin.query('UPDATE app.project_members SET role=$3 WHERE project_id=$1 AND principal_id=$2',[f.first.id,f.alice.id,member.role]);}
});

test('WK9 concurrent final catalog slot and revision numeric boundary do not overflow',async()=>{
  const existing=(await f.admin.query('SELECT count(*)::int n FROM app.wiki_page WHERE project_id=$1',[f.first.id])).rows[0].n;
  await f.admin.query(`INSERT INTO app.wiki_page(project_id,id,title,body,revision,updated_by)
    SELECT $1,'wk-limit-'||i,'Page '||i,'',1,$2 FROM generate_series(1,$3::int) i`,[f.first.id,f.alice.id,999-existing]);
  const results=await Promise.all([1,2].map(i=>call('PUT','wk-last-'+i,input(0))));
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,422]);
  assert.equal(expect(await call('GET','',undefined,undefined,undefined,'?includeArchive=true'),200).length,1000);
  await f.admin.query("UPDATE app.wiki_page SET revision=9007199254740991 WHERE project_id=$1 AND id='wk-life'",[f.first.id]);
  const page=expect(await call('GET','wk-life'),200);assert.equal(page.revision,Number.MAX_SAFE_INTEGER);WikiPage.parse(page);
  expect(await call('PUT','wk-life',input(page.revision,{parentId:page.parentId})),422,'REVISION_LIMIT');
  assert.deepEqual(expect(await call('GET','wk-life'),200),page);
});
