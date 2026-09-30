import {z} from 'zod';
import {Id,Revision} from './index.js';
// Programmatic access through service accounts (docs/decisions/0003-public-api-mcp.md): the consent decision of the
// OAuth flow, service accounts, their projects and tokens. All of it is managed only from the interface with a session.
export const TokenScope=z.enum(['read','write']);
/** The role of a service account in one project; the permission catalog replaces it and its grants later. */
export const ServiceAccountRole=z.enum(['reader','editor']);
const ServiceAccountName=z.string().trim().min(1).max(100);
/** A new service account made on the consent screen: its workspace and the projects it may work in. */
export const NewServiceAccount=z.strictObject({name:ServiceAccountName,workspaceId:z.uuid(),projectIds:z.array(Id).min(1).max(100)});
/**
 * The person's answer on the consent screen; `request` is the authorize query string exactly as the client sent it.
 * An approval names the service account the app will act as: one of the person's own, or a new one.
 */
export const OAuthDecision=z.strictObject({request:z.string().min(1).max(4000),approve:z.boolean(),scopes:z.array(TokenScope).min(1).max(2),
  serviceAccountId:Id.optional(),newServiceAccount:NewServiceAccount.optional()});
/** What a service account holds only when granted explicitly, by the permission catalog's names: finance, never by default. */
export const ServiceAccountGrant=z.enum(['finance.read','finance.write']);
const Granted=z.array(ServiceAccountGrant).max(2).optional();
export const ServiceAccountProject=z.strictObject({projectId:Id,role:ServiceAccountRole,granted:Granted});
export const CreateServiceAccount=z.strictObject({name:ServiceAccountName,workspaceId:z.uuid(),projects:z.array(ServiceAccountProject).max(100)});
export const RenameServiceAccount=z.strictObject({baseRevision:Revision,name:ServiceAccountName});
export const ReassignServiceAccount=z.strictObject({baseRevision:Revision,ownerId:Id});
export const SetServiceAccountProject=z.strictObject({role:ServiceAccountRole,granted:Granted});
export const ServiceToken=z.strictObject({name:z.string().trim().min(1).max(100),scopes:z.array(TokenScope).min(1).max(2),expiresInDays:z.number().int().min(1).max(365)});
export const accessSchemas={OAuthDecision,NewServiceAccount,ServiceAccountProject,CreateServiceAccount,RenameServiceAccount,ReassignServiceAccount,SetServiceAccountProject,ServiceToken};
