import {ui,icon,escapeHTML as esc,notify,formatDate} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {loadCatalog,loadPresets,presetChoices,choose,diffChips,changedBy,rowMenu,presetPhrase,usagePhrase,radios,explain,listPhrase,title} from './access-ui.js';
import {projectPermissions,closure,canWorkspace,inactiveGrants,PROJECT_ACCESS} from './permissions.js';
import {openPermissionEditor} from './permission-editor.js';
import {openEffective} from './effective.js';
import {openInviteDialog} from './invite-dialog.js';
import {invitationRow,invitationAction,nextResend} from './invitations.js';
import {isWaiting,invitationSummary,invitationState,goneState,invitationRights} from './invitation-model.js';
import {invitationFlow} from './invitation-flow.js';
import * as s from './settings-ui.js';
import {failed} from '../ui/src/action-feedback.js';
/**
 * Project members: the preset is chosen in the row and applies at once (personal changes stay); the row menu opens
 * «Что может», the permission editor and removal. Service accounts are a group of their own: their rights are changed
 * by their owner (never above the owner's), by people who manage members or agents here (never above their own) and by
 * workspace people managers, always through the service-account endpoint. The API checks every change again.
 */
export async function mountMembers(root,{repository,project,tools,notice=''}){
  const client=repository.client,base='/projects/'+encodeURIComponent(project.id),abort=new AbortController(),self=repository.context.actorId;
  const own=new Set(projectPermissions(project)),manage=own.has('members.manage'),mayInvite=own.has('members.invite');
  const agentsManage=own.has('members.manage')||own.has('agents.manage'),peopleManager=canWorkspace(project,'workspace.people');
  let closed=false,modal=null,members=[],presets=[],servicePresets=[],invitations=[],index=new Map(),loading=0,query='',timer=0;
  // «Отправить снова» and «Отменить» only where the server would do it (invitationRights).
  const rights=i=>invitationRights(i,{actorId:self,workspacePermissions:project.workspacePermissions,projectInvite:id=>id===project.id&&mayInvite});
  function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;},{once:true});return element;}
  const show=options=>track(dialog(options));
  if(tools)tools.innerHTML=(manage?ui.btn('Добавить из пространства','secondary sm','users','data-add-member'):'')+(mayInvite?ui.btn('Пригласить','primary sm','plus','data-invite'):'');
  /** Someone holding more than the actor can be changed only by someone holding as much. */
  const editable=m=>manage&&m.kind==='human'&&(m.id===self||m.permissions.every(p=>own.has(p)));
  function personRow(m){
    const human=m.kind==='human',mine=m.id===self,guest=m.workspaceRole==='guest';
    const extra=`${mine?' '+s.badge('Вы'):''}${guest?' '+s.badge('Гость','planned'):''}${!human?' '+s.badge('Агент','planned'):''}`;
    const changed=m.modified?' '+s.badge('изменено','warning'):'';
    const aside=editable(m)?`<span class="sq-preset-aside">${choose('preset','Пресет: '+m.name,m.presetId,presetChoices(index,presets,{guest,held:own,current:m.presetId}),'label-hidden density="compact" data-member-preset')}${changed}</span>`
      :`<span class="sq-preset-aside">${esc(m.presetName||'')}${changed}</span>`;
    const items=[];
    if(human&&(mine||manage))items.push({label:mine?'Что я могу':'Что может',action:'member-effective',glyph:'eye'});
    if(editable(m))items.push({label:'Изменить права',action:'member-edit',glyph:'sliders'});
    if(editable(m)&&!mine)items.push({label:'Удалить из проекта',action:'remove-member',danger:true,glyph:'trash'});
    const since=m.joinedAt?`В проекте с ${esc(formatDate(m.joinedAt))}`:'',invited=guest&&m.invitedByName?`Приглашение от ${esc(m.invitedByName)}`:'';
    const meta=m.modified?[diffChips(index,m.added,m.removed),changedBy(m.changedAt,m.changedByName)]:[esc(m.presetHint||''),invited||since];
    return s.row({media:s.avatar(m.name,m.id,client.avatarUrl?.(m.id,m.avatarRevision)),title:m.name,titleExtra:extra,meta,aside,actions:items.length?rowMenu(m.name,items):'<span class="iq-settings-row-spacer"></span>',attrs:`data-member-id="${esc(m.id)}"`});
  }
  /** Who may change a service account here: its owner, people managing members or agents here, workspace people managers. */
  const serviceManager=m=>agentsManage||peopleManager||m.ownerId===self&&!m.suspended;
  const ownerOf=m=>members.find(x=>x.id===m.ownerId&&x.kind==='human');
  function serviceRow(m){
    const extra=` ${s.badge('Сервисный аккаунт','planned')}${m.suspended?' '+s.badge('Приостановлен','warning'):''}`;
    const inactive=m.suspended?[]:inactiveGrants(index,m.granted||[],ownerOf(m)?.permissions);
    const meta=[`${esc(m.presetName||'')}${diffChips(index,m.added,m.removed)}`,esc(`Владелец: ${m.ownerName||'—'}${m.ownerId===self?' (вы)':''}`),
      m.suspended?esc('Подключения не работают, пока администратор пространства не назначит владельца'):'',
      inactive.length?esc(`Не действует: у владельца нет ${listPhrase(inactive.map(id=>`«${title(index,id)}»`))}`):''];
    const items=serviceManager(m)?[{label:'Что может',action:'member-effective',glyph:'eye'},{label:'Права',action:'service-edit',glyph:'sliders'},{label:'Убрать из проекта',action:'service-remove',danger:true,glyph:'trash'}]:[];
    return s.row({media:s.tile('bolt'),title:m.name,titleExtra:extra,meta,aside:`<span class="sq-preset-aside">${esc(m.presetName||'')}${m.modified?' '+s.badge('изменено','warning'):''}</span>`,
      actions:items.length?rowMenu(m.name,items):'<span class="iq-settings-row-spacer"></span>',state:m.suspended?'muted':'',attrs:`data-member-id="${esc(m.id)}"`});
  }
  function presetRow(p){
    const badges=`${p.locked?' '+s.badge('закреплён'):''}${p.modified?' '+s.badge('изменён','warning'):''}${p.custom?' '+s.badge('свой','planned'):''}`;
    return s.row({title:p.name,titleExtra:badges,meta:[esc(presetPhrase(index,p)),esc(usagePhrase(p))],href:'#settings/presets',attrs:'data-settings-section="presets"'});
  }
  function render(){
    if(closed)return;clearTimeout(timer);
    const q=query.toLocaleLowerCase('ru').trim(),people=members.filter(m=>m.kind==='human'),services=members.filter(m=>m.kind==='service'),agents=members.filter(m=>!['human','service'].includes(m.kind));
    const shown=people.filter(m=>!q||m.name.toLocaleLowerCase('ru').includes(q)),waiting=invitations.filter(isWaiting),past=invitations.filter(i=>!isWaiting(i));
    const filter=people.length>10?`<label class="product-nav-search iq-settings-search">${icon('search',17)}<input type="search" placeholder="Найти участника" aria-label="Найти участника" data-member-search value="${esc(query)}"></label>`:'';
    root.innerHTML=`${notice}
      ${s.group({title:'Команда',count:people.length,description:manage?'Пресет выбирается в строке и применяется сразу. «Изменено» — у человека есть права сверх пресета или без части его прав; подробности в меню «Что может».':'Пресеты и права меняют те, кто управляет участниками проекта.',body:filter+s.panel(shown.map(personRow).join('')||s.empty({title:'Никого не нашли',body:'Проверьте написание имени.',glyph:'search'}),'ul')})}
      ${services.length?s.group({title:'Сервисные аккаунты',count:services.length,description:'Через них работают агенты, Claude и скрипты. Права — не шире прав владельца; управление людьми и доступом и решения по агентам им недоступны. Действия подписываются аккаунтом и владельцем.',body:s.panel(services.map(serviceRow).join(''),'ul')}):''}
      ${agents.length?s.group({title:'Агенты',count:agents.length,description:'Доступ агентов выдаётся и отзывается в разделе «Агенты».',body:s.panel(agents.map(personRow).join(''),'ul')}):''}
      ${mayInvite?s.group({title:'Приглашения',count:waiting.length,description:'Письмо приходит от Sprintique <no-reply@iqui.page>. Ссылка одноразовая и действует 7 дней.',body:s.panel(waiting.map(i=>invitationRow(i,{rights:rights(i)})).join('')||s.empty({title:'Никто не ждёт ответа',body:people.length<2?'Вы пока один в проекте. Пригласите коллег по почте.':'Пригласите людей по почте или создайте ссылку без письма.',action:ui.btn('Пригласить','secondary sm','plus','data-invite'),glyph:'send'}),'ul')+(past.length?`<details class="iq-accordion"><summary>Прошлые приглашения (${past.length}) ${icon('down',16)}</summary>${s.panel(past.map(i=>invitationRow(i)).join(''),'ul')}</details>`:'')}):''}
      ${presets.length?s.group({title:'Пресеты прав',count:presets.length,description:'Пресеты пространства. Меняются в настройках пространства и применяются ко всем проектам.',body:s.panel(presets.map(presetRow).join(''),'ul')}):''}`;
    const next=nextResend(waiting);if(next)timer=setTimeout(render,Math.min(next-Date.now()+500,2**31-1));
  }
  async function load(){
    const sequence=++loading;
    const [people,list,services,catalog,links]=await Promise.all([client.request(base+'/members'),loadPresets(client,project.workspaceId).catch(()=>[]),loadPresets(client,project.workspaceId,'service').catch(()=>[]),loadCatalog(client),mayInvite?client.request(base+'/invitations').catch(()=>[]):[]]);
    if(closed||sequence!==loading)return;
    members=people;presets=list;servicePresets=services;index=catalog.index;invitations=links.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));render();
  }
  const find=el=>members.find(m=>m.id===el.closest('[data-member-id]')?.dataset.memberId);
  const presetName=id=>presets.find(p=>p.id===id)?.name||'';
  /** The only way out of administration for the last administrator: someone else becomes Администратор first. */
  function handover(presetId){
    const candidates=members.filter(m=>m.kind==='human'&&m.id!==self);
    if(!candidates.length)return show({title:'Нельзя снять последнего администратора',description:'Вы — единственный человек в проекте. Сначала пригласите или добавьте того, кто станет администратором.'});
    const first=candidates.find(m=>m.workspaceRole!=='guest');
    show({title:'Нельзя снять последнего администратора',description:`Вы — единственный администратор проекта «${project.name}». Назначьте кого-то ещё: он получит ваши текущие права, а ваш пресет станет «${presetName(presetId)}».`,
      body:radios('to','Кто станет администратором',candidates.map(m=>m.workspaceRole==='guest'?[m.id,m.name,'Гость: администратором может стать только участник пространства.',true]:[m.id,m.name,`${m.presetName||''}${m.joinedAt?`, в проекте с ${formatDate(m.joinedAt)}`:''}`]),first?.id||'')
        +'<p class="iq-helper">Или отмените: ваш пресет останется прежним. Владелец пространства в любом случае сможет войти в проект как администратор.</p>',
      submitLabel:first?'Назначить и снять с себя права':'',
      onSubmit:async values=>{const to=members.find(m=>m.id===values.get('to'));if(!to)throw Error('Выберите, кто станет администратором.');
        await client.request(`${base}/members/${encodeURIComponent(to.id)}/handover`,'POST',{baseRevision:to.revision,presetId});notify({tone:'success',message:`${to.name} — администратор проекта`,description:`Ваш пресет — «${presetName(presetId)}».`});await load();}});
  }
  async function changePreset(member,presetId,control){
    const revert=()=>{control.value=member.presetId;};
    const save=async()=>{
      const row=control.closest('.iq-settings-row');row?.setAttribute('aria-busy','true');
      try{await client.request(`${base}/members/${encodeURIComponent(member.id)}/access`,'PUT',{baseRevision:member.revision,presetId,granted:member.granted||[],revoked:member.revoked||[]});
        notify({tone:'success',message:`${member.name}: пресет ${presetName(presetId)}`});await load();}
      catch(error){revert();if(error.code==='LAST_ADMIN')handover(presetId);else notify({tone:'danger',message:'Пресет не изменён',description:explain(error),duration:10000});}
      finally{row?.removeAttribute('aria-busy');}
    };
    const losesAccess=member.id===self&&own.has(PROJECT_ACCESS)&&!closure(index,presets.find(p=>p.id===presetId)?.permissions||[]).has(PROJECT_ACCESS);
    if(!losesAccess)return save();
    let confirmed=false;const el=show({title:'Снять с себя права администратора?',description:'Вы больше не сможете менять участников, доступ и настройки проекта.',submitLabel:'Снять права',onSubmit:()=>{confirmed=true;setTimeout(()=>void save());}});
    el.addEventListener('iq-close',()=>{if(!confirmed)revert();},{once:true});
  }
  async function edit(member){track(await openPermissionEditor({repository,project,member,presets,held:[...own],
    onSaved:async()=>{notify({tone:'success',message:`Права: ${member.name}`,description:'Изменение записано в историю проекта.'});await load();},onLastAdmin:presetId=>{
      // A handover sets a preset without personal changes: when only personal changes removed access, it would keep it.
      if((presets.find(p=>p.id===presetId)?.permissions||[]).includes('project.access'))notify({tone:'warning',duration:10000,message:'Вы последний администратор проекта',description:'Сначала сделайте администратором другого участника, затем уберите права у себя.'});
      else handover(presetId);}}));}
  /** The service-mode editor; the owner's current permissions here come from the owner's row (none: not a member). */
  async function editService(member){
    const actorCap=peopleManager||member.ownerId===self?null:[...own];
    track(await openPermissionEditor({repository,project,member,presets:servicePresets,held:actorCap,service:{ownerName:member.ownerName,ownerPermissions:ownerOf(member)?.permissions||null},
      onSaved:async()=>{notify({tone:'success',message:`Права: ${member.name}`,description:'Изменение записано в историю проекта.'});await load();}}));
  }
  async function addFromWorkspace(){
    const [people,access]=await Promise.all([client.request(base+'/directory'),client.request(base+'/access')]);
    if(!people.length)return show({title:'Добавить из пространства',description:'Все участники пространства уже в проекте. Новых людей можно пригласить по почте.'});
    const fallback=access.memberPresetId??access.workspaceMemberPresetId,options=presetChoices(index,presets,{held:own});
    show({title:'Добавить из пространства',description:'Люди пространства, которых ещё нет в проекте. Гостей добавляют только приглашением.',
      body:choose('principalId','Кто',people[0].id,people.map(p=>[p.id,p.name]),'searchable')+choose('presetId','Пресет',options.some(o=>o[0]===fallback)?fallback:options[0]?.[0]||'',options),submitLabel:'Добавить',
      onSubmit:async values=>{const person=people.find(p=>p.id===values.get('principalId'));await client.request(base+'/members','POST',{principalId:values.get('principalId'),presetId:values.get('presetId')||null});
        notify({tone:'success',message:`${person?.name||'Участник'} в проекте`,description:`Пресет «${presetName(values.get('presetId'))}».`});await load();}});
  }
  root.addEventListener('input',event=>{if(event.target.matches('[data-member-search]')){query=event.target.value;render();const field=root.querySelector('[data-member-search]');field.focus();field.setSelectionRange(query.length,query.length);}},{signal:abort.signal});
  root.addEventListener('iq-change',event=>{const control=event.target.closest('[data-member-preset]');if(!control)return;const member=find(control);if(member&&event.detail.value!==member.presetId)void changePreset(member,event.detail.value,control);},{signal:abort.signal});
  const onClick=event=>{void(async()=>{
    if(event.target.closest('[data-invite]'))return track(await openInviteDialog({repository,project,scope:'project',onDone:load}));
    if(event.target.closest('[data-add-member]'))return addFromWorkspace();
    if(invitationAction(event,{client,show,reload:load}))return;
    const action=event.target.closest('[data-action]')?.dataset.action,member=action&&find(event.target);if(!member)return;
    if(member.kind==='service'){
      // …/effective needs members.manage; the owner and agent managers see it built from the row.
      if(action==='member-effective')return track(await openEffective({repository,project,member,canEdit:serviceManager(member),onEdit:editService,
        presetPermissions:manage?null:servicePresets.find(p=>p.id===member.presetId)?.permissions||[]}));
      if(action==='service-edit')return editService(member);
      if(action==='service-remove')return show({title:`Убрать «${member.name}» из проекта?`,description:'Аккаунт сразу перестанет видеть проект; в других проектах он продолжит работать. История его действий останется.',submitLabel:'Убрать',success:`«${member.name}» больше не в проекте`,
        onSubmit:async()=>{try{await client.request(`/service-accounts/${encodeURIComponent(member.id)}/projects/${encodeURIComponent(project.id)}`,'DELETE');}catch(error){throw Error(explain(error));}await load();}});
      return;
    }
    if(action==='member-effective')return track(await openEffective({repository,project,member,self:member.id===self,canEdit:editable(member),onEdit:edit}));
    if(action==='member-edit')return edit(member);
    if(action==='remove-member')return show({title:`Удалить ${member.name} из проекта?`,description:'Доступ к задачам и картам пропадёт сразу. Позже человека можно пригласить снова.',submitLabel:'Удалить',success:`${member.name} больше не в проекте`,
      onSubmit:async()=>{const body={baseRevision:member.revision,role:null};try{await client.request(base+'/members/'+encodeURIComponent(member.id),'PATCH',body,await repository.key('member:'+member.id,body));}catch(error){throw Error(explain(error));}await load();}});
  })().catch(error=>failed(error,{description:explain(error)}));};
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await load();return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;clearTimeout(timer);abort.abort();modal?.close(true);root.replaceChildren();}};
}

/**
 * After sign-in, an invitation link in the address asks once and joins. A link for another address offers signing in
 * with the right one (the token waits in sessionStorage across the sign-out, nowhere else); a spent link says why.
 */
export async function acceptPendingInvitation(client,flow=invitationFlow()){
  const token=flow.fromAddress();if(!token)return false;
  const leave=()=>flow.leave();
  const explainGone=(state,info)=>new Promise(resolve=>{const [title,description]=invitationState(state,info);dialog({title,description}).addEventListener('iq-close',()=>resolve(false),{once:true});});
  let info;
  try{info=await client.request('/invitations/inspect','POST',{token});}catch(error){leave();return explainGone(goneState(error.code)||'invalid',{});}
  if(info.state!=='pending'){leave();return explainGone(info.state,info);}
  return new Promise(resolve=>{
    let joined=false,mismatch=null,gone='';
    const el=dialog({title:`Присоединиться к «${info.workspaceName}»?`,description:`${info.inviterName?`${info.inviterName} приглашает вас. `:''}${invitationSummary(info)} Ваш доступ к другим проектам не изменится.`,submitLabel:'Присоединиться',onSubmit:async()=>{
      try{
        const result=await client.request('/invitations/accept','POST',{token}),first=result.projects?.find(p=>p.slug===result.slug)||result.projects?.[0];
        const url=new URL(location.href);url.hash='tasks';if(first?.slug)url.searchParams.set('project',first.slug);history.replaceState(null,'',url);flow.leave();joined=true;
        const skipped=(result.skippedProjects||[]).map(p=>typeof p==='string'?p:p.name).filter(Boolean);
        notify({tone:'success',message:`Вы в пространстве «${info.workspaceName}»`,description:[first?`Открываем «${first.name}».`:'',skipped.length?`Недоступны: ${skipped.join(', ')}.`:''].filter(Boolean).join(' ')});
      }catch(error){
        if(error.code==='INVITATION_EMAIL_MISMATCH'){mismatch=error;return;}
        if(goneState(error.code)){gone=goneState(error.code);return;}
        throw error;
      }
    }});
    el.addEventListener('iq-close',()=>void(async()=>{
      if(mismatch){
        const profile=await client.request('/profile').catch(()=>({})),invited=mismatch.action?.invitedEmail||'другой адрес',current=profile.email||'текущий адрес';
        let other=false;
        const next=dialog({title:'Это приглашение для другого адреса',description:`Оно отправлено на ${invited}, а вы вошли как ${current}. Войдите с адресом из письма или попросите новое приглашение на текущий адрес.`,submitLabel:'Войти с другой почтой',
          mount:element=>{const stay=element.querySelector('.iq-dialog-footer [data-close]');if(stay)stay.textContent=`Остаться как ${current}`;},
          onSubmit:async()=>{other=true;flow.handOver(token);await client.request('/logout','POST');}});
        next.addEventListener('iq-close',()=>{if(other){history.replaceState(null,'',flow.handOver(token));location.reload();return;}leave();resolve(false);},{once:true});
        return;
      }
      if(gone){leave();resolve(await explainGone(gone,info));return;}
      if(!joined)leave();resolve(joined);
    })(),{once:true});
  });
}
