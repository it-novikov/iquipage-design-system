import {z} from 'zod';
import {Id,Revision,TaskInput,Timezone} from './index.js';
import {STARTER_TASK_TEMPLATES} from './template-defaults.js';
const mode=z.enum(['inherit','append','replace','exclude']);
const TemplateSpec=z.strictObject({description:z.string().max(10000).default(''),priority:TaskInput.shape.priority.unwrap().nullable().optional(),
  descriptionMode:mode.optional(),checklists:z.array(z.never()).max(0).default([]),checklistsMode:mode.optional(),contentVersion:z.literal(2).optional()});
export const TaskSettingsInput=z.strictObject({base:TemplateSpec,types:z.strictObject({task:TemplateSpec,bug:TemplateSpec,epic:TemplateSpec})}).refine(value=>
  Object.values(value.types).every(spec=>spec.descriptionMode!=='append'||[value.base.description,spec.description].filter(Boolean).join('\n\n').length<=10000),'Compiled template exceeds maximum length');
export const PutTaskSettings=z.strictObject({baseRevision:Revision,value:TaskSettingsInput});
export type TaskSettingsData=z.infer<typeof TaskSettingsInput>;
export function defaultTaskSettings():TaskSettingsData{
  const type=(id:string)=>({description:STARTER_TASK_TEMPLATES.find(t=>t.id===id)!.description,descriptionMode:'replace' as const,checklists:[],contentVersion:2 as const});
  return {base:{description:'',priority:'normal',checklists:[],contentVersion:2},types:{task:type('task'),bug:type('bug'),epic:type('epic')}};
}
export const TaskLinkInput=z.strictObject({kind:z.enum(['depends','related']),fromId:Id,toId:Id,archived:z.boolean().default(false)}).refine(v=>v.fromId!==v.toId,'Tasks must differ');
export const PutTaskLink=z.strictObject({baseRevision:Revision,value:TaskLinkInput});
export type TaskLinkData=z.infer<typeof TaskLinkInput>;
export const SearchQuery=z.strictObject({q:z.string().trim().min(1).max(200),cursor:z.string().max(1000).optional()});
export const PutProjectProfile=z.strictObject({baseRevision:Revision,name:z.string().trim().min(1).max(100),avatarAssetId:Id.nullable()});
export const PutWorkspaceProfile=z.strictObject({baseRevision:Revision,name:z.string().trim().min(1).max(100),timezone:Timezone});
