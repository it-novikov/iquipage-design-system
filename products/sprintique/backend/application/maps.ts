import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize} from '../infrastructure/database.js';
import {requireCondition} from '../domain/errors.js';
import type {MapData,MapWrite,TemplateData} from '../../contracts/maps.js';
import {canonical,idempotent,recordEvent} from './commands.js';
import {linkMapAssets} from './media.js';

interface MapRow {
  id:string;projectId:string;revision:number;value:MapData;timerRemaining:number;timerEndsAt:Date|null;
  createdAt:Date;updatedAt:Date;startedAt:Date|null;archivedAt:Date|null;
}
const projection=`id,project_id AS "projectId",revision,value,timer_remaining AS "timerRemaining",timer_ends_at AS "timerEndsAt",
  created_at AS "createdAt",updated_at AS "updatedAt",started_at AS "startedAt",archived_at AS "archivedAt"`;

/** Uses the same aggregate row lock as membership changes and Planning commands. */
async function lock(tx:Transaction,actor:Actor,projectId:string){
  await authorize(tx,actor,projectId,'maps:write');
  await tx.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[projectId]);
  await authorize(tx,actor,projectId,'maps:write');
  const active=await tx.query(`SELECT 1 FROM auth.credentials c JOIN auth.principals p ON p.id=c.principal_id WHERE c.id=$1
    AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND p.disabled_at IS NULL`,[actor.credentialId]);
  requireCondition(active.rowCount===1,401,'UNAUTHENTICATED','Сессия завершена.');
}
async function voteProjection(tx:Transaction,actor:Actor,projectId:string,id:string){
  const rows=(await tx.query<{actorId:string;votes:Record<string,number>}>('SELECT actor_id AS "actorId",votes FROM app.map_votes WHERE project_id=$1 AND map_id=$2',[projectId,id])).rows;
  const totals:Record<string,number>=Object.create(null);
  for(const row of rows)for(const [objectId,n] of Object.entries(row.votes))totals[objectId]=(totals[objectId]||0)+n;
  return {votes:rows.find(r=>r.actorId===actor.id)?.votes||{},voteTotals:totals};
}
async function present(tx:Transaction,actor:Actor,row:MapRow){
  const {value,timerRemaining,timerEndsAt,...meta}=row;
  const votes=value.session?await voteProjection(tx,actor,row.projectId,row.id):null;
  return {...value,...meta,schema:'iquipage.maps/1',document:{...value.document,title:value.title,revision:row.revision},
    session:value.session?{...value.session,timer:{remaining:timerRemaining,endsAt:timerEndsAt},...votes}:null};
}
export async function readMap(tx:Transaction,actor:Actor,projectId:string,id:string){
  await authorize(tx,actor,projectId,'maps:read');
  const row=(await tx.query<MapRow>(`SELECT ${projection} FROM app.maps WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
  requireCondition(row,404,'NOT_FOUND','Карта недоступна.');return present(tx,actor,row);
}
export async function listMaps(tx:Transaction,actor:Actor,projectId:string,cursor=''){
  await authorize(tx,actor,projectId,'maps:read');
  const rows=(await tx.query<{id:string}>(`SELECT id,project_id AS "projectId",revision,value->>'title' AS title,value->>'kind' AS kind,
    value->>'status' AS status,left(value->>'summary',180) AS summary,updated_at AS "updatedAt" FROM app.maps WHERE project_id=$1 AND id>$2 ORDER BY id LIMIT 51`,[projectId,cursor])).rows;
  return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.id:null};
}
export async function mapHistory(tx:Transaction,actor:Actor,projectId:string,id:string,before=Number.MAX_SAFE_INTEGER){
  await authorize(tx,actor,projectId,'maps:read');await readMap(tx,actor,projectId,id);
  const rows=(await tx.query<{revision:number}>(`SELECT revision,actor_id AS "actorId",created_at AS "createdAt",value->>'title' AS title FROM app.map_versions
    WHERE project_id=$1 AND id=$2 AND revision<$3 ORDER BY revision DESC LIMIT 51`,[projectId,id,Math.min(before,2147483647)])).rows;
  return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.revision:null};
}
export async function mapVersion(tx:Transaction,actor:Actor,projectId:string,id:string,revision:number){
  await authorize(tx,actor,projectId,'maps:read');
  const row=(await tx.query<{value:Record<string,unknown>}>('SELECT value FROM app.map_versions WHERE project_id=$1 AND id=$2 AND revision=$3',[projectId,id,revision])).rows[0];
  requireCondition(row,404,'NOT_FOUND','Версия карты недоступна.');return row.value;
}
async function validateReferences(tx:Transaction,actor:Actor,projectId:string,document:MapData['document']){
  const taskIds=[...new Set(document.objects.flatMap(o=>o.externalTaskId?[o.externalTaskId]:[]))];
  if(taskIds.length){
    await authorize(tx,actor,projectId,'tasks:read');
    const found=await tx.query('SELECT id FROM app.tasks WHERE project_id=$1 AND id=ANY($2)',[projectId,taskIds]);
    requireCondition(found.rowCount===taskIds.length,422,'TASK_REFERENCE','Одна из связанных задач недоступна.');
  }
}
export async function writeMap(tx:Transaction,actor:Actor,projectId:string,id:string,input:MapWrite,key:string){
  await lock(tx,actor,projectId);
  return idempotent(tx,actor,projectId,'map.put:'+id,key,input,async()=>{
    const previous=(await tx.query<MapRow>(`SELECT ${projection} FROM app.maps WHERE project_id=$1 AND id=$2`,[projectId,id])).rows[0];
    requireCondition((previous?.revision||0)===input.baseRevision,409,'CONFLICT','Карта изменилась. Ваша копия не перезаписана.');
    const value=structuredClone(input.value),before=previous?.value;
    requireCondition(before?.status!=='archived',409,'ARCHIVED','Архив неизменяем. Создайте продолжение карты.');
    requireCondition(!before||before.kind===value.kind,422,'MAP_KIND','Формат существующей карты нельзя изменить.');
    const transitions:Record<string,string[]>=value.kind==='session'?{draft:['draft','active'],active:['active','paused','archived'],paused:['paused','active','archived']}:{active:['active','archived']};
    requireCondition(before?transitions[before.status]?.includes(value.status):value.status===(value.kind==='session'?'draft':'active'),422,'MAP_TRANSITION','Недопустимый переход состояния карты.');
    requireCondition(!before||before.sourceMapId===value.sourceMapId&&before.sourceRevision===value.sourceRevision&&canonical(before.templateOrigin)===canonical(value.templateOrigin),422,'MAP_ORIGIN','Источник карты неизменяем.');
    if(!before){
      const count=(await tx.query<{n:number}>('SELECT count(*)::int AS n FROM app.maps WHERE project_id=$1',[projectId])).rows[0]!.n;
      requireCondition(count<1000,422,'MAP_LIMIT','В проекте может быть до 1000 карт.');
      if(value.sourceMapId){const source=await readMap(tx,actor,projectId,value.sourceMapId);requireCondition(source.revision===value.sourceRevision,409,'SOURCE_STALE','Исходная карта изменилась.');}
      else requireCondition(value.sourceRevision===null,422,'MAP_ORIGIN','Не задан источник карты.');
    }
    await validateReferences(tx,actor,projectId,value.document);
    await linkMapAssets(tx,actor,projectId,id,value.document.objects.flatMap(o=>o.assetId?[o.assetId]:[]));
    const authors=new Map(before?.document.objects.map(o=>[o.id,o.author]));
    value.document.objects=value.document.objects.map(o=>({...o,author:authors.get(o.id)||actor.name.slice(0,100)}));
    requireCondition(value.session||(!input.votes&&!input.timer),422,'MAP_SESSION','Таймер и голоса доступны только в сессии.');
    if(before?.session&&value.session)requireCondition(value.session.voteLimit===before.session.voteLimit,422,'VOTE_LIMIT_IMMUTABLE','Лимит голосов задаётся при создании сессии.');
    const clock=(await tx.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0]!.now;
    let remaining=previous?.timerRemaining??300,endsAt=previous?.timerEndsAt??null;
    if(input.timer){
      requireCondition(!input.timer.running||value.status==='active',422,'TIMER_STATE','Таймер запускается только в активной сессии.');
      remaining=input.timer.remaining;endsAt=input.timer.running?new Date(clock.getTime()+remaining*1000):null;
    }
    if(value.status==='paused'){remaining=previous?.timerEndsAt?Math.max(0,Math.ceil((previous.timerEndsAt.getTime()-clock.getTime())/1000)):remaining;endsAt=null;}
    if(value.status==='archived'){remaining=0;endsAt=null;}
    const revision=input.baseRevision+1;value.document={...value.document,title:value.title,revision};
    await tx.query(`INSERT INTO app.maps(project_id,id,revision,value,timer_remaining,timer_ends_at,created_by,created_at,updated_at,started_at,archived_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,NULL,NULL) ON CONFLICT(project_id,id) DO UPDATE SET revision=$3,value=$4,timer_remaining=$5,timer_ends_at=$6,updated_at=$8,
      started_at=CASE WHEN app.maps.value->>'status'='draft' AND $9='active' THEN $8 ELSE app.maps.started_at END,
      archived_at=CASE WHEN $9='archived' THEN $8 ELSE NULL END`,[projectId,id,revision,JSON.stringify(value),remaining,endsAt,actor.id,clock,value.status]);
    if(input.votes){
      const candidates=new Set(value.document.objects.filter(o=>o.type==='sticky').map(o=>o.id));
      const removed=new Set(before?.document.objects.filter(o=>o.type==='sticky'&&!candidates.has(o.id)).map(o=>o.id));
      const votes=Object.fromEntries(Object.entries(input.votes).filter(([id])=>!removed.has(id)));
      requireCondition(Object.entries(votes).every(([id,n])=>n===0||candidates.has(id))&&Object.values(votes).reduce((a,b)=>a+b,0)<=value.session!.voteLimit,422,'VOTES','Проверьте объекты и лимит голосов.');
      const own=(await voteProjection(tx,actor,projectId,id)).votes;
      requireCondition(actor.kind==='human'||canonical(votes)===canonical(own),403,'HUMAN_VOTES','Агент не голосует от лица человека.');
      await tx.query(`INSERT INTO app.map_votes(project_id,map_id,actor_id,votes) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,map_id,actor_id) DO UPDATE SET votes=$4`,[projectId,id,actor.id,JSON.stringify(votes)]);
    }
    // Removing a note removes its votes, never redistributes them to another note or participant.
    const candidates=value.document.objects.filter(o=>o.type==='sticky').map(o=>o.id);
    await tx.query(`UPDATE app.map_votes SET votes=coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(votes) WHERE key=ANY($3)), '{}'::jsonb) WHERE project_id=$1 AND map_id=$2`,[projectId,id,candidates]);
    const saved=await readMap(tx,actor,projectId,id);
    const snapshot={...saved,session:saved.session?{...saved.session,votes:undefined}:null};
    await tx.query('INSERT INTO app.map_versions(project_id,id,revision,value,actor_id) VALUES($1,$2,$3,$4,$5)',[projectId,id,revision,JSON.stringify(snapshot),actor.id]);
    await recordEvent(tx,actor,projectId,'map.updated',id,revision);return saved;
  });
}

export async function listTemplates(tx:Transaction,actor:Actor,projectId:string){
  const {workspaceId}=await authorize(tx,actor,projectId,'maps:read');
  const rows=(await tx.query(`SELECT value||jsonb_build_object('schema','iquipage.template/1','id',id,'projectId',project_id,'workspaceId',workspace_id,
    'ownerId',owner_id,'revision',revision,'version',revision,'category','Мои шаблоны','flow',NULL,'createdAt',created_at,'updatedAt',updated_at) AS value
    FROM app.map_templates WHERE workspace_id=$1 AND (project_id=$2 OR scope='workspace') ORDER BY id LIMIT 201`,[workspaceId,projectId])).rows;
  requireCondition(rows.length<=200,422,'TEMPLATE_LIMIT','Превышен лимит библиотеки шаблонов.');return rows.map(r=>r['value']);
}
export async function writeTemplate(tx:Transaction,actor:Actor,projectId:string,id:string,input:{baseRevision:number;value:TemplateData},key:string){
  await lock(tx,actor,projectId);
  const {workspaceId}=await authorize(tx,actor,projectId,'maps:write');
  return idempotent(tx,actor,projectId,'map-template.put:'+id,key,input,async()=>{
    const previous=(await tx.query<{revision:number;ownerId:string}>('SELECT revision,owner_id AS "ownerId" FROM app.map_templates WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];
    requireCondition((previous?.revision||0)===input.baseRevision,409,'CONFLICT','Шаблон уже изменён.');
    requireCondition(!previous||previous.ownerId===actor.id,403,'TEMPLATE_OWNER','Изменять шаблон может его автор.');
    if(input.value.scope==='workspace'){
      const member=await tx.query("SELECT 1 FROM app.workspace_members WHERE workspace_id=$1 AND principal_id=$2 AND role='admin'",[workspaceId,actor.id]);
      requireCondition(actor.kind==='human'&&member.rowCount===1,403,'WORKSPACE_ADMIN','Публикация для пространства требует его администратора.');
    }
    const count=(await tx.query<{n:number}>('SELECT count(*)::int AS n FROM app.map_templates WHERE workspace_id=$1',[workspaceId])).rows[0]!.n;
    requireCondition(previous||count<200,422,'TEMPLATE_LIMIT','В библиотеке может быть до 200 шаблонов.');
    requireCondition(!input.value.document.objects.some(o=>o.assetId||o.externalTaskId),422,'TEMPLATE_REFERENCE','Шаблон должен быть независимым от приватных файлов и задач.');
    const revision=input.baseRevision+1;
    await tx.query(`INSERT INTO app.map_templates(project_id,id,workspace_id,owner_id,scope,revision,value) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(project_id,id) DO UPDATE SET scope=$5,revision=$6,value=$7,updated_at=clock_timestamp()`,[projectId,id,workspaceId,actor.id,input.value.scope,revision,JSON.stringify(input.value)]);
    await tx.query('INSERT INTO app.map_template_versions(project_id,id,revision,value,actor_id) VALUES($1,$2,$3,$4,$5)',[projectId,id,revision,JSON.stringify(input.value),actor.id]);
    await recordEvent(tx,actor,projectId,'map-template.updated',id,revision);
    return (await listTemplates(tx,actor,projectId)).find(t=>t.id===id&&t.projectId===projectId);
  });
}
