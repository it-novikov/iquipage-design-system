import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {dialog,input,select,check,date,pretty} from '../ui/src/ui.js';

const states={running:'В работе',awaiting_approval:'Ожидает решения',completed:'Завершён',failed:'Ошибка',cancelled:'Остановлен',expired:'Срок истёк',proposed:'Ожидает решения',approved:'Подтверждено',rejected:'Отклонено'};
const permissions=[['tasks:read','Читать задачи'],['tasks:write','Изменять задачи'],['threads:read','Читать обсуждения'],['threads:write','Писать в обсуждения'],['maps:read','Читать карты'],['maps:write','Изменять карты']];
const active=r=>['running','awaiting_approval'].includes(r.state);
const summary=s=>`${s.affectedCount} задач · на доску: ${s.enteringBoard} · с доски: ${s.leavingBoard}`;

/** External agents only. This screen grants scoped access, never starts a shell or LLM. */
export async function mountAgents(root,{repository,project,onBack}){
  const client=repository.client,base='/projects/'+encodeURIComponent(project.id),abort=new AbortController();
  let closed=false,modal=null,sequence=0,runs=[],approvals=[],grants=[],runCursor=null,approvalCursor=null;
  function show(options){
    modal=dialog(options);
    modal.addEventListener('iq-close',()=>{modal=null;void refresh().catch(fail);},{once:true});
    return modal;
  }
  function fail(error){if(closed)return;if(modal){const el=modal.querySelector('[role=alert]');el.textContent=error.message;el.hidden=false;}else show({title:'Не удалось загрузить данные',description:error.message});}
  function render(){
    if(closed)return;
    root.innerHTML=`<section class="host-settings task-settings-page">
      ${ui.btn('Настройки проекта','ghost sm','left','data-agents-back')}<h1>Агенты и подтверждения</h1>
      <p>Подключите своего агента по API. Доступ ограничен проектом, выбранными правами и сроком. Планы агента применяются только после решения человека.</p>
      <h2>Предложения</h2><div class="iq-list">${approvals.length?approvals.map(a=>`<div class="iq-list-item"><span>${esc(a.agentName)} · ${esc(states[a.status])}<br><small>${esc(summary(a.summary))} · до ${esc(date(a.expiresAt))}</small></span>${ui.btn('Рассмотреть','secondary sm','','data-approval="'+esc(a.id)+'"')}</div>`).join(''):'<p>Предложений пока нет. Здесь появятся конкретные изменения для проверки перед применением.</p>'}</div>
      ${approvalCursor?ui.btn('Ещё предложения','ghost sm','','data-more-approvals'):''}
      <h2>Запуски</h2><div class="iq-list">${runs.length?runs.map(r=>`<div class="iq-list-item"><span>${esc(r.goal)}<br><small>${esc(states[r.state])} · предложений ${r.usedProposals} из ${r.maxProposals}</small></span>${ui.btn('Открыть','ghost sm','','data-run="'+esc(r.id)+'"')}</div>`).join(''):'<p>Агент ещё не зарегистрировал запуск.</p>'}</div>
      ${runCursor?ui.btn('Ещё запуски','ghost sm','','data-more-runs'):''}
      ${project.role==='admin'?`<h2>Разрешения</h2>${ui.btn('Подключить агента','primary sm','plus','data-agent-grant')}<div class="iq-list">${grants.map(g=>`<div class="iq-list-item"><span>${esc(g.name)}<br><small>${esc(g.capabilities.map(c=>permissions.find(p=>p[0]===c)?.[1]||c).join(' · '))}<br>${g.revokedAt?'Отозвано':new Date(g.expiresAt)<=new Date()?'Срок истёк':'До '+esc(date(g.expiresAt))}</small></span>${!g.revokedAt&&new Date(g.expiresAt)>new Date()?ui.btn('Отозвать','ghost sm','','data-agent-revoke="'+esc(g.id)+'"'):''}</div>`).join('')}</div>`:''}
    </section>`;
  }
  async function refresh(){
    if(closed||modal)return;const request=++sequence;
    const [r,a,g]=await Promise.all([client.request(base+'/agent-runs'),client.request(base+'/approvals'),project.role==='admin'?client.request(base+'/agents'):[]]);
    if(closed||modal||sequence!==request)return;
    runs=r.items;runCursor=r.nextCursor;approvals=a.items;approvalCursor=a.nextCursor;grants=g;render();
  }
  async function review(id){
    const detail=await client.request(base+'/approvals/'+id);
    let cursor=null,items=[],loading=false;
    const canDecide=project.role!=='reader'&&detail.status==='proposed'&&new Date(detail.expiresAt)>new Date();
    const el=show({title:'Изменения агента',wide:true,
      description:'Подтверждение разрешает только этот план. Агент отдельно применяет его; устаревший план не выполнится.',
      body:`<p>${esc(summary(detail.preview))}</p>${(detail.preview.details||[]).map(d=>`<p><strong>${esc(d.label)}</strong> — ${esc(d.description)}</p>`).join('')}
        <div data-agent-effects aria-live="polite"></div>${ui.btn('Показать ещё изменения','secondary sm','','data-effects-more hidden')}
        <details class="iq-accordion"><summary>Точный состав плана</summary>${pretty({command:detail.command,releases:detail.preview.releases,actionHash:detail.actionHash,application:detail.application})}</details>
        ${canDecide?select('decision','Решение','approved',[['approved','Подтвердить план'],['rejected','Отклонить план']]):`<p>${esc(states[detail.status])} · до ${esc(date(detail.expiresAt))}</p>`}`,
      submitLabel:canDecide?'Сохранить решение':'',onSubmit:async values=>{
        if(loading||cursor)throw Error('Сначала просмотрите остальные изменения.');
        const body={baseRevision:detail.revision,status:values.get('decision')};
        await client.request(base+'/approvals/'+id+'/decision','POST',body,await repository.key('approval:'+id,body));
      }});
    async function more(){
      loading=true;const submit=el.querySelector('[type=submit]');if(submit)submit.disabled=true;
      try{
        const page=await client.request(base+'/approvals/'+id+'/effects'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
        if(!el.isConnected)return;items.push(...page.items);cursor=page.nextCursor;
        el.querySelector('[data-agent-effects]').innerHTML=`<div class="iq-list">${items.map(e=>`<div class="iq-list-item"><div><strong>${esc(e.after.displayId)} · ${esc(e.after.title)}</strong><details class="iq-accordion"><summary>До и после</summary>${pretty({before:e.before,after:e.after})}</details></div></div>`).join('')}</div>`;
        el.querySelector('[data-effects-more]').hidden=!cursor;
      }finally{loading=false;if(submit)submit.disabled=!!cursor;}
    }
    el.querySelector('[data-effects-more]').onclick=()=>{if(!loading)void more().catch(fail);};
    try{await more();}catch(error){if(el.isConnected){el.querySelector('[type=submit]')?.setAttribute('disabled','');fail(error);}}
  }
  async function openRun(id){
    const run=await client.request(base+'/agent-runs/'+id),canStop=active(run)&&(run.initiatorId===repository.context.actorId||project.role==='admin');
    show({title:'Запуск агента',description:run.goal,
      body:`<p>${esc(states[run.state])} · до ${esc(date(run.expiresAt))}</p><p>Предложений: ${run.usedProposals} из ${run.maxProposals}.</p>${run.errorCode?`<p>${esc(run.errorCode)}</p>`:''}${run.plans.map(p=>`<details class="iq-accordion"><summary>${esc(summary(p.summary))} · ${esc(states[p.approval]||'Без решения')}</summary>${pretty({planId:p.id,receipt:p.receipt})}</details>`).join('')}`,
      submitLabel:canStop?'Остановить запуск':'',onSubmit:async()=>{
        const body={baseRevision:run.revision,state:'cancelled'};
        await client.request(base+'/agent-runs/'+id+'/finish','POST',body,await repository.key('run-stop:'+id,body));
      }});
  }
  function grant(){
    show({title:'Подключить агента',description:'Секрет будет показан один раз. Передайте его только своему агенту по защищённому каналу.',
      body:input('name','Название агента','',{required:true,maxlength:100})+select('ttl','Срок доступа','3600',[['3600','1 час'],['86400','24 часа']])+permissions.map(([value,label])=>check(value,label,value==='tasks:read')).join(''),
      submitLabel:'Выдать разрешение',onSubmit:async(values,_form,el)=>{
        const capabilities=permissions.filter(([key])=>values.has(key)).map(([key])=>key);
        const grant=await client.request(base+'/agents','POST',{name:values.get('name'),capabilities,expiresInSeconds:Number(values.get('ttl'))});
        el.querySelector('.map-dialog-body').innerHTML=input('secret','Секрет доступа',grant.token,{maxlength:100})+'<p>Сохраните сейчас: повторно показать секрет нельзя. Не добавляйте его в код, задачи или историю чата.</p>';
        const field=el.querySelector('[name=secret]');field.readOnly=true;field.select();
        el.querySelector('[type=submit]').remove();el.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';return false;
      }});
  }
  root.addEventListener('click',event=>{void(async()=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-agents-back'))return onBack();
    if(target.dataset.approval)return review(target.dataset.approval);
    if(target.dataset.run)return openRun(target.dataset.run);
    if(target.hasAttribute('data-agent-grant'))return grant();
    if(target.dataset.agentRevoke){const id=target.dataset.agentRevoke;return show({title:'Отозвать доступ агента?',description:'Новые запросы и применение незавершённых планов будут запрещены.',submitLabel:'Отозвать',onSubmit:()=>client.request(base+'/agents/'+id,'DELETE')});}
    const isRuns=target.hasAttribute('data-more-runs'),isApprovals=target.hasAttribute('data-more-approvals');
    if(isRuns||isApprovals){target.disabled=true;try{const page=await client.request(base+(isRuns?'/agent-runs':'/approvals')+'?cursor='+encodeURIComponent(isRuns?runCursor:approvalCursor));if(closed)return;if(isRuns){runs.push(...page.items);runCursor=page.nextCursor;}else{approvals.push(...page.items);approvalCursor=page.nextCursor;}render();}finally{target.disabled=false;}}
  })().catch(fail);},{signal:abort.signal});
  const unsubscribe=repository.subscribe(()=>{void refresh().catch(fail);});
  await refresh();
  return {readyToLeave:()=>!modal,destroy(){closed=true;sequence++;abort.abort();unsubscribe();modal?.close(true);root.replaceChildren();}};
}
