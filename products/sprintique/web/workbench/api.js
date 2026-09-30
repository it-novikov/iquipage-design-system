// The Workbench endpoints over the product's HTTP client (docs/adr W1–W6). Every command carries a retry key; a caller
// that retries after an unknown result passes the same key again, and the private receipt answers the replay.
const enc=encodeURIComponent;
const key=()=>crypto.randomUUID();
const query=params=>{const q=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')q.set(k,v);const s=q.toString();return s?'?'+s:'';};
const filter=projects=>projects?.length?projects.join(','):undefined;
const task=(projectId,taskId)=>`/projects/${enc(projectId)}/tasks/${enc(taskId)}`;

export class WorkbenchApi {
  constructor(client){this.client=client;}
  get(path,signal){return this.client.request(path,'GET',undefined,undefined,signal);}
  envelope({projects,limit=10,signal}={}){return this.get('/workbench'+query({mode:'now',projects:filter(projects),limit}),signal);}
  list(section,{projects,cursor,limit=20,signal}={}){return this.get('/workbench/list'+query({section,projects:filter(projects),cursor,limit}),signal);}
  plan({horizon='7d',projects,timezone,undated='list',signal}={}){return this.get('/workbench/plan'+query({horizon,projects:filter(projects),timezone,undated}),signal);}
  preferences(signal){return this.get('/workbench/preferences',signal);}
  savePreferences(baseRevision,fields){return this.client.request('/workbench/preferences','PUT',{baseRevision,...fields});}
  seenAll(before,projects){return this.client.request('/workbench/seen','POST',{before,projects:projects?.length?projects:null});}
  personal(projectId,taskId,signal){return this.get(`${task(projectId,taskId)}/personal`,signal);}
  participation(projectId,taskId,baseRevision,participating,retry=key()){return this.client.request(`${task(projectId,taskId)}/personal/participation`,'PUT',{baseRevision,participating},retry);}
  rank(projectId,taskId,baseRevision,move,projects=null,retry=key()){return this.client.request(`${task(projectId,taskId)}/personal/rank`,'PUT',{baseRevision,move,projects:projects?.length?projects:null},retry);}
  seen(projectId,taskId,baseRevision,sequence,retry=key()){return this.client.request(`${task(projectId,taskId)}/personal/seen`,'PUT',{baseRevision,sequence},retry);}
  snooze(projectId,taskId,baseRevision,until,retry=key()){return this.client.request(`${task(projectId,taskId)}/personal/snooze`,'PUT',{baseRevision,until},retry);}
  checkBack(projectId,taskId,baseRevision,checkBackAt,retry=key()){return this.client.request(`${task(projectId,taskId)}/personal/check-back`,'PUT',{baseRevision,checkBackAt},retry);}
  accept(projectId,taskId,baseRevision,accepted,retry=key()){return this.client.request(`${task(projectId,taskId)}/personal/accept`,'PUT',{baseRevision,accepted},retry);}
  resolveRequest(projectId,id,baseRevision,retry=key()){return this.client.request(`/projects/${enc(projectId)}/requests/${enc(id)}/resolve`,'POST',{baseRevision},retry);}
  reopenRequest(projectId,id,baseRevision,retry=key()){return this.client.request(`/projects/${enc(projectId)}/requests/${enc(id)}/reopen`,'POST',{baseRevision},retry);}
  approval(projectId,id,signal){return this.get(`/projects/${enc(projectId)}/approvals/${enc(id)}`,signal);}
  decide(projectId,id,baseRevision,status,retry=key()){return this.client.request(`/projects/${enc(projectId)}/approvals/${enc(id)}/decision`,'POST',{baseRevision,status},retry);}
  thread(projectId,id,signal){return this.get(`/projects/${enc(projectId)}/threads/${enc(id)}`,signal);}
  reply(projectId,threadId,baseRevision,body,retry=key()){return this.client.request(`/projects/${enc(projectId)}/threads/${enc(threadId)}/messages`,'POST',{id:crypto.randomUUID(),body,baseRevision},retry);}
  startThread(projectId,taskId,body,retry=key()){return this.client.request(`${task(projectId,taskId)}/threads`,'POST',{id:crypto.randomUUID(),messageId:crypto.randomUUID(),body,requiresResolution:false},retry);}
}
