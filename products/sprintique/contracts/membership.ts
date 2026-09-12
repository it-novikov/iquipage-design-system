import {z} from 'zod';
import {Revision} from './index.js';
export const MemberRole=z.enum(['reader','editor','admin']);
export const ChangeMember=z.strictObject({baseRevision:Revision,role:MemberRole.nullable()});
export const CreateInvitation=z.strictObject({id:z.uuid(),role:MemberRole,expiresInSeconds:z.number().int().min(60).max(604800).default(86400)});
export const AcceptInvitation=z.strictObject({token:z.string().regex(/^invite_[A-Za-z0-9_-]{43}$/)});
export const ChangeProfile=z.strictObject({baseRevision:Revision,name:z.string().trim().min(1).max(100)});
export const ChangeWorkspaceMember=z.strictObject({baseRevision:Revision,role:z.enum(['member','admin']).nullable()});
