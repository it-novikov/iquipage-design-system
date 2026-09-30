import {ui,icon,escapeHTML as esc,notify,formatDate,formatDateTime,formatTime} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {openInviteDialog} from './invite-dialog.js';
import {rowMenu,explain} from './access-ui.js';
import {invitationBadge,isWaiting,resendableAt,workspaceRoleNames} from './invitation-model.js';
import * as s from './settings-ui.js';
const clock=date=>formatTime(`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`,24);
/** One invitation as a settings row: address or link, role, projects, who sent it, what happened to the letter. */
export function invitationRow(i,{now=new Date()}={}){
  const [label,tone]=invitationBadge(i),waiting=isWaiting(i),link=i.kind==='link',names=i.projectNames||[];
  const title=link?`Ссылка для пресета «${i.presetName||'—'}»${names.length?` — ${names.length>1?'проекты':'проект'} ${names.map(n=>`«${n}»`).join(', ')}`:''}`:i.email;
  const at=resendableAt(i),wait=at&&at>now;
  const meta=[esc(workspaceRoleNames[i.workspaceRole]||''),!link&&names.length?esc(`${names.length>1?'Проекты':'Проект'}: ${names.join(', ')}`):'',
    `${link?'Создана':'Отправлено'} ${esc(formatDateTime(i.createdAt))}${i.inviterName?` — ${esc(i.inviterName)}`:''}`,
    i.state==='accepted'?`Принято ${esc(formatDate(i.acceptedAt))}${i.acceptedByName?` — ${esc(i.acceptedByName)}`:''}`
      :i.state==='revoked'?`Отменено ${esc(formatDate(i.revokedAt))}${i.revokedByName?` — ${esc(i.revokedByName)}`:''}`
      :i.state==='replaced'?`Заменено новым письмом ${esc(formatDate(i.replacedAt))}`
      :label==='Истекло'?`Срок вышел ${esc(formatDate(i.expiresAt))}`
      :i.delivery==='failed'?`Письмо не ушло: ${esc(i.deliveryError||'почтовый сервер не ответил')}`:`Действует до ${esc(formatDateTime(i.expiresAt))}`,
    i.resendCount?esc(`Отправлено повторно: ${i.resendCount}`):'',wait?esc(`Отправить снова можно в ${clock(at)}`):''];
  let actions='<span class="iq-settings-row-spacer"></span>';
  if(waiting&&link)actions=ui.btn('Отменить','ghost sm','',`data-revoke="${esc(i.id)}"`);
  else if(waiting){
    const resend=i.delivery==='failed'?ui.btn('Повторить','secondary sm','refresh',`data-resend="${esc(i.id)}"`):at?`<button type="button" class="iq-btn ghost sm" data-resend="${esc(i.id)}"${wait?' disabled':''}>Отправить снова</button>`:'';
    actions=resend+rowMenu(i.email,[{label:'Отменить приглашение',action:'revoke-invitation',danger:true,glyph:'trash'}]);
  }
  return s.row({media:s.tile(link?'link':'send'),title,meta,aside:s.badge(label,tone),actions,state:waiting&&label!=='Истекло'?'':'muted',attrs:`data-invitation-id="${esc(i.id)}"`});
}
/** Resend, retry and cancel, shared by the workspace section and a project's members. Returns true when handled. */
export function invitationAction(event,{client,show,reload}){
  const resend=event.target.closest('[data-resend]'),revoke=event.target.closest('[data-revoke]')?.dataset.revoke||(event.target.closest('[data-action="revoke-invitation"]')?event.target.closest('[data-invitation-id]')?.dataset.invitationId:'');
  if(resend&&!resend.disabled){
    void(async()=>{resend.disabled=true;try{
      const result=await client.request('/invitations/'+encodeURIComponent(resend.dataset.resend)+'/resend','POST',{}),sent=result.invitations?.[0];
      if(sent?.delivery==='failed')notify({tone:'warning',message:'Письмо снова не ушло',description:`${sent.email}: ${sent.deliveryError||'почтовый сервер не ответил'}`,duration:10000});
      else notify({tone:'success',message:'Письмо отправлено снова',description:sent?.email?`${sent.email}. Старая ссылка больше не работает.`:''});
      await reload();
    }catch(error){resend.disabled=false;notify({tone:'danger',message:'Не удалось отправить',description:explain(error),duration:10000});}})();
    return true;
  }
  if(revoke){
    show({title:'Отменить приглашение?',description:'Ссылка из письма перестанет работать. Позже человека можно пригласить снова.',submitLabel:'Отменить приглашение',success:'Приглашение отменено',
      onSubmit:async()=>{await client.request('/invitations/'+encodeURIComponent(revoke),'DELETE');await reload();}});
    return true;
  }
  return false;
}
/** Next moment a disabled «Отправить снова» turns on, to redraw then. */
export const nextResend=(list,now=Date.now())=>list.map(i=>resendableAt(i)?.getTime()||0).filter(t=>t>now).sort((a,b)=>a-b)[0]||0;

/** Workspace «Приглашения»: who was invited and what happened to the letters. Needs workspace.invite; the API checks. */
export async function mountInvitations(root,{repository,project,tools}){
  const client=repository.client,base='/workspaces/'+encodeURIComponent(project.workspaceId),abort=new AbortController();
  let closed=false,modal=null,list=[],filter='active',query='',timer=0,loading=0;
  function show(options){modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;},{once:true});return modal;}
  if(tools)tools.innerHTML=ui.btn('Пригласить','primary sm','plus','data-invite');
  function render(){
    if(closed)return;clearTimeout(timer);
    const q=query.toLocaleLowerCase('ru').trim(),match=i=>!q||[i.email||'',i.presetName||'',...(i.projectNames||[])].join(' ').toLocaleLowerCase('ru').includes(q);
    const waiting=list.filter(isWaiting),done=list.filter(i=>!isWaiting(i)),shownWaiting=waiting.filter(match),shownDone=done.filter(match);
    const controls=`<div class="sq-invite-controls"><div class="iq-segmented" role="group" aria-label="Какие приглашения показать"><button type="button" aria-pressed="${filter==='active'}" data-invite-filter="active">Активные ${waiting.length}</button><button type="button" aria-pressed="${filter==='all'}" data-invite-filter="all">Все ${list.length}</button></div>
      <label class="product-nav-search iq-settings-search sq-invite-search">${icon('search',17)}<input type="search" placeholder="Найти по адресу" aria-label="Найти приглашение по адресу" data-invite-search value="${esc(query)}"></label></div>`;
    const empty=q?s.empty({title:'Ничего не нашли',body:'Проверьте адрес.',glyph:'search'}):s.empty({title:'Никто не ждёт ответа',body:'Пригласите людей по почте или создайте ссылку без письма.',action:ui.btn('Пригласить','secondary sm','plus','data-invite'),glyph:'send'});
    root.innerHTML=`${controls}
      ${s.group({title:'Ждут ответа',count:waiting.length,description:'Каждая ссылка одноразовая. «Отправить снова» создаёт новое письмо и новую ссылку, старая перестаёт работать.',
        body:s.panel(shownWaiting.map(i=>invitationRow(i)).join('')||empty,'ul')+`<p class="iq-settings-lock">${icon('info',17)}<span>О недоставке мы не узнаём. Если письмо не пришло — проверьте адрес и папку «Спам», затем отправьте снова. Не чаще одного раза в 5 минут.</span></p>`})}
      ${filter==='all'&&done.length?`<details class="iq-accordion" open><summary>Завершённые (${shownDone.length}) ${icon('down',16)}</summary>${s.panel(shownDone.map(i=>invitationRow(i)).join('')||s.empty({title:'Ничего не нашли',glyph:'search'}),'ul')}</details>`:''}
      ${s.group({title:'Лимиты',description:'Защита от рассылок. Лимиты одинаковы для всех и не раскрывают, есть ли у адреса аккаунт.',body:s.panel(s.facts([
        ['За один раз','до 20 адресов'],['Один человек','до 50 писем в сутки'],['Пространство','до 200 писем в сутки, до 500 ожидающих приглашений'],
        ['Один адрес','до 5 писем в сутки со всей платформы, повтор не чаще раза в 5 минут'],['Срок ссылки','7 дней; ссылка без письма — от 1 часа до 7 дней']]))})}`;
    const next=nextResend(waiting);if(next)timer=setTimeout(render,Math.min(next-Date.now()+500,2**31-1));
  }
  async function load(){const sequence=++loading;const value=await client.request(base+'/invitations');if(closed||sequence!==loading)return;list=value;render();}
  const invite=()=>openInviteDialog({repository,project,scope:'workspace',onDone:load}).then(el=>{modal=el;el.addEventListener('iq-close',()=>{if(modal===el)modal=null;},{once:true});}).catch(error=>notify({tone:'danger',message:'Не удалось открыть приглашение',description:explain(error)}));
  const onClick=event=>{
    if(event.target.closest('[data-invite]'))return void invite();
    const chosen=event.target.closest('[data-invite-filter]');if(chosen){filter=chosen.dataset.inviteFilter;render();root.querySelector(`[data-invite-filter="${filter}"]`)?.focus();return;}
    invitationAction(event,{client,show,reload:load});
  };
  root.addEventListener('input',event=>{if(event.target.matches('[data-invite-search]')){query=event.target.value;render();const field=root.querySelector('[data-invite-search]');field.focus();field.setSelectionRange(query.length,query.length);}},{signal:abort.signal});
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await load();
  return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;clearTimeout(timer);abort.abort();modal?.close(true);root.replaceChildren();}};
}
