import {DomainError,requireValue,validId} from '../common.js';
import {FILE_LIMIT} from './attachment-model.js';
/** Host-owned endpoint. The reference server is same-origin; no credentials live in tasks. */
export class HttpAttachmentAdapter {
  constructor(baseURL='/api'){this.baseURL=baseURL.replace(/\/$/,'');}
  url(input,variant=''){
    requireValue([input.id,input.projectId,input.taskId].every(validId),'FILE_ID','Некорректная ссылка на файл.');
    return `${this.baseURL}/files/${encodeURIComponent(input.id)}${variant?'/'+variant:''}?${new URLSearchParams({projectId:input.projectId,taskId:input.taskId,...(input.name?{name:input.name}:{})})}`;
  }
  async request(input,{variant='',method='GET',signal,binary=false}={}){
    const response=await fetch(this.url(input,variant),{method,signal,credentials:'same-origin',headers:method==='GET'?{}:{'X-Maps-Client':'reference'}});
    if(!response.ok){const error=await response.json();throw new DomainError(error.code||'FILE_REQUEST',error.message||'Не удалось получить файл.');}
    return binary?response.blob():response.json();
  }
  describe(input,options={}){return this.request(input,options);}
  blob(input,options={}){return this.request(input,{...options,variant:input.variant,binary:true});}
  discard(input){return this.request(input,{method:'DELETE'});}
  upload(input,file,{signal,onProgress=()=>{}}={}){
    requireValue(file.size>0&&file.size<=FILE_LIMIT,'FILE_SIZE','Файл должен быть непустым и не больше 10 МБ.');
    signal?.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest(),abort=()=>xhr.abort(),clean=()=>signal?.removeEventListener('abort',abort);
      xhr.open('PUT',this.url({...input,name:file.name}));xhr.timeout=60000;
      xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('X-Maps-Client','reference');
      xhr.upload.onprogress=event=>onProgress({phase:event.loaded===event.total?'processing':'uploading',loaded:event.loaded,total:event.lengthComputable?event.total:null});
      xhr.onload=()=>{clean();try{const data=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new DomainError(data.code||'FILE_UPLOAD',data.message||'Файл не сохранён.');resolve(data);}catch(error){reject(error);}};
      xhr.onerror=()=>{clean();reject(new DomainError('FILE_NETWORK','Связь прервалась. Повторите загрузку; копия не будет создана.'));};
      xhr.ontimeout=()=>{clean();reject(new DomainError('FILE_TIMEOUT','Сервер не ответил вовремя. Повторите загрузку.'));};
      xhr.onabort=()=>{clean();reject(new DOMException('Загрузка отменена','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){clean();reject(signal.reason);return;}onProgress({phase:'uploading',loaded:0,total:file.size});xhr.send(file);    });
  }
}
