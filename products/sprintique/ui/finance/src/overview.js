import {ui,escapeHTML as esc,scale} from '@iquipage/web/core';
import {dialog} from '../../src/ui.js';
import {bindCounters} from './dialogs.js';
import {currencyName,currencySymbol} from './money.js';
import {money,periodHint,varianceWords,varianceTone,stateSentence,scaleLabel,tooltipText,overdueText,overdueOf,
  containerTitle,categoryRows} from './overview-model.js';
import {FINANCE_LIMITS} from '../../../contracts/finance.ts';

/**
 * The overview of the finance section, direction B2 «Шкала, тише»: one sentence of state, one container per
 * currency with the scale and four figures, the categories on thin scales against one plan mark with their variance
 * and explanation, and one line about overdue expectations. Writers see «Объяснить»; everyone sees the same figures.
 */
export function overviewMarkup(overview,{canManage,timeZone}){
  const several=overview.currencies.length>1;
  const blocks=overview.currencies.length?overview.currencies:[{currencyCode:'RUB',income:zero(),expense:zero(),net:{fact:'0',forecast:'0'},overdue:{count:0,income:'0',expense:'0'}}];
  const parts=[`<p class="fin-state">${esc(stateSentence(overview))}</p>`];
  for(const block of blocks){
    const currency=block.currencyCode,suffix=several?` · ${currencyName(currency)}, ${currencySymbol(currency)}`:'';
    const hint=overview.period?periodHint(overview.period.from,overview.period.to):'за всё время';
    const id=`fin-scope-${esc(currency)}`;
    parts.push(`<section class="fin-card" aria-labelledby="${id}"><header class="fin-card-head"><h2 id="${id}">${esc(containerTitle(overview.plan))}</h2><span class="fin-card-hint">${esc(hint+suffix)}</span></header>
      <div class="fin-scope">${summaryScale(overview,block)}${figures(overview,block)}</div></section>`);
    const {rows,max}=categoryRows(overview,currency);
    if(rows.length){
      const cid=`fin-categories-${esc(currency)}`;
      parts.push(`<section class="fin-card" aria-labelledby="${cid}"><header class="fin-card-head"><h2 id="${cid}">По категориям</h2>${several?`<span class="fin-card-hint">${esc(currencyName(currency))}</span>`:''}</header>
        <div class="fin-crows" role="list">${rows.map(row=>categoryRow(overview,row,{max,canManage,timeZone,mixed:new Set(rows.map(r=>r.direction)).size>1})).join('')}</div></section>`);
    }
    const late=overdueOf(block);
    if(late.count)parts.push(`<p class="fin-overdue"><span class="fin-tone-warning">${esc(overdueText(late.count,late.amount,currency))}</span> <button type="button" class="iq-link fin-inline-link" data-overdue>В журнал</button></p>`);
  }
  return parts.join('');
}
const zero=()=>({plan:null,fact:'0',expected:'0',forecast:'0',variance:null});

/** The large scale of a currency: expenses against the plan, or without a plan against their own sum. */
function summaryScale(overview,block){
  const e=block.expense,c=block.currencyCode;
  return scale({target:overview.version?e.plan??'0':null,done:e.fact,pending:e.expected,size:'lg',label:scaleLabel({...e,plan:overview.version?e.plan:null},c)});
}
/** The four figures: plan, fact, still expected, and the forecast with its variance, or the expected result. */
function figures(overview,block){
  const e=block.expense,c=block.currencyCode,planned=Boolean(overview.version)&&e.plan!==null;
  const plan=planned?`<dd>${esc(money(e.plan,c))}</dd>`:`<dd data-empty>${overview.plan&&!overview.version?'не утверждён':'нет'}</dd>`;
  const last=planned
    ?`<div><dt>Прогноз на конец периода</dt><dd>${esc(money(e.forecast,c))}</dd><small class="fin-tone-${varianceTone(e.variance)||'muted'}">${esc(varianceWords(e.variance,c))}</small></div>`
    :`<div><dt>Ожидаемый результат</dt><dd>${esc(money(block.net.forecast,c))}</dd><small>с учётом доходов</small></div>`;
  return `<dl class="fin-figures"><div><dt>План</dt>${plan}</div><div><dt>Факт</dt><dd>${esc(money(e.fact,c))}</dd></div><div><dt>Ещё ожидается</dt><dd>${esc(money(e.expected,c))}</dd></div>${last}</dl>`;
}

/** One category: its name, a thin scale, the variance when there is one, and its explanation or «Объяснить». */
function categoryRow(overview,row,{max,canManage,timeZone,mixed}){
  const c=row.currencyCode,compared=Boolean(overview.version);
  const meta=[mixed&&row.direction==='income'?'доход':'',compared&&!row.planned?'не было в плане':'',row.categoryArchived?'в архиве':''].filter(Boolean).join(', ');
  const bar=compared
    ?scale({target:row.planned?row.plan:'0',done:row.fact,pending:row.expected,size:'sm',over:row.direction==='income'?'success':'danger',label:scaleLabel(row,c)})
    :scale({done:row.fact,pending:row.expected,max,size:'sm',label:scaleLabel({...row,plan:null},c)});
  const right=compared
    ?(row.variance!==null&&BigInt(row.variance)!==0n?`<span class="fin-crow-value" data-tone="${varianceTone(row.variance)}">${esc(money(row.variance,c,{sign:true}))}</span>`
      :!row.planned&&BigInt(row.forecast)!==0n?`<span class="fin-crow-value" data-tone="muted">${esc(money(row.forecast,c))}</span>`:'')
    :`<span class="fin-crow-value" data-tone="muted">${esc(money(row.forecast,c))}</span>`;
  const key=[row.categoryId,row.direction,c].join('|');
  let below='';
  if(row.note){
    const again=canManage&&row.status==='explanation_outdated'?` <button type="button" class="iq-link fin-inline-link" data-explain="${esc(key)}">Объяснить заново</button>`:'';
    below=`<p class="fin-crow-note">${esc(row.note.text)}${row.status==='explanation_outdated'?' <span class="fin-tone-warning">Прогноз изменился.</span>':''}${again}</p>`;
  }else if(canManage&&row.status==='needs_explanation'){
    below=`<p class="fin-crow-ask"><button type="button" class="iq-link fin-inline-link" data-explain="${esc(key)}">Объяснить</button></p>`;
  }
  const tip=tooltipText(row,timeZone);
  return `<iq-tooltip heading="${esc(row.categoryName)}" text="${esc(tip)}" placement="bottom"><div class="fin-crow" role="listitem" tabindex="0" data-category="${esc(key)}">
    <span class="fin-crow-name">${esc(row.categoryName)}${meta?`<span class="fin-crow-meta">${esc(meta)}</span>`:''}</span>${bar}<span class="fin-crow-end">${right}</span>${below}</div></iq-tooltip>`;
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
