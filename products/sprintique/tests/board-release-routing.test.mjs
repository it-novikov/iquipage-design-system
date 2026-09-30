import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProductRepository} from '../web/repository.js';
import {boardReleaseChoices} from '../ui/src/board/model.js';

const releases=[
  {id:'running',name:'Спринт 12',lifecycle:'active',archivedAt:null,plannedEnd:'2026-10-10'},
  {id:'next',name:'Спринт 13',lifecycle:'planned',archivedAt:null,plannedStart:'2026-10-11'},
  {id:'done',name:'Спринт 11',lifecycle:'closed',archivedAt:null},
  {id:'old',name:'Спринт 9',lifecycle:'planned',archivedAt:'2026-09-01T00:00:00Z'},
];
/** A repository on a fake client: records requests and answers the task read after creation. */
function repository({createInBoard=true}={}){
  const requests=[],hooks=[],confirmations=[];
  const client={csrf:null,task:async(projectId,id)=>({id,projectId,revision:1,title:'Новая',releaseId:'running'}),
    request:async(path,method='GET',body)=>{requests.push([method,path,body]);return {id:path.split('/').pop(),revision:1,title:'Новая'};}};
  const repo=new ProductRepository(client);repo.createInBoard=createInBoard;
  repo.list=async name=>name==='releases'?releases:[];
  repo.createInRelease=async(intent,release,createInBacklog)=>{hooks.push({intent,release:release.id});repo.backlog=createInBacklog;};
  repo.confirmPlanningChange=async intent=>{confirmations.push(intent);};
  return {repo,requests,hooks,confirmations};
}
const task=releaseId=>({id:'t-new',projectId:'p1',title:'Новая',releaseId,type:'task',status:'ready',priority:'normal',tagIds:[],attachmentIds:[]});

test('a task created on the board in a running or planned release goes through the release question',async()=>{
  for(const id of ['running','next']){
    const r=repository();const saved=await r.repo.write('tasks',task(id),0);
    assert.deepEqual(r.hooks.map(h=>h.release),[id]);assert.equal(r.hooks[0].intent.kind,'taskCreate');assert.equal(r.hooks[0].intent.createInBoard,true);
    assert.equal(r.requests.length,0,'nothing is written before the question');assert.equal(saved.id,'t-new');
  }
});

test('a finished or archived release takes the ordinary checked path, and planning never asks',async()=>{
  for(const id of ['done','old']){const r=repository();await r.repo.write('tasks',task(id),0);assert.equal(r.hooks.length,0);assert.equal(r.confirmations.length,1);}
  const planning=repository({createInBoard:false});await planning.repo.write('tasks',task('running'),0);
  assert.equal(planning.hooks.length,0);assert.equal(planning.confirmations[0].createInBoard,false);
});

test('the backlog fallback creates the same task without a release, admitted to the board',async()=>{
  const r=repository();await r.repo.write('tasks',task('running'),0);await r.repo.backlog();
  const [method,path,body]=r.requests.at(-1);
  assert.equal(method,'PUT');assert.equal(path,'/projects/p1/tasks/t-new');assert.equal(body.task.releaseId,null);assert.equal(body.createInBoard,true);assert.equal(r.hooks.length,1);
});

test('the board offers running releases first, then planned ones, never finished or archived',()=>{
  assert.deepEqual(boardReleaseChoices(releases).map(r=>r.id),['running','next']);
  assert.deepEqual(boardReleaseChoices([{...releases[1],id:'b',plannedStart:'2026-12-01'},{...releases[1],id:'a',plannedStart:'2026-11-01'},{...releases[0],id:'z'}]).map(r=>r.id),['z','a','b']);
});

test('the board lists the running release as admitted, a planned one by its prepared open tasks, the backlog without one',async()=>{
  const seen=[];
  const client={csrf:null,request:async(path)=>{seen.push(path);
    if(path.includes('/members'))return {items:[]};
    return {items:[{id:'a',title:'A',result:'open'},{id:'b',title:'B',result:'accepted'}],nextCursor:null};}};
  const repo=new ProductRepository(client);repo.memberNames=async()=>new Map();
  const running=await repo.list('tasks','p1',{board:{releaseId:'running',lifecycle:'active'}});
  const planned=await repo.list('tasks','p1',{board:{releaseId:'next',lifecycle:'planned'}});
  const backlog=await repo.list('tasks','p1',{board:{backlog:true}});
  assert.match(seen[0],/\/board\/tasks\?.*releaseId=running/);assert.equal(running.length,2,'the server decides what a running release admits');
  assert.match(seen[1],/\/planning\/tasks\?.*releaseId=next/);assert.match(seen[1],/preparation=ready/);assert.deepEqual(planned.map(t=>t.id),['a']);
  assert.match(seen[2],/\/board\/tasks\?.*unassigned=true/);assert.equal(backlog.length,2);
});
