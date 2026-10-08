import {ui,notify,formatDateTime,pending,actionError} from '@iquipage/web/core';
import {background} from '../action-feedback.js';
import {icon,esc} from '../ui.js';

// Agents of service accounts on a task (docs/decisions/0005-ai-agents.md). The drawer gets one quiet action in its
// header, «Запустить агента», for people who may change the task, and one compact line above the discussion: what the
// latest run is doing or how it ended, with «Остановить» while it works and its steps on request. The agent's answer
// itself arrives in the discussion as a comment of its service account. Nothing shows without agents in the project.
const ACTIVE=new Set(['queued','running']);
const POLL=2500;
const stepWord=n=>{const m10=n%10,m100=n%100;return m10===1&&m100!==11?'шаг':m10>=2&&m10<=4&&(m100<12||m100>14)?'шага':'шагов';};
const toolNames={get_task:'Прочитал задачу',search_tasks:'Искал задачи',list_releases:'Смотрел релизы',list_milestones:'Смотрел вехи',
  add_task_comment:'Написал в обсуждение',update_task:'Изменил задачу',change_task_status:'Сменил статус',create_task:'Создал задачу'};
const stepStatus={ok:'',error:' — ошибка',denied:' — нет прав'};

/** One line about a run, in words: who, what it is doing or how it ended. */
export function runLine(run){
  const who=`«${run.accountName}»`,steps=run.stepsUsed?` · ${run.stepsUsed} ${stepWord(run.stepsUsed)} из ${run.maxSteps}`:'';
  if(run.state==='queued')return run.stopRequested?`${who} останавливается…`:`${who} скоро начнёт работу`;
  if(run.state==='running')return run.stopRequested?`${who} останавливается…`:`${who} работает…${steps}`;
  if(run.state==='completed')return `${who} закончил ${formatDateTime(run.finishedAt)}${steps}`;
  if(run.state==='cancelled')return `${who} остановлен ${formatDateTime(run.finishedAt)}`;
  return `${who} не справился: ${run.errorMessage||'запуск не удался.'}`;
}

export function mountAgentRuns(root,{repository,project,task,actions}){
  if(!root||!repository.taskAgents||!task)return {destroy(){}};
  let closed=false,timer=0,state=null,showSteps=false,busy=false,trigger=null;
  const load=async()=>{
    clearTimeout(timer);
    try{state=await repository.taskAgents(project.id,task.id);}catch{state=null;}
    if(closed)return;render();
    if(state?.runs?.some(r=>ACTIVE.has(r.state)))timer=setTimeout(()=>background(load),POLL);
  };
  function renderTrigger(){
    trigger?.remove();trigger=null;
    if(!actions||!state?.canStart||!state.agents.length)return;
    const items=state.agents.map(a=>({label:`Запустить «${esc(a.name)}»`,action:`agent-start:${a.id}`,glyph:'play'}));
    const holder=document.createElement('span');holder.className='task-agent-trigger';
    holder.innerHTML=ui.menu(ui.ib('spark','Запустить агента','ghost sm','title="Запустить агента"'),items);
    actions.insertBefore(holder,actions.firstElementChild);trigger=holder;
  }
  function render(){
    renderTrigger();
    const run=state?.runs?.[0];
    if(!run){root.hidden=true;root.replaceChildren();return;}
    root.hidden=false;
    const active=ACTIVE.has(run.state)&&!run.stopRequested;
    const tone=run.state==='failed'?'danger':active?'info':'';
    const steps=(state.steps||[]).filter(s=>s.kind==='tool');
    root.innerHTML=`<p class="task-agent-line" data-tone="${tone}" role="status">${icon(run.state==='failed'?'warning':'spark',16)}<span>${esc(runLine(run))}</span>
      ${active&&state.canStop?ui.btn('Остановить','ghost sm','pause',`data-agent-stop="${esc(run.id)}"`):''}
      ${steps.length?ui.btn(showSteps?'Скрыть шаги':'Шаги','ghost sm','',`data-agent-steps aria-expanded="${showSteps}"`):''}</p>
      ${showSteps?`<ol class="task-agent-steps">${steps.map(s=>`<li>${esc((toolNames[s.tool]||s.tool)+(stepStatus[s.status]||''))}</li>`).join('')}</ol>`:''}`;
  }
  // The menu closes on the choice, so its trigger (the spark button) carries the pending state and, on failure, the
  // reason with «Повторить» next to it once the agents are read again (action feedback, DS vnext.35).
  const triggerButton=()=>trigger?.querySelector('.iq-btn')||null;
  const sayNextTo=(button,error,title,retry)=>{if(button?.isConnected)actionError(button,error.message||'Повторите попытку.',{title,retry});else notify({tone:'danger',message:title,description:error.message});};
  async function start(accountId){
    if(busy)return;busy=true;let failure=null;
    try{await pending(triggerButton(),()=>repository.startAgent(project.id,task.id,accountId));notify({tone:'success',message:'Агент запущен',description:'Ответ появится в обсуждении задачи.'});}
    catch(error){failure=error;}
    finally{busy=false;}
    await load();
    if(failure&&!closed)sayNextTo(triggerButton(),failure,'Агент не запущен',()=>void start(accountId));
  }
  async function stop(runId){
    if(busy)return;busy=true;let failure=null;
    const button=root.querySelector(`[data-agent-stop="${CSS.escape(runId)}"]`);
    try{await pending(button,()=>repository.stopAgent(project.id,task.id,runId));}
    catch(error){failure=error;}
    finally{busy=false;}
    await load();
    if(failure&&!closed)sayNextTo(root.querySelector(`[data-agent-stop="${CSS.escape(runId)}"]`),failure,'Агент не остановлен',()=>void stop(runId));
  }
  const onClick=event=>{
    const item=event.target.closest('[data-action^="agent-start:"]');
    if(item&&trigger?.contains(item)){void start(item.dataset.action.slice('agent-start:'.length));return;}
    const halt=event.target.closest('[data-agent-stop]');if(halt&&root.contains(halt)){void stop(halt.dataset.agentStop);return;}
    if(event.target.closest('[data-agent-steps]')&&root.contains(event.target)){showSteps=!showSteps;render();}
  };
  root.addEventListener('click',onClick);actions?.addEventListener('click',onClick);
  void load();
  return {refresh:load,destroy(){closed=true;clearTimeout(timer);root.removeEventListener('click',onClick);actions?.removeEventListener('click',onClick);trigger?.remove();}};
}
