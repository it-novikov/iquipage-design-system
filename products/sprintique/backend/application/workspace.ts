import type {Transaction,Actor} from '../infrastructure/database.js';
import {authorize,hash} from '../infrastructure/database.js';
import {requireCondition,Problem} from '../domain/errors.js';
import {planningLock,loadPlanningState} from './planning.js';
import {validateTemporal} from '../domain/planning.js';
import {idempotent,recordEvent} from './commands.js';
import {defaultTaskSettings} from '../../contracts/workspace.js';
import type {TaskSettingsData,TaskLinkData} from '../../contracts/workspace.js';

export async function provisionTaskSettings(tx:Transaction,projectId:string,actorId:string){
  const value=defaultTaskSettings();
  await tx.query('INSERT INTO app.task_settings(project_id,id,revision,value) VALUES($1,$2,1,$3)',[projectId,'task-settings-'+projectId,JSON.stringify(value)]);
  await tx.query('INSERT INTO app.task_settings_versions(project_id,revision,value,actor_id) VALUES($1,1,$2,$3)',[projectId,JSON.stringify(value),actorId]);
}
export async function taskSettings(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,'tasks:read');
  const row=(await tx.query<{id:string;revision:number;value:TaskSettingsData}>('SELECT id,revision,value FROM app.task_settings WHERE project_id=$1',[projectId])).rows[0];
  // Existing pre-R3 local projects have no custom version. This is explicit, not a phantom write.
  return row?{id:row.id,projectId,revision:row.revision,...row.value}:{id:'task-settings-'+projectId,projectId,revision:0,...defaultTaskSettings()};
}
export async function writeTaskSettings(tx:Transaction,actor:Actor,projectId:string,input:{baseRevision:number;value:TaskSettingsData},key:string){
  await planningLock(tx,actor,projectId,true);await authorize(tx,actor,projectId,'catalog:write');
  return idempotent(tx,actor,projectId,'task-settings.put',key,input,async()=>{
    const previous=await taskSettings(tx,actor,projectId);requireCondition(previous.revision===input.baseRevision,409,'CONFLICT','Шаблоны уже изменены. Обновите настройки.');
    const revision=previous.revision+1;
    await tx.query(`INSERT INTO app.task_settings(project_id,id,revision,value) VALUES($1,$2,$3,$4)
      ON CONFLICT(project_id) DO UPDATE SET revision=$3,value=$4,updated_at=clock_timestamp()`,[projectId,previous.id,revision,JSON.stringify(input.value)]);
    await tx.query('INSERT INTO app.task_settings_versions(project_id,revision,value,actor_id) VALUES($1,$2,$3,$4)',[projectId,revision,JSON.stringify(input.value),actor.id]);
    await recordEvent(tx,actor,projectId,'task-settings.updated',previous.id,revision);return taskSettings(tx,actor,projectId);
  });
}
const linkProjection='id,project_id AS "projectId",kind,from_id AS "fromId",to_id AS "toId",revision,archived_at AS "archivedAt",created_at AS "createdAt"';
export async function taskLinks(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,'tasks:read');
  const rows=(await tx.query(`SELECT ${linkProjection} FROM app.task_links WHERE project_id=$1 ORDER BY id LIMIT 10001`,[projectId])).rows;
  requireCondition(rows.length<=10000,422,'LINK_LIMIT','Превышен лимит связей проекта.');return rows;
}
export async function writeTaskLink(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;value:TaskLinkData},key:string){
  await planningLock(tx,actor,projectId,true);
  return idempotent(tx,actor,projectId,'task-link.put:'+id,key,input,async()=>{
    const previous=(await tx.query<{revision:number;kind:string;fromId:string;toId:string}>(`SELECT ${linkProjection} FROM app.task_links WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
    const v=input.value;requireCondition((previous?.revision||0)===input.baseRevision,409,'CONFLICT','Связь уже изменена.');
    requireCondition(!previous||previous.kind===v.kind&&previous.fromId===v.fromId&&previous.toId===v.toId,422,'LINK_IMMUTABLE','Для изменения направления создайте новую связь.');
    const refs=await tx.query('SELECT id FROM app.tasks WHERE project_id=$1 AND id=ANY($2)',[projectId,[v.fromId,v.toId]]);requireCondition(refs.rowCount===2,422,'TASK_REFERENCE','Связанные задачи недоступны.');
    if(!v.archived&&v.kind==='depends'){
      const cycle=await tx.query(`WITH RECURSIVE reachable(id) AS (SELECT $2::text UNION SELECT l.to_id FROM app.task_links l JOIN reachable r ON l.from_id=r.id
        WHERE l.project_id=$1 AND l.kind='depends' AND l.archived_at IS NULL AND l.id<>$4) SELECT 1 FROM reachable WHERE id=$3 LIMIT 1`,[projectId,v.toId,v.fromId,id]);
      requireCondition(!cycle.rowCount,422,'TASK_DEPENDENCY_CYCLE','Зависимости не должны образовывать цикл.');
      const state=await loadPlanningState(tx,projectId);state.dependencies=(state.dependencies||[]).filter(link=>link.id!==id).concat({id,fromId:v.fromId,toId:v.toId});validateTemporal(state);
    }
    const count=(await tx.query<{n:number}>('SELECT count(*)::int AS n FROM app.task_links WHERE project_id=$1',[projectId])).rows[0]!.n;
    requireCondition(previous||count<10000,422,'LINK_LIMIT','Превышен лимит связей проекта.');
    await tx.query(`INSERT INTO app.task_links(project_id,id,kind,from_id,to_id,revision,archived_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN clock_timestamp() ELSE NULL END)
      ON CONFLICT(project_id,id) DO UPDATE SET revision=$6,archived_at=CASE WHEN $7 THEN coalesce(app.task_links.archived_at,clock_timestamp()) ELSE NULL END`,[projectId,id,v.kind,v.fromId,v.toId,input.baseRevision+1,v.archived]);
    await recordEvent(tx,actor,projectId,'task-link.updated',id,input.baseRevision+1);
    return (await tx.query(`SELECT ${linkProjection} FROM app.task_links WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
  });
}
export async function search(tx:Transaction,actor:Actor,q:string,cursor?:string){
  // Agent search must retain the grant's read capability as well as RLS scope.
  const tasksAllowed=actor.kind==='human'||actor.capabilities.includes('tasks:read'),mapsAllowed=actor.kind==='human'||actor.capabilities.includes('maps:read');
  if(actor.kind==='agent'){requireCondition(actor.projectId&&(tasksAllowed||mapsAllowed),403,'FORBIDDEN','Поиск требует разрешение на чтение.');await authorize(tx,actor,actor.projectId,tasksAllowed?'tasks:read':'maps:read');}
  const queryHash=hash(actor.id+':'+q),pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';let after='';
  if(cursor){try{const value=JSON.parse(Buffer.from(cursor,'base64url').toString());requireCondition(value.hash===queryHash&&typeof value.after==='string'&&value.after.length<=240,400,'CURSOR_INVALID','Курсор другого поиска.');after=value.after;}catch(error){if(error instanceof Problem)throw error;throw new Problem(400,'CURSOR_INVALID','Некорректный курсор.');}}
  const result=(await tx.query<{searchKey:string;kind:string;id:string;projectId:string;title:string;key:string;projectName:string;slug:string;excerpt:string}>(`WITH results AS (
    SELECT 'task:'||p.id||':'||t.id AS "searchKey",'task' AS kind,t.id,p.id AS "projectId",t.title,p.key||'-'||t.number AS key,p.name AS "projectName",p.slug,left(t.description,160) AS excerpt
      FROM app.tasks t JOIN app.projects p ON p.id=t.project_id
      WHERE $4 AND (t.title ILIKE $1 OR p.key||'-'||t.number ILIKE $1 OR to_tsvector('simple',t.title||' '||t.description) @@ websearch_to_tsquery('simple',$2))
    UNION ALL SELECT 'map:'||p.id||':'||m.id,'map',m.id,p.id,m.value->>'title','Карта',p.name,p.slug,left(m.value->>'summary',160) FROM app.maps m JOIN app.projects p ON p.id=m.project_id WHERE $5 AND (m.value->>'title' ILIKE $1 OR m.value->>'summary' ILIKE $1)
    UNION ALL SELECT 'project:'||p.id,'project',p.id,p.id,p.name,p.key,p.name,p.slug,'' FROM app.projects p WHERE p.name ILIKE $1 OR p.key ILIKE $1
    ) SELECT * FROM results WHERE "searchKey">$3 ORDER BY "searchKey" LIMIT 51`,[pattern,q,after,tasksAllowed,mapsAllowed])).rows;
  const items=result.slice(0,50).map(({searchKey,...item})=>({...item,url:'/?project='+encodeURIComponent(item.slug)+(item.kind==='task'?'#/task/'+encodeURIComponent(item.key):item.kind==='map'?'#maps/'+encodeURIComponent(item.id):'#tasks')}));
  return {items,nextCursor:result.length>50?Buffer.from(JSON.stringify({hash:queryHash,after:result[49]!.searchKey})).toString('base64url'):null};
}
