import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {dialog,select} from '../ui/src/ui.js';
import * as s from './settings-ui.js';
const roles=[['member','Участник','Видит пространство и его проекты в каталоге.'],['admin','Администратор','Управляет пространством и его участниками.']];
/** Workspace members (workspace admins only; the API checks it again). A workspace role never grants task access. */
export async function mountWorkspaceMembers(root,{repository,project,workspace}){
  const client=repository.client,base='/workspaces/'+encodeURIComponent(workspace.id||project.workspaceId),abort=new AbortController(),self=repository.context.actorId;
  let closed=false,modal=null,members=[];
  function show(options){modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;},{once:true});return modal;}
  function render(){
    if(closed)return;
    root.innerHTML=s.group({title:workspace.name,count:members.length,description:'Роль меняется сразу. Доступ к задачам выдаётся в настройках каждого проекта.',body:s.panel(members.map(m=>s.row({media:s.avatar(m.name,m.id),title:m.name,titleExtra:m.id===self?s.badge('Вы'):'',meta:[esc(roles.find(r=>r[0]===m.role)?.[2]||'')],
      aside:select('role','Роль '+m.name,m.role,roles.map(([id,label])=>[id,label]),'label-hidden density="compact" data-workspace-role'),
      actions:m.id===self?'<span class="iq-settings-row-spacer"></span>':ui.menu(`<button type="button" class="iq-btn ghost icon sm" aria-label="Действия: ${esc(m.name)}">${icon('more',17)}</button>`,[{label:'Убрать из пространства',action:'remove-workspace-member',danger:true,glyph:'trash'}]),
      attrs:`data-member-id="${esc(m.id)}"`})).join(''),'ul')});
  }
  async function load(){members=await client.request(base+'/members');render();}
  const save=async(member,role)=>client.request(base+'/members/'+encodeURIComponent(member.id),'PATCH',{baseRevision:member.revision,role});
  root.addEventListener('iq-change',event=>{const control=event.target.closest('[data-workspace-role]');if(!control)return;const member=members.find(m=>m.id===control.closest('[data-member-id]')?.dataset.memberId);if(!member||event.detail.value===member.role)return;
    void(async()=>{const row=control.closest('.iq-settings-row');row.setAttribute('aria-busy','true');try{await save(member,event.detail.value);notify({message:`${member.name} теперь ${(roles.find(r=>r[0]===event.detail.value)?.[1]||'').toLocaleLowerCase('ru')} пространства`,tone:'success'});await load();}catch(error){control.value=member.role;row.removeAttribute('aria-busy');notify({message:error.message,tone:'danger'});}})();},{signal:abort.signal});
  root.addEventListener('click',event=>{if(!event.target.closest('[data-action="remove-workspace-member"]'))return;const member=members.find(m=>m.id===event.target.closest('[data-member-id]')?.dataset.memberId);if(!member)return;
    show({title:`Убрать ${member.name} из пространства?`,description:'Если человек ещё участвует в проектах пространства, сначала удалите его из них.',submitLabel:'Убрать',success:`${member.name} больше не в пространстве`,onSubmit:async()=>{await save(member,null);await load();}});},{signal:abort.signal});
  await load();return {readyToLeave:()=>!modal,destroy(){closed=true;abort.abort();modal?.close(true);root.replaceChildren();}};
}
