import type {Task,TaskData} from '../../contracts/index.js';
import type {Actor,Transaction} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import {recordEvent} from './commands.js';
import {loadPlanningState,planningLock} from './planning.js';
import {validateTemporal} from '../domain/planning.js';
import {linkTaskAssets} from './media.js';
import {requireOpenTask,validateTaskHierarchy} from '../domain/task-invariants.js';

const projection=`t.id,t.project_id AS "projectId",p.key||'-'||t.number AS "displayId",t.revision,t.title,t.description,t.status,t.type,t.priority,
  t.attachment_ids AS "attachmentIds",t.cover_attachment_id AS "coverAttachmentId",t.cover_crop AS "coverCrop",
  t.owner_label AS owner,to_char(t.due,'YYYY-MM-DD') AS due,t.rank,t.parent_id AS "parentId",t.release_id AS "releaseId",
  t.preparation,t.result,t.assignment_mode AS "assignmentMode",t.admitted,to_char(t.planned_start,'YYYY-MM-DD') AS "plannedStart",to_char(t.planned_end,'YYYY-MM-DD') AS "plannedEnd",
  to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
  to_char(t.status_entered_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "statusEnteredAt",
  ARRAY(SELECT tag_id FROM app.task_tags WHERE project_id=t.project_id AND task_id=t.id ORDER BY tag_id) AS "tagIds"`;
export async function readTask(tx:Transaction,projectId:string,id:string):Promise<Task>{
  const value=(await tx.query<Task>(`SELECT ${projection} FROM app.tasks t JOIN app.projects p ON p.id=t.project_id WHERE t.project_id=$1 AND (t.id=$2 OR p.key||'-'||t.number=$2)`,[projectId,id])).rows[0];
  requireCondition(value,404,'NOT_FOUND','Задача недоступна.');return value;
}
export async function listTasks(tx:Transaction,projectId:string,after:number){
  const rows=(await tx.query<Task & {number:number}>(`SELECT ${projection},t.number FROM app.tasks t JOIN app.projects p ON p.id=t.project_id WHERE t.project_id=$1 AND t.number>$2 ORDER BY t.number LIMIT 201`,[projectId,after])).rows;
  return {items:rows.slice(0,200).map(({number,...task})=>task),nextCursor:rows.length>200?String(rows[199]!.number):null};
}
export async function putTask(tx:Transaction,actor:Actor,projectId:string,id:string,baseRevision:number,value:TaskData,createInBoard=false){
  // Serializes hierarchy changes and number allocation inside this project, not across tenants.
  await planningLock(tx,actor,projectId,true);
  const previous=(await tx.query<{revision:number;status:string;parentId:string|null;releaseId:string|null;result:string}>('SELECT revision,status,parent_id AS "parentId",release_id AS "releaseId",result FROM app.tasks WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];
  requireCondition((previous?.revision||0)===baseRevision,409,'CONFLICT','Задача уже изменена. Обновите её и повторите действие.');
  if (previous) requireOpenTask(previous);
  if(value.parentId){
    const ancestry=(await tx.query<{id:string}>(`WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM app.tasks WHERE project_id=$1 AND id=$2
      UNION SELECT t.id,t.parent_id FROM app.tasks t JOIN ancestors a ON a.parent_id=t.id WHERE t.project_id=$1
    ) SELECT id FROM ancestors`,[projectId,value.parentId])).rows;
    requireCondition(ancestry.length>0,422,'TASK_PARENT','Родительская задача недоступна.');
    requireCondition(!ancestry.some(a=>a.id===id),422,'TASK_CYCLE','Задача не может быть своим предком.');
  }
  if(value.tagIds.length){
    const tags=await tx.query('SELECT id FROM app.tags WHERE project_id=$1 AND id=ANY($2) AND (archived_at IS NULL OR id IN (SELECT tag_id FROM app.task_tags WHERE project_id=$1 AND task_id=$3))',[projectId,value.tagIds,id]);
    requireCondition(tags.rowCount===value.tagIds.length,422,'TASK_TAG','Тег недоступен в проекте.');
  }
  if(value.releaseId){
    const release=await tx.query('SELECT id FROM app.releases WHERE project_id=$1 AND id=$2 AND (archived_at IS NULL OR id IN (SELECT release_id FROM app.tasks WHERE project_id=$1 AND id=$3))',[projectId,value.releaseId,id]);
    requireCondition(release.rowCount===1,422,'TASK_RELEASE','Релиз недоступен в проекте.');
  }
  requireCondition(previous?previous.parentId===value.parentId&&previous.releaseId===value.releaseId:value.releaseId===null,
    409,'PREVIEW_REQUIRED','Измените родителя или релиз через планирование: сначала проверьте последствия.');
  requireCondition(!previous||!createInBoard,400,'CREATE_ONLY','Допуск при создании нельзя использовать для изменения задачи.');
  requireCondition(!createInBoard||actor.kind==='human',403,'APPROVAL_REQUIRED','Агент сначала предлагает подготовку и допуск задачи.');
  const data=[projectId,id,value.title,value.description,value.status,value.type,value.priority,value.owner,value.due,value.rank,value.parentId,value.releaseId];
  if(previous){
    await tx.query(`UPDATE app.tasks SET title=$3,description=$4,status=$5,type=$6,priority=$7,owner_label=$8,due=$9,rank=$10,parent_id=$11,release_id=$12,
      revision=revision+1,updated_at=clock_timestamp(),status_entered_at=CASE WHEN status=$5 THEN status_entered_at ELSE clock_timestamp() END
      WHERE project_id=$1 AND id=$2`,data);
  }else{
    const number=(await tx.query<{number:number}>('UPDATE app.projects SET next_task_number=next_task_number+1 WHERE id=$1 RETURNING next_task_number-1 AS number',[projectId])).rows[0]!.number;
    await tx.query(`INSERT INTO app.tasks(project_id,id,title,description,status,type,priority,owner_label,due,rank,parent_id,release_id,number,revision,preparation,admitted)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,$14,$15)`,[...data,number,createInBoard?'ready':'draft',createInBoard]);
  }
  await tx.query('DELETE FROM app.task_tags WHERE project_id=$1 AND task_id=$2',[projectId,id]);
  for(const tag of value.tagIds)await tx.query('INSERT INTO app.task_tags(project_id,task_id,tag_id) VALUES($1,$2,$3)',[projectId,id,tag]);
  const state = await loadPlanningState(tx,projectId);
  validateTaskHierarchy(state.tasks);
  validateTemporal(state);
  await linkTaskAssets(tx,actor,projectId,id,value);
  const saved=await readTask(tx,projectId,id);
  await recordEvent(tx,actor,projectId,previous?'task.updated':'task.created',id,saved.revision);
  return saved;
}
