// The Workbench's part of the task drawer (design-v2 §5.4, §11.3): the «Участвую» toggle in the header and, when
// someone asks the person something on this task, the request card with its verb, a text answer, and «Отложить до».
// Reading never resolves a request; everything here is checked again by the server.
import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {ageLabel,dayLabel,snoozePresets,VERBS} from './model.js';
import {cancelPending,commitPending as pendingCommit,hold,isPending,release} from './pending.js';

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
        <div class="dsk-request-card-actions">${isPending(r.id)?waitingLine():`
          ${verb.inline?`<button type="button" class="iq-btn primary sm" data-card-verb>${icon('check',16)}<span>${esc(verb.label)}</span></button>`:''}
          <button type="button" class="iq-btn ${verb.inline?'secondary':'primary'} sm" data-card-answer aria-expanded="false">${icon('undo',16)}<span>Ответить</span></button>
          ${presets.length?ui.menu(`<button type="button" class="iq-btn ghost sm">${icon('clock',16)}<span>Отложить до</span>${icon('down',14)}</button>`,presets.map((p,i)=>({label:p.label,action:`card-snooze:${i}`}))):''}
          <span class="dsk-hint">Чтение не закрывает запрос</span>`}</div>
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
    if(button.hasAttribute('data-card-verb')){
      if(request.kind==='approval'&&request.approvalId){approveLater(card,request);return;}
      void(async()=>{
        button.disabled=true;
        try{
          const resolved=await api.resolveRequest(projectId,request.id,request.revision);
          notify({tone:'success',message:'Запрос закрыт',action:{label:'Отменить',run:()=>void api.reopenRequest(projectId,request.id,resolved.revision)
            .then(()=>load()).then(()=>onChanged?.()).catch(error=>notify({tone:'danger',message:'Не удалось отменить',description:error.message}))},duration:8000});
          await load();onChanged?.();
        }catch(error){button.disabled=false;notify({tone:'danger',message:'Не получилось',description:error.message});}
      })();
    }
    else if(button.hasAttribute('data-approve-undo'))cancelPending(request.id);
    else if(button.hasAttribute('data-card-answer')){const form=card.querySelector('[data-answer]');form.hidden=!form.hidden;button.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)form.querySelector('textarea').focus();}
    else if(button.hasAttribute('data-answer-send'))send(card);
    else if(button.hasAttribute('data-answer-cancel')){const form=card.querySelector('[data-answer]');form.hidden=true;card.querySelector('[data-card-answer]').setAttribute('aria-expanded','false');card.querySelector('[data-card-answer]').focus();}
  },{signal:events.signal});
  /**
   * «Утвердить» cannot be taken back on the server: the card says «Утверждено · Отменить» for 8 s and only then
   * decides, against the approval revision the request was made on (review R4 F3). Closing the drawer decides now.
   */
  // The decision waits in the shared registry (pending.js): a re-render keeps its line, the Workbench row of the same
  // request cannot decide it again, either place can take it back, and leaving the page asks first (review R5 N2, N3).
  const announce=text=>notify({tone:'info',message:text,duration:2500});
  const waitingLine=()=>`<p class="dsk-row-done" role="status">${icon('checkCircle',16)}<span><b>Утверждено</b> · решение уйдёт через 8 с</span><button type="button" class="iq-btn ghost sm" data-approve-undo>Отменить</button></p>`;
  const started=new Set();// decisions started here: closing the drawer sends them at once
  function approveLater(card,request){
    if(isPending(request.id))return;
    started.add(request.id);
    let sent=false;
    const base=request.sourceRevision??null;
    const decide=async()=>{
      if(sent)return;sent=true;clearTimeout(timer);release(request.id);
      try{
        const revision=base??(await api.approval(projectId,request.approvalId)).revision;
        await api.decide(projectId,request.approvalId,revision,'approved');notify({tone:'success',message:'Утверждено'});
      }catch(error){notify({tone:'danger',message:'Не удалось утвердить',description:error.message});}
      if(!destroyed)await load();onChanged?.();
    };
    const timer=setTimeout(()=>void decide(),8000);
    hold(request.id,{commit:decide,leave:()=>{if(sent)return;sent=true;clearTimeout(timer);return base==null?undefined:api.decideOnLeave(projectId,request.approvalId,base,'approved');},cancel:()=>{if(sent)return;sent=true;clearTimeout(timer);if(!destroyed){renderRequests();focusCard(request.id);}announce('Отменено');}});
    card.querySelector('.dsk-request-card-actions').innerHTML=waitingLine();
    card.querySelector('[data-approve-undo]').focus();
  }
  const focusCard=id=>section.querySelector(`[data-request="${CSS.escape(id)}"] [data-card-verb],[data-request="${CSS.escape(id)}"] [data-card-answer]`)?.focus();
  // The answer lives inside the drawer's own form, so it is a group with its own send button (never a nested form).
  let sending=false;
  function send(card){
    if(sending)return;
    const request=state?.requests?.find(r=>r.id===card?.dataset.request),area=card.querySelector('[data-answer] textarea');
    const text=area.value.trim();if(!request)return;if(!text){area.focus();return;}
    sending=true;
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
      finally{sending=false;}
    })();
  }
  // A decision taken back (or sent) elsewhere redraws the card, keeping the focus on it.
  window.addEventListener('dsk-pending-change',event=>{
    if(destroyed||!state?.requests?.some(r=>r.id===event.detail.requestId))return;
    const had=section.contains(document.activeElement);renderRequests();if(had)focusCard(event.detail.requestId);
  },{signal:events.signal});
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
  return {
    /** An answer typed and not sent is an unsaved change of the drawer: closing asks first (review R4 F5). */
    dirty:()=>[...section.querySelectorAll('[data-answer]:not([hidden]) textarea')].some(area=>area.value.trim()!==''),
    // A decision still waiting is sent when the drawer closes (the Workbench row's own waits for its timer).
    destroy(){destroyed=true;for(const id of started)if(isPending(id))void pendingCommit(id);events.abort();join.remove();},
  };
}
