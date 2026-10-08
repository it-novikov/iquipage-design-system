import {ui,icon,escapeHTML as esc} from '@iquipage/web/core';
/** Markup builders for the DS settings compositions. Callers escape their own text; `html` values are trusted markup. */
export const group=({title,description='',actions='',count=null,body,id=''})=>`<section class="iq-settings-group"${id?` aria-labelledby="${id}"`:''}><header class="iq-settings-group-head"><div><h2${id?` id="${id}"`:''}>${esc(title)}${count!==null?`<span class="iq-settings-group-count">${count}</span>`:''}</h2>${description?`<p>${esc(description)}</p>`:''}</div>${actions?`<div class="iq-settings-group-actions">${actions}</div>`:''}</header>${body}</section>`;
export const panel=(rows,tag='div')=>`<${tag} class="iq-settings-panel"${tag==='ul'?' role="list"':''}>${rows}</${tag}>`;
/** One managed row. `href`/`button` make the whole row a single action (no nested controls then). */
export function row({media='',title,titleExtra='',meta=[],aside='',actions='',state='',href='',button='',tag='div',attrs=''}){
 const inner=`${media?`<span class="iq-settings-row-media">${media}</span>`:''}<span class="iq-settings-row-copy"><span class="iq-settings-row-title">${esc(title)}${titleExtra}</span>${meta.filter(Boolean).length?`<span class="iq-settings-row-meta">${meta.filter(Boolean).map(m=>`<span>${m}</span>`).join('')}</span>`:''}</span>`;
 const state_=state?` data-state="${state}"`:'';
 if(href)return `<a class="iq-settings-row" href="${esc(href)}"${state_} ${attrs}>${inner}<span class="iq-settings-row-aside">${aside}</span><span class="iq-settings-row-chevron">${icon('chevron',17)}</span></a>`;
 if(button)return `<button type="button" class="iq-settings-row" ${button}${state_} ${attrs}>${inner}<span class="iq-settings-row-aside">${aside}</span><span class="iq-settings-row-chevron">${icon('chevron',17)}</span></button>`;
 return `<${tag} class="iq-settings-row"${state_} ${attrs}>${inner}<span class="iq-settings-row-aside">${aside}</span><span class="iq-settings-row-actions">${actions}</span></${tag}>`;
}
export const tile=glyph=>`<span class="iq-settings-row-tile">${icon(glyph,18)}</span>`;
export const facts=items=>`<dl class="iq-settings-facts">${items.map(([term,value,hint=''])=>`<div><dt>${esc(term)}${hint?`<small>${esc(hint)}</small>`:''}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
export const copyValue=(value,label)=>`<code>${esc(value)}</code>${ui.ib('copy',label,'ghost sm',`data-copy="${esc(value)}"`)}`;
export const fieldRow=(label,hint,control)=>`<div class="iq-settings-field-row"><div class="iq-settings-field-label"><span>${esc(label)}</span>${hint?`<small>${esc(hint)}</small>`:''}</div><div>${control}</div></div>`;
export const lock=text=>`<p class="iq-settings-lock">${icon('lock',17)}<span>${esc(text)}</span></p>`;
export const empty=({title,body='',action='',glyph='folderOpen',tone=''})=>`<div class="iq-empty compact${tone?' '+tone:''}"><span class="iq-settings-row-tile">${icon(glyph,20)}</span><h3>${esc(title)}</h3>${body?`<p>${esc(body)}</p>`:''}${action}</div>`;
export const savebar=(label='Сохранить')=>`<div class="iq-settings-savebar" role="region" aria-label="Несохранённые изменения" hidden><span class="iq-settings-savebar-status">Есть несохранённые изменения</span><span class="iq-settings-savebar-actions">${ui.btn('Отменить','ghost sm','','data-reset-form')}<button type="submit" class="iq-btn primary sm">${esc(label)}</button></span></div>`;
export const skeleton=(rows=3)=>`<div class="iq-loading iq-settings-skeleton" role="status" aria-label="Загружаем раздел"><i></i>${'<span></span>'.repeat(rows)}</div>`;
export const secret=({label,value,note,copyLabel})=>`<div class="iq-secret"><div class="iq-field"><label class="iq-control-label" for="iq-secret-value">${esc(label)}</label><div class="iq-secret-value"><span class="iq-input-shell"><input id="iq-secret-value" name="secret" value="${esc(value)}" readonly spellcheck="false"></span>${ui.btn('Скопировать','secondary sm','copy',`data-copy="${esc(value)}"`)}</div></div><p class="iq-secret-note">${icon('warning',16)}<span>${esc(note)}</span></p></div>`;
export const choiceList=(name,legend,options,value)=>`<fieldset class="iq-choice-list"><legend>${esc(legend)}</legend>${options.map(([id,label,hint])=>`<label><input type="radio" name="${esc(name)}" value="${esc(id)}" ${id===value?'checked':''}><b>${esc(label)}</b>${hint?`<small>${esc(hint)}</small>`:''}</label>`).join('')}</fieldset>`;
export const badge=(text,tone='neutral')=>`<span class="iq-badge soft ${tone}">${esc(text)}</span>`;
export const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';
/** A settings row's person: the DS avatar (its 32px default step, the person's stable tone, the photo over the initials). */
export const avatar=(name,id='',image=null)=>ui.personAvatar({id:id||undefined,name:String(name||''),image:typeof image==='string'?image:undefined},{size:''});
