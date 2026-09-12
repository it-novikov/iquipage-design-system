import type {FastifyInstance} from 'fastify';
import type {Authenticated} from './app.js';
import {mutationKey,params} from './app.js';
import {AssetReservation,AssetParams,AssetVariant,FILE_LIMIT} from '../../contracts/media.js';
import type {ObjectStorage} from '../infrastructure/object-storage.js';
import {Problem,requireCondition} from '../domain/errors.js';
import * as media from '../application/media.js';
export function registerMediaRoutes(app:FastifyInstance,authenticated:Authenticated,storage?:ObjectStorage){
  const requireStorage=()=>{requireCondition(storage,503,'STORAGE_UNAVAILABLE','Файловый сервис не настроен.');return storage;};
  const base='/api/v1/projects/:projectId/assets';
  app.get('/api/v1/media/capabilities',r=>authenticated(r,async()=>({available:!!storage,maxFileBytes:FILE_LIMIT,imagesOnlyForCover:true})));
  app.post(base,r=>authenticated(r,(tx,a)=>{requireStorage();return media.reserveAsset(tx,a,params(r).projectId,AssetReservation.parse(r.body),mutationKey(r));}));
  app.get(base+'/:id',r=>authenticated(r,(tx,a)=>{const p=AssetParams.parse(r.params);return media.describeAsset(tx,a,p.projectId,p.id);}));
  app.delete(base+'/:id',r=>authenticated(r,(tx,a)=>{const p=AssetParams.parse(r.params);return media.discardAsset(tx,a,p.projectId,p.id);}));
  app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:FILE_LIMIT},(_r,body,done)=>done(null,body));
  app.put(base+'/:id/content',{bodyLimit:FILE_LIMIT},async r=>{
    const p=AssetParams.parse(r.params);requireCondition(Buffer.isBuffer(r.body),400,'FILE_BODY','Передайте содержимое файла.');
    const bytes=r.body,result=await authenticated(r,(tx,a)=>media.uploadAsset(tx,a,p.projectId,p.id,bytes,requireStorage()));
    if(result.error)throw new Problem(result.error.status,result.error.code,result.error.message);return result.value;
  });
  app.get(base+'/:id/:variant',async(r,reply)=>{
    const p=params(r),variant=AssetVariant.parse((r.params as Record<string,unknown>)['variant']);
    const asset=await authenticated(r,(tx,a)=>media.readableAsset(tx,a,p.projectId,p.id!));
    requireCondition(variant==='original'||asset.image,404,'FILE_VARIANT','Предпросмотр недоступен.');
    const bytes=await requireStorage().get(media.objectKey(asset,variant));
    // Recheck after storage I/O; a revoked session cannot finish a later download.
    await authenticated(r,(tx,a)=>media.readableAsset(tx,a,p.projectId,p.id!));
    reply.type(variant==='original'?asset.mime!:'image/webp').header('Content-Security-Policy',"default-src 'none'; sandbox");
    const name=encodeURIComponent(asset.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    reply.header('Content-Disposition',`attachment; filename="download"; filename*=UTF-8''${name}`);
    return reply.send(Buffer.from(bytes));
  });
}
