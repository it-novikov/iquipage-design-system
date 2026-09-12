import type {Actor,Transaction} from '../infrastructure/database.js';
import {authorize,requireActiveCredential} from '../infrastructure/database.js';
import {requireCondition,Problem} from '../domain/errors.js';
import {idempotent,recordEvent} from './commands.js';
import type {Reservation,TaskMediaData} from '../../contracts/media.js';
import type {ObjectStorage} from '../infrastructure/object-storage.js';
import {objectKey} from '../infrastructure/object-storage.js';
export {objectKey} from '../infrastructure/object-storage.js';
import {enqueueAssetCleanup} from './jobs.js';
import {inspectFile,processFile} from '../domain/files.js';
interface Asset extends Reservation {projectId:string;actorId:string;state:string;mime:string|null;image:boolean;width:number|null;height:number|null;revision:number;createdAt:Date;expiresAt:Date}
const projection=`id,project_id AS "projectId",target_type AS "targetType",target_id AS "targetId",actor_id AS "actorId",name,size,sha256,state,mime,image,width,height,revision,created_at AS "createdAt",expires_at AS "expiresAt"`;
const publicMetadata=(asset:Asset)=>({...asset,taskId:asset.targetType==='task'?asset.targetId:undefined,state:asset.state==='ready'?'staged':asset.state,previewMime:asset.image?'image/webp':null});
async function assetRow(tx:Transaction,projectId:string,id:string,lock=false){
  const row=(await tx.query<Asset>(`SELECT ${projection} FROM app.assets WHERE project_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[projectId,id])).rows[0];
  requireCondition(row,404,'FILE_NOT_FOUND','Файл недоступен.');return row;
}
async function access(tx:Transaction,actor:Actor,projectId:string,target:Pick<Reservation,'targetType'|'targetId'>,write:boolean){
  await authorize(tx,actor,projectId,target.targetType==='map'?(write?'maps:write':'maps:read'):(write?'tasks:write':'tasks:read'));
  if(target.targetType==='project-avatar')await authorize(tx,actor,projectId,write?'catalog:write':'tasks:read');
}
export async function reserveAsset(tx:Transaction,actor:Actor,projectId:string,input:Reservation,key:string){
  await access(tx,actor,projectId,input,true);await tx.query('SELECT id FROM app.projects WHERE id=$1 FOR UPDATE',[projectId]);await access(tx,actor,projectId,input,true);
  return idempotent(tx,actor,projectId,'asset.reserve:'+input.id,key,input,async()=>{
    const quota=(await tx.query<{bytes:number;pending:number}>(`SELECT coalesce(sum(size),0)::float8 AS bytes,count(*) FILTER(WHERE state IN ('uploading','ready') AND actor_id=$2)::int AS pending FROM app.assets WHERE project_id=$1 AND state<>'deleted'`,[projectId,actor.id])).rows[0]!;
    requireCondition(quota.bytes+input.size<=5*1024**3&&quota.pending<100,422,'STORAGE_QUOTA','Лимит хранения или незавершённых загрузок исчерпан.');
    await tx.query(`INSERT INTO app.assets(project_id,id,target_type,target_id,actor_id,name,size,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[projectId,input.id,input.targetType,input.targetId,actor.id,input.name,input.size,input.sha256]);
    const reserved=await assetRow(tx,projectId,input.id);await enqueueAssetCleanup(tx,projectId,input.id,1,reserved.expiresAt);
    await recordEvent(tx,actor,projectId,'asset.reserved',input.id,1);return publicMetadata(reserved);
  });
}
export async function uploadAsset(tx:Transaction,actor:Actor,projectId:string,id:string,bytes:Uint8Array,storage:ObjectStorage){
  const asset=await assetRow(tx,projectId,id,true);await access(tx,actor,projectId,asset,true);
  requireCondition(asset.actorId===actor.id,403,'FILE_OWNER','Загрузку завершает её автор.');
  requireCondition(['uploading','ready','attached'].includes(asset.state),409,'FILE_STATE','Загрузка завершена или удалена. Выберите файл заново.');
  try{
    const content=inspectFile(asset.name,bytes);
    requireCondition(content.size===asset.size&&content.sha256===asset.sha256,422,'FILE_HASH','Содержимое загрузки изменилось. Выберите файл заново.');
    if(asset.state!=='uploading')return {value:publicMetadata(asset)};
    requireCondition(asset.expiresAt.getTime()>Date.now(),410,'UPLOAD_EXPIRED','Срок загрузки истёк.');
    const processed=await processFile(asset.name,bytes);
    requireCondition(asset.targetType==='task'||processed.image,422,'IMAGE_REQUIRED','Для обложки карты и аватара нужно изображение.');
    await storage.put(objectKey(asset,'original'),bytes,processed.mime);
    if(processed.display&&processed.thumb){await storage.put(objectKey(asset,'display'),processed.display,'image/webp');await storage.put(objectKey(asset,'thumb'),processed.thumb,'image/webp');}
    await requireActiveCredential(tx,actor);await access(tx,actor,projectId,asset,true);
    await tx.query(`UPDATE app.assets SET state='ready',revision=revision+1,mime=$3,image=$4,width=$5,height=$6,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2`,[projectId,id,processed.mime,processed.image,processed.width,processed.height]);
    await recordEvent(tx,actor,projectId,'asset.ready',id,asset.revision+1);return {value:publicMetadata(await assetRow(tx,projectId,id))};
  }catch(error){
    // Persist rejection separately from the HTTP error. Object cleanup is retryable from the reservation.
    if(error instanceof Problem&&[410,422].includes(error.status)&&asset.state==='uploading'){
      await tx.query("UPDATE app.assets SET state='quarantined',revision=revision+1,expires_at=clock_timestamp(),updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2",[projectId,id]);
      await recordEvent(tx,actor,projectId,'asset.quarantined',id,asset.revision+1);
      await enqueueAssetCleanup(tx,projectId,id,asset.revision+1,new Date());
      return {error:{status:error.status,code:error.code,message:error.message}};
    }
    throw error;
  }
}
export async function readableAsset(tx:Transaction,actor:Actor,projectId:string,id:string){
  const asset=await assetRow(tx,projectId,id);await access(tx,actor,projectId,asset,false);
  const staged=asset.state==='ready'&&asset.actorId===actor.id&&asset.expiresAt.getTime()>Date.now();
  requireCondition(staged||asset.state==='attached',404,'FILE_NOT_FOUND','Файл недоступен.');
  return asset;
}
export async function describeAsset(tx:Transaction,actor:Actor,projectId:string,id:string){return publicMetadata(await readableAsset(tx,actor,projectId,id));}
export async function discardAsset(tx:Transaction,actor:Actor,projectId:string,id:string){
  const asset=await assetRow(tx,projectId,id,true);await access(tx,actor,projectId,asset,true);
  requireCondition(asset.actorId===actor.id,403,'FILE_OWNER','Удалить несохранённую загрузку может её автор.');
  requireCondition(asset.state!=='attached',409,'FILE_ATTACHED','Сначала уберите файл из объекта.');
  if(['uploading','ready'].includes(asset.state)){await tx.query("UPDATE app.assets SET state='detached',expires_at=clock_timestamp(),revision=revision+1 WHERE project_id=$1 AND id=$2",[projectId,id]);await recordEvent(tx,actor,projectId,'asset.discarded',id,asset.revision+1);await enqueueAssetCleanup(tx,projectId,id,asset.revision+1,new Date());}
  return {discarded:true};
}
/** Called inside the task's canonical transaction, including Planning commits. */
export async function linkTaskAssets(tx:Transaction,actor:Actor,projectId:string,taskId:string,value:TaskMediaData){
  const old=(await tx.query<{ids:string[]}>('SELECT attachment_ids AS ids FROM app.tasks WHERE project_id=$1 AND id=$2',[projectId,taskId])).rows[0];
  requireCondition(old,404,'TASK_NOT_FOUND','Задача недоступна.');
  requireCondition(!value.coverAttachmentId||value.attachmentIds.includes(value.coverAttachmentId),422,'TASK_COVER','Обложка должна быть вложением задачи.');
  requireCondition(!value.coverCrop||value.coverCrop.attachmentId===value.coverAttachmentId,422,'TASK_CROP','Кадр относится к другой обложке.');
  const all=[...new Set([...old.ids,...value.attachmentIds])].sort();
  const rows=all.length?(await tx.query<Asset>(`SELECT ${projection} FROM app.assets WHERE project_id=$1 AND id=ANY($2) ORDER BY id FOR UPDATE`,[projectId,all])).rows:[];
  for(const id of value.attachmentIds){
    const asset=rows.find(a=>a.id===id);
    requireCondition(asset&&asset.targetType==='task'&&asset.targetId===taskId&&(
      asset.state==='attached'&&old.ids.includes(id)||asset.state==='ready'&&asset.actorId===actor.id&&asset.expiresAt.getTime()>Date.now()),422,'TASK_FILE_ACCESS','Файл недоступен или срок загрузки истёк.');
    if(id===value.coverAttachmentId)requireCondition(asset.image,422,'TASK_COVER','Обложкой может быть только проверенное изображение.');
  }
  for(const asset of rows){const state=value.attachmentIds.includes(asset.id)?'attached':old.ids.includes(asset.id)?'detached':asset.state;
    if(state!==asset.state){const updated=(await tx.query<{expires:Date}>('UPDATE app.assets SET state=$3,revision=revision+1,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval \'24 hours\' WHERE project_id=$1 AND id=$2 RETURNING expires_at AS expires',[projectId,asset.id,state])).rows[0]!;
      if(state==='detached')await enqueueAssetCleanup(tx,projectId,asset.id,asset.revision+1,updated.expires);}}
  await tx.query('UPDATE app.tasks SET attachment_ids=$3,cover_attachment_id=$4,cover_crop=$5 WHERE project_id=$1 AND id=$2',[projectId,taskId,value.attachmentIds,value.coverAttachmentId,value.coverCrop?JSON.stringify(value.coverCrop):null]);
}

/** Map history pins referenced assets; deleting a note does not corrupt an immutable version. */
export async function linkMapAssets(tx:Transaction,actor:Actor,projectId:string,mapId:string,ids:string[]){
  const unique=[...new Set(ids)].sort();requireCondition(unique.length<=40,422,'MAP_IMAGE_LIMIT','На карте может быть до 40 изображений.');
  if(!unique.length)return;
  const rows=(await tx.query<Asset>(`SELECT ${projection} FROM app.assets WHERE project_id=$1 AND id=ANY($2) ORDER BY id FOR UPDATE`,[projectId,unique])).rows;
  requireCondition(rows.length===unique.length,422,'MAP_FILE_ACCESS','Изображение недоступно.');
  for(const asset of rows){
    requireCondition(asset.image&&asset.targetType==='map'&&asset.targetId===mapId&&(asset.state==='attached'||asset.state==='ready'&&asset.actorId===actor.id&&asset.expiresAt.getTime()>Date.now()),422,'MAP_FILE_ACCESS','Изображение не принадлежит этой карте или срок загрузки истёк.');
    if(asset.state==='ready')await tx.query("UPDATE app.assets SET state='attached',revision=revision+1,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2",[projectId,asset.id]);
  }
}

/** Called with the project lock; no private file can be borrowed from a task or another project. */
export async function linkProjectAvatar(tx:Transaction,actor:Actor,projectId:string,id:string|null){
  const previous=(await tx.query<{id:string|null}>('SELECT avatar_asset_id AS id FROM app.projects WHERE id=$1',[projectId])).rows[0]!.id;
  const ids=[...new Set([previous,id].filter((v):v is string=>!!v))].sort();
  const rows=ids.length?(await tx.query<Asset>(`SELECT ${projection} FROM app.assets WHERE project_id=$1 AND id=ANY($2) ORDER BY id FOR UPDATE`,[projectId,ids])).rows:[];
  if(id){const asset=rows.find(a=>a.id===id);
    requireCondition(asset&&asset.image&&asset.width===asset.height&&asset.targetType==='project-avatar'&&asset.targetId===projectId&&(
      previous===id&&asset.state==='attached'||asset.state==='ready'&&asset.actorId===actor.id&&asset.expiresAt.getTime()>Date.now()),422,'PROJECT_AVATAR','Выберите квадратное изображение через редактор аватара.');
    if(asset.state!=='attached')await tx.query("UPDATE app.assets SET state='attached',revision=revision+1,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2",[projectId,id]);
  }
  if(previous&&previous!==id){const asset=rows.find(a=>a.id===previous)!;
    const updated=(await tx.query<{expires:Date}>("UPDATE app.assets SET state='detached',revision=revision+1,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' WHERE project_id=$1 AND id=$2 RETURNING expires_at AS expires",[projectId,previous])).rows[0]!;
    await enqueueAssetCleanup(tx,projectId,previous,asset.revision+1,updated.expires);
  }
  await tx.query('UPDATE app.projects SET avatar_asset_id=$2 WHERE id=$1',[projectId,id]);
}
