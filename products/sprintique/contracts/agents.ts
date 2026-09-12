import {z} from 'zod';
import {Id,Revision} from './index.js';
import {PlanningCommand,CommitPlan} from './planning.js';
export const StartAgentRun=z.strictObject({id:z.uuid(),goal:z.string().trim().min(1).max(1000),maxProposals:z.number().int().min(1).max(20).default(5),expiresInSeconds:z.number().int().min(60).max(3600).default(600),parentRunId:z.uuid().optional()});
export const AgentRunProposal=z.strictObject({baseRevision:Revision,command:PlanningCommand});
export const AgentRunCommit=z.strictObject({baseRevision:Revision,plan:CommitPlan});
export const FinishAgentRun=z.strictObject({baseRevision:Revision,state:z.enum(['completed','failed','cancelled']),errorCode:z.enum(['AGENT_FAILED','CONTEXT_CHANGED','PROVIDER_UNAVAILABLE']).optional()});
export const AgentContextQuery=z.strictObject({taskIds:z.array(Id).max(20).default([]),mapId:Id.optional(),objectIds:z.array(Id).max(100).optional()});
export const agentSchemas={StartAgentRun,AgentRunProposal,AgentRunCommit,FinishAgentRun,AgentContextQuery};
