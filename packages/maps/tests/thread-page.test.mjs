import test from 'node:test';
import assert from 'node:assert/strict';
import {selectThreadPage,threadSummary} from '../src/board/thread-page.js';
import {createThreadPager} from '../src/board/thread-pager.js';
import {MemoryRepository} from '../src/repository.js';
import {createTask} from '../src/tasks.js';
import {referenceServer} from './server-fixture.mjs';
const threads=()=>Array.from({length:85},(_,i)=>({
  id:'thread-'+String(i).padStart(3,'0'),projectId:'pages',taskId:'task',revision:1,
  requiresResolution:i%3===0,resolved:false,createdAt:'2026-09-01T00:00:00.000Z',lastActivityAt:'2026-09-01T00:00:00.000Z',
  messages:[{id:'m1',body:'A'.repeat(3000),authorId:'u',createdAt:'2026-09-01T00:00:00.000Z'},
    {id:'m2',body:'DETAIL_SENTINEL',authorId:'u',createdAt:'2026-09-01T00:00:00.000Z'}]
}));
test('thread pages: exact counts, bounded summaries and complete traversal',async()=>{
  const records=threads();let cursor=null,seen=[];
  do{
    const page=await selectThreadPage(records,'pages','task',{cursor});
    assert.ok(page.items.length<=20);assert.equal(page.total,85);assert.equal(page.unresolved,29);
    assert.ok(!JSON.stringify(page).includes('DETAIL_SENTINEL'));
    seen.push(...page.items.map(item=>item.id));cursor=page.nextCursor;
  }while(cursor);
  assert.equal(seen.length,85);assert.equal(new Set(seen).size,85);
  assert.equal(threadSummary(records[0]).messages[0].body.length,160);
  assert.equal(threadSummary(records[0]).messageCount,2);
});
test('thread pages: changed ordering invalidates the cursor without skipping records',async()=>{
  const records=threads(),first=await selectThreadPage(records,'pages','task');
  records[0].resolved=true;records[0].revision++;
  await assert.rejects(selectThreadPage(records,'pages','task',{cursor:first.nextCursor}),{code:'THREAD_CURSOR_STALE'});
});
test('thread pages: malformed and foreign-scope cursors are rejected',async()=>{
  const first=await selectThreadPage(threads(),'pages','task');
  await assert.rejects(selectThreadPage(threads(),'other','task',{cursor:first.nextCursor}),{code:'THREAD_CURSOR_SCOPE'});
  await assert.rejects(selectThreadPage(threads(),'pages','other',{cursor:first.nextCursor}),{code:'THREAD_CURSOR_SCOPE'});
  for(const cursor of ['!', 'x'.repeat(2049)])await assert.rejects(selectThreadPage(threads(),'pages','task',{cursor}),{code:'THREAD_CURSOR'});
  for(const limit of [0,51,1.2,NaN])await assert.rejects(selectThreadPage(threads(),'pages','task',{limit}),{code:'THREAD_PAGE_SIZE'});
});
test('thread pages: cancellation rejects without returning a partial page',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(selectThreadPage(threads(),'pages','task',{signal:controller.signal}),{name:'AbortError'});
});
test('thread pages: memory repository checks the task before paging',async()=>{
  const repo=new MemoryRepository();await assert.rejects(repo.pageThreads('pages','task'),{code:'THREAD_TASK'});
  const task=await repo.write('tasks',{...createTask({projectId:'pages',title:'Task'}),id:'task'},0);
  for(const record of threads())repo.data.threads.set(record.id,record);
  assert.equal((await repo.pageThreads(task.projectId,task.id)).items.length,20);
  await assert.rejects(repo.pageThreads('other',task.id),{code:'THREAD_TASK'});
});
test('thread pager: stale page refresh keeps pinned drafts and deduplicates later pages',async()=>{
  const data=threads(),task={id:'task',projectId:'pages'},pinned=new Set(),errors=[];let state;
  const repo={pageThreads:(p,id,options)=>selectThreadPage(data,p,id,options)};
  const pager=createThreadPager(repo,task,{pinned:()=>pinned,onChange:value=>state=value,onError:error=>errors.push(error.code)});
  await pager.reload();await pager.more();assert.equal(state.items.length,40);
  const kept=state.items.at(-1).id;pinned.add(kept);data[0].revision++;
  await pager.more();assert.equal(errors[0],'THREAD_CURSOR_STALE');assert.ok(state.items.some(item=>item.id===kept));
  await pager.more();assert.equal(new Set(state.items.map(item=>item.id)).size,state.items.length);pager.destroy();
});
test('thread pager: a response after destruction does not update the view',async()=>{
  let resolve,changes=0;const repo={pageThreads:()=>new Promise(done=>resolve=done)};
  const pager=createThreadPager(repo,{id:'task',projectId:'pages'},{onChange:()=>changes++});
  const loading=pager.reload();pager.destroy();const before=changes;
  resolve({items:[],total:0,unresolved:0,nextCursor:null});await loading;assert.equal(changes,before);
});
test('HTTP discussion pages return only task summaries and reject stale continuation',async t=>{
  const api=await referenceServer(t);await api.put('tasks',{...createTask({projectId:'pages',title:'Task'}),id:'task'});
  for(const record of threads().slice(0,21))await api.put('threads',{...record,revision:0});
  const first=await api.get('/tasks/task/threads?projectId=pages');assert.equal(first.items.length,20);assert.ok(first.nextCursor);
  assert.ok(!JSON.stringify(first).includes('DETAIL_SENTINEL'));
  const next=await api.get('/tasks/task/threads?projectId=pages&cursor='+encodeURIComponent(first.nextCursor));assert.equal(next.items.length,1);
  const stored=await api.get('/records/threads/thread-000?projectId=pages');await api.put('threads',{...stored,resolved:true});
  const stale=await fetch(api.base+'/api/tasks/task/threads?projectId=pages&cursor='+encodeURIComponent(first.nextCursor));
  assert.equal((await stale.json()).code,'THREAD_CURSOR_STALE');
});
