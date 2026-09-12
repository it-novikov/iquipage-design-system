import {SprintiqueClient} from './api.js';
import type {Effect,Page,PlanningCommand,PlanningQuery,PlanningRow,Preview,Receipt,Release,ReleaseData,TemporalConstraint,Milestone} from '../contracts/planning.js';
import type {PlanningCapabilities,ReleasePage,RoadmapPage,HistoryPage,PlanningApproval} from '../contracts/planning-responses.js';

export interface RoadmapQuery {cursor?:string;limit?:number;from?:string;to?:string;undated?:boolean}

/** Pass the same client/session as other views. Never manufacture a second Task store. */
export class PlanningClient {
  constructor(readonly api:SprintiqueClient,readonly projectId:string){}
  private path(suffix:string){return `/projects/${encodeURIComponent(this.projectId)}${suffix}`;}
  private query(values:Record<string,unknown>){const q=new URLSearchParams();for(const [key,value] of Object.entries(values))if(value!==undefined&&value!==null)q.set(key,String(value));return '?'+q;}
  capabilities(signal?:AbortSignal){return this.api.request<PlanningCapabilities>(this.path('/planning/capabilities'),'GET',undefined,undefined,signal);}
  tasks(query:Partial<PlanningQuery>={},signal?:AbortSignal){return this.api.request<Page<PlanningRow>>(this.path('/planning/tasks')+this.query(query),'GET',undefined,undefined,signal);}
  board(query:Partial<PlanningQuery>={},signal?:AbortSignal){return this.api.request<Page<PlanningRow>>(this.path('/board/tasks')+this.query(query),'GET',undefined,undefined,signal);}
  releases(cursor?:string,signal?:AbortSignal){return this.api.request<ReleasePage>(this.path('/planning/releases')+this.query({cursor}),'GET',undefined,undefined,signal);}
  writeRelease(id:string,baseRevision:number,value:ReleaseData,key:string){return this.api.request<Release>(this.path('/planning/releases/'+encodeURIComponent(id)),'PUT',{baseRevision,value},key);}
  preview(command:PlanningCommand,signal?:AbortSignal){return this.api.request<Preview>(this.path('/planning/previews'),'POST',command,undefined,signal);}
  effects(planId:string,cursor?:string){return this.api.request<Page<Effect>>(this.path('/planning/previews/'+encodeURIComponent(planId)+'/effects')+this.query({cursor}));}
  commit(preview:Pick<Preview,'id'|'token'>,commandKey:string){return this.api.request<Receipt>(this.path('/planning/commands'),'POST',{planId:preview.id,token:preview.token},commandKey);}
  receipt(commandKey:string){return this.api.request<Receipt>(this.path('/planning/commands/'+encodeURIComponent(commandKey)));}
  approval(id:string){return this.api.request<PlanningApproval>(this.path('/approvals/'+encodeURIComponent(id)));}
  approvalEffects(id:string,cursor?:string){return this.api.request<Page<Effect>>(this.path('/approvals/'+encodeURIComponent(id)+'/effects')+this.query({cursor}));}
  decideApproval(id:string,baseRevision:number,status:'approved'|'rejected',key:string){return this.api.request<PlanningApproval>(this.path('/approvals/'+encodeURIComponent(id)+'/decision'),'POST',{baseRevision,status},key);}
  history(releaseId:string,cursor?:string){return this.api.request<HistoryPage>(this.path('/planning/releases/'+encodeURIComponent(releaseId)+'/history')+this.query({cursor}));}
  roadmap(query:RoadmapQuery={},signal?:AbortSignal){return this.api.request<RoadmapPage>(this.path('/planning/roadmap')+this.query({...query}),'GET',undefined,undefined,signal);}
  constraints(cursor?:string,signal?:AbortSignal){return this.api.request<Page<TemporalConstraint>>(this.path('/planning/constraints')+this.query({cursor}),'GET',undefined,undefined,signal);}
  writeMilestone(id:string,baseRevision:number,value:Pick<Milestone,'title'|'date'|'releaseId'>,key:string){return this.api.request<Milestone>(this.path('/planning/milestones/'+encodeURIComponent(id)),'PUT',{baseRevision,value},key);}
  writeConstraint(id:string,baseRevision:number,value:Omit<TemporalConstraint,'id'|'revision'>,key:string){return this.api.request<TemporalConstraint>(this.path('/planning/constraints/'+encodeURIComponent(id)),'PUT',{baseRevision,value},key);}
}

export type CommandAttempt = {key:string;plan:Pick<Preview,'id'|'token'>;state:'unsent'|'sending'|'uncertain'|'settled';receipt:Receipt|null};
/** The host persists an attempt before dispatch (sensitive token: never log it).
 * Unknown network result is not a rejected command and must never trigger local compensation.
 */
export async function sendAttempt(client:PlanningClient,attempt:CommandAttempt,persist:(value:CommandAttempt)=>Promise<void>){
  attempt.state='sending';await persist(attempt);
  try{attempt.receipt=await client.commit(attempt.plan,attempt.key);attempt.state='settled';}
  catch(error){attempt.state='uncertain';await persist(attempt);throw error;}
  await persist(attempt);return attempt.receipt;
}

/** Authoritative cache invalidation; event payloads are not substitute task documents. */
export function watchProject(projectId:string,onChange:(event:{topic:string;resourceId:string;revision:number})=>void,onAccessRevoked:()=>void,{cursor}:{cursor?:string}={}){
  const query=new URLSearchParams({stream:'true'});if(cursor)query.set('cursor',cursor);
  const stream=new EventSource(`/api/v1/projects/${encodeURIComponent(projectId)}/events?${query}`);
  const controller=new AbortController();let checking=false,closed=false;
  const revoked=()=>{if(closed)return;closed=true;stream.close();controller.abort();onAccessRevoked();};
  stream.addEventListener('change',event=>{if(!closed)onChange(JSON.parse((event as MessageEvent<string>).data));});
  stream.addEventListener('access-revoked',revoked);
  stream.addEventListener('resync',()=>{if(!closed)onChange({topic:'resync',resourceId:'',revision:0});});
  stream.addEventListener('error',async()=>{
    if(checking||closed)return;checking=true;
    try{const response=await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/planning/capabilities`,{credentials:'same-origin',signal:controller.signal});
      if([401,403,404].includes(response.status))revoked();
    }catch{/* Disconnection is not proof of authorization loss. */}finally{checking=false;}
  });
  return ()=>{closed=true;controller.abort();stream.close();};
}
