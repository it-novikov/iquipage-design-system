import {loadingMarkup} from '../ui/src/loading.js';
import {pageHeader} from '../ui/src/page-header.js';
import {ui,escapeHTML as esc,enhance,formatDateTime,workEntry,actionError} from '@iquipage/web/core';
import {input,textarea,dialog} from '../ui/src/ui.js';
import {mountServiceAccounts} from './service-accounts.js';
import {workText,sessionSentence} from '../ui/src/board/work-model.js';
import * as s from './settings-ui.js';
import {loadCatalog,listPhrase,lowerFirst} from './access-ui.js';

/** The directory joins only catalogs the signed-in person can read. Credentials never enter its model. */
export async function mountAgentsDirectory(root,{repository,project,onOpenTask}){
 const client=repository.client,abort=new AbortController();let closed=false,items=[],projects=[],accounts=[],query='',filter='',mode='',stateFilter='',selected=null,profileProject=null,detail=null,manager=null,managerAbort=null,sequence=0,modal=null,partial=false,permissionIndex=new Map();
 root.innerHTML=`<div class="iq-agent-directory iq-page-fluid">${pageHeader({title:'Агенты',description:'Кому можно поручить работу и как она идёт.'})}${loadingMarkup('Загружаем агентов…',{variant:'agents'})}</div>`;
 const req=path=>client.request(path,'GET',undefined,undefined,abort.signal);
 const find=id=>items.find(x=>x.id===id);
 const show=options=>{modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;void open(selected);},{once:true});return modal;};
 const mutate=async(path,body)=>client.request(`/projects/${encodeURIComponent(profileProject)}`+path,'POST',body,await repository.key('work-agent:'+path,body),abort.signal);
 function render(){
  if(closed||managerAbort)return;
  const agent=find(selected),active=root.contains(document.activeElement)?document.activeElement:null,focusName=active?.closest('[name]')?.getAttribute('name'),focusHeading=active?.tagName==='H1';
  root.innerHTML=`<div class="iq-agent-directory iq-page-fluid">${pageHeader({title:agent?.name||'Агенты',description:agent?agent.description||`Работает в проектах ${agent.projects.map(p=>p.name).join(', ')}.`:'Кому можно поручить работу и как она идёт.',back:agent?ui.btn('Все агенты','ghost sm','left','data-agents-back'):'',actions:agent?'':ui.btn('Подключить агента','secondary sm','plus','data-agents-connect')})}<div data-agent-content></div></div>`;
  if(agent)renderProfile(agent);else renderList();enhance(root);
  if(focusName)root.querySelector(`[name="${CSS.escape(focusName)}"]`)?.focus?.({preventScroll:true});else if(focusHeading)root.querySelector('h1')?.focus({preventScroll:true});
 }
 function renderList(){
  const content=root.querySelector('[data-agent-content]');
  content.innerHTML=`<div class="iq-work-story"><div class="iq-agent-directory-filters">${input('agentSearch','Найти агента',query,{placeholder:'Имя агента',maxlength:100})}<iq-select label="Проект" name="agentProject" value="${esc(filter)}"><option value="">Все проекты</option>${projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</iq-select><iq-select label="Способ работы" name="agentMode" value="${esc(mode)}"><option value="">Все способы</option><option value="external">Внешнее приложение</option><option value="provider_api">В Sprintique</option></iq-select><iq-select label="Состояние" name="agentState" value="${esc(stateFilter)}"><option value="">Все состояния</option><option value="available">Доступен</option><option value="working">Работает</option><option value="suspended">Приостановлен</option></iq-select></div>${partial?'<p class="iq-helper" role="status">Часть проектов не удалось загрузить. Показаны доступные данные.</p>':''}<div data-agent-results></div><p><a href="#settings/agents">Предложения и прежние подключения проекта</a></p></div>`;
  renderResults();
 }
 function renderResults(){
  const box=root.querySelector('[data-agent-results]');if(!box)return;
  const visible=items.filter(a=>(!filter||a.projects.some(p=>p.id===filter))&&(!mode||a.modes?.includes(mode))&&(!stateFilter||a.state===stateFilter)&&(!query||[a.name,a.description,a.ownerName].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))));
  box.innerHTML=visible.length?s.panel(visible.map(a=>s.row({media:ui.personAvatar({id:a.id,name:a.name,kind:'service'},{size:'md'}),title:a.name,meta:[esc(a.unavailableReason||a.description||`Владелец: ${a.ownerName}`),esc(a.projects.map(p=>p.name).join(', '))],aside:esc(a.state==='available'||a.state==='active'?'Доступен':a.state==='working'?'Работает':a.state==='suspended'?'Приостановлен':a.state==='disabled'?'Выключен':a.unavailableReason?'Недоступен':a.lastActiveAt?formatDateTime(a.lastActiveAt):''),button:`data-agent-open="${esc(a.id)}"`})).join('')):s.empty({title:items.length?'Агенты не найдены':'Агенты ещё не подключены',body:items.length?'Измените поиск или выбранный проект.':'Подключите внешнее приложение через MCP или настройте агента с API модели.',glyph:'spark'});
 }
 function renderProfile(a){
  const content=root.querySelector('[data-agent-content]'),own=accounts.find(x=>x.id===a.id),sessions=detail?.sessions||[],access=detail?.agent||a,rights=(access.permissions||[]).map(id=>permissionIndex.get(id)?.title).filter(Boolean).map(lowerFirst),role={admin:'администратор',editor:'редактор',reader:'читатель'}[access.role];
  content.innerHTML=`<div class="iq-work-story"><div class="iq-work-story-copy"><p>${esc(a.unavailableReason||`${a.name} ${a.modes?.includes('provider_api')?'может работать в Sprintique':'подключается из внешнего приложения'}. За его доступ отвечает ${a.ownerName}.`)}</p>${a.lastActiveAt?`<p class="iq-work-byline">Последняя активность ${esc(formatDateTime(a.lastActiveAt))}.</p>`:''}</div>
   <div class="iq-work-tools">${own?ui.btn('Настройки и доступ','secondary sm','settings','data-agent-manage'):''}${ui.btn('Как подключить','ghost sm','','data-agents-connect')}</div>
   <iq-select name="profileProject" label="Работа в проекте" value="${esc(profileProject)}">${a.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</iq-select>
   ${rights.length||role?`<details class="iq-work-details"><summary>Доступ в проекте</summary><div class="iq-work-story-copy">${role?`<p>Роль аккаунта — ${esc(role)}.</p>`:''}${rights.length?`<p>Аккаунту разрешено ${esc(listPhrase(rights))}.</p>`:''}</div></details>`:''}
   <div data-agent-skills>${skillsMarkup(a)}</div>
   ${s.group({title:'Работа',body:sessions.length?`<div class="iq-work-history">${sessions.map(x=>`<div>${workEntry({id:x.id,text:sessionSentence({...x,agentName:a.name}),time:x.startedAt?formatDateTime(x.startedAt):'',detail:workText(x.summary)})}${x.taskId&&onOpenTask?ui.btn('Открыть задачу','ghost sm','','data-agent-task="'+esc(x.taskId)+'"'):''}</div>`).join('')}</div>`:detail?'<p class="iq-work-byline">Сохранённых запусков пока нет.</p>':loadingMarkup('Загружаем историю работы…',{variant:'history',rows:2})})}
   ${detail?.events?.items?.length?`<div class="iq-work-history">${detail.events.items.map(e=>workEntry({id:e.id,text:workText(e.text),by:e.actorName||'',time:e.at?formatDateTime(e.at):''})).join('')}</div>`:''}</div>`;
 }
 function skillsMarkup(a){const skills=detail?.agent?.skills||detail?.skills||[];const canManage=detail?.canManage??a.projects.find(p=>p.id===profileProject)?.canManage;return s.group({title:'Навыки',description:'Навык описывает способ работы. Доступ к данным задаётся отдельно.',actions:canManage?ui.btn('Изменить','ghost sm','','data-agent-skills-edit'):'',body:skills.length?s.panel(skills.map(skill=>s.row({title:skill.name||skill.title,meta:[esc(workText(skill.description||''))],button:`data-agent-skill="${esc(skill.id)}"`})).join('')):'<p class="iq-work-byline">Навыки пока не назначены.</p>'});}
 async function open(id,{focus=false}={}){const same=selected===id;selected=id;detail=null;const a=find(id);if(!a)return;if(!same||!a.projects.some(p=>p.id===profileProject))profileProject=a.projects.find(p=>p.id===project.id)?.id||a.projects[0].id;render();if(!same||focus)root.querySelector('h1')?.focus({preventScroll:true});const own=++sequence;
  try{const fetched=await req(`/projects/${encodeURIComponent(profileProject)}/work-agents/${encodeURIComponent(id)}`);if(closed||own!==sequence||selected!==id)return;detail=fetched;render();}
  catch(error){if(closed||own!==sequence||selected!==id)return;const box=root.querySelector('[data-agent-content]');box.insertAdjacentHTML('beforeend',`<p class="iq-helper" role="alert">${esc(error.message||'Не удалось загрузить историю работы.')}</p>${ui.btn('Повторить','ghost sm','','data-agent-retry')}`);}
 }
 async function load(){
  const [session,owned,catalog]=await Promise.all([req('/session'),req('/service-accounts').catch(()=>({items:[]})),loadCatalog(client).catch(()=>({index:new Map()}))]);if(closed)return;projects=session.projects||[];accounts=owned.items||[];permissionIndex=catalog.index;
  const results=await Promise.allSettled(projects.map(p=>req(`/projects/${encodeURIComponent(p.id)}/work-agents`)));if(closed)return;
  const merged=new Map();partial=false;results.forEach((result,i)=>{if(result.status==='rejected'){partial=true;return;}for(const a of result.value.items||[]){const previous=merged.get(a.id);const scope={...projects[i],canManage:result.value.canManage,unavailableReason:a.unavailableReason};if(previous){previous.projects.push(scope);previous.modes=[...new Set([...previous.modes,...a.modes||[]])];}else merged.set(a.id,{...a,projects:[scope]});}});items=[...merged.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));render();
 }
 async function manage(){const a=find(selected);if(!a)return;
  managerAbort?.abort();manager?.destroy();manager=null;const pending=managerAbort=new AbortController();++sequence;
  root.innerHTML=`<div class="iq-agent-directory iq-page-fluid">${pageHeader({title:'Настройки аккаунта',description:a.name,back:ui.btn('К агенту','ghost sm','left','data-agent-return')})}<div data-agent-manager class="iq-settings-stack">${loadingMarkup('Загружаем настройки аккаунта…',{variant:'connections'})}</div></div>`;
  enhance(root);root.querySelector('h1')?.focus({preventScroll:true});
  const content=root.querySelector('[data-agent-manager]');
  try{const mounted=await mountServiceAccounts(content,{repository,selectedAccountId:a.id,signal:pending.signal});if(closed||pending!==managerAbort||pending.signal.aborted){mounted.destroy();return;}manager=mounted;}
  catch(error){if(closed||pending!==managerAbort||pending.signal.aborted)return;content.innerHTML=`<p role="alert">${esc(error.message||'Не удалось загрузить настройки аккаунта.')}</p>${ui.btn('Повторить','secondary sm','','data-agent-manager-retry')}`;}
 }
 async function editSkills(){const list=await req(`/projects/${encodeURIComponent(profileProject)}/work-skills`),assigned=new Set((detail?.agent?.skills||detail?.skills||[]).map(s=>s.id)),baseRevision=detail?.skillsRevision||0;
  show({title:'Навыки агента',description:'Выберите способы работы, которые агент должен использовать в этом проекте.',body:`<div class="iq-work-story">${(list.items||[]).length?list.items.map(skill=>ui.check(skill.name+' — '+skill.version,assigned.has(skill.id),`name="skill" value="${esc(skill.id)}"`)).join(''):'<p>В проекте пока нет навыков.</p>'}${ui.btn('Создать навык','ghost sm','plus','data-skill-new')}</div>`,submitLabel:'Сохранить',mount:element=>element.querySelector('[data-skill-new]').addEventListener('click',()=>{modal?.close(true);createSkill();}),onSubmit:values=>mutate(`/work-agents/${encodeURIComponent(selected)}/skills`,{baseRevision,skillIds:values.getAll('skill').map(String)})});
 }
 function createSkill(){show({title:'Новый навык',description:'Опишите, как выполнять работу и проверять результат. Навык не добавляет доступ к данным или инструментам.',body:input('name','Название','',{required:true,maxlength:100})+input('version','Версия','1',{required:true,maxlength:100})+textarea('content','Как работать','',8),submitLabel:'Создать',onSubmit:values=>mutate('/work-skills',{baseRevision:0,id:crypto.randomUUID(),name:String(values.get('name')||'').trim(),version:String(values.get('version')||'').trim(),content:String(values.get('content')||'').trim(),requiredTools:[]})});}
 async function viewSkill(id){const skill=await req(`/projects/${encodeURIComponent(profileProject)}/work-skills/${encodeURIComponent(id)}`);show({title:skill.name,description:'Версия '+skill.version,body:`<div class="iq-work-story"><p>${esc(workText(skill.content))}</p></div>`});}
 function connect(){modal=dialog({title:'Подключить агента',description:'Выберите, где он будет работать.',body:`<div class="iq-work-story"><section class="iq-work-story-copy"><h3>Во внешнем приложении</h3><p>Codex или Claude подключается к Sprintique через MCP. Вы выбираете сервисный аккаунт и проекты на странице разрешения доступа.</p><p><a href="#settings/service-accounts" data-connect-link>Открыть подключения MCP</a></p></section><section class="iq-work-story-copy"><h3>В Sprintique</h3><p>Добавьте API-подключение модели, затем включите агента в настройках сервисного аккаунта. Запросы оплачиваются через API провайдера.</p><p><a href="#settings/ai-connections" data-connect-link>Настроить API-подключение</a></p></section></div>`});modal.querySelectorAll('[data-connect-link]').forEach(link=>link.addEventListener('click',()=>modal?.close(true)));modal.addEventListener('iq-close',()=>{modal=null;},{once:true});}
 root.addEventListener('input',event=>{if(event.target.name==='agentSearch'){query=event.target.value;renderResults();}},{signal:abort.signal});
 root.addEventListener('iq-change',event=>{if(event.target.name==='agentProject'){filter=event.target.value;renderResults();}if(event.target.name==='agentMode'){mode=event.target.value;renderResults();}if(event.target.name==='agentState'){stateFilter=event.target.value;renderResults();}if(event.target.name==='profileProject'){profileProject=event.target.value;void open(selected);}},{signal:abort.signal});
 root.addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;void(async()=>{
  if(target.dataset.agentOpen)return open(target.dataset.agentOpen);
  if(target.hasAttribute('data-agent-retry'))return open(selected);
  if(target.dataset.agentTask)return onOpenTask?.(profileProject,target.dataset.agentTask);
  if(target.hasAttribute('data-agents-back')){selected=null;detail=null;render();return;}
  if(target.hasAttribute('data-agents-connect'))return connect();
  if(target.hasAttribute('data-agent-manage'))return manage();
  if(target.hasAttribute('data-agent-manager-retry'))return manage();
  if(target.hasAttribute('data-agent-skills-edit'))return editSkills();if(target.dataset.agentSkill)return viewSkill(target.dataset.agentSkill);
  if(target.hasAttribute('data-agent-return')){if(manager&&!await manager.readyToLeave())return;managerAbort?.abort();managerAbort=null;manager?.destroy();manager=null;await load();if(closed)return;return open(selected,{focus:true});}
  if(target.dataset.agentProject){filter=target.dataset.agentProject;selected=null;render();}
 })().catch(error=>actionError(target,error.message||'Не удалось выполнить действие.'));},{signal:abort.signal});
 try{await load();}catch(error){if(!closed)root.innerHTML=s.empty({title:'Не удалось загрузить агентов',body:error.message,glyph:'warning',action:ui.btn('Повторить','secondary sm','','data-agent-reload')});}
 root.addEventListener('click',event=>{if(event.target.closest('[data-agent-reload]'))void load().catch(error=>actionError(event.target,error.message));},{signal:abort.signal});
 return {closeTask:async()=>!modal&&(!manager||await manager.readyToLeave()),readyToLeave:async()=>!modal&&(!manager||await manager.readyToLeave()),destroy(){closed=true;sequence++;abort.abort();managerAbort?.abort();manager?.destroy();modal?.close(true);root.replaceChildren();}};
}
