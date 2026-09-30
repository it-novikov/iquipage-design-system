import {icon,escapeHTML as esc,formatDate} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import {loadCatalog,diffChips} from './access-ui.js';
import {workspaceRoleNames} from './invitation-model.js';
import * as s from './settings-ui.js';
const sources={preset:['из пресета','neutral'],added:['добавлено','success'],removed:['убрано','danger'],dependency:['по зависимости','info'],forbidden:['недоступно','warning'],absent:['нет в пресете','neutral']};
/** «Что может»: the catalog with a mark and where each permission comes from. Read-only; one's own is always open. */
export async function openEffective({repository,project,member,self=false,canEdit=false,onEdit=()=>{}}){
  const client=repository.client;
  const [catalog,data]=await Promise.all([loadCatalog(client),client.request(`/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(member.id)}/effective`)]);
  const held=new Set(data.permissions),sourceOf=id=>sources[data.sources?.[id]]||sources.absent;
  const changed=data.changedAt?`, изменён ${formatDate(data.changedAt)}${data.changedByName?` — ${data.changedByName}`:''}`:'';
  const space=data.workspaceRole?` В пространстве — ${(workspaceRoleNames[data.workspaceRole]||data.workspaceRole).toLocaleLowerCase('ru')}.`:'';
  const key=Date.now().toString(36),groups=catalog.project.map((g,i)=>`<section class="sq-perm-group" aria-labelledby="effective-${key}-${i}"><h3 id="effective-${key}-${i}">${esc(g.group)}</h3>${s.panel(g.permissions.map(p=>{
    const on=held.has(p.id),[label,tone]=sourceOf(p.id);
    return s.row({media:`<span class="sq-perm-mark" data-on="${on}">${on?icon('check',16):'—'}<span class="sr-only">${on?'Есть':'Нет'}</span></span>`,title:p.title,meta:[esc(p.description)],aside:s.badge(label,tone),state:on?'':'muted'});
  }).join(''),'ul')}</section>`).join('');
  const body=`<div class="sq-access-summary">${s.badge(data.presetName||'Без пресета','planned')}${diffChips(catalog.index,data.added,data.removed)}</div>${groups}`;
  return dialog({title:self?'Что я могу':`Что может ${data.name}`,description:`В проекте «${project.name}». Пресет «${data.presetName||'—'}»${changed}.${space}`,body,wide:true,submitLabel:canEdit&&data.kind==='human'?'Изменить права':'',
    mount:el=>{const close=el.querySelector('.iq-dialog-footer [data-close]');if(close)close.textContent='Понятно';},
    onSubmit:()=>{setTimeout(()=>onEdit(member));}});
}
