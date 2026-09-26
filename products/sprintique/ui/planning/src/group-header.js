import {ui,icon,escapeHTML as esc,formatDate,formatDateRange} from '@iquipage/web/core';
import {plural} from './markup.js';

const STATUS={active:['Идёт','info'],planned:['Запланирован','planned'],closed:['Завершён','success'],cancelled:['Отменён','neutral']};
const tasks=n=>`${n} ${plural(n,'задача','задачи','задач')}`;
const days=n=>`${n} ${plural(n,'день','дня','дней')}`;
const today=()=>new Date().toISOString().slice(0,10);
const between=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);

/** One meta fact: a quiet label and its value. Facts are separated by space, never by bullets. */
const fact=(label,value)=>`<span class="pn-fact"><span class="pn-fact-label">${label}</span><span class="pn-fact-value">${value}</span></span>`;

/** Timing in plain words: how long is left, when it starts, or how late it is. */
function timing(group){
  const now=today();
  if(group.state==='active'&&group.plannedEnd){
    const left=between(now,group.plannedEnd);
    if(left<0)return {text:`Просрочен на ${days(-left)}`,tone:'danger'};
    return {text:left===0?'Последний день':`Осталось ${days(left)}`,tone:''};
  }
  if(group.state==='planned'&&group.plannedStart){
    const until=between(now,group.plannedStart);
    return {text:until>0?`Старт через ${days(until)}`:until===0?'Старт сегодня':`Старт был ${formatDate(group.plannedStart)}`,tone:until<0?'warning':''};
  }
  return null;
}

/** Release, sprint or backlog header: what it is and its state on the first line, the facts on the second,
 *  and one primary action for the current state. Built from DS buttons, badges, progress and menu. */
export function groupHeader(group,{capabilities,locked,onOpenBoard,canSelect=false}) {
  const backlog=group.state==='backlog',history=['closed','cancelled'].includes(group.state),items=[];
  const kind=group.format==='timeboxed'?'спринт':'релиз',Kind=group.format==='timeboxed'?'Спринт':'Релиз';
  if(!backlog) {
    if(history)items.push({label:'Результат',glyph:'file',action:'release-history'});
    else {
      if(capabilities.editRelease)items.push({label:'Изменить сроки и название',glyph:'calendar',action:'release-edit'});
      if(capabilities.cancel)items.push({label:`Отменить ${kind}`,glyph:'x',action:'release-cancel',danger:true});
    }
  }
  const actions=[],off=locked?'disabled':'';
  if(group.state==='planned'&&capabilities.start)actions.push(ui.btn(`Начать ${kind}`,'secondary sm','play',`data-start ${off}`));
  if(group.state==='active'&&onOpenBoard)actions.push(ui.btn('Открыть доску','ghost sm','grid','data-board'));
  if(group.state==='active'&&capabilities.close)actions.push(ui.btn(`Завершить ${kind}`,'secondary sm','check',`data-close-release ${off}`));
  if(capabilities.createTask&&!history&&group.state!=='active')actions.push(ui.btn('Добавить задачу','ghost sm','plus',`data-add ${off}`));
  if(items.length)actions.push(ui.menu(ui.ib('more',`Ещё действия: ${group.title}`,'ghost sm',off),items));

  const [statusLabel,tone]=STATUS[group.state]||[];
  const when=timing(group);
  const facts=[];
  if(!backlog&&(group.plannedStart||group.plannedEnd))facts.push(fact('Сроки',esc(formatDateRange(group.plannedStart,group.plannedEnd))));
  facts.push(fact('Задачи',group.matched===group.total?esc(tasks(group.total)):`Показано ${group.matched} из ${esc(tasks(group.total))}`));
  if(!backlog&&group.total&&typeof group.done==='number'){
    const percent=Math.round(group.done/group.total*100);
    facts.push(`<span class="pn-fact pn-progress-fact">${ui.progress(percent,`Готово ${group.done} из ${group.total}`,'pn-progress')}<span class="pn-fact-value">Готово ${group.done} из ${group.total}</span></span>`);
  }
  if(when)facts.push(`<span class="pn-fact pn-timing" ${when.tone?`data-tone="${when.tone}"`:''}>${when.tone==='danger'?icon('warning',14):''}<span class="pn-fact-value">${esc(when.text)}</span></span>`);

  const fold=ui.ib(group.folded?'chevron':'down',`${group.folded?'Раскрыть':'Свернуть'}: ${group.title}`,'ghost sm pn-fold',`data-fold data-focus="group:${esc(group.id)}" aria-expanded="${!group.folded}"`);
  const select=canSelect?ui.check('',false,`data-select-group="${esc(group.id)}" aria-label="Выбрать все задачи: ${esc(group.title)}"`):'';
  return `<div class="pn-group-line">${fold}${select}<div class="pn-group-name"><h2>${esc(group.title)}</h2>${backlog?'<span class="pn-group-hint">Задачи без релиза</span>':`${statusLabel?ui.badge(statusLabel,tone):''}<span class="pn-kind">${Kind}</span>`}</div><div class="pn-group-actions">${actions.join('')}</div></div>
    <div class="pn-group-facts">${facts.join('')}</div>`;
}
