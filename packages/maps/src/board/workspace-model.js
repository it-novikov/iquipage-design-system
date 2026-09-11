import {clone,now,validId,validText,requireValue} from '../common.js';
import {validateTaskSettings} from './task-templates.js';
import {prepareThread} from './thread-model.js';
export const WORK_COLLECTIONS=['releases','tags','taskSettings','threads','taskLinks'];
export const TAG_TONES=Object.freeze({neutral:'Серый',blue:'Синий',purple:'Фиолетовый',green:'Зелёный',amber:'Янтарный',red:'Красный'});
export const TAG_NAME_LIMIT=32;
export const tagNameLength=value=>[...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(value)].length;
export const writeScopes=collection=>({tasks:['tasks','tags','releases','taskSettings','attachments'],threads:['threads','tasks'],taskLinks:['taskLinks','tasks']}[collection]||[collection]);
const key=text=>text.trim().normalize('NFC').toLocaleLowerCase('ru');
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function prepareWorkspaceRecord(collection,record,previous,snapshot={},actorId='local-user') {
  const value=clone(record),all=name=>snapshot[name]||[];
  if(['tags','releases'].includes(collection)) {
    requireValue(validText(value.name,collection==='tags'?1000:100)&&value.name.trim(),'CATALOG_NAME','Введите корректное название.');
    value.name=value.name.trim();
    if(collection==='tags'&&value.name!==previous?.name)requireValue(tagNameLength(value.name)<=TAG_NAME_LIMIT,'TAG_NAME_LENGTH',`Название тега — до ${TAG_NAME_LIMIT} символов.`);
    requireValue(!all(collection).some(item=>item.id!==value.id&&item.projectId===value.projectId&&key(item.name)===key(value.name)),'CATALOG_DUPLICATE','Такое название уже есть в проекте, в том числе в архиве.');
    requireValue(value.archivedAt==null||typeof value.archivedAt==='string'&&Number.isFinite(Date.parse(value.archivedAt)),'CATALOG_ARCHIVE','Некорректная дата архивации.');
    if(collection==='tags')requireValue(Object.hasOwn(TAG_TONES,value.tone),'TAG_TONE','Выберите цвет из палитры проекта.');
    else {
      requireValue(['planned','released'].includes(value.status),'RELEASE_STATE','Неизвестное состояние релиза.');
      requireValue(value.targetDate==null||date(value.targetDate),'RELEASE_DATE','Некорректная дата релиза.');
    }
  }
  if(collection==='taskSettings')validateTaskSettings(value);
  if(collection==='threads')return prepareThread(value,previous,all('tasks'),actorId);
  if(collection==='taskLinks')validateTaskLink(value,previous,all('tasks'),all('taskLinks'));
  if(collection==='tasks')validateTaskReferences(value,previous,snapshot);
  value.createdAt=previous?.createdAt||now();
  return value;
}
function requireReference(records,id,projectId,alreadyAssigned) {
  requireValue(validId(id),'TASK_REFERENCE','Некорректный идентификатор.');
  const item=records.find(record=>record.id===id);
  requireValue(Boolean(item),'TASK_REFERENCE','Тег или релиз не найден.');
  requireValue(item.projectId===projectId,'TASK_REFERENCE','Тег или релиз относится к другому проекту.');
  if(item.archivedAt)requireValue(alreadyAssigned,'TASK_REFERENCE_ARCHIVED','Архивное значение нельзя назначить заново.');
}
function validateTaskReferences(task,previous,snapshot) {
  requireValue(task.releaseId==null||validId(task.releaseId),'TASK_RELEASE','Некорректный релиз.');
  requireValue(task.tagIds===undefined||Array.isArray(task.tagIds),'TASK_TAGS','Теги должны быть списком.');
  if(task.releaseId)requireReference(snapshot.releases||[],task.releaseId,task.projectId,previous?.releaseId===task.releaseId);
  const tags=task.tagIds||[];
  requireValue(Array.isArray(tags),'TASK_TAGS','Теги должны быть списком.');
  requireValue(new Set(tags).size===tags.length,'TASK_TAGS','Теги не должны повторяться.');
  for(const id of tags)requireReference(snapshot.tags||[],id,task.projectId,(previous?.tagIds||[]).includes(id));
}
function sameLink(a,b){
  if(a.kind!==b.kind)return false;
  if(a.fromId===b.fromId&&a.toId===b.toId)return true;
  return a.kind==='related'&&a.fromId===b.toId&&a.toId===b.fromId;
}
function validateTaskLink(link,previous,tasks,links){
  requireValue(link.archivedAt==null||typeof link.archivedAt==='string'&&Number.isFinite(Date.parse(link.archivedAt)),'TASK_LINK_ARCHIVE','Некорректная дата удаления связи.');
  requireValue(['depends','related'].includes(link.kind),'TASK_LINK','Неизвестный тип связи.');
  requireValue(validId(link.fromId)&&validId(link.toId)&&link.fromId!==link.toId,'TASK_LINK','Выберите две разные задачи.');
  if(previous)for(const field of ['kind','fromId','toId'])requireValue(previous[field]===link[field],'TASK_LINK','Для смены связи создайте новую.');
  for(const id of [link.fromId,link.toId]){
    const task=tasks.find(task=>task.id===id);
    requireValue(task&&task.projectId===link.projectId,'TASK_LINK_PROJECT','Связывайте задачи одного доступного проекта.');
  }
  if(link.archivedAt)return;
  const active=links.filter(item=>!item.archivedAt&&item.projectId===link.projectId&&item.id!==link.id);
  requireValue(!active.some(item=>sameLink(item,link)),'TASK_LINK_DUPLICATE','Эта связь уже существует.');
  if(link.kind==='depends')validateDependencyCycle(link,active);
}
function validateDependencyCycle(link,links){
  const edges=new Map();
  for(const item of links.filter(item=>item.kind==='depends')){
    if(!edges.has(item.fromId))edges.set(item.fromId,[]);
    edges.get(item.fromId).push(item.toId);
  }
  const stack=[link.toId],visited=new Set();
  while(stack.length){
    const id=stack.pop();
    requireValue(id!==link.fromId,'TASK_DEPENDENCY_CYCLE','Зависимости не должны образовывать цикл.');
    if(visited.has(id))continue;
    visited.add(id);stack.push(...(edges.get(id)||[]));
  }
}
export function linkCaption(link,taskId){
  if(link.kind==='related')return 'Связана с';
  return link.fromId===taskId?'Зависит от':'Блокирует';
}
