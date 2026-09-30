import {ui,icon,escapeHTML as esc,count,formatDate} from '@iquipage/web/core';
import {catalogIndex,closure,within,PROJECT_ACCESS,TASKS_READ} from './permissions.js';
import * as s from './settings-ui.js';
/** Shared pieces of the access screens: the permission catalog, presets, difference chips and row menus. */
const catalogs=new WeakMap();
/** The fixed catalog changes only with a release: one request per page load. */
export function loadCatalog(client){
  if(!catalogs.has(client))catalogs.set(client,client.request('/permissions/catalog').then(value=>({...value,index:catalogIndex(value.project),workspaceIndex:catalogIndex(value.workspace)})).catch(error=>{catalogs.delete(client);throw error;}));
  return catalogs.get(client);
}
/** Presets people can hold, or with subject 'service' those of service accounts («Сервис: чтение», «Сервис: задачи», own). */
export const loadPresets=async(client,workspaceId,subject='human')=>(await client.request('/workspaces/'+encodeURIComponent(workspaceId)+'/presets')).filter(p=>subject==='service'?p.subject==='service':p.subject!=='service');
/** Every project of the session in one workspace: what the actor holds anywhere there. */
export async function heldInWorkspace(client,workspaceId){
  const session=await client.request('/session');
  return [...new Set(session.projects.filter(p=>p.workspaceId===workspaceId).flatMap(p=>p.permissions||[]))];
}
export const plural=(n,[one,few,many])=>count(n,{one,few,many});
export const lowerFirst=text=>text?text[0].toLocaleLowerCase('ru')+text.slice(1):'';
export const listPhrase=items=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' и '+items.at(-1);
export const title=(index,id)=>index.get(id)?.title||id;
export const guestAllowed=(index,preset)=>!closure(index,[...preset.permissions,TASKS_READ]).has(PROJECT_ACCESS);
/** Preset choices for a person: a guest never gets «Управлять доступом»; one cannot give more than one holds. */
export function presetChoices(index,presets,{guest=false,held=null,current=''}={}){
  return presets.filter(p=>p.id===current||(!guest||guestAllowed(index,p))&&(!held||within(index,p.permissions,held))).map(p=>[p.id,p.name]);
}
/** iq-select with options [value,label,disabled?]. attrs: public DS variants only. */
export const choose=(name,label,value,options,attrs='')=>`<iq-select name="${esc(name)}" label="${esc(label)}" value="${esc(value)}"${attrs?' '+attrs:''}>${options.map(([id,text,disabled])=>`<option value="${esc(id)}"${id===value?' selected':''}${disabled?' disabled':''}>${esc(text)}</option>`).join('')}</iq-select>`;
/** The personal difference as the server shows it: «+ added» in the success tone, «− removed» in the danger tone. */
export const diffChips=(index,added=[],removed=[])=>`<span class="sq-access-diff">${added.map(id=>s.badge('+ '+title(index,id),'success')).join('')}${removed.map(id=>s.badge('− '+title(index,id),'danger')).join('')}</span>`;
/** Russian verbs agree with gender we do not store: the change is named by date and author instead. */
export const changedBy=(at,name)=>at?`Изменено ${esc(formatDate(at))}${name?` — ${esc(name)}`:''}`:'';
export const rowMenu=(name,items)=>ui.menu(`<button type="button" class="iq-btn ghost icon sm" aria-label="Действия: ${esc(name)}">${icon('more',17)}</button>`,items);
/** The phrase of a preset in lists: its hint, or how many permissions and which. */
export function presetPhrase(index,preset){
  if(preset.hint)return preset.hint;
  const ids=[...closure(index,[...preset.permissions,TASKS_READ])];
  return `${plural(ids.length,['право','права','прав'])}: ${ids.slice(0,4).map(id=>title(index,id)).join(', ')}${ids.length>4?'…':''}`;
}
export const usagePhrase=p=>p.members?`${plural(p.members,['участие','участия','участий'])}${p.projects>1?` в ${plural(p.projects,['проекте','проектах','проектах'])}`:''}`:'Никому не назначен';
/** Radio choices with a disabled reason, the DS choice list. */
export const radios=(name,legend,options,value)=>`<fieldset class="iq-choice-list"><legend>${esc(legend)}</legend>${options.map(([id,label,hint,disabled])=>`<label><input type="radio" name="${esc(name)}" value="${esc(id)}"${id===value?' checked':''}${disabled?' disabled':''} required><b>${esc(label)}</b>${hint?`<small>${esc(hint)}</small>`:''}</label>`).join('')}</fieldset>`;
/** Messages the API gives are Russian and final; a few codes get the next step added. */
export function explain(error){
  if(error?.code==='CONFLICT')return 'Кто-то уже изменил эти данные. Обновите страницу, чтобы увидеть новые, и повторите.';
  return error?.message||'Не удалось выполнить действие. Повторите попытку.';
}
