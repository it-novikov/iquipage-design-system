/** The planned interval of a task as date-only values ("YYYY-MM-DD"): no time zone conversion anywhere.
 *  Pure functions, shared by the drawer's plan field and its tests. */
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const pad=n=>String(n).padStart(2,'0');
export function validDay(value){
  if(typeof value!=='string'||!ISO.test(value))return false;
  const ms=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}
export function addDays(value,amount){
  if(!validDay(value)||!Number.isSafeInteger(amount))throw new TypeError('Некорректная дата или число дней.');
  return new Date(Date.parse(value+'T12:00:00Z')+amount*86400000).toISOString().slice(0,10);
}
/** Today on the person's own calendar. */
export function today(now=new Date()){return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;}
/** Days from a to b, both included: 29.09–10.10 is 12 days. */
export function spanDays(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)+1;}
/** "29.09" in the current year, "29.09.2027" otherwise: the fact column is narrow. */
export function shortDay(value,year=new Date().getFullYear()){
  if(!validDay(value))return '';
  const [y,m,d]=value.split('-');
  return Number(y)===year?`${d}.${m}`:`${d}.${m}.${y}`;
}
/** "29.09 – 10.10"; a one-day plan reads as one date; no plan is ''. */
export function planLabel(start,end,year=new Date().getFullYear()){
  const a=validDay(start)?start:'',b=validDay(end)?end:'';
  if(!a&&!b)return '';
  if(!a||!b||a===b)return shortDay(a||b,year);
  // Both ends leave the current year together, so the range never mixes short and full dates.
  const both=Number(a.slice(0,4))===year&&Number(b.slice(0,4))===year?year:NaN;
  return `${shortDay(a,both)} – ${shortDay(b,both)}`;
}
/** Typed "дд.мм.гггг" (or "дд.мм" for the current year) to "YYYY-MM-DD"; '' when empty, null when not a date. */
export function parseDay(text,year=new Date().getFullYear()){
  const value=String(text??'').trim();
  if(!value)return '';
  const match=/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/.exec(value);
  if(!match)return null;
  const y=match[3]?(match[3].length===2?2000+Number(match[3]):Number(match[3])):year;
  const iso=`${String(y).padStart(4,'0')}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
  return validDay(iso)?iso:null;
}
/** Typed form of a stored day: "29.09.2026". */
export function typedDay(value){return validDay(value)?value.split('-').reverse().join('.'):'';}
/** The plan as it is saved: ends in order, and one given end makes a one-day plan. */
export function normalizePlan(start,end){
  const a=validDay(start)?start:null,b=validDay(end)?end:null;
  if(!a&&!b)return {start:null,end:null};
  if(!a||!b)return {start:a||b,end:a||b};
  return a<=b?{start:a,end:b}:{start:b,end:a};
}
function days(n){
  const forms={one:'день',few:'дня',many:'дней',other:'дня'};
  return `${n} ${forms[new Intl.PluralRules('ru').select(n)]}`;
}
/** One line under the calendar that states the rules in words; it never disables a button.
 *  The deadline is independent of the plan on the server, so a late start is a warning, not an error. */
export function planHelp({start,end,deadline=null,year=new Date().getFullYear()}){
  const a=validDay(start)?start:null,b=validDay(end)?end:null,due=validDay(deadline)?deadline:null;
  const marked=due?` Срок задачи ${shortDay(due,year)} отмечен на календаре.`:'';
  if(!a&&!b)return {tone:'muted',text:`Выберите начало и конец плана.${marked}`};
  const plan=normalizePlan(a,b);
  if(due&&plan.start>due)return {tone:'warning',text:`Начало не позже срока ${shortDay(due,year)}.`};
  // The server reports the same risk in its check of the change, so it is said here before it is applied.
  if(due&&plan.end>due)return {tone:'warning',text:`Конец позже срока ${shortDay(due,year)}: срок не сдвинется сам.`};
  if(!b)return {tone:'muted',text:'Конец не задан: план на один день.'};
  if(!a)return {tone:'muted',text:'Начало не задано: план на один день.'};
  if(a>b)return {tone:'warning',text:'Конец раньше начала: даты поменяются местами.'};
  return {tone:'muted',text:`${days(spanDays(a,b))}.${marked}`};
}
/** Quick ranges from the start (or today): a week, two weeks, up to the deadline. */
export function planPreset(kind,{start,deadline,now=today()}){
  const from=validDay(start)?start:now;
  if(kind==='week')return {start:from,end:addDays(from,6)};
  if(kind==='two-weeks')return {start:from,end:addDays(from,13)};
  if(kind==='deadline'&&validDay(deadline))return from<=deadline?{start:from,end:deadline}:{start:deadline,end:deadline};
  return {start:validDay(start)?start:null,end:null};
}
/** The weeks of a month, Monday first, filled with the neighbouring months' days (inMonth false). */
export function monthGrid(year,month){
  const first=`${year}-${pad(month+1)}-01`,lead=(new Date(year,month,1).getDay()+6)%7,count=new Date(year,month+1,0).getDate();
  const total=Math.ceil((lead+count)/7)*7,weeks=[];
  for(let i=0;i<total;i+=7)weeks.push(Array.from({length:7},(_,j)=>{const value=addDays(first,i+j-lead);return {value,inMonth:value.slice(0,7)===first.slice(0,7)};}));
  return weeks;
}
/** Fields a task save sends back; the plan and bookkeeping (revision, timestamps) are not among them. */
const CONTENT=['title','description','status','type','priority','ownerId','due','parentId','releaseId','tagIds','attachmentIds','coverAttachmentId','coverCrop'];
/** True when two readings of a task differ at most in their plan and bookkeeping: after scheduling, the newer
 *  reading may replace the form's base revision only then, or an edit made elsewhere would be overwritten. */
export function onlyPlanChanged(before,after){
  const value=(task,key)=>JSON.stringify(key==='tagIds'||key==='attachmentIds'?[...(task?.[key]||[])].sort():task?.[key]??null);
  return CONTENT.every(key=>value(before,key)===value(after,key));
}
