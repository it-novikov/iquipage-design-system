// Pure presentation rules of the Workbench (docs/workbench/design-v2.md §11): dates, ages, the one "when" fact of a
// row, the verbs of requests, the glyph and "было → стало" of a change, plural forms and the routes. No DOM, no
// network: the views and their tests share these.

const pad=n=>String(n).padStart(2,'0');
const WEEKDAYS=['вс','пн','вт','ср','чт','пт','сб'];

/** The local calendar day of a moment (or now), `YYYY-MM-DD`. */
export function localDay(at=new Date()){const d=at instanceof Date?at:new Date(at);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
/** Whole days from `from` to `to` (dates only; noon avoids daylight-saving edges). */
export const daysBetween=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);
/** A date `n` days after `date`. */
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export const weekday=date=>WEEKDAYS[new Date(date+'T12:00:00Z').getUTCDay()];
export const isWeekend=date=>[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
export const shortDate=date=>`${date.slice(8,10)}.${date.slice(5,7)}`;

/** Russian plural: plural(5,'задача','задачи','задач') → 'задач'. */
export function plural(n,one,few,many){
  const tens=Math.abs(n)%100,units=tens%10;
  if(tens>10&&tens<20)return many;
  if(units===1)return one;
  if(units>=2&&units<=4)return few;
  return many;
}

/** A date for a row: "сегодня", "завтра, 30.09", "было сб 26.09", "пт 02.10"; no time is invented for a date. */
export function dayLabel(date,today=localDay()){
  if(!date)return '';
  const days=daysBetween(today,date);
  if(days===0)return 'сегодня';
  if(days===1)return `завтра, ${shortDate(date)}`;
  if(days<0)return `было ${weekday(date)} ${shortDate(date)}`;
  if(days<180)return `${weekday(date)} ${shortDate(date)}`;
  return `${shortDate(date)}.${date.slice(0,4)}`;
}

/** The age of a reason as its own fact, never glued into the reason text. */
export function ageLabel(at,now=Date.now()){
  if(!at)return '';
  const then=Date.parse(at);if(!Number.isFinite(then))return '';
  const minutes=Math.max(0,Math.round((now-then)/60000));
  if(minutes<1)return 'только что';
  if(minutes<60)return `${minutes} мин назад`;
  const hours=Math.round(minutes/60);
  if(hours<24&&localDay(new Date(then))===localDay(new Date(now)))return `${hours} ч назад`;
  const days=daysBetween(localDay(new Date(then)),localDay(new Date(now)));
  if(days<=1)return 'вчера';
  if(days<7)return `${days} ${plural(days,'день','дня','дней')} назад`;
  return shortDate(localDay(new Date(then)));
}

/** Tone of a date someone waits for: passed is danger, today or tomorrow is warning. Done work has none. */
export function dateTone(date,today=localDay(),done=false){
  if(!date||done)return '';
  const days=daysBetween(today,date);
  return days<0?'danger':days<=1?'warning':'';
}

/** "Нужно до" of a request row. */
export function neededWhen(row,today=localDay()){
  const date=row.request?.neededBy;
  if(!date)return {icon:'help',label:'',value:'Без срока ответа',tone:'',empty:true};
  return {icon:'help',label:'Нужно до',value:dayLabel(date,today),tone:dateTone(date,today)};
}
/** "Срок" of a task row: the deadline, else the planned interval, else "Без срока". */
export function dueWhen(row,today=localDay()){
  if(row.due)return {icon:'flag',label:'Срок',value:dayLabel(row.due,today),tone:dateTone(row.due,today,row.done)};
  if(row.plannedStart||row.plannedEnd){
    const from=row.plannedStart||row.plannedEnd,to=row.plannedEnd||row.plannedStart;
    return {icon:'flag',label:'Срок',value:from===to?dayLabel(from,today):`${shortDate(from)} – ${shortDate(to)}`,tone:''};
  }
  return {icon:'flag',label:'',value:'Без срока',tone:'',empty:true};
}
/** "Проверить" of delegated work: the person's own date. */
export function checkWhen(row,today=localDay()){
  const date=row.waiting?.checkBackAt;
  if(!date)return {icon:'calendar',label:'',value:'Без даты проверки',tone:'',empty:true};
  return {icon:'calendar',label:'Проверить',value:dayLabel(date,today),tone:dateTone(date,today)};
}

/** The verb of a request row (design-v2 §11.3): inline ones resolve in the row, the others open the drawer. */
export const VERBS={
  review:{label:'Проверено',icon:'check',inline:true,asks:'просит проверить'},
  approve:{label:'Утвердить',icon:'check',inline:true,asks:'просит утвердить'},
  do:{label:'Решено',icon:'check',inline:true,asks:'просит сделать'},
  question:{label:'Ответить',icon:'undo',inline:false,asks:'просит ответить'},
  decision:{label:'Ответить',icon:'undo',inline:false,asks:'просит решение'},
};
export const verbOf=row=>VERBS[row.action?.kind]||VERBS.question;
/** What the row says after its verb: "проверено", "утверждено", "решено". */
export const doneWord={review:'проверено',approve:'утверждено',do:'решено',question:'отвечено',decision:'отвечено'};

/** The glyph of a change kind; the kind is always also said in words. */
export const CHANGE_GLYPH={status:'circle',completed:'checkCircle',reopened:'undo',owner:'users',due:'flag',planned:'calendar',
  dependency:'link',thread:'message',resolution:'message',request:'help'};

const STATUS={ready:'Готово к работе',in_progress:'В работе',review:'Ревью',ready_for_testing:'Готово к тестированию',testing:'Тестирование',ready_for_release:'Готово'};
export const statusLabel=status=>STATUS[status]||status;
const personName=p=>p?(p.name||'бывший участник'):'никто';
const interval=v=>v&&(v.start||v.end)?(v.start&&v.end&&v.start!==v.end?`${shortDate(v.start)} – ${shortDate(v.end)}`:shortDate(v.start||v.end)):'без плана';

/**
 * A change in words, with its "было → стало" when there is one: {text, from, to}. The reason text of the server stays
 * the fallback for kinds without a diff.
 */
export function changeOf(latest,fallback=''){
  if(!latest)return {text:fallback,from:null,to:null};
  const d=latest.detail||{};
  switch(latest.kind){
    case 'due':
      if(!d.from&&d.to)return {text:'назначен срок',from:null,to:shortDate(d.to)};
      if(!d.to)return {text:'срок снят',from:d.from?shortDate(d.from):null,to:null};
      return {text:'срок перенесён',from:shortDate(d.from),to:shortDate(d.to)};
    case 'planned':return {text:'изменился план',from:interval(d.from),to:interval(d.to)};
    case 'owner':return {text:'исполнитель сменился',from:d.from?personName(d.from):null,to:personName(d.to)};
    case 'status':case 'reopened':return {text:'статус',from:null,to:`«${statusLabel(d.to)}»`};
    case 'completed':return {text:d.result==='accepted'?'результат принят':'работа завершена',from:null,to:null};
    case 'dependency':return {text:d.change==='removed'?'снята блокирующая зависимость':d.role==='blocks'?'задача блокирует другую':'изменилась блокирующая зависимость',from:null,to:null};
    case 'thread':return {text:'новое сообщение в обсуждении',from:null,to:null};
    case 'resolution':return {text:d.resolved?'вопрос в обсуждении решён':'вопрос открыт снова',from:null,to:null};
    case 'request':return {text:{resolved:'запрос решён',cancelled:'запрос отменён',orphaned:'адресат больше не в проекте',reassigned:'запрос передан другому',created:'новый запрос'}[d.change]||'запрос изменён',from:null,to:null};
    default:return {text:fallback,from:null,to:null};
  }
}

/** A change as one line of text: "срок перенесён 02.10 → 09.10", "статус «В работе»". */
export function changeLine(latest,fallback=''){
  const c=changeOf(latest,fallback);
  return [c.text,c.from&&c.to?`${c.from} → ${c.to}`:c.from?`${c.from} →`:c.to||''].filter(Boolean).join(' ');
}

/** Capped counts read "99+"; exact counts stay exact. */
export const countLabel=(count,capped=false)=>capped||count>99?'99+':String(count);
export const moreReasons=n=>`Ещё ${n} ${plural(n,'причина','причины','причин')}`;

/** The kinds of time in the plan: each is a labelled fact, never only a colour. */
export const PLAN_KINDS={
  neededBy:{label:'Ответ',icon:'help'},
  due:{label:'Срок',icon:'flag'},
  planned:{label:'План',icon:'calendar'},
  checkBack:{label:'Проверить',icon:'calendar'},
  milestone:{label:'Веха',icon:'pin'},
  undated:{label:'Без времени',icon:'clock'},
};
/** The "when" of a plan item on the overview: "было сб 26.09", "сегодня", "29.09 – 01.10". */
export function planWhen(item,today){
  if(item.kind==='planned'&&item.startDate&&item.endDate&&item.startDate!==item.endDate)return `${shortDate(item.startDate)} – ${shortDate(item.endDate)}`;
  if(item.overdue)return dayLabel(item.date,today);
  return item.date===today?'сегодня':dayLabel(item.date,today);
}
export const planTone=(item)=>item.overdue?'danger':item.kind==='checkBack'||item.kind==='neededBy'?'warning':'';

/** The project filter lives in the URL: `?projects=a,b`; nothing means every accessible project. */
export function readFilter(search){
  const raw=new URLSearchParams(search).get('projects');
  if(!raw)return null;
  const ids=[...new Set(raw.split(',').map(s=>s.trim()).filter(s=>/^[A-Za-z0-9_-]{1,100}$/.test(s)))].sort();
  return ids.length?ids:null;
}
export const writeFilter=projects=>projects?.length?`?projects=${projects.map(encodeURIComponent).join(',')}`:'';

/** The views of the Workbench v1 (design-v2 §11.4): Обзор | Список | Неделя; a task drawer by (projectId, taskId). */
export const VIEWS=[{key:'overview',label:'Обзор',icon:'grid',path:'/workbench'},{key:'list',label:'Список',icon:'list',path:'/workbench/list'},
  {key:'week',label:'Неделя',icon:'calendar',path:'/workbench/plan'}];
export function parseRoute(pathname){
  const task=/^\/workbench\/tasks\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\/?$/.exec(pathname);
  if(task)return {view:null,task:{projectId:task[1],taskId:task[2]}};
  const view=VIEWS.find(v=>v.path===pathname.replace(/\/$/,'')||(v.key==='overview'&&pathname==='/workbench/'));
  if(view)return {view:view.key,task:null};
  if(/^\/workbench\/board\/?$/.test(pathname))return {view:'overview',task:null};
  return null;
}
export const viewPath=key=>VIEWS.find(v=>v.key===key)?.path||'/workbench';

/**
 * Snooze presets bounded by the morning of `neededBy` (a request may not be put off past it): later today, tomorrow
 * morning, Monday morning. A preset after the bound is left out.
 */
export function snoozePresets(neededBy,now=new Date()){
  const at=(date,hours)=>{const d=new Date(date);d.setHours(hours,0,0,0);return d;};
  const tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);
  const monday=new Date(now);monday.setDate(now.getDate()+((8-now.getDay())%7||7));
  const presets=[{label:'Через 3 часа',until:new Date(now.getTime()+3*3600000)},{label:'Завтра утром',until:at(tomorrow,9)},{label:'В понедельник утром',until:at(monday,9)}];
  const limit=neededBy?new Date(neededBy+'T00:00:00'):null;
  return presets.filter(p=>p.until>now&&(!limit||p.until<=limit));
}
/** Due presets of the "Срок ▾" popover: tomorrow, Friday, Monday. */
export function duePresets(today=localDay()){
  const day=new Date(today+'T12:00:00Z').getUTCDay();
  const friday=addDays(today,((5-day+7)%7)||7),monday=addDays(today,((1-day+7)%7)||7);
  return [{label:'Завтра',date:addDays(today,1)},{label:`Пятница, ${shortDate(friday)}`,date:friday},{label:`Понедельник, ${shortDate(monday)}`,date:monday}];
}
