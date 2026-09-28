import {ui,icon,escapeHTML as esc,notify,enhance,formatDate,formatDateTime} from '@iquipage/web/core';
import {dialog,select} from '../ui/src/ui.js';
import {projectRoles,roleName} from './settings-sections.js';
import * as s from './settings-ui.js';
const lifetimes=[['86400','24 часа'],['259200','3 дня'],['604800','7 дней']];
const invitationState=i=>i.acceptedAt?['Принято','success']:i.revokedAt?['Отменено','neutral']:new Date(i.expiresAt)<=new Date()?['Истекло','neutral']:['Активно','info'];
/** Project members: the role is changed in the row, removal lives in the row menu; the API checks every change again. */
export async function mountMembers(root,{repository,project,tools,notice=''}){
  const client=repository.client,base='/projects/'+encodeURIComponent(project.id),abort=new AbortController(),admin=project.role==='admin',self=repository.context.actorId;
  let closed=false,modal=null,members=[],invitations=[],loading=0,query='';
  function show(options){modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;},{once:true});return modal;}
  if(tools&&admin)tools.innerHTML=ui.btn('Пригласить','primary sm','plus','data-invite');
  function personRow(m){
    const extra=`${m.id===self?s.badge('Вы'):''}${m.kind==='agent'?s.badge('Агент','planned'):''}`;
    const editable=admin&&m.kind==='human';
    const aside=editable?select('role','Роль '+m.name,m.role,projectRoles.map(([id,label])=>[id,label]),'label-hidden density="compact" data-member-role'):esc(roleName(m.role));
    const actions=editable&&m.id!==self?ui.menu(`<button type="button" class="iq-btn ghost icon sm" aria-label="Действия: ${esc(m.name)}">${icon('more',17)}</button>`,[{label:'Удалить из проекта',action:'remove-member',danger:true,glyph:'trash'}]):editable?'<span class="iq-settings-row-spacer"></span>':'';
    const since=m.joinedAt?`В проекте с ${esc(formatDate(m.joinedAt))}`:'',active=m.lastActiveAt?`Был активен ${esc(formatDateTime(m.lastActiveAt))}`:'';
    return s.row({media:s.avatar(m.name,m.id,client.avatarUrl?.(m.id,m.avatarRevision)),title:m.name,titleExtra:extra,meta:[esc(projectRoles.find(r=>r[0]===m.role)?.[2]||''),since,active],aside,actions,attrs:`data-member-id="${esc(m.id)}"`});
  }
  function invitationRow(i){
    const [label,tone]=invitationState(i),active=tone==='info';
    return s.row({media:s.tile('link'),title:`Ссылка для роли ${roleName(i.role)}`,meta:[`Создана ${esc(formatDateTime(i.createdAt))}${i.inviterName?`, пригласил ${esc(i.inviterName)}`:''}`,active?`Действует до ${esc(formatDateTime(i.expiresAt))}`:'',i.acceptedByName?`Принял ${esc(i.acceptedByName)}`:''],aside:s.badge(label,tone),actions:active?ui.btn('Отменить','ghost sm','',`data-revoke="${esc(i.id)}"`):'',state:active?'':'muted'});
  }
  function render(){
    if(closed)return;
    const q=query.toLocaleLowerCase('ru').trim(),people=members.filter(m=>m.kind!=='agent'),agents=members.filter(m=>m.kind==='agent');
    const shown=people.filter(m=>!q||m.name.toLocaleLowerCase('ru').includes(q));
    const active=invitations.filter(i=>invitationState(i)[1]==='info'),past=invitations.filter(i=>invitationState(i)[1]!=='info');
    const filter=people.length>10?`<label class="product-nav-search iq-settings-search">${icon('search',17)}<input type="search" placeholder="Найти участника" aria-label="Найти участника" data-member-search value="${esc(query)}"></label>`:'';
    root.innerHTML=`${notice}
      ${s.group({title:'Команда',count:people.length,description:admin?'Роль меняется сразу. Последнего администратора убрать нельзя.':'',body:filter+s.panel(shown.map(personRow).join('')||s.empty({title:'Никого не нашли',body:'Проверьте написание имени.',glyph:'search'}),'ul')})}
      ${agents.length?s.group({title:'Агенты',count:agents.length,description:'Доступ агентов выдаётся и отзывается в разделе «Агенты».',body:s.panel(agents.map(personRow).join(''),'ul')}):''}
      ${admin?s.group({title:'Приглашения',description:'Одноразовая ссылка. Её принимает один человек после входа.',body:s.panel(active.map(invitationRow).join('')||s.empty({title:'Активных приглашений нет',body:people.length<2?'Вы пока один в проекте. Создайте ссылку и отправьте её коллеге.':'Создайте ссылку и отправьте её тому, кого хотите пригласить.',action:ui.btn('Пригласить','secondary sm','plus','data-invite'),glyph:'link'}))+(past.length?`<details class="iq-accordion iq-settings-past"><summary>Прошлые приглашения (${past.length}) ${icon('down',16)}</summary>${s.panel(past.map(invitationRow).join(''))}</details>`:'')}):''}
      ${s.group({title:'Что могут роли',body:s.panel(s.facts(projectRoles.map(([,label,hint])=>[label,esc(hint)])))})}`;
  }
  async function load(){
    const sequence=++loading;
    const [people,links]=await Promise.all([client.request(base+'/members'),admin?client.request(base+'/invitations'):[]]);
    if(closed||sequence!==loading)return;members=people;invitations=links.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));render();
  }
  async function changeRole(member,role,control){
    const save=async()=>{const body={baseRevision:member.revision,role};await client.request(base+'/members/'+encodeURIComponent(member.id),'PATCH',body,await repository.key('member:'+member.id,body));notify({message:`${member.name} теперь ${roleName(role).toLocaleLowerCase('ru')}`,tone:'success'});await load();};
    if(member.id===self&&member.role==='admin'&&role!=='admin'){
      let confirmed=false;const el=show({title:'Снять с себя права администратора?',description:'Вы больше не сможете менять участников и настройки проекта.',submitLabel:'Снять права',onSubmit:async()=>{confirmed=true;await save();}});
      el.addEventListener('iq-close',()=>{if(!confirmed)control.value=member.role;},{once:true});return;
    }
    const row=control.closest('.iq-settings-row');row?.setAttribute('aria-busy','true');
    try{await save();}catch(error){control.value=member.role;notify({message:error.message,tone:'danger'});}finally{row?.removeAttribute('aria-busy');}
  }
  function invite(){
    show({title:'Пригласить в проект',description:'Отправьте ссылку человеку, которого хотите пригласить. Её примет один человек после входа.',
      body:s.choiceList('role','Роль',projectRoles,'editor')+select('ttl','Срок действия ссылки','86400',lifetimes),submitLabel:'Создать ссылку',onSubmit:async(values,_form,element)=>{
      const invitation=await client.request(base+'/invitations','POST',{id:crypto.randomUUID(),role:values.get('role'),expiresInSeconds:Number(values.get('ttl'))});
      const url=new URL('/',location.origin);url.hash='invite/'+invitation.token;
      // The secret stays only in this dialog, never in URL logs or browser storage.
      const body=element.querySelector('.map-dialog-body');body.innerHTML=s.secret({label:'Ссылка-приглашение',value:url.href,note:'Ссылку покажем только сейчас. Если потеряете её, создайте новую.'});enhance(body);
      body.querySelector('input').select();element.querySelector('[type=submit]').remove();element.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';
      await load();return false;
    }});
  }
  root.addEventListener('input',event=>{if(event.target.matches('[data-member-search]')){query=event.target.value;render();const field=root.querySelector('[data-member-search]');field.focus();field.setSelectionRange(query.length,query.length);}},{signal:abort.signal});
  root.addEventListener('iq-change',event=>{const control=event.target.closest('[data-member-role]');if(!control)return;const member=members.find(m=>m.id===control.closest('[data-member-id]')?.dataset.memberId);if(member&&event.detail.value!==member.role)void changeRole(member,event.detail.value,control);},{signal:abort.signal});
  const onClick=event=>{void(async()=>{
    if(event.target.closest('[data-invite]'))return invite();
    if(event.target.closest('[data-action="remove-member"]')){const member=members.find(m=>m.id===event.target.closest('[data-member-id]')?.dataset.memberId);if(!member)return;
      return show({title:`Удалить ${member.name} из проекта?`,description:'Доступ к задачам и картам пропадёт сразу. Позже человека можно пригласить снова.',submitLabel:'Удалить',success:`${member.name} больше не в проекте`,onSubmit:async()=>{const body={baseRevision:member.revision,role:null};await client.request(base+'/members/'+encodeURIComponent(member.id),'PATCH',body,await repository.key('member:'+member.id,body));await load();}});}
    const id=event.target.closest('[data-revoke]')?.dataset.revoke;
    if(id)return show({title:'Отменить приглашение?',description:'По этой ссылке больше нельзя будет присоединиться к проекту.',submitLabel:'Отменить приглашение',success:'Приглашение отменено',onSubmit:async()=>{await client.request(base+'/invitations/'+encodeURIComponent(id),'DELETE');await load();}});
  })().catch(error=>show({title:'Не удалось изменить доступ',description:error.message}));};
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await load();return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;abort.abort();modal?.close(true);root.replaceChildren();}};
}
export async function acceptPendingInvitation(client){
  const match=location.hash.match(/^#invite\/(invite_[A-Za-z0-9_-]{43})$/);if(!match)return false;
  return new Promise(resolve=>{
    const el=dialog({title:'Присоединиться к проекту?',description:'После подтверждения проект появится в списке доступных. Ваш текущий доступ к другим проектам не изменится.',submitLabel:'Присоединиться',onSubmit:async()=>{
      const result=await client.request('/invitations/accept','POST',{token:match[1]});const url=new URL(location.href);url.hash='tasks';url.searchParams.set('project',result.slug);history.replaceState(null,'',url);resolve(true);
    }});el.addEventListener('iq-close',()=>{if(location.hash.startsWith('#invite/'))history.replaceState(null,'','#tasks');resolve(false);},{once:true});
  });
}
