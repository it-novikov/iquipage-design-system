import {escapeHTML as esc} from '@iquipage/web/core';
import {openPopover} from './popover.js';

/*
 * Estimates as people enter them: hours, days and weeks in a time project, story points in a points project. The unit
 * always travels with the number («6 ч», «2 д», «1 нед», «5 SP»); sums of time are in hours.
 */
export const ESTIMATE_UNITS=Object.freeze({h:'ч',d:'д',w:'нед',sp:'SP'});
const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});

export const formatNumber=value=>number.format(value);
export function formatEstimate(estimate){
  if(!estimate||!Number.isFinite(estimate.value)||!ESTIMATE_UNITS[estimate.unit])return '';
  return `${formatNumber(estimate.value)} ${ESTIMATE_UNITS[estimate.unit]}`;
}
/** A sum of estimates in the project format: hours for time, story points otherwise. */
export function formatSum(value,format='time'){
  if(!Number.isFinite(value)||value<=0)return '';
  return `${formatNumber(value)} ${format==='points'?'SP':'ч'}`;
}
export const unitsFor=format=>format==='points'?['sp']:['h','d','w'];
/** Whether a stored estimate belongs to the other format than the project's. */
export const estimateMismatch=(estimate,format)=>!!estimate&&(estimate.unit==='sp')!==(format==='points');

const WORDS={h:/^(ч|час|часа|часов|h|hr|hrs)$/i,d:/^(д|дн|день|дня|дней|d|day|days)$/i,w:/^(н|нед|неделя|недели|недель|w|wk|week|weeks)$/i,sp:/^(sp|сп|pt|pts|points?)$/i};

/**
 * «6», «6 ч», «2д», «1,5 нед», «5 SP» → {value, unit}; empty → null. The unit defaults to the given one. Values are
 * positive, at most 9999, with two decimals at most, as the server keeps them.
 */
export function parseEstimate(text,{unit='h',format='time'}={}){
  const raw=String(text??'').trim();if(!raw)return null;
  const match=/^(\d+(?:[.,]\d+)?)\s*([^\d\s.,]*)$/u.exec(raw);
  if(!match)throw Error('Введите число, например 6 или 2,5.');
  const value=Number(match[1].replace(',','.'));
  let chosen=unit;
  if(match[2]){chosen=Object.keys(WORDS).find(key=>WORDS[key].test(match[2]));if(!chosen)throw Error('Единица — ч, д, нед или SP.');}
  if(!unitsFor(format).includes(chosen))throw Error(format==='points'?'В этом проекте оценка в story points.':'В этом проекте оценка во времени: ч, д или нед.');
  if(!(value>0)||value>9999)throw Error('Оценка — от 0,01 до 9999.');
  if(Math.abs(value*100-Math.round(value*100))>1e-6)throw Error('Не больше двух знаков после запятой.');
  return {value,unit:chosen};
}

/**
 * Edits an estimate in place under its anchor: a number with a unit switch, «Без оценки» clears it. `onSave` gets
 * {value, unit} or null and may reject; the editor then stays open with the reason.
 */
export function estimateEditor(anchor,{value=null,format='time',hoursPerDay=8,hoursPerWeek=40,onSave,label='Оценка'}){
  const units=unitsFor(format),initialUnit=value&&units.includes(value.unit)?value.unit:units[0];
  let unit=initialUnit;
  const hint=format==='points'?'Story points: например 3 или 5.':`Например 6 ч, 2 д или 1 нед. День — ${formatNumber(hoursPerDay)} ч, неделя — ${formatNumber(hoursPerWeek)} ч.`;
  const html=`<form class="pl-est" novalidate><div class="pl-est-row"><input class="pl-est-input" name="estimate" inputmode="decimal" autocomplete="off" aria-label="${esc(label)}" value="${value&&units.includes(value.unit)?esc(formatNumber(value.value)):''}" placeholder="0">
    ${units.length>1?`<div class="iq-segmented pl-est-units" role="group" aria-label="Единица">${units.map(u=>`<button type="button" data-unit="${u}" aria-pressed="${u===unit}">${ESTIMATE_UNITS[u]}</button>`).join('')}</div>`:'<span class="pl-est-unit">SP</span>'}</div>
    <p class="pl-est-hint" data-hint>${esc(hint)}</p>
    <div class="pl-est-actions"><button type="button" class="iq-btn ghost sm" data-clear>Без оценки</button><button type="submit" class="iq-btn primary sm">Сохранить</button></div></form>`;
  return openPopover(anchor,{html,className:'pl-est-pop',label,onMount(el,{close}){
    const form=el.querySelector('form'),input=el.querySelector('input'),note=el.querySelector('[data-hint]');
    input.focus();input.select();
    const fail=message=>{note.textContent=message;note.dataset.tone='danger';input.setAttribute('aria-invalid','true');};
    const save=async next=>{
      form.setAttribute('aria-busy','true');
      try{await onSave(next);close(true);}catch(error){fail(error.message||'Оценка не сохранена.');}
      finally{form.removeAttribute('aria-busy');}
    };
    el.addEventListener('click',event=>{
      const button=event.target.closest('[data-unit]');
      if(button){unit=button.dataset.unit;for(const b of el.querySelectorAll('[data-unit]'))b.setAttribute('aria-pressed',String(b===button));input.focus();}
      if(event.target.closest('[data-clear]'))void save(null);
    });
    form.addEventListener('submit',event=>{event.preventDefault();try{void save(parseEstimate(input.value,{unit,format}));}catch(error){fail(error.message);}});
  }});
}
