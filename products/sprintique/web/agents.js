import {ui,icon,escapeHTML as esc,enhance,formatDateTime,count} from '@iquipage/web/core';
import {dialog,input,select,pretty} from '../ui/src/ui.js';
import * as s from './settings-ui.js';
import {can} from './permissions.js';

const states={running:['В работе','info'],awaiting_approval:['Ждёт решения','warning'],completed:['Завершён','success'],failed:['Ошибка','danger'],cancelled:['Остановлен','neutral'],expired:['Срок истёк','neutral'],proposed:['Ждёт решения','warning'],approved:['Подтверждено','success'],rejected:['Отклонено','neutral']};
const areas=[['tasks','Задачи'],['threads','Обсуждения'],['maps','Карты']];
const permissionName=value=>{const [area,mode]=value.split(':');return `${mode==='write'?'Изменять':'Читать'} ${(areas.find(a=>a[0]===area)?.[1]||area).toLocaleLowerCase('ru')}`;};
const plural=(n,[one,few,many])=>count(n,{one,few,many});
const summary=v=>[`Изменит ${plural(v.affectedCount||0,['задачу','задачи','задач'])}`,v.enteringBoard?`добавит на доску ${v.enteringBoard}`:'',v.leavingBoard?`уберёт с доски ${v.leavingBoard}`:''].filter(Boolean).join(', ');
const when=value=>value?formatDateTime(value):'';
const isActive=r=>['running','awaiting_approval'].includes(r.state);
const pending=a=>a.status==='proposed'&&new Date(a.expiresAt)>new Date();
const grantState=g=>g.revokedAt?['Отозван','neutral']:new Date(g.expiresAt)<=new Date()?['Срок истёк','neutral']:['Активен','info'];

/** External agents only. This screen grants scoped access, never starts a shell or LLM. Proposals need a human decision. */
export async function mountAgents(root,{repository,project,tools,onCounts=()=>{}}){
  const client=repository.client,base='/projects/'+encodeURIComponent(project.id),abort=new AbortController(),admin=can(project,'agents.manage');
  let closed=false,modal=null,sequence=0,runs=[],approvals=[],grants=[],names=new Map(),runCursor=null,approvalCursor=null;
  if(tools&&admin)tools.innerHTML=ui.btn('Выдать API-доступ','primary sm','plus','data-agent-grant');
  function show(options){
    modal=dialog(options);
    modal.addEventListener('iq-close',()=>{modal=null;void refresh().catch(fail);onCounts();},{once:true});
    return modal;
  }
  function fail(error){if(closed)return;if(modal){const el=modal.querySelector('[role=alert]');el.textContent=error.message;el.hidden=false;}else show({title:'Не удалось загрузить данные',description:error.message});}
  const approvalRow=a=>s.row({media:s.tile('spark'),title:summary(a.summary),meta:[esc(a.agentName),pending(a)?`Решить до ${esc(when(a.expiresAt))}`:''],aside:s.badge(...states[a.status]||[a.status]),button:`data-approval="${esc(a.id)}"`,state:pending(a)?'':'muted'});
  const grantRow=g=>{const [label,tone]=grantState(g),live=tone==='info';return s.row({media:s.tile('bolt'),title:g.name,meta:[esc(g.capabilities.map(permissionName).join(', ')),names.get(g.initiatorId)?`Выдал ${esc(names.get(g.initiatorId))}`:'',live?`Действует до ${esc(when(g.expiresAt))}`:''],aside:s.badge(label,tone),actions:live?ui.btn('Отозвать','ghost sm','',`data-agent-revoke="${esc(g.id)}"`):'',state:live?'':'muted'});};
  const runRow=r=>s.row({media:s.tile('play'),title:r.goal,meta:[r.createdAt?`Начат ${esc(when(r.createdAt))}`:'',`Предложений ${r.usedProposals} из ${r.maxProposals}`],aside:s.badge(...states[r.state]||[r.state]),button:`data-run="${esc(r.id)}"`});
  function render(){
    if(closed)return;
    const lock=can(project,'approvals.decide')?'':s.lock('Вы можете только просматривать. Решения по предложениям принимают те, у кого есть право «Решать по предложениям агентов».');
    if(!runs.length&&!approvals.length&&!grants.length){
      root.innerHTML=lock+s.panel(s.empty({title:'API-доступ ещё не выдан',body:'Агент работает по API только в этом проекте, с выбранными правами и ограниченным сроком. Его изменения применяются после решения человека.',glyph:'spark'}));return;
    }
    const waiting=approvals.filter(pending),decided=approvals.filter(a=>!pending(a));
    root.innerHTML=`${lock}
      ${s.group({title:'Ждут решения',count:waiting.length,description:'Агент предлагает изменения. Они применятся только после подтверждения.',body:s.panel(waiting.map(approvalRow).join('')||s.empty({title:'Решать нечего',body:'Новые предложения агентов появятся здесь.',glyph:'checkCircle',tone:'success'}))+(decided.length||approvalCursor?`<details class="iq-accordion iq-settings-past"><summary>Решённые предложения (${decided.length}${approvalCursor?'+':''}) ${icon('down',16)}</summary>${s.panel(decided.map(approvalRow).join('')+(approvalCursor?`<div class="iq-settings-panel-foot">${ui.btn('Показать ещё','ghost sm','','data-more-approvals')}</div>`:''))}</details>`:'')})}
      ${admin?s.group({title:'API-доступ проекта',count:grants.filter(g=>grantState(g)[1]==='info').length,description:'Доступ ограничен проектом, правами и сроком. Отзыв действует сразу.',body:s.panel(grants.map(grantRow).join('')||s.empty({title:'Нет API-подключений',body:'Выдайте агенту доступ с нужными правами.',action:ui.btn('Выдать API-доступ','secondary sm','plus','data-agent-grant'),glyph:'bolt'}))}):''}
      ${s.group({title:'Запуски',description:'Что агенты делали в проекте.',body:s.panel(runs.map(runRow).join('')+(runCursor?`<div class="iq-settings-panel-foot">${ui.btn('Показать ещё','ghost sm','','data-more-runs')}</div>`:'')||s.empty({title:'Запусков пока не было',glyph:'play'}))})}`;
  }
  async function refresh(){
    if(closed||modal)return;const request=++sequence;
    const [r,a,g,m]=await Promise.all([client.request(base+'/agent-runs'),client.request(base+'/approvals'),admin?client.request(base+'/agents'):[],admin?client.request(base+'/members').catch(()=>[]):[]]);
    if(closed||modal||sequence!==request)return;
    runs=r.items;runCursor=r.nextCursor;approvals=a.items;approvalCursor=a.nextCursor;grants=g;names=new Map(m.map(x=>[x.id,x.name]));render();
  }
  async function review(id){
    const detail=await client.request(base+'/approvals/'+id);
    let cursor=null,items=[],loading=false;
    const canDecide=can(project,'approvals.decide')&&pending(detail);
    const el=show({title:'Предложение агента',wide:true,
      description:canDecide?'Подтверждение разрешает только этот план. Устаревший план не выполнится.':`${(states[detail.status]||[detail.status])[0]}.`,
      body:`<p><b>${esc(summary(detail.preview))}</b></p>${(detail.preview.details||[]).map(d=>`<p><b>${esc(d.label)}</b>. ${esc(d.description)}</p>`).join('')}
        <div data-agent-effects aria-live="polite"></div>${ui.btn('Показать ещё изменения','secondary sm','','data-effects-more hidden')}
        <details class="iq-accordion"><summary>Технические детали ${icon('down',16)}</summary>${pretty({command:detail.command,releases:detail.preview.releases,actionHash:detail.actionHash,application:detail.application})}</details>
        <input type="hidden" name="decision" value="approved">${canDecide?'<p class="iq-helper" data-effects-hint>Просмотрите все изменения, чтобы принять решение.</p>':''}`,
      submitLabel:canDecide?'Подтвердить план':'',onSubmit:async values=>{
        if(loading||cursor)throw Error('Сначала просмотрите остальные изменения.');
        const body={baseRevision:detail.revision,status:values.get('decision')};
        await client.request(base+'/approvals/'+id+'/decision','POST',body,await repository.key('approval:'+id,body));
      },mount:(element,form)=>{
        if(!canDecide)return;const submit=form.querySelector('[type=submit]');
        submit.insertAdjacentHTML('beforebegin','<button type="button" class="iq-btn secondary sm" data-reject>Отклонить</button>');
        form.querySelector('[data-reject]').addEventListener('click',()=>{form.querySelector('[name=decision]').value='rejected';form.requestSubmit(submit);});
        submit.addEventListener('click',()=>{form.querySelector('[name=decision]').value='approved';});
      }});
    const decisionButtons=()=>[...el.querySelectorAll('[type=submit],[data-reject]')];
    async function more(){
      loading=true;decisionButtons().forEach(b=>b.disabled=true);
      try{
        const page=await client.request(base+'/approvals/'+id+'/effects'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
        if(!el.isConnected)return;items.push(...page.items);cursor=page.nextCursor;
        el.querySelector('[data-agent-effects]').innerHTML=s.panel(items.map(e=>`<div class="iq-settings-row"><span class="iq-settings-row-copy"><span class="iq-settings-row-title">${esc(e.after.displayId)} ${esc(e.after.title)}</span><details class="iq-accordion"><summary>Было и станет ${icon('down',16)}</summary>${pretty({before:e.before,after:e.after})}</details></span></div>`).join(''));
        el.querySelector('[data-effects-more]').hidden=!cursor;
        const hint=el.querySelector('[data-effects-hint]');if(hint)hint.hidden=!cursor;
      }finally{loading=false;decisionButtons().forEach(b=>b.disabled=!!cursor);}
    }
    el.querySelector('[data-effects-more]').onclick=()=>{if(!loading)void more().catch(fail);};
    try{await more();}catch(error){if(el.isConnected){decisionButtons().forEach(b=>b.disabled=true);fail(error);}}
  }
  async function openRun(id){
    const run=await client.request(base+'/agent-runs/'+id),canStop=isActive(run)&&(run.initiatorId===repository.context.actorId||admin);
    const [label]=states[run.state]||[run.state];
    show({title:'Запуск агента',description:run.goal,
      body:s.panel(s.facts([['Состояние',esc(label)],['Предложений',`${run.usedProposals} из ${run.maxProposals}`],['Действует до',esc(when(run.expiresAt))],...(run.errorCode?[['Ошибка',`<code>${esc(run.errorCode)}</code>`]]:[])]))+run.plans.map(p=>`<details class="iq-accordion"><summary>${esc(summary(p.summary))}. ${esc((states[p.approval]||['Без решения'])[0])} ${icon('down',16)}</summary>${pretty({planId:p.id,receipt:p.receipt})}</details>`).join(''),
      submitLabel:canStop?'Остановить запуск':'',onSubmit:async()=>{
        const body={baseRevision:run.revision,state:'cancelled'};
        await client.request(base+'/agent-runs/'+id+'/finish','POST',body,await repository.key('run-stop:'+id,body));
      }});
  }
  function grant(){
    const matrix=`<fieldset class="iq-choice-grid"><legend>Права</legend><span></span><span>Читать</span><span>Изменять</span>${areas.map(([area,label])=>`<b>${label}</b>${['read','write'].map(mode=>`<label class="iq-check"><input type="checkbox" name="${area}:${mode}" aria-label="${label}: ${mode==='read'?'читать':'изменять'}" ${area==='tasks'&&mode==='read'?'checked':''}><span class="iq-check-box">${icon('check',14)}</span></label>`).join('')}`).join('')}</fieldset>`;
    show({title:'Подключить агента',description:'Агент получит доступ только к этому проекту. Секрет покажем один раз.',
      body:input('name','Название агента','',{required:true,maxlength:100,placeholder:'Например, Планировщик'})+select('ttl','Срок доступа','3600',[['3600','1 час'],['86400','24 часа']])+matrix,
      submitLabel:'Выдать доступ',onSubmit:async(values,_form,el)=>{
        const capabilities=areas.flatMap(([area])=>['read','write'].map(mode=>`${area}:${mode}`)).filter(key=>values.has(key));
        if(!capabilities.length)throw Error('Выберите хотя бы одно право.');
        const grant=await client.request(base+'/agents','POST',{name:values.get('name'),capabilities,expiresInSeconds:Number(values.get('ttl'))});
        const body=el.querySelector('.map-dialog-body');body.innerHTML=s.secret({label:'Секрет доступа',value:grant.token,note:'Секрет покажем только сейчас. Передайте его своему агенту по защищённому каналу и не храните в коде, задачах и чатах.'});enhance(body);
        body.querySelector('input').select();el.querySelector('[type=submit]').remove();el.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';return false;
      },mount:(_el,form)=>{form.addEventListener('change',event=>{const [area,mode]=String(event.target.name).split(':');if(mode==='write'&&event.target.checked)form.querySelector(`[name="${area}:read"]`).checked=true;if(mode==='read'&&!event.target.checked)form.querySelector(`[name="${area}:write"]`).checked=false;});}});
  }
  const onClick=event=>{void(async()=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.dataset.approval)return review(target.dataset.approval);
    if(target.dataset.run)return openRun(target.dataset.run);
    if(target.hasAttribute('data-agent-grant'))return grant();
    if(target.dataset.agentRevoke){const id=target.dataset.agentRevoke,item=grants.find(g=>g.id===id);return show({title:`Отозвать доступ ${item?.name||'агента'}?`,description:'Новые запросы агента и применение его незавершённых планов будут запрещены сразу.',submitLabel:'Отозвать',success:'Доступ отозван',onSubmit:()=>client.request(base+'/agents/'+id,'DELETE')});}
    const isRuns=target.hasAttribute('data-more-runs'),isApprovals=target.hasAttribute('data-more-approvals');
    if(isRuns||isApprovals){target.disabled=true;try{const page=await client.request(base+(isRuns?'/agent-runs':'/approvals')+'?cursor='+encodeURIComponent(isRuns?runCursor:approvalCursor));if(closed)return;if(isRuns){runs.push(...page.items);runCursor=page.nextCursor;}else{approvals.push(...page.items);approvalCursor=page.nextCursor;}render();}finally{target.disabled=false;}}
  })().catch(fail);};
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  // Finance changes never touch agents or approvals.
  const unsubscribe=repository.subscribe(change=>{if(!String(change?.collection).startsWith('finance'))void refresh().catch(fail);});
  await refresh();
  return {readyToLeave:()=>!modal,destroy(){closed=true;sequence++;abort.abort();unsubscribe();modal?.close(true);root.replaceChildren();}};
}
