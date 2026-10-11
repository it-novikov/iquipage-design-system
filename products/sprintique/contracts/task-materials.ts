import {z} from 'zod';
import {Id,Revision} from './index.js';

export const TaskMaterialInput=z.strictObject({
  category:z.enum(['design','documentation']),
  title:z.string().trim().min(1).max(200),
  url:z.string().trim().min(1).max(2048),
  archived:z.boolean().default(false)
});
export const PutTaskMaterial=z.strictObject({baseRevision:Revision,value:TaskMaterialInput});
export const TaskMaterial=z.strictObject({
  id:Id,projectId:Id,taskId:Id,category:TaskMaterialInput.shape.category,
  title:TaskMaterialInput.shape.title,url:TaskMaterialInput.shape.url,
  revision:Revision.min(1),
  archivedAt:z.iso.datetime({offset:true}).nullable(),
  createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true})
});
export const TaskMaterialList=z.array(TaskMaterial).max(100);
export const TaskMaterialReceipt=z.strictObject({
  receipt:z.literal('task-material'),id:Id,projectId:Id,taskId:Id,
  revision:Revision.min(1),updatedAt:z.iso.datetime({offset:true})
});
export const TaskMaterialWriteResponse=z.union([TaskMaterial,TaskMaterialReceipt]);
export type TaskMaterialRecord=z.infer<typeof TaskMaterial>;
export const taskMaterialSchemas={TaskMaterialInput,PutTaskMaterial,TaskMaterial,TaskMaterialList,TaskMaterialReceipt,TaskMaterialWriteResponse};
