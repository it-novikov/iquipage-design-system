import {ui,icon,escapeHTML as esc,notify,enhance} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {loadCatalog,loadPresets,heldInWorkspace,presetChoices,choose,radios,plural,lowerFirst,explain} from './access-ui.js';
import {canWorkspace,projectPermissions,WORKSPACE_PERMISSIONS} from './permissions.js';
import {MAX_ADDRESSES,emailProblem,splitAddresses} from './invitation-model.js';
import * as s from './settings-ui.js';
const lifetimes=[['3600','1 час'],['86400','24 часа'],['259200','3 дня'],['604800','7 дней']];
const roles=[['member','Участник','Видит пространство и свои проекты; виден в справочнике.'],['guest','Гость','Только выбранные проекты; не виден в справочнике.'],['admin','Администратор','Люди, проекты, приглашения и пресеты.']];
let sequence=0;
/**
 * Invitations by e-mail (up to 20 addresses) or one link without a letter. From the workspace: a role there, projects
 * and one preset in them. From a project: only a preset; the server decides the role (a member when the author may
 * invite to the workspace, a guest otherwise). Presets wider than the author's own are not offered.
 */
export async function openInviteDialog({repository,project,scope='workspace',onDone=()=>{}}){
  const client=repository.client,workspaceId=project.workspaceId,fromProject=scope==='project',id=++sequence;
  const oversee=canWorkspace(project,'projects.oversee'),asMember=!fromProject||canWorkspace(project,'workspace.invite');
  const [{index},presets,defaults,projects,held]=await Promise.all([loadCatalog(client),loadPresets(client,workspaceId),
    fromProject?client.request(`/projects/${encodeURIComponent(project.id)}/access`):client.request(`/workspaces/${encodeURIComponent(workspaceId)}/access`),
    fromProject?[]:client.request(`/workspaces/${encodeURIComponent(workspaceId)}/projects`),
    oversee?null:fromProject?projectPermissions(project):heldInWorkspace(client,workspaceId)]);
  const defaultFor=guest=>fromProject?(guest?defaults.guestPresetId??defaults.workspaceGuestPresetId:defaults.memberPresetId??defaults.workspaceMemberPresetId):(guest?defaults.defaultGuestPresetId:defaults.defaultMemberPresetId);
  const admin=WORKSPACE_PERMISSIONS.every(p=>canWorkspace(project,p));
  let emails=[],mode='email',role='member',overflow=false;
  const guest=()=>fromProject?!asMember:role==='guest';
  const presetOptions=()=>{const options=presetChoices(index,presets,{guest:guest(),held});const fallback=defaultFor(guest());return {options,value:options.some(o=>o[0]===fallback)?fallback:options[0]?.[0]||''};};
  const presetSelect=()=>{const {options,value}=presetOptions();return choose('presetId',fromProject?'Пресет в проекте':'Пресет в проектах',value,options,`${fromProject?'':'label-hidden '}density="compact" data-invite-preset`);};
  const presetHint=value=>{const preset=presets.find(p=>p.id===value);return preset?`${preset.name}${preset.hint?': '+preset.hint:''}. Личные права можно настроить после принятия приглашения — в строке участника.`:'';};
  const addresses=`<div class="iq-field" data-invite-email><label class="iq-control-label" for="invite-address-${id}">Почта</label>
    <div class="iq-tags-input sq-address-field"><span class="sq-address-chips" data-address-chips></span><input id="invite-address-${id}" type="text" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Адрес или список адресов" aria-describedby="invite-address-help-${id}" data-address-input></div>
    <small class="iq-helper" id="invite-address-help-${id}" data-address-help>До 20 адресов за раз. Вставьте список — разделим сами.</small><p class="iq-helper error" role="alert" data-address-error hidden></p></div>`;
  const space=fromProject?`<p class="iq-helper">${asMember?'Приглашённые войдут в пространство участниками и получат этот проект.':'Приглашённые войдут в пространство гостями и увидят только этот проект.'}</p>`
    :radios('workspaceRole','В пространстве',roles.filter(r=>r[0]!=='admin'||admin),'member');
  const projectList=fromProject?'':`<fieldset class="sq-invite-projects"><legend class="sr-only">Проекты</legend>${projects.map(p=>`<label class="iq-check"><input type="checkbox" name="projectIds" value="${esc(p.id)}" ${p.id===project.id?'checked':''}><span class="iq-check-box">${icon('check',14)}</span><span>${esc(p.name)}</span></label>`).join('')||'<p class="iq-helper">В пространстве пока нет проектов.</p>'}</fieldset>`;
  const body=`${addresses}${space}
    <div class="sq-invite-preset"><div class="sq-invite-preset-head">${fromProject?'':'<span class="iq-control-label">Проекты и пресет в них</span>'}<span data-invite-preset-slot>${presetSelect()}</span></div>${projectList}<small class="iq-helper" data-invite-preset-hint>${esc(presetHint(presetOptions().value))}</small></div>
    <div data-invite-ttl hidden>${choose('ttl','Срок действия ссылки','604800',lifetimes)}</div>
    <p class="iq-settings-lock" data-invite-note>${icon('info',17)}<span></span></p>`;
  let el=null;
  const q=selector=>el.querySelector(selector),input=()=>q('[data-address-input]');
  function note(){
    const preset=presets.find(p=>p.id===q('[data-invite-preset]')?.value);
    q('[data-invite-note] span').textContent=mode==='link'?'Ссылку примет один человек после входа. Покажем её только сейчас: сохранить её мы не сможем.'
      :`Письмо придёт от Sprintique <no-reply@iqui.page> со ссылкой на 7 дней.${preset?` Пресет в письме назван словами: «${preset.name}${preset.hint?' — '+lowerFirst(preset.hint).replace(/\.$/,''):''}».`:''}`;
  }
  function renderAddresses(){
    const bad=emails.filter(a=>emailProblem(a));
    q('[data-address-chips]').innerHTML=emails.map((a,i)=>{const problem=emailProblem(a);return `<span class="iq-tag"${problem?' data-tone="red"':''}>${problem?icon('warning',14):''}<span>${esc(a)}${problem?`<span class="sr-only"> — ${esc(problem)}</span>`:''}</span><button type="button" data-remove-address="${i}" aria-label="Убрать ${esc(a)}">${icon('x',13)}</button></span>`;}).join('');
    const error=q('[data-address-error]'),message=bad.length?`${bad[0]} — ${emailProblem(bad[0])}. Исправьте или уберите адрес.`:overflow?`Не больше ${MAX_ADDRESSES} адресов за раз: лишние не добавлены.`:'';
    error.hidden=!message;error.textContent=message;q('[data-invite-email] .sq-address-field').toggleAttribute('data-invalid',!!bad.length);
    q('[data-address-help]').textContent=`До ${MAX_ADDRESSES} адресов за раз. Вставьте список — разделим сами.${emails.length?` Добавлено: ${emails.length} из ${MAX_ADDRESSES}.`:''}`;
    // The label counts only addresses that can be sent; the send itself refuses while an address is wrong.
    const good=emails.length-bad.length,submit=q('[type=submit]');if(submit&&mode==='email')submit.textContent=good>1?`Отправить ${plural(good,['приглашение','приглашения','приглашений'])}`:'Отправить приглашение';
  }
  function commit(text=input().value){
    const added=splitAddresses(text,emails);input().value='';if(!added.length)return;
    overflow=emails.length+added.length>MAX_ADDRESSES;emails=[...emails,...added].slice(0,MAX_ADDRESSES);renderAddresses();
  }
  function setMode(next){
    mode=next;q('[data-invite-email]').hidden=mode==='link';q('[data-invite-ttl]').hidden=mode!=='link';
    const toggle=q('[data-invite-mode]');toggle.innerHTML=mode==='link'?`${icon('send',17)}<span>Пригласить письмом</span>`:`${icon('link',17)}<span>Создать ссылку без письма</span>`;
    const submit=q('[type=submit]');if(mode==='link')submit.textContent='Создать ссылку';else renderAddresses();
    note();(mode==='link'?toggle:input()).focus();
  }
  function syncPreset(){q('[data-invite-preset-slot]').innerHTML=presetSelect();q('[data-invite-preset-hint]').textContent=presetHint(presetOptions().value);note();}
  async function send(values){
    commit();
    // A workspace invitation without projects carries no preset: the server refuses a preset with nothing to apply to.
    const projectIds=values.getAll('projectIds').map(String),presetId=fromProject||projectIds.length?values.get('presetId')||null:null;
    if(!fromProject&&guest()&&!projectIds.length)throw Error('Гостя приглашают хотя бы в один проект: отметьте его.');
    if(mode==='link'){
      const body={presetId,expiresInSeconds:Number(values.get('ttl')||604800),...(fromProject?{}:{workspaceRole:role,projectIds})};
      const created=await client.request(fromProject?`/projects/${encodeURIComponent(project.id)}/invitation-links`:`/workspaces/${encodeURIComponent(workspaceId)}/invitation-links`,'POST',body);
      const url=new URL('/',location.origin);url.hash='invite/'+created.token;
      // The secret stays only in this dialog, never in URL logs or browser storage.
      const area=q('.map-dialog-body');area.innerHTML=s.secret({label:'Ссылка-приглашение',value:url.href,note:'Ссылку покажем только сейчас. Её примет один человек после входа.'});enhance(area);
      area.querySelector('input').select();q('[type=submit]').remove();q('[data-invite-mode]').remove();q('.iq-dialog-footer [data-close]').textContent='Готово';
      await onDone();return false;
    }
    if(!emails.length)throw Error('Добавьте хотя бы один адрес.');
    const bad=emails.find(a=>emailProblem(a));if(bad)throw Error(`Исправьте или уберите адрес ${bad}.`);
    let result;
    try{result=await client.request(fromProject?`/projects/${encodeURIComponent(project.id)}/invitations`:`/workspaces/${encodeURIComponent(workspaceId)}/invitations`,'POST',fromProject?{emails,presetId}:{emails,workspaceRole:role,presetId,projectIds});}
    catch(error){throw Error(error.code==='MAIL_UNAVAILABLE'?`${error.message} Можно создать ссылку без письма — кнопка внизу окна.`:explain(error));}
    const list=result.invitations||[],failed=list.filter(i=>i.delivery==='failed');
    if(!failed.length)notify({tone:'success',message:`Отправили ${plural(list.length,['приглашение','приглашения','приглашений'])}`,description:list.map(i=>i.email).join(', ')});
    else notify({tone:'warning',duration:3500,message:failed.length===list.length?'Письма не ушли':'Не все письма ушли',description:failed.map(i=>`${i.email}: ${i.deliveryError||'почтовый сервер не ответил'}`).join('; ')+'. Повторите из списка приглашений или создайте ссылку.'});
    await onDone();
  }
  el=dialog({title:fromProject?`Пригласить в проект «${project.name}»`:'Пригласить в пространство',description:fromProject?'Каждому придёт письмо со ссылкой. Пресет — отправная точка прав; доступны пресеты не шире ваших прав.':'Каждому придёт письмо со ссылкой. Пресет — отправная точка прав; вы можете выбрать только пресет не шире своих прав.',
    body,submitLabel:'Отправить приглашение',onSubmit:send,
    mount:element=>{element.querySelector('.iq-dialog-footer')?.insertAdjacentHTML('afterbegin',ui.btn(`${icon('link',17)}<span>Создать ссылку без письма</span>`,'ghost sm sq-footer-start','','data-invite-mode'));}});
  note();input().focus();
  el.addEventListener('keydown',event=>{
    if(!event.target.matches('[data-address-input]')||event.isComposing)return;
    if([',',';',' '].includes(event.key)||event.key==='Enter'&&input().value.trim()){event.preventDefault();commit();}
    else if(event.key==='Backspace'&&!input().value&&emails.length){emails.pop();overflow=false;renderAddresses();}
  });
  el.addEventListener('paste',event=>{if(!event.target.matches('[data-address-input]'))return;event.preventDefault();commit(input().value+' '+(event.clipboardData?.getData('text')||''));});
  el.addEventListener('focusout',event=>{if(event.target.matches('[data-address-input]'))commit();});
  el.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-address]');
    if(remove){emails.splice(Number(remove.dataset.removeAddress),1);overflow=false;renderAddresses();input().focus();return;}
    if(event.target.closest('[data-invite-mode]'))setMode(mode==='link'?'email':'link');
  });
  el.addEventListener('change',event=>{if(event.target.matches('[name=workspaceRole]')){role=event.target.value;syncPreset();}});
  el.addEventListener('iq-change',event=>{if(event.target.closest('[data-invite-preset]')){q('[data-invite-preset-hint]').textContent=presetHint(event.detail.value);note();}});
  return el;
}
