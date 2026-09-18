import {registerAdvanced} from '@iquipage/web/advanced';
import {intentDialog} from './release-dialogs.js';
/** Single-pointer alternative to dragging; uses the same guarded reorder command. */
export function orderDialog({adapter,projectId,taskId,onCommitted,onClose}){
  registerAdvanced();
  return intentDialog({adapter,projectId,title:'Порядок задач',body:'<iq-remote-combobox data-position label="Положение в списке" placeholder="Выберите задачу или конец списка"></iq-remote-combobox><p class="iq-helper">Меняется порядок планирования среди задач одного родителя. Приоритет, рабочий статус и родитель сохраняются.</p>',
    mount:form=>{form.querySelector('[data-position]').provider=q=>adapter.options({projectId,kind:'positions',taskId,...q});},
    readIntent:form=>{const value=form.querySelector('[data-position]').value;if(!value)throw Error('Выберите позицию.');return {kind:'reorder',taskIds:[taskId],beforeId:value==='__end__'?null:value};},
    onCommitted,onClose});
}
