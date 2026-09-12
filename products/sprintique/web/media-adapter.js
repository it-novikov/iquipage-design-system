import {ApiError} from '../client/api.ts';
import {FILE_LIMIT} from '../contracts/media.ts';

/** The existing DS file/crop UI receives this host-owned, authenticated adapter. */
export class MediaAdapter {
  constructor(repository){this.repository=repository;this.client=repository.client;}
  path(input,variant=''){return `/projects/${encodeURIComponent(input.projectId)}/assets/${encodeURIComponent(input.id)}${variant?'/'+variant:''}`;}
  describe(input,{signal}={}){return this.client.request(this.path(input),'GET',undefined,undefined,signal);}
  async blob(input,{signal}={}){
    const response=await fetch('/api/v1'+this.path(input,input.variant||'original'),{credentials:'same-origin',signal});
    if(!response.ok){const error=await response.json();throw new ApiError(error.code,error.message,response.status);}return response.blob();
  }
  async discard(input){return (await this.client.request(this.path(input),'DELETE')).discarded;}
  async upload(input,file,{signal,onProgress=()=>{}}={}){
    if(!file.size||file.size>FILE_LIMIT)throw new ApiError('FILE_SIZE','Файл должен быть непустым и не больше 10 МБ.',422);
    signal?.throwIfAborted();onProgress({phase:'preparing',loaded:0,total:file.size});
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());signal?.throwIfAborted();
    const body={id:input.id,targetType:input.targetType||'task',targetId:input.targetId||input.taskId,name:file.name,size:file.size,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
    const path=`/projects/${encodeURIComponent(input.projectId)}/assets`;
    await this.client.request(path,'POST',body,await this.repository.key(path,body),signal);
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest(),abort=()=>xhr.abort(),clean=()=>signal?.removeEventListener('abort',abort);
      xhr.open('PUT','/api/v1'+this.path(input,'content'));xhr.timeout=60000;xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('X-CSRF-Token',this.client.csrf);
      xhr.upload.onprogress=e=>onProgress({phase:e.loaded===e.total?'processing':'uploading',loaded:e.loaded,total:e.lengthComputable?e.total:null});
      xhr.onload=()=>{clean();try{const result=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new ApiError(result.code,result.message,xhr.status);resolve(result);}catch(error){reject(error);}};
      xhr.onerror=()=>{clean();reject(new ApiError('FILE_NETWORK','Связь прервалась. Повторите загрузку; копия не будет создана.',503));};
      xhr.ontimeout=()=>{clean();reject(new ApiError('FILE_TIMEOUT','Сервер не ответил вовремя. Повторите загрузку.',503));};
      xhr.onabort=()=>{clean();reject(new DOMException('Загрузка отменена','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){clean();reject(signal.reason);return;}xhr.send(file);
    });
  }
}
