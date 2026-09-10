import {uid,now,requireValue,validText,clone} from './common.js';
/** Host-owned workflow. Maps uses only the TaskAdapter, never these UI columns. */
export const TASK_COLUMNS=[
  {id:'ready',label:'Готово к работе',icon:'list'},
  {id:'in_progress',label:'В работе',icon:'play'},
  {id:'review',label:'Ревью',icon:'eye'},
  {id:'ready_for_testing',label:'Готово к тестированию',icon:'checklist'},
  {id:'testing',label:'Тестирование',icon:'bug'},
  {id:'ready_for_release',label:'Готово к релизу',icon:'checkCircle'}
];
const legacy={planned:'ready',active:'in_progress',done:'ready_for_release'};
export function taskColumn(task){return legacy[task.status]||task.status;}
export function validateTask(task){
  requireValue(validText(task.title,240)&&task.title.trim(),'TASK_TITLE','Название задачи: от 1 до 240 символов.');
  requireValue(TASK_COLUMNS.some(c=>c.id===taskColumn(task)),'TASK_STATUS','Неизвестный статус задачи.');
  requireValue(!task.description||validText(task.description,10000),'TASK_DESCRIPTION','Описание задачи: до 10 000 символов.');
  requireValue(task.rank===undefined||Number.isFinite(task.rank),'TASK_RANK','Некорректная позиция задачи.');
  return clone(task);
}
export function createTask({projectId,title,description='',status='ready',owner='',priority='normal',type='task'}){
  return validateTask({id:uid('task'),projectId,revision:0,title:title.trim(),description,status,owner,priority,type,createdAt:now(),updatedAt:now(),rank:Date.now()});
}
export function placeTask(task,tasks,status,beforeId=null){
  requireValue(TASK_COLUMNS.some(c=>c.id===status),'TASK_STATUS','Выберите столбец доски.');
  const peers=tasks.filter(t=>t.id!==task.id&&taskColumn(t)===status).sort(taskOrder);
  let at=beforeId?peers.findIndex(t=>t.id===beforeId):peers.length;
  requireValue(at>=0,'TASK_ORDER','Порядок задач изменился. Обновите доску.');
  const left=at?rank(peers[at-1]):null,right=at<peers.length?rank(peers[at]):null;
  const nextRank=left===null?(right===null?1024:right-1024):right===null?left+1024:(left+right)/2;
  requireValue(Number.isFinite(nextRank)&&(left===null||nextRank>left)&&(right===null||nextRank<right),'TASK_ORDER','Не удалось определить позицию. Обновите порядок в приложении.');
  return {...task,status,rank:nextRank};
}
const rank=t=>Number.isFinite(t.rank)?t.rank:Date.parse(t.createdAt)||0;
export function taskOrder(a,b){return rank(a)-rank(b)||a.id.localeCompare(b.id);}
