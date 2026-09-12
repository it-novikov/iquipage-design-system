import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {registerAdvanced} from '@iquipage/web/advanced';
import {dialog,input,select} from '../ui/src/ui.js';

export async function editProjectProfile({repository,project,onChanged}){
  const base='/projects/'+encodeURIComponent(project.id),profile=await repository.client.request(base+'/profile');
  let avatarAssetId=profile.avatarAssetId,cropDialog=null,pending=false;
  const el=dialog({title:'Проект',body:input('name','Название',profile.name,{required:true,maxlength:100})+
    `<p>${esc(profile.slug)} · ${esc(profile.key)} — адрес и префикс задач сохраняются.</p><div data-avatar-status>${avatarAssetId?'Аватар загружен':'Аватар не выбран'}</div>${ui.btn('Изменить аватар','secondary sm','image','data-avatar-edit')}${ui.btn('Убрать аватар','ghost sm','','data-avatar-remove')}`,
    submitLabel:'Сохранить',onSubmit:async values=>{
      if(pending||cropDialog)throw Error('Завершите редактирование аватара.');
      const body={baseRevision:profile.revision,name:values.get('name'),avatarAssetId};
      await repository.client.request(base+'/profile','PUT',body,await repository.key('project-profile:'+project.id,body));
      await onChanged();
    }});
  el.querySelector('[data-avatar-remove]').onclick=()=>{avatarAssetId=null;el.querySelector('[data-avatar-status]').textContent='Аватар будет убран при сохранении.';};
  el.querySelector('[data-avatar-edit]').onclick=()=>{
    if(cropDialog)return;registerAdvanced();
    cropDialog=dialog({title:'Аватар проекта',body:'<iq-image-crop></iq-image-crop>',mount:element=>{
      const crop=element.querySelector('iq-image-crop');crop.controlled=true;crop.aspectRatio=1;
      crop.content={title:'Аватар проекта',subtitle:'Выберите квадратный кадр. Загрузка — до 10 МБ.'};
      crop.addEventListener('iq-crop-request',async event=>{
        const request=event.detail;if(pending)return;pending=true;element.setAttribute('persistent','');
        try{
          const file=new File([await crop.export({size:512,type:'image/webp',quality:.9})],'project-avatar.webp',{type:'image/webp'});
          const asset=await repository.attachmentAdapter.upload({projectId:project.id,id:crypto.randomUUID(),targetType:'project-avatar',targetId:project.id},file,{signal:request.signal});
          if(request.accept()){avatarAssetId=asset.id;el.querySelector('[data-avatar-status]').textContent='Аватар готов. Сохраните настройки проекта.';element.close(true);}
        }catch(error){request.reject(error.message);}finally{pending=false;element.removeAttribute('persistent');}
      });
    }});
    cropDialog.addEventListener('iq-close',()=>{cropDialog=null;},{once:true});
  };
  el.addEventListener('iq-close',()=>cropDialog?.close(true),{once:true});return el;
}

export async function editWorkspace({client,workspaceId,onChanged}){
  const base='/workspaces/'+encodeURIComponent(workspaceId),profile=await client.request(base);
  const canManage=profile.role==='admin',members=canManage?await client.request(base+'/members'):[];
  let child=null;
  const el=dialog({title:'Пространство',description:'Пространство объединяет проекты. Его администратор управляет каталогом, но не получает автоматически доступ к задачам и картам.',
    body:canManage?input('name','Название',profile.name,{required:true,maxlength:100})+input('timezone','Часовой пояс',profile.timezone,{required:true,maxlength:100})+
      `<h3>Участники пространства</h3><div class="iq-list">${members.map(m=>`<div class="iq-list-item"><span>${esc(m.name)} · ${m.role==='admin'?'Администратор':'Участник'}</span>${ui.btn('Изменить','ghost sm','','data-workspace-member="'+esc(m.id)+'"')}</div>`).join('')}</div>`:`<p>${esc(profile.name)} · ${esc(profile.timezone)}</p><p>Настройки изменяет администратор пространства.</p>`,
    submitLabel:canManage?'Сохранить':'',onSubmit:async values=>{
      await client.request(base,'PATCH',{baseRevision:profile.revision,name:values.get('name'),timezone:values.get('timezone')});await onChanged();
    }});
  el.addEventListener('click',event=>{const id=event.target.closest('[data-workspace-member]')?.dataset.workspaceMember;if(!id||child)return;
    const member=members.find(m=>m.id===id);
    child=dialog({title:member.name,description:'Роль пространства не меняет роли внутри проектов.',body:select('role','Роль',member.role,[['member','Участник'],['admin','Администратор'],['remove','Удалить из пространства']]),submitLabel:'Сохранить',onSubmit:async values=>{
      const role=values.get('role');await client.request(base+'/members/'+encodeURIComponent(id),'PATCH',{baseRevision:member.revision,role:role==='remove'?null:role});
      el.close(true);await onChanged();
    }});child.addEventListener('iq-close',()=>{child=null;},{once:true});
  });
  el.addEventListener('iq-close',()=>child?.close(true),{once:true});return el;
}
