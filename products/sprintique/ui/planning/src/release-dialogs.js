import {ui, escapeHTML as esc} from '@iquipage/web/core';
import {formDialog} from './dialog.js';
import {PlanningOperation} from './operation.js';

/** Configuration and preview share a dialog: back preserves the user's inputs. */
export function intentDialog({adapter, projectId, title, body, readIntent, mount, onCommitted=()=>{}, onClose=()=>{}}) {
  let modal, operation=null, notified=false;
  const render=()=>{
    if(!modal)return;
    const preview=operation?.preview, stage=operation?.state||'config';
    const content=modal.form.querySelector('[data-plan-preview]'),config=modal.form.querySelector('[data-plan-config]');
    const button=modal.form.querySelector('[data-pn-submit]'),back=modal.form.querySelector('[data-plan-back]');
    config.hidden=stage!=='config';content.hidden=stage==='config';
    modal.setBusy(['loading','submitting','checking'].includes(stage));
    back.hidden=stage==='config';back.disabled=operation?!operation.canClose():false;
    button.textContent=stage==='config'?'Проверить изменения':stage==='submitting'?'Сохраняем…':stage==='uncertain'?'Проверить результат':'Подтвердить';
    button.disabled=['loading','submitting','checking','committed','failed','stale'].includes(stage)||Boolean(preview?.blockers.length);
    content.innerHTML=preview?`<p>${esc(preview.summary)}</p>${preview.changes.length?`<div class="iq-table-wrap"><table class="iq-table"><caption class="sr-only">Последствия</caption><thead><tr><th>Объект</th><th>Изменение</th></tr></thead><tbody>${preview.changes.map(c=>`<tr><td>${esc(c.label)}</td><td>${esc(c.description)}</td></tr>`).join('')}</tbody></table></div>`:''}${preview.moreChanges?`<p class="iq-helper">Ещё изменений: ${preview.moreChanges}. Подтверждается весь указанный состав.</p>`:''}${preview.blockers.map(b=>ui.alert('Нужно уточнение',esc(b),'warning')).join('')}`:'<p role="status">Проверяем последствия…</p>';
    if(stage==='uncertain')content.insertAdjacentHTML('beforeend',ui.alert('Ответ не получен','Изменение могло сохраниться. Сначала проверим результат, повторять действие не будем.','warning'));
    modal.fail(operation?.error||'');
    if(stage==='committed'&&!notified){notified=true;Promise.resolve(onCommitted(operation.result)).then(()=>{modal.setBusy(false);modal.close();}).catch(error=>{modal.fail('Изменение сохранено, но представление не обновилось: '+error.message);modal.setBusy(false);});}
  };
  modal=formDialog({title,body:`<section data-plan-config>${body}</section><section data-plan-preview hidden></section>${ui.btn('Назад к параметрам','ghost sm','left','data-plan-back hidden')}`,submitLabel:'Проверить изменения',
    canClose:()=>!operation||operation.canClose(),canSubmit:()=>!operation||operation.state==='uncertain'||operation.state==='ready'&&!operation.preview?.blockers.length,
    submit:async form=>{
      if(!operation){const intent=await readIntent(form);operation=new PlanningOperation(adapter,projectId,render);await operation.inspect(intent);}
      else if(operation.state==='uncertain')await operation.recover();
      else if(operation.state==='ready')await operation.submit();
      queueMicrotask(render);return false;
    },onMount:form=>{
      form.querySelector('[data-plan-back]').addEventListener('click',()=>{if(operation?.canClose()){operation.destroy();operation=null;notified=false;render();}});
      mount?.(form);
    },onClose:()=>{operation?.destroy();onClose();}});
  render();return modal;
}
const formats=[{value:'flexible',label:'Гибкий релиз',description:'Даты не обязательны: релиз закрывают, когда работа готова.'},{value:'timeboxed',label:'Спринт',description:'Фиксированный период с началом и окончанием.'}];
/** Two mutually exclusive formats read best as a visible choice, not a hidden list. */
const formatChoice=(label,value)=>ui.radioGroup(label,'format',formats,value==='timeboxed'?'timeboxed':'flexible');
const readFormat=form=>form.querySelector('[name=format]:checked')?.value||'flexible';
/** IANA time zones from the browser, searchable; the current value is always offered. */
export function timeZoneField(name,label,value){
  const zones=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):[];
  const all=[...new Set([value||'UTC','UTC',...zones])].map(zone=>({value:zone,label:zone.replaceAll('_',' ')}));
  return `<iq-combobox name="${esc(name)}" label="${esc(label)}" value="${esc(value||'UTC')}" options="${esc(JSON.stringify(all))}" placeholder="Например, Europe/Moscow"></iq-combobox>`;
}
export async function settingsDialog({adapter,projectId,onCommitted,onClose}) {
  const settings=await adapter.settings({projectId});
  const body=[
    formatChoice('Формат новых релизов',settings.format),
    ui.field('Предлагаемая длительность спринта, дней',String(settings.days||14),{name:'days',type:'number'}),
    ui.check(`Как в пространстве: ${esc(settings.workspaceTimeZone||settings.timeZone||'UTC')}`,!!settings.timeZoneInherited,'name="inheritTimeZone"'),
    timeZoneField('timeZone','Часовой пояс проекта',settings.timeZone||'UTC'),
    ui.radioGroup('Оценки задач','estimateFormat',[{value:'time',label:'Время',description:'Часы, дни и недели. Суммы считаются в часах.'},{value:'points',label:'Story points',description:'Условные очки сложности, без перевода во время.'}],settings.estimateFormat==='points'?'points':'time'),
    `<div class="grid-2" data-working-time>${ui.field('Рабочий день, часов',String(settings.hoursPerDay||8),{name:'hoursPerDay',type:'number'})}${ui.field('Рабочая неделя, часов',String(settings.hoursPerWeek||40),{name:'hoursPerWeek',type:'number'})}</div>`,
    '<p class="iq-helper">Настройки предлагают начальные значения. Даты существующих релизов и их история не изменятся. Следующий период не создаётся автоматически. Смена формата оценок не пересчитывает уже введённые: оценки в другом формате отмечаются в задаче и не входят в суммы.</p>'
  ].join('');
  return intentDialog({adapter,projectId,title:'Как планируем работу',body,
    readIntent:form=>{const inherit=form.querySelector('[name=inheritTimeZone]').checked;
      const estimateFormat=form.querySelector('[name=estimateFormat]:checked')?.value==='points'?'points':'time';
      const hours=(name,max)=>{const value=Number(form.querySelector(`[name=${name}]`).value);if(!Number.isInteger(value)||value<1||value>max)throw Error(name==='hoursPerDay'?'Рабочий день — от 1 до 24 часов.':'Рабочая неделя — от 1 до 168 часов.');return value;};
      return {kind:'settings',values:{format:readFormat(form),days:Number(form.querySelector('[name=days]').value),timeZone:inherit?String(settings.workspaceTimeZone||settings.timeZone||'UTC'):String(form.querySelector('iq-combobox[name=timeZone]').value||'UTC').trim(),inheritTimeZone:inherit,
        estimateFormat,hoursPerDay:hours('hoursPerDay',24),hoursPerWeek:hours('hoursPerWeek',168)}};},
    // The project's own zone is chosen only when it does not follow the workspace.
    mount:form=>{const inherit=form.querySelector('[name=inheritTimeZone]'),zone=form.querySelector('iq-combobox[name=timeZone]'),time=form.querySelector('[data-working-time]');
      const sync=()=>{zone.hidden=inherit.checked;time.hidden=form.querySelector('[name=estimateFormat]:checked')?.value==='points';};
      form.addEventListener('change',sync);sync();},
    onCommitted,onClose});
}
