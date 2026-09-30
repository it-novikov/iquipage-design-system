import {z} from 'zod';
import {Revision} from './index.js';
export const MemberRole=z.enum(['reader','editor','admin']);
export const ChangeMember=z.strictObject({baseRevision:Revision,role:MemberRole.nullable()});
export const ChangeProfile=z.strictObject({baseRevision:Revision,name:z.string().trim().min(1).max(100)});
