import {requireValue} from './common.js';
import {button,esc,date} from './ui.js';
const labels={pending:'Ожидает доставки',retry:'Повтор запланирован',dead:'Доставка остановлена',delivered:'Передано исполнителю',dismissed:'Закрыто без повтора'};
const eventNames={'map.updated':'Карта изменена','session.archived':'Обсуждение завершено','task.status_changed':'Статус задачи изменён'};
const reasons={RULE_CHANGED:'Правило приостановлено или изменено',MAP_ARCHIVED_OR_MISSING:'Карта в архиве или недоступна',DELIVERY_NOT_PENDING:'Событие уже обработано',EVENT_NOT_MATCHED:'Событие не соответствует правилу'};
export async function showDeliveries(feature){
  requireValue(feature.repository.capabilities?.transactionalEvents&&feature.repository.request,'EVENTS_NOT_CONNECTED','Журнал доставки не подключён.');
  const projectId=feature.project.id,mapId=feature.current.id;
  const records=await feature.repository.request(`/event-deliveries?projectId=${encodeURIComponent(projectId)}&mapId=${encodeURIComponent(mapId)}`);
  if(feature.current?.id!==mapId)return;
  const rows=records.map(r=>`<article class="map-delivery"><header><b>${esc(eventNames[r.type]||r.type)}</b><span class="iq-badge ${r.status==='dead'?'danger':'outline'}">${esc(labels[r.status]||r.status)}</span></header><p class="map-explanation">${date(r.createdAt)} · Версия записи ${r.recordRevision}</p><p>Попыток доставки: ${r.totalAttempts}. Ручных повторов: ${r.manualRetries}.</p>${r.nextAttemptAt?`<p class="map-explanation">Следующая попытка: ${date(new Date(r.nextAttemptAt).toISOString())}</p>`:''}${r.lastError?`<p class="map-form-error">Причина: ${esc(r.lastError)}</p>`:''}${r.outcomes.map(o=>o.runId?button('run-details','Открыть запуск','arrow','secondary',`data-run-id="${esc(o.runId)}"`):`<p class="map-explanation">${esc(reasons[o.reason]||o.reason)}</p>`).join('')}${r.status==='dead'&&feature.permissions.manageAutomation?`<div class="map-form-actions">${button('retry-delivery','Повторить доставку','refresh','secondary',`data-delivery-id="${esc(r.id)}" data-revision="${r.revision}" ${r.manualRetries>=3||r.lastError==='SNAPSHOT_MISSING'?'disabled':''}`)}${button('dismiss-delivery','Закрыть событие','x','ghost',`data-delivery-id="${esc(r.id)}" data-revision="${r.revision}"`)}</div>`:''}</article>`).join('');
  feature.openPanel('deliveries','Доставка событий',`<p class="map-explanation">Передача события исполнителю не означает завершение сценария. Результат и подтверждения находятся в запуске.</p>${button('deliveries','Обновить журнал','refresh','secondary')}${rows||'<p class="map-empty-copy">Событий пока нет. Измените карту с включённым правилом или завершите обсуждение.</p>'}<p class="map-explanation">После пяти неудачных попыток доставка останавливается. Хранятся ожидающие события и последние 500 результатов доставки этого стенда.</p>`);
}
export function recoverDelivery(feature,control,action){
  requireValue(feature.permissions.manageAutomation&&feature.repository.request,'PERMISSION','Управление доставкой недоступно.');
  const id=control.dataset.deliveryId,baseRevision=Number(control.dataset.revision),projectId=feature.project.id;
  feature.dialog({title:action==='retry'?'Повторить доставку?':'Закрыть событие?',description:action==='retry'?'Будут использованы сохранённые входные данные и версия правила. Повтор не создаёт копию уже существующего запуска.':'Событие больше не доставляется. История и уже созданные задачи останутся.',body:'<p class="map-explanation">Это действие не подтверждает выполнение задач и не отменяет внешние результаты.</p>',submitLabel:action==='retry'?'Повторить доставку':'Закрыть событие',onSubmit:async()=>{
    requireValue(feature.permissions.manageAutomation,'PERMISSION','Право управления изменилось.');
    await feature.repository.request(`/event-deliveries/${encodeURIComponent(id)}/${action}`,{method:'POST',body:{projectId,baseRevision}});
    await showDeliveries(feature);
  }});
}
