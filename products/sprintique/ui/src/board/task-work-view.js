import {ui,escapeHTML as esc,formatDateTime,workEntry,workStep,workQuestion,pending,actionError,enhance} from '@iquipage/web/core';
import {dialog,input,textarea,select,download} from '../ui.js';
import {workText,sessionSentence,activeSession,stepStates,uniqueEntries,workStates,workFocus} from './work-model.js';

/** One durable story shared by humans, external clients and provider-backed agents. */
export function mountTaskWork(root,{repository,project,task,summaryRoot,onOpenWork,onThread,onChange}){
 const client=repository.client,abort=new AbortController(),base=`/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(task.id)}`;
 let closed=false,state=null,agents=[],timer=0,sequence=0,busy=false,opening=false,modal=null,events=[],cursor=null,loadedEvents=false,newEvents=[],leaseToken=null,rendered='';
 root.hidden=false;root.classList.add('iq-work-story');
 root.innerHTML='<div class="iq-work-story-head"><h2>Работа агента</h2></div><p class="iq-helper" role="status">Загружаем работу по задаче…</p>';
 const request=(path,method='GET',body)=>client.request(base+path,method,body,undefined,abort.signal);
 const command=async(path,method,body)=>client.request(base+'/work-plan'+path,method,body,await repository.key('work:'+task.id+path,body),abort.signal);
 const revision=()=>state?.workPlan?.revision||0;
 const show=options=>{modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;void load();},{once:true});return modal;};
 const button=(label,action,variant='ghost sm')=>ui.btn(label,variant,'',`data-work-action="${esc(action)}"`);
 const moreMenu=(p,permissions,session)=>ui.menu(ui.btn('Ещё','ghost sm','','aria-label="Другие действия с работой агента"'),[
  ...(activeSession(session)&&session.canHandoff?[{label:'Передать работу',action:'work:handoff:'+session.id}]:[]),
  ...(activeSession(session)&&(session.canStop??permissions.canStop)?[{label:'Остановить',action:'work:stop:'+session.id}]:[]),
  ...(permissions.canEdit&&p.status==='draft'?[{label:'Изменить план',action:'work:plan'}]:[]),
  ...(permissions.canEdit?[{label:'Добавить шаг',action:'work:new-step'},{label:'Задать вопрос',action:'work:new-question'},{label:'Сохранить состояние',action:'work:checkpoint'}]:[]),
  {label:'Выгрузить карточку',action:'work:export'},...(permissions.canEdit&&p.status==='draft'?[{label:'Загрузить карточку',action:'work:import'}]:[]),
  ...((state.sessions||[]).length>1?[{label:'Предыдущие запуски',action:'work:sessions'}]:[])]);
 const status=(text,error=false)=>{let node=root.querySelector('[data-work-error]');if(!node){node=document.createElement('p');node.className='iq-helper';node.dataset.workError='';root.append(node);}node.hidden=false;node.setAttribute('role',error?'alert':'status');node.textContent=text;};
 function render(){
  if(closed||!state||modal)return;
  const signature=JSON.stringify([state.workPlan,state.sessions,state.requests,state.permissions,events,newEvents.length,cursor]);if(signature===rendered)return;rendered=signature;
  const p=state.workPlan,session=state.sessions?.find(activeSession)||state.sessions?.[0],permissions=state.permissions||{},open=new Set([...root.querySelectorAll('details[open][data-step],details[open][data-work-history],details[open][data-work-section]')].map(x=>x.dataset.step||(x.dataset.workSection?'section:'+x.dataset.workSection:'history')));
  const summaryFocus=summaryRoot?.contains(document.activeElement)?document.activeElement?.dataset?.workSummaryAction:null;
  const focused=root.contains(document.activeElement)?document.activeElement?.dataset?.workAction:null;
  const focusedStep=document.activeElement?.matches('summary')?document.activeElement.parentElement?.dataset.step:null;
  const previousHistory=root.querySelector('[data-work-history]'),historyControl=previousHistory?.contains(document.activeElement)?document.activeElement:null;
  const historyFocused=document.activeElement?.matches('[data-work-history]>summary'),focusedSection=document.activeElement?.matches('summary')?document.activeElement.parentElement?.dataset.workSection:null;
  const unresolved=(p?.questions||[]).filter(q=>q.state==='open'),answered=(p?.questions||[]).filter(q=>q.state!=='open'),requests=(state.requests||[]).filter(r=>r.state==='pending'),steps=p?.steps||[];
  const focus=workFocus(state),q=focus.kind==='question'?focus.item:null,review=focus.kind==='review'?focus.item:null;
  const stepMarkup=(s,id=s.id,expanded=false)=>workStep({id,title:s.title,state:s.state,stateLabel:stepStates[s.state]||s.state,summary:id.startsWith('focus-')?'':workText([s.what,s.how,s.why,...(s.criteria||[]).map(c=>c.text)].filter(Boolean).join('\n\n')),result:workText(s.result),evidence:(s.evidence||[]).map((href,i)=>({href,label:`Открыть результат${(s.evidence||[]).length>1?' '+(i+1):''}`})),review:s.approval==='approved'?'Результат принят.':s.approval==='rejected'?'Возвращён на доработку.':'',expanded});
  const questionMarkup=q=>`<section class="iq-work-question"><p class="iq-work-byline">Нужно ваше решение</p><h2>${esc(q.title)}</h2>${q.context?`<p>${esc(workText(q.context))}</p>`:''}<div class="iq-work-tools">${(permissions.canAnswer??permissions.canDecide)?button('Ответить','question:'+q.id,'primary sm'):''}${q.threadId?button('Обсуждение','thread:'+q.threadId):''}</div></section>`;
  const focusMarkup=q?questionMarkup(q):review?`<section class="iq-work-question"><p class="iq-work-byline">Результат на проверке</p>${stepMarkup(review,'focus-'+review.id,true)}</section>`:focus.kind==='step'?`<section class="iq-work-story-copy"><p class="iq-work-byline">${focus.item.approval==='rejected'?'Нужна доработка':stepStates[focus.item.state]}</p><h2>${esc(focus.item.title)}</h2>${focus.item.what?`<p>${esc(workText(focus.item.what))}</p>`:''}${permissions.canEdit?`<div>${button('Обновить шаг','step:'+focus.item.id,'secondary sm')}</div>`:''}</section>`:focus.kind==='complete'?`<section class="iq-work-story-copy"><h2>Работа завершена</h2><p>${esc(focus.text)}</p></section>`:focus.kind==='next'?`<section class="iq-work-story-copy"><h2>Следующий шаг</h2><p>${esc(focus.text)}</p></section>`:!p?`<section class="iq-work-story-copy"><h2>Поручите первый шаг</h2><p>Выберите агента и опишите результат, который нужен.</p><div class="iq-work-tools">${permissions.canAssign?button('Поручить агенту','assign','primary sm'):''}${permissions.canEdit?button('Составить план','plan')+button('Загрузить карточку','import'):''}</div></section>`:`<section class="iq-work-story-copy"><p>${esc(session?sessionSentence(session):workText(p.goal))}</p></section>`;
  root.innerHTML=`<div class="iq-work-story-head"><div>${session?`<h2>${esc(session.agentName||'Агент')}</h2><p class="iq-work-byline">${esc(workStates[session.state]||'Работа прервалась')}</p>`:'<h2>Работа по задаче</h2>'}</div><div class="iq-work-tools">${p&&permissions.canAssign&&!activeSession(session)?button('Поручить агенту','assign','secondary sm'):''}${p?moreMenu(p,permissions,session):''}</div></div>
   ${focusMarkup}
   ${unresolved.length>1?`<details class="iq-work-details" data-work-section="questions"${open.has('section:questions')?' open':''}><summary>Другие вопросы</summary><div class="iq-work-history">${unresolved.slice(1).map(questionMarkup).join('')}</div></details>`:''}
   ${requests.length?`<div class="iq-work-history">${requests.map(r=>{const name=r.agentName||state.sessions?.find(s=>s.agentId===r.agentId)?.agentName;return `<div class="iq-work-entry"><p>${esc(name?`Обращение к агенту «${name}» ещё не обработано.`:'Обращение к агенту ещё не обработано.')}</p>${r.threadId?`<div>${button('Открыть обращение','request:'+r.id)}</div>`:''}</div>`;}).join('')}</div>`:''}
   ${p?`<details class="iq-work-details" data-work-section="plan"${open.has('section:plan')?' open':''}><summary>План работы</summary><div class="iq-work-story"><div>${steps.map(s=>stepMarkup(s,s.id,open.has(s.id))).join('')}</div><div class="iq-work-story-copy"><p>${esc(workText(p.goal))}</p>${p.scope?`<p>${esc(workText(p.scope))}</p>`:''}${p.criteria?.length?`<p>${esc(workText(p.criteria.map(c=>c.text).join(' ')))}</p>`:''}</div></div></details>`:''}
   ${answered.length?`<details class="iq-work-details" data-work-section="decisions"${open.has('section:decisions')?' open':''}><summary>Принятые решения</summary><div class="iq-work-history">${answered.map(q=>workQuestion({...q,context:'',answer:workText(q.answer),decision:workText(q.decision)})).join('')}</div></details>`:''}
   ${p?`<details class="iq-work-details" data-work-history${open.has('history')?' open':''}><summary>История работы</summary><div class="iq-work-history" data-work-events></div><div class="iq-work-tools" data-work-event-tools></div></details>`:''}<p class="iq-helper" data-work-error role="status" hidden></p>`;
  for(const step of steps)for(const target of root.querySelectorAll(`[data-step="${CSS.escape(step.id)}"] [data-step-actions],[data-step="${CSS.escape('focus-'+step.id)}"] [data-step-actions]`)){const reviewing=target.closest('[data-step]').dataset.step.startsWith('focus-');target.innerHTML=`<div class="iq-work-tools">${permissions.canDecide&&step.state==='done'&&step.approval!=='approved'?button('Принять результат','approve:'+step.id,reviewing?'primary sm':'secondary sm')+button('Вернуть на доработку','reject:'+step.id):''}${permissions.canEdit&&!reviewing?button('Обновить шаг','step:'+step.id):''}</div>`;}
  if(summaryRoot){
   const text=q?q.title:review?review.title:focus.kind==='step'?focus.item.title:session?`${session.agentName||'Агент'}: ${(workStates[session.state]||'работа прервалась').toLocaleLowerCase('ru')}.`:p?'План работы готов.':'Работа агента';
   const action=q&&(permissions.canAnswer??permissions.canDecide)?'question:'+q.id:!p&&permissions.canAssign?'assign':'open';
   const label=action.startsWith('question:')?'Ответить':action==='assign'?'Поручить агенту':review?'Проверить результат':'Открыть работу';
   summaryRoot.hidden=false;summaryRoot.innerHTML=`<p class="iq-work-byline">${esc(text)}</p><div class="iq-work-tools">${ui.btn(label,'secondary sm','',`data-work-summary-action="${esc(action)}"`)}</div>`;
  }
  if(previousHistory&&p)root.querySelector('[data-work-history]')?.replaceWith(previousHistory);
  renderEvents();enhance(root);if(summaryFocus)summaryRoot.querySelector('[data-work-summary-action]')?.focus({preventScroll:true});
  if(focused){const target=root.querySelector(`[data-work-action="${CSS.escape(focused)}"]`)||root.querySelector('h2');if(target?.tagName==='H2')target.setAttribute('tabindex','-1');target?.focus({preventScroll:true});}
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
   const previous=revision();state=fresh;if(previous!==revision())onChange?.();
   const incoming=fresh.events?.items||[];
   if(!loadedEvents){events=incoming;cursor=fresh.events?.nextCursor||null;loadedEvents=true;}
   else newEvents=uniqueEntries(incoming.filter(e=>!events.some(old=>old.id===e.id)),newEvents);
   render();
  }catch(error){if(closed||error.name==='AbortError')return;status('Не удалось обновить работу по задаче. '+(error.message||'Проверьте соединение.'),true);if(!root.querySelector('[data-work-action="reload"]'))root.insertAdjacentHTML('beforeend',button('Повторить','reload'));}
  if(!closed)timer=setTimeout(()=>void load(),state?.sessions?.some(activeSession)?4000:15000);
 }
 async function run(action,node){if(busy)return;busy=true;try{await pending(node,action);await load();}catch(error){if(!closed){actionError(node,error.message||'Изменение не сохранено.');await load();}}finally{busy=false;}}
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
 function question(id){const q=state.workPlan.questions.find(q=>q.id===id),baseRevision=revision();if(!q)return;
  show({title:'Ответ агенту',body:`<div class="iq-work-story">${workQuestion({...q,name:'answerOption',state:'open',context:workText(q.context)})}</div>`,submitLabel:'Подтвердить ответ',
   onSubmit:async values=>{const selected=String(values.get('answerOption')||''),answer=String(values.get('workAnswer')||'').trim();if((!selected||selected==='__other')&&!answer)throw Error('Выберите вариант или напишите свой ответ.');
    const option=q.options?.find(o=>o.id===selected);await command('/questions/'+encodeURIComponent(id),'PATCH',{baseRevision,answer:answer||option?.label||'',selectedOptionId:selected&&selected!=='__other'?selected:null,decision:answer||option?.label||''});}
  });
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
  if(kind==='reload')return load();if(kind==='assign')return assign();if(kind==='plan')return editPlan();if(kind==='question')return question(id);if(kind==='stop')return stop(id);if(kind==='new-step')return stepEditor();if(kind==='step')return stepEditor(id);if(kind==='new-question')return newQuestion();if(kind==='import')return importCard();
  if(kind==='checkpoint')return checkpoint();if(kind==='handoff'){await listAgents();return checkpoint(state.sessions.find(s=>s.id===id));}
  if(kind==='approve'||kind==='reject'){const step=state.workPlan.steps.find(s=>s.id===id),baseRevision=revision();return show({title:kind==='approve'?'Принять результат шага?':'Вернуть результат на доработку?',description:workText(step.result)||step.title,submitLabel:kind==='approve'?'Принять':'Вернуть',onSubmit:()=>command('/steps/'+encodeURIComponent(id),'PATCH',{baseRevision,state:step.state,result:step.result||'',criteria:step.criteria||[],evidence:step.evidence||[],approval:kind==='approve'?'approved':'rejected'})});}
  if(kind==='request'){const request=state.requests?.find(r=>r.id===id);if(request&&onThread)return onThread(request.threadId,request.messageId);return;}
  if(kind==='thread'){if(onThread)return onThread(id);const target=document.querySelector(`[data-thread="${CSS.escape(id)}"]`);if(target){target.scrollIntoView({block:'center',behavior:'auto'});target.querySelector('button')?.focus({preventScroll:true});}else status('Откройте обсуждение задачи ниже: вопрос сохранён в его истории.');return;}
  if(kind==='export'){return run(async()=>{const card=await request('/work-plan/card');download((task.displayId||task.id)+'.md',typeof card==='string'?card:card.card||card.markdown||'', 'text/markdown');},node);}
  if(kind==='sessions')return show({title:'Предыдущие запуски',body:`<div class="iq-work-story">${state.sessions.map(s=>workEntry({id:s.id,text:sessionSentence(s),time:s.startedAt?formatDateTime(s.startedAt):'',detail:workText(s.summary)})).join('')}</div>`});
  if(kind==='new-events'){events=uniqueEntries(newEvents,events);newEvents=[];render();return;}
  if(kind==='more-events')return run(async()=>{const page=await request('/work-events?cursor='+encodeURIComponent(cursor));events=uniqueEntries(events,page.items||[]);cursor=page.nextCursor||null;renderEvents();},node);
 }
 root.addEventListener('click',event=>{const node=event.target.closest('[data-work-action]');if(!node||!root.contains(node))return;event.preventDefault();event.stopPropagation();if(opening||modal)return;opening=true;void handle(node.dataset.workAction,node).catch(error=>{if(!closed)actionError(node,error.message||'Не удалось выполнить действие.');}).finally(()=>{opening=false;});},{signal:abort.signal});
 root.addEventListener('iq-action',event=>{const action=event.detail?.action;if(!action?.startsWith('work:'))return;event.stopPropagation();if(opening||modal)return;opening=true;void handle(action.slice(5),event.target.querySelector('button')).catch(error=>status(error.message||'Не удалось выполнить действие.',true)).finally(()=>{opening=false;});},{signal:abort.signal});
 summaryRoot?.addEventListener('click',event=>{const button=event.target.closest('[data-work-summary-action]');if(!button)return;event.preventDefault();onOpenWork?.();const action=button.dataset.workSummaryAction;if(action!=='open')void handle(action,button).catch(error=>status(error.message,true));},{signal:abort.signal});
 const unsubscribe=repository.subscribe(change=>{if(!change?.projectId||change.projectId===project.id)void load();});
 void load();
 return {refresh:load,dirty:()=>!!modal,isBusy:()=>busy||opening||!!modal,destroy(){closed=true;clearTimeout(timer);abort.abort();unsubscribe();modal?.close(true);root.replaceChildren();}};
}
