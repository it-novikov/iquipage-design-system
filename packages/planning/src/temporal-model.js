import {validDate} from './date-value.js';
const fail=message=>{throw new TypeError(message);};
export function temporalPage(value,projectId,revision=null) {
  if(!value||value.projectId!==projectId||typeof value.revision!=='string'||revision&&value.revision!==revision)fail('План изменился. Обновите временную шкалу.');
  if(!Array.isArray(value.rows)||value.rows.length>200||!Array.isArray(value.dependencies)||value.dependencies.length>10000)fail('Некорректная страница плана.');
  if(value.nextCursor!==null&&typeof value.nextCursor!=='string')fail('Некорректная страница.');
  if(!Number.isSafeInteger(value.total)||value.total<value.rows.length)fail('Некорректное количество объектов плана.');
  const ids=new Set();
  for(const row of value.rows){
    if(!row||typeof row.id!=='string'||ids.has(row.id)||typeof row.entityId!=='string'||!['task','release','milestone'].includes(row.entityKind)||typeof row.title!=='string'||row.title.length>500)fail('Некорректный объект плана.');
    ids.add(row.id);
    for(const date of [row.start,row.end,row.deadline])if(date!=null&&!validDate(date))fail('План содержит некорректную дату.');
    if(row.start&&row.end&&row.start>row.end)fail('Интервал плана задан в обратном порядке.');
    if(typeof row.readonly!=='boolean')fail('Не указана доступность изменения интервала.');
  }
  for(const edge of value.dependencies)if(!edge||typeof edge.id!=='string'||typeof edge.from!=='string'||typeof edge.to!=='string'||!['FS','SS','FF','SF'].includes(edge.type)||!Number.isInteger(edge.lagDays))fail('Некорректная зависимость.');
  return structuredClone(value);
}
export function roadmapProjection(rows,dependencies,revision) {
  const ids=new Set(rows.map(r=>r.id));
  return {revision,title:'Релизы, задачи и вехи',rows:rows.map(row=>({...row,parentId:ids.has(row.parentId)?row.parentId:undefined,start:row.start&&row.end?row.start:null,end:row.start&&row.end?row.end:null,kind:row.entityKind==='release'?'goal':row.entityKind==='milestone'?'milestone':row.kind||'task'})),dependencies:dependencies.filter(e=>ids.has(e.from)&&ids.has(e.to))};
}
export function timelineIntent(previous,next,sourceRevision) {
  const before=new Map(previous.rows.map(r=>[r.id,r])),after=new Map(next.rows.map(r=>[r.id,r])),actions=[];
  if(before.size!==after.size||[...before.keys()].some(id=>!after.has(id)))fail('Изменение состава выполняется в списке, не перетаскиванием интервала.');
  for(const row of next.rows){const old=before.get(row.id);if(row.start!==old.start||row.end!==old.end){if(old.readonly)fail('Этот интервал защищён.');actions.push({kind:'schedule',entityId:old.entityId,entityKind:old.entityKind,values:{start:row.start,end:row.end}});}}
  const oldEdges=new Map(previous.dependencies.map(e=>[e.id,e])),newEdges=new Map(next.dependencies.map(e=>[e.id,e]));
  for(const edge of next.dependencies){const old=oldEdges.get(edge.id);if(old&&JSON.stringify(old)===JSON.stringify(edge))continue;
    const from=before.get(edge.from),to=before.get(edge.to);
    if(from?.entityKind!=='task'||to?.entityKind!=='task')fail('Календарное ограничение связывает задачи. Релизы и вехи остаются контекстом плана.');
    actions.push({kind:'temporal',...(old?{entityId:edge.id}:{}),values:{fromId:from.entityId,toId:to.entityId,type:edge.type,lagDays:edge.lagDays||0}});
  }
  for(const edge of previous.dependencies)if(!newEdges.has(edge.id))actions.push({kind:'removeTemporal',entityId:edge.id});
  if(!actions.length)fail('Нет изменений для сохранения.');
  return {...(actions.length===1?actions[0]:{kind:'batch',actions}),expectedProjectionRevision:sourceRevision};
}
export function calendarProjection(rows) {
  const result=[];
  for(const row of rows){
    if(row.end)result.push({id:row.id+':end',title:row.title+(row.entityKind==='milestone'?'':' — план'),due:row.end,status:row.status==='done'?'done':'backlog'});
    if(row.deadline&&row.deadline!==row.end)result.push({id:row.id+':deadline',title:row.title+' — дедлайн',due:row.deadline,status:row.status==='done'?'done':'backlog'});
  }
  return result;
}
