import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {FILE_LIMIT,IMAGE_PIXELS,FileName} from '../../contracts/media.js';
import {requireCondition,Problem} from './errors.js';
const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',md:'text/plain',csv:'text/plain',json:'text/plain',log:'text/plain',zip:'application/zip'};
export function inspectFile(name:string,bytes:Uint8Array){
  FileName.parse(name);requireCondition(bytes.length>0&&bytes.length<=FILE_LIMIT,422,'FILE_SIZE','Файл должен быть непустым и не больше 10 МБ.');
  const mime=types[name.split('.').at(-1)!.toLowerCase()];requireCondition(mime,422,'FILE_TYPE','Этот формат файла не поддерживается.');
  const starts=(signature:number[])=>signature.every((v,i)=>bytes[i]===v);let valid=true;
  if(mime==='image/png')valid=starts([137,80,78,71,13,10,26,10]);
  if(mime==='image/jpeg')valid=starts([255,216,255]);
  if(mime==='image/webp')valid=starts([82,73,70,70])&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP';
  if(mime==='application/pdf')valid=starts([37,80,68,70,45]);
  if(mime==='application/zip')valid=starts([80,75,3,4])||starts([80,75,5,6]);
  if(mime==='text/plain')try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!bytes.includes(0);}catch{valid=false;}
  requireCondition(valid,422,'FILE_CONTENT','Содержимое не соответствует формату файла.');
  return {name,mime,size:bytes.length,image:mime.startsWith('image/'),sha256:createHash('sha256').update(bytes).digest('hex')};
}
let decoders=0;
/** Bounded full decode + re-encode strips metadata and prevents compressed image bombs. */
export async function processFile(name:string,bytes:Uint8Array){
  const metadata=inspectFile(name,bytes);if(!metadata.image)return {...metadata,width:null,height:null,display:null,thumb:null};
  requireCondition(decoders<2,429,'IMAGE_BUSY','Сервис обрабатывает изображения. Повторите через несколько секунд.');decoders++;
  try{
    const image=sharp(bytes,{limitInputPixels:IMAGE_PIXELS,failOn:'warning',animated:false}).timeout({seconds:10});
    const info=await image.metadata();requireCondition(!info.pages||info.pages===1,422,'IMAGE_ANIMATION','Поддерживаются только неподвижные изображения.');
    requireCondition(info.width&&info.height&&info.width*info.height<=IMAGE_PIXELS,422,'IMAGE_SIZE','Слишком большое изображение.');
    const display=await image.clone().rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
    const thumb=await image.clone().rotate().resize({width:720,height:720,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
    return {...metadata,width:info.width,height:info.height,display,thumb};
  }catch(error){if(error instanceof Problem)throw error;throw new Problem(422,'IMAGE_DECODE','Не удалось прочитать изображение. Выберите другой файл.');}
  finally{decoders--;}
}
