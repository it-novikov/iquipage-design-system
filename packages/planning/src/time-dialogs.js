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
