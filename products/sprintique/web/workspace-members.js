import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {choose,rowMenu,plural,explain} from './access-ui.js';
import {openInviteDialog} from './invite-dialog.js';
import {workspaceRoleNames} from './invitation-model.js';
import {workspaceRowRights} from './permissions.js';
import * as s from './settings-ui.js';
const hints={owner:'Единственный владелец: передаёт владение, удаляет пространство.',admin:'Управляет пространством, людьми и приглашениями.',member:'Видит пространство и свои проекты. В проекты его добавляют администраторы.',guest:'Видит только проекты, в которые его пригласили.'};
const creators=[['admins','Только администраторы'],['members','Все участники']];
/**
 * Workspace people: owner, administrators and members, then guests, then the workspace rules. A workspace role never
 * grants task access. Roles need «Управлять людьми»; only the owner transfers ownership. The API checks every change.
 */
export async function mountWorkspaceMembers(root,{repository,project,workspace,tools}){
  const client=repository.client,base='/workspaces/'+encodeURIComponent(workspace?.id||project.workspaceId),abort=new AbortController(),self=repository.context.actorId;
  let closed=false,modal=null,members=[],access=null,loading=0;
  function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;},{once:true});return element;}
  const has=permission=>(access?.permissions||workspace?.permissions||[]).includes(permission);
  if(tools&&(workspace?.permissions||project.workspacePermissions||[]).includes('workspace.invite'))tools.innerHTML=ui.btn('Пригласить','primary sm','plus','data-invite');
  function personRow(m){
    const mine=m.id===self,guest=m.role==='guest',names=m.projectNames||[];
    const extra=`${mine?' '+s.badge('Вы'):''}${guest?' '+s.badge('Гость','planned'):''}`;
    // DS-GAP: the DS icon set has no crown or shield; the owner is marked with «star» until it does.
    // Rows above the actor are read-only: the owner row, administrators for anyone but the owner, wider permissions.
    const rights=workspaceRowRights({actorId:self,role:access?.role,permissions:access?.permissions||workspace?.permissions||[]},m);
    const aside=m.role==='owner'?`<span class="sq-owner-mark">${icon('star',16)}<span>Владелец</span></span>`
      :rights.roles.length>1?choose('role','Роль в пространстве: '+m.name,m.role,rights.roles.map(r=>[r,workspaceRoleNames[r]])
        .concat(rights.roles.includes(m.role)?[]:[[m.role,workspaceRoleNames[m.role]||m.role,true]]),'label-hidden density="compact" data-workspace-role')
      :esc(workspaceRoleNames[m.role]||m.role);
    const items=[];
    if(rights.transfer)items.push({label:'Передать владение',action:'transfer-owner',glyph:'star'});
    if(rights.remove)items.push({label:'Убрать из пространства',action:'remove-workspace-member',danger:true,glyph:'trash'});
    const projects=guest?(names.length?esc(names.length>1?`Проекты: ${names.join(', ')}`:`Только проект «${names[0]}»`):'Ни одного проекта'):esc(m.projects?plural(m.projects,['проект','проекта','проектов']):'Ни одного проекта');
    return s.row({media:s.avatar(m.name,m.id,client.avatarUrl?.(m.id,m.avatarRevision)),title:m.name,titleExtra:extra,meta:[esc(hints[m.role]||''),projects,guest&&m.invitedByName?`Приглашение от ${esc(m.invitedByName)}`:''],
      aside,actions:items.length?rowMenu(m.name,items):'<span class="iq-settings-row-spacer"></span>',attrs:`data-member-id="${esc(m.id)}"`});
  }
  function render(){
    if(closed)return;
    const people=members.filter(m=>m.role!=='guest'),guests=members.filter(m=>m.role==='guest');
    const rule=has('workspace.settings')?choose('projectsCreatedBy','Проекты создают',access.projectsCreatedBy,creators,'label-hidden density="compact" data-projects-rule'):esc(creators.find(c=>c[0]===access.projectsCreatedBy)?.[1]||'');
    root.innerHTML=`${s.group({title:'Люди',count:people.length,description:'Роль в пространстве меняется сразу. Доступ к задачам выдаётся в каждом проекте отдельно.',body:s.panel(people.map(personRow).join(''),'ul')})}
      ${s.group({title:'Гости',count:guests.length,description:'Внешние люди: видят только проекты, в которые их пригласили. Их нельзя выбрать при добавлении в проект — только пригласить снова.',
        body:s.panel(guests.map(personRow).join('')||s.empty({title:'Гостей нет',body:'Гости появляются, когда их приглашают в проект.',glyph:'user'}),'ul')})}
      ${s.group({title:'Правила пространства',body:s.panel(s.row({media:s.tile('folder'),title:'Проекты создают',meta:['Создатель проекта становится его администратором.'],aside:rule,actions:'<span class="iq-settings-row-spacer"></span>'})
        +s.row({media:s.tile('lock'),title:'Владелец и администраторы могут войти в любой проект',meta:['Как администраторы проекта, с записью в его истории. Участники проекта увидят, кто и когда вошёл.'],aside:'Всегда',actions:'<span class="iq-settings-row-spacer"></span>'}),'ul')})}`;
  }
  async function load(){
    const sequence=++loading;const [list,settings]=await Promise.all([client.request(base+'/members'),client.request(base+'/access')]);
    if(closed||sequence!==loading)return;members=list;access=settings;render();
  }
  const patch=(member,body)=>client.request(base+'/members/'+encodeURIComponent(member.id),'PATCH',{baseRevision:member.revision,...body});
  function remove(member){
    let remains=false;
    const el=track(dialog({title:`Убрать ${member.name} из пространства?`,description:'Человек перестанет видеть пространство. Его задачи и комментарии останутся.',submitLabel:'Убрать',
      onSubmit:async()=>{try{await patch(member,{role:null});}catch(error){if(error.code==='PROJECT_ACCESS_REMAINS'){remains=true;return;}throw Error(explain(error));}notify({tone:'success',message:`${member.name} больше не в пространстве`});await load();}}));
    el.addEventListener('iq-close',()=>{if(!remains)return;const names=member.projectNames||[];
      track(dialog({title:`${member.name} ещё участвует в проектах`,description:`${names.length?`Проекты: ${names.join(', ')}. `:''}Убрать человека и из них? Доступ к задачам пропадёт сразу.`,submitLabel:'Убрать и из проектов',success:`${member.name} больше не в пространстве и его проектах`,
        onSubmit:async()=>{try{await patch(member,{role:null,alsoFromProjects:true});}catch(error){throw Error(explain(error));}await load();}}));},{once:true});
  }
  function transfer(member){
    track(dialog({title:'Передать владение пространством',description:'Владелец у пространства один. Новый владелец получит право передавать владение и удалять пространство; вы останетесь администратором.',submitLabel:'Передать владение',success:`${member.name} — владелец пространства`,
      body:`<p class="iq-control-label">Новый владелец</p>${s.panel(s.row({media:s.avatar(member.name,member.id,client.avatarUrl?.(member.id,member.avatarRevision)),title:member.name,meta:[esc(workspaceRoleNames[member.role]||'')]}))}
        <label class="iq-check"><input type="checkbox" name="understood" required><span class="iq-check-box">${icon('check',14)}</span><span>Понимаю: вернуть владение сможет только новый владелец</span></label><p class="iq-helper">Действие попадёт в журнал пространства.</p>`,
      onSubmit:async values=>{if(!values.get('understood'))throw Error('Подтвердите, что понимаете последствия.');try{await client.request(base+'/owner/transfer','POST',{toPrincipalId:member.id});}catch(error){throw Error(explain(error));}await load();}}));
  }
  root.addEventListener('iq-change',event=>{
    const rule=event.target.closest('[data-projects-rule]');
    if(rule){if(event.detail.value===access.projectsCreatedBy)return;void(async()=>{try{await client.request(base+'/access','PUT',{baseRevision:access.revision,projectsCreatedBy:event.detail.value,defaultMemberPresetId:access.defaultMemberPresetId??null,defaultGuestPresetId:access.defaultGuestPresetId??null});
      notify({tone:'success',message:event.detail.value==='members'?'Проекты создают все участники':'Проекты создают только администраторы'});await load();}catch(error){rule.value=access.projectsCreatedBy;notify({tone:'danger',message:'Правило не изменено',description:explain(error),duration:10000});}})();return;}
    const control=event.target.closest('[data-workspace-role]');if(!control)return;
    const member=members.find(m=>m.id===control.closest('[data-member-id]')?.dataset.memberId);if(!member||event.detail.value===member.role)return;
    void(async()=>{const row=control.closest('.iq-settings-row');row?.setAttribute('aria-busy','true');
      try{await patch(member,{role:event.detail.value});notify({tone:'success',message:`${member.name}: ${(workspaceRoleNames[event.detail.value]||'').toLocaleLowerCase('ru')} пространства`});await load();}
      catch(error){control.value=member.role;notify({tone:'danger',message:'Роль не изменена',description:explain(error),duration:10000});}finally{row?.removeAttribute('aria-busy');}})();
  },{signal:abort.signal});
  const onClick=event=>{
    if(event.target.closest('[data-invite]')){void openInviteDialog({repository,project,scope:'workspace',onDone:load}).then(track).catch(error=>notify({tone:'danger',message:'Не удалось открыть приглашение',description:explain(error)}));return;}
    const action=event.target.closest('[data-action]')?.dataset.action,member=members.find(m=>m.id===event.target.closest('[data-member-id]')?.dataset.memberId);if(!member)return;
    if(action==='remove-workspace-member')remove(member);
    if(action==='transfer-owner')transfer(member);
  };
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await load();return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;abort.abort();modal?.close(true);root.replaceChildren();}};
}
