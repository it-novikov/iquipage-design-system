import {clone, requireValue, validId} from '../common.js';
import {taskColumn} from '../tasks.js';
export {BOARD_SORTS, boardComparator} from './ordering.js';

export const TASK_KINDS = Object.freeze({task:'Задача', bug:'Баг', epic:'Эпик'});
export function taskKindLabel(task) {
  const kind=Object.hasOwn(TASK_KINDS,task.type)?TASK_KINDS[task.type]:TASK_KINDS.task;
  return task.parentId&&task.type!=='epic'?(task.type==='bug'?'Баг · подзадача':'Подзадача'):kind;
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
    if(name)unique.set(task.ownerId||name.toLocaleLowerCase('ru'),name);
  }
  return [...unique.values()].sort((a,b)=>a.localeCompare(b,'ru'));
}
/** A task appears once, in its own status. Filtering never hides a matching child. */
export function projectColumn(tasks,status,{predicate=()=>true,compare,collapsed=new Set(),filtering=false}={}){
  const index=buildTaskIndex(tasks),all=tasks.filter(t=>!t.archivedAt&&taskColumn(t)===status);
  const matched=all.filter(predicate).sort(compare),byId=new Map(matched.map(t=>[t.id,t]));
  const children=new Map(),roots=[];
  for(const task of matched){
    if(task.parentId&&byId.has(task.parentId)&&task.parentId!==task.id){
      if(!children.has(task.parentId))children.set(task.parentId,[]);children.get(task.parentId).push(task);
    }else roots.push(task);
  }
  const rows=[],seen=new Set(),suppressed=new Set();
  const visit=(task,depth)=>{
    if(seen.has(task.id))return;seen.add(task.id);
    const nested=children.get(task.id)||[];
    rows.push({task,depth,children:nested.length,parent:index.byId.get(task.parentId)||null,
      otherChildren:(index.children.get(task.id)||[]).filter(t=>!t.archivedAt&&taskColumn(t)!==status).length});
    const queue=nested.map(t=>({task:t,depth:depth+1,hidden:!filtering&&collapsed.has(task.id)}));
    return queue;
  };
  const flush=queue=>{
    while(queue.length){
      const {task,depth,hidden=false}=queue.pop();
      if(seen.has(task.id)||suppressed.has(task.id))continue;
      if(hidden){
        suppressed.add(task.id);
        for(const child of children.get(task.id)||[])queue.push({task:child,depth:depth+1,hidden:true});
      }else{const next=visit(task,depth);if(next)queue.push(...next.reverse());}
    }
  };
  flush(roots.map(task=>({task,depth:0})).reverse());
  // Corrupt legacy cycles remain visible; they are rejected on the next structural write.
  for(const task of matched)if(!seen.has(task.id)&&!suppressed.has(task.id))flush([{task,depth:0}]);
  return {rows,total:all.length,matched:matched.length,index};
}
