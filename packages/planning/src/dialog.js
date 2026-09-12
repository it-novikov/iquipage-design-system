import {registerCore, ui, icon, escapeHTML as esc} from '@iquipage/web/core';
import {PlanningOperation} from './operation.js';
/** Native form inside the documented DS dialog composition; no private component access. */
export function formDialog({title,body,submitLabel='',submit,onMount,onClose=()=>{},canClose=()=>true,canSubmit=()=>true}) {
  registerCore(); const host=document.createElement('iq-dialog');host.setAttribute('persistent','');
  host.className='pn-dialog';host.innerHTML=`<dialog class="iq-dialog"><form class="pn-dialog-form"><header class="iq-dialog-head"><div><h2>${esc(title)}</h2></div>${ui.ib('x','Закрыть','ghost sm','data-pn-cancel')}</header><div class="pn-dialog-body">${body}</div><p class="iq-helper error" role="alert" data-error hidden></p><footer class="iq-dialog-footer">${ui.btn('Отмена','secondary sm','','data-pn-cancel')}${submitLabel?`<button type="submit" class="iq-btn primary sm" data-pn-submit>${esc(submitLabel)}</button>`:''}</footer></form></dialog>`;
  let busy=false,closing=false; const form=host.querySelector('form');
  const close=()=>{if(busy || closing || !canClose())return false;closing=true;host.close(true);return true;};
  const setBusy=value=>{busy=value;form.querySelectorAll('button[data-pn-cancel]').forEach(b=>b.disabled=value||!canClose());const submitButton=form.querySelector('[data-pn-submit]');if(submitButton)submitButton.disabled=value||!canSubmit();form.setAttribute('aria-busy',String(value));};
  const fail=message=>{const el=form.querySelector('[data-error]');el.hidden=!message;el.textContent=message||'';};
  form.addEventListener('click',e=>{if(e.target.closest('[data-pn-cancel]'))close();});
  host.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.target.closest('iq-select,iq-combobox,iq-remote-combobox,iq-date-field')){e.preventDefault();e.stopPropagation();close();}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!submit)return;fail('');setBusy(true);
    try{const keep=await submit(form,{fail,setBusy,close});setBusy(!canClose());if(keep!==false)close();}
    catch(error){fail(error.message||'Изменение не сохранено.');setBusy(!canClose());}
  });
  host.addEventListener('iq-close',()=>{onClose();host.remove();},{once:true});
  document.body.append(host);onMount?.(form,{setBusy,fail,close});host.show();
  host.querySelector('[data-pn-cancel]')?.focus({preventScroll:true});
  return {element:host,form,close,setBusy,fail,get busy(){return busy;}};
}
export function operationDialog({adapter,projectId,intent,title,onCommitted=()=>{},onClose=()=>{}}) {
  let modal,notified=false;
  const operation=new PlanningOperation(adapter,projectId,state=>render(state));
  modal=formDialog({title,body:'<div data-preview role="status">Проверяем последствия…</div>',submitLabel:'Подтвердить',
    submit:async()=>{await operation.submit();return false;},canClose:()=>operation.canClose(),canSubmit:()=>operation.state==='ready'&&!operation.preview?.blockers.length,onClose:()=>{operation.destroy();onClose();}});
  const content=modal.form.querySelector('[data-preview]'),button=modal.form.querySelector('[data-pn-submit]');
  function render(state) {
    if(!modal)return;
    const pending=['loading','submitting','checking'].includes(state.state),uncertain=state.state==='uncertain';
    modal.setBusy(!state.canClose());
    button.disabled=state.state!=='ready'||Boolean(state.preview?.blockers.length);
    button.textContent=state.state==='submitting'?'Сохраняем…':'Подтвердить';
    const p=state.preview;
    content.innerHTML=p?`<p>${esc(p.summary)}</p>${p.changes.length?`<div class="iq-table-wrap"><table class="iq-table"><caption class="sr-only">Последствия операции</caption><thead><tr><th>Задача</th><th>Изменение</th></tr></thead><tbody>${p.changes.map(change=>`<tr><td>${esc(change.label)}</td><td>${esc(change.description)}</td></tr>`).join('')}</tbody></table></div>`:''}${p.moreChanges?`<p class="iq-helper">Ещё затронутых задач: ${Number(p.moreChanges)}. Итоговый объём указан в подтверждении.</p>`:''}${p.blockers.map(message=>ui.alert('Нужно уточнение',esc(message),'warning')).join('')}`:'<p>Проверяем состав и доступные действия…</p>';
    modal.fail(state.error);
    if(['failed','stale'].includes(state.state))content.insertAdjacentHTML('beforeend',ui.btn('Проверить снова','secondary sm','refresh','data-reinspect'));
    if(uncertain){content.insertAdjacentHTML('beforeend',ui.alert('Проверяем результат','Запрос мог сохраниться. Не отправляем его повторно, пока результат неизвестен.','warning')+ui.btn('Проверить результат','secondary sm','refresh','data-recover'));}
    content.setAttribute('aria-busy',String(pending));
    if(state.state==='committed'&&!notified){notified=true;Promise.resolve(onCommitted(state.result)).then(()=>{modal.setBusy(false);modal.close();}).catch(error=>{modal.fail('Изменение сохранено, но список не обновлён: '+error.message);modal.setBusy(false);});}
  }
  content.addEventListener('click',e=>{if(e.target.closest('[data-reinspect]'))void operation.inspect(intent);if(e.target.closest('[data-recover]'))void operation.recover();});
  void operation.inspect(intent);
  return {...modal,readyToLeave:()=>operation.canClose(),operation};
}
export async function moveDialog({adapter,projectId,taskIds=[],selection=null,count=taskIds.length,onCommitted,onClose}) {
  const {registerAdvanced}=await import('@iquipage/web/advanced');registerAdvanced();
  let next=null;
  const modal=formDialog({title:'Перенести в релиз',body:`<p>Выбрано задач: ${count}. На следующем шаге покажем последствия для подзадач и активной работы.</p><iq-remote-combobox label="Релиз назначения" placeholder="Найти релиз или выбрать бэклог"></iq-remote-combobox>`,submitLabel:'Проверить перенос',
    submit:async form=>{
      const value=form.querySelector('iq-remote-combobox').value;if(!value)throw Error('Выберите релиз или бэклог.');
      next={kind:'move',...(selection||{taskIds}),groupId:value};return true;
    },onMount:form=>{
      const picker=form.querySelector('iq-remote-combobox');
      picker.provider=({query,cursor,signal})=>adapter.destinations({projectId,query,cursor,signal});
    },onClose:()=>{if(next)operationDialog({adapter,projectId,intent:next,title:'Изменение состава',onCommitted,onClose});else onClose?.();}});
  return modal;
}
