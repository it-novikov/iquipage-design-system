import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {intentDialog} from './release-dialogs.js';
import {interval} from './date-value.js';

export function scheduleDialog({adapter,projectId,row,onCommitted,onClose}) {
  const body = [
    `<h3>${esc(row.title)}</h3>`,
    `<iq-date-field data-start label="Плановое начало" value="${esc(row.start||'')}"></iq-date-field>`,
    `<iq-date-field data-end label="Плановое окончание" value="${esc(row.end||'')}"></iq-date-field>`,
    `<iq-date-field data-deadline label="Обязательный дедлайн" value="${esc(row.deadline||'')}"></iq-date-field>`,
    '<p class="iq-helper">Изменение плана не сдвигает дедлайн или зависимые задачи автоматически.</p>'
  ].join('');
  return intentDialog({adapter,projectId,title:'Даты и обязательства',body,
    readIntent:form=>({kind:'schedule',entityKind:row.entityKind,entityId:row.entityId,
      values:{...interval(form.querySelector('[data-start]').value,form.querySelector('[data-end]').value),deadline:form.querySelector('[data-deadline]').value||null}}),
    onCommitted,onClose});
}

export function milestoneDialog({adapter,projectId,row=null,onCommitted,onClose}) {
  registerAdvanced();
  const body=ui.field('Результат вехи',row?.title||'',{name:'title',required:true,max:240})
    +`<iq-date-field data-date label="Дата вехи" value="${esc(row?.start||'')}"></iq-date-field>`
    +'<iq-remote-combobox data-release label="Релиз — необязательно" placeholder="Веха проекта"></iq-remote-combobox>'
    +'<p class="iq-helper">Веха обозначает значимый результат, а не создаёт новую задачу.</p>';
  return intentDialog({adapter,projectId,title:row?'Изменить веху':'Новая веха',body,
    mount:form=>{const picker=form.querySelector('[data-release]');picker.provider=q=>adapter.destinations({projectId,...q});picker.value=row?.releaseId||'';},
    readIntent:form=>{
      const date=form.querySelector('[data-date]').value;if(!date)throw Error('Укажите дату вехи.');
      const target=form.querySelector('[data-release]').value;
      return {kind:'milestone',...(row?{entityId:row.entityId}:{}),values:{title:form.querySelector('[name=title]').value.trim(),date,releaseId:target&&target!=='backlog'?target:null}};
    },onCommitted,onClose});
}

export function dependencyDialog({adapter,projectId,onCommitted,onClose,edge=null,records=[]}) {
  registerAdvanced();
  const kinds=[{value:'FS',label:'Начать после завершения'},{value:'SS',label:'Начать после начала'},{value:'FF',label:'Завершить после завершения'},{value:'SF',label:'Завершить после начала'}];
  const body='<iq-remote-combobox data-from label="Предшествующая задача" placeholder="Найти задачу"></iq-remote-combobox>'
    +'<iq-remote-combobox data-to label="Зависимая задача" placeholder="Найти задачу"></iq-remote-combobox>'
    +ui.select('Календарное условие',kinds,`data-type value="${esc(edge?.type||'FS')}"`)
    +ui.field('Смещение в днях',String(edge?.lagDays||0),{name:'lag',type:'number'})
    +'<p class="iq-helper">Условие связано с зависимостью задач. Конфликты дат показываются в плане; сроки не пересчитываются автоматически.</p>';
  return intentDialog({adapter,projectId,title:edge?'Изменить зависимость':'Новая зависимость',body,
    mount:form=>{
      for(const p of form.querySelectorAll('iq-remote-combobox'))p.provider=q=>adapter.options({projectId,kind:'tasks',...q});
      if(edge){form.querySelector('[data-from]').value=records.find(r=>r.id===edge.from)?.entityId||'';form.querySelector('[data-to]').value=records.find(r=>r.id===edge.to)?.entityId||'';}
    },
    readIntent:form=>{const fromId=form.querySelector('[data-from]').value,toId=form.querySelector('[data-to]').value;
      if(!fromId||!toId)throw Error('Выберите обе задачи.');
      return {kind:'temporal',...(edge?{entityId:edge.id}:{}),values:{fromId,toId,type:form.querySelector('[data-type]').value,lagDays:Number(form.querySelector('[name=lag]').value)}};
    },onCommitted,onClose});
}
export function shiftDatesDialog({adapter,projectId,groupId,onCommitted,onClose}) {
  return intentDialog({adapter,projectId,title:'Сдвинуть планы задач',body:ui.field('Количество дней','1',{name:'days',type:'number'})+'<p class="iq-helper">Сдвигаются только заданные интервалы открытых задач этого релиза. Дедлайны, принятые результаты и задачи без дат остаются без изменений.</p>',
    readIntent:form=>({kind:'shiftDates',groupId,days:Number(form.querySelector('[name=days]').value)}),onCommitted,onClose});
}
