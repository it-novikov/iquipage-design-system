import type {Message,Thread,ThreadPage,ThreadSummary} from '../../contracts/index.js';
import type {Actor,Transaction} from '../infrastructure/database.js';
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
  requireCondition(Number.isInteger(limit) && limit >= 1 && limit <= 50, 400, 'THREAD_LIMIT', 'Некорректный размер страницы.');
  let position: {version:string;after:string} | null = null;
  if (cursor) {
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.from(cursor,'base64url').toString()); } catch { parsed = null; }
    requireCondition(parsed && typeof parsed === 'object' && 'projectId' in parsed && 'taskId' in parsed && 'version' in parsed && 'after' in parsed,
      400,'THREAD_CURSOR','Некорректная страница.');
    requireCondition(parsed.projectId === projectId && parsed.taskId === taskId,400,'THREAD_CURSOR_SCOPE','Страница относится к другой задаче.');
    requireCondition(typeof parsed.version === 'string' && parsed.version.length <= 200 && typeof parsed.after === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(parsed.after),
      400,'THREAD_CURSOR','Некорректная страница.');
    position = {version:parsed.version,after:parsed.after};
  }
  // One statement gives stats, cursor anchor and page the same MVCC snapshot.
  // Threads are append-only; every message/resolution increments thread revision.
  // Thus count + revision sum changes on every supported catalogue mutation, without
  // materializing/hashing all thread bodies in Node or building an unbounded SQL string.
  const result = (await tx.query<{total:number;unresolved:number;version:string;anchorFound:boolean;items:ThreadSummary[]}>(`
    WITH stats AS (
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE requires_resolution AND NOT resolved)::int AS unresolved,
        count(*)::text || ':' || coalesce(sum(revision),0)::text AS version
      FROM app.threads WHERE project_id=$1 AND task_id=$2
    ), anchor AS (
      SELECT requires_resolution AND NOT resolved AS pending,last_activity_at,id
      FROM app.threads WHERE project_id=$1 AND task_id=$2 AND id=$3
    ), selected AS MATERIALIZED (
      SELECT ${projection},row_number() OVER (ORDER BY (requires_resolution AND NOT resolved) DESC,last_activity_at DESC,id) AS "pageOrder" FROM app.threads t
      WHERE project_id=$1 AND task_id=$2 AND ($3::text IS NULL OR EXISTS (
        SELECT 1 FROM anchor a WHERE
          (t.requires_resolution AND NOT t.resolved) < a.pending OR
          (t.requires_resolution AND NOT t.resolved) = a.pending AND
            (t.last_activity_at < a.last_activity_at OR t.last_activity_at = a.last_activity_at AND t.id > a.id)
      ))
      ORDER BY (requires_resolution AND NOT resolved) DESC,last_activity_at DESC,id LIMIT $4
    ), message_counts AS (
      SELECT m.thread_id,count(*)::int AS count FROM app.messages m JOIN selected s ON s.id=m.thread_id
      WHERE m.project_id=$1 GROUP BY m.thread_id
    )
    SELECT stats.*,EXISTS(SELECT 1 FROM anchor) AS "anchorFound",
      coalesce((SELECT jsonb_agg(value ORDER BY "pageOrder") FROM (
        SELECT s."pageOrder",
          (to_jsonb(s) - 'pageOrder') || jsonb_build_object('summary',true,'messageCount',coalesce(c.count,0),
            'messages',jsonb_build_array(jsonb_build_object('body',coalesce(first.body,'')))) AS value
        FROM selected s LEFT JOIN message_counts c ON c.thread_id=s.id
        LEFT JOIN LATERAL (SELECT left(m.body,160) AS body FROM app.messages m
          WHERE m.project_id=$1 AND m.thread_id=s.id ORDER BY m.created_at,m.id LIMIT 1) first ON true
      ) summaries),'[]'::jsonb) AS items FROM stats`,[projectId,taskId,position?.after||null,limit+1])).rows[0]!;
  if (position) {
    requireCondition(position.version === result.version,409,'THREAD_CURSOR_STALE','Обсуждения изменились. Обновите список.');
    requireCondition(result.anchorFound,400,'THREAD_CURSOR','Страница недоступна.');
  }
  const items = result.items.slice(0,limit);
  return {items,total:result.total,unresolved:result.unresolved,
    nextCursor:result.items.length > limit ? Buffer.from(JSON.stringify({projectId,taskId,version:result.version,after:items.at(-1)!.id})).toString('base64url') : null};
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
