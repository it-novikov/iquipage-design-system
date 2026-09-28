import {ui,icon,escapeHTML as esc,formatDate,formatDateRange} from '@iquipage/web/core';
import {plural,today,between} from './markup.js';

const tasks=n=>`${n} ${plural(n,'задача','задачи','задач')}`;
const days=n=>`${n} ${plural(n,'день','дня','дней')}`;

/** One fact: a quiet label and its value, separated from the next by space, never by bullets. */
const fact=(label,value,tone='')=>`<span class="pn-fact"${tone?` data-tone="${tone}"`:''}>${label?`<span class="pn-fact-label">${label}</span>`:''}<span class="pn-fact-value">${value}</span></span>`;

/** Timing in plain words: how long is left, when it starts, or how late it is. */
export function timing(group,now=today()){
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

/** The state badge carries the one thing to know: the running sprint is the only filled element, a late one turns red. */
function stateBadge(group,when){
  if(group.state==='active')return when?.tone==='danger'?`<span class="iq-badge danger">${esc(when.text)}</span>`:'<span class="iq-badge info">Идёт</span>';
  if(group.state==='planned')return '<span class="iq-badge soft planned">Запланирован</span>';
  if(group.state==='closed')return '<span class="iq-badge soft success">Завершён</span>';
  if(group.state==='cancelled')return '<span class="iq-badge soft neutral">Отменён</span>';
  return '';
}

/** Release, sprint or backlog as a section of the page: one head line (fold, name, state, kind and dates, one action
 *  and a menu), one line of readiness facts, and for the running release one thin progress bar. DS controls only. */
export function groupHeader(group,{capabilities,locked,onOpenBoard,canSelect=false}) {
  const backlog=group.state==='backlog',history=['closed','cancelled'].includes(group.state),off=locked?'disabled':'';
  const kind=group.format==='timeboxed'?'спринт':'релиз',Kind=group.format==='timeboxed'?'Спринт':'Релиз';
  const when=timing(group);
  const items=[];
  if(!backlog){
    if(history)items.push({label:'Результат',glyph:'file',action:'release-history'});
    else {
      if(capabilities.createTask&&group.state!=='active')items.push({label:'Добавить задачу',glyph:'plus',action:'release-add'});
      if(capabilities.editRelease)items.push({label:'Изменить сроки и название',glyph:'calendar',action:'release-edit'});
      if(group.state==='active'&&capabilities.close)items.push({label:`Завершить ${kind}`,glyph:'check',action:'release-close'});
      if(capabilities.cancel)items.push({label:`Отменить ${kind}`,glyph:'x',action:'release-cancel',danger:true});
    }
  }
  let primary='';
  if(group.state==='planned'&&capabilities.start)primary=ui.btn(`Начать ${kind}`,'secondary sm','play',`data-start ${off}`);
  else if(group.state==='active'&&onOpenBoard)primary=ui.btn('Открыть доску','secondary sm','grid','data-board');
  else if(backlog&&capabilities.createTask)primary=ui.btn('Добавить задачу','ghost sm','plus',`data-add ${off}`);
  else if(history)primary=ui.btn('Результат','ghost sm','file',`data-history ${off}`);
  const menu=items.length?ui.menu(ui.ib('more',`Ещё действия: ${esc(group.title)}`,'ghost sm',off),items):'';

  const facts=[];
  facts.push(fact('',group.matched===group.total?esc(tasks(group.total)):`Показано ${group.matched} из ${esc(tasks(group.total))}`));
  if(!backlog&&group.total&&typeof group.done==='number')facts.push(fact('Готово',`${group.done} из ${group.total}`));
  if(typeof group.drafts==='number'&&group.drafts)facts.push(fact('Черновиков',group.drafts));
  if(typeof group.unassigned==='number'&&group.unassigned)facts.push(fact('Без исполнителя',group.unassigned));
  if(when&&when.tone!=='danger')facts.push(fact('',esc(when.text),when.tone));
  const progress=group.state==='active'&&group.total&&group.done>0?ui.progress(Math.round(group.done/group.total*100),`Готово ${group.done} из ${group.total}`,'pn-progress'):'';

  const fold=ui.ib(group.folded?'chevron':'down',`${group.folded?'Раскрыть':'Свернуть'}: ${esc(group.title)}`,'ghost sm pn-fold',`data-fold data-focus="group:${esc(group.id)}" aria-expanded="${!group.folded}"`);
  const select=canSelect?ui.check('',false,`data-select-group="${esc(group.id)}" aria-label="Выбрать все задачи: ${esc(group.title)}"`):'';
  const dates=!backlog&&(group.plannedStart||group.plannedEnd)?`, ${esc(formatDateRange(group.plannedStart,group.plannedEnd))}`:'';
  const kindLine=backlog?'Задачи без релиза':`${Kind}${dates}`;
  return `<div class="iq-section-head pn-group-head">${fold}${select}<h2 class="pn-group-title">${esc(group.title)}</h2>${stateBadge(group,when)}<span class="pn-group-kind">${kindLine}</span><div class="iq-section-actions pn-group-actions">${primary}${menu}</div></div>
    <div class="pn-group-facts">${facts.join('')}</div>${progress}`;
}
