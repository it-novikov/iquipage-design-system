import {loadingMarkup} from '../loading.js';
import {ui,escapeHTML as esc,formatDateTime,workEntry,workStep,workQuestion,pending,actionError,enhance} from '@iquipage/web/core';
import {dialog,input,textarea,select,download} from '../ui.js';
import {workText,sessionSentence,activeSession,stepStates,uniqueEntries,workStates,workFocus,workOverview,createWorkAnswers,createWorkActionGate} from './work-model.js';
import {createThreadFocus} from './thread-focus.js';

/** One durable story shared by humans, external clients and provider-backed agents. */
export function mountTaskWork(root,{repository,project,task,summaryRoot,onOpenWork,onThread,onChange,onState}){
 const client=repository.client,abort=new AbortController(),base=`/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(task.id)}`;
 let closed=false,state=null,agents=[],timer=0,sequence=0,busy=false,modal=null,events=[],cursor=null,loadedEvents=false,newEvents=[],leaseToken=null,rendered='';
 const actionGate=createWorkActionGate(),answers=createWorkAnswers(),answerFocus=createThreadFocus(),answerErrors=new Map();let answering=null,composing=false;
 root.hidden=false;root.classList.add('iq-work-story');
 root.innerHTML=loadingMarkup('Загружаем работу по задаче…',{variant:'work'});
 const request=(path,method='GET',body)=>client.request(base+path,method,body,undefined,abort.signal);
 const command=async(path,method,body)=>client.request(base+'/work-plan'+path,method,body,await repository.key('work:'+task.id+path,body),abort.signal);
 const revision=()=>state?.workPlan?.revision||0;
 const show=options=>{modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;void load();},{once:true});return modal;};
 const button=(label,action,variant='secondary sm',disabled=false)=>ui.btn(label,variant,'',`data-work-action="${esc(action)}"${disabled?' disabled':''}`);
 const moreMenu=(p,permissions,session)=>ui.menu(ui.btn('Ещё','ghost sm','','aria-label="Другие действия с работой агента"'),[
  ...(permissions.canEdit&&p.status==='draft'?[{label:'Изменить план',action:'work:plan'}]:[]),
  ...(permissions.canEdit?[{label:'Добавить шаг',action:'work:new-step'},{label:'Задать вопрос',action:'work:new-question'},{label:'Сохранить состояние',action:'work:checkpoint'}]:[]),
  {label:'Выгрузить карточку',action:'work:export'},...(permissions.canEdit&&p.status==='draft'?[{label:'Загрузить карточку',action:'work:import'}]:[]),
  ...((state.sessions||[]).length>1?[{label:'Предыдущие запуски',action:'work:sessions'}]:[])]);
 const status=(text,error=false)=>{let node=root.querySelector('[data-work-error]');if(!node){node=document.createElement('p');node.className='iq-helper';node.dataset.workError='';root.append(node);}node.hidden=false;node.setAttribute('role',error?'alert':'status');node.textContent=text;};
 function render(){
  if(closed||!state||modal||composing)return;
  const signature=JSON.stringify([state.workPlan,state.sessions,state.requests,state.permissions,events,newEvents.length,cursor,answers.entries(),answering,[...answerErrors]]);if(signature===rendered)return;rendered=signature;
  const p=state.workPlan,session=state.sessions?.find(activeSession)||state.sessions?.[0],permissions=state.permissions||{},open=new Set([...root.querySelectorAll('details[open][data-step],details[open][data-work-history],details[open][data-work-section]')].map(x=>x.dataset.step||(x.dataset.workSection?'section:'+x.dataset.workSection:'history')));
  const summaryFocus=summaryRoot?.contains(document.activeElement)?document.activeElement?.dataset?.workSummaryAction:null;
  const focused=root.contains(document.activeElement)?document.activeElement?.dataset?.workAction:null;
  const focusedAnswer=document.activeElement?.closest('[data-work-answer]'),answerId=focusedAnswer?.dataset.workAnswer,answerSelection=answerId?answerFocus.capture(answerId,focusedAnswer):null;
  const focusedStep=document.activeElement?.matches('summary')?document.activeElement.parentElement?.dataset.step:null;
  const previousHistory=root.querySelector('[data-work-history]'),historyControl=previousHistory?.contains(document.activeElement)?document.activeElement:null;
  const historyFocused=document.activeElement?.matches('[data-work-history]>summary'),focusedSection=document.activeElement?.matches('summary')?document.activeElement.parentElement?.dataset.workSection:null;
  const unresolved=(p?.questions||[]).filter(q=>q.state==='open'),answered=(p?.questions||[]).filter(q=>q.state!=='open'),requests=(state.requests||[]).filter(r=>r.state==='pending'),steps=p?.steps||[];
  const focus=workFocus(state),q=focus.kind==='question'?focus.item:null,review=focus.kind==='review'?focus.item:null;
  const stepMarkup=(s,id=s.id,expanded=false)=>workStep({id,title:s.title,state:s.state,stateLabel:stepStates[s.state]||s.state,summary:id.startsWith('focus-')?'':workText([s.what,s.how,s.why,...(s.criteria||[]).map(c=>c.text)].filter(Boolean).join('\n\n')),result:workText(s.result),evidence:(s.evidence||[]).map((href,i)=>({href,label:`Открыть результат${(s.evidence||[]).length>1?' '+(i+1):''}`})),review:s.approval==='approved'?'Результат принят.':s.approval==='rejected'?'Возвращён на доработку.':'',expanded});
  const questionMarkup=q=>{const draft=answers.get(q.id)||{},stale=draft.revision!=null&&draft.revision!==revision(),waiting=answering===q.id;
   return `<div data-work-answer="${esc(q.id)}">${workQuestion({...q,id:'work-'+q.id,name:'work-answer-'+q.id,context:workText(q.context),value:draft.selected||'',answer:draft.answer||'',disabled:!permissions.canAnswer||waiting})}${stale?`<p class="iq-helper">Работа обновилась. Проверьте вопрос перед отправкой; ваш ответ сохранён в черновике.</p><div class="iq-work-tools">${button('Вопрос проверен','review-answer:'+q.id,'secondary sm',waiting)}</div>`:''}</div>`;
  };
  const focusMarkup=q?questionMarkup(q):review?`<section class="iq-work-question"><p class="iq-work-byline">Результат на проверке</p>${stepMarkup(review,'focus-'+review.id,true)}</section>`:focus.kind==='step'?`<section class="iq-work-story-copy"><p class="iq-work-byline">${focus.item.approval==='rejected'?'Нужна доработка':stepStates[focus.item.state]}</p><h2>${esc(focus.item.title)}</h2>${focus.item.what?`<p>${esc(workText(focus.item.what))}</p>`:''}${permissions.canEdit?`<div>${button('Обновить шаг','step:'+focus.item.id,'secondary sm')}</div>`:''}</section>`:focus.kind==='complete'?`<section class="iq-work-story-copy"><h2>Работа завершена</h2><p>${esc(focus.text)}</p></section>`:focus.kind==='next'?`<section class="iq-work-story-copy"><h2>Следующий шаг</h2><p>${esc(focus.text)}</p></section>`:!p?`<section class="iq-work-story-copy"><h2>Поручите первый шаг</h2><p>Выберите агента и опишите результат, который нужен.</p><div class="iq-work-tools">${permissions.canAssign?button('Поручить агенту','assign','primary sm'):''}${permissions.canEdit?button('Составить план','plan')+button('Загрузить карточку','import'):''}</div></section>`:`<section class="iq-work-story-copy"><p>${esc(session?sessionSentence(session):workText(p.goal))}</p></section>`;
  root.innerHTML=`<div class="iq-work-story-head"><div>${session?`<h2>${esc(session.agentName||'Агент')}</h2><p class="iq-work-byline">${esc(workStates[session.state]||'Работа прервалась')}</p>`:'<h2>Работа по задаче</h2>'}</div><div class="iq-work-tools">${p&&permissions.canAssign&&!activeSession(session)?button('Поручить агенту','assign'):''}${activeSession(session)&&session.canHandoff?button('Передать работу','handoff:'+session.id):''}${activeSession(session)&&(session.canStop??permissions.canStop)?button('Остановить','stop:'+session.id):''}${p?moreMenu(p,permissions,session):''}</div></div>
   ${focusMarkup}
   ${unresolved.length>1?`<details class="iq-work-details" data-work-section="questions"${open.has('section:questions')?' open':''}><summary>Другие вопросы</summary><div class="iq-work-history">${unresolved.slice(1).map(questionMarkup).join('')}</div></details>`:''}
   ${requests.length?`<div class="iq-work-history">${requests.map(r=>{const name=r.agentName||state.sessions?.find(s=>s.agentId===r.agentId)?.agentName;return `<div class="iq-work-entry"><p>${esc(name?`Обращение к агенту «${name}» ещё не обработано.`:'Обращение к агенту ещё не обработано.')}</p>${r.threadId?`<div>${button('Открыть обращение','request:'+r.id)}</div>`:''}</div>`;}).join('')}</div>`:''}
   <div class="iq-work-story-copy">${p?`<details class="iq-work-details" data-work-section="plan"${open.has('section:plan')?' open':''}><summary>План работы</summary><div class="iq-work-story"><div>${steps.map(s=>stepMarkup(s,s.id,open.has(s.id))).join('')}</div><div class="iq-work-story-copy"><p>${esc(workText(p.goal))}</p>${p.scope?`<p>${esc(workText(p.scope))}</p>`:''}${p.criteria?.length?`<p>${esc(workText(p.criteria.map(c=>c.text).join(' ')))}</p>`:''}</div></div></details>`:''}
   ${answered.length?`<details class="iq-work-details" data-work-section="decisions"${open.has('section:decisions')||answered.some(q=>answers.get(q.id))?' open':''}><summary>Принятые решения</summary><div class="iq-work-history">${answered.map(q=>{const draft=answers.get(q.id);return `<div data-work-answer="${esc(q.id)}">${workQuestion({...q,id:'work-'+q.id,context:'',answer:workText(q.answer),decision:workText(q.decision)})}${draft?`<p>Вопрос уже решён. Неотправленный ответ: ${esc(draft.answer||q.options?.find(o=>o.id===draft.selected)?.label||'вариант больше не доступен')}.</p>${button('Удалить черновик','discard-answer:'+q.id)}`:''}</div>`;}).join('')}</div></details>`:''}
   ${p?`<details class="iq-work-details" data-work-history${open.has('history')?' open':''}><summary>История работы</summary><div class="iq-work-history" data-work-events></div><div class="iq-work-tools" data-work-event-tools></div></details>`:''}</div><p class="iq-helper" data-work-error role="status" hidden></p>`;
  for(const step of steps)for(const target of root.querySelectorAll(`[data-step="${CSS.escape(step.id)}"] [data-step-actions],[data-step="${CSS.escape('focus-'+step.id)}"] [data-step-actions]`)){const reviewing=target.closest('[data-step]').dataset.step.startsWith('focus-');target.innerHTML=`<div class="iq-work-tools">${permissions.canDecide&&step.state==='done'&&!['approved','rejected'].includes(step.approval)?button('Принять результат','approve:'+step.id,reviewing?'primary':'secondary sm')+button('Вернуть на доработку','reject:'+step.id):''}${permissions.canEdit&&!reviewing?button('Обновить шаг','step:'+step.id):''}</div>`;}
  for(const q of unresolved){const target=root.querySelector(`[data-work-answer="${CSS.escape(q.id)}"] [data-question-actions]`),draft=answers.get(q.id),stale=draft?.revision!=null&&draft.revision!==revision();if(target)target.innerHTML=`${permissions.canAnswer?button('Подтвердить ответ','answer:'+q.id,'primary',answering===q.id||stale):''}${q.threadId?button('Открыть обсуждение','thread:'+q.threadId):''}`;}
  for(const q of unresolved){const node=root.querySelector(`[data-work-answer="${CSS.escape(q.id)}"] [data-question-status]`),text=answering===q.id?'Сохраняем ответ…':answerErrors.get(q.id);if(node&&text){node.hidden=false;node.textContent=text;node.setAttribute('role',answerErrors.has(q.id)?'alert':'status');}}
  if(summaryRoot){
   const overview=workOverview(state);
   summaryRoot.hidden=!p;summaryRoot.innerHTML=p?`<div class="iq-work-story-head"><div class="iq-work-story-copy"><h3>${esc(overview.context)}</h3>${overview.status&&overview.text?`<p class="task-work-status" data-attention="${overview.attention?'true':'false'}">${esc(overview.status)}</p>`:''}<p>${esc(overview.text||overview.status)}</p></div>${ui.btn(overview.label,overview.attention?'primary':'secondary sm','',`data-work-summary-action="${esc(overview.action)}"`)}</div>${overview.result?`<p class="task-work-result"${overview.result.empty?' data-empty="true"':''}><span class="task-work-result-label">${esc(overview.result.label)}</span> ${esc(overview.result.text)}</p>`:''}`:'';
  }
  if(previousHistory&&p)root.querySelector('[data-work-history]')?.replaceWith(previousHistory);
  renderEvents();enhance(root);if(summaryFocus)summaryRoot.querySelector('[data-work-summary-action]')?.focus({preventScroll:true});
  if(answerId&&root.querySelector(`[data-work-answer="${CSS.escape(answerId)}"]`)){
   const target=root.querySelector(`[data-work-answer="${CSS.escape(answerId)}"]`),disclosure=target.closest('details');if(disclosure)disclosure.open=true;
   answerFocus.restore(answerId,target,answerSelection);
  }
  else if(focused){const target=root.querySelector(`[data-work-action="${CSS.escape(focused)}"]`)||root.querySelector('h2');if(target?.tagName==='H2')target.setAttribute('tabindex','-1');target?.focus({preventScroll:true});}
  else if(focusedStep)root.querySelector(`[data-step="${CSS.escape(focusedStep)}"]>summary`)?.focus({preventScroll:true});
  else if(historyControl?.isConnected)historyControl.focus({preventScroll:true});
  else if(historyFocused)root.querySelector('[data-work-history]>summary')?.focus({preventScroll:true});
  else if(focusedSection)root.querySelector(`[data-work-section="${CSS.escape(focusedSection)}"]>summary`)?.focus({preventScroll:true});
 }
 function renderEvents(){
  const list=root.querySelector('[data-work-events]'),tools=root.querySelector('[data-work-event-tools]');if(!list)return;
  if(events.length)for(const node of [...list.children])if(!node.hasAttribute('data-entry'))node.remove();
  let before=list.firstElementChild;
  for(const e of events){let node=list.querySelector(`[data-entry="${CSS.escape(e.id)}"]`);if(!node){const holder=document.createElement('template');holder.innerHTML=workEntry({id:e.id,text:workText(e.text),by:e.actorName||'',time:e.at?formatDateTime(e.at):'',detail:workText(e.detail)});node=holder.content.firstElementChild;}
   if(node!==before){if(node.isConnected&&list.moveBefore)list.moveBefore(node,before);else list.insertBefore(node,before);}before=node.nextElementSibling;
  }
  if(!events.length)list.innerHTML='<p class="iq-work-byline">Сохранённые действия появятся здесь.</p>';
  tools.innerHTML=(newEvents.length?button('Показать новые записи','new-events'):'')+(cursor?button('Раньше','more-events'):'');
 }
 async function load(){
  clearTimeout(timer);const own=++sequence;
  try{const fresh=await request('/work');if(closed||own!==sequence)return;
   const previous=revision();state=fresh;onState?.(state);if(previous!==revision())onChange?.();
   const incoming=fresh.events?.items||[];
   if(!loadedEvents){events=incoming;cursor=fresh.events?.nextCursor||null;loadedEvents=true;}
   else newEvents=uniqueEntries(incoming.filter(e=>!events.some(old=>old.id===e.id)),newEvents);
   render();
  }catch(error){if(closed||error.name==='AbortError')return;if(!state)root.querySelector('[data-loading-shape]')?.remove();status('Не удалось обновить работу по задаче. '+(error.message||'Проверьте соединение.'),true);if(!root.querySelector('[data-work-action="reload"]'))root.insertAdjacentHTML('beforeend',button('Повторить','reload'));}
  if(!closed)timer=setTimeout(()=>void load(),state?.sessions?.some(activeSession)?4000:15000);
 }
 async function run(action,node){if(busy)return;busy=true;try{await pending(node,action);await load();}catch(error){if(!closed){await load();const current=node?.isConnected?node:root.querySelector(`[data-work-action="${CSS.escape(node?.dataset.workAction||'')}"]`);if(current)actionError(current,error.message||'Изменение не сохранено.');else status(error.message||'Изменение не сохранено.',true);}}finally{busy=false;}}
 async function listAgents(){const list=await client.request(`/projects/${encodeURIComponent(project.id)}/work-agents`);agents=list.items||[];return agents;}
 async function assign(){
  await listAgents();if(closed)return;
  if(!agents.length){show({title:'Пока нет доступных агентов',description:'Подключите агента и добавьте его в проект.',body:'<p><a href="#agents">Открыть агентов</a></p>',mount:element=>element.querySelector('a').addEventListener('click',()=>modal?.close(true))});return;}
  const choices=agents.flatMap(a=>(a.modes||[]).map(mode=>({id:a.id+':'+mode,name:`${a.name} — ${mode==='external'?'во внешнем приложении':'в Sprintique'}`,unavailable:a.unavailableReason||(a.canAssign===false?'Нет права поручать работу':'')}))),first=choices.find(c=>!c.unavailable);
  const el=show({title:'Поручить работу агенту',description:'Агент работает в пределах своего доступа к проекту.',
   body:`<p>Работа в проекте «${esc(project.name||project.title||'Текущий проект')}» ограничена вашим доступом и правами аккаунта агента.</p><iq-select name="agent" label="Агент" searchable>${choices.map(c=>`<option value="${esc(c.id)}"${c.unavailable?' disabled':''}>${esc(c.name+(c.unavailable?' — '+c.unavailable:''))}</option>`).join('')}</iq-select>${textarea('goal','Что нужно сделать',state.workPlan?.goal||task.title,3)}<p class="iq-helper" data-mode-hint></p>`,submitLabel:'Передать поручение',
   mount:(element,form)=>{const picker=form.querySelector('iq-select');picker.value=first?.id||'';const hint=()=>{const picked=agents.find(a=>picker.value?.startsWith(a.id+':')),limits=picked?.limits;form.querySelector('[data-mode-hint]').textContent=picker.value?.endsWith(':external')?'Поручение сохранится для внешнего приложения. Агент должен принять его, чтобы начать работу.':`Sprintique запустит ${picked?.model||'выбранную модель'} через API. ${limits?`За запуск — до ${limits.maxSteps} шагов и ${Number(limits.maxRunTokens).toLocaleString('ru')} токенов. `:''}Запросы оплачиваются через API провайдера.`;};picker.addEventListener('iq-change',hint);hint();},
   onSubmit:async(values,form)=>{const selected=form.querySelector('iq-select').value||'',at=selected.lastIndexOf(':'),agentId=selected.slice(0,at),mode=selected.slice(at+1),goal=String(values.get('goal')||'').trim();if(!agentId||!goal)throw Error('Выберите агента и напишите поручение.');
    if(!state.workPlan){await command('','PUT',{baseRevision:0,goal,scope:'',risk:'standard',criteria:[],steps:[],context:[],extraSections:[]});state=await request('/work');}
    await command('/sessions','POST',{baseRevision:revision(),agentId,mode,goal});
   }});return el;
 }
 function question(id){const node=root.querySelector(`[data-work-answer="${CSS.escape(id)}"]`);if(!node)return;const disclosure=node.closest('details');if(disclosure)disclosure.open=true;const target=node.querySelector('input:not(:disabled),textarea:not(:disabled)')||node.querySelector('h3');target.tabIndex=target.tagName==='H3'?-1:target.tabIndex;target.focus({preventScroll:true});node.scrollIntoView({block:'nearest'});
 }
 async function saveAnswer(id,{selected='',answer=''},baseRevision){
  if(!state?.permissions?.canAnswer)throw Error('Нет права отвечать на этот вопрос.');
  const q=state.workPlan?.questions.find(q=>q.id===id),option=q?.options?.find(o=>o.id===selected),text=answer.trim()||option?.label||'';
  if(!text)throw Error('Выберите вариант или напишите свой ответ.');
  await command('/questions/'+encodeURIComponent(id),'PATCH',{baseRevision,answer:text,selectedOptionId:option?.id||null,decision:text});
 }
 async function confirmAnswer(id){
  if(busy)return;const draft=answers.get(id)||{selected:'',answer:'',revision:revision()};
  if(draft.revision!==revision())return;
  busy=true;answering=id;answerErrors.delete(id);render();
  try{await saveAnswer(id,draft,draft.revision);answers.delete(id);}catch(error){answerErrors.set(id,error.message||'Ответ не сохранён. Попробуйте ещё раз.');}
  finally{await load();busy=false;answering=null;render();}
 }
 function editPlan(){const p=state.workPlan||{goal:task.title,scope:'',criteria:[],steps:[]},baseRevision=revision();
  show({title:'План работы',body:textarea('goal','Результат, который нужен',p.goal,3)+textarea('scope','Условия и границы',p.scope||'',3)+select('risk','Проверка результата',p.risk||'standard',[['low','Обычная работа'],['standard','Проверить результат'],['high','Проверять каждый готовый шаг']]),submitLabel:'Сохранить',onSubmit:async(values,form)=>{
   await command('','PUT',{baseRevision,goal:String(values.get('goal')||'').trim(),scope:String(values.get('scope')||''),risk:form.querySelector('iq-select').value,criteria:p.criteria||[],steps:(p.steps||[]).map(({id,title,what,how,why,state,criteria,dependsOn,result,evidence})=>({id,title,what,how,why,state,criteria,dependsOn:dependsOn||[],result,evidence})),context:p.context||[],extraSections:p.extraSections||[]});}});
 }
 async function claim(){const lease=await command('/lease','POST',{baseRevision:revision(),action:'claim',seconds:300,...(leaseToken?{leaseToken}:{})});state=await request('/work');leaseToken=lease.leaseToken||lease.token||lease.workPlan?.lease?.leaseToken||lease.workPlan?.lease?.token||state.workPlan?.lease?.token||state.workPlan?.lease?.leaseToken;if(!leaseToken)throw Error('Не удалось сохранить работу. Обновите задачу.');return leaseToken;}
 async function release(){if(!leaseToken)return;try{state=await request('/work');await command('/lease','POST',{baseRevision:revision(),action:'release',leaseToken});}finally{leaseToken=null;}}
 function stepEditor(id){const s=state.workPlan.steps.find(s=>s.id===id),initialRevision=revision();
  show({title:s?'Обновить шаг':'Добавить шаг',body:(s?`<p>${esc(s.title)}</p>`:input('title','Что нужно сделать','',{required:true}))+select('state','Состояние',s?.state||'todo',Object.entries(stepStates))+textarea('result',s?'Что сделано':'Как проверить результат',s?.result||'',3)+textarea('evidence','Ссылки на результат',s?.evidence?.join('\n')||'',2)+(s?.criteria?.length?`<fieldset><legend>Проверка результата</legend>${s.criteria.map(c=>ui.check(c.text,c.done,`name="criterion" value="${esc(c.id)}"`)).join('')}</fieldset>`:''),submitLabel:'Сохранить',onSubmit:async(values,form)=>{
   if(revision()!==initialRevision)throw Error('План изменился. Закройте форму и откройте актуальный шаг.');await claim();
   try{if(s)await command('/steps/'+encodeURIComponent(s.id),'PATCH',{baseRevision:revision(),leaseToken,state:form.querySelector('iq-select').value,result:String(values.get('result')||''),evidence:String(values.get('evidence')||'').split('\n').map(x=>x.trim()).filter(Boolean),criteria:(s.criteria||[]).map(c=>({...c,done:values.getAll('criterion').includes(c.id)}))});
    else await command('/steps','POST',{baseRevision:revision(),leaseToken,step:{id:crypto.randomUUID(),title:String(values.get('title')||'').trim(),what:'',how:'',why:'',criteria:String(values.get('result')||'').trim()?[{id:crypto.randomUUID(),text:String(values.get('result')).trim(),done:false}]:[],dependsOn:[],state:'todo',result:'',evidence:[]}});
   }finally{await release();}
  }});
 }
 function newQuestion(){const baseRevision=revision();show({title:'Вопрос по задаче',body:input('title','Вопрос','',{required:true})+textarea('context','Что нужно учесть','',3)+input('first','Первый вариант')+input('second','Второй вариант')+select('recommend','Рекомендация','',[['','Без рекомендации'],['a','Первый вариант'],['b','Второй вариант']]),submitLabel:'Задать вопрос',onSubmit:async(values,form)=>{
  const recommended=form.querySelector('iq-select').value;const options=[['a','first'],['b','second']].map(([id,name])=>({id,label:String(values.get(name)||'').trim(),description:'',recommended:id===recommended})).filter(o=>o.label);await command('/questions','POST',{baseRevision,id:crypto.randomUUID(),title:String(values.get('title')||'').trim(),context:String(values.get('context')||''),options});}});}
 function importCard(){const baseRevision=revision();show({title:'Загрузить карточку моста',description:'Содержимое заменит черновик плана. Если план уже меняли, сервер проверит его версию.',body:'<div class="iq-field"><label class="iq-control-label" for="work-card-file">Карточка task.md</label><input id="work-card-file" type="file" name="card" accept=".md,text/markdown,text/plain"></div>',submitLabel:'Загрузить',onSubmit:async values=>{const file=values.get('card');if(!(file instanceof File)||!file.size)throw Error('Выберите файл карточки.');if(file.size>100000)throw Error('Карточка должна быть не больше 100 КБ.');await command('/card','PUT',{baseRevision,card:await file.text()});}});}
 function checkpoint(session=null){const p=state.workPlan,initialRevision=revision();show({title:session?'Передать работу':'Сохранить состояние работы',body:textarea('summary','Что уже сделано',p?.checkpoint?.summary||'',3)+textarea('nextStep','Что делать дальше',p?.checkpoint?.nextStep||'',3)+(session?select('target','Кому передать','', [['','Оставить для следующего агента'],...agents.filter(a=>a.id!==session.agentId).map(a=>[a.id,a.name])]):''),submitLabel:session?'Передать':'Сохранить',onSubmit:async(values,form)=>{
  const summary=String(values.get('summary')||'').trim(),nextStep=String(values.get('nextStep')||'').trim();if(!summary||!nextStep)throw Error('Опишите результат и следующий шаг.');if(revision()!==initialRevision)throw Error('Работа изменилась. Закройте форму и откройте актуальное состояние.');if(!session)await claim();const body={baseRevision:revision(),leaseToken:session?null:leaseToken,summary,nextStep};
  try{if(session)await command('/handoffs','POST',{...body,sessionId:session.id,targetAgentId:form.querySelector('iq-select')?.value||null,reason:'manual'});else await command('/checkpoints','POST',body);}finally{if(!session)await release();else leaseToken=null;}
 }});}
 function stop(id){const session=state.sessions.find(s=>s.id===id);show({title:'Остановить работу?',description:session?.mode==='external'?'Агент больше не сможет продолжать эту сессию в Sprintique. Его внешнее приложение остановите отдельно.':'Новые шаги не начнутся. Уже сохранённые изменения останутся в задаче.',submitLabel:'Остановить',onSubmit:()=>command('/sessions/'+encodeURIComponent(id),'PATCH',{baseRevision:revision(),state:'cancelled',summary:''})});}
 async function handle(action,node){const [kind,id]=action.split(':');
  if(kind==='answer')return confirmAnswer(id);
  if(kind==='review-answer'){answers.review(id,state.workPlan.questions.find(q=>q.id===id),revision());answerErrors.delete(id);render();return;}
  if(kind==='discard-answer'){answers.delete(id);answerErrors.delete(id);render();return;}
  if(kind==='review'){const target=root.querySelector(`[data-step="${CSS.escape('focus-'+id)}"]`)||root.querySelector(`[data-step="${CSS.escape(id)}"]`);if(target){target.open=true;target.querySelector('summary')?.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}return;}
  if(kind==='reload')return load();if(kind==='assign')return assign();if(kind==='plan')return editPlan();if(kind==='question')return question(id);if(kind==='stop')return stop(id);if(kind==='new-step')return stepEditor();if(kind==='step')return stepEditor(id);if(kind==='new-question')return newQuestion();if(kind==='import')return importCard();
  if(kind==='checkpoint')return checkpoint();if(kind==='handoff'){await listAgents();return checkpoint(state.sessions.find(s=>s.id===id));}
  if(kind==='approve'||kind==='reject'){const step=state.workPlan.steps.find(s=>s.id===id),baseRevision=revision();if(!state.permissions.canDecide||step?.state!=='done'||['approved','rejected'].includes(step.approval))return;return run(()=>command('/steps/'+encodeURIComponent(id),'PATCH',{baseRevision,state:step.state,result:step.result||'',criteria:step.criteria||[],evidence:step.evidence||[],approval:kind==='approve'?'approved':'rejected'}),node);}
  if(kind==='request'){const request=state.requests?.find(r=>r.id===id);if(request&&onThread)return onThread(request.threadId,request.messageId);return;}
  if(kind==='thread'){if(onThread)return onThread(id);const target=document.querySelector(`[data-thread="${CSS.escape(id)}"]`);if(target){target.scrollIntoView({block:'center',behavior:'auto'});target.querySelector('button')?.focus({preventScroll:true});}else status('Откройте обсуждение задачи ниже: вопрос сохранён в его истории.');return;}
  if(kind==='export'){return run(async()=>{const card=await request('/work-plan/card');download((task.displayId||task.id)+'.md',typeof card==='string'?card:card.card||card.markdown||'', 'text/markdown');},node);}
  if(kind==='sessions')return show({title:'Предыдущие запуски',body:`<div class="iq-work-story">${state.sessions.map(s=>workEntry({id:s.id,text:sessionSentence(s),time:s.startedAt?formatDateTime(s.startedAt):'',detail:workText(s.summary)})).join('')}</div>`});
  if(kind==='new-events'){events=uniqueEntries(newEvents,events);newEvents=[];render();return;}
  if(kind==='more-events')return run(async()=>{const page=await request('/work-events?cursor='+encodeURIComponent(cursor));events=uniqueEntries(events,page.items||[]);cursor=page.nextCursor||null;renderEvents();},node);
 }
 const rememberAnswer=event=>{const card=event.target.closest('[data-work-answer]');if(!card||!event.target.matches('input,textarea'))return;answers.edit(card.dataset.workAnswer,{selected:card.querySelector('input:checked')?.value||'',answer:card.querySelector('textarea')?.value||''},revision());};
 root.addEventListener('input',rememberAnswer,{signal:abort.signal});root.addEventListener('change',rememberAnswer,{signal:abort.signal});
 root.addEventListener('compositionstart',event=>{composing=true;rememberAnswer(event);},{signal:abort.signal});root.addEventListener('compositionend',event=>{rememberAnswer(event);composing=false;render();},{signal:abort.signal});
 const dispatch=(action,node)=>{if(modal||busy)return;void actionGate.run(()=>handle(action,node)).catch(error=>{if(!closed){if(node?.isConnected)actionError(node,error.message||'Не удалось выполнить действие.');else status(error.message||'Не удалось выполнить действие.',true);}});};
 root.addEventListener('click',event=>{const node=event.target.closest('[data-work-action]');if(!node||!root.contains(node))return;event.preventDefault();event.stopPropagation();dispatch(node.dataset.workAction,node);},{signal:abort.signal});
 root.addEventListener('iq-action',event=>{const action=event.detail?.action;if(!action?.startsWith('work:'))return;event.stopPropagation();dispatch(action.slice(5),event.target.querySelector('button'));},{signal:abort.signal});
 summaryRoot?.addEventListener('click',event=>{const button=event.target.closest('[data-work-summary-action]');if(!button)return;event.preventDefault();if(actionGate.pending()||modal||busy)return;onOpenWork?.();const action=button.dataset.workSummaryAction;if(action!=='open')dispatch(action,button);},{signal:abort.signal});
 const unsubscribe=repository.subscribe(change=>{if(!change?.projectId||change.projectId===project.id)void load();});
 void load();
 return {refresh:load,async answerQuestion(id,draft,baseRevision){try{await saveAnswer(id,draft,baseRevision);}finally{await load();}},dirty:()=>!!modal||answers.dirty(),isBusy:()=>busy||actionGate.pending()||!!modal,destroy(){closed=true;clearTimeout(timer);abort.abort();unsubscribe();modal?.close(true);root.replaceChildren();}};
}
