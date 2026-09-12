import {z} from 'zod';
import {TaskMedia} from './media.js';
import {TAG_NAME_LIMIT,tagNameLength} from './text.js';

export const Id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const Revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const DateOnly = z.iso.date();
export const TaskInput = z.strictObject({
  ...TaskMedia,
  title: z.string().trim().min(1).max(240),
  description: z.string().max(10000).default(''),
  status: z.enum(['ready','in_progress','review','ready_for_testing','testing','ready_for_release']).default('ready'),
  type: z.enum(['task','bug','epic']).default('task'),
  priority: z.enum(['low','normal','high','critical']).default('normal'),
  owner: z.string().max(120).default(''),
  due: DateOnly.nullable().default(null),
  rank: z.number().finite().default(1024),
  parentId: Id.nullable().default(null),
  releaseId: Id.nullable().default(null),
  tagIds: z.array(Id).max(30).refine(v => new Set(v).size === v.length).default([])
});
export const PutTask = z.strictObject({baseRevision: Revision, task: TaskInput,createInBoard:z.boolean().default(false)});
export type TaskData = z.infer<typeof TaskInput>;
export const CreateThread = z.strictObject({
  id: Id, messageId: Id, body: z.string().trim().min(1).max(20000), requiresResolution: z.boolean()
});
export const AppendMessage = z.strictObject({id: Id, body: z.string().trim().min(1).max(20000), baseRevision: Revision});
export const ResolveThread = z.strictObject({resolved: z.boolean(), baseRevision: Revision});
export const Timezone=z.string().min(1).max(100).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return value==='UTC'||value.includes('/');}catch{return false;}});
export const CreateWorkspace = z.strictObject({name: z.string().trim().min(1).max(100),timezone:Timezone.default('UTC')});
export const CreateProject = z.strictObject({
  workspaceId: z.uuid(), name: z.string().trim().min(1).max(100),
  slug: z.string().min(2).max(48).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  timezone:Timezone.nullable().default(null)
});
export const Capability = z.enum(['tasks:read','tasks:write','threads:read','threads:write','maps:read','maps:write']);
export type Capability = z.infer<typeof Capability>;
export const AgentGrant = z.strictObject({
  name: z.string().trim().min(1).max(100),
  capabilities: z.array(Capability).min(1).max(6).refine(v=>new Set(v).size===v.length),
  expiresInSeconds: z.number().int().min(60).max(86400)
});
export const TagInput = z.strictObject({name: z.string().trim().min(1).max(256).refine(v => tagNameLength(v) <= TAG_NAME_LIMIT), tone: z.enum(['neutral','blue','purple','green','amber','red']), archivedAt: z.iso.datetime().nullable().default(null)});
export const ReleaseInput = z.strictObject({name: z.string().trim().min(1).max(100), status: z.enum(['planned','released']), targetDate: DateOnly.nullable().default(null), archivedAt: z.iso.datetime().nullable().default(null)});
export const PutTag = z.strictObject({baseRevision: Revision, value: TagInput});
export const PutRelease = z.strictObject({baseRevision: Revision, value: ReleaseInput});

// These schemas are static, shipped code. Never compile agent/user supplied schemas.
export const commandSchemas = {PutTask, CreateThread, AppendMessage, ResolveThread, CreateWorkspace, CreateProject, AgentGrant, PutTag, PutRelease};
export const jsonSchemas = Object.fromEntries(Object.entries(commandSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]));

export interface Task extends TaskData {
  id: string; projectId: string; displayId: string; revision: number;
  createdAt: string; updatedAt: string; statusEnteredAt: string;
  preparation:'draft'|'ready';result:'open'|'accepted';assignmentMode:'inherit'|'assigned'|'none';admitted:boolean;plannedStart:string|null;plannedEnd?:string|null;
}
export interface Message {id:string; body:string; authorId:string; createdAt:string}
export interface Thread {
  id:string; projectId:string; taskId:string; revision:number;
  requiresResolution:boolean; resolved:boolean;
  resolution: {actorId:string;at:string}|null;
  createdAt:string; lastActivityAt:string; messages:Message[];
}
export interface ThreadSummary extends Omit<Thread,'messages'> {summary:true;messageCount:number;messages:{body:string}[]}
export interface ThreadPage {items:ThreadSummary[];total:number;unresolved:number;nextCursor:string|null}
export interface Project {id:string;workspaceId:string;name:string;slug:string;key:string;role:'reader'|'editor'|'admin';workspaceName:string;avatarAssetId:string|null}
export interface SessionInfo {principal:{id:string;kind:'human'|'agent';name:string};csrf:string|null;projects:Project[]}
