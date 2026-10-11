import {uid} from '../common.js';

/**
 * Creating a task together with what its form gathered (owner's request: links and files while filling the form).
 *
 * Files ride in the creation itself: an upload is staged on the new task's id before the task exists and the
 * creation names it in `attachmentIds`, so the server attaches it in the task's own transaction (a planning commit
 * as well). Links follow the task, one idempotent command each: a creation in a release or under a parent is a
 * planning command (preview, then commit), which knows nothing of links. Every step can be repeated safely: the task
 * keeps the form's id, a link keeps the id it got when it was chosen, and the idempotency key is the hash of the
 * exact request, so a lost answer is replayed by the server rather than done twice.
 */

/** What the picked task is to the task being created, in the words of the relation map. */
export const LINK_KINDS=[['depends','Эта задача зависит от выбранной'],['blocks','Эта задача блокирует выбранную'],['related','Эта задача связана с выбранной']];
/** The picker's extra choice: the picked task becomes the parent (the «Родитель» field, not a link). */
export const PARENT_KIND=['parent','Родитель этой задачи'];

/** The stored link of a chosen one: «Ждёт эту задачу» is stored as the other task depending on this one. */
export function linkRecord(draft,{taskId,projectId}){
  const blocks=draft.kind==='blocks';
  return {id:draft.id,projectId,revision:0,kind:blocks?'depends':draft.kind,fromId:blocks?draft.otherId:taskId,toId:blocks?taskId:draft.otherId};
}

/**
 * The links chosen in the form of a task that does not exist yet. Each keeps its id for life, so saving it again
 * after a lost answer is the same command. One link per other task: two opposite dependencies would be a cycle.
 */
export function createLinkDrafts(){
  const items=[];
  return {
    items:()=>items,
    add(otherId,kind){
      if(!LINK_KINDS.some(([value])=>value===kind))throw Error('Выберите, как задачи связаны.');
      if(!otherId)throw Error('Выберите задачу.');
      if(items.some(item=>item.otherId===otherId))throw Error('С этой задачей связь уже выбрана.');
      const draft={id:uid('task-link'),otherId,kind,state:'pending',error:''};items.push(draft);return draft;
    },
    /** A saved link stays: it is in the project now and is removed in the task's drawer. */
    remove(id){const index=items.findIndex(item=>item.id===id&&item.state!=='saved'&&item.state!=='saving');if(index>=0)items.splice(index,1);return index>=0;},
    find:id=>items.find(item=>item.id===id)||null,
    unsaved:()=>items.filter(item=>item.state!=='saved'),
    failed:()=>items.filter(item=>item.state==='failed')
  };
}

/**
 * Creates the task once. A repeated attempt reuses the form's id, so it can never make a second task: the same
 * request is answered from the server's ledger, and a changed one (the person edited the form after an answer was
 * lost) meets the task the lost attempt created. That task is read and the attempt continues as its edit.
 */
export async function createTaskOnce(repository,record,{projectId,edit}){
  try{return await repository.write('tasks',record,0);}
  catch(error){
    if(error?.code!=='CONFLICT')throw error;
    const existing=await repository.read('tasks',record.id,projectId).catch(()=>null);
    if(!existing)throw error;
    return repository.write('tasks',edit(existing),existing.revision);
  }
}

/** Saves one chosen link of the created task; its state and error are kept on the draft for the form to show. */
export async function saveLink(repository,draft,{taskId,projectId,onChange=()=>{}}){
  if(draft.state==='saved')return true;
  draft.state='saving';draft.error='';onChange(draft);
  const record=linkRecord(draft,{taskId,projectId});
  try{await repository.write('taskLinks',record,0);draft.state='saved';}
  catch(error){
    // A link saved by an attempt whose answer was lost: the same request is replayed by the ledger, so a conflict
    // here means the link is already there. It counts as saved only when the project really has it.
    const present=error?.code==='CONFLICT'&&(await repository.list('taskLinks',projectId).catch(()=>[])).some(link=>link.id===record.id&&!link.archivedAt);
    if(present)draft.state='saved';
    else{draft.state='failed';draft.error=error?.message||'Связь не сохранена.';}
  }
  onChange(draft);return draft.state==='saved';
}

/** Saves every link not saved yet, one after another; returns how many of them failed. */
export async function saveLinks(repository,drafts,{taskId,projectId,onChange=()=>{},onProgress=()=>{}}){
  const todo=drafts.unsaved();let done=0,failed=0;
  for(const draft of todo){
    onProgress({done,total:todo.length});
    if(!await saveLink(repository,draft,{taskId,projectId,onChange}))failed++;
    done++;
  }
  onProgress({done,total:todo.length});
  return failed;
}

/** One line for the form after a creation whose links did not all save. */
export function linksFailedText(key,failed){
  if(failed===1)return `Задача ${key} создана. Одна связь не сохранилась.`;
  const few=failed%10>=2&&failed%10<=4&&(failed%100<10||failed%100>=20);
  return `Задача ${key} создана. Не сохранились ${failed} ${few?'связи':'связей'}.`;
}
