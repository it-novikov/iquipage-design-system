import {escapeHTML as esc} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {formDialog} from './dialog.js';
import {PlanningOperation} from './operation.js';

/** Single-field editing with the same versioned preview/commit/receipt contract. */
export function quickFieldDialog({adapter,projectId,row,field,revision,onChanged,onClose}) {
  if(!['owner','due'].includes(field)||!row.selectable||row.contextOnly)throw Error('Поле недоступно.');
  registerAdvanced();
  const previousFocus=document.activeElement?.getAttribute('data-focus');
  let modal;
  const operation=new PlanningOperation(adapter,projectId,state=> {
    if(!modal)return;
    const uncertain=state.state==='uncertain';
    const busy=['loading','submitting','checking'].includes(state.state);
    modal.setBusy(busy);
    modal.form.querySelector('[data-pn-submit]').hidden=uncertain;
    modal.form.querySelector('[data-field-recover]').hidden=!uncertain;
    modal.form.querySelector('fieldset').disabled=busy||uncertain||state.state==='committed';
    if(uncertain)modal.fail('Ответ не получен. Изменение могло сохраниться. Проверяем результат без повторной записи.');
  });
  const control=field==='owner'
    ? '<iq-remote-combobox label="Исполнитель" placeholder="Не назначен" data-value></iq-remote-combobox>'
    : `<iq-date-field label="Срок" data-value value="${esc(row.dueValue||'')}"></iq-date-field>`;
  const help=field==='owner'?'Пустое значение снимает назначение.':'Пустая дата снимает срок. Плановый интервал не меняется.';
  modal=formDialog({
    title:field==='owner'?'Исполнитель задачи':'Срок задачи',
    body:`<p>${esc(row.key)} — ${esc(row.title)}</p><fieldset class="pn-single-field">${control}</fieldset><p class="iq-helper">${help}</p><button type="button" class="iq-btn secondary sm" data-field-recover hidden>Проверить результат</button>`,
    submitLabel:'Сохранить',canClose:()=>operation.canClose(),
    onMount:form=> {
      form.querySelector('[data-field-recover]').addEventListener('click',async()=>{
        await operation.recover();
        if(operation.state!=='committed')return;
        try { await onChanged(operation.result); modal.close(); }
        catch { modal.fail('Изменение сохранено. Обновите список после закрытия.'); }
      });
      if(field!=='owner')return;
      const picker=form.querySelector('[data-value]');
      picker.provider=q=>adapter.options({projectId,kind:'owner',...q});
      picker.value=row.ownerId||'';
    },
    submit:async form=> {
      if(operation.state==='uncertain')await operation.recover();
      else if(operation.state!=='committed') {
        const raw=form.querySelector('[data-value]').value||null;
        const value=field==='owner'?(raw==='__none__'?'':raw||''):raw;
        await operation.inspect({kind:'bulk',taskIds:[row.taskId],field,value,expectedProjectionRevision:revision});
        if(operation.state!=='ready')throw Error(operation.error||'Не удалось проверить изменение.');
        if(operation.preview.blockers.length)throw Error(operation.preview.blockers.join(' '));
        await operation.submit();
      }
      if(operation.state==='committed') {
        try { await onChanged(operation.result); }
        catch { throw Error('Изменение сохранено, но список пока не обновлён. Закройте окно и обновите список; повторная запись не требуется.'); }
        return true;
      }
      if(operation.state==='uncertain')return false;
      throw Error(operation.error||'Изменение не сохранено.');
    },
    onClose:()=>{operation.destroy();onClose();if(previousFocus)requestAnimationFrame(()=>document.querySelector('[data-focus="'+CSS.escape(previousFocus)+'"]')?.focus({preventScroll:true}));}
  });
  return modal;
}
