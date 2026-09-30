import {z} from 'zod';
import {Id,Revision} from './index.js';
export const MemberRole=z.enum(['reader','editor','admin']);
export const ChangeMember=z.strictObject({baseRevision:Revision,role:MemberRole.nullable()});
export const ChangeProfile=z.strictObject({baseRevision:Revision,name:z.string().trim().min(1).max(100)});
/** A person's own settings, stored on the server so they follow the person to every device. */
export const PersonPreferences=z.strictObject({confirmReleaseScope:z.boolean()});
/** A person's settings for one project: the release the board shows ('backlog' for no release, null for the running one). */
export const ProjectPreferences=z.strictObject({boardRelease:Id.nullable()});
