import {icon,escapeHTML as esc,registerCore} from '../dist/vendor/core.js';
export {icon,esc};
export const button=(action,label,glyph,variant='ghost',extra='')=>`<button type="button" class="iq-btn ${variant} sm" data-map-action="${action}" ${extra}>${glyph?icon(glyph,17):''}<span>${esc(label)}</span></button>`;
export const input=(name,label,value='',{type='text',placeholder='',required=false,maxlength=240}={})=>`<label class="iq-field"><span class="iq-control-label">${esc(label)}</span><span class="iq-input-shell"><input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required?'required':''} maxlength="${maxlength}"></span></label>`;
export const textarea=(name,label,value='',rows=4)=>`<label class="iq-field"><span class="iq-control-label">${esc(label)}</span><span class="iq-input-shell"><textarea name="${name}" rows="${rows}" maxlength="50000">${esc(value)}</textarea></span></label>`;
export const select=(name,label,value,options)=>`<iq-select name="${name}" label="${esc(label)}" value="${esc(value)}">${options.map(([id,text])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(text)}</option>`).join('')}</iq-select>`;
export const check=(name,label,checked=false)=>`<label class="iq-check"><input type="checkbox" name="${name}" ${checked?'checked':''}><span class="iq-check-box">${icon('check',14)}</span><span>${esc(label)}</span></label>`;
export const pretty=value=>`<pre class="map-json">${esc(JSON.stringify(value,null,2))}</pre>`;
export const date=value=>value?new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
export const statusNames={draft:'Не начата',active:'В работе',paused:'На паузе',archived:'В архиве',queued:'В очереди',running:'Выполняется',awaiting_approval:'Нужно подтверждение',succeeded:'Готово',failed:'Ошибка',blocked:'Не подключено',interrupted:'Прервано',rejected:'Отклонено',cancelled:'Остановлено',enabled:'Включено'};
export function download(name,value,type='application/json') {
  const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
/** Exact IQUIPAGE dialog composition, with host-owned form and asynchronous save. */
export function dialog({title,description='',body='',submitLabel='',wide=false,onSubmit,mount}) {
  registerCore();const el=document.createElement('iq-dialog');el.className='map-dialog';
  el.innerHTML=`<form class="map-dialog-form"><header class="iq-dialog-head"><div><h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div><button type="button" class="iq-btn ghost icon sm" data-close aria-label="Закрыть">${icon('x',18)}</button></header><div class="map-dialog-body">${body}</div><p class="map-form-error" role="alert" hidden></p><footer class="iq-dialog-footer"><button type="button" class="iq-btn secondary sm" data-close>${submitLabel?'Отмена':'Закрыть'}</button>${submitLabel?`<button type="submit" class="iq-btn primary sm">${esc(submitLabel)}</button>`:''}</footer></form>`;
  if(wide)el.setAttribute('data-size','wide');document.body.append(el);
  const form=el.querySelector('form'),error=el.querySelector('[role=alert]');
  let busy=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!onSubmit)return;error.hidden=true;
    try{busy=true;el.setAttribute('persistent','');form.querySelectorAll('button[type=submit],[data-close]').forEach(b=>b.disabled=true);
      const keep=await onSubmit(new FormData(form),form,el);if(keep!==false)el.close(true);
    }catch(e){error.textContent=e.message||'Не удалось выполнить действие.';error.hidden=false;}
    finally{busy=false;el.removeAttribute('persistent');form.querySelectorAll('button[type=submit],[data-close]').forEach(b=>b.disabled=false);}
  });
  el.addEventListener('iq-close',()=>el.remove(),{once:true});mount?.(el,form);el.show();return el;
}
export function previewDocument(document) {
  const objects=document.objects||[];if(!objects.length)return'<div class="map-template-preview empty">Чистая карта</div>';
  const minX=Math.min(...objects.map(o=>o.x)),minY=Math.min(...objects.map(o=>o.y));
  const maxX=Math.max(...objects.map(o=>o.x+o.width)),maxY=Math.max(...objects.map(o=>o.y+o.height));
  const w=Math.max(1,maxX-minX),h=Math.max(1,maxY-minY),scale=Math.min(300/w,140/h);
  return `<div class="map-template-preview" aria-hidden="true"><div style="width:${w*scale}px;height:${h*scale}px">${objects.map(o=>`<i class="map-preview-object" data-tone="${['sand','lavender','mint','sky','rose'].includes(o.color)?o.color:'neutral'}" data-type="${o.type==='frame'?'frame':'object'}" style="left:${(o.x-minX)*scale}px;top:${(o.y-minY)*scale}px;width:${o.width*scale}px;height:${o.height*scale}px"></i>`).join('')}</div></div>`;
}
