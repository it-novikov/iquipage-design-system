import {requireValue,validId} from '../common.js';
import {selectThreadPage} from './thread-page.js';

export async function memoryThreadPage(repository,projectId,taskId,options={}){
  await repository.queue?.catch(()=>{});options.signal?.throwIfAborted();
  const task=repository.data.tasks.get(taskId);
  requireValue(task?.projectId===projectId,'THREAD_TASK','Задача недоступна.');
  return selectThreadPage([...repository.data.threads.values()],projectId,taskId,options);
}
export async function browserThreadPage(repository,projectId,taskId,options={}){
  requireValue(validId(projectId)&&validId(taskId),'THREAD_TASK','Не задана задача.');
  options.signal?.throwIfAborted();const db=await repository.ready;options.signal?.throwIfAborted();
  const records=await new Promise((resolve,reject)=>{
    const tx=db.transaction(['tasks','threads'],'readonly');let result,error;
    const abort=()=>{try{tx.abort();}catch{}};
    options.signal?.addEventListener('abort',abort,{once:true});
    const task=tx.objectStore('tasks').get(taskId);
    const threads=tx.objectStore('threads').index('byTask').getAll([projectId,taskId]);
    task.onsuccess=()=>{if(task.result?.projectId!==projectId){error=Error('Задача недоступна.');error.code='THREAD_TASK';tx.abort();}};
    threads.onsuccess=()=>{result=threads.result;};
    tx.oncomplete=()=>{options.signal?.removeEventListener('abort',abort);resolve(result);};
    tx.onabort=()=>{options.signal?.removeEventListener('abort',abort);reject(error||options.signal?.reason||tx.error||Error('Обсуждения недоступны.'));};
  });
  return selectThreadPage(records,projectId,taskId,options);
}
