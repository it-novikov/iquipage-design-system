import {requireValue,validId} from '../common.js';
import {threadOrder} from './thread-model.js';

/** Cursors locate a task-scoped snapshot; they are not credentials. */
const encode=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function decode(value){
  requireValue(typeof value==='string'&&value.length<=2048&&/^[A-Za-z0-9_-]+$/.test(value),'THREAD_CURSOR','Некорректная страница обсуждений.');
  try{return JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));}catch{requireValue(false,'THREAD_CURSOR','Некорректная страница обсуждений.');}
}
async function signature(records){
  const bytes=new TextEncoder().encode(JSON.stringify(records.map(thread=>[thread.id,thread.revision])));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function threadSummary(thread){
  const {id,projectId,taskId,revision,requiresResolution,resolved,resolution,createdAt,lastActivityAt}=thread;
  return {id,projectId,taskId,revision,requiresResolution,resolved,resolution,createdAt,lastActivityAt,
    summary:true,messageCount:thread.messages.length,messages:[{body:thread.messages[0].body.slice(0,160)}]};
}
export async function selectThreadPage(records,projectId,taskId,{cursor=null,limit=20,signal}={}){
  requireValue(validId(projectId)&&validId(taskId),'THREAD_TASK','Не задана задача.');
  requireValue(Number.isInteger(limit)&&limit>=1&&limit<=50,'THREAD_PAGE_SIZE','Размер страницы должен быть от 1 до 50.');
  signal?.throwIfAborted();
  const ordered=records.filter(thread=>thread.projectId===projectId&&thread.taskId===taskId).sort(threadOrder);
  const version=await signature(ordered);let offset=0;
  if(cursor){const previous=decode(cursor);
    requireValue(previous?.v===1&&previous.projectId===projectId&&previous.taskId===taskId,'THREAD_CURSOR_SCOPE','Эта страница относится к другой задаче.');
    requireValue(previous.version===version,'THREAD_CURSOR_STALE','Обсуждения изменились. Обновите список; черновики останутся.');
    const index=ordered.findIndex(thread=>thread.id===previous.after);
    requireValue(index>=0,'THREAD_CURSOR','Позиция обсуждения не найдена.');offset=index+1;
  }
  const selected=ordered.slice(offset,offset+limit),last=selected.at(-1);
  signal?.throwIfAborted();
  return {items:selected.map(threadSummary),total:ordered.length,unresolved:ordered.filter(thread=>thread.requiresResolution&&!thread.resolved).length,
    nextCursor:offset+selected.length<ordered.length?encode({v:1,projectId,taskId,version,after:last.id}):null};
}
