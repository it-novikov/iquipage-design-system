import {ApiError} from '../client/api.ts';
import {FILE_LIMIT,HEAD_BYTES,fileTypeOf} from '../contracts/media.ts';
import {digestFile} from './file-digest.js';

/** A large upload is abandoned only when no byte moved for this long, not after a fixed total time. */
const STALL_MS=60_000;
const extension=name=>(name.includes('.')?name.split('.').pop():'').toUpperCase();

/** Checks a file the way the server will, before any byte is sent: size, then the signature of its first bytes. */
export async function precheckFile(file){
  if(!file.size||file.size>FILE_LIMIT)throw new ApiError('FILE_SIZE',file.size?`Файл «${file.name}» больше 2 ГБ.`:`Файл «${file.name}» пустой.`,422);
  const type=fileTypeOf(file.name);
  if(!type.matches(new Uint8Array(await file.slice(0,HEAD_BYTES).arrayBuffer())))throw new ApiError('FILE_CONTENT',`Содержимое «${file.name}» не похоже на ${extension(file.name)||'заявленный формат'}. Проверьте расширение файла.`,422);
  return type;
}

/** The existing DS file/crop UI receives this host-owned, authenticated adapter. */
export class MediaAdapter {
  constructor(repository){this.repository=repository;this.client=repository.client;}
  path(input,variant=''){return `/projects/${encodeURIComponent(input.projectId)}/assets/${encodeURIComponent(input.id)}${variant?'/'+variant:''}`;}
  /** A same-origin address of a stored file: players and download links stream it with the session cookie. */
  url(input,variant='original'){return '/api/v1'+this.path(input,variant);}
  /** Refuses a file the server would refuse, before it is hashed or sent. */
  precheck(file){return precheckFile(file);}
  describe(input,{signal}={}){return this.client.request(this.path(input),'GET',undefined,undefined,signal);}
  async blob(input,{signal}={}){
    const response=await fetch(this.url(input,input.variant||'original'),{credentials:'same-origin',signal});
    if(!response.ok){const error=await response.json();throw new ApiError(error.code,error.message,response.status);}return response.blob();
  }
  async discard(input){return (await this.client.request(this.path(input),'DELETE')).discarded;}
  async upload(input,file,{signal,onProgress=()=>{}}={}){
    await precheckFile(file);signal?.throwIfAborted();
    const sha256=await digestFile(file,{signal,onProgress:loaded=>onProgress({phase:'preparing',loaded,total:file.size})});
    const body={id:input.id,targetType:input.targetType||'task',targetId:input.targetId||input.taskId,name:file.name,size:file.size,sha256};
    const path=`/projects/${encodeURIComponent(input.projectId)}/assets`;
    await this.client.request(path,'POST',body,await this.repository.key(path,body),signal);
    onProgress({phase:'uploading',loaded:0,total:file.size});
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest(),abort=()=>xhr.abort();let stall;
      const watch=()=>{clearTimeout(stall);stall=setTimeout(()=>{clean();xhr.onabort=null;xhr.abort();reject(new ApiError('FILE_TIMEOUT','Загрузка остановилась: минуту не было связи. Повторите загрузку.',503));},STALL_MS);};
      const clean=()=>{clearTimeout(stall);signal?.removeEventListener('abort',abort);};
      xhr.open('PUT',this.url(input,'content'));xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('X-CSRF-Token',this.client.csrf);
      xhr.upload.onprogress=e=>{watch();onProgress({phase:e.loaded===e.total?'processing':'uploading',loaded:e.loaded,total:e.lengthComputable?e.total:null});};
      // After the last byte the server still publishes the file (and decodes an image): that wait is not a stall.
      xhr.upload.onload=()=>clearTimeout(stall);
      xhr.onload=()=>{clean();try{const result=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new ApiError(result.code,result.message,xhr.status);resolve(result);}catch(error){reject(error instanceof ApiError?error:new ApiError('FILE_UPLOAD','Файл не сохранён. Повторите загрузку.',xhr.status||503));}};
      xhr.onerror=()=>{clean();reject(new ApiError('FILE_NETWORK','Связь прервалась. Повторите загрузку; копия не будет создана.',503));};
      xhr.onabort=()=>{clean();reject(new DOMException('Загрузка отменена','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){clean();reject(signal.reason);return;}watch();xhr.send(file);
    });
  }
}
