import {clone,uid,validText,requireValue} from '../common.js';
import {validateChecklists,taskMarkdown} from './task-content.js';
export const TEMPLATE_MODES=Object.freeze({inherit:'Как в базовом',append:'Дополнить базовый',replace:'Заменить базовый',exclude:'Не добавлять'});
import {STARTER_TASK_TEMPLATES} from '../../../contracts/template-defaults.ts';
export {STARTER_TASK_TEMPLATES};
export function starterTaskSettings(projectId){const settings=emptyTaskSettings(projectId);settings.starterVersion=1;for(const type of ['task','bug','epic'])settings.types[type]={description:STARTER_TASK_TEMPLATES.find(t=>t.id===type).description,descriptionMode:'replace',checklists:[],contentVersion:2};return settings;}
/** Explicit editor upgrade only. Keep a recovery copy and every effective type's content. */
export function upgradeLegacyTaskSettings(settings){
  const next=clone(settings);next.legacyTemplateSettings=clone({base:settings.base,types:settings.types});
  next.base={...next.base,description:taskMarkdown(settings.base),checklists:[],contentVersion:2};
  for(const type of ['task','bug','epic'])next.types[type]={...next.types[type],description:taskMarkdown(compileTaskTemplate(settings,type)),descriptionMode:'replace',checklists:[],checklistsMode:'exclude',contentVersion:2};
  return next;
}
export function emptyTaskSettings(projectId) {
  return {id:'task-settings-'+projectId,projectId,revision:0,base:{description:'',checklists:[],priority:'normal'},types:{task:{},bug:{},epic:{}}};
}
export function validateTaskSettings(value) {
  requireValue(value.id==='task-settings-'+value.projectId,'TASK_SETTINGS','На проект предусмотрен один набор шаблонов.');
  requireValue(value.base && value.types && typeof value.types==='object','TASK_SETTINGS','Не задан базовый шаблон.');
  for(const key of Object.keys(value.types))requireValue(['task','bug','epic'].includes(key),'TASK_SETTINGS','Неизвестный тип шаблона.');
  for(const [key,spec] of [['base',value.base],...Object.entries(value.types)]) {
    requireValue(spec && typeof spec==='object','TASK_SETTINGS','Некорректный шаблон.');
    requireValue(validText(spec.description||'',10000),'TASK_SETTINGS','Описание шаблона слишком длинное.');
    validateChecklists(spec.checklists||[]);
    requireValue(spec.priority==null || ['low','normal','high','critical'].includes(spec.priority),'TASK_SETTINGS','Некорректный приоритет шаблона.');
    if(key!=='base')for(const field of ['descriptionMode','checklistsMode'])requireValue(spec[field]===undefined||Object.hasOwn(TEMPLATE_MODES,spec[field]),'TASK_SETTINGS','Неизвестное правило наследования.');
  }
  for(const type of ['task','bug','epic'])requireValue(compileTaskTemplate(value,type).description.length<=10000,'TASK_SETTINGS','Итоговое описание шаблона превышает 10 000 символов.');
  return clone(value);
}
function combine(base,own,mode,join,empty) {
  return mode==='exclude'?empty:mode==='replace'?own:mode==='append'?join(base,own):base;
}
export function compileTaskTemplate(settings,type='task') {
  requireValue(['task','bug','epic'].includes(type),'TASK_TYPE','Неизвестный тип задачи.');
  const base=settings.base,own=settings.types[type]||{};
  return {
    description:combine(base.description||'',own.description||'',own.descriptionMode,(a,b)=>[a,b].filter(Boolean).join('\n\n'),''),
    checklists:clone(combine(base.checklists||[],own.checklists||[],own.checklistsMode,(a,b)=>[...a,...b],[])),
    priority:own.priority||base.priority||'normal',
    templateVersion:{settingsId:settings.id,revision:settings.revision,type}
  };
}
export function instantiateTaskTemplate(settings,type='task') {
  const result=compileTaskTemplate(settings,type);
  result.checklists=result.checklists.map(list=>({...list,id:uid('checklist'),items:list.items.map(item=>({...item,id:uid('check'),done:false}))}));
  return result;
}
/** Missing defaults only; caller-authored content and subsequent type edits are never overwritten. */
export function applyCreationTemplate(task,settings) {
  if(!settings || task.templateVersion)return task;
  const defaults=instantiateTaskTemplate(settings,task.type||'task');
  return {...task,
    description:task.description || defaults.description,
    checklists:task.checklists ?? defaults.checklists,
    priority:task.priority ?? defaults.priority,
    templateVersion:defaults.templateVersion
  };
}
