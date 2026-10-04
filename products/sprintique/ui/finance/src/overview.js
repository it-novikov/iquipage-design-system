import {ui,escapeHTML as esc,scale} from '@iquipage/web/core';
import {dialog} from '../../src/ui.js';
import {bindCounters} from './dialogs.js';
import {currencyName} from './money.js';
import {money,periodHint,varianceWords,varianceTone,stateSentence,scaleLabel,overdueText,overdueOf,
  containerTitle,categoryRows,shortDate,shortName} from './overview-model.js';
import {FINANCE_LIMITS} from '../../../contracts/finance.ts';

/** Financial comparison: approved baseline, fact, expectations, forecast and explicit next actions. */
export function overviewMarkup(overview,{canManage,timeZone}){
  const blocks=overview.currencies.length?overview.currencies:[{currencyCode:'RUB',income:zero(),expense:zero(),net:{fact:'0',forecast:'0'},overdue:{count:0,income:'0',expense:'0'}}];
  const detail=overview.state.detail;
  const attention=detail&&overview.categories.find(r=>r.categoryId===detail.categoryId&&r.direction===detail.direction&&r.currencyCode===detail.currencyCode);
  const explain=canManage&&attention&&overview.version&&['needs_explanation','explanation_outdated'].includes(attention.status)
    ?`<button class="iq-btn secondary sm" type="button" data-explain="${esc([attention.categoryId,attention.direction,attention.currencyCode].join('|'))}">Объяснить отклонение</button>`:'';
  const parts=[`<div class="fin-attention"><div><span class="iq-workspace-eyebrow">${overview.state.attentionCount?'Требует внимания':'Состояние плана'}</span><p class="fin-state">${esc(stateSentence(overview))}</p></div>${explain}</div>`];
  for(const block of blocks){
    const c=block.currencyCode,e=block.expense,planned=Boolean(overview.version)&&e.plan!==null;
    const hint=overview.period?periodHint(overview.period.from,overview.period.to):'за всё время';
    parts.push(`<section class="iq-summary-panel" aria-label="Расходы, ${esc(currencyName(c))}"><header><h2>Расходы</h2><span class="iq-workspace-caption">${esc(containerTitle(overview.plan))} · ${esc(hint)} · ${esc(c)}</span></header>
      <dl class="iq-metric-grid"><div><dt>Прогноз расходов</dt><dd>${esc(money(e.forecast,c))}<small class="fin-tone-${varianceTone(e.variance)||'muted'}">${planned?esc(varianceWords(e.variance,c)):'Факт + ожидаемые расходы'}</small></dd></div>
      <div><dt>План${overview.version?` · версия ${overview.version.version}`:''}</dt><dd>${planned?esc(money(e.plan,c)):'—'}<small>${planned?'База для сравнения':'Ещё не утверждён'}</small></dd></div>
      <div><dt>Уже потрачено</dt><dd>${esc(money(e.fact,c))}<small>Проведённые операции</small></dd></div>
      <div><dt>Ещё ожидается</dt><dd>${esc(money(e.expected,c))}<small>Ожидаемые расходы</small></dd></div></dl>
      <div class="fin-summary-scale">${scale({target:planned?e.plan:null,done:e.fact,pending:e.expected,size:'md',label:scaleLabel({...e,plan:planned?e.plan:null},c)})}<p class="iq-workspace-caption">Сплошная часть — факт · светлая — ожидания${planned?' · отметка — план':''}</p></div>
      <div class="fin-results"><div><span>Доходы: факт / ожидается</span><strong>${esc(money(block.income.fact,c))} / ${esc(money(block.income.expected,c))}</strong></div><div><span>Чистый результат: факт / прогноз</span><strong>${esc(money(block.net.fact,c))} / ${esc(money(block.net.forecast,c))}</strong></div></div>
      <p class="iq-workspace-caption fin-result-note">Результат — разница доходов и расходов, не остаток на счёте.</p></section>`);
    const {rows}=categoryRows(overview,c);
    if(rows.length)parts.push(`<div class="fin-comparison"><table class="iq-comparison-table"><caption>По категориям · ${esc(c)}</caption><thead><tr><th scope="col">Категория и решение</th><th scope="col" data-numeric>План</th><th scope="col" data-numeric>Факт</th><th scope="col" data-numeric>Прогноз</th><th scope="col" data-numeric>Отклонение</th></tr></thead><tbody>${rows.map(row=>categoryRow(overview,row,{canManage,timeZone})).join('')}</tbody></table></div>`);
    const late=overdueOf(block);
    if(late.count)parts.push(`<div class="fin-overdue"><span class="fin-tone-warning">${esc(overdueText(late.count,late.amount,c))}</span><button type="button" class="iq-btn secondary sm" data-overdue>Проверить операции</button></div>`);
  }
  return parts.join('');
}
const zero=()=>({plan:null,fact:'0',expected:'0',forecast:'0',variance:null});

function categoryRow(overview,row,{canManage,timeZone}){
  const c=row.currencyCode,key=[row.categoryId,row.direction,c].join('|');
  const meta=[row.direction==='income'?'Доход':'Расход',overview.version&&!row.planned?'Не было в плане':'',row.categoryArchived?'В архиве':''].filter(Boolean).join(' · ');
  const explanation=row.note?`<p class="fin-category-note">${esc(row.note.text)}${row.status==='explanation_outdated'?' <span class="fin-tone-warning">Прогноз изменился.</span>':''}</p>`:'';
  const action=canManage&&['needs_explanation','explanation_outdated'].includes(row.status)?`<button type="button" class="iq-btn secondary sm" data-explain="${esc(key)}">${row.note?'Обновить объяснение':'Объяснить'}</button>`:'';
  return `<tr><td><strong>${esc(row.categoryName)}</strong><span class="fin-row-meta">${esc(meta)}</span>${explanation}${row.note?`<span class="fin-row-meta">${esc([shortName(row.note.updatedBy?.name),shortDate(row.note.updatedAt,timeZone),row.note.taskDisplayId].filter(Boolean).join(' · '))}</span>`:''}${action}</td>
    <td data-numeric data-label="План">${row.plan===null?'—':esc(money(row.plan,c))}</td><td data-numeric data-label="Факт">${esc(money(row.fact,c))}</td>
    <td data-numeric data-label="Прогноз"><strong>${esc(money(row.forecast,c))}</strong><span class="fin-row-meta">ожидается ${esc(money(row.expected,c))}</span></td>
    <td data-numeric data-label="Отклонение" class="fin-variance"><span class="fin-tone-${varianceTone(row.variance)||'muted'}">${row.variance===null?'Без сравнения':esc(varianceWords(row.variance,c,row.direction))}</span></td></tr>`;
}

/**
 * Explaining a variance: one or two sentences, and if needed a task through the task module. The id of a new
 * explanation is fixed for the dialog, so a retry after a lost answer finds the same one.
 */
export function explainDialog({api,overview,row,onSaved}){
  const c=row.currencyCode,note=row.note,id=note?.id||crypto.randomUUID(),words=varianceWords(row.variance,c,row.direction);
  const description=`${row.categoryName}: ${row.planned?words:`не было в плане, ${money(row.forecast,c)}`}`;
  const body=`${ui.textarea('Объяснение',note?.text||'',{name:'text',maxlength:FINANCE_LIMITS.varianceNote,placeholder:'Одна-две фразы: почему так вышло и что с этим делаем'})}
    ${note?.taskId?`<p class="iq-helper">Задача ${esc(note.taskDisplayId||'')} уже создана.</p>`:`${ui.check('Создать задачу',false,'name="createTask" data-create-task')}
    <div class="iq-field" data-task-title hidden><label class="iq-control-label" for="fin-task-title">Название задачи</label><div class="iq-input-shell"><input id="fin-task-title" name="taskTitle" maxlength="${FINANCE_LIMITS.taskTitle}" autocomplete="off"></div><small class="iq-helper">Задачу видят все участники проекта: суммы в название не пишите.</small></div>`}`;
  return dialog({title:'Объяснить отклонение',description,body,submitLabel:'Сохранить',success:'Объяснение сохранено',
    mount:(_el,form)=>{
      bindCounters(form);
      const toggle=form.querySelector('[data-create-task]'),title=form.querySelector('[data-task-title]');
      toggle?.addEventListener('change',()=>{title.hidden=!toggle.checked;if(toggle.checked)title.querySelector('input').focus();});
    },
    onSubmit:async(_values,form)=>{
      const text=String(form.querySelector('[name=text]')?.value||'').trim();
      if(!text)throw Error('Напишите объяснение: одной-двух фраз достаточно.');
      const wantsTask=Boolean(form.querySelector('[data-create-task]')?.checked),taskTitle=String(form.querySelector('[name=taskTitle]')?.value||'').trim();
      if(wantsTask&&!taskTitle)throw Error('Назовите задачу.');
      const body={baseRevision:note?.revision??0,value:{planId:overview.plan.id,version:overview.version.version,categoryId:row.categoryId,direction:row.direction,currencyCode:c,text},
        createTask:wantsTask?{title:taskTitle,ownerId:null,due:null}:null};
      const path=`/finance-variance-notes/${encodeURIComponent(id)}`;
      await onSaved?.(await api.request(path,'PUT',body,await api.key(path,body)));
    }});
}
