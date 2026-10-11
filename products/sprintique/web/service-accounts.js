import {ui,icon,enhance,notify,escapeHTML as esc,formatDate,formatDateTime} from '@iquipage/web/core';
import {dialog,input} from '../ui/src/ui.js';
import {loadCatalog,loadPresets,choose,diffChips,rowMenu,radios,listPhrase,lowerFirst,title,plural,explain} from './access-ui.js';
import {openPermissionEditor} from './permission-editor.js';
import {inactiveGrants,ordered} from './permissions.js';
import {workspaceRoleNames} from './invitation-model.js';
import * as s from './settings-ui.js';
import {mountAgentProfile} from './agent-profile.js';
import {failed} from '../ui/src/action-feedback.js';

// «Сервисные аккаунты» (Для меня): how apps (Claude and other MCP clients) and scripts reach Sprintique. An app never
// acts as a person; it acts as a service account that a person made in a workspace and owns. Its rights are the
// catalog's, project by project: a service preset plus personal additions and removals, finance only as an explicit
// addition, the decisions and access of people never, and never above its owner's permissions there (the database
// caps it; an addition the owner lost since does not apply and is shown so). The list holds one's own accounts and,
// for people managers of a workspace («Управлять людьми»), every account there. Only the owner issues tokens; only a
// people manager gives an account a new owner, which ends its tokens and apps. A session is required throughout and
// the server checks every change again. A token is shown once.
const scopeNames=scopes=>(scopes||[]).includes('write')?'Читать и изменять':'Только читать';
const when=value=>value?formatDateTime(value):'';
const lifetimes=[['7','7 дней'],['30','30 дней'],['90','90 дней'],['180','180 дней'],['365','1 год']];

export async function mountServiceAccounts(root,{repository,tools,selectedAccountId=null}){
  const client=repository.client,abort=new AbortController();
  let closed=false,modal=null,accounts=[],myProjects=[],myWorkspaces=[],selected=selectedAccountId,mcpUrl='',index=new Map(),loading=0;
  const presetCache=new Map();
  if(tools)tools.innerHTML='';
  /** A dialog or drawer on top: the list reloads once it closes (a change may have happened inside). */
  function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;void refresh().catch(fail);},{once:true});return element;}
  const show=options=>track(dialog(options));
  function fail(error){if(!closed)failed(error,{description:explain(error)});}
  const servicePresets=workspaceId=>{
    if(!presetCache.has(workspaceId))presetCache.set(workspaceId,loadPresets(client,workspaceId,'service').catch(error=>{presetCache.delete(workspaceId);throw error;}));
    return presetCache.get(workspaceId);
  };
  const workspaceOf=a=>myWorkspaces.find(w=>w.id===a.workspaceId);
  /** A people manager of the account's workspace: every account there, owner transfer included. */
  const peopleManager=a=>(workspaceOf(a)?.permissions||[]).includes('workspace.people');
  const stateBadge=a=>a.suspended?s.badge('Приостановлен','warning'):s.badge('Активен','info');
  const connectionNames=a=>[...a.apps.map(x=>`${x.name} (MCP)`),...a.tokens.map(t=>t.name)];
  const phrase=ids=>listPhrase(ordered(index,ids).map(id=>lowerFirst(title(index,id))));
  /** What the account may do in a project now, and what of its grant does not apply because its owner lacks it. */
  function projectFacts(p){
    if(!p.ownerPermissions)return [esc('Владелец не участник проекта — здесь аккаунт ничего не может')];
    const inactive=inactiveGrants(index,p.granted||[],p.ownerPermissions);
    return [esc(`Может: ${phrase(p.permissions||[])||'только видеть задачи'}`),inactive.length?esc(`Не действует: у владельца нет ${listPhrase(inactive.map(id=>`«${title(index,id)}»`))}`):''];
  }

  function accountRow(a){
    const conns=connectionNames(a),several=new Set(accounts.map(x=>x.workspaceId)).size>1;
    const meta=[esc(`Владелец: ${a.mine?'вы':a.ownerName}`),several?esc(a.workspaceName):'',esc(a.projects.length?`${a.projects.length>1?'Проекты':'Проект'}: ${a.projects.map(p=>p.name||'недоступен').join(', ')}`:'Проектов нет'),
      esc(conns.length?`Подключения: ${conns.join(', ')}`:'Подключений нет'),
      // The backlog the account will find in its inbox (list_inbox) when it comes back to work.
      a.inboxUnread>0?esc(`Непрочитанных во входящих: ${a.inboxUnread}`):'',
      a.suspended?esc('Подключения не работают, пока не назначен владелец'):''];
    const owner=a.suspended&&peopleManager(a)?ui.btn('Назначить владельца','secondary sm','user',`data-account-owner="${esc(a.id)}"`):'';
    return s.row({media:s.tile('bolt'),title:a.name,titleExtra:' '+s.badge('Сервисный аккаунт','planned'),meta,aside:stateBadge(a),
      actions:owner+ui.btn('Открыть','ghost sm','',`data-account-open="${esc(a.id)}" aria-label="Открыть ${esc(a.name)}"`),state:a.suspended?'muted':'',attrs:`data-account-id="${esc(a.id)}"`});
  }
  const creatable=()=>myWorkspaces.filter(w=>w.role!=='guest');
  function renderList(){
    const create=creatable().length?ui.btn('Создать сервисный аккаунт','primary sm','plus','data-account-create'):'';
    root.innerHTML=`${s.group({title:'Сервисные аккаунты',count:accounts.length,description:'Через них работают агенты, Claude и скрипты. У каждого есть владелец и права из общего каталога — не шире прав владельца и никогда управление людьми и доступом. Действия записываются на аккаунт с указанием владельца.',actions:create,
        body:s.panel(accounts.map(accountRow).join('')||s.empty({title:'Сервисных аккаунтов нет',body:'Аккаунт появится сам, когда вы подключите Claude, или создайте его для своего скрипта.',action:create?ui.btn('Создать сервисный аккаунт','secondary sm','plus','data-account-create'):'',glyph:'bolt'}),'ul')})}
      ${mcpUrl?s.group({title:'Как подключить Claude',description:'В Claude: Настройки → Коннекторы → Добавить свой коннектор, адрес ниже. Claude откроет страницу входа Sprintique и попросит выбрать или создать сервисный аккаунт.',
        body:s.panel(s.facts([['Адрес MCP-сервера',s.copyValue(mcpUrl,'Скопировать адрес MCP-сервера')]]))}):''}
      ${s.group({title:'Правила',body:s.panel(s.facts([
        ['Кто создаёт','Любой участник пространства, кроме гостей, — в проектах, где он сам участник.'],
        ['Кто управляет','Владелец аккаунта; люди с «Управлять людьми» в пространстве; в проекте — люди с «Менять права участников» или «Управлять агентами в проекте».'],
        ['Права','Каталог проекта без управления, приглашений и решений по агентам. Финансы — только явно. Никогда не шире прав владельца.'],
        ['Если владелец уходит','Аккаунт приостанавливается: подключения не работают, история сохраняется. Администратор пространства назначает нового владельца или удаляет аккаунт.']].map(([term,value])=>[term,esc(value)])))})}`;
  }
  function renderAccount(a){
    const admin=peopleManager(a),taken=new Set(a.projects.map(p=>p.projectId));
    const addable=myProjects.some(p=>p.workspaceId===a.workspaceId&&!taken.has(p.id));
    const ownerRow=s.row({media:s.avatar(a.ownerName,a.ownerId),title:a.ownerName,titleExtra:a.mine?' '+s.badge('Вы'):'',
      meta:[a.suspended?esc('Вне пространства: аккаунт приостановлен'):esc(`Владелец аккаунта в «${a.workspaceName}»`)],
      actions:admin?ui.btn(a.suspended?'Назначить владельца':'Передать другому','secondary sm','user',`data-account-owner="${esc(a.id)}"`):'<span class="iq-settings-row-spacer"></span>'});
    const appRow=x=>s.row({media:s.tile('spark'),title:x.name,titleExtra:' '+s.badge('Название указало приложение'),
      meta:[esc(`MCP через OAuth${x.redirectHost?`, ${x.redirectHost}`:''}`),esc(scopeNames(x.scopes)),esc(`Подключил ${x.grantedBy} ${when(x.createdAt)}`),x.lastUsedAt?esc(`Последний запрос ${when(x.lastUsedAt)}`):''],
      aside:s.badge('Активно','info'),actions:ui.btn('Отключить','ghost sm','',`data-app-revoke="${esc(x.id)}" aria-label="Отключить ${esc(x.name)}"`)});
    const tokenRow=t=>s.row({media:s.tile('lock'),title:t.name,meta:[esc('Токен API'),esc(scopeNames(t.scopes)),esc(`До ${formatDate(t.expiresAt)}`),esc(t.lastUsedAt?`Последний запрос ${when(t.lastUsedAt)}`:'Ещё не использовался')],
      aside:s.badge('Активно','info'),actions:ui.btn('Отозвать','ghost sm','',`data-token-revoke="${esc(t.id)}" aria-label="Отозвать ${esc(t.name)}"`)});
    const projectRow=p=>s.row({media:s.tile('folder'),title:p.name||'Проект недоступен',meta:[`${esc(p.presetName||'—')}${diffChips(index,p.granted,p.revoked)}`,...projectFacts(p)],
      actions:ui.btn('Права','ghost sm','sliders',`data-project-edit="${esc(p.projectId)}" aria-label="Права в «${esc(p.name||'проекте')}»"`)+rowMenu(p.name||'проект',[{label:'Убрать из проекта',action:'project-remove',danger:true,glyph:'trash'}]),
      state:p.ownerPermissions?'':'muted',attrs:`data-project-id="${esc(p.projectId)}"`});
    const connections=a.apps.length+a.tokens.length;
    root.innerHTML=`<p>${ui.btn('Все сервисные аккаунты','ghost sm','left','data-account-back')}</p>
      ${a.suspended?s.lock(admin?'Аккаунт приостановлен: его владелец вне пространства. Назначьте нового владельца или удалите аккаунт.':'Аккаунт приостановлен. Вернуть его может администратор пространства.'):''}
      ${s.group({id:'service-account-title',title:a.name,description:`Сервисный аккаунт пространства «${a.workspaceName}». Создан ${formatDate(a.createdAt)}, владелец ${a.mine?'вы':a.ownerName}.`,actions:stateBadge(a)+ui.btn('Переименовать','secondary sm','','data-account-rename'),body:''})}
      ${s.group({title:'Владелец',description:'Отвечает за аккаунт: меняет права в пределах своих, выпускает токены, подключает и отключает приложения. Права аккаунта никогда не шире прав владельца.',body:s.panel(ownerRow)})}
      ${s.group({title:'Подключения',count:connections,description:`Что работает через этот аккаунт. Отключение действует сразу; токен показывается один раз.${a.mine?'':' Токены выпускает только владелец.'}`,
        actions:a.mine&&!a.suspended?ui.btn('Выпустить токен','secondary sm','lock','data-token-create'):'',
        body:s.panel(a.apps.map(appRow).join('')+a.tokens.map(tokenRow).join('')||s.empty({title:'Подключений нет',body:'Приложение подключается само, когда вы выбираете этот аккаунт на экране согласия. Для скрипта выпустите токен.',glyph:'spark'}),'ul')})}
      <div data-agent-section></div>
      ${s.group({title:'Проекты',count:a.projects.length,description:'Права выдаются в каждом проекте отдельно, как людям: сервисный пресет, добавления и исключения. Не шире прав владельца в этом проекте.',
        actions:addable?ui.btn('Добавить в проект','secondary sm','plus','data-project-add'):'',
        body:s.panel(a.projects.map(projectRow).join('')||s.empty({title:'Проектов нет',body:'Без проектов аккаунт ничего не видит.',glyph:'folder'}),'ul')})}
      ${s.group({title:'Удаление',body:s.panel(s.row({media:s.tile('trash'),title:'Удалить сервисный аккаунт',meta:[esc('Подключения отключатся, аккаунт выйдет из проектов. История сохранится с пометкой «удалён».')],
        actions:ui.btn('Удалить','danger sm','trash','data-account-delete')}))})}`;
  }
  function render(focus=''){
    if(closed)return;const a=accounts.find(x=>x.id===selected);
    if(a)renderAccount(a);else{selected=null;renderList();}
    enhance(root);if(focus)root.querySelector(focus)?.focus({preventScroll:true});
    // The account's agent, for those who manage it, when the server runs agents (docs/decisions/0005-ai-agents.md).
    if(a&&!a.suspended&&repository.capabilities?.aiAgents)void mountAgentProfile(root.querySelector('[data-agent-section]'),{client,account:a,track}).catch(fail);
  }
  async function refresh(){
    if(closed||modal)return;const sequence=++loading;
    const [list,session,workspaces,resource,catalog]=await Promise.all([client.request('/service-accounts'),client.request('/session'),client.request('/workspaces'),
      fetch('/.well-known/oauth-protected-resource/mcp').then(r=>r.ok?r.json():null).catch(()=>null),loadCatalog(client)]);
    if(closed||modal||sequence!==loading)return;
    accounts=list.items;myProjects=session.projects||[];myWorkspaces=workspaces||[];mcpUrl=resource?.resource||'';index=catalog.index;render();
  }
  const current=()=>accounts.find(a=>a.id===selected);
  const path=(...parts)=>'/service-accounts/'+parts.map(encodeURIComponent).join('/');
  /** A new grant: the preset as it is; the database caps it by the owner's permissions there (II.5). */
  const ownGrant=(presets,presetId,projectId)=>({projectId,presetId:presetId||null,granted:[],revoked:[]});
  const defaultPreset=presets=>(presets.find(p=>p.key==='service_read')||presets[0])?.id||'';
  const presetOptions=presets=>presets.map(p=>[p.id,p.name]);

  async function create(){
    const spaces=creatable();if(!spaces.length)return;
    const lists=new Map(await Promise.all(spaces.map(async w=>[w.id,await servicePresets(w.id).catch(()=>[])])));
    const projectsOf=workspaceId=>myProjects.filter(p=>p.workspaceId===workspaceId);
    const projectFields=workspaceId=>{
      const presets=lists.get(workspaceId)||[],projects=projectsOf(workspaceId);
      return `<legend>Проекты и пресет в них</legend>${projects.map(p=>`<div class="sq-sa-project"><label class="iq-check"><input type="checkbox" name="project" value="${esc(p.id)}"><span class="iq-check-box">${icon('check',14)}</span><span>${esc(p.name)}</span></label>${choose('preset:'+p.id,`Пресет в «${p.name}»`,defaultPreset(presets),presetOptions(presets),'label-hidden density="compact"')}</div>`).join('')
        ||'<p class="iq-helper">В этом пространстве вы пока не участник ни одного проекта. Аккаунт можно создать без проектов и добавить их позже.</p>'}`;
    };
    show({title:'Создать сервисный аккаунт',description:'Аккаунт для агента, скрипта или приложения. Проекты — только те, где вы участник; права в каждом — не шире ваших. Финансы добавляются потом, явно, в «Права».',
      body:input('name','Название','',{required:true,maxlength:100,placeholder:'Например, Планировщик релизов'})
        +(spaces.length>1?choose('workspace','Пространство',spaces[0].id,spaces.map(w=>[w.id,w.name]),'data-create-workspace'):`<input type="hidden" name="workspace" value="${esc(spaces[0].id)}">`)
        +`<fieldset class="sq-sa-projects" data-create-projects>${projectFields(spaces[0].id)}</fieldset><p class="iq-helper">«Сервис: чтение» — видеть задачи и карты; «Сервис: задачи» — ещё создавать и менять задачи и писать в обсуждениях.</p>`,
      submitLabel:'Создать',
      mount:el=>{el.addEventListener('iq-change',event=>{if(event.target.closest('[data-create-workspace]')){const box=el.querySelector('[data-create-projects]');box.innerHTML=projectFields(event.detail?.value??event.target.value);enhance(box);}});},
      onSubmit:async values=>{
        const name=String(values.get('name')||'').trim();if(!name)throw Error('Введите название.');
        const workspaceId=String(values.get('workspace')||spaces[0].id),presets=lists.get(workspaceId)||[];
        const projects=values.getAll('project').map(String).map(id=>ownGrant(presets,String(values.get('preset:'+id)||defaultPreset(presets)),id));
        let made;try{made=await client.request('/service-accounts','POST',{name,workspaceId,projects});}catch(error){throw Error(explain(error));}
        selected=made.id;notify({tone:'success',message:`Сервисный аккаунт «${made.name}» создан`,description:'Выпустите токен для скрипта или выберите аккаунт, когда подключаете Claude.'});
      }});
  }
  async function addProject(a){
    const taken=new Set(a.projects.map(p=>p.projectId)),options=myProjects.filter(p=>p.workspaceId===a.workspaceId&&!taken.has(p.id));
    if(!options.length)return;
    const presets=await servicePresets(a.workspaceId);
    show({title:'Добавить в проект',description:a.mine?'Проекты, где вы участник. Права — не шире ваших в проекте; уточнить их можно потом в «Права».':`Проекты, где вы участник. Владелец аккаунта (${a.ownerName}) тоже должен быть в проекте: права аккаунта не шире его прав.`,
      body:choose('project','Проект',options[0].id,options.map(p=>[p.id,p.name]))+choose('presetId','Пресет',defaultPreset(presets),presetOptions(presets)),submitLabel:'Добавить',
      onSubmit:async values=>{
        const projectId=String(values.get('project')),presetId=String(values.get('presetId')||defaultPreset(presets));
        // The owner's own permissions are known here only when the owner is the one adding.
        const grant=a.mine?ownGrant(presets,presetId,projectId):{presetId,granted:[],revoked:[]};
        try{await client.request(path(a.id,'projects',projectId),'PUT',{presetId:grant.presetId,granted:grant.granted,revoked:grant.revoked});}catch(error){throw Error(explain(error));}
        notify({tone:'success',message:`«${a.name}» в проекте «${options.find(p=>p.id===projectId)?.name||''}»`});
      }});
  }
  async function editProject(a,p){
    const presets=await servicePresets(a.workspaceId);
    // The owner and people managers are capped by the owner's permissions only (the editor's service mode).
    track(await openPermissionEditor({repository,project:{id:p.projectId,name:p.name},member:{id:a.id,name:a.name,kind:'service',presetId:p.presetId,granted:p.granted||[],revoked:p.revoked||[],permissions:p.permissions||[]},
      presets,held:null,service:{ownerName:a.ownerName,ownerPermissions:p.ownerPermissions||null},
      onSaved:()=>{notify({tone:'success',message:`Права «${a.name}» в «${p.name}»`,description:'Изменение записано в историю проекта.'});}}));
  }
  function createToken(a){
    show({title:'Выпустить токен',description:`Токен действует как «${a.name}» — для скриптов, REST API и MCP. Покажем его один раз.`,
      body:input('name','Название','',{required:true,maxlength:100,placeholder:'Например, Скрипт отчёта по релизу'})
        +radios('scope','Что сможет токен',[['read','Только читать','Задачи, обсуждения, релизы и карты — в проектах аккаунта.'],['write','Читать и изменять','В пределах прав аккаунта в каждом проекте.']],'read')
        +choose('days','Срок действия','90',lifetimes),
      submitLabel:'Выпустить',onSubmit:async(values,_form,el)=>{
        const name=String(values.get('name')||'').trim();if(!name)throw Error('Введите название.');
        let token;try{token=await client.request(path(a.id,'tokens'),'POST',{name,scopes:values.get('scope')==='write'?['read','write']:['read'],expiresInDays:Number(values.get('days')||90)});}catch(error){throw Error(explain(error));}
        const area=el.querySelector('.map-dialog-body');area.innerHTML=s.secret({label:'Токен доступа',value:token.token,note:'Токен покажем только сейчас. Передавайте его в заголовке Authorization: Bearer и не храните в коде, задачах и чатах.'});enhance(area);
        area.querySelector('input').select();el.querySelector('[type=submit]').remove();el.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';return false;
      }});
  }
  async function reassign(a){
    const list=await client.request('/workspaces/'+encodeURIComponent(a.workspaceId)+'/members'),people=(list.items??list).filter(m=>m.id!==a.ownerId&&(!m.kind||m.kind==='human'));
    const options=people.map(m=>m.role==='guest'?[m.id,m.name,'Гость: не может владеть сервисными аккаунтами',true]
      :[m.id,m.name,`${workspaceRoleNames[m.role]||m.role} пространства${m.projects?`, ${plural(m.projects,['проект','проекта','проектов'])}`:', ни одного проекта'}`]);
    const first=options.find(o=>!o[3])?.[0]||'';
    show({title:'Передать сервисный аккаунт',description:'Новый владелец будет управлять аккаунтом. Права аккаунта станут не шире прав нового владельца в каждом проекте: чего у него нет, перестанет действовать.',
      body:(first?radios('owner','Новый владелец',options,first):'<p class="iq-helper">Передать некому: в пространстве нет других участников, кроме гостей.</p>')
        +ui.alert('Подключения закончатся',esc('Токены и подключённые приложения аккаунта отключатся сразу: новый владелец выпустит и подключит свои.'),'warning'),
      submitLabel:first?'Передать':'',
      onSubmit:async values=>{
        const ownerId=String(values.get('owner')||''),to=people.find(m=>m.id===ownerId);if(!to)throw Error('Выберите нового владельца.');
        try{await client.request(path(a.id,'owner'),'POST',{baseRevision:a.revision,ownerId});}catch(error){throw Error(explain(error));}
        notify({tone:'success',message:`${to.name} — владелец «${a.name}»`,description:'Токены и приложения отключены.'});
      }});
  }
  function remove(a){
    const conns=connectionNames(a),projects=a.projects.map(p=>p.name).filter(Boolean);
    show({title:`Удалить сервисный аккаунт «${a.name}»?`,description:`Действует сразу и необратимо для подключений. История проектов сохранится: действия останутся подписаны «${a.name} (удалён)», сервисный аккаунт ${a.ownerName}.`,
      body:s.panel(s.facts([['Подключения',esc(conns.length?`${conns.join(', ')} — отключатся`:'Нет')],['Проекты',esc(projects.length?`${projects.join(', ')} — аккаунт выйдет из них`:'Нет')]]))
        +`<label class="iq-check"><input type="checkbox" name="understood" required><span class="iq-check-box">${icon('check',14)}</span><span>Понимаю: приложения перестанут работать, восстановить аккаунт нельзя</span></label><p class="iq-helper">Вместо удаления можно передать владение или отключить отдельное подключение.</p>`,
      submitLabel:'Удалить аккаунт',
      mount:el=>{el.querySelector('[type=submit]')?.classList.replace('primary','danger');},
      onSubmit:async values=>{
        if(!values.get('understood'))throw Error('Подтвердите, что понимаете последствия.');
        try{await client.request(path(a.id),'DELETE');}catch(error){throw Error(explain(error));}
        selected=null;notify({tone:'success',message:`Сервисный аккаунт «${a.name}» удалён`});
      }});
  }
  const onClick=event=>{void(async()=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-account-create'))return create();
    if(target.dataset.accountOpen){selected=target.dataset.accountOpen;return render('[data-account-back]');}
    if(target.hasAttribute('data-account-back')){const back=selected;selected=null;return render(`[data-account-open="${CSS.escape(back||'')}"]`);}
    if(target.dataset.accountOwner){const a=accounts.find(x=>x.id===target.dataset.accountOwner);return a&&reassign(a);}
    const a=current();if(!a)return;
    if(target.hasAttribute('data-account-rename'))return show({title:'Переименовать сервисный аккаунт',body:input('name','Название',a.name,{required:true,maxlength:100}),submitLabel:'Сохранить',success:'Название сохранено',
      onSubmit:async values=>{const name=String(values.get('name')||'').trim();if(!name)throw Error('Введите название.');try{await client.request(path(a.id),'PATCH',{baseRevision:a.revision,name});}catch(error){throw Error(error.code==='CONFLICT'?'Аккаунт уже изменён: закройте окно, чтобы увидеть новое, и повторите.':explain(error));}}});
    if(target.hasAttribute('data-account-delete'))return remove(a);
    if(target.hasAttribute('data-project-add'))return addProject(a);
    if(target.hasAttribute('data-token-create'))return createToken(a);
    const project=a.projects.find(p=>p.projectId===(target.dataset.projectEdit||target.closest('[data-project-id]')?.dataset.projectId));
    if(target.dataset.projectEdit&&project)return editProject(a,project);
    if(target.dataset.action==='project-remove'&&project)return show({title:`Убрать «${a.name}» из «${project.name||'проекта'}»?`,description:'Аккаунт сразу перестанет видеть проект; в других проектах он продолжит работать.',submitLabel:'Убрать',success:'Аккаунт убран из проекта',
      onSubmit:async()=>{try{await client.request(path(a.id,'projects',project.projectId),'DELETE');}catch(error){throw Error(explain(error));}}});
    if(target.dataset.tokenRevoke){const t=a.tokens.find(x=>x.id===target.dataset.tokenRevoke);return show({title:`Отозвать токен «${t?.name||''}»?`,description:'Скрипты с этим токеном сразу перестанут работать.',submitLabel:'Отозвать',success:'Токен отозван',
      onSubmit:async()=>{try{await client.request(path(a.id,'tokens',target.dataset.tokenRevoke),'DELETE');}catch(error){throw Error(explain(error));}}});}
    if(target.dataset.appRevoke){const x=a.apps.find(y=>y.id===target.dataset.appRevoke);return show({title:`Отключить «${x?.name||'приложение'}»?`,description:'Приложение сразу потеряет доступ. Чтобы вернуть его, подключите приложение заново.',submitLabel:'Отключить',success:'Приложение отключено',
      onSubmit:async()=>{try{await client.request('/connected-apps/'+encodeURIComponent(target.dataset.appRevoke),'DELETE');}catch(error){throw Error(explain(error));}}});}
  })().catch(fail);};
  root.addEventListener('click',onClick,{signal:abort.signal});
  await refresh();
  return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;abort.abort();modal?.close(true);root.replaceChildren();}};
}
