import {clone,uid,validId,validText,requireValue} from '../common.js';

/** Compatibility projection. Old structured lists remain untouched until explicit save. */
export function taskMarkdown(task={}) {
  if(task.contentVersion===2)return task.description||'';
  const literal=text=>String(text).replace(/[\\`*_{}\[\]<>#]/g,'\\$&').replace(/\r?\n/g,' ');
  const lists=(task.checklists||[]).map(list=>`### ${literal(list.title)}\n\n${list.items.map(item=>`- [${item.done?'x':' '}] ${literal(item.text)}`).join('\n')}`);
  return [task.description||'',...lists].filter(Boolean).join('\n\n');
}

export function markdownTaskChanges(task,description){
  // An audit copy supports recovery; only description is canonical from v2 onward.
  return {description,contentVersion:2,checklists:[],...(!task?.contentVersion&&task?.checklists?.length?{legacyChecklists:clone(task.checklists)}:{})};
}

export function validateChecklists(lists = []) {
  requireValue(Array.isArray(lists) && lists.length <= 100,'CHECKLIST_DATA','Некорректные чек-листы.');
  const ids = new Set();
  for (const list of lists) {
    requireValue(list && validId(list.id) && !ids.has(list.id),'CHECKLIST_ID','ID чек-листа должен быть уникальным.');
    ids.add(list.id);
    requireValue(validText(list.title,160) && list.title.trim(),'CHECKLIST_TITLE','Введите название чек-листа.');
    requireValue(Array.isArray(list.items) && list.items.length <= 1000,'CHECKLIST_ITEMS','Слишком большой чек-лист.');
    for (const item of list.items) {
      requireValue(item && validId(item.id) && !ids.has(item.id),'CHECKLIST_ID','ID пункта должен быть уникальным.');
      ids.add(item.id);
      requireValue(validText(item.text,2000) && item.text.trim(),'CHECKLIST_TEXT','Введите текст пункта.');
      requireValue(typeof item.done === 'boolean','CHECKLIST_STATE','Некорректное состояние пункта.');
    }
  }
  return clone(lists);
}
export function newChecklist(title = 'Чек-лист',texts = []) {
  return {id:uid('checklist'),title,items:texts.map(text=>({id:uid('check'),text,done:false}))};
}
export function checklistProgress(lists = []) {
  return lists.reduce((result,list)=>({done:result.done+list.items.filter(item=>item.done).length,total:result.total+list.items.length}),{done:0,total:0});
}
export function updateChecklistItem(lists,listId,itemId,changes) {
  const copy=clone(lists),item=copy.find(list=>list.id===listId)?.items.find(item=>item.id===itemId);
  requireValue(item,'CHECKLIST_ITEM','Пункт удалён. Обновите задачу.');Object.assign(item,changes);
  return validateChecklists(copy);
}
