import {z} from 'zod';
// Delegated access for people (docs/decisions/0003-public-api-mcp.md): the consent decision of the OAuth flow and
// personal access tokens. Both are managed only from the interface with a session.
export const TokenScope=z.enum(['read','write']);
/** The person's answer on the consent screen; `request` is the authorize query string exactly as the client sent it. */
export const OAuthDecision=z.strictObject({request:z.string().min(1).max(4000),approve:z.boolean(),scopes:z.array(TokenScope).min(1).max(2)});
export const PersonalToken=z.strictObject({name:z.string().trim().min(1).max(100),scopes:z.array(TokenScope).min(1).max(2),expiresInDays:z.number().int().min(1).max(365)});
export const accessSchemas={OAuthDecision,PersonalToken};
