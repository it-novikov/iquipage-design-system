import {PlanningClient} from '../client/planning.ts';
import {ViewQuery,ViewRowsQuery,ViewSelectQuery,ViewOptionsQuery,ViewIntent} from '../contracts/planning-view.ts';

/** UI protocol adapter. Canonical tasks and all derived membership stay on the server. */
export class PlanningAdapter {
  constructor(repository,projectId){
    this.repository=repository;this.api=repository.client;this.projectId=projectId;this.sdk=new PlanningClient(this.api,projectId);
    this.journalKey=`sprintique:planning-attempt:${repository.context.actorId}:${projectId}`;
  }
  request(resource,body,signal){return this.api.request(`/projects/${encodeURIComponent(this.projectId)}/planning/view/${resource}`,body===undefined?'GET':'POST',body,undefined,signal);}
  query(resource,schema,{projectId,signal,requestId,...body}){if(projectId!==this.projectId)throw Error('Проект изменился.');return this.request(resource,schema.parse(body),signal);}
  listGroups(q){return this.query('groups',ViewQuery,q);}
  listRows(q){return this.query('rows',ViewRowsQuery,q);}
  timeline(q){return this.query('timeline',ViewQuery,q);}
  selectMatching(q){return this.query('selection',ViewSelectQuery,q);}
  destinations(q){return this.query('options',ViewOptionsQuery,{...q,kind:'destinations'});}
  options(q){return this.query('options',ViewOptionsQuery,q);}
  describeRelease({groupId,cursor,signal}){return this.request('release',{groupId,...(cursor?{cursor}:{})},signal);}
  settings(){return this.request('settings');}
  preview({intent,signal}){if(this.pending())throw Error('Сначала проверьте результат предыдущего изменения.');return this.request('preview',ViewIntent.parse(intent),signal);}
  subscribe(listener){return this.repository.subscribe(event=>{if(event.projectId===this.projectId)listener(event);});}
  pending(){
    const raw=sessionStorage.getItem(this.journalKey);if(!raw)return null;
    const value=JSON.parse(raw);
    if(!value||typeof value.key!=='string'||typeof value.plan?.id!=='string'||typeof value.plan?.token!=='string')throw Error('Не удалось прочитать журнал изменения. Не отправляйте его повторно.');
    return value;
  }
  clear(){sessionStorage.removeItem(this.journalKey);}
  async settle(attempt,result){
    if(!['committed','rejected'].includes(result?.status))return {state:'uncertain'};
    // Do not erase a different command recorded by another owner of this adapter.
    if(this.pending()?.key===attempt.key)this.clear();
    return result.status==='committed'?{state:'committed',operationId:result.operationId}:{state:'rejected',message:result.error.message};
  }
  async commit({token,idempotencyKey}){
    const [id,secret,...extra]=token.split('.');if(!id||!secret||extra.length)throw Error('Некорректное подтверждение.');
    const attempt={key:idempotencyKey,plan:{id,token:secret}},pending=this.pending();
    if(pending&&JSON.stringify(pending)!==JSON.stringify(attempt))throw Error('Другое изменение ожидает проверки.');
    // Write-ahead in this tab's session storage: if storage fails, no request is sent.
    sessionStorage.setItem(this.journalKey,JSON.stringify(attempt));
    return this.settle(attempt,await this.sdk.commit(attempt.plan,attempt.key));
  }
  async receipt({idempotencyKey}){
    const attempt=this.pending();if(!attempt||attempt.key!==idempotencyKey)throw Error('Запись операции недоступна.');
    try{return await this.settle(attempt,await this.sdk.receipt(attempt.key));}
    catch(error){
      if(error.code!=='RECEIPT_NOT_FOUND')throw error;
      // Receipt lookup shares the aggregate lock. Replaying the exact approved command/key is safe.
      return this.settle(attempt,await this.sdk.commit(attempt.plan,attempt.key));
    }
  }
}
