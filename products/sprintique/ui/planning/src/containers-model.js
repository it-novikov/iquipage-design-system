import {formatEstimate,formatSum} from '../../src/estimate.js';

/*
 * The planning page of round 4.1 as plain data: labels of dates and sums, the order of rows inside a container (open
 * work first, done work below «Готово»), the tree with collapsed epics, and the facts the dialogs need. No DOM here.
 */
export const PROTOCOL='sprintique.planning-containers/1';
const MONTHS=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const MONTH_NAMES=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export function plural(n,one,few,many){const m=Math.abs(n)%10,q=Math.abs(n)%100;return q>=11&&q<=14?many:m===1?one:m>=2&&m<=4?few:many;}
const parts=iso=>{const [y,m,d]=String(iso).split('-').map(Number);return {y,m,d};};
export const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
/** «8 окт»; another year than `today` adds it: «8 окт 2027». */
export function shortDate(iso,today=''){
  if(!validDay(iso))return '';const {y,m,d}=parts(iso);
  return `${d} ${MONTHS[m-1]}${today&&parts(today).y!==y?' '+y:''}`;
}
/** «28 сен – 11 окт», «12 – 25 окт» within one month. */
export function dateRange(start,end,today=''){
  if(!validDay(start)||!validDay(end))return shortDate(start||end,today);
  const a=parts(start),b=parts(end);
  if(a.y===b.y&&a.m===b.m)return `${a.d} – ${shortDate(end,today)}`;
  return `${shortDate(start,a.y===b.y?'':today)} – ${shortDate(end,today)}`;
}
export function daysBetween(from,to){return Math.round((Date.UTC(...ymd(to))-Date.UTC(...ymd(from)))/86_400_000);}
const ymd=iso=>{const {y,m,d}=parts(iso);return [y,m-1,d];};
export function addDays(iso,days){const date=new Date(Date.UTC(...ymd(iso)));date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export const monthTitle=(year,month)=>`${MONTH_NAMES[month]} ${year}`;
const days=n=>`${n} ${plural(n,'день','дня','дней')}`;

/** The dates of a container in words: when it runs and how much is left, relative to the project's today. */
export function whenLabel(container,today){
  const {kind,state,start,end,deadline}=container;
  if(kind==='sprint'&&validDay(start)&&validDay(end)){
    const range=dateRange(start,end,today);
    if(state==='active'){const left=daysBetween(today,end);
      return `${range} · ${left>0?`осталось ${days(left)}`:left===0?'последний день':`идёт дольше на ${days(-left)}`}`;}
    const wait=daysBetween(today,start);
    return `${range} · ${wait>0?`начнётся через ${days(wait)}`:wait===0?'начинается сегодня':'дата начала прошла'}`;
  }
  if(kind==='release'){
    if(validDay(deadline)){const left=daysBetween(today,deadline);
      return `к ${shortDate(deadline,today)} · ${left>0?`через ${days(left)}`:left===0?'сегодня':`срок прошёл ${days(-left)} назад`}`;}
    if(validDay(start)||validDay(end))return dateRange(start,end,today);
    return 'без срока';
  }
  return '';
}

/** The one sum of a container's head: progress for the running sprint, size for the next ones, risk for releases. */
export function summaryParts(container,format){
  const s=container.summary,hours=format==='points';
  const all=formatSum(hours?s.estimatePoints:s.estimateHours,format),left=formatSum(hours?s.remainingPoints:s.remainingHours,format);
  const tasks=n=>plural(n,'задача','задачи','задач');
  if(!s.total)return [];
  if(container.kind==='sprint'&&container.state==='active')return [{strong:String(s.done),text:` из ${s.total} готово${left?` · осталось ${left}`:''}`}];
  if(container.kind==='sprint')return [{strong:String(s.total),text:` ${tasks(s.total)}${all?` · ${all}`:''}`}];
  if(container.kind==='release')return [{strong:String(s.open),text:` ${plural(s.open,'открытая','открытых','открытых')}`},...(s.noDue?[{warning:`${s.noDue} без срока`}]:[])];
  return [{strong:String(s.total),text:` ${tasks(s.total)}`}];
}

/** «в Спринте 15», «в Релизе 1.0», «в бэклоге»: where the rest of an epic lives. */
export function locative(name){
  const text=String(name||'');
  if(text==='Бэклог')return 'бэклоге';
  if(/^Спринт(\s|$)/.test(text))return text.replace(/^Спринт/,'Спринте');
  if(/^Релиз(\s|$)/.test(text))return text.replace(/^Релиз/,'Релизе');
  return `«${text}»`;
}
/** «Анна Коваленко» → «Анна К.»; a service account keeps its name without the note in brackets. */
export function shortPerson(label){
  const name=String(label||'').replace(/\s*\(.*\)\s*$/,'').trim();
  const words=name.split(/\s+/).filter(Boolean);
  return words.length>1&&!/^Бывший/.test(name)?`${words[0]} ${words[1][0]}.`:name;
}

const leafHours=(row,format)=>row.estimateMismatch?0:format==='points'?row.estimatePoints||0:row.estimateHours||0;
/** Blocks of a container: each root row with the rows below it, in the server's depth-first order. */
export function blocksOf(rows){
  const blocks=[];
  for(const row of rows){if(row.depth===0||!blocks.length)blocks.push({root:row,rows:[row]});else blocks.at(-1).rows.push(row);}
  return blocks;
}
/** An epic block is done when all its work here is done; a task block when the task is. */
export function blockDone(block){
  const root=block.root;
  if(root.kind==='epic'){const here=root.rollup?.here;return here&&here.total>0?here.done===here.total:root.done;}
  return root.done;
}

/**
 * Display items of a container: open blocks first, then the «Готово» divider and done blocks. Done subtasks of an open
 * epic stay under it, muted. Rows under a collapsed epic are left out.
 */
export function arrange(container,{expanded,format}){
  const blocks=blocksOf(container.rows),open=[],done=[];
  for(const block of blocks)(blockDone(block)?done:open).push(block);
  const items=[];
  const emit=(block,muted)=>{
    let hiddenBelow=Infinity;
    for(const row of block.rows){
      if(row.depth>hiddenBelow)continue;
      hiddenBelow=Infinity;
      items.push({type:'row',row,muted:muted||row.done});
      if(row.kind==='epic'&&!expanded(row.id))hiddenBelow=row.depth;
    }
  };
  for(const block of open)emit(block,false);
  if(done.length){
    const leaves=done.flatMap(block=>block.rows.filter(row=>row.kind!=='epic'));
    const count=leaves.length||done.length,sum=leaves.reduce((total,row)=>total+leafHours(row,format),0);
    items.push({type:'divider',count,sum:container.kind==='release'?0:sum});
    for(const block of done)emit(block,true);
  }
  return items;
}
export const dividerLabel=(item,format)=>`Готово · ${item.count}${item.sum?` · ${formatSum(item.sum,format)}`:''}`;

/** The values of a row's right cells: state word or «done of total», owner, due date, estimate. */
export function cells(row,container,format,today){
  const epic=row.kind==='epic';
  const word={review:'ревью',ready_for_testing:'к тестированию',testing:'тестирование'}[row.status]||'';
  const here=row.rollup?.here;
  const estimate=container.kind==='release'?'':epic?formatSum(format==='points'?here?.estimatePoints:here?.estimateHours,format):formatEstimate(row.estimate);
  return {
    state:epic?(here?.total?`${here.done} из ${here.total}`:''):row.done?'':word,
    owner:epic?'':shortPerson(row.ownerLabel),
    due:row.due?shortDate(row.due,today):row.noDue?'без срока':'',
    dueWarning:!row.done&&(row.afterSprintEnd||row.noDue),
    estimate,
    estimateMismatch:!epic&&row.estimateMismatch
  };
}
/** «ещё 1 в Спринте 15» for an epic whose work also lives elsewhere. */
export const asideOf=row=>(row.rollup?.elsewhere||[]).map(place=>`${place.count} в ${locative(place.name)}`).join(', ');

/** Ids carried by a drag or a move of `id`: the selection if it holds the row, otherwise the row (an epic takes its
 *  subtasks on the server). */
export function carried(id,selection){return selection.has(id)?[...selection]:[id];}
/** The sum of the given rows (leaves only) in the project format. */
export function sumOf(rows,format){return rows.filter(row=>row.kind!=='epic').reduce((total,row)=>total+leafHours(row,format),0);}

/** Facts of the completion dialog: done, open with their remaining time, and dates past the end. */
export function completionFacts(container,format){
  const s=container.summary,late=container.rows.filter(row=>row.afterSprintEnd).length;
  return {done:s.done,open:s.open,remaining:formatSum(format==='points'?s.remainingPoints:s.remainingHours,format),late};
}
/** The next planned sprint after the running one, the default home of unfinished work. */
export const nextSprint=(containers,id)=>containers.find(c=>c.kind==='sprint'&&c.state==='planned'&&c.id!==id)||null;
/** A sprint's default dates: the day after the last sprint ends, for the project's usual length. */
export function nextSprintDates(containers,today,length=14){
  const ends=containers.filter(c=>c.kind==='sprint'&&validDay(c.end)).map(c=>c.end).sort();
  const start=ends.length?addDays(ends.at(-1),1):today;
  return {start,end:addDays(start,Math.max(1,length)-1)};
}
export function nextSprintName(containers){
  const numbers=containers.map(c=>/^Спринт\s+(\d+)$/.exec(c.name)?.[1]).filter(Boolean).map(Number);
  return `Спринт ${numbers.length?Math.max(...numbers)+1:1}`;
}
export function validContainers(value){
  return !!value&&value.protocol===PROTOCOL&&Array.isArray(value.containers)&&value.containers.every(c=>c&&typeof c.id==='string'&&Array.isArray(c.rows)&&c.summary);
}
