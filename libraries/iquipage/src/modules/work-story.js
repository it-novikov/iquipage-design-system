'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Plain, host-owned work narratives. All content is text; no Markdown/HTML or inferred progress. */
function workEntry({id,text,by='',time='',detail='',state=''}={}){
  const tone=['error','waiting','complete'].includes(state)?state:'';
  return `<article class="iq-work-entry" data-entry="${esc(id||'')}"${tone?` data-state="${tone}"`:''}><p>${esc(text||'')}</p>${by||time?`<p class="iq-work-byline">${esc([by,time].filter(Boolean).join(', '))}</p>`:''}${detail?`<details class="iq-work-details"><summary>Подробнее</summary><p>${esc(detail)}</p></details>`:''}</article>`;
}
/** A step has an outcome of its own. Completion never implies approval. Actions are supplied by the host. */
function workStep({id,title,state='',stateLabel='',summary='',result='',evidence=[],review='',expanded=false}={}){
  const links=evidence.filter(x=>x&&/^(https?:\/\/|\/[^/]|#)/i.test(x.href||''));
  return `<details class="iq-work-step" data-step="${esc(id||'')}"${expanded?' open':''}><summary><span>${esc(title||'')}</span>${stateLabel?`<span class="iq-work-step-state" data-state="${esc(state)}">${esc(stateLabel)}</span>`:''}</summary><div class="iq-work-step-body">${summary?`<p>${esc(summary)}</p>`:''}${result?`<p>${esc(result)}</p>`:''}${review?`<p class="iq-work-byline">${esc(review)}</p>`:''}${links.length?`<p class="iq-work-evidence">${links.map(x=>`<a href="${esc(x.href)}" target="_blank" rel="noopener noreferrer">${esc(x.label||'Открыть результат')}</a>`).join(' ')}</p>`:''}<div data-step-actions></div></div></details>`;
}
/** Controlled question composition. Native radio values are a draft until the host confirms its command.
 * `name` must be unique in its form. `state` distinguishes a saved answer from a proposed selection. */
function workQuestion({id,title,context='',options=[],name,value='',answer='',state='open',decision='',disabled=false}={}){
  const locked=disabled||state!=='open';
  return `<section class="iq-work-question" data-question="${esc(id||'')}" data-state="${esc(state)}" aria-labelledby="work-question-${esc(id)}"><h3 id="work-question-${esc(id)}">${esc(title||'')}</h3>${context?`<p>${esc(context)}</p>`:''}${decision?`<p class="iq-work-decision">${esc(decision)}</p>`:''}${state==='open'?`<fieldset class="iq-work-options"${locked?' disabled':''}><legend class="sr-only">${esc(title||'Выберите ответ')}</legend>${options.map(o=>`<label class="iq-work-option"><input type="radio" name="${esc(name||'work-'+id)}" value="${esc(o.id)}"${value===o.id?' checked':''}><span><span class="iq-work-option-title">${esc(o.label)}${o.recommended?'<span class="iq-work-recommended">Рекомендация</span>':''}</span>${o.description?`<span class="iq-work-option-description">${esc(o.description)}</span>`:''}</span></label>`).join('')}<label class="iq-work-option"><input type="radio" name="${esc(name||'work-'+id)}" value="__other"${value==='__other'?' checked':''}><span>Свой ответ</span></label></fieldset><div class="iq-field"><label class="iq-control-label" for="work-answer-${esc(id)}">${options.length?'Комментарий к ответу':'Ваш ответ'}</label><span class="iq-input-shell"><textarea id="work-answer-${esc(id)}" name="workAnswer" rows="2" maxlength="4000"${locked?' disabled':''}>${esc(answer)}</textarea></span></div>`:''}<div class="iq-work-tools" data-question-actions></div><p class="iq-helper" data-question-status role="status" hidden></p></section>`;
}
exports.workEntry=workEntry;
exports.workStep=workStep;
exports.workQuestion=workQuestion;
