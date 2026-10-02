/** Finance section model: periods, labels and statuses. Pure, so the rules are testable without a browser. */
import {todayInZone} from '../../planning/src/date-value.js';
export const PERIODS=[['all','Всё время'],['month','Этот месяц'],['previous-month','Прошлый месяц'],['quarter','Этот квартал'],['year','Этот год']];
export const STATE_FILTERS=[['','Все'],['planned','Ожидаются'],['posted','Проведены'],['voided','Аннулированы']];
export const DIRECTION_FILTERS=[['','Все'],['income','Доходы'],['expense','Расходы']];

const pad=n=>String(n).padStart(2,'0');
/** A local calendar date as `YYYY-MM-DD`. */
export const isoDate=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
/**
 * Today in the project's time zone, as planning reads it: "this month", overdue entries and default dates follow the
 * project, not the browser.
 */
export const projectToday=(timeZone,instant=new Date())=>{try{return todayInZone(timeZone||'UTC',instant);}catch{return todayInZone('UTC',instant);}};
/** The inclusive date range of a period around `today` (`YYYY-MM-DD`); `all` has none. Calendar arithmetic only. */
export function periodRange(period,today){
  const [y,month]=today.split('-').map(Number),m=month-1;
  const day=(year,monthIndex,date)=>isoDate(new Date(year,monthIndex,date));
  const range=(from,to)=>({from,to});
  if(period==='month')return range(day(y,m,1),day(y,m+1,0));
  if(period==='previous-month')return range(day(y,m-1,1),day(y,m,0));
  if(period==='quarter'){const first=m-m%3;return range(day(y,first,1),day(y,first+3,0));}
  if(period==='year')return range(day(y,0,1),day(y,11,31));
  return {from:null,to:null};
}
/** `2026-09-10` → `10.09.2026`, as dates read everywhere in the product. */
export const formatDate=value=>{if(!value)return '';const [y,m,d]=value.split('-');return `${d}.${m}.${y}`;};
/** `2026-09` → «Сентябрь 2026». */
export function formatMonth(value){
  const [y,m]=value.split('-').map(Number);
  const name=new Date(y,m-1,1).toLocaleDateString('ru-RU',{month:'long'});
  return name[0].toUpperCase()+name.slice(1)+' '+y;
}
/**
 * What the status of an entry says to a person: one word and a DS badge tone. A planned entry whose date has passed
 * is overdue; the ledger stays as it is until someone posts or voids it.
 */
export function entryStatus(entry,today){
  if(entry.state==='voided')return {label:'Аннулирована',tone:'danger'};
  if(entry.state==='posted')return {label:'Проведена',tone:''};
  if(entry.dueDate<today)return {label:'Просрочена',tone:'warning'};
  return {label:'Ожидается',tone:'info'};
}
export const directionLabel=direction=>direction==='income'?'Доход':'Расход';
export const changeLabel={created:'Создана',updated:'Изменена',posted:'Проведена',voided:'Аннулирована'};
/** The second line of a row: category (its current name) and counterparty, joined by a comma. */
export const entryContext=entry=>[entry.categoryName??entry.category,entry.counterparty].filter(Boolean).join(', ');
/** Russian plural: plural(3,['операция','операции','операций']). */
export function plural(n,[one,few,many]){const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>1&&b<5?few:many;}
/** The query of the ledger for a filter and a period. */
export function ledgerQuery({state='',direction='',period='all',cursor=null,limit=50},today){
  const {from,to}=periodRange(period,today),query=new URLSearchParams({limit:String(limit)});
  if(state)query.set('state',state);if(direction)query.set('direction',direction);
  if(from)query.set('from',from);if(to)query.set('to',to);if(cursor)query.set('cursor',cursor);
  return query.toString();
}
