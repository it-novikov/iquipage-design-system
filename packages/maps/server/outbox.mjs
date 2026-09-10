import {createHash} from 'node:crypto';
import {matchesEvent} from '../src/events.js';
import {clone} from '../src/common.js';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,40);
const sameDocument=(a,b)=>JSON.stringify({...a,revision:0})===JSON.stringify({...b,revision:0});
/** Derive only committed domain events; no browser-supplied event identity is trusted. */
export function writeEvents(collection,previous,next,rules){
  if(!previous)return [];
  const types=[];
  if(collection==='maps'){
    if(previous.title!==next.title||!sameDocument(previous.document,next.document)||JSON.stringify(previous.flow)!==JSON.stringify(next.flow))types.push('map.updated');
    if(next.kind==='session'&&next.status==='archived'&&previous.status!=='archived')types.push('session.archived');
  }
  if(collection==='tasks'&&next.status!==previous.status)types.push('task.status_changed');
  return types.map(type=>{
    const event={id:'evt-'+hash(`${collection}:${next.id}:${next.revision}:${type}`),projectId:next.projectId,type,depth:0,data:{recordId:next.id,revision:next.revision,previousStatus:previous.status,status:next.status,notes:collection==='maps'?next.document.objects.filter(o=>['sticky','task'].includes(o.type)).slice(0,100).map(o=>o.text):[next.title]}};
    const targets=rules.filter(rule=>matchesEvent(rule,event)&&rule.trigger==='project').map(clone);
    return {id:event.id,event,targets,createdAt:next.updatedAt,attempts:0,nextAttemptAt:0,lastError:null};
  }).filter(entry=>entry.targets.length);
}
/** Delivery is at-least-once; runtime event IDs make replay safe after an ack failure. */
export class OutboxWorker {
  constructor(repository,eventService){this.repository=repository;this.events=eventService;this.active=null;}
  drain(date=Date.now()){
    if(this.active)return this.active;
    this.active=this.deliver(date).finally(()=>{this.active=null;});return this.active;
  }
  async deliver(date){
    const result=[];
    for(const entry of (await this.repository.pendingEvents()).filter(e=>e.nextAttemptAt<=date).slice(0,32)){
      try{
        for(const snapshot of entry.targets){
          const live=await this.repository.read('rules',snapshot.id,snapshot.projectId);
          // Paused or republished rules must not run an obsolete accepted snapshot.
          if(live?.status==='enabled'&&live.revision===snapshot.revision)await this.events.dispatch(snapshot,entry.event);
        }
        await this.repository.settleEvent(entry.id);result.push({id:entry.id,status:'delivered'});
      }catch(error){
        await this.repository.settleEvent(entry.id,{error:error.code||'DELIVERY_FAILED',date});
        result.push({id:entry.id,status:'retry',error:error.code||'DELIVERY_FAILED'});
      }
    }
    return result;
  }
}
