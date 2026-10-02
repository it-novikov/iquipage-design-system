import {z} from 'zod';
import {Id,Revision} from './index.js';
// AI connections of a workspace and agents of service accounts (docs/decisions/0005-ai-agents.md). The API key is
// accepted on create and on replace, and never returned: responses carry only its last four characters.
export const AiProviderId=z.enum(['anthropic','openai','openai_compatible']);
const ConnectionName=z.string().trim().min(1).max(100);
/** Empty means the provider's own address (Anthropic, OpenAI); an OpenAI-compatible connection needs one. */
const BaseUrl=z.string().trim().min(10).max(500);
/** Printable ASCII without spaces: what provider keys look like (sk-…, sk-ant-…, sk-or-…). */
const ApiKey=z.string().trim().min(8).max(4096).regex(/^[\x21-\x7e]+$/);
const ModelName=z.string().trim().min(1).max(200);
export const CreateAiConnection=z.strictObject({name:ConnectionName,provider:AiProviderId,baseUrl:BaseUrl.nullable().default(null),
  apiKey:ApiKey,defaultModel:ModelName.nullable().default(null)});
/** Without apiKey the sealed key stays; a new address or key clears the last check. */
export const UpdateAiConnection=z.strictObject({baseRevision:Revision,name:ConnectionName,baseUrl:BaseUrl.nullable().default(null),
  apiKey:ApiKey.optional(),defaultModel:ModelName.nullable().default(null)});
/** The agent of a service account: connection and model, its owner's instructions, start on assignment, limits. */
export const AgentSettings=z.strictObject({baseRevision:Revision,enabled:z.boolean(),connectionId:z.uuid().nullable(),model:ModelName,
  instructions:z.string().max(8000).default(''),onAssignment:z.boolean().default(true),onMention:z.boolean().default(true),
  maxSteps:z.number().int().min(1).max(50).default(12),maxOutputTokens:z.number().int().min(256).max(32000).default(2048),
  runsPerHour:z.number().int().min(1).max(200).default(20),maxRunTokens:z.number().int().min(10000).max(5000000).default(500000)});
export const StartTaskAgentRun=z.strictObject({accountId:Id});
/** «Проверить» a connection and «Остановить» a run carry no fields. */
export const AiCommand=z.strictObject({});
export const aiSchemas={CreateAiConnection,UpdateAiConnection,AgentSettings,StartTaskAgentRun,AiCommand};
