import {clone, requireValue, validId} from '../common.js';
import {taskColumn} from '../tasks.js';
export {BOARD_SORTS, boardComparator} from './ordering.js';

export const TASK_KINDS = Object.freeze({task:'Задача', bug:'Баг', epic:'Эпик'});
export function taskKindLabel(task) {
  const kind=Object.hasOwn(TASK_KINDS,task.type)?TASK_KINDS[task.type]:TASK_KINDS.task;
  return task.parentId&&task.type!=='epic'?(task.type==='bug'?'Баг, подзадача':'Подзадача'):kind;
}
/** The index is a view of canonical tasks, never a second source of truth. */
export function buildTaskIndex(tasks) {
  const byId=new Map(),children=new Map();
  for(const task of tasks){
    requireValue(!byId.has(task.id),'TASK_ID','Повторный ID задачи.');byId.set(task.id,task);
    if(task.parentId){if(!children.has(task.parentId))children.set(task.parentId,[]);children.get(task.parentId).push(task);}
  }
  return {byId,children};
}
/** Host must call this against the transaction snapshot, not a filtered UI list. */
export function reparentTask(task,parentId,tasks) {
  requireValue(parentId===null||validId(parentId),'TASK_PARENT','Выберите родительскую задачу.');
  const {byId}=buildTaskIndex(tasks),visited=new Set([task.id]);let current=parentId;
  while(current){
    requireValue(!visited.has(current),'TASK_CYCLE','Задача не может быть своим предком.');visited.add(current);
    const parent=byId.get(current);
    requireValue(parent&&parent.projectId===task.projectId&&!parent.archivedAt,'TASK_PARENT','Родитель недоступен в этом проекте.');
    current=parent.parentId||null;
  }
  return {...clone(task),parentId};
}

export function childOwners(parentId,index){
  const unique=new Map();
  for(const task of index.children.get(parentId)||[]){
    const name=String(task.owner||'').trim();
    if(name)unique.set(task.ownerId||name.toLocaleLowerCase('ru'),{id:task.ownerId||undefined,name});
  }
  return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
/** A task appears once, as its own card in its own status column; hierarchy is shown on the cards
 *  (parent link on a child, subtask summary on a parent), never by indenting or hiding cards. */
export function projectColumn(tasks,status,{predicate=()=>true,compare}={}){
  const index=buildTaskIndex(tasks),all=tasks.filter(t=>!t.archivedAt&&taskColumn(t)===status);
  const matched=all.filter(predicate).sort(compare);
  const rows=matched.map(task=>({task,parent:task.parentId&&task.parentId!==task.id?index.byId.get(task.parentId)||null:null,
    children:(index.children.get(task.id)||[]).filter(child=>!child.archivedAt&&child.id!==task.id)}));
  return {rows,total:all.length,matched:matched.length,index};
}
/** The release a new task on the board joins: the running one, or the one that ends first when several run. */
export function runningRelease(releases=[]){
  const running=releases.filter(release=>release.lifecycle==='active'&&!release.archivedAt);
  const end=release=>release.plannedEnd||'9999-12-31';
  return running.sort((a,b)=>end(a).localeCompare(end(b))||String(a.name).localeCompare(String(b.name),'ru'))[0]||null;
}
