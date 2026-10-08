import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProductRepository} from '../web/repository.js';
import {ApiError} from '../client/api.ts';
import {LINK_KINDS,PARENT_KIND,linkRecord,createLinkDrafts,createTaskOnce,saveLink,saveLinks,linksFailedText} from '../ui/src/board/task-create.js';

/**
 * The browser's repository over a fake server that keeps the ledger the real one keeps: an idempotency key answers
 * with the result it got the first time, a stale base revision is a CONFLICT. `lose` makes the server do a request
 * and the browser hear a network failure; `refuse` answers a request with an error and stores nothing.
 */
function server(){
  const tasks=new Map(),links=new Map(),ledger=new Map(),requests=[],lose=[],refuse=[];
  const take=(list,method,path)=>{const index=list.findIndex(([m,start])=>m===method&&path.includes(start));return index<0?null:list.splice(index,1)[0];};
  const client={csrf:'c',
    task:async(projectId,id)=>{if(!tasks.has(id))throw new ApiError('NOT_FOUND','Задача недоступна.',404);return structuredClone(tasks.get(id));},
    request:async(path,method='GET',body,key)=>{
      requests.push([method,path]);
      if(method==='GET'&&path.endsWith('/task-links'))return [...links.values()];
      const refused=take(refuse,method,path);if(refused)throw new ApiError(refused[2],'Связанные задачи недоступны.',422);
      if(ledger.has(key))return structuredClone(ledger.get(key));
      const id=decodeURIComponent(path.split('/').pop());let result;
      if(path.includes('/tasks/')){
        const previous=tasks.get(id);if((previous?.revision||0)!==body.baseRevision)throw new ApiError('CONFLICT','Задача уже изменена.',409);
        result={...body.task,id,projectId:'p1',displayId:previous?.displayId||`SPR-${tasks.size+1}`,revision:body.baseRevision+1};tasks.set(id,result);
      }else if(path.includes('/task-links/')){
        const previous=links.get(id);if((previous?.revision||0)!==body.baseRevision)throw new ApiError('CONFLICT','Связь уже изменена.',409);
        result={id,projectId:'p1',...body.value,revision:body.baseRevision+1,archivedAt:null};links.set(id,result);
      }else throw new ApiError('NOT_IMPLEMENTED','',501);
      ledger.set(key,result);
      if(take(lose,method,path))throw new TypeError('fetch failed');
      return structuredClone(result);
    }};
  const repository=new ProductRepository(client);repository.createInBoard=true;
  return {repository,tasks,links,requests,lose,refuse};
}
const task=(changes={})=>({id:'t-new',projectId:'p1',title:'Экран оплаты',description:'',status:'ready',type:'task',priority:'normal',ownerId:null,due:null,rank:1024,parentId:null,releaseId:null,tagIds:[],attachmentIds:['file-a','file-b'],coverAttachmentId:null,coverCrop:null,estimate:null,...changes});
const edit=changes=>base=>({...base,...changes});

test('the picker speaks the map’s words, and a parent is a choice of its own',()=>{
  assert.deepEqual(LINK_KINDS.map(([value])=>value),['depends','blocks','related']);
  assert.deepEqual(PARENT_KIND,['parent','Родитель этой задачи']);
  const at={taskId:'t-new',projectId:'p1'};
  assert.deepEqual(linkRecord({id:'l1',otherId:'t-2',kind:'depends'},at),{id:'l1',projectId:'p1',revision:0,kind:'depends',fromId:'t-new',toId:'t-2'},'the picked task blocks the new one');
  assert.deepEqual(linkRecord({id:'l2',otherId:'t-3',kind:'blocks'},at),{id:'l2',projectId:'p1',revision:0,kind:'depends',fromId:'t-3',toId:'t-new'},'the picked task waits for the new one');
  assert.deepEqual(linkRecord({id:'l3',otherId:'t-4',kind:'related'},at),{id:'l3',projectId:'p1',revision:0,kind:'related',fromId:'t-new',toId:'t-4'});
});

test('chosen links keep their ids, one per other task, and a saved one stays',()=>{
  const drafts=createLinkDrafts();
  const first=drafts.add('t-2','depends');assert.match(first.id,/^task-link-/);assert.equal(first.state,'pending');
  assert.throws(()=>drafts.add('t-2','blocks'),/уже выбрана/,'two opposite dependencies would be a cycle');
  assert.throws(()=>drafts.add('t-3','parent'),/как задачи связаны/,'a parent is the field, not a link');
  assert.throws(()=>drafts.add('','related'),/Выберите задачу/);
  drafts.add('t-3','related');assert.equal(drafts.unsaved().length,2);
  first.state='saved';assert.equal(drafts.remove(first.id),false,'removed in the drawer of the created task');
  assert.equal(drafts.remove(drafts.items()[1].id),true);assert.equal(drafts.items().length,1);
});

test('create with links and files: one task with its files, then each link once',async()=>{
  const s=server(),drafts=createLinkDrafts();drafts.add('t-2','depends');drafts.add('t-3','blocks');
  const saved=await createTaskOnce(s.repository,task(),{projectId:'p1',edit:edit({})});
  assert.deepEqual(saved.attachmentIds,['file-a','file-b'],'the staged files ride in the creation');
  const progress=[];
  assert.equal(await saveLinks(s.repository,drafts,{taskId:saved.id,projectId:'p1',onProgress:p=>progress.push(`${p.done}/${p.total}`)}),0);
  assert.deepEqual(progress,['0/2','1/2','2/2']);
  assert.deepEqual([...s.links.values()].map(l=>[l.kind,l.fromId,l.toId]),[['depends','t-new','t-2'],['depends','t-3','t-new']]);
  assert.equal(await saveLinks(s.repository,drafts,{taskId:saved.id,projectId:'p1'}),0);
  assert.equal(s.requests.filter(([m,p])=>m==='PUT'&&p.includes('/task-links/')).length,2,'saved links are not sent again');
});

test('a retry after a lost answer duplicates nothing',async()=>{
  const s=server();s.lose.push(['PUT','/tasks/t-new'],['PUT','/task-links/']);
  await assert.rejects(createTaskOnce(s.repository,task(),{projectId:'p1',edit:edit({})}),/fetch failed/);
  const again=await createTaskOnce(s.repository,task(),{projectId:'p1',edit:edit({})});
  assert.equal(again.revision,1,'answered from the ledger');assert.equal(s.tasks.size,1);
  const drafts=createLinkDrafts(),draft=drafts.add('t-2','related');
  assert.equal(await saveLinks(s.repository,drafts,{taskId:'t-new',projectId:'p1'}),1);assert.equal(draft.state,'failed');
  assert.equal(await saveLink(s.repository,draft,{taskId:'t-new',projectId:'p1'}),true);assert.equal(s.links.size,1);
  // A form changed after the lost answer: the task it made is read and edited, never made again.
  const t=server();t.lose.push(['PUT','/tasks/t-new']);
  await assert.rejects(createTaskOnce(t.repository,task(),{projectId:'p1',edit:edit({title:'Второй вариант'})}),/fetch failed/);
  const edited=await createTaskOnce(t.repository,task({title:'Второй вариант'}),{projectId:'p1',edit:edit({title:'Второй вариант'})});
  assert.equal(t.tasks.size,1);assert.equal(edited.revision,2);assert.equal(edited.title,'Второй вариант');
  // A link the project already has under its id counts as saved; a conflict without it stays a failure.
  const u=server();const kept=createLinkDrafts().add('t-2','related');
  u.links.set(kept.id,{id:kept.id,kind:'related',fromId:'t-new',toId:'t-2',revision:1,archivedAt:null});
  assert.equal(await saveLink(u.repository,kept,{taskId:'t-new',projectId:'p1'}),true);
});

test('a link the server refuses fails alone, says why and is retried alone',async()=>{
  const s=server();s.refuse.push(['PUT','/task-links/','TASK_REFERENCE']);
  const drafts=createLinkDrafts(),bad=drafts.add('t-gone','depends'),good=drafts.add('t-3','related');const seen=[];
  const failed=await saveLinks(s.repository,drafts,{taskId:'t-new',projectId:'p1',onChange:d=>seen.push(`${d.otherId}:${d.state}`)});
  assert.equal(failed,1);assert.equal(bad.state,'failed');assert.equal(bad.error,'Связанные задачи недоступны.');assert.equal(good.state,'saved');
  assert.deepEqual(seen,['t-gone:saving','t-gone:failed','t-3:saving','t-3:saved']);
  assert.deepEqual(drafts.failed(),[bad]);
  assert.equal(await saveLinks(s.repository,drafts,{taskId:'t-new',projectId:'p1'}),0);
  assert.equal(s.requests.filter(([m,p])=>m==='PUT'&&p.includes(good.id)).length,1,'the saved link is not repeated');
  assert.equal(linksFailedText('SPR-7',1),'Задача SPR-7 создана. Одна связь не сохранилась.');
  assert.equal(linksFailedText('SPR-7',3),'Задача SPR-7 создана. Не сохранились 3 связи.');
  assert.equal(linksFailedText('SPR-7',5),'Задача SPR-7 создана. Не сохранились 5 связей.');
});

test('a creation the server refuses leaves no task, and the next attempt with a renewed file creates it',async()=>{
  // The upload of file-a was refused (its reservation is spent, #37), so the form sends the renewed file-c instead.
  const s=server();const failing={...s.repository,write:async()=>{throw new ApiError('TASK_FILE_ACCESS','Файл недоступен или срок загрузки истёк.',422);},read:s.repository.read.bind(s.repository)};
  await assert.rejects(createTaskOnce(failing,task(),{projectId:'p1',edit:edit({})}),/Файл недоступен/);
  assert.equal(s.tasks.size,0);
  const saved=await createTaskOnce(s.repository,task({attachmentIds:['file-c','file-b']}),{projectId:'p1',edit:edit({})});
  assert.deepEqual(saved.attachmentIds,['file-c','file-b']);assert.equal(s.tasks.size,1);
});
