import {uid,now,requireValue,validId,assertSafeJSON} from './common.js';
import {validateFlow} from './workflow.js';
export const TRIGGER_LABELS={manual:'Вручную',schedule:'По расписанию',webhook:'По входящему запросу',project:'По событию проекта'};
export function validateRule(rule){
  const errors=[]; const add=(field,message)=>errors.push({field,message});
  try{assertSafeJSON(rule);}catch(e){return[{field:'rule',message:e.message}];}
  if(!validId(rule.id)||!validId(rule.projectId)||!validId(rule.mapId))add('id','Не заданы карта и проект.');
  if(!rule.name?.trim())add('name','Введите название автоматизации.');
  if(!TRIGGER_LABELS[rule.trigger])add('trigger','Выберите событие запуска.');
  if(!['draft','enabled','paused'].includes(rule.status))add('status','Недопустимое состояние правила.');
  if(rule.trigger==='schedule'){
    if(rule.schedule?.missed!=='skip'||rule.schedule?.repeatedHour!=='once')add('schedule','Поддерживаются пропуск пропущенного времени и один запуск в повторяющийся час.');
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.schedule?.time||''))add('time','Введите время в формате ЧЧ:ММ.');
    try{new Intl.DateTimeFormat('en',{timeZone:rule.schedule?.timeZone}).format();if(!rule.schedule?.timeZone)throw Error();}catch{add('timeZone','Укажите существующий часовой пояс, например Europe/Moscow.');}
    if(!Array.isArray(rule.schedule?.weekdays)||!rule.schedule.weekdays.length||rule.schedule.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6))add('weekdays','Выберите дни недели.');
  }
  if(rule.trigger==='project'&&!['session.archived','map.updated','task.completed'].includes(rule.eventType))add('eventType','Выберите поддерживаемое событие проекта.');
  if(rule.inputSource&&!['map-notes','event-notes'].includes(rule.inputSource))add('inputSource','Неизвестный источник данных.');
  if(rule.status==='enabled')for(const issue of validateFlow(rule.flowSnapshot))add('flowSnapshot',issue.message);
  return errors;
}
export function createRule(map){return{schema:'iquipage.rule/1',id:uid('rule'),projectId:map.projectId,mapId:map.id,revision:0,name:'Запуск по расписанию',trigger:'schedule',status:'draft',schedule:{time:'09:00',timeZone:'Europe/Moscow',weekdays:[1,2,3,4,5],missed:'skip',repeatedHour:'once'},eventType:'session.archived',flowSnapshot:structuredClone(map.flow),mapRevision:map.revision,createdAt:now()};}
/** DST: nonexistent wall time is skipped; repeated wall minute has one stable dedupe key. */
export function scheduleSlot(rule,date=new Date()){
  if(rule.status!=='enabled'||rule.trigger!=='schedule'||validateRule(rule).length)return null;
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:rule.schedule.timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(values.weekday);
  if(!rule.schedule.weekdays.includes(weekday)||`${values.hour}:${values.minute}`!==rule.schedule.time)return null;
  return `${rule.id}:${values.year}-${values.month}-${values.day}:${values.hour}:${values.minute}`;
}
export function matchesEvent(rule,event){
  return rule.status==='enabled'&&rule.projectId===event.projectId&&(event.depth||0)<3&&event.originRuleId!==rule.id&&((rule.trigger==='project'&&rule.eventType===event.type)||rule.trigger==='webhook');
}
export function validateEvent(event){
  assertSafeJSON(event);requireValue(validId(event.id)&&validId(event.projectId),'INVALID_EVENT','Нужны идентификатор события и проект.');
  requireValue(typeof event.type==='string'&&event.type.length<=120,'INVALID_EVENT','Нужен тип события.');return event;
}
