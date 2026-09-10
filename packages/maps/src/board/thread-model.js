import {clone,now,uid,validId,validText,requireValue} from '../common.js';

/** Pure validation for a discussion owned by one existing task. */
export function validateThreadShape(thread) {
  requireValue(validId(thread.taskId),'THREAD_TASK','Не задана задача обсуждения.');
  requireValue(typeof thread.requiresResolution==='boolean','THREAD_KIND','Не задан тип обсуждения.');
  requireValue(typeof thread.resolved==='boolean','THREAD_RESOLUTION','Некорректное состояние обсуждения.');
  requireValue(!thread.resolved||thread.requiresResolution,'THREAD_RESOLUTION','Обычный комментарий не требует решения.');
  requireValue(Array.isArray(thread.messages),'THREAD_MESSAGES','Сообщения должны быть списком.');
  requireValue(thread.messages.length>0&&thread.messages.length<=2000,'THREAD_MESSAGES','Некорректный размер обсуждения.');
  const ids=new Set();
  for(const message of thread.messages){
    requireValue(message&&typeof message==='object'&&!Array.isArray(message),'THREAD_MESSAGE','Некорректное сообщение.');
    requireValue(validId(message.id)&&!ids.has(message.id),'THREAD_MESSAGE_ID','ID сообщения должен быть уникальным.');
    requireValue(validText(message.body,20000)&&message.body.trim(),'THREAD_TEXT','Введите сообщение до 20 000 символов.');
    ids.add(message.id);
  }
}
export function prepareThread(record,previous,tasks,actorId='local-user') {
  validateThreadShape(record);
  const value=clone(record);
  const task=tasks.find(task=>task.id===value.taskId&&task.projectId===value.projectId);
  requireValue(task&&!task.archivedAt,'THREAD_TASK','Задача недоступна для обсуждения.');
  if(previous){
    requireValue(previous.taskId===value.taskId,'THREAD_IDENTITY','Нельзя перенести обсуждение в другую задачу.');
    requireValue(previous.requiresResolution===value.requiresResolution,'THREAD_IDENTITY','Тип опубликованного обсуждения неизменен.');
    requireValue(value.messages.length>=previous.messages.length,'THREAD_MESSAGE_IMMUTABLE','Нельзя удалить прежние сообщения при ответе.');
    previous.messages.forEach((message,index)=>{
      requireValue(JSON.stringify(message)===JSON.stringify(value.messages[index]),'THREAD_MESSAGE_IMMUTABLE','Прежние сообщения и их порядок должны сохраниться.');
    });
  }
  const stamp=now();
  for(let i=previous?.messages.length||0;i<value.messages.length;i++){
    value.messages[i].authorId=actorId;value.messages[i].createdAt=stamp;
  }
  value.createdAt=previous?.createdAt||stamp;value.createdBy=previous?.createdBy||actorId;
  value.resolution=value.resolved?(previous?.resolved?previous.resolution:{actorId,at:stamp}):null;
  value.lastActivityAt=stamp;
  return value;
}
export function threadOrder(a,b){
  const unresolved=thread=>Number(thread.requiresResolution&&!thread.resolved);
  return unresolved(b)-unresolved(a)||(b.lastActivityAt||b.createdAt).localeCompare(a.lastActivityAt||a.createdAt)||a.id.localeCompare(b.id);
}
export function newThread(task,{body,requiresResolution=false,messageId=uid('message'),id=uid('thread')}={}) {
  return {id,projectId:task.projectId,taskId:task.id,revision:0,requiresResolution,resolved:false,messages:[{id:messageId,body}]};
}
/** Stable message ID makes a retry after a lost response safe. */
export async function postMessage(repository,task,{threadId=uid('thread'),messageId=uid('message'),body,requiresResolution=false}) {
  requireValue(validText(body,20000)&&body.trim(),'THREAD_TEXT','Введите сообщение.');
  for(let attempt=0;attempt<3;attempt++){
    const previous=await repository.read('threads',threadId,task.projectId);
    requireValue(!previous || previous.taskId === task.id,'THREAD_TASK_MISMATCH','Обсуждение относится к другой задаче.');
    const existing=previous?.messages.find(message=>message.id===messageId);
    if(existing){requireValue(existing.body===body,'THREAD_MESSAGE_CONFLICT','ID сообщения уже использован для другого текста.');return previous;}
    const next=previous?{...previous,messages:[...previous.messages,{id:messageId,body}]}:newThread(task,{id:threadId,messageId,body,requiresResolution});
    try{return await repository.write('threads',next,previous?.revision||0);}
    catch(error){if(error.code!=='CONFLICT'||attempt===2)throw error;}
  }
}
export async function resolveThread(repository,thread,resolved){
  requireValue(thread.requiresResolution,'THREAD_RESOLUTION','Обычный комментарий не требует решения.');
  if(thread.resolved===resolved)return thread;
  return repository.write('threads',{...thread,resolved},thread.revision);
}
