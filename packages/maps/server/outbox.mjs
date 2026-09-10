import {createHash} from 'node:crypto';
import {matchesEvent} from '../src/events.js';
import {clone} from '../src/common.js';
export const MAX_DELIVERY_ATTEMPTS=5;
export const MAX_MANUAL_RETRIES=3;
export const HISTORY_LIMIT=500;
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,40);
const sameDocument=(a,b)=>JSON.stringify({...a,revision:0})===JSON.stringify({...b,revision:0});
const notes=map=>map.document.objects.filter(o=>['sticky','task'].includes(o.type)).slice(0,100).map(o=>o.text);
/** Runs inside the record transaction; each target receives its own frozen input. */
export function writeEvents(collection,previous,next,rules,maps=new Map()){
  if(!previous)return [];
  const types=[];
  if(collection==='maps'){
    if(previous.title!==next.title||!sameDocument(previous.document,next.document)||JSON.stringify(previous.flow)!==JSON.stringify(next.flow))types.push('map.updated');
    if(next.kind==='session'&&next.status==='archived'&&previous.status!=='archived')types.push('session.archived');
  }
  if(collection==='tasks'&&next.status!==previous.status)types.push('task.status_changed');
  return types.map(type=>{
    const event={id:'evt-'+hash(`${collection}:${next.id}:${next.revision}:${type}`),projectId:next.projectId,type,depth:0,data:{recordId:next.id,revision:next.revision,previousStatus:previous.status,status:next.status,notes:collection==='maps'?notes(next):[next.title]}};
    const targets=rules.filter(rule=>matchesEvent(rule,event)&&rule.trigger==='project').map(rule=>{
      const map=collection==='maps'&&rule.mapId===next.id?next:maps.get(rule.mapId);
      return {...clone(rule),inputSnapshot:rule.inputSource==='event-notes'?{notes:clone(event.data.notes)}:map&&map.projectId===rule.projectId?{notes:notes(map)}:null,inputMapRevision:map?.revision??null};
    });
    return {schema:2,revision:1,status:'pending',manualRetries:0,id:event.id,event,targets,createdAt:next.updatedAt,attempts:0,nextAttemptAt:0,lastError:null};
  }).filter(entry=>entry.targets.length);
}
const permanentError=code=>['INVALID_RULE','INVALID_FLOW','INVALID_EVENT','INPUT_SCHEMA','INPUT_LIMIT','EVENT_CONFLICT','SNAPSHOT_MISSING'].includes(code);
/** At-least-once delivery. Replays retain event IDs, inputs and execution IDs. */
export class OutboxWorker {
  constructor(repository,eventService){this.repository=repository;this.events=eventService;this.active=null;}
  drain(date=Date.now()){
    if(this.active)return this.active;
    this.active=this.deliver(date).finally(()=>{this.active=null;});return this.active;
  }
  async deliver(date){
    const result=[];
    for(const entry of (await this.repository.pendingEvents()).filter(e=>e.status!=='dead'&&e.nextAttemptAt<=date).slice(0,32)){
      try{
        const outcomes=[];
        for(const snapshot of entry.targets){
          const live=await this.repository.read('rules',snapshot.id,snapshot.projectId);
          if(live?.status==='enabled'&&live.revision===snapshot.revision){
            const run=await this.events.dispatchCommitted(entry.id,snapshot.id);
            outcomes.push({ruleId:snapshot.id,mapId:snapshot.mapId,...(run?.id?{runId:run.id}:{reason:run?.reason||'SKIPPED'})});
          }else outcomes.push({ruleId:snapshot.id,mapId:snapshot.mapId,reason:'RULE_CHANGED'});
        }
        await this.repository.settleEvent(entry.id,null,{baseRevision:entry.revision,outcomes});
        result.push({id:entry.id,status:'delivered'});
      }catch(error){
        const code=error.code||'DELIVERY_FAILED';
        await this.repository.settleEvent(entry.id,{error:code,date,permanent:permanentError(code)},{baseRevision:entry.revision});
        result.push({id:entry.id,status:'retry',error:code});
      }
    }
    return result;
  }
}
