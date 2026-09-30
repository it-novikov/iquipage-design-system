import {z} from 'zod';

const ResourceId=z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
/** The largest file (2 GiB) and the largest image the server turns into previews; mirrors server FileInspection. */
export const FILE_LIMIT=2*1024*1024*1024;
export const IMAGE_BYTES=32*1024*1024;
export const IMAGE_PIXELS=40_000_000;
/** How many leading bytes a signature looks at (a tar header names itself at offset 257). */
export const HEAD_BYTES=512;
export type FileType={mime:string;inline:boolean;previewable:boolean;text:boolean;matches:(head:Uint8Array)=>boolean};
const at=(head:Uint8Array,offset:number,expected:string|number[])=>{
  const bytes=typeof expected==='string'?[...expected].map(c=>c.charCodeAt(0)):expected;
  return head.length>=offset+bytes.length&&bytes.every((b,i)=>head[offset+i]===b);
};
const ascii=(head:Uint8Array,offset:number)=>head.length>=offset+4?String.fromCharCode(...head.slice(offset,offset+4)):'';
const HEIF=new Set(['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1']);
const QUICKTIME=new Set(['moov','mdat','wide','free','skip','pnot']);
const isoMedia=(h:Uint8Array)=>at(h,4,'ftyp');
const zip=(h:Uint8Array)=>at(h,0,[0x50,0x4B,3,4])||at(h,0,[0x50,0x4B,5,6]);
const ole=(h:Uint8Array)=>at(h,0,[0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1]);
const type=(mime:string,matches:(head:Uint8Array)=>boolean,{inline=false,previewable=false,text=false}={}):FileType=>({mime,inline,previewable,text,matches});
const png=type('image/png',h=>at(h,0,[0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),{inline:true,previewable:true});
const jpeg=type('image/jpeg',h=>at(h,0,[0xFF,0xD8,0xFF]),{inline:true,previewable:true});
const plain=type('text/plain',()=>true,{text:true});
export const GENERIC_FILE=type('application/octet-stream',()=>true);
/** Accepted formats by extension; the first bytes must agree. Any other name is a generic download. Mirrors the server. */
export const FILE_TYPES:Readonly<Record<string,FileType>>=Object.freeze({
  png,jpg:jpeg,jpeg,webp:type('image/webp',h=>at(h,0,'RIFF')&&at(h,8,'WEBP'),{inline:true,previewable:true}),
  gif:type('image/gif',h=>at(h,0,'GIF87a')||at(h,0,'GIF89a'),{inline:true}),
  heic:type('image/heic',h=>isoMedia(h)&&HEIF.has(ascii(h,8))),heif:type('image/heif',h=>isoMedia(h)&&HEIF.has(ascii(h,8))),
  svg:type('image/svg+xml',h=>new TextDecoder().decode(h).replace(/^\uFEFF/,'').trimStart().startsWith('<'),{text:true}),
  mp4:type('video/mp4',isoMedia,{inline:true}),m4v:type('video/x-m4v',isoMedia,{inline:true}),
  mov:type('video/quicktime',h=>isoMedia(h)||QUICKTIME.has(ascii(h,4)),{inline:true}),
  webm:type('video/webm',h=>at(h,0,[0x1A,0x45,0xDF,0xA3]),{inline:true}),
  mp3:type('audio/mpeg',h=>at(h,0,'ID3')||(h.length>1&&h[0]===0xFF&&(h[1]!&0xE0)===0xE0)),
  m4a:type('audio/mp4',isoMedia),wav:type('audio/wav',h=>at(h,0,'RIFF')&&at(h,8,'WAVE')),ogg:type('audio/ogg',h=>at(h,0,'OggS')),
  pdf:type('application/pdf',h=>at(h,0,'%PDF-')),
  docx:type('application/vnd.openxmlformats-officedocument.wordprocessingml.document',zip),
  xlsx:type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',zip),
  pptx:type('application/vnd.openxmlformats-officedocument.presentationml.presentation',zip),
  odt:type('application/vnd.oasis.opendocument.text',zip),ods:type('application/vnd.oasis.opendocument.spreadsheet',zip),
  odp:type('application/vnd.oasis.opendocument.presentation',zip),
  doc:type('application/msword',ole),xls:type('application/vnd.ms-excel',ole),ppt:type('application/vnd.ms-powerpoint',ole),
  rtf:type('application/rtf',h=>at(h,0,'{\\rtf')),
  zip:type('application/zip',zip),'7z':type('application/x-7z-compressed',h=>at(h,0,[0x37,0x7A,0xBC,0xAF,0x27,0x1C])),
  rar:type('application/vnd.rar',h=>at(h,0,[0x52,0x61,0x72,0x21,0x1A,0x07])),tar:type('application/x-tar',h=>at(h,257,'ustar')),
  gz:type('application/gzip',h=>at(h,0,[0x1F,0x8B])),
  txt:plain,md:plain,csv:plain,json:plain,log:plain,
});
/** The declared type of a file name; an unknown or missing extension is the generic download. */
export const fileTypeOf=(name:string):FileType=>{const dot=name.lastIndexOf('.');return (dot>=0&&Object.hasOwn(FILE_TYPES,name.slice(dot+1).toLowerCase())?FILE_TYPES[name.slice(dot+1).toLowerCase()]:undefined)??GENERIC_FILE;};
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
