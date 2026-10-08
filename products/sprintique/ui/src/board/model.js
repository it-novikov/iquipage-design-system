import {clone, requireValue, validId} from '../common.js';
import {taskColumn} from '../tasks.js';
import {avatarName} from './assignees.js';
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
    // A service account shows by its own name here: its initials, not those of its remark (SPR-7).
    const name=String(task.ownerKind==='service'?avatarName(task.owner):task.owner||'').trim();
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
/** Releases a board can show: running ones first (the one ending first leads), then planned ones by their start. */
export function boardReleaseChoices(releases=[]){
  const open=releases.filter(release=>['active','planned'].includes(release.lifecycle)&&!release.archivedAt);
  const key=release=>[release.lifecycle==='active'?0:1,release.lifecycle==='active'?release.plannedEnd||'9999-12-31':release.plannedStart||'9999-12-31'];
  return open.sort((a,b)=>{const [x,y]=[key(a),key(b)];return x[0]-y[0]||x[1].localeCompare(y[1])||String(a.name).localeCompare(String(b.name),'ru');});
}
/** The board title is the release switcher (the DS switcher of the workspace and project in the top bar): the running
 *  releases, then the planned ones, each with its state as a quiet word, then «Без релиза» after a rule; the release
 *  the board shows is the checked one. The action of an item is `board-release:<id|backlog>`. */
export const BOARD_RELEASE_ACTION='board-release';
export function boardReleaseItems(releases=[],shown={backlog:true}){
  const choices=boardReleaseChoices(releases),current=shown?.backlog?'backlog':shown?.releaseId;
  return [...choices.map(release=>({label:release.name,action:`${BOARD_RELEASE_ACTION}:${release.id}`,current:release.id===current,meta:release.lifecycle==='active'?'идёт':'запланирован'})),
    ...(choices.length?[{separator:true}]:[]),{label:'Без релиза',action:`${BOARD_RELEASE_ACTION}:backlog`,current:current==='backlog'}];
}
/** The release (or 'backlog') a picked switcher item stands for; null for any other menu action. */
export function boardReleasePick(action){
  const [kind,...rest]=String(action||'').split(':'),value=rest.join(':');
  return kind===BOARD_RELEASE_ACTION&&value?value:null;
}
/** What the board shows for a person's choice: the chosen running or planned release, 'backlog', or — when nothing was
 *  chosen or the chosen release has finished — the running release, else the tasks without a release. The choice
 *  itself is left as it is, so the person's preference is never overwritten by a fallback. */
export function boardShown(chosen,releases=[]){
  if(chosen==='backlog')return {backlog:true};
  const release=boardReleaseChoices(releases).find(item=>item.id===chosen)||runningRelease(releases);
  return release?{releaseId:release.id,lifecycle:release.lifecycle,name:release.name}:{backlog:true};
}
