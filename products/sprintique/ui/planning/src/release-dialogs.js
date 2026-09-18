import {ui, escapeHTML as esc} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {formDialog} from './dialog.js';
import {PlanningOperation} from './operation.js';
import {interval, addDays} from './date-value.js';

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
const formats=[{value:'flexible',label:'Гибкий релиз'},{value:'timeboxed',label:'Спринт'}];
export function releaseFields(value={}){
  return `${ui.field('Название релиза',value.title||value.name||'',{name:'name',required:true,max:100})}${ui.select('Формат',formats,`name="format" value="${esc(value.format||'flexible')}"`)}<p class="iq-helper">Гибкий релиз не требует дат. Спринт — тот же пакет работы с границами периода.</p><div class="grid-2"><iq-date-field name="start" label="Плановое начало" value="${esc(value.start||'')}"></iq-date-field><iq-date-field name="end" label="Плановое окончание" value="${esc(value.end||'')}"></iq-date-field></div><iq-date-field name="deadline" label="Обязательный дедлайн — необязательно" value="${esc(value.deadline||'')}"></iq-date-field>`;
}
export function readReleaseFields(form){
  const name=form.querySelector('[name=name]').value.trim();if(!name)throw Error('Введите название релиза.');
  const {start,end}=interval(form.querySelector('[name=start]').value,form.querySelector('[name=end]').value);
  return {name,format:form.querySelector('[name=format]').value,start,end,deadline:form.querySelector('[name=deadline]').value||null};
}
export async function editReleaseDialog({adapter,projectId,groupId,onCommitted,onClose}){
  const value=await adapter.describeRelease({projectId,groupId});
  return intentDialog({adapter,projectId,title:'План релиза',body:releaseFields(value),readIntent:form=>({kind:'editRelease',groupId,values:readReleaseFields(form)}),onCommitted,onClose});
}
export async function closeReleaseDialog({adapter,projectId,groupId,cancel=false,onCommitted,onClose}){
  registerAdvanced();const info=await adapter.describeRelease({projectId,groupId}),settings=adapter.settings?await adapter.settings({projectId}):{days:14};
  const title=cancel?'Отменить релиз':info.format==='timeboxed'?'Завершить спринт':'Завершить релиз';
  const nextStart=info.end?addDays(info.end,1):null,nextEnd=nextStart?addDays(nextStart,(settings.days||14)-1):null;
  let pageSize=30,loading=false;
  const items=()=>`<div class="iq-table-wrap"><table class="iq-table"><caption class="sr-only">Состав и результаты</caption><thead><tr><th>Задача</th><th>Состояние</th></tr></thead><tbody>${info.items.slice(0,pageSize).map(t=>`<tr><td>${esc(t.key)} · ${esc(t.title)}</td><td>${esc(({accepted:'Результат принят',cancelled:'Отменена',candidate:'Готова к принятию',unfinished:'Не завершена'})[t.outcome])}${t.openChildren?`<small class="iq-helper">Открытых подзадач: ${t.openChildren}</small>`:''}</td></tr>`).join('')}</tbody></table></div>${info.items.length>pageSize?ui.btn('Показать ещё состав','ghost sm','down','data-more-close-items'):''}`;
  const body=`<h3>${esc(info.title)}</h3><p>В составе: ${info.counts.total}. Принятых/отменённых результатов: ${info.counts.accepted}. Не завершено: ${info.counts.unfinished}.</p><div data-close-items>${items()}</div><p data-page-error role="alert" hidden></p>
    ${!cancel&&info.counts.candidates?ui.check(`Принять готовые результаты: ${info.counts.candidates}`,false,'data-accept-results'):''}
    <p class="iq-helper">Закрытие не публикует продукт и не завершает оставшиеся задачи. Открытый родитель переносится дальше, принятые результаты детей остаются в истории этого релиза.</p>
    ${ui.select('Незавершённую работу',[{value:'backlog',label:'Вернуть в бэклог'},{value:'existing',label:'Перенести в существующий релиз'},{value:'new',label:'Создать следующий релиз'}],'data-disposition value="backlog"')}
    <section data-destination-existing hidden><iq-remote-combobox data-destination label="Релиз назначения" placeholder="Найти релиз"></iq-remote-combobox></section>
    <section data-destination-new hidden>${releaseFields({title:info.title+' — продолжение',format:info.format,start:info.format==='timeboxed'?nextStart:null,end:info.format==='timeboxed'?nextEnd:null})}</section>
    <details class="iq-accordion"><summary>Распределить задачи отдельно</summary><div><p class="iq-helper">Без отдельного назначения задача следует общему варианту. Здесь можно выбрать исключения.</p>${info.items.filter(t=>!['accepted','cancelled'].includes(t.outcome)).slice(0,100).map(t=>`<iq-remote-combobox data-override="${esc(t.id)}" label="${esc(t.key+' · '+t.title)}" placeholder="По общему правилу"></iq-remote-combobox>`).join('')}${info.counts.total>100?'<p class="iq-helper">Для индивидуального распределения большего состава используйте массовый перенос до завершения.</p>':''}</div></details>`;
  return intentDialog({adapter,projectId,title,body,
    mount:form=>{
      for(const picker of form.querySelectorAll('iq-remote-combobox'))picker.provider=({query,cursor,signal})=>adapter.destinations({projectId,query,cursor,signal,excludeId:groupId});
      const show=()=>{const mode=form.querySelector('[data-disposition]').value;form.querySelector('[data-destination-existing]').hidden=mode!=='existing';form.querySelector('[data-destination-new]').hidden=mode!=='new';};
      form.addEventListener('iq-change',event=>{if(event.target.matches('[data-disposition]'))show();});
      form.addEventListener('click',async e=>{const button=e.target.closest('[data-more-close-items]');if(!button||loading)return;loading=true;button.disabled=true;
        const error=form.querySelector('[data-page-error]');error.hidden=true;
        try{if(pageSize+30>info.items.length&&info.nextCursor){const next=await adapter.describeRelease({projectId,groupId,cursor:info.nextCursor});info.items.push(...next.items);info.nextCursor=next.nextCursor;}
          pageSize+=30;form.querySelector('[data-close-items]').innerHTML=items();
        }catch(e){error.textContent=e.message;error.hidden=false;button.disabled=false;}finally{loading=false;}
      });
      show();
    },
    readIntent:form=>{const mode=form.querySelector('[data-disposition]').value,destinations={};for(const p of form.querySelectorAll('[data-override]'))if(p.value)destinations[p.dataset.override]=p.value;
      const intent={kind:cancel?'cancel':'close',groupId,acceptAllCandidates:!!form.querySelector('[data-accept-results]')?.checked,destinations};
      if(mode==='new')intent.newRelease=readReleaseFields(form.querySelector('[data-destination-new]'));
      else {intent.destinationId=mode==='existing'?form.querySelector('[data-destination]').value:'backlog';if(!intent.destinationId)throw Error('Выберите получателя остатка.');}
      return intent;
    },onCommitted,onClose});
}

/** Read-only release history; bounded rendering even for large snapshots. */
export async function historyDialog({adapter,projectId,groupId,onClose,onOpenTask}) {
  const info=await adapter.describeRelease({projectId,groupId});
  const snapshot=info.snapshot;let shown=40,modal;
  const entries=()=>snapshot.items.slice(0,shown).map(item=>`<tr><td>${esc(item.key)}</td><td>${esc(item.title)}</td><td>${esc(item.outcome==='accepted'?'Принята':item.outcome==='cancelled'?'Отменена':'Перенесена')}</td></tr>`).join('');
  modal=formDialog({title:'Результат релиза',body:snapshot?`<h3>${esc(snapshot.name)}</h3><p>Принятых результатов: ${snapshot.accepted}. Перенесено: ${snapshot.carried}.</p><p class="iq-helper">Это зафиксированный результат. Состав не изменяется при последующем редактировании задач.</p><div class="iq-table-wrap"><table class="iq-table"><thead><tr><th>Номер</th><th>Задача</th><th>Итог</th></tr></thead><tbody data-history-items>${entries()}</tbody></table></div>${ui.btn('Показать ещё','ghost sm','down','data-history-more')}`:'<p>Снимок результата недоступен.</p>',
    onMount:form=>{const more=form.querySelector('[data-history-more]');if(!more)return;more.hidden=shown>=snapshot.items.length&&!info.nextCursor;
      more.addEventListener('click',async()=>{if(more.disabled)return;more.disabled=true;try{
        if(shown+40>snapshot.items.length&&info.nextCursor){const next=await adapter.describeRelease({projectId,groupId,cursor:info.nextCursor});snapshot.items.push(...next.snapshot.items);info.nextCursor=next.nextCursor;}
        shown+=40;form.querySelector('[data-history-items]').innerHTML=entries();more.hidden=shown>=snapshot.items.length&&!info.nextCursor;
      }catch(error){modal.fail(error.message);}finally{more.disabled=false;}});},onClose});
  return modal;
}

export async function settingsDialog({adapter,projectId,onCommitted,onClose}) {
  const settings=await adapter.settings({projectId});
  const body=[
    ui.select('Формат новых релизов',formats,`name="format" value="${esc(settings.format)}"`),
    ui.field('Предлагаемая длительность спринта, дней',String(settings.days||14),{name:'days',type:'number'}),
    ui.field('Часовой пояс проекта',settings.timeZone||'UTC',{name:'timeZone',placeholder:'Например, Europe/Moscow'}),
    '<p class="iq-helper">Настройки предлагают начальные значения. Даты существующих релизов и их история не изменятся. Следующий период не создаётся автоматически.</p>'
  ].join('');
  return intentDialog({adapter,projectId,title:'Как планируем работу',body,
    readIntent:form=>({kind:'settings',values:{format:form.querySelector('[name=format]').value,days:Number(form.querySelector('[name=days]').value),timeZone:form.querySelector('[name=timeZone]').value.trim()}}),
    onCommitted,onClose});
}

export function bulkDialog({adapter,projectId,selection,field,onCommitted,onClose}) {
  registerAdvanced();let body;
  const labels={owner:'Назначить исполнителя',priority:'Изменить приоритет',due:'Изменить срок',tags:'Назначить тег'};
  if(!Object.hasOwn(labels,field))throw Error('Недоступное массовое действие.');
  if(field==='priority')body=ui.select('Приоритет',[{value:'normal',label:'Обычный'},{value:'high',label:'Высокий'},{value:'critical',label:'Критический'},{value:'low',label:'Низкий'}],'data-value value="normal"');
  else if(field==='due')body='<iq-date-field data-value label="Срок задач"></iq-date-field><p class="iq-helper">Пустая дата снимает срок. Плановые интервалы не меняются.</p>';
  else body=`<iq-remote-combobox data-value label="${field==='owner'?'Исполнитель':'Тег'}" placeholder="Найти"></iq-remote-combobox><p class="iq-helper">${field==='owner'?'Пустое значение снимает назначение.':'Новый тег добавляется к существующим.'}</p>`;
  return intentDialog({adapter,projectId,title:labels[field],body,
    mount:form=>{const picker=form.querySelector('iq-remote-combobox');if(picker)picker.provider=({query,cursor,signal})=>adapter.options({projectId,kind:field,query,cursor,signal});},
    readIntent:form=>{
      let value=form.querySelector('[data-value]').value||null;
      if(field==='owner')value=value==='__none__'?'':value||'';
      if(field==='tags'){if(!value)throw Error('Выберите тег.');value=[value];}
      return {kind:'bulk',...selection,field,value};
    },onCommitted,onClose});
}
