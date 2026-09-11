import type {SessionInfo,Task,TaskData,Thread,ThreadPage} from '../contracts/index.js';

export class ApiError extends Error {
  constructor(public readonly code:string,message:string,public readonly status:number){super(message);}
}
export class SprintiqueClient {
  csrf:string|null=null;
  constructor(private readonly fetcher:typeof fetch=(...args)=>fetch(...args),private readonly base='/api/v1'){}
  async request<T>(path:string,method='GET',body?:unknown,key?:string,signal?:AbortSignal):Promise<T>{
    const headers:Record<string,string>={Accept:'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(this.csrf)headers['X-CSRF-Token']=this.csrf;
    if(key)headers['Idempotency-Key']=key;
    const response=await this.fetcher(this.base+path,{method,credentials:'same-origin',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),...(signal?{signal}:{})});
    if(!response.ok){
      const error=await response.json().catch(()=>({code:'NETWORK',message:'Сервис недоступен.'})) as {code:string;message:string};
      throw new ApiError(error.code,error.message,response.status);
    }
    return response.json() as Promise<T>;
  }
  async session(){const session=await this.request<SessionInfo>('/session');this.csrf=session.csrf;return session;}
  tasks(projectId:string,cursor=''){return this.request<{items:Task[];nextCursor:string|null}>(`/projects/${encodeURIComponent(projectId)}/tasks${cursor?'?cursor='+encodeURIComponent(cursor):''}`);}
  task(projectId:string,id:string,signal?:AbortSignal){return this.request<Task>(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(id)}`,'GET',undefined,undefined,signal);}
  putTask(projectId:string,id:string,baseRevision:number,task:TaskData,key:string){return this.request<Task>(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(id)}`,'PUT',{baseRevision,task},key);}
  thread(projectId:string,id:string,signal?:AbortSignal){return this.request<Thread>(`/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(id)}`,'GET',undefined,undefined,signal);}
  threads(projectId:string,taskId:string,{cursor=null,limit=20,signal}:{cursor?:string|null;limit?:number;signal?:AbortSignal}={}){
    const query=new URLSearchParams({limit:String(limit)});if(cursor)query.set('cursor',cursor);
    return this.request<ThreadPage>(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/threads?${query}`,'GET',undefined,undefined,signal);
  }
}
