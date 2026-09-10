import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {DomainError,requireValue} from '../src/common.js';
import {validateEvent,validateRule,matchesEvent,scheduleSlot} from '../src/events.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function verifyWebhook(raw,timestamp,signature,secret,date=Date.now()){
  requireValue(!!secret,'HOOK_DISABLED','Подпись входящих запросов не настроена.');
  requireValue(/^\d{10}$/.test(timestamp||'')&&Math.abs(date/1000-Number(timestamp))<=300,'HOOK_EXPIRED','Запрос просрочен.');
  requireValue(/^[a-f0-9]{64}$/.test(signature||''),'HOOK_SIGNATURE','Некорректная подпись.');
  const expected=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest();
  requireValue(timingSafeEqual(expected,Buffer.from(signature,'hex')),'HOOK_SIGNATURE','Некорректная подпись.');
}
export class EventService {
  constructor(repository,runtime){this.repository=repository;this.runtime=runtime;}
  async dispatch(rule,event){
    validateEvent(event);requireValue(!validateRule(rule).length,'INVALID_RULE','Правило не прошло проверку.');
    if(rule.status!=='enabled'||event.projectId!==rule.projectId)return{skipped:true};
    if(!matchesEvent(rule,event)&&rule.trigger!=='schedule')return{skipped:true};
    const map=await this.repository.read('maps',rule.mapId,rule.projectId);
    if(!map||map.status==='archived')return{skipped:true,reason:'Карта в архиве или недоступна.'};
    const id='run-'+digest(`${rule.id}:${event.id}`).slice(0,40),payloadHash=digest(JSON.stringify(event.data||{}));
    const previous=await this.repository.read('runs',id,rule.projectId);
    if(previous){requireValue(previous.trigger?.payloadHash===payloadHash,'EVENT_CONFLICT','Этот идентификатор события уже использован с другими данными.');return previous;}
    const input=rule.inputSource==='event-notes'?event.data:{notes:map.document.objects.filter(x=>['sticky','task'].includes(x.type)).map(x=>x.text)};
    const run=await this.runtime.start({id,projectId:rule.projectId,mapId:rule.mapId,mapRevision:rule.mapRevision,flow:rule.flowSnapshot,input,mode:'execute',actorId:'reference-scheduler',trigger:{ruleId:rule.id,eventId:event.id,payloadHash}});
    requireValue(run.trigger?.payloadHash===payloadHash,'EVENT_CONFLICT','Этот идентификатор события уже использован с другими данными.');return run;
  }
  async projectEvent(event){
    validateEvent(event);const rules=await this.repository.list('rules',event.projectId),results=[];
    for(const rule of rules)if(matchesEvent(rule,event)&&rule.trigger==='project')results.push(await this.dispatch(rule,event));return results;
  }
  async tick(date=new Date()){
    const results=[];
    // Reference store is one workspace. Production must query authorized enabled rules.
    for(const rule of [...this.repository.data.rules.values()]){
      const slot=scheduleSlot(rule,date);if(!slot)continue;
      results.push(await this.dispatch(rule,{id:'slot-'+digest(slot).slice(0,40),projectId:rule.projectId,type:'schedule',data:{},depth:0}));
    }
    return results;
  }
}
