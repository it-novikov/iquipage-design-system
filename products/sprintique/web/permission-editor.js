import {ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {loadCatalog,choose,presetChoices,diffChips,title,lowerFirst,listPhrase,explain} from './access-ui.js';
import {compile,difference,source,toggle,wouldEnable,wouldDisable,serviceUse,serviceBase,serviceForbidden,inactiveGrants,PROJECT_ACCESS,TASKS_READ} from './permissions.js';
import * as s from './settings-ui.js';
const sourceBadges={preset:['из пресета','neutral'],added:['добавлено','success'],removed:['убрано','danger']};
/** Makes a DS form dialog the DS drawer (full screen on a phone). The dialog helper has no drawer option of its own. */
export function asDrawer(el){el.classList.add('sq-drawer');el.setAttribute('kind','drawer');el.querySelector('dialog').classList.add('iq-drawer');}
/** A quiet note at the start of the dialog footer, before its buttons. */
export function footerNote(el,text){el.querySelector('.iq-dialog-footer')?.insertAdjacentHTML('afterbegin',`<span class="sq-footer-note">${esc(text)}</span>`);}
/**
 * One person's permissions in a project: a preset plus personal additions and removals, one save with baseRevision.
 * Dependencies follow the server: on turns on what it includes, off turns off what needs it. `held` are the actor's
 * own permissions: nobody gives what they lack, and someone holding more than the actor is shown read-only; null means
 * no cap of one's own (a service account's owner or a workspace people manager: the owner's permissions cap it).
 *
 * `service` ({ownerName, ownerPermissions}) edits a service account instead: service presets only; the permissions
 * service accounts never hold are locked; explicit ones (finance) come only as personal additions; nothing beyond its
 * owner's permissions in the project (ownerPermissions null: the owner is not in the project, the account holds nothing
 * here). A save goes to PUT /service-accounts/{id}/projects/{projectId} without a revision; the server checks it all.
 */
export async function openPermissionEditor({repository,project,member,presets,held,service=null,onSaved=()=>{},onLastAdmin=()=>{}}){
  const client=repository.client,{index,project:groups}=await loadCatalog(client),own=held?new Set(held):null;
  const self=!service&&member.id===repository.context.actorId,guest=!service&&member.workspaceRole==='guest';
  const owner=service?.ownerPermissions?new Set(service.ownerPermissions):null,orphan=!!service&&!owner;
  const forbidden=service?serviceForbidden(index,service.ownerPermissions):guest?[PROJECT_ACCESS]:[];
  const readOnly=orphan||!self&&!!own&&(member.permissions||[]).some(p=>!own.has(p));
  let presetId=member.presetId,notes=new Map();
  const presetOf=()=>{const list=presets.find(p=>p.id===presetId)?.permissions||[];return service?serviceBase(index,list):list;};
  // A service account starts from its grant compiled under its owner now, as the database does.
  let effective=service?compile(index,{base:presetOf(),granted:member.granted||[],revoked:member.revoked||[],forbidden}):new Set(member.permissions);
  const snapshot=()=>JSON.stringify([presetId,[...effective].sort()]),baseline=snapshot();
  const inactive=service?inactiveGrants(index,member.granted||[],service.ownerPermissions):[];
  function lockOf(id,on){
    if(id===TASKS_READ)return 'Есть у каждого участника';
    if(service&&serviceUse(index,id)==='never')return 'Недоступно сервисным аккаунтам';
    if(service&&!owner?.has(id))return 'Нет у владельца';
    if(guest&&id===PROJECT_ACCESS)return 'Нельзя дать гостю';
    if(!on&&own&&!own.has(id))return 'Нет у вас';
    return '';
  }
  function summary(){
    const {granted,revoked}=difference(index,presetOf(),effective),name=presets.find(p=>p.id===presetId)?.name||'—';
    const cap=service?s.badge(`Не шире прав владельца${service.ownerName?`: ${service.ownerName}`:''}`):'';
    return `${s.badge(name,'planned')}${diffChips(index,granted,revoked)}${cap}${readOnly?'':granted.length||revoked.length?ui.btn('Вернуть к пресету','ghost sm','refresh','data-editor-reset'):'<span class="iq-helper">Права совпадают с пресетом.</span>'}`;
  }
  function permissionRow(p){
    const on=effective.has(p.id),lock=lockOf(p.id,on);
    // A permission locked off for a service account says why in its lock, not as «убрано».
    const [label,tone]=service&&lock&&!on?[]:sourceBadges[source(index,presetOf(),effective,p.id)]||[];
    const explicit=service&&serviceUse(index,p.id)==='explicit'?' '+s.badge('явно','warning'):'';
    const next=on?wouldDisable(index,effective,p.id):wouldEnable(index,effective,p.id);
    const hint=lock?`<span class="sq-perm-hint">${icon('lock',14)}<span>${esc(lock)}</span></span>`:notes.has(p.id)?`<span class="sq-perm-hint" data-tone="note">${esc(notes.get(p.id))}</span>`:next.length?`<span class="sq-perm-hint">${on?'Выключит':'Включит'}: ${esc(next.map(id=>lowerFirst(title(index,id))).join(', '))}</span>`:'';
    return s.row({title:p.title,titleExtra:(label?' '+s.badge(label,tone):'')+explicit,meta:[esc(p.description),hint],actions:ui.toggle(p.title,on,`data-perm="${esc(p.id)}"${lock||readOnly?' disabled':''}`,false),state:on?'':'muted'});
  }
  const catalog=()=>groups.map((g,i)=>`<section class="sq-perm-group" aria-labelledby="perm-group-${i}"><h3 id="perm-group-${i}">${esc(g.group)}</h3>${s.panel(g.permissions.map(permissionRow).join(''),'ul')}</section>`).join('');
  const choices=presetChoices(index,presets,{guest,held:readOnly||!own?null:held,current:member.presetId});
  const locks=[orphan?s.lock('Владелец аккаунта не участник проекта: здесь аккаунт ничего не может. Добавьте владельца в проект или передайте аккаунт другому.'):'',
    !orphan&&readOnly?s.lock(service?'У аккаунта есть права, которых нет у вас. Изменить их может его владелец или администратор пространства.':'У участника есть права, которых нет у вас. Изменить их может администратор проекта.'):'',
    inactive.length&&!readOnly?s.lock(`Не действует: у владельца нет ${listPhrase(inactive.map(id=>`«${title(index,id)}»`))}. При сохранении ${inactive.length>1?'эти добавления уберутся':'это добавление уберётся'}.`):''].join('');
  const presetHint=service?'Пресеты для сервисных аккаунтов не содержат управления и приглашений.':'Отправная точка. Ниже — личные добавления и исключения.';
  const help=service?'Если права владельца сузятся, права аккаунта сузятся вместе с ними. Подключения с областью «Читать» не пишут даже при праве записи.'
    :'Право «запись» включает «чтение» той же области; выключение «чтения» выключит зависимые права. Вы можете дать только то, что есть у вас.';
  const body=`${locks}
    <section class="sq-perm-group" aria-labelledby="perm-preset"><h3 id="perm-preset">Пресет</h3>${s.panel(s.row({title:'Пресет',meta:[presetHint],aside:choose('presetId','Пресет',presetId,choices,`label-hidden density="compact" data-editor-preset${readOnly?' disabled':''}`)})+`<div class="sq-access-summary" data-editor-summary tabindex="-1">${summary()}</div>`)}</section>
    <div class="sq-perm-catalog" data-editor-catalog>${catalog()}</div>
    <p class="iq-helper">${help}</p>
    <p class="sr-only" role="status" data-editor-status></p>`;
  let el=null;
  function refresh(focus=''){
    el.querySelector('[data-editor-summary]').innerHTML=summary();el.querySelector('[data-editor-catalog]').innerHTML=catalog();
    if(focus)el.querySelector(`[data-perm="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
  }
  const announce=text=>{const node=el.querySelector('[data-editor-status]');node.textContent='';requestAnimationFrame(()=>{node.textContent=text;});};
  const description=service?`${member.name} · проект «${project.name}»${service.ownerName?` · владелец ${service.ownerName}`:''}`:`${member.name} · проект «${project.name}» · ${guest?'гость':'участник пространства'}`;
  el=dialog({title:service?'Права сервисного аккаунта':'Права участника',description,body,submitLabel:readOnly?'':'Сохранить',
    mount:element=>{asDrawer(element);if(!readOnly)footerNote(element,'Изменение попадёт в историю проекта');},
    onSubmit:async()=>{
      if(snapshot()===baseline)return;
      const {granted,revoked}=difference(index,presetOf(),effective);
      if(service){
        try{const saved=await client.request(`/service-accounts/${encodeURIComponent(member.id)}/projects/${encodeURIComponent(project.id)}`,'PUT',{presetId,granted,revoked});await onSaved(saved,member);}
        catch(error){throw Object.assign(Error(explain(error)),{code:error.code});}
        return;
      }
      const body={baseRevision:member.revision,presetId,granted,revoked};
      try{const saved=await client.request(`/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(member.id)}/access`,'PUT',body);await onSaved(saved,member);}
      catch(error){
        if(error.code==='LAST_ADMIN'){setTimeout(()=>onLastAdmin(presetId));return;}
        throw Object.assign(Error(error.code==='CONFLICT'?'Права участника уже изменены. Закройте окно и откройте его снова, чтобы увидеть новые.':explain(error)),{code:error.code});
      }
    }});
  el.addEventListener('change',event=>{
    const input=event.target.closest('[data-perm]');if(!input||readOnly)return;
    const id=input.dataset.perm,result=toggle(index,effective,id,input.checked);
    effective=compile(index,{base:[...result.effective],forbidden});notes=new Map(result.also.map(p=>[p,input.checked?`Включило «${title(index,id)}»`:`Выключено вместе с «${title(index,id)}»`]));
    refresh(id);
    announce(`«${title(index,id)}» ${input.checked?'включено':'выключено'}${result.also.length?`. Также ${input.checked?'включено':'выключено'}: ${listPhrase(result.also.map(p=>title(index,p)))}`:''}.`);
  });
  el.addEventListener('iq-change',event=>{
    if(!event.target.closest('[data-editor-preset]')||event.detail.value===presetId)return;
    // Personal additions and removals stay when the preset changes; the new preset only moves the starting point.
    const {granted,revoked}=difference(index,presetOf(),effective);presetId=event.detail.value;
    effective=compile(index,{base:presetOf(),granted,revoked,forbidden});notes=new Map();refresh();
    announce(`Пресет «${presets.find(p=>p.id===presetId)?.name||''}». Личные изменения сохранены.`);
  });
  el.addEventListener('click',event=>{
    if(!event.target.closest('[data-editor-reset]'))return;
    effective=compile(index,{base:presetOf(),forbidden});notes=new Map();refresh();
    el.querySelector('[data-editor-summary]').focus({preventScroll:true});announce('Права вернулись к пресету.');
  });
  return el;
}
