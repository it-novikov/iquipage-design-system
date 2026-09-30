// The Workbench's part of the task drawer (design-v2 §5.4, §11.3): the «Участвую» toggle in the header and, when
// someone asks the person something on this task, the request card with its verb, a text answer, and «Отложить до».
// Reading never resolves a request; everything here is checked again by the server.
import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {ageLabel,dayLabel,snoozePresets,VERBS} from './model.js';

const ACTION_OF={review:'review',approval:'approve',do:'do',answer:'question',decision:'decision'};

export function mountPersonalPanel(section,{api,projectId,taskId,actorId,actions,parts,answer=false,onChanged}){
  const events=new AbortController();
  let state=null,destroyed=false;
  const join=document.createElement('button');
  join.type='button';join.className='iq-btn ghost sm dsk-join';join.dataset.join='';join.hidden=!parts.personal;
  actions?.prepend(join);

  function renderJoin(){
    const on=!!state?.participating;
    join.setAttribute('aria-pressed',String(on));
    join.innerHTML=`${icon('users',16)}<span>${on?'Участвую':'Участвовать'}</span>`;
    join.title=on?'Задача на вашем Рабочем столе, изменения приходят в «Изменилось». Нажмите, чтобы выйти':'Держать задачу на Рабочем столе и получать её изменения';
  }
  function renderRequests(){
    const mine=(state?.requests||[]).filter(r=>r.status==='open'&&r.recipientId===actorId);
    if(!mine.length){section.hidden=true;section.innerHTML='';return;}
    section.hidden=false;
    section.innerHTML=mine.map(r=>{
      const verb=VERBS[ACTION_OF[r.kind]]||VERBS.question,presets=parts.personal?snoozePresets(r.neededBy):[];
      return `<article class="dsk-request-card" data-request="${esc(r.id)}">
        <div class="dsk-request-card-head">${ui.personAvatar({id:r.requestedById,name:r.requestedByName||'?'},{size:'sm'})}
          <p class="dsk-req-ask"><b>${esc(r.requestedByName||'Участник проекта')}</b> ${esc(verb.asks)} <span class="dsk-age">${esc(ageLabel(r.createdAt))}</span></p>
          ${r.neededBy?`<span class="dsk-when">${icon('help',14)}<span class="dsk-when-label">Нужно до</span>${esc(dayLabel(r.neededBy))}</span>`:''}</div>
        ${r.note?`<p class="dsk-request-card-note">${esc(r.note)}</p>`:''}
        <div class="dsk-request-card-actions">
          ${verb.inline?`<button type="button" class="iq-btn primary sm" data-card-verb>${icon('check',16)}<span>${esc(verb.label)}</span></button>`:''}
          <button type="button" class="iq-btn ${verb.inline?'secondary':'primary'} sm" data-card-answer aria-expanded="false">${icon('undo',16)}<span>Ответить</span></button>
          ${presets.length?ui.menu(`<button type="button" class="iq-btn ghost sm">${icon('clock',16)}<span>Отложить до</span>${icon('down',14)}</button>`,presets.map((p,i)=>({label:p.label,action:`card-snooze:${i}`}))):''}
          <span class="dsk-hint">Чтение не закрывает запрос</span></div>
        <div class="dsk-answer" data-answer role="group" aria-label="Ответ на запрос" hidden><label class="dsk-answer-field"><span class="sr-only">Ваш ответ</span>
          <textarea rows="3" maxlength="10000" required placeholder="Ваш ответ — он появится в обсуждении задачи"></textarea></label>
          <div class="dsk-request-card-actions"><button type="button" class="iq-btn primary sm" data-answer-send aria-keyshortcuts="Meta+Enter">${icon('send',16)}<span>Отправить и закрыть запрос</span></button>${ui.btn('Отмена','ghost sm','','data-answer-cancel')}</div></div>
      </article>`;
    }).join('');
    if(answer){const first=section.querySelector('[data-card-answer]');first?.click();answer=false;}
  }
  async function load(){
    try{state=await api.personal(projectId,taskId);}catch{state=null;}
    if(destroyed)return;renderJoin();renderRequests();
  }
  join.addEventListener('click',()=>void(async()=>{
    if(!state)return;join.disabled=true;
    try{
      await api.participation(projectId,taskId,state.participationRevision,!state.participating);
      await load();onChanged?.();
      notify({tone:'info',message:state.participating?'Вы участвуете':'Вы больше не участвуете',duration:3000});
    }catch(error){notify({tone:'danger',message:'Не получилось',description:error.message});}
    finally{join.disabled=false;}
  })(),{signal:events.signal});
  section.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    const card=button.closest('[data-request]'),request=state?.requests?.find(r=>r.id===card?.dataset.request);if(!request)return;
    if(button.hasAttribute('data-card-verb'))void(async()=>{
      button.disabled=true;
      try{
        if(request.kind==='approval'&&request.approvalId){const approval=await api.approval(projectId,request.approvalId);await api.decide(projectId,request.approvalId,approval.revision,'approved');}
        else await api.resolveRequest(projectId,request.id,request.revision);
        notify({tone:'success',message:'Запрос закрыт'});await load();onChanged?.();
      }catch(error){button.disabled=false;notify({tone:'danger',message:'Не получилось',description:error.message});}
    })();
    else if(button.hasAttribute('data-card-answer')){const form=card.querySelector('[data-answer]');form.hidden=!form.hidden;button.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)form.querySelector('textarea').focus();}
    else if(button.hasAttribute('data-answer-send'))send(card);
    else if(button.hasAttribute('data-answer-cancel')){const form=card.querySelector('[data-answer]');form.hidden=true;card.querySelector('[data-card-answer]').setAttribute('aria-expanded','false');card.querySelector('[data-card-answer]').focus();}
  },{signal:events.signal});
  // The answer lives inside the drawer's own form, so it is a group with its own send button (never a nested form).
  function send(card){
    const request=state?.requests?.find(r=>r.id===card?.dataset.request),area=card.querySelector('[data-answer] textarea');
    const text=area.value.trim();if(!request)return;if(!text){area.focus();return;}
    void(async()=>{
      const submit=card.querySelector('[data-answer-send]');submit.disabled=true;
      try{
        // A free-text answer (design-v2 §11.7 q.2): into the request's own thread, or a new one on the task; then the
        // request is resolved. Resolving the thread itself would resolve its requests too, so only the message goes.
        if(request.threadId){const thread=await api.thread(projectId,request.threadId);await api.reply(projectId,request.threadId,thread.revision,text);}
        else await api.startThread(projectId,taskId,text);
        await api.resolveRequest(projectId,request.id,request.revision).catch(error=>{if(error.code!=='REQUEST_CLOSED')throw error;});
        notify({tone:'success',message:'Ответ отправлен, запрос закрыт'});await load();onChanged?.({discussion:true});
      }catch(error){submit.disabled=false;notify({tone:'danger',message:'Не удалось отправить ответ',description:error.message});}
    })();
  }
  // The card is not part of the task's fields: its typing never marks the drawer's form as changed.
  for(const type of ['input','change'])section.addEventListener(type,event=>event.stopPropagation(),{signal:events.signal});
  section.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&event.target.closest('[data-answer]')){event.preventDefault();send(event.target.closest('[data-request]'));}
    // Enter must never reach the drawer's form from here.
    else if(event.key==='Enter'&&event.target.matches('[data-answer] textarea'))event.stopPropagation();
  },{signal:events.signal});
  section.addEventListener('iq-action',event=>{
    const action=String(event.detail.action);if(!action.startsWith('card-snooze:'))return;
    const card=event.target.closest('[data-request]'),request=state?.requests?.find(r=>r.id===card?.dataset.request);
    const preset=snoozePresets(request?.neededBy)[Number(action.slice(12))];if(!preset)return;
    void api.snooze(projectId,taskId,state.snoozeRevision,preset.until.toISOString())
      .then(()=>{notify({tone:'info',message:`Отложено: ${preset.label.toLowerCase()}`});return load();}).then(()=>onChanged?.())
      .catch(error=>notify({tone:'danger',message:'Не удалось отложить',description:error.message}));
  },{signal:events.signal});
  renderJoin();void load();
  return {destroy(){destroyed=true;events.abort();join.remove();}};
}
