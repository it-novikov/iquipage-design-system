import {ui,icon,escapeHTML as esc,formatDateTime} from '@iquipage/web/core';
import {dialog} from '../../src/ui.js';
import {parseAmount,amountInput,formatMoney,currencySymbol,currencyName,currencyCodes} from './money.js';
import {entryStatus,directionLabel,changeLabel,formatDate} from './model.js';
import {FINANCE_LIMITS} from '../../../contracts/finance.ts';

let fieldSequence=0;
const nextId=()=>`fin-field-${++fieldSequence}`;
/** A DS text field with the attributes money and suggestions need (input mode, a list, a currency suffix). */
function textField({name,label,value='',max,required=false,inputmode='',list='',suffix='',hint=''}){
  const id=nextId();
  return `<div class="iq-field"><label class="iq-control-label" for="${id}">${esc(label)}</label><div class="iq-input-shell"><input id="${id}" name="${name}" value="${esc(value)}" autocomplete="off" ${max?`maxlength="${max}"`:''} ${required?'required':''} ${inputmode?`inputmode="${inputmode}"`:''} ${list?`list="${list}"`:''} ${hint?`aria-describedby="${id}-hint"`:''}>${suffix?`<span class="iq-input-suffix" data-currency-sign>${esc(suffix)}</span>`:''}</div>${hint?`<small class="iq-helper" id="${id}-hint">${esc(hint)}</small>`:''}</div>`;
}
/** Currencies to offer: those in use and the common ones first, then every ISO code, each with its Russian name. */
function currencyOptions(...extra){
  return currencyCodes(...extra).map(code=>({value:code,label:`${code} — ${currencyName(code)}`}));
}
const currencySelect=(name,label,value,options)=>`<iq-select name="${name}" label="${esc(label)}" value="${esc(value)}" searchable search-placeholder="Код или название" options="${esc(JSON.stringify(options))}"></iq-select>`;
/** Two exclusive options side by side: the DS choice list, laid out in a row. */
const choices=(legend,name,options,value)=>`<fieldset class="iq-choice-list fin-choice"><legend>${esc(legend)}</legend>${options.map(([id,label,hint])=>`<label><input type="radio" name="${name}" value="${esc(id)}" ${id===value?'checked':''}><b>${esc(label)}</b><small>${esc(hint)}</small></label>`).join('')}</fieldset>`;
const optional=value=>{const text=String(value??'').trim();return text||null;};
const read=(form,name)=>form.querySelector(`[name="${name}"]`)?.value??'';
/**
 * A field-bound error: the field is marked invalid, described by the dialog's error line and focused; the message is
 * thrown so the dialog shows it. The mark clears when the person edits the field.
 */
function invalid(form,name,message){
  const field=form.querySelector(`iq-date-field[name="${name}"]`)||form.querySelector(`[name="${name}"]:not([type=hidden])`);
  const error=form.querySelector(':scope > .map-form-error');
  if(error&&!error.id)error.id=nextId();
  if(field){
    field.setAttribute('aria-invalid','true');if(error)field.setAttribute('aria-describedby',error.id);
    const clear=()=>{field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');};
    field.addEventListener('input',clear,{once:true});field.addEventListener('iq-change',clear,{once:true});
    // After the dialog re-enables its fields, which it does once the submit has failed.
    setTimeout(()=>(field.querySelector?.('input,button')||field).focus?.(),0);
  }
  throw Error(message);
}
function amountOf(form,currency){try{return parseAmount(read(form,'amount'),currency);}catch(error){return invalid(form,'amount',error.message);}}

/**
 * The DS text area declares its counter (`data-count`) but only the DS catalogue updates it (DS-GAP-FIN-2); the
 * dialog keeps it current for every text area it holds.
 */
function bindCounters(form){
  form.addEventListener('input',event=>{
    const field=event.target,counter=field.dataset?.count&&form.querySelector('#'+CSS.escape(field.dataset.count));
    if(counter)counter.textContent=`${field.value.length} / ${field.maxLength}`;
  });
}
/** Writes a command with a key stable for its exact body, so a retry after a lost answer is recognised. */
async function command(api,method,path,body){return api.request(path,method,body,await api.key(path,body));}

/** Creating or editing an entry. An edit keeps the state: posting and voiding have their own dialogs. */
export function entryDialog({api,entry=null,settings,today,categories=[],currencies=[],onSaved,replace}){
  const creating=!entry,value=entry||{direction:'expense',state:'posted',currencyCode:settings.currencyCode,amountMinor:null,category:'',description:'',counterparty:null,reference:null};
  const dateOf=state=>state==='planned'?value.dueDate:value.postedDate;
  const dateLabel=state=>state==='planned'?'Ожидаемая дата':'Дата оплаты';
  const listId=nextId();
  // One id per dialog: a retry after a lost answer repeats the same path and body, so the server recognises it.
  const id=entry?.id||crypto.randomUUID();
  const body=`${choices('Тип операции','direction',[['expense','Расход','Деньги уходят из проекта'],['income','Доход','Деньги приходят в проект']],value.direction)}
    ${creating?choices('Статус','state',[['posted','Проведена','Оплата уже прошла'],['planned','Ожидается','Оплата будет к дате']],value.state):''}
    <div class="grid-2 fin-money-fields">${textField({name:'amount',label:'Сумма',value:value.amountMinor?amountInput(value.amountMinor,value.currencyCode):'',required:true,inputmode:'decimal',suffix:currencySymbol(value.currencyCode)})}
    ${currencySelect('currencyCode','Валюта',value.currencyCode,currencyOptions(value.currencyCode,settings.currencyCode,...currencies))}</div>
    <iq-date-field name="date" label="${dateLabel(value.state)}" value="${esc(dateOf(value.state)||today)}" required></iq-date-field>
    ${textField({name:'category',label:'Категория',value:value.category,max:FINANCE_LIMITS.category,required:true,list:listId,hint:'Например, «Хостинг» или «Оплата заказчика»: по категориям строится сводка.'})}
    <datalist id="${listId}">${categories.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist>
    ${ui.textarea('Описание',value.description,{name:'description',maxlength:FINANCE_LIMITS.description})}
    <div class="grid-2">${textField({name:'counterparty',label:'Контрагент — необязательно',value:value.counterparty||'',max:FINANCE_LIMITS.counterparty})}
    ${textField({name:'reference',label:'Документ — необязательно',value:value.reference||'',max:FINANCE_LIMITS.reference,hint:'Номер счёта, договора или платёжки.'})}</div>`;
  return dialog({title:creating?'Новая операция':'Изменить операцию',body,submitLabel:creating?'Добавить':'Сохранить',replace,
    success:creating?'Операция добавлена':'Операция сохранена',
    mount:(_el,form)=>{
      bindCounters(form);
      const sign=form.querySelector('[data-currency-sign]');
      form.querySelector('iq-select[name=currencyCode]').addEventListener('iq-change',event=>{sign.textContent=currencySymbol(event.detail.value);});
      // The date field keeps its label once rendered, so the other state gets a new field with the same date.
      form.querySelectorAll('[name=state]').forEach(radio=>radio.addEventListener('change',()=>{
        const current=form.querySelector('iq-date-field[name=date]'),next=document.createElement('iq-date-field');
        for(const [name,text] of [['name','date'],['label',dateLabel(radio.value)],['value',current.value||''],['required','']])next.setAttribute(name,text);
        current.replaceWith(next);
      }));
    },
    onSubmit:async(_values,form)=>{
      const state=creating?form.querySelector('[name=state]:checked')?.value||'posted':value.state;
      const currencyCode=read(form,'currencyCode'),date=form.querySelector('iq-date-field[name=date]').value;
      const category=read(form,'category').trim(),description=read(form,'description').trim();
      const amountMinor=amountOf(form,currencyCode);
      if(!date)invalid(form,'date',state==='planned'?'Укажите, когда ожидается оплата.':'Укажите дату оплаты.');
      if(!category)invalid(form,'category','Укажите категорию.');
      if(!description)invalid(form,'description','Опишите операцию.');
      const next={direction:form.querySelector('[name=direction]:checked')?.value||value.direction,state,amountMinor,currencyCode,
        dueDate:state==='planned'?date:value.dueDate??null,postedDate:state==='planned'?null:date,category,description,
        counterparty:optional(read(form,'counterparty')),reference:optional(read(form,'reference'))};
      const saved=await command(api,'PUT',`/finance-entries/${encodeURIComponent(id)}`,{baseRevision:entry?.revision??0,value:next});
      await onSaved?.(saved);
    }});
}

/** Posting a planned entry: the day the money actually moved and the actual amount. */
export function postDialog({api,entry,today,onSaved,replace}){
  const body=`<p>Отметьте, что оплата прошла. Плановая дата ${esc(formatDate(entry.dueDate))} останется в истории.</p>
    <div class="grid-2 fin-money-fields"><iq-date-field name="date" label="Дата оплаты" value="${esc(today)}" required></iq-date-field>
    ${textField({name:'amount',label:'Фактическая сумма',value:amountInput(entry.amountMinor,entry.currencyCode),required:true,inputmode:'decimal',suffix:currencySymbol(entry.currencyCode)})}</div>`;
  return dialog({title:'Провести операцию',description:entry.description,body,submitLabel:'Провести',success:'Операция проведена',replace,
    onSubmit:async(_values,form)=>{
      const postedDate=form.querySelector('iq-date-field[name=date]').value;if(!postedDate)invalid(form,'date','Укажите дату оплаты.');
      const amountMinor=amountOf(form,entry.currencyCode);
      await onSaved?.(await command(api,'PATCH',`/finance-entries/${encodeURIComponent(entry.id)}/state`,{state:'posted',baseRevision:entry.revision,postedDate,amountMinor}));
    }});
}

/** Voiding is final: the entry stays in the ledger with its reason and leaves every total. */
export function voidDialog({api,entry,onSaved,replace}){
  const body=`${ui.alert('Аннулирование окончательно','Операция останется в журнале и истории, но перестанет учитываться в итогах. Вернуть её нельзя: при необходимости добавьте новую.','warning')}
    ${ui.textarea('Причина','',{name:'voidReason',maxlength:FINANCE_LIMITS.voidReason,placeholder:'Например, платёж возвращён или внесён дважды'})}`;
  return dialog({title:'Аннулировать операцию',description:`${entry.description}, ${formatMoney(entry.amountMinor,entry.currencyCode)}`,body,submitLabel:'Аннулировать',success:'Операция аннулирована',replace,
    mount:(_el,form)=>bindCounters(form),
    onSubmit:async(_values,form)=>{
      const voidReason=read(form,'voidReason').trim();if(!voidReason)invalid(form,'voidReason','Укажите причину: она остаётся в журнале.');
      await onSaved?.(await command(api,'PATCH',`/finance-entries/${encodeURIComponent(entry.id)}/state`,{state:'voided',baseRevision:entry.revision,voidReason}));
    }});
}

/** The project currency: the default for new entries only. */
export function currencyDialog({api,settings,currencies=[],onSaved}){
  const body=`${currencySelect('currencyCode','Валюта проекта',settings.currencyCode,currencyOptions(settings.currencyCode,...currencies))}
    <p class="iq-helper">Подставляется в новые операции. Уже внесённые операции сохраняют свою валюту, итоги считаются по каждой валюте отдельно.</p>`;
  return dialog({title:'Валюта проекта',body,submitLabel:'Сохранить',success:'Валюта проекта сохранена',
    onSubmit:async(_values,form)=>{
      const currencyCode=read(form,'currencyCode');if(currencyCode===settings.currencyCode)return;
      await onSaved?.(await command(api,'PUT','/finance-settings',{baseRevision:settings.revision,value:{currencyCode}}));
    }});
}

const fact=(term,value)=>`<div><dt>${esc(term)}</dt><dd>${value}</dd></div>`;
/** An entry with its facts, the actions its state allows and its history. */
export function entryDetails({api,entry,today,canManage,onEdit,onPost,onVoid,onClose}){
  const status=entryStatus(entry,today);
  const facts=[
    fact('Сумма',`<span class="fin-amount" data-direction="${entry.direction}" data-state="${entry.state}">${esc(formatMoney(entry.direction==='expense'?-entry.amountMinor:entry.amountMinor,entry.currencyCode,{sign:true}))}</span>`),
    fact('Статус',`<span class="iq-badge soft ${status.tone}">${esc(status.label)}</span>`),
    entry.postedDate?fact('Дата оплаты',esc(formatDate(entry.postedDate))):'',
    entry.dueDate?fact(entry.state==='planned'?'Ожидается':'Ожидалась',esc(formatDate(entry.dueDate))):'',
    fact('Категория',esc(entry.category)),
    entry.counterparty?fact('Контрагент',esc(entry.counterparty)):'',
    entry.reference?fact('Документ',esc(entry.reference)):'',
    entry.voidReason?fact('Причина аннулирования',esc(entry.voidReason)):'',
    fact('Внесена',`${esc(entry.createdByName)}, ${esc(formatDateTime(entry.createdAt))}`),
    entry.revision>1?fact('Изменена',`${esc(entry.updatedByName)}, ${esc(formatDateTime(entry.updatedAt))}`):''
  ].join('');
  const actions=canManage&&entry.state!=='voided'?`<div class="fin-detail-actions">${entry.state==='planned'?ui.btn('Провести','primary sm','check','data-detail="post"'):''}${ui.btn('Изменить','secondary sm','pencil','data-detail="edit"')}${ui.btn('Аннулировать','ghost sm','x','data-detail="void"')}</div>`:'';
  const body=`<dl class="iq-settings-facts fin-detail-facts">${facts}</dl>${actions}
    <section class="iq-section fin-history" aria-labelledby="fin-history-title"><header class="iq-section-head">${icon('clock',17)}<h3 id="fin-history-title">История</h3><span class="iq-section-count" data-history-count></span></header><div data-history><p class="iq-helper" role="status">Загружаем историю…</p></div></section>`;
  const element=dialog({title:entry.description,description:`${directionLabel(entry.direction)}, ${entry.currencyCode}`,body,wide:true,
    mount:(el,form)=>{
      form.addEventListener('click',event=>{
        const action=event.target.closest('[data-detail]')?.dataset.detail;if(!action)return;
        const handover={open:true,previous:null,close:instant=>el.close(instant)};
        if(action==='edit')onEdit(handover);if(action==='post')onPost(handover);if(action==='void')onVoid(handover);
      });
      el.addEventListener('iq-close',()=>onClose?.(),{once:true});
      void loadHistory(api,entry,form);
    }});
  return element;
}

async function loadHistory(api,entry,form){
  const target=form.querySelector('[data-history]'),count=form.querySelector('[data-history-count]');
  try{
    const items=[];let before=null;
    do{const page=await api.request(`/finance-entries/${encodeURIComponent(entry.id)}/history${before?'?before='+before:''}`);items.push(...page.items);before=page.nextCursor;}while(before&&items.length<200);
    if(!target.isConnected)return;
    count.textContent=String(items.length);
    target.innerHTML=`<div class="iq-table-wrap"><table class="iq-table fin-history-table"><caption class="sr-only">Версии операции</caption><thead><tr><th scope="col">Версия</th><th scope="col">Что произошло</th><th scope="col">Сумма</th><th scope="col">Кто и когда</th></tr></thead><tbody>${items.map(version=>`<tr><td>${version.revision}</td><td>${esc(changeLabel[version.change]||version.change)}${version.voidReason&&version.change==='voided'?`<small class="fin-row-meta">${esc(version.voidReason)}</small>`:''}</td><td class="fin-amount-cell">${esc(formatMoney(version.amountMinor,version.currencyCode))}</td><td>${esc(version.actorName)}<small class="fin-row-meta">${esc(formatDateTime(version.createdAt))}</small></td></tr>`).join('')}</tbody></table></div>`;
  }catch(error){if(target.isConnected)target.innerHTML=ui.alert('История не загрузилась',esc(error.message||'Повторите попытку.'),'danger');}
}
