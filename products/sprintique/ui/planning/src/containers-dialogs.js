import {ui,icon,escapeHTML as esc,registerCore} from '@iquipage/web/core';
import {formDialog} from './dialog.js';
import {openPopover} from '../../src/popover.js';
import {formatSum} from '../../src/estimate.js';
import {completionFacts,nextSprint,dateRange,shortDate,validDay,addDays,daysBetween,monthTitle,plural,nextSprintDates,nextSprintName,whenLabel} from './containers-model.js';

/*
 * Dialogs and in-place editors of the planning page. Product text is plain sentences: no lists, no bullets.
 */

/** A calendar under a due date: today, the sprint's end and «Без срока»; a date after the end is kept and warned. */
export function dueEditor(anchor,{value=null,today,sprintEnd=null,onPick}){
  const start=validDay(value)?value:today;let year=Number(start.slice(0,4)),month=Number(start.slice(5,7))-1;
  let focusDay=start;
  const late=day=>!!sprintEnd&&day>sprintEnd;
  const note=day=>day&&late(day)?`<span class="pl-warning">${esc(shortDate(day,today))} — позже конца спринта.</span> Сохраним и отметим срок янтарным, спринт не сдвигается.`:sprintEnd?`Спринт заканчивается ${esc(shortDate(sprintEnd,today))}.`:'';
  const grid=()=>{
    const first=new Date(Date.UTC(year,month,1)),offset=(first.getUTCDay()+6)%7,cells=[];
    const origin=addDays(first.toISOString().slice(0,10),-offset);
    for(let i=0;i<42;i++){
      const day=addDays(origin,i),inMonth=Number(day.slice(5,7))-1===month;
      const classes=['pl-day',inMonth?'':'is-outside',day===today?'is-today':'',day===value?'is-selected':'',late(day)?'is-late':'',day===sprintEnd?'is-end':''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${classes}" data-day="${day}" tabindex="${day===focusDay?0:-1}" aria-label="${esc(shortDate(day,'0000'))}${day===sprintEnd?', конец спринта':''}${day===today?', сегодня':''}" aria-pressed="${day===value}">${Number(day.slice(8))}</button>`);
    }
    return cells.join('');
  };
  const html=()=>`<div class="pl-cal-head"><button type="button" class="iq-btn ghost sm icon" data-month="-1" aria-label="Предыдущий месяц">${icon('left',16)}</button><b>${esc(monthTitle(year,month))}</b><button type="button" class="iq-btn ghost sm icon" data-month="1" aria-label="Следующий месяц">${icon('chevron',16)}</button></div>
    <div class="pl-cal-week" aria-hidden="true"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>
    <div class="pl-cal-grid" role="group" aria-label="${esc(monthTitle(year,month))}">${grid()}</div>
    <div class="pl-cal-chips"><button type="button" class="pl-chip" data-day="${today}">Сегодня</button>${sprintEnd?`<button type="button" class="pl-chip" data-day="${sprintEnd}">Конец спринта · ${esc(shortDate(sprintEnd,today))}</button>`:''}${value?'<button type="button" class="pl-chip" data-clear>Без срока</button>':''}</div>
    <p class="pl-cal-note" data-note>${note(value)}</p>`;
  return openPopover(anchor,{className:'pl-cal',label:'Срок',align:'end',html:html(),onMount(el,{close}){
    const render=()=>{el.innerHTML=html();el.querySelector(`[data-day="${focusDay}"]`)?.focus({preventScroll:true});};
    const pick=async day=>{try{await onPick(day);close(true);}catch(error){el.querySelector('[data-note]').textContent=error.message;}};
    el.querySelector(`.pl-cal-grid [data-day="${focusDay}"]`)?.focus({preventScroll:true});
    el.addEventListener('click',event=>{
      const shift=event.target.closest('[data-month]');
      if(shift){month+=Number(shift.dataset.month);if(month<0){month=11;year--;}if(month>11){month=0;year++;}focusDay=`${year}-${String(month+1).padStart(2,'0')}-01`;render();return;}
      if(event.target.closest('[data-clear]')){void pick(null);return;}
      const day=event.target.closest('[data-day]');if(day)void pick(day.dataset.day);
    });
    el.addEventListener('pointerover',event=>{const day=event.target.closest('.pl-day');if(day)el.querySelector('[data-note]').innerHTML=note(day.dataset.day)||note(value);});
    el.addEventListener('keydown',event=>{
      const day=event.target.closest('.pl-day');if(!day)return;
      const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
      if(step||event.key==='PageUp'||event.key==='PageDown'){
        event.preventDefault();focusDay=step?addDays(day.dataset.day,step):addDays(day.dataset.day,event.key==='PageUp'?-30:30);
        year=Number(focusDay.slice(0,4));month=Number(focusDay.slice(5,7))-1;render();
        el.querySelector('[data-note]').innerHTML=note(focusDay)||note(value);
      }
    });
  }});
}

const goalField=value=>ui.field('Цель — одной фразой, необязательно',value||'',{name:'goal',max:240});
const readGoal=form=>form.querySelector('[name=goal]')?.value.trim()||null;

/** A new sprint or release in one step: name, dates (or a deadline) and a goal. */
export function containerDialog({kind,containers,today,days=14,value=null,onSubmit}){
  registerCore();
  const sprint=kind==='sprint',editing=!!value;
  const dates=sprint?(value?{start:value.start,end:value.end}:nextSprintDates(containers,today,days)):null;
  const name=value?.name||(sprint?nextSprintName(containers):'');
  const body=`${ui.field(sprint?'Название спринта':'Название релиза',name,{name:'name',required:true,max:100})}
    ${sprint?`<div class="grid-2"><iq-date-field name="start" label="Начало" required value="${esc(dates.start)}"></iq-date-field><iq-date-field name="end" label="Окончание" required value="${esc(dates.end)}"></iq-date-field></div>`
      :`<iq-date-field name="deadline" label="Срок релиза — необязательно" value="${esc(value?.deadline||'')}"></iq-date-field>`}
    ${goalField(value?.goal)}`;
  return formDialog({title:editing?(sprint?'Даты и цель спринта':'Срок и цель релиза'):sprint?'Новый спринт':'Новый релиз',body,submitLabel:editing?'Сохранить':sprint?'Создать спринт':'Создать релиз',
    submit:async form=>{
      const nameValue=form.querySelector('[name=name]').value.trim();if(!nameValue)throw Error(sprint?'Введите название спринта.':'Введите название релиза.');
      let values;
      if(sprint){
        const start=form.querySelector('[name=start]').value,end=form.querySelector('[name=end]').value;
        if(!start||!end)throw Error('У спринта есть начало и окончание.');if(start>end)throw Error('Окончание не может быть раньше начала.');
        values={name:nameValue,format:'timeboxed',start,end,deadline:value?.deadline??null,goal:readGoal(form)};
      }else values={name:nameValue,format:'flexible',start:value?.start??null,end:value?.end??null,deadline:form.querySelector('[name=deadline]').value||null,goal:readGoal(form)};
      await onSubmit(values);
    }});
}

/**
 * «Завершить спринт»: three numbers and one choice, where unfinished work goes (the next sprint or the backlog), with
 * exceptions task by task. Done work is accepted and the sprint's snapshot goes to «Завершённые».
 */
export function completionDialog({container,containers,format,today,onSubmit}){
  registerCore();
  const sprint=container.kind==='sprint',facts=completionFacts(container,format),next=nextSprint(containers,container.id);
  const open=container.rows.filter(row=>row.kind!=='epic'&&!row.done);
  const destinations=[...containers.filter(c=>c.id!==container.id&&c.kind!=='backlog').map(c=>({value:c.id,label:c.name})),{value:'backlog',label:'Бэклог'}];
  const size=(count,hours)=>`${count} ${plural(count,'задача','задачи','задач')}${hours?`, ${hours}`:''}`;
  const points=format==='points',nextSum=next?(points?next.summary.estimatePoints:next.summary.estimateHours):0,leftSum=points?container.summary.remainingPoints:container.summary.remainingHours;
  const grow=next?`Станет ${size(next.summary.total+facts.open,formatSum(nextSum+leftSum,format))}. Эпики переедут с незавершёнными подзадачами.`:'';
  const options=[...(next?[{value:next.id,label:`В ${next.name}`,description:grow}]:[]),{value:'backlog',label:'В бэклог',description:next?`${next.name} останется как есть — ${size(next.summary.total,formatSum(nextSum,format))}.`:'Задачи вернутся в бэклог, их можно будет разложить по спринтам позже.'}];
  const exceptions=open.map(row=>`<label class="pl-exception"><span class="pl-exception-title">${esc(row.title)}</span><select class="pl-exception-select" data-exception="${esc(row.id)}" aria-label="Куда: ${esc(row.title)}"><option value="">Как все</option>${destinations.map(d=>`<option value="${esc(d.value)}">${esc(d.label)}</option>`).join('')}</select></label>`).join('');
  const goal=container.goal?` · цель — ${esc(container.goal)}`:'';
  const body=`<p class="pl-complete-when">${esc(dateRange(container.start,container.end,today))}${goal}</p>
    <div class="pl-facts"><div><b>${facts.done}</b>готово · примем</div><div><b>${facts.open}</b>не готово${facts.remaining?` · ${esc(facts.remaining)}`:''}</div><div><b>${sprint?facts.late:container.summary.noDue}</b>${sprint?'срок за спринтом':'без срока'}</div></div>
    ${facts.open?`<section data-common>${ui.radioGroup('Незавершённые задачи','destination',options,next?next.id:'backlog')}${exceptions?'<button type="button" class="pl-text-link" data-exceptions>Решить по каждой задаче</button>':''}</section>
    <section data-each hidden><p class="pl-complete-help">Задача без отдельного выбора поедет туда же, куда все.</p><div class="pl-exceptions">${exceptions}</div><button type="button" class="pl-text-link" data-common-back>Вернуться к общему выбору</button></section>`:'<p>Все задачи спринта готовы.</p>'}
    <p class="pl-complete-help">Снимок состава сохранится в «Завершённые». Ничего не удаляется.</p>`;
  return formDialog({title:`Завершить ${container.name.replace(/^Спринт/,'спринт').replace(/^Релиз/,'релиз')}`,body,submitLabel:sprint?'Завершить спринт':'Завершить релиз',
    onMount:form=>{
      form.addEventListener('click',event=>{
        if(event.target.closest('[data-exceptions]')){form.querySelector('[data-each]').hidden=false;form.querySelector('[data-common] [data-exceptions]').hidden=true;form.querySelector('[data-each] select')?.focus();}
        if(event.target.closest('[data-common-back]')){form.querySelector('[data-each]').hidden=true;form.querySelector('[data-common] [data-exceptions]').hidden=false;}
      });
    },
    submit:async form=>{
      const destination=form.querySelector('[name=destination]:checked')?.value||'backlog',overrides={};
      for(const select of form.querySelectorAll('[data-exception]'))if(select.value&&select.value!==destination)overrides[select.dataset.exception]=select.value;
      await onSubmit({kind:'close',groupId:container.id,acceptAllCandidates:true,destinationId:destination,destinations:overrides});
    }});
}

/** Finished sprints and releases, newest first, each with what it accepted. */
export function completedDialog({releases,today}){
  registerCore();
  const items=releases.filter(r=>['closed','cancelled'].includes(r.lifecycle)&&!r.archivedAt)
    .sort((a,b)=>String(b.plannedEnd||b.deadline||'').localeCompare(String(a.plannedEnd||a.deadline||'')));
  const rows=items.map(r=>{
    const when=r.format==='timeboxed'?dateRange(r.plannedStart,r.plannedEnd,today):r.deadline?`к ${shortDate(r.deadline,today)}`:'';
    const fact=r.lifecycle==='cancelled'?'отменён':`принято ${r.counts?.accepted??0} из ${r.counts?.total??0}`;
    return `<div class="pl-done-item" role="listitem"><b>${esc(r.name)}</b><span>${esc([when,fact].filter(Boolean).join(' · '))}</span></div>`;
  }).join('');
  return formDialog({title:'Завершённые спринты и релизы',body:items.length?`<div class="pl-done-list" role="list">${rows}</div>`:'<p>Завершённых пока нет.</p>'});
}

/** «Отменить спринт»: nothing is deleted; unfinished work returns to the backlog. */
export function cancelDialog({container,onSubmit}){
  registerCore();
  const sprint=container.kind==='sprint';
  return formDialog({title:sprint?'Отменить спринт':'Отменить релиз',submitLabel:sprint?'Отменить спринт':'Отменить релиз',
    body:`<p>${esc(container.name)} закроется без принятия результатов. Задачи вернутся в бэклог, ничего не удаляется.</p>`,
    submit:async()=>onSubmit({kind:'cancel',groupId:container.id,destinationId:'backlog',destinations:{}})});
}
export {whenLabel,daysBetween};
