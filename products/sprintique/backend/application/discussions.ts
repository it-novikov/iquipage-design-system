import type {Message,Thread,ThreadPage,ThreadSummary} from '../../contracts/index.js';
import type {Actor,Transaction} from '../infrastructure/database.js';
import {hash} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import {recordEvent} from './commands.js';
import {readTask} from './tasks.js';

const projection=`id,project_id AS "projectId",task_id AS "taskId",revision,requires_resolution AS "requiresResolution",resolved,
  CASE WHEN resolved THEN json_build_object('actorId',resolved_by,'at',to_char(resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ELSE null END AS resolution,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  to_char(last_activity_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastActivityAt"`;
export async function readThread(tx:Transaction,projectId:string,id:string):Promise<Thread>{
  const thread=(await tx.query<Omit<Thread,'messages'>>(`SELECT ${projection} FROM app.threads WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
  requireCondition(thread,404,'NOT_FOUND','Обсуждение недоступно.');
  const messages=(await tx.query<Message>(`SELECT id,body,author_id AS "authorId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM app.messages WHERE project_id=$1 AND thread_id=$2 ORDER BY created_at,id LIMIT 2001`,[projectId,id])).rows;
  // Explicit cap until message-level pagination lands with M4; never truncate a discussion silently.
  requireCondition(messages.length<=2000,409,'THREAD_LIMIT','Обсуждение достигло лимита сообщений.');
  return {...thread,messages};
}
export async function pageThreads(tx:Transaction,projectId:string,taskId:string,cursor:string|null,limit:number):Promise<ThreadPage>{
  await readTask(tx,projectId,taskId);
  const rows=(await tx.query<Omit<Thread,'messages'>>(`SELECT ${projection} FROM app.threads WHERE project_id=$1 AND task_id=$2 ORDER BY (requires_resolution AND NOT resolved) DESC,last_activity_at DESC,id`,[projectId,taskId])).rows;
  const version=hash(JSON.stringify(rows.map(r=>[r.id,r.revision])));let offset=0;
  if(cursor){
    let parsed:unknown;try{parsed=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{parsed=null;}
    requireCondition(parsed&&typeof parsed==='object'&&'projectId' in parsed&&'taskId' in parsed&&'version' in parsed&&'after' in parsed,400,'THREAD_CURSOR','Некорректная страница.');
    requireCondition(parsed.projectId===projectId&&parsed.taskId===taskId,400,'THREAD_CURSOR_SCOPE','Страница относится к другой задаче.');
    requireCondition(parsed.version===version,409,'THREAD_CURSOR_STALE','Обсуждения изменились. Обновите список.');
    offset=rows.findIndex(r=>r.id===parsed.after)+1;
    requireCondition(offset>0,400,'THREAD_CURSOR','Страница недоступна.');
  }
  const selected=rows.slice(offset,offset+limit),items:ThreadSummary[]=[];
  for(const row of selected){
    const meta=(await tx.query<{body:string;count:number}>(`SELECT left(body,160) AS body,(SELECT count(*)::int FROM app.messages WHERE project_id=$1 AND thread_id=$2) AS count FROM app.messages WHERE project_id=$1 AND thread_id=$2 ORDER BY created_at,id LIMIT 1`,[projectId,row.id])).rows[0]!;
    items.push({...row,summary:true,messageCount:meta.count,messages:[{body:meta.body}]});
  }
  return {items,total:rows.length,unresolved:rows.filter(r=>r.requiresResolution&&!r.resolved).length,
    nextCursor:offset+selected.length<rows.length?Buffer.from(JSON.stringify({projectId,taskId,version,after:selected.at(-1)!.id})).toString('base64url'):null};
}
export async function createThread(tx:Transaction,actor:Actor,projectId:string,taskId:string,input:{id:string;messageId:string;body:string;requiresResolution:boolean}){
  await readTask(tx,projectId,taskId);
  await tx.query('INSERT INTO app.threads(project_id,id,task_id,requires_resolution) VALUES($1,$2,$3,$4)',[projectId,input.id,taskId,input.requiresResolution]);
  await tx.query('INSERT INTO app.messages(project_id,id,thread_id,body,author_id) VALUES($1,$2,$3,$4,$5)',[projectId,input.messageId,input.id,input.body,actor.id]);
  await recordEvent(tx,actor,projectId,'thread.created',input.id,1);
  return readThread(tx,projectId,input.id);
}
async function lockThread(tx:Transaction,projectId:string,id:string,revision:number){
  const previous=(await tx.query<{revision:number;requires_resolution:boolean}>('SELECT revision,requires_resolution FROM app.threads WHERE project_id=$1 AND id=$2 FOR UPDATE',[projectId,id])).rows[0];
  requireCondition(previous,404,'NOT_FOUND','Обсуждение недоступно.');
  requireCondition(previous.revision===revision,409,'CONFLICT','Обсуждение уже изменено.');return previous;
}
export async function appendMessage(tx:Transaction,actor:Actor,projectId:string,threadId:string,input:{id:string;body:string;baseRevision:number}){
  await lockThread(tx,projectId,threadId,input.baseRevision);
  const count=(await tx.query<{count:number}>('SELECT count(*)::int AS count FROM app.messages WHERE project_id=$1 AND thread_id=$2',[projectId,threadId])).rows[0]!.count;
  requireCondition(count<2000,409,'THREAD_LIMIT','Создайте новое обсуждение.');
  await tx.query('INSERT INTO app.messages(project_id,id,thread_id,body,author_id) VALUES($1,$2,$3,$4,$5)',[projectId,input.id,threadId,input.body,actor.id]);
  await tx.query('UPDATE app.threads SET revision=revision+1,last_activity_at=clock_timestamp() WHERE project_id=$1 AND id=$2',[projectId,threadId]);
  await recordEvent(tx,actor,projectId,'thread.message-added',threadId,input.baseRevision+1);
  return readThread(tx,projectId,threadId);
}
export async function resolveThread(tx:Transaction,actor:Actor,projectId:string,id:string,input:{resolved:boolean;baseRevision:number}){
  const previous=await lockThread(tx,projectId,id,input.baseRevision);
  requireCondition(previous.requires_resolution,422,'THREAD_RESOLUTION','Обычный комментарий не требует решения.');
  await tx.query('UPDATE app.threads SET resolved=$3,resolved_by=CASE WHEN $3 THEN $4 ELSE null END,resolved_at=CASE WHEN $3 THEN clock_timestamp() ELSE null END,revision=revision+1,last_activity_at=clock_timestamp() WHERE project_id=$1 AND id=$2',[projectId,id,input.resolved,actor.id]);
  await recordEvent(tx,actor,projectId,'thread.resolution-changed',id,input.baseRevision+1);
  return readThread(tx,projectId,id);
}
