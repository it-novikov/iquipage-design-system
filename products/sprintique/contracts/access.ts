import {z} from 'zod';
import {Id,Revision} from './index.js';
// Permissions, presets, workspace people and invitations (docs/access/access-and-invitations.md, part I).
export const PROJECT_PERMISSIONS=['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write','finance.read','finance.write',
  'approvals.decide','agents.manage','members.invite','members.manage','project.settings','project.access'] as const;
export const WORKSPACE_PERMISSIONS=['workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings'] as const;
export const ProjectPermission=z.enum(PROJECT_PERMISSIONS);
export const WorkspacePermission=z.enum(WORKSPACE_PERMISSIONS);
export type ProjectPermission=z.infer<typeof ProjectPermission>;
const permissions=(max:number,item:z.ZodType)=>z.array(item).max(max).refine(v=>new Set(v).size===v.length);
const AssignableWorkspaceRole=z.enum(['admin','member','guest']);
const PresetName=z.string().trim().min(1).max(40),PresetHint=z.string().trim().max(140).default('');
export const CreatePreset=z.strictObject({id:z.uuid(),name:PresetName,hint:PresetHint,permissions:permissions(14,ProjectPermission)});
export const PutPreset=z.strictObject({baseRevision:Revision,name:PresetName,hint:PresetHint,permissions:permissions(14,ProjectPermission)});
export const ResetPreset=z.strictObject({baseRevision:Revision});
export const ChangeMemberAccess=z.strictObject({baseRevision:Revision,presetId:z.uuid(),granted:permissions(14,ProjectPermission).default([]),revoked:permissions(14,ProjectPermission).default([])});
export const AddMember=z.strictObject({principalId:Id,presetId:z.uuid().nullable().default(null)});
export const HandoverAccess=z.strictObject({presetId:z.uuid()});
export const PutProjectAccess=z.strictObject({baseRevision:Revision,defaultMemberPresetId:z.uuid().nullable(),defaultGuestPresetId:z.uuid().nullable()});
export const ChangeWorkspaceMember=z.strictObject({baseRevision:Revision,role:AssignableWorkspaceRole.nullable(),alsoFromProjects:z.boolean().default(false)});
export const ChangeWorkspaceMemberAccess=z.strictObject({baseRevision:Revision,granted:permissions(5,WorkspacePermission).default([]),revoked:permissions(5,WorkspacePermission).default([])});
export const TransferOwnership=z.strictObject({toPrincipalId:Id});
export const PutWorkspaceAccess=z.strictObject({baseRevision:Revision,projectsCreatedBy:z.enum(['admins','members']),defaultMemberPresetId:z.uuid().nullable(),defaultGuestPresetId:z.uuid().nullable()});
const Emails=z.array(z.string().min(3).max(320)).min(1).max(20);
const ProjectIds=z.array(Id).max(100).refine(v=>new Set(v).size===v.length).default([]);
export const CreateInvitations=z.strictObject({emails:Emails,workspaceRole:AssignableWorkspaceRole,presetId:z.uuid().nullable().default(null),projectIds:ProjectIds});
export const CreateProjectInvitations=z.strictObject({emails:Emails,presetId:z.uuid().nullable().default(null)});
const LinkLifetime=z.number().int().min(3600).max(604800).default(604800);
export const CreateInvitationLink=z.strictObject({workspaceRole:AssignableWorkspaceRole,presetId:z.uuid().nullable().default(null),projectIds:ProjectIds,expiresInSeconds:LinkLifetime});
export const CreateProjectInvitationLink=z.strictObject({presetId:z.uuid().nullable().default(null),expiresInSeconds:LinkLifetime});
export const InvitationToken=z.strictObject({token:z.string().regex(/^invite_[A-Za-z0-9_-]{43}$/)});
export const AccessCommand=z.strictObject({});
export const accessSchemas={CreatePreset,PutPreset,ResetPreset,ChangeMemberAccess,AddMember,HandoverAccess,PutProjectAccess,ChangeWorkspaceMember,
  ChangeWorkspaceMemberAccess,TransferOwnership,PutWorkspaceAccess,CreateInvitations,CreateProjectInvitations,CreateInvitationLink,
  CreateProjectInvitationLink,InvitationToken,AccessCommand};
