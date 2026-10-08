import {ui,escapeHTML as esc,scale,notify,pending,FEEDBACK_TIMING} from '@iquipage/web/core';
import {dialog} from '../../src/ui.js';
import {currencySymbol,currencyName} from './money.js';
import {money,editorTitle,editorLines,editorTotal,amountText,longDate,scaleLabel,dayText,currencyWords} from './overview-model.js';
import {FINANCE_LIMITS} from '../../../contracts/finance.ts';

/**
 * The plan editor of direction B2: one form of rows «категория — сумма — релиз» over the scale of the draft against
 * what is already spent and expected. Saving keeps the draft; approving saves it and approves exactly that revision.
 * Discarding removes the draft (and a plan that never had anything else).
 *
 * `plan` is the plan with its draft selected, or null for a new plan; `facts` the expense side of the overview the
 * plan is compared with; `previous` the approved version's total and forecast for the quiet line.
 */
export function mountPlanEditor(root,{api,plan,settings,today,categories,releases,facts,previous,onDone,onCancel}){
  const currency=plan?.selected?.lines?.[0]?.currencyCode||settings.currencyCode;
  const draft=plan?.selected||null,version=draft?.version||1,approved=plan?.versions?.find(v=>v.state==='approved')||null;
  const fixedPeriod=Boolean(plan?.versions?.some(v=>v.state!=='draft'));
  const releasePlan=Boolean(plan?.releaseId);
  const year=today.slice(0,4);
  const header={name:plan?.name||'Весь проект',periodStart:plan?.periodStart||`${year}-01-01`,periodEnd:plan?.periodEnd||`${year}-12-31`,releaseId:plan?.releaseId||null};
  const planId=plan?.id||crypto.randomUUID();
  let options=categoryOptions(categories,draft?.lines||[]);
  const releaseOptions=[{value:'',label:'Весь проект'},...releases.filter(r=>!r.archivedAt||draft?.lines?.some(l=>l.releaseId===r.id)).map(r=>({value:r.id,label:r.name}))];
  const rows=[...(draft?.lines||[]).map(l=>({categoryId:l.categoryId,direction:l.direction,amount:amountText(l.amountMinor,l.currencyCode),currencyCode:l.currencyCode,releaseId:l.releaseId,note:l.note})),blank()];
  function blank(){return {categoryId:'',direction:'expense',amount:'',currencyCode:currency,releaseId:null,note:null};}

  const crumb=draft?`черновик версии ${version}`:'новый план';
  root.innerHTML=`<section class="fin-view fin-editor-view"><header class="iq-workspace-heading fin-head"><div><span class="iq-workspace-eyebrow">Финансовый план</span><h1>${esc(editorTitle(header.releaseId?{releaseName:releases.find(r=>r.id===header.releaseId)?.name}:null))}</h1>
      <span class="fin-crumb"><button type="button" class="fin-crumb-link" data-back>Финансы</button> · ${esc(crumb)}</span></div>
      <div class="iq-workspace-tools">${draft&&plan?`<button type="button" class="iq-btn ghost sm" data-discard>Удалить черновик</button>`:''}</div></header>
    <form class="fin-card fin-editor" novalidate aria-labelledby="fin-editor-title">
      <header class="fin-card-head"><h2 id="fin-editor-title">Состав и суммы</h2><span class="fin-card-hint">Черновик можно сохранить и продолжить позже</span></header>
      <div class="fin-editor-scale" data-editor-scale></div>
      <div class="fin-period"><span class="fin-period-label" id="fin-period-label">Период</span>
        ${fixedPeriod?`<span class="fin-period-fixed">${esc(dayText(header.periodStart))} — ${esc(dayText(header.periodEnd))}</span>`
          :`<iq-date-field name="periodStart" label="Начало периода" label-hidden value="${esc(header.periodStart)}"></iq-date-field><span aria-hidden="true">—</span>
        <iq-date-field name="periodEnd" label="Конец периода" label-hidden value="${esc(header.periodEnd)}"></iq-date-field>`}
        <span class="fin-period-note">Валюта: ${esc(currencySymbol(currency))}, ${esc(currencyWords(currency,currencyName(currency)))}</span>
        ${!plan?`<iq-select name="scope" label="План на" label-hidden value="" density="compact" options="${esc(JSON.stringify(releaseOptions.filter(o=>o.value===''||!releases.find(r=>r.id===o.value)?.archivedAt)))}"></iq-select>`:''}</div>
      <div class="fin-prows${releasePlan?' fin-prows-plain':''}" role="group" aria-label="Строки плана" data-rows></div>
      <div class="fin-total"><span>Итого</span><b data-total></b></div>
      ${approved&&previous?`<p class="fin-quiet-line">В версии ${approved.version} было ${esc(money(previous.total,currency))}, прогноз сейчас ${esc(money(previous.forecast,currency))}.</p>`:''}
      ${version>1?`<div class="iq-field fin-reason"><label class="iq-control-label" for="fin-reason">Причина пересмотра</label><div class="iq-input-shell"><input id="fin-reason" name="note" maxlength="${FINANCE_LIMITS.planNote}" autocomplete="off" value="${esc(draft?.note||'')}" placeholder="Что изменилось с версии ${version-1}"></div></div>`:''}
      <p class="map-form-error" role="alert" hidden></p>
      <div class="fin-editor-actions"><button type="button" class="iq-btn primary sm" data-approve>Утвердить версию ${version}</button><button type="button" class="iq-btn secondary sm" data-save>Сохранить черновик</button>
        ${approved?`<span class="fin-versions">Версия ${approved.version} утверждена ${esc(longDate(approved.approvedAt))}</span>`:''}</div>
    </form></section>`;
  const q=selector=>root.querySelector(selector),form=q('form'),error=form.querySelector('.map-form-error');

  function rowMarkup(row,index){
    const label=n=>`${n}, строка ${index+1}`;
    return `<div class="fin-prow" data-row="${index}">
      <iq-combobox creatable create-label="Новая категория «{query}»" label="${esc(label('Категория'))}" placeholder="Категория" value="${esc(row.categoryId)}" options="${esc(JSON.stringify(options))}" data-field="category"></iq-combobox>
      ${ui.amount(label('Сумма'),row.amount,{labelHidden:false,suffix:currencySymbol(row.currencyCode||currency),placeholder:'Сумма',attrs:'data-field="amount"'})}
      ${releasePlan?'':`<iq-select label="${esc(label('Релиз'))}" value="${esc(row.releaseId||'')}" options="${esc(JSON.stringify(releaseOptions))}" data-field="release"></iq-select>`}</div>`;
  }
  function renderRows(){q('[data-rows]').innerHTML=rows.map(rowMarkup).join('');}
  function readRows(){
    for(const element of root.querySelectorAll('[data-row]')){
      const row=rows[Number(element.dataset.row)];if(!row)continue;
      row.categoryId=element.querySelector('[data-field=category]')?.value||'';
      row.amount=element.querySelector('[data-field=amount]')?.value||'';
      row.releaseId=element.querySelector('[data-field=release]')?.value||null;
      const category=options.find(o=>o.value===row.categoryId);if(category)row.direction=category.direction==='income'?'income':'expense';
    }
    return rows.map((row,index)=>({...row,index}));
  }
  /** The draft's total, its scale and the figures follow every edit; a filled last row gets an empty one after it. */
  function refresh(){
    const current=readRows();let lines=[];
    try{lines=editorLines(current,currency);}catch{lines=editorLines(current.filter(r=>r.categoryId&&/\d/.test(r.amount)&&safe(r)),currency);}
    const total=editorTotal(lines,currency);
    q('[data-total]').textContent=money(total,currency);
    q('[data-editor-scale]').innerHTML=scale({target:total,done:facts.fact,pending:facts.expected,size:'md',label:scaleLabel({plan:total,...facts,variance:null},currency)})
      +`<dl class="fin-figures" data-columns="3"><div><dt>Версия ${version}</dt><dd>${esc(money(total,currency))}</dd></div><div><dt>Факт</dt><dd>${esc(money(facts.fact,currency))}</dd></div><div><dt>Ещё ожидается</dt><dd>${esc(money(facts.expected,currency))}</dd></div></dl>`;
    const last=rows.at(-1);
    if(last&&(last.categoryId||String(last.amount).trim())){rows.push(blank());q('[data-rows]').insertAdjacentHTML('beforeend',rowMarkup(rows.at(-1),rows.length-1));}
  }
  const safe=row=>{try{editorLines([row],currency);return true;}catch{return false;}};

  async function createCategory(combobox,label){
    const id=crypto.randomUUID(),path=`/finance-categories/${encodeURIComponent(id)}`,body={baseRevision:0,value:{name:label,direction:'expense',archived:false}};
    try{
      const made=await api.request(path,'PUT',body,await api.key(path,body));
      categories.push(made);options=categoryOptions(categories,readRows());
      for(const field of root.querySelectorAll('[data-field=category]'))field.options=options;
      combobox.value=made.id;refresh();
    }catch(failure){notify({tone:'danger',message:'Категория не создана',description:failure.message});}
  }

  async function persist(approve){
    error.hidden=true;
    let lines;
    try{lines=editorLines(readRows(),currency);}
    catch(failure){fail(failure.message,failure.row!==undefined?root.querySelector(`[data-row="${failure.row}"] [data-field=${failure.field}]`):null);return;}
    if(approve&&!lines.length){fail('Добавьте хотя бы одну строку: утверждать пустой план нечего.',root.querySelector('[data-row="0"] [data-field=category]'));return;}
    const start=fixedPeriod?header.periodStart:form.querySelector('iq-date-field[name=periodStart]').value,end=fixedPeriod?header.periodEnd:form.querySelector('iq-date-field[name=periodEnd]').value;
    if(!start||!end||start>end){fail('Укажите период: начало не позже конца.',form.querySelector('iq-date-field[name=periodStart]'));return;}
    const scope=form.querySelector('iq-select[name=scope]')?.value||header.releaseId||null;
    const scopeRelease=releases.find(r=>r.id===scope);
    const value={name:scopeRelease?.name||header.name,periodStart:start,periodEnd:end,releaseId:scope||null};
    // The pressed button is the DS pending action (vnext.35); the other buttons wait, disabled only after 150 ms.
    const pressed=root.querySelector(approve?'[data-approve]':'[data-save]');
    let buttons=[];const lock=setTimeout(()=>{buttons=[...root.querySelectorAll('button')].filter(b=>b!==pressed&&!b.disabled);buttons.forEach(b=>b.disabled=true);},FEEDBACK_TIMING.pending);
    try{await pending(pressed,async()=>{
      let current=plan;
      const changed=!current||value.periodStart!==current.periodStart||value.periodEnd!==current.periodEnd;
      if(changed&&!fixedPeriod){
        const path=`/finance-plans/${encodeURIComponent(planId)}`,body={baseRevision:current?.revision??0,value};
        current=await api.request(path,'PUT',body,await api.key(path,body));
      }
      const note=String(form.querySelector('[name=note]')?.value||'').trim()||null;
      const draftPath=`/finance-plans/${encodeURIComponent(planId)}/draft`;
      const draftBody={baseRevision:current.selected.revision,version:current.selected.version,value:{note,lines:lines.map(l=>({...l,currencyCode:l.currencyCode}))}};
      current=await api.request(draftPath,'PUT',draftBody,await api.key(draftPath,draftBody));
      if(approve){
        const approvePath=`/finance-plans/${encodeURIComponent(planId)}/approve`,approveBody={baseRevision:current.selected.revision,version:current.selected.version};
        current=await api.request(approvePath,'POST',approveBody,await api.key(approvePath,approveBody));
      }
      notify({tone:'success',message:approve?`Версия ${current.selected.version} утверждена`:'Черновик сохранён'});
      await onDone?.(current,{approved:approve});
    });}catch(failure){fail(failure.message||'Не удалось сохранить план.');}
    finally{clearTimeout(lock);buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
  }
  function fail(message,field){
    error.textContent=message;error.hidden=false;
    if(field){field.setAttribute('aria-invalid','true');const clear=()=>field.removeAttribute('aria-invalid');field.addEventListener('input',clear,{once:true});field.addEventListener('iq-change',clear,{once:true});(field.querySelector?.('input,button')||field).focus?.();}
  }
  function discard(){
    dialog({title:'Удалить черновик',body:`<p>Черновик версии ${version} и его строки будут удалены.${approved?` Утверждённая версия ${approved.version} останется как есть.`:' Утверждённых версий у плана нет, поэтому план тоже будет удалён.'}</p>`,submitLabel:'Удалить',success:'Черновик удалён',
      onSubmit:async()=>{
        const path=`/finance-plans/${encodeURIComponent(planId)}/discard`,body={baseRevision:draft.revision,version};
        const result=await api.request(path,'POST',body,await api.key(path,body));
        await onDone?.(result.plan,{discarded:true});
      }});
  }

  renderRows();refresh();
  root.addEventListener('input',event=>{if(event.target.closest('[data-field=amount]'))refresh();});
  root.addEventListener('iq-change',event=>{if(event.target.closest('[data-row]'))refresh();});
  root.addEventListener('iq-create',event=>{const combobox=event.target.closest('[data-field=category]');if(combobox)void createCategory(combobox,event.detail.label);});
  root.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-back'))onCancel?.();
    else if(target.hasAttribute('data-save'))void persist(false);
    else if(target.hasAttribute('data-approve'))void persist(true);
    else if(target.hasAttribute('data-discard'))discard();
  });
  return {destroy(){root.replaceChildren();}};
}

/** Categories offered in a row: the current ones, and an archived one only where a line already has it. */
function categoryOptions(categories,lines){
  const used=new Set(lines.map(l=>l.categoryId));
  return categories.filter(c=>!c.archived||used.has(c.id)).map(c=>({value:c.id,label:c.name,direction:c.direction}));
}
