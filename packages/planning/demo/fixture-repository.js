/** TEST FIXTURE ONLY. One isolated IndexedDB, shared with the unchanged v3.4 task/board UI.
 * This is not the vNext API, ACL or production repository. No connection to a server. */
import {BrowserRepository} from '../../maps/src/repository.js';
import {COLLECTIONS,prepareWrite} from '../../maps/src/model.js';
export function fixtureRepository(namespace,{workspaceId='pn2-fixture-space',projectId='pn-project'}={}) {
  const repository=Object.create(BrowserRepository.prototype);
  repository.context={workspaceId,actorId:'pn2-fixture-user'};
  repository.listeners=new Set();repository.channel=null;
  repository.capabilities={storage:'browser-fixture',collaboration:false,events:false,llm:false};
  repository.ready=new Promise((resolve,reject)=>{
    const request=indexedDB.open(namespace,1);
    request.onupgradeneeded=()=>{for(const name of [...COLLECTIONS,'_attachmentBlobs','_pnFixture'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});
      request.transaction.objectStore('threads').createIndex('byTask',['projectId','taskId']);};
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Закройте старые вкладки этой тестовой сборки.'));
  });
  const baseWrite=repository.write.bind(repository);
  repository.write=async(collection,value,baseRevision,options)=>{
    if(collection==='tasks'){
      const previous=await repository.read('tasks',value.id,value.projectId);
      if(!previous)value={...value,preparation:value.preparation||'draft',planningAdmission:!!value.planningAdmission};
      else if(previous.releaseId!==value.releaseId||previous.parentId!==value.parentId){
        const releases=await repository.list('releases',value.projectId);
        if(previous.planningAdmission||releases.some(r=>r.planningPhase==='active'&&[previous.releaseId,value.releaseId].includes(r.id)))throw Error('Активный состав меняется через Планирование с проверкой последствий.');
      }
      if(previous?.releaseId!==value.releaseId)value={...value,releaseAssignment:value.releaseId?'assigned':'none'};
    }
    return baseWrite(collection,value,baseRevision,options);
  };
  repository.fixtureTransaction=async update=>{
    const db=await repository.ready;
    return new Promise((resolve,reject)=>{
      const names=['tasks','releases','tags','taskLinks','_pnFixture'],tx=db.transaction(names,'readwrite'),snapshot={};let left=names.length,result,cause;
      for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{
        snapshot[name]=request.result;if(--left)return;
        try{result=update(snapshot,(collection,value,baseRevision)=>{
          const before=snapshot[collection].find(item=>item.id===value.id);
          const next=collection==='_pnFixture'?value:prepareWrite(collection,value,before,baseRevision,snapshot.tasks,snapshot,repository.context.actorId);
          tx.objectStore(collection).put(next);snapshot[collection]=[...snapshot[collection].filter(item=>item.id!==next.id),next];return next;
        });}catch(error){cause=error;tx.abort();}
      };}
      tx.oncomplete=()=>{repository.listeners.forEach(fn=>fn({collection:'tasks',projectId}));resolve(result);};
      tx.onabort=()=>reject(cause||tx.error||Error('Тестовое сохранение не выполнено.'));
      tx.onerror=()=>{cause ||= tx.error;};
    });
  };
  repository.fixtureSnapshot=async()=>{
    const db=await repository.ready;
    return new Promise((resolve,reject)=>{const names=['tasks','releases','tags','taskLinks','_pnFixture'],tx=db.transaction(names),data={};
      for(const name of names){const req=tx.objectStore(name).getAll();req.onsuccess=()=>{data[name]=req.result;};}
      tx.oncomplete=()=>resolve(data);tx.onabort=()=>reject(tx.error);
    });
  };
  return repository;
}
