import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {dialog,select,input,date} from '../ui/src/ui.js';
const roles=[['reader','Наблюдатель'],['editor','Участник'],['admin','Администратор']];
const label=value=>roles.find(r=>r[0]===value)?.[1]||value;
/** Host composition of DS controls; all authority is checked again by the API. */
export async function mountMembers(root,{repository,project,onBack}){
  const client=repository.client,base='/projects/'+encodeURIComponent(project.id),abort=new AbortController();
  let closed=false,modal=null,members=[],invitations=[],loading=0;
  function show(options){modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;},{once:true});return modal;}
  async function render(){
    const sequence=++loading;
    const [people,links]=await Promise.all([client.request(base+'/members'),project.role==='admin'?client.request(base+'/invitations'):[]]);
    if(closed||sequence!==loading)return;members=people;invitations=links;
    root.innerHTML=`<section class="host-settings task-settings-page">${ui.btn('Настройки проекта','ghost sm','left','data-members-back')}<h1>Участники проекта</h1><p>Наблюдатель читает. Участник работает с задачами и картами. Администратор управляет доступом и настройками.</p><div class="iq-list">${members.map(m=>`<div class="iq-list-item"><span>${esc(m.name)}${m.kind==='agent'?' · агент':''}</span><span>${esc(label(m.role))}</span>${project.role==='admin'&&m.kind==='human'?ui.btn('Изменить','ghost sm','','data-member="'+esc(m.id)+'"'):''}</div>`).join('')}</div>${project.role==='admin'?`<h2>Приглашения</h2>${ui.btn('Пригласить участника','primary sm','plus','data-invite')}<div class="iq-list">${invitations.length?invitations.map(i=>`<div class="iq-list-item"><span>${esc(label(i.role))} · ${i.acceptedAt?'Принято':i.revokedAt?'Отменено':new Date(i.expiresAt)<new Date()?'Истекло':'До '+esc(date(i.expiresAt))}</span>${!i.revokedAt&&!i.acceptedAt&&new Date(i.expiresAt)>new Date()?ui.btn('Отменить','ghost sm','','data-revoke="'+esc(i.id)+'"'):''}</div>`).join(''):'<p>Создайте одноразовую ссылку и передайте её будущему участнику.</p>'}</div>`:''}</section>`;
  }
  root.addEventListener('click',event=>{void(async()=>{
    if(event.target.closest('[data-members-back]'))return onBack();
    const memberId=event.target.closest('[data-member]')?.dataset.member;
    if(memberId){const member=members.find(m=>m.id===memberId);return show({title:member.name,body:select('role','Роль',member.role,roles.concat(member.id===repository.context.actorId?[]:[['remove','Удалить из проекта']])),submitLabel:'Сохранить',onSubmit:async values=>{
      const role=values.get('role')==='remove'?null:values.get('role'),body={baseRevision:member.revision,role};
      await client.request(base+'/members/'+encodeURIComponent(member.id),'PATCH',body,await repository.key('member:'+member.id,body));await render();
    }});}
    if(event.target.closest('[data-invite]'))return show({title:'Пригласить в проект',description:'Ссылка действует 24 часа и принимается только одним человеком после входа.',body:select('role','Роль','editor',roles),submitLabel:'Создать ссылку',onSubmit:async(values,_form,element)=>{
      const invitation=await client.request(base+'/invitations','POST',{id:crypto.randomUUID(),role:values.get('role'),expiresInSeconds:86400});
      const url=new URL('/',location.origin);url.hash='invite/'+invitation.token;
      // Secret stays only in this dialog, never in URL logs or browser storage.
      element.querySelector('.map-dialog-body').innerHTML=input('invitation','Одноразовая ссылка',url.href,{maxlength:400});
      const field=element.querySelector('[name=invitation]');field.readOnly=true;field.select();
      const submit=element.querySelector('[type=submit]');submit.remove();element.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';
      await render();return false;
    }});
    const id=event.target.closest('[data-revoke]')?.dataset.revoke;
    if(id)return show({title:'Отменить приглашение?',description:'По этой ссылке больше нельзя будет присоединиться к проекту.',submitLabel:'Отменить приглашение',onSubmit:async()=>{await client.request(base+'/invitations/'+encodeURIComponent(id),'DELETE');await render();}});
  })().catch(error=>show({title:'Не удалось изменить доступ',description:error.message}));},{signal:abort.signal});
  await render();return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;abort.abort();modal?.close(true);root.replaceChildren();}};
}
export async function editProfile(client){
  const profile=await client.request('/profile');
  return dialog({title:'Профиль',body:input('name','Отображаемое имя',profile.name,{required:true,maxlength:100}),submitLabel:'Сохранить',onSubmit:values=>client.request('/profile','PATCH',{baseRevision:profile.revision,name:values.get('name')})});
}
export async function acceptPendingInvitation(client){
  const match=location.hash.match(/^#invite\/(invite_[A-Za-z0-9_-]{43})$/);if(!match)return false;
  return new Promise(resolve=>{
    const el=dialog({title:'Присоединиться к проекту?',description:'После подтверждения проект появится в списке доступных. Ваш текущий доступ к другим проектам не изменится.',submitLabel:'Присоединиться',onSubmit:async()=>{
      const result=await client.request('/invitations/accept','POST',{token:match[1]});const url=new URL(location.href);url.hash='tasks';url.searchParams.set('project',result.slug);history.replaceState(null,'',url);resolve(true);
    }});el.addEventListener('iq-close',()=>{if(location.hash.startsWith('#invite/'))history.replaceState(null,'','#tasks');resolve(false);},{once:true});
  });
}
