import {PlanningClient} from '../client/planning.ts';
import {ViewIntent,ViewMoveRequest} from '../contracts/planning-view.ts';

/** UI protocol adapter. Canonical tasks and all derived membership stay on the server. */
export class PlanningAdapter {
  constructor(repository,projectId){
    this.repository=repository;this.api=repository.client;this.projectId=projectId;this.sdk=new PlanningClient(this.api,projectId);
    this.journalKey=`sprintique:planning-attempt:${repository.context.actorId}:${projectId}`;
  }
  request(resource,body,signal){return this.api.request(`/projects/${encodeURIComponent(this.projectId)}/planning/view/${resource}`,body===undefined?'GET':'POST',body,undefined,signal);}
  /** Every open container of the planning page with its tree and sums (planning R4.1). */
  containers({signal}={}){return this.request('containers',{},signal);}
  /** A move between containers or within one, or the undo of a move; applied at once with its own retry key. */
  move(body){if(this.pending())throw Error('Сначала проверьте результат предыдущего изменения.');
    return this.api.request(`/projects/${encodeURIComponent(this.projectId)}/planning/view/move`,'POST',ViewMoveRequest.parse(body),crypto.randomUUID());}
  /** Sprints and releases with their counts, the finished ones included. */
  releases(){return this.sdk.releases();}
  settings(){return this.request('settings');}
  preview({intent,signal}){if(this.pending())throw Error('Сначала проверьте результат предыдущего изменения.');return this.request('preview',ViewIntent.parse(intent),signal);}
  /** Finance changes never touch the plan, so they do not refresh it. */
  subscribe(listener){return this.repository.subscribe(event=>{if(event.projectId===this.projectId&&!String(event.collection).startsWith('finance'))listener(event);});}
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
