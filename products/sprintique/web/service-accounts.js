import {ui,enhance,notify,escapeHTML as esc,formatDate,formatDateTime} from '@iquipage/web/core';
import {dialog,input,select,check} from '../ui/src/ui.js';
import * as s from './settings-ui.js';

// «Сервисные аккаунты»: how apps (Claude and other MCP clients) and scripts reach Sprintique. An app never acts as a
// person; it acts as a service account that a person made in a workspace and owns, a member of some projects with a
// role never above its owner's, and with finance only where it was granted explicitly. The owner manages it; a
// workspace administrator also sees every account of the workspace, gives it a new owner and deletes it. Only this
// screen, with the person's session, changes any of it; the server checks every change again. A token is shown once.
const roles=[['reader','Наблюдатель','Читает задачи, обсуждения, релизы и карты'],['editor','Редактор','Также создаёт и меняет задачи, пишет комментарии']];
const roleLabel=id=>roles.find(r=>r[0]===id)?.[1]||'Нет доступа';
// Finance is off unless granted: reading needs the owner in the project, keeping the books needs the owner as its administrator.
const finance=[['none','Без финансов'],['read','Видит финансы'],['write','Ведёт финансы']];
const financeOf=granted=>granted?.includes('finance.write')?'write':granted?.includes('finance.read')?'read':'none';
const grantedOf=level=>level==='write'?['finance.read','finance.write']:level==='read'?['finance.read']:[];
const scopeNames=scopes=>scopes.includes('write')?'Чтение и изменения':'Только чтение';
const when=value=>value?formatDateTime(value):'';

export async function mountServiceAccounts(root,{repository,tools}){
  const client=repository.client,abort=new AbortController();
  let closed=false,modal=null,accounts=[],myProjects=[],myWorkspaces=[],selected=null,mcpUrl='';
  if(tools)tools.innerHTML=ui.btn('Создать аккаунт','primary sm','plus','data-account-create');
  function show(options){modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;void refresh().catch(fail);},{once:true});return modal;}
  function fail(error){if(closed)return;if(modal){const el=modal.querySelector('[role=alert]');if(el){el.textContent=error.message;el.hidden=false;}}else notify({message:error.message,tone:'danger'});}
  const accountRow=a=>s.row({media:s.tile('bolt'),title:a.name,
    titleExtra:(a.suspended?' '+s.badge('Приостановлен','danger'):'')+(a.mine?'':' '+s.badge('Владелец: '+a.ownerName)),
    meta:[esc(a.workspaceName),`Проектов: ${a.projects.length}`,a.apps.length?`Приложений: ${a.apps.length}`:'',a.tokens.length?`Токенов: ${a.tokens.length}`:''],
    button:`data-account-open="${esc(a.id)}" aria-label="Настроить ${esc(a.name)}"`});
  function renderList(){
    const mine=accounts.filter(a=>a.mine),others=accounts.filter(a=>!a.mine);
    root.innerHTML=`${s.group({title:'Мои сервисные аккаунты',count:mine.length,description:'Приложения и скрипты работают как сервисный аккаунт, а не от вашего имени: у него свои проекты и роли, не больше ваших, а в истории видно, что сделал он.',
        body:s.panel(mine.map(accountRow).join('')||s.empty({title:'Сервисных аккаунтов нет',body:'Аккаунт появится сам, когда вы подключите Claude, или создайте его для своего скрипта.',action:ui.btn('Создать аккаунт','secondary sm','plus','data-account-create'),glyph:'bolt'}))})}
      ${others.length?s.group({title:'Аккаунты участников пространства',count:others.length,description:'Вы администратор пространства: можете менять их проекты, назначать владельца и удалять.',body:s.panel(others.map(accountRow).join(''))}):''}
      ${mcpUrl?s.group({title:'Как подключить Claude',description:'В Claude: Настройки → Коннекторы → Добавить свой коннектор, адрес ниже. Claude откроет страницу входа Sprintique и попросит выбрать или создать сервисный аккаунт.',
        body:s.panel(s.facts([['Адрес MCP-сервера',s.copyValue(mcpUrl,'Скопировать адрес MCP-сервера')]]))}):''}`;
  }
  function renderAccount(a){
    const owner=a.mine;
    const projectRow=p=>s.row({media:s.tile('folder'),title:p.name||'Проект недоступен',
      meta:[p.effectiveRole&&p.effectiveRole!==p.role?`Действует как ${roleLabel(p.effectiveRole).toLocaleLowerCase('ru')}: так у владельца`:'',!p.effectiveRole?'Владелец не участник проекта — доступа нет':'',
        p.effectiveRole&&financeOf(p.granted)!==financeOf(p.effectiveGranted)?'Финансы ограничены правами владельца':''],
      aside:select('role','Роль в '+(p.name||'проекте'),p.role,roles.map(([id,label])=>[id,label]),`label-hidden density="compact" data-project-role="${esc(p.projectId)}"`)
        +select('finance','Финансы в '+(p.name||'проекте'),financeOf(p.granted),finance,`label-hidden density="compact" data-project-finance="${esc(p.projectId)}"`),
      actions:ui.btn('Убрать','ghost sm','',`data-project-remove="${esc(p.projectId)}"`)});
    const tokenRow=t=>s.row({media:s.tile('lock'),title:t.name,meta:[esc(scopeNames(t.scopes)),`До ${esc(formatDate(t.expiresAt))}`,t.lastUsedAt?`Последний запрос ${esc(when(t.lastUsedAt))}`:'Ещё не использовался'],actions:ui.btn('Отозвать','ghost sm','',`data-token-revoke="${esc(t.id)}"`)});
    const appRow=p=>s.row({media:s.tile('spark'),title:p.name,titleExtra:' '+s.badge('Название указало приложение'),meta:[esc(scopeNames(p.scopes)),p.redirectHost?`Возврат на ${esc(p.redirectHost)}`:'',`Подключил ${esc(p.grantedBy)} ${esc(when(p.createdAt))}`,p.lastUsedAt?`Последний запрос ${esc(when(p.lastUsedAt))}`:''],actions:ui.btn('Отключить','ghost sm','',`data-app-revoke="${esc(p.id)}"`)});
    root.innerHTML=`<p>${ui.btn('Все аккаунты','ghost sm','left','data-account-back')}</p>
      ${a.suspended?s.lock(a.mine?'Аккаунт приостановлен: вы больше не участник его пространства. Вернуть его может администратор пространства.':'Аккаунт приостановлен: его владелец вне пространства. Назначьте нового владельца или удалите аккаунт.'):''}
      ${s.group({title:a.name,description:`${a.workspaceName} · владелец ${a.ownerName} · создан ${formatDate(a.createdAt)}`,actions:ui.btn('Переименовать','secondary sm','','data-account-rename')+ui.btn('Удалить','ghost sm','trash','data-account-delete'),
        body:''})}
      ${s.group({title:'Проекты',count:a.projects.length,description:'Роль не поднимается выше роли владельца: если владелец читает, аккаунт тоже только читает. Финансы закрыты, пока их не выдали явно; вести их может только аккаунт администратора проекта.',actions:owner?ui.btn('Добавить проект','secondary sm','plus','data-project-add'):'',
        body:s.panel(a.projects.map(projectRow).join('')||s.empty({title:'Проектов нет',body:'Без проектов аккаунт ничего не видит.',glyph:'folder'}))})}
      ${s.group({title:'Подключённые приложения',count:a.apps.length,description:'Отключение действует сразу.',body:s.panel(a.apps.map(appRow).join('')||s.empty({title:'Приложений нет',body:'Приложение подключается само, когда вы выбираете этот аккаунт на экране согласия.',glyph:'spark'}))})}
      ${s.group({title:'Токены',count:a.tokens.length,description:'Для скриптов: REST API и MCP как этот аккаунт. Храните токен как пароль.',actions:owner&&!a.suspended?ui.btn('Создать токен','secondary sm','plus','data-token-create'):'',
        body:s.panel(a.tokens.map(tokenRow).join('')||s.empty({title:'Токенов нет',glyph:'lock'}))})}
      ${!a.mine?s.group({title:'Владелец',description:'Владелец управляет аккаунтом; аккаунт не получает прав больше, чем у владельца.',actions:ui.btn('Назначить владельца','secondary sm','','data-account-owner'),body:''}):''}
      ${s.group({title:'Правила',body:s.panel(s.facts([['Действия','Видны в истории и обсуждениях как действия сервисного аккаунта, с его владельцем'],['Потолок прав','Роль и финансы никогда не шире прав владельца в проекте'],['Управление доступом','Никогда: участники, приглашения, агенты и другие сервисные аккаунты — только у людей'],['Если владелец уйдёт','Аккаунт приостановится, пока администратор пространства не назначит нового владельца или не удалит его']].map(([term,value])=>[term,esc(value)])))})}`;
    enhance(root);
  }
  function render(){if(closed)return;const a=accounts.find(x=>x.id===selected);if(a)renderAccount(a);else{selected=null;renderList();}enhance(root);}
  async function refresh(){
    if(closed||modal)return;
    const [list,session,workspaces,resource]=await Promise.all([client.request('/service-accounts'),client.request('/session'),client.request('/workspaces'),
      fetch('/.well-known/oauth-protected-resource/mcp').then(r=>r.ok?r.json():null).catch(()=>null)]);
    if(closed||modal)return;accounts=list.items;myProjects=session.projects||[];myWorkspaces=workspaces||[];mcpUrl=resource?.resource||'';render();
  }
  const current=()=>accounts.find(a=>a.id===selected);
  const path=(...parts)=>'/service-accounts/'+parts.map(encodeURIComponent).join('/');
  function create(){
    // Any person of a workspace makes one there; its projects are the person's own, each at the person's role at most.
    const workspaces=myWorkspaces.map(w=>[w.id,w.name]);
    if(!workspaces.length){notify({message:'Сначала станьте участником пространства.',tone:'danger'});return;}
    const projectChecks=workspaceId=>myProjects.filter(p=>p.workspaceId===workspaceId).map(p=>check('project:'+p.id,`${p.name} — ${p.role==='reader'?'наблюдатель':'редактор'}`,false)).join('');
    show({title:'Создать сервисный аккаунт',description:'Аккаунт для скрипта или приложения. Роль в каждом проекте — как у вас, не выше; наблюдателем аккаунт будет только читать. Финансы выдаются потом, отдельно.',
      body:input('name','Название','',{required:true,maxlength:100,placeholder:'Например, Отчёт по релизу'})+select('workspace','Пространство',workspaces[0][0],workspaces,'data-create-workspace')+`<fieldset class="consent-scopes" data-create-projects><legend>Проекты</legend>${projectChecks(workspaces[0][0])}</fieldset>`,
      submitLabel:'Создать',mount:el=>{el.addEventListener('iq-change',event=>{if(event.target.closest('[data-create-workspace]'))el.querySelector('[data-create-projects]').innerHTML='<legend>Проекты</legend>'+projectChecks(event.detail?.value??event.target.value);});},
      onSubmit:async(values)=>{
        const name=String(values.get('name')||'').trim();if(!name)throw Error('Введите название.');
        const workspaceId=String(values.get('workspace')||workspaces[0][0]);
        const projects=myProjects.filter(p=>p.workspaceId===workspaceId&&values.has('project:'+p.id)).map(p=>({projectId:p.id,role:p.role==='reader'?'reader':'editor'}));
        const made=await client.request('/service-accounts','POST',{name,workspaceId,projects});selected=made.id;
      },success:'Сервисный аккаунт создан'});
  }
  function addProject(a){
    const taken=new Set(a.projects.map(p=>p.projectId)),options=myProjects.filter(p=>p.workspaceId===a.workspaceId&&!taken.has(p.id));
    if(!options.length){notify({message:'Все ваши проекты этого пространства уже добавлены.',tone:'info'});return;}
    show({title:'Добавить проект',description:'Аккаунт получит роль не выше вашей в этом проекте.',
      body:select('project','Проект',options[0].id,options.map(p=>[p.id,p.name]))+s.choiceList('role','Роль',roles,'reader')+select('finance','Финансы','none',finance),submitLabel:'Добавить',success:'Проект добавлен',
      onSubmit:values=>client.request(path(a.id,'projects',String(values.get('project'))),'PUT',{role:String(values.get('role')||'reader'),granted:grantedOf(String(values.get('finance')||'none'))})});
  }
  function createToken(a){
    show({title:'Создать токен',description:`Токен действует как «${a.name}». Покажем его один раз.`,
      body:input('name','Название','',{required:true,maxlength:100,placeholder:'Например, Ночной отчёт'})+select('days','Срок действия','30',[['7','7 дней'],['30','30 дней'],['90','90 дней'],['365','1 год']])+check('write','Разрешить изменения: создавать и менять задачи, писать комментарии'),
      submitLabel:'Создать',onSubmit:async(values,_form,el)=>{
        const name=String(values.get('name')||'').trim();if(!name)throw Error('Введите название.');
        const token=await client.request(path(a.id,'tokens'),'POST',{name,scopes:values.has('write')?['read','write']:['read'],expiresInDays:Number(values.get('days'))});
        const body=el.querySelector('.map-dialog-body');body.innerHTML=s.secret({label:'Токен доступа',value:token.token,note:'Токен покажем только сейчас. Передавайте его в заголовке Authorization: Bearer и не храните в коде, задачах и чатах.'});enhance(body);
        body.querySelector('input').select();el.querySelector('[type=submit]').remove();el.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';return false;
      }});
  }
  async function reassign(a){
    const members=await client.request('/workspaces/'+encodeURIComponent(a.workspaceId)+'/members');
    const people=(members.items??members).filter(m=>m.kind!=='agent'&&m.kind!=='service');
    show({title:'Назначить владельца',description:'Новый владелец управляет аккаунтом; его роль в проектах ограничивает права аккаунта. Приостановленный аккаунт снова заработает.',
      body:select('owner','Владелец',people[0]?.id||'',people.map(m=>[m.id,m.name])),submitLabel:'Назначить',success:'Владелец назначен',
      onSubmit:values=>client.request(path(a.id,'owner'),'POST',{baseRevision:a.revision,ownerId:String(values.get('owner'))})});
  }
  const onClick=event=>{void(async()=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;const a=current();
    if(target.hasAttribute('data-account-create'))return create();
    if(target.dataset.accountOpen){selected=target.dataset.accountOpen;return render();}
    if(target.hasAttribute('data-account-back')){selected=null;return render();}
    if(!a)return;
    if(target.hasAttribute('data-account-rename'))return show({title:'Переименовать аккаунт',body:input('name','Название',a.name,{required:true,maxlength:100}),submitLabel:'Сохранить',success:'Сохранено',onSubmit:values=>client.request(path(a.id),'PATCH',{baseRevision:a.revision,name:String(values.get('name')||'').trim()})});
    if(target.hasAttribute('data-account-delete'))return show({title:`Удалить «${a.name}»?`,description:'Приложения и скрипты этого аккаунта сразу потеряют доступ. История его действий останется.',submitLabel:'Удалить',success:'Аккаунт удалён',onSubmit:async()=>{await client.request(path(a.id),'DELETE');selected=null;}});
    if(target.hasAttribute('data-account-owner'))return reassign(a);
    if(target.hasAttribute('data-project-add'))return addProject(a);
    if(target.dataset.projectRemove){const p=a.projects.find(x=>x.projectId===target.dataset.projectRemove);return show({title:`Убрать доступ к «${p?.name||'проекту'}»?`,description:'Аккаунт сразу перестанет видеть проект.',submitLabel:'Убрать',success:'Доступ убран',onSubmit:()=>client.request(path(a.id,'projects',target.dataset.projectRemove),'DELETE')});}
    if(target.hasAttribute('data-token-create'))return createToken(a);
    if(target.dataset.tokenRevoke){const t=a.tokens.find(x=>x.id===target.dataset.tokenRevoke);return show({title:`Отозвать токен «${t?.name||''}»?`,description:'Скрипты с этим токеном сразу перестанут работать.',submitLabel:'Отозвать',success:'Токен отозван',onSubmit:()=>client.request(path(a.id,'tokens',target.dataset.tokenRevoke),'DELETE')});}
    if(target.dataset.appRevoke){const p=a.apps.find(x=>x.id===target.dataset.appRevoke);return show({title:`Отключить «${p?.name||'приложение'}»?`,description:'Приложение сразу потеряет доступ. Чтобы вернуть его, подключите приложение заново.',submitLabel:'Отключить',success:'Приложение отключено',onSubmit:()=>client.request('/connected-apps/'+encodeURIComponent(target.dataset.appRevoke),'DELETE')});}
  })().catch(fail);};
  const onChange=event=>{void(async()=>{
    const control=event.target.closest('[data-project-role],[data-project-finance]');const a=current();if(!control||!a)return;
    const projectId=control.dataset.projectRole||control.dataset.projectFinance,project=a.projects.find(p=>p.projectId===projectId);if(!project)return;
    const isRole=control.hasAttribute('data-project-role'),previous=isRole?project.role:financeOf(project.granted),value=event.detail?.value??control.value;
    if(value===previous)return;
    const body={role:isRole?value:project.role,granted:isRole?project.granted||[]:grantedOf(value)};
    try{await client.request(path(a.id,'projects',projectId),'PUT',body);notify({message:isRole?`Роль: ${roleLabel(value)}`:finance.find(f=>f[0]===value)?.[1]||'Сохранено',tone:'success'});await refresh();}
    catch(error){control.value=previous;throw error;}
  })().catch(fail);};
  root.addEventListener('click',onClick,{signal:abort.signal});root.addEventListener('iq-change',onChange,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await refresh();
  return {readyToLeave:()=>!modal,destroy(){closed=true;abort.abort();modal?.close(true);root.replaceChildren();}};
}
