import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fixture} from './fixture.ts';
import {S3ObjectStorage,objectKey} from './support/object-storage.ts';
import {SprintiqueClient} from '../client/api.ts';
import {ProductRepository} from '../web/repository.js';
import {createLinkDrafts,createTaskOnce,saveLinks} from '../ui/src/board/task-create.js';

// Creating a task with the links and files its form gathered, against the real server and a real S3 store:
// files are staged on the new task's id and attached by the creation itself, links follow one idempotent command
// each, and a repeat after a lost answer adds nothing.
let f,storage;
before(async()=>{
  storage=new S3ObjectStorage(JSON.parse(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8')));
  await storage.ready();f=await fixture({prefix:'TC',storage:true});
  // Борис edits tasks in the project too: he may create tasks and links, never with Алиса's uploads.
  await f.admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[f.first.workspaceId,f.bob.id]);
  await f.admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'editor')",[f.first.id,f.bob.id]);
});
after(async()=>{
  if(f){const rows=(await f.admin.query('SELECT id,project_id AS "projectId",sha256 FROM app.assets WHERE project_id=$1',[f.first.id])).rows;
    for(const row of rows)for(const variant of ['original','display','thumb'])await storage.remove(objectKey(row,variant));await f.close();}
  storage?.close();
});
const path=(resource)=>`/api/v1/projects/${f.first.id}/${resource}`;
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const reserve=(id,name,bytes,taskId,user=f.alice)=>f.app.inject({method:'POST',url:path('assets'),headers:{...user.headers,'idempotency-key':'reserve-'+id},payload:{id,name,targetType:'task',targetId:taskId,size:bytes.length,sha256:sha(bytes)}});
const upload=(id,bytes,user=f.alice)=>f.app.inject({method:'PUT',url:path('assets/'+id+'/content'),headers:{...user.headers,'content-type':'application/octet-stream'},payload:bytes});
async function stage(id,name,bytes,taskId){
  const reserved=await reserve(id,name,bytes,taskId);assert.equal(reserved.statusCode,200,reserved.body);
  const uploaded=await upload(id,bytes);assert.equal(uploaded.statusCode,200,uploaded.body);assert.equal(uploaded.json().state,'staged');
}
async function seedTask(id,title){
  const response=await f.app.inject({method:'PUT',url:path('tasks/'+id),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,createInBoard:true,task:{title}}});
  assert.equal(response.statusCode,200,response.body);
}
const count=async(sql,...values)=>Number((await f.admin.query(sql,[f.first.id,...values])).rows[0].n);
/**
 * The product repository a person's browser uses, over real HTTP. `lose` names requests (method and path start)
 * whose answer is lost once: the server does the work, the client hears a network failure.
 */
async function repositoryOf(user,lose=[]){
  const pending=[...lose];const sent=[];
  const fetcher=(async(input,init={})=>{
    const headers={...(init.headers),cookie:user.headers.cookie,origin:user.headers.origin};
    const response=await fetch(f.app.url+input,{...init,headers});
    const method=init.method||'GET',url=input.replace(/^\/api\/v1\/projects\/[^/]+/,'');sent.push(`${method} ${url}`);
    const index=pending.findIndex(([m,start])=>m===method&&url.startsWith(start));
    if(index>=0){pending.splice(index,1);await response.arrayBuffer();throw new TypeError('fetch failed');}
    return response;
  });
  const client=new SprintiqueClient(fetcher);const repository=new ProductRepository(client);
  await client.session();
  return {repository,sent};
}
const record=(id,changes)=>({id,projectId:f.first.id,title:'Новая задача',description:'',status:'ready',type:'task',priority:'normal',ownerId:null,due:null,rank:1024,parentId:null,releaseId:null,tagIds:[],attachmentIds:[],coverAttachmentId:null,coverCrop:null,estimate:null,...changes});

test('TC1 a new task gets its staged files in its creation and its links right after it',async()=>{
  await seedTask('tc1-blocker','Подготовить макет');await seedTask('tc1-related','Тексты уведомлений');
  const taskId='tc1-task',image=Buffer.from('%PDF-1.4\n% макет\n'),notes=Buffer.from('Требования к экрану оплаты');
  // Uploads exist before the task: staged on the id the form gave it.
  await stage('tc1-file-a','maket.pdf',image,taskId);await stage('tc1-file-b','notes.txt',notes,taskId);
  const {repository}=await repositoryOf(f.alice);
  const drafts=createLinkDrafts();drafts.add('tc1-blocker','depends');drafts.add('tc1-related','related');
  const saved=await createTaskOnce(repository,record(taskId,{title:'Экран оплаты',attachmentIds:['tc1-file-a','tc1-file-b']}),{projectId:f.first.id,edit:base=>base});
  assert.deepEqual(saved.attachmentIds,['tc1-file-a','tc1-file-b']);
  assert.equal(await count("SELECT count(*) n FROM app.assets WHERE project_id=$1 AND id = ANY($2) AND state='attached'",['tc1-file-a','tc1-file-b']),2,'attached in the task transaction');
  const failed=await saveLinks(repository,drafts,{taskId,projectId:f.first.id});assert.equal(failed,0);
  const links=(await f.app.inject({method:'GET',url:path('task-links'),headers:f.reader.headers})).json();
  assert.deepEqual(links.filter(l=>l.fromId===taskId||l.toId===taskId).map(l=>[l.kind,l.fromId,l.toId]).sort(),[['depends',taskId,'tc1-blocker'],['related',taskId,'tc1-related']]);
  // The other reader of the project sees the files of the task now.
  assert.equal((await f.app.inject({method:'GET',url:path('assets/tc1-file-b/original'),headers:f.reader.headers})).statusCode,200);
});

test('TC2 a repeat after a lost answer creates no second task, link or file',async()=>{
  await seedTask('tc2-other','Связанная задача');
  const taskId='tc2-task',bytes=Buffer.from('lost answer');await stage('tc2-file','lost.txt',bytes,taskId);
  // The creation and the first link are done by the server, but their answers never reach the browser.
  const {repository,sent}=await repositoryOf(f.alice,[['PUT','/tasks/'+taskId],['PUT','/task-links/']]);
  const value=record(taskId,{title:'Потерянный ответ',attachmentIds:['tc2-file']}),edit=base=>({...base,...value});
  await assert.rejects(createTaskOnce(repository,value,{projectId:f.first.id,edit}),/fetch failed|Нет связи с сервером/);
  const again=await createTaskOnce(repository,value,{projectId:f.first.id,edit});
  assert.equal(again.revision,1,'the same command is answered from the ledger, not done twice');
  assert.equal(await count('SELECT count(*) n FROM app.tasks WHERE project_id=$1 AND title=$2','Потерянный ответ'),1);
  const drafts=createLinkDrafts();const draft=drafts.add('tc2-other','blocks');
  assert.equal(await saveLinks(repository,drafts,{taskId,projectId:f.first.id}),1,'the lost answer reads as a failure');
  assert.equal(draft.state,'failed');
  assert.equal(await saveLinks(repository,drafts,{taskId,projectId:f.first.id}),0,'the repeat succeeds');
  assert.equal(await count('SELECT count(*) n FROM app.task_links WHERE project_id=$1 AND (from_id=$2 OR to_id=$2)',taskId),1);
  assert.equal(sent.filter(line=>line.startsWith('PUT /task-links/')).length,2,'the same link id twice, never a new one');
  // A changed form after a lost answer meets the task it already made and edits it.
  const {repository:second}=await repositoryOf(f.alice,[['PUT','/tasks/tc2-edited']]);
  const first=record('tc2-edited',{title:'Первая версия'});
  await assert.rejects(createTaskOnce(second,first,{projectId:f.first.id,edit:base=>({...base,title:'Вторая версия'})}),/fetch failed|Нет связи с сервером/);
  const changed=record('tc2-edited',{title:'Вторая версия'});
  const edited=await createTaskOnce(second,changed,{projectId:f.first.id,edit:base=>({...base,title:'Вторая версия'})});
  assert.equal(edited.title,'Вторая версия');assert.equal(edited.revision,2);
  assert.equal(await count('SELECT count(*) n FROM app.tasks WHERE project_id=$1 AND id=$2','tc2-edited'),1);
  assert.equal(await count("SELECT count(*) n FROM app.assets WHERE project_id=$1 AND id=$2 AND state='attached'",'tc2-file'),1);
});

test('TC3 a refused upload is sent again as a new upload and the task is created without losing anything',async()=>{
  const taskId='tc3-task',bad=Buffer.from('not an image at all');
  await reserve('tc3-refused','screen.png',bad,taskId);
  const refused=await upload('tc3-refused',bad);assert.equal(refused.statusCode,422);
  // The reservation is spent (#37): sending to it again cannot succeed, and naming it fails the whole creation.
  assert.equal((await upload('tc3-refused',bad)).statusCode,409);
  const {repository}=await repositoryOf(f.alice);
  await assert.rejects(repository.write('tasks',record(taskId,{title:'С отказанным файлом',attachmentIds:['tc3-refused']}),0),error=>error.code==='TASK_FILE_ACCESS');
  assert.equal(await count('SELECT count(*) n FROM app.tasks WHERE project_id=$1 AND id=$2',taskId),0,'nothing half-made');
  // The form keeps the task; the file goes again under a new id, and then the task is created with it.
  const good=Buffer.from('a plain text instead');await stage('tc3-renewed','screen.txt',good,taskId);
  const saved=await createTaskOnce(repository,record(taskId,{title:'С отказанным файлом',attachmentIds:['tc3-renewed']}),{projectId:f.first.id,edit:base=>base});
  assert.deepEqual(saved.attachmentIds,['tc3-renewed']);
  assert.equal((await f.admin.query('SELECT state FROM app.assets WHERE project_id=$1 AND id=$2',[f.first.id,'tc3-refused'])).rows[0]['state'],'quarantined');
});

test('TC4 creating a task, its links and its files needs tasks.write, and an upload belongs to its author',async()=>{
  await seedTask('tc4-other','Чужая связь');await seedTask('tc4-target','Цель связи');
  const put=(user,id)=>f.app.inject({method:'PUT',url:path('tasks/'+id),headers:{...user.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,createInBoard:true,task:{title:'Читатель'}}});
  assert.equal((await put(f.reader,'tc4-reader')).statusCode,403);
  assert.equal((await reserve('tc4-reader-file','r.txt',Buffer.from('r'),'tc4-reader',f.reader)).statusCode,403);
  const link=(user)=>f.app.inject({method:'PUT',url:path('task-links/tc4-link'),headers:{...user.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:{kind:'related',fromId:'tc4-other',toId:'tc4-target'}}});
  assert.equal((await link(f.reader)).statusCode,403);
  assert.equal(await count('SELECT count(*) n FROM app.task_links WHERE project_id=$1 AND id=$2','tc4-link'),0);
  // Борис may create a task, but not with a file Алиса staged for that same id.
  const bytes=Buffer.from('alice only');await stage('tc4-alice-file','a.txt',bytes,'tc4-bob');
  const taken=await f.app.inject({method:'PUT',url:path('tasks/tc4-bob'),headers:{...f.bob.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,task:{title:'Борис',attachmentIds:['tc4-alice-file']}}});
  assert.equal(taken.statusCode,422);assert.equal(taken.json().code,'TASK_FILE_ACCESS');
  assert.equal(await count('SELECT count(*) n FROM app.tasks WHERE project_id=$1 AND id=$2','tc4-bob'),0);
  assert.equal((await link(f.bob)).statusCode,200,'an editor links tasks');
  // Someone outside the project learns nothing about it.
  const outsider=await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.second.id}/task-links/tc4-outside`,headers:{...f.reader.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:{kind:'related',fromId:'a',toId:'b'}}});
  assert.ok([403,404].includes(outsider.statusCode),outsider.body);
});
