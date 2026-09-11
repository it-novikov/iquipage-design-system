import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const origin=new URL(process.env.MAPS_TEST_URL||'http://127.0.0.1:4317').origin;
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Local test origin required');
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
const checks=[];let failure;
try{
  const page=await browser.newPage();await page.goto(origin);
  const result=await page.evaluate(async()=>{
    const {BrowserRepository}=await import('/src/repository.js');
    const {BrowserAttachmentAdapter}=await import('/src/board/attachment-idb.js');
    const {createTask}=await import('/src/tasks.js');
    const name='board-attachment-contract-'+crypto.randomUUID();
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{for(const store of ['maps','templates','runs','tasks','rules','releases','tags','taskSettings','threads','taskLinks'])r.result.createObjectStore(store,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const legacy={...createTask({projectId:'asset-project',title:'Legacy v2'}),id:'legacy-v2',revision:2,description:'Сохранённый текст'};
    await new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').put(legacy);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
    const repo=new BrowserRepository(name,{actorId:'test-file-owner'}),adapter=new BrowserAttachmentAdapter(repo);
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;canvas.getContext('2d').fillRect(0,0,80,40);
    const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),file=new File([image],'cover.png',{type:'image/png'});
    const input={id:'file-idb',projectId:'asset-project',taskId:'task-idb'};
    const staged=await adapter.upload(input,file),repeat=await adapter.upload(input,file);
    const before=await repo.read('tasks',input.taskId,input.projectId);
    const saved=await repo.write('tasks',{...createTask({projectId:input.projectId,title:'Files'}),id:input.taskId,attachmentIds:[staged.id],coverAttachmentId:staged.id},0);
    const thumb=await adapter.blob({...input,variant:'thumb'}),original=await adapter.blob({...input,variant:'original'});
    let crossProject=false;try{await adapter.describe({...input,projectId:'other-project'});}catch(error){crossProject=error.code==='FILE_ACCESS';}
    const version=(await repo.ready).version,legacyAfter=await repo.read('tasks',legacy.id,legacy.projectId);
    await repo.close();    const reopened=new BrowserRepository(name,{actorId:'test-file-owner'}),files=new BrowserAttachmentAdapter(reopened);
    const persisted=await reopened.read('tasks',input.taskId,input.projectId);
    const afterRestart=await files.blob({...input,variant:'original'});
    const withoutCover=await reopened.write('tasks',{...persisted,coverAttachmentId:null},persisted.revision);
    const retained=await files.describe(input);
    await reopened.write('tasks',{...withoutCover,attachmentIds:[]},withoutCover.revision);
    let deniedAfterRemoval=false;try{await files.blob({...input,variant:'original'});}catch(error){deniedAfterRemoval=error.code==='FILE_ACCESS';}
    const aborted=new AbortController();aborted.abort();let cancelled=false;
    try{await files.upload({...input,id:'cancelled-file'},file,{signal:aborted.signal});}catch(error){cancelled=error.name==='AbortError';}
    const removed=await files.collect(Date.now()+2*24*60*60*1000);
    const blobCount=await new Promise((resolve,reject)=>{const r=(async()=>{const database=await reopened.ready;const q=database.transaction('_attachmentBlobs').objectStore('_attachmentBlobs').count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);})();r.catch(reject);});
    await reopened.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
    return {version,legacyAfter,staged,repeat,before,saved,thumb:{type:thumb.type,size:thumb.size},originalSize:original.size,fileSize:file.size,crossProject,persisted,afterRestartSize:afterRestart.size,retained,deniedAfterRemoval,cancelled,removed,blobCount};
  });
  const mark=name=>{checks.push(name);console.log('PASS '+name);};
  assert.equal(result.version,3);assert.equal(result.legacyAfter.description,'Сохранённый текст');assert.equal(result.legacyAfter.revision,2);mark('IndexedDB 2→3 preserves existing tasks and adds separate binary stores');
  assert.equal(result.before,null);assert.equal(result.repeat.id,result.staged.id);assert.equal(result.repeat.revision,1);mark('browser staging and identical retries create neither a task nor duplicate metadata');
  assert.equal(result.saved.coverAttachmentId,'file-idb');assert.equal(result.thumb.type,'image/webp');assert.ok(result.thumb.size>0);assert.equal(result.originalSize,result.fileSize);assert.equal(result.afterRestartSize,result.fileSize);assert.equal(result.persisted.coverAttachmentId,'file-idb');mark('browser attachment and cover commit survive database reopen with original bytes');
  assert.equal(result.retained.state,'attached');assert.equal(result.deniedAfterRemoval,true);assert.equal(result.crossProject,true);mark('cover removal preserves attachment; file removal and foreign project reads are denied');
  assert.equal(result.cancelled,true);assert.equal(result.removed,1);assert.equal(result.blobCount,0);mark('aborted browser upload does not commit and expired detached blobs are reclaimed');
}catch(error){failure=error;console.error(error);}finally{await browser.close();}
await mkdir('artifacts/attachment-core',{recursive:true});
await writeFile('artifacts/attachment-core/browser-idb.json',JSON.stringify({status:failure?'FAIL':'PASS',scope:'attachment-adapter-contract; no cover UI',checks,error:failure?.message},null,2));
if(failure)process.exitCode=1;
