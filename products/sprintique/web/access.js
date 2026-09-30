import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {loadCatalog,loadPresets,presetChoices,choose,diffChips,changedBy,plural,listPhrase,explain} from './access-ui.js';
import {can} from './permissions.js';
import {openEffective} from './effective.js';
import * as s from './settings-ui.js';
/**
 * Project «Доступ»: presets for new members and guests (or the workspace's), members whose permissions differ from
 * their preset, who of the workspace may enter as administrator, and a read-only matrix. Changes need
 * «Управлять доступом» (resetting a difference — «Менять права участников»); the API checks again.
 */
export async function mountAccess(root,{repository,project}){
  const client=repository.client,base='/projects/'+encodeURIComponent(project.id),abort=new AbortController(),self=repository.context.actorId;
  const resetAllowed=can(project,'members.manage');
  let closed=false,modal=null,settings=null,members=[],presets=[],index=new Map(),loading=0;
  function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;},{once:true});return element;}
  const name=id=>presets.find(p=>p.id===id)?.name||'—',manage=()=>settings?.canManage??can(project,'project.access');
  function defaultRow(kind){
    const guest=kind==='guest',value=guest?settings.guestPresetId:settings.memberPresetId,inherited=guest?settings.workspaceGuestPresetId:settings.workspaceMemberPresetId;
    const label=guest?'Гости':'Участники пространства',overridden=!!value;
    const meta=[esc(guest?'Гость получает пресет «Гость» или свой пресет пространства; «Управлять доступом» гостю выдать нельзя.':'Когда человека добавляют из пространства или он принимает приглашение без явного пресета.'),
      esc(`В пространстве по умолчанию: ${name(inherited)}`)];
    const options=[['',`Как в пространстве (${name(inherited)})`],...presetChoices(index,presets,{guest,current:value||''})];
    const aside=manage()?`<span class="sq-preset-aside">${choose(kind,guest?'Пресет для гостей':'Пресет для участников',value||'',options,`label-hidden density="compact" data-default-preset="${kind}"`)}${overridden?' '+s.badge('переопределено','warning'):''}</span>`
      :`<span class="sq-preset-aside">${esc(name(value||inherited))}${overridden?' '+s.badge('переопределено','warning'):''}</span>`;
    return s.row({media:s.tile(guest?'user':'users'),title:label,meta,aside,actions:manage()&&overridden?ui.btn('Как в пространстве','ghost sm','',`data-inherit="${kind}"`):'<span class="iq-settings-row-spacer"></span>'});
  }
  function differenceRow(m){
    return s.row({media:s.avatar(m.name,m.id,client.avatarUrl?.(m.id,m.avatarRevision)),title:m.name,titleExtra:' '+s.badge(m.presetName||'—','planned'),meta:[diffChips(index,m.added,m.removed),changedBy(m.changedAt,m.changedByName)],
      actions:`${m.id===self||resetAllowed?ui.btn(m.id===self?'Что я могу':'Что может','ghost sm','','data-effective'):''}${resetAllowed?ui.btn('Сбросить','secondary sm','refresh','data-reset-difference'):''}`,attrs:`data-member-id="${esc(m.id)}"`});
  }
  function render(){
    if(closed)return;
    const differing=members.filter(m=>m.kind==='human'&&m.modified),admins=settings.workspaceAdministrators||[];
    const lock=manage()?'':s.lock('Вы можете только просматривать. Пресеты по умолчанию меняют те, у кого есть право «Управлять доступом».');
    root.innerHTML=`${lock}
      ${s.group({title:'Пресеты для новых участников',description:'Что получает человек, когда его добавляют в проект из пространства или он принимает приглашение без явного пресета. Права тех, кто уже в проекте, не меняются.',body:s.panel(defaultRow('member')+defaultRow('guest'),'ul')})}
      ${s.group({title:'Отличия от пресетов',count:differing.length,description:'Участники, у которых права в этом проекте отличаются от пресета. Сброс возвращает пресет без личных добавлений и исключений.',
        body:s.panel(differing.map(differenceRow).join('')||s.empty({title:'Все работают по пресетам',body:'Личные добавления и исключения появятся здесь, когда их кто-то сделает.',glyph:'check'}),'ul')})}
      ${s.group({title:'Администраторы пространства',body:s.panel(s.facts([['Вход в проект',esc('Люди с правом «Видеть все проекты и входить в них» могут войти как администраторы. Каждый вход — в истории проекта.')],
        ['Кто это сейчас',esc(listPhrase(admins.map(a=>a.role==='owner'?`${a.name} (владелец)`:a.name))||'Никого')]]))})}
      ${can(project,'project.access')?s.group({title:'Обзор прав',description:'Компактная сводка: кто что может, без редактирования.',body:s.panel(s.row({media:s.tile('grid'),title:'Матрица прав проекта',meta:[esc(`${plural(members.length,['человек','человека','человек'])}, ${plural(index.size,['право','права','прав'])}. Для правки — строка участника.`)],button:'data-matrix'}))}):''}`;
  }
  async function load(){
    const sequence=++loading;
    const [value,people,list,catalog]=await Promise.all([client.request(base+'/access'),client.request(base+'/members'),loadPresets(client,project.workspaceId),loadCatalog(client)]);
    if(closed||sequence!==loading)return;settings=value;members=people;presets=list;index=catalog.index;render();
  }
  async function saveDefaults(change,control){
    const row=control?.closest('.iq-settings-row');row?.setAttribute('aria-busy','true');
    try{await client.request(base+'/access','PUT',{baseRevision:settings.revision,defaultMemberPresetId:settings.memberPresetId,defaultGuestPresetId:settings.guestPresetId,...change});
      notify({tone:'success',message:'Пресет для новых участников сохранён',description:'Права тех, кто уже в проекте, не изменились.'});await load();}
    catch(error){if(control)control.value=control.dataset.defaultPreset==='guest'?settings.guestPresetId||'':settings.memberPresetId||'';notify({tone:'danger',message:'Не сохранено',description:explain(error),duration:10000});}
    finally{row?.removeAttribute('aria-busy');}
  }
  async function matrix(){
    const data=await client.request(base+'/access/matrix'),ids=data.permissions||[...index.keys()];
    const head=`<tr><th scope="col">Участник</th>${ids.map(id=>`<th scope="col">${esc(index.get(id)?.title||id)}</th>`).join('')}</tr>`;
    const rows=data.members.map(m=>{const held=new Set(m.permissions);return `<tr><th scope="row">${esc(m.name)}<small>${esc(m.presetName||'')}${m.kind==='service'?' · сервисный аккаунт':m.kind!=='human'?' · агент':''}</small></th>${ids.map(id=>`<td>${held.has(id)?`${icon('check',16)}<span class="sr-only">Есть</span>`:'<span aria-hidden="true">—</span><span class="sr-only">Нет</span>'}</td>`).join('')}</tr>`;}).join('');
    track(dialog({title:'Матрица прав проекта',description:`Проект «${project.name}». Только просмотр: права меняются в строке участника.`,wide:true,
      body:`<div class="iq-table-wrap sq-matrix" tabindex="0" role="region" aria-label="Матрица прав, прокручивается по горизонтали"><table class="iq-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`}));
  }
  root.addEventListener('iq-change',event=>{
    const control=event.target.closest('[data-default-preset]');if(!control)return;
    const value=event.detail.value||null,kind=control.dataset.defaultPreset;
    if(value===(kind==='guest'?settings.guestPresetId:settings.memberPresetId))return;
    void saveDefaults(kind==='guest'?{defaultGuestPresetId:value}:{defaultMemberPresetId:value},control);
  },{signal:abort.signal});
  root.addEventListener('click',event=>{void(async()=>{
    const inherit=event.target.closest('[data-inherit]')?.dataset.inherit;
    if(inherit)return saveDefaults(inherit==='guest'?{defaultGuestPresetId:null}:{defaultMemberPresetId:null});
    if(event.target.closest('[data-matrix]'))return matrix();
    const member=members.find(m=>m.id===event.target.closest('[data-member-id]')?.dataset.memberId);if(!member)return;
    if(event.target.closest('[data-effective]'))return track(await openEffective({repository,project,member,self:member.id===self}));
    if(event.target.closest('[data-reset-difference]'))track(dialog({title:'Вернуть права к пресету?',description:`${member.name}: останется пресет «${member.presetName}» без личных добавлений и исключений. Изменение попадёт в историю проекта.`,submitLabel:'Сбросить',success:`${member.name}: права как в пресете`,
      onSubmit:async()=>{try{await client.request(`${base}/members/${encodeURIComponent(member.id)}/access`,'PUT',{baseRevision:member.revision,presetId:member.presetId,granted:[],revoked:[]});}catch(error){throw Error(explain(error));}await load();}}));
  })().catch(error=>notify({tone:'danger',message:'Не удалось выполнить действие',description:explain(error),duration:10000}));},{signal:abort.signal});
  await load();
  return {readyToLeave:()=>!modal,destroy(){closed=true;loading++;abort.abort();modal?.close(true);root.replaceChildren();}};
}
