import {z} from 'zod';

const ResourceId=z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const FILE_LIMIT=10*1024*1024;
export const IMAGE_PIXELS=40_000_000;
export const FileName=z.string().trim().min(1).max(180).refine(v=>!/[\x00-\x1f\x7f/\\]/.test(v));
export const AssetReservation=z.strictObject({id:ResourceId,targetType:z.enum(['task','map','project-avatar']),targetId:ResourceId,
  name:FileName,size:z.number().int().min(1).max(FILE_LIMIT),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export const AssetParams=z.strictObject({projectId:ResourceId,id:ResourceId});
export const AssetVariant=z.enum(['original','display','thumb']);
/** Per axis the frame either lies inside the image (0 ≤ x ≤ 1−w) or contains it whole ("Вписать": 1−w ≤ x ≤ 0). */
export const coverAxisValid=(position:number,size:number)=>size<=1?position>=-1e-6&&position<=1-size+1e-6:position<=1e-6&&position>=1-size-1e-6;
export const CoverCrop=z.strictObject({attachmentId:ResourceId,x:z.number().min(-20).max(1),y:z.number().min(-20).max(1),width:z.number().positive().max(20),height:z.number().positive().max(20)})
  .refine(c=>coverAxisValid(c.x,c.width)&&coverAxisValid(c.y,c.height),'Кадр должен лежать внутри изображения или целиком содержать его.');
export const TaskMedia={attachmentIds:z.array(ResourceId).max(50).refine(v=>new Set(v).size===v.length).default([]),coverAttachmentId:ResourceId.nullable().default(null),coverCrop:CoverCrop.nullable().default(null)};
export type Reservation=z.infer<typeof AssetReservation>;
export type TaskMediaData={attachmentIds:string[];coverAttachmentId:string|null;coverCrop:z.infer<typeof CoverCrop>|null};
export const mediaSchemas={AssetReservation,AssetParams,AssetVariant,CoverCrop};
