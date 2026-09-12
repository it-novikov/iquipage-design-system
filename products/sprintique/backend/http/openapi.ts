import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import * as core from '../../contracts/index.js';
import * as planning from '../../contracts/planning.js';
import {planningResponseSchemas} from '../../contracts/planning-responses.js';
import * as view from '../../contracts/planning-view.js';
import * as workspace from '../../contracts/workspace.js';
import * as membership from '../../contracts/membership.js';
import {mapSchemas} from '../../contracts/maps.js';
import {mediaSchemas} from '../../contracts/media.js';
import {agentSchemas} from '../../contracts/agents.js';
import {RetryJob} from '../../contracts/operations.js';

const extra={RetryJob,TaskPosition:z.strictObject({baseRevision:core.Revision,status:core.TaskInput.shape.status,rank:core.TaskInput.shape.rank}),
  ViewReleaseQuery:z.strictObject({groupId:core.Id,cursor:z.string().max(3000).optional()})};
/** Only public, code-owned schemas. Custom refinements are still enforced by runtime parsers. */
export const publicSchemas=Object.fromEntries(Object.entries({...core,...planning,...planningResponseSchemas,...view,...workspace,...membership,...mapSchemas,...mediaSchemas,...agentSchemas,...extra})
  .flatMap(([name,schema])=>schema instanceof z.ZodType?[[name,z.toJSONSchema(schema)]]:[]));

const P='/api/v1/projects/:projectId',V=P+'/planning/view';
const bodies:Record<string,string>={
  ['POST '+P+'/operations/jobs/:id/retry']:'RetryJob',
  'POST /api/v1/workspaces':'CreateWorkspace','POST /api/v1/projects':'CreateProject',
  'PATCH /api/v1/profile':'ChangeProfile','POST /api/v1/invitations/accept':'AcceptInvitation',
  'PATCH /api/v1/workspaces/:workspaceId':'PutWorkspaceProfile','PATCH /api/v1/workspaces/:workspaceId/members/:id':'ChangeWorkspaceMember',
  ['PUT '+P+'/tasks/:id']:'PutTask',['PATCH '+P+'/tasks/:id/position']:'TaskPosition',
  ['POST '+P+'/tasks/:id/threads']:'CreateThread',['POST '+P+'/threads/:id/messages']:'AppendMessage',['PATCH '+P+'/threads/:id/resolution']:'ResolveThread',
  ['POST '+P+'/agents']:'AgentGrant',['POST '+P+'/agent-runs']:'StartAgentRun',['POST '+P+'/agent-runs/:id/proposals']:'AgentRunProposal',
  ['POST '+P+'/agent-runs/:id/commit']:'AgentRunCommit',['POST '+P+'/agent-runs/:id/finish']:'FinishAgentRun',['POST '+P+'/agent-context']:'AgentContextQuery',
  ['PATCH '+P+'/members/:id']:'ChangeMember',['POST '+P+'/invitations']:'CreateInvitation',
  ['PUT '+P+'/profile']:'PutProjectProfile',['PUT '+P+'/tags/:id']:'PutTag',['PUT '+P+'/releases/:id']:'PutRelease',
  ['PUT '+P+'/task-settings']:'PutTaskSettings',['PUT '+P+'/task-links/:id']:'PutTaskLink',
  ['PUT '+P+'/maps/:id']:'PutMap',['PUT '+P+'/map-templates/:id']:'PutMapTemplate',['POST '+P+'/assets']:'AssetReservation',
  ['PUT '+P+'/planning/releases/:id']:'ReleaseWrite',['POST '+P+'/planning/previews']:'PlanningCommand',['POST '+P+'/planning/commands']:'CommitPlan',
  ['PUT '+P+'/planning/milestones/:id']:'MilestoneWrite',['PUT '+P+'/planning/constraints/:id']:'ConstraintWrite',['POST '+P+'/approvals/:id/decision']:'ApprovalDecision',
  ['POST '+V+'/groups']:'ViewQuery',['POST '+V+'/rows']:'ViewRowsQuery',['POST '+V+'/timeline']:'ViewQuery',['POST '+V+'/selection']:'ViewSelectQuery',
  ['POST '+V+'/options']:'ViewOptionsQuery',['POST '+V+'/release']:'ViewReleaseQuery',['POST '+V+'/preview']:'ViewIntent'
};
const noKey=new Set(['POST /api/v1/logout','POST /api/v1/workspaces','POST /api/v1/projects','PATCH /api/v1/profile',
  'POST /api/v1/invitations/accept','PATCH /api/v1/workspaces/:workspaceId','PATCH /api/v1/workspaces/:workspaceId/members/:id',
  'POST '+P+'/agents','POST '+P+'/invitations','POST '+P+'/agent-context','POST '+P+'/agent-runs/:id/proposals','POST '+P+'/planning/previews']);
const query=(name:string,schema:object,required=false)=>({in:'query',name,required,schema});
const cursor=query('cursor',{type:'string',maxLength:3000});
const pagination=[cursor,query('limit',{type:'integer',minimum:1,maximum:planning.PAGE_SIZE,default:50})];
const queries:Record<string,object[]>={
  '/api/v1/search':[query('q',{type:'string',minLength:1,maxLength:200},true),cursor],
  [P+'/tasks']:[query('cursor',{type:'integer',minimum:0,default:0})],
  [P+'/maps']:[cursor],[P+'/agent-runs']:[cursor],[P+'/approvals']:[cursor],
  [P+'/maps/:id/history']:[query('before',{type:'integer',minimum:1,maximum:2147483647})],
  [P+'/tasks/:id/threads']:[cursor,query('limit',{type:'integer',minimum:1,maximum:50,default:20})],
  [P+'/events']:[cursor,query('stream',{type:'string',enum:['true']})]
};
for(const path of ['/planning/releases','/planning/previews/:id/effects','/planning/releases/:id/history','/approvals/:id/effects','/planning/constraints'])queries[P+path]=pagination;
for(const path of ['/planning/tasks','/board/tasks'])queries[P+path]=Object.entries(z.toJSONSchema(planning.PlanningQuery).properties||{}).map(([name,schema])=>query(name,schema as object));
queries[P+'/planning/roadmap']=[...pagination,query('from',{type:'string',format:'date'}),query('to',{type:'string',format:'date'}),query('undated',{type:'string',enum:['true','false']})];
const responses:Record<string,string>={
  ['GET '+P+'/planning/tasks']:'PlanningPageResponse',['GET '+P+'/board/tasks']:'PlanningPageResponse',
  ['GET '+P+'/planning/releases']:'ReleasePageResponse',['PUT '+P+'/planning/releases/:id']:'ReleaseResponse',
  ['POST '+P+'/planning/previews']:'PreviewResponse',['POST '+P+'/planning/commands']:'ReceiptResponse',['GET '+P+'/planning/commands/:id']:'ReceiptResponse',
  ['GET '+P+'/planning/previews/:id/effects']:'EffectsPageResponse',['GET '+P+'/approvals/:id/effects']:'EffectsPageResponse',
  ['GET '+P+'/approvals/:id']:'ApprovalResponse',['POST '+P+'/approvals/:id/decision']:'ApprovalResponse',
  ['GET '+P+'/planning/releases/:id/history']:'HistoryPageResponse',['GET '+P+'/planning/capabilities']:'PlanningCapabilitiesResponse',
  ['GET '+P+'/planning/constraints']:'ConstraintPageResponse',['GET '+P+'/planning/roadmap']:'RoadmapPageResponse',
  ['PUT '+P+'/planning/constraints/:id']:'ConstraintResponse',['PUT '+P+'/planning/milestones/:id']:'MilestoneResponse'
};
const ref=(name:string)=>({$ref:'#/components/schemas/'+name});
/** Route inventory is captured from Fastify itself. A newly added write must name its request contract. */
export function registerOpenApi(app:FastifyInstance){
  const paths:Record<string,Record<string,unknown>>={};
  app.addHook('onRoute',route=>{
    if(!route.url.startsWith('/api/v1/'))return;
    for(const method of Array.isArray(route.method)?route.method:[route.method]){
      if(method==='HEAD'||method==='OPTIONS')continue;
      const key=method+' '+route.url,write=!['GET','HEAD'].includes(method),binary=route.url===P+'/assets/:id/content';
      const body=bodies[key],idempotency=write&&method!=='DELETE'&&!noKey.has(key)&&!route.url.startsWith(V+'/')&&!binary;
      if(write&&method!=='DELETE'&&route.url!=='/api/v1/logout'&&!binary&&!body)throw Error('Missing request contract: '+key);
      const path=route.url.replace(/:([A-Za-z]+)/g,'{$1}');
      const parameters:object[]=[...route.url.matchAll(/:([A-Za-z]+)/g)].map(m=>({in:'path',name:m[1],required:true,schema:{type:'string'}}));
      if(method==='GET')parameters.push(...queries[route.url]||[]);
      if(idempotency)parameters.push({in:'header',name:'Idempotency-Key',required:true,schema:{type:'string',minLength:8,maxLength:120}});
      if(write)parameters.push({in:'header',name:'X-CSRF-Token',required:false,description:'Required for human session mutations together with same-origin Origin; not used by bearer agents.',schema:{type:'string'}});
      const response=responses[key];
      (paths[path]||={})[method.toLowerCase()]={operationId:key.replace(/[^A-Za-z0-9]+/g,'_'),tags:[route.url.includes('/planning')?'Planning':route.url.split('/')[5]||'Identity'],
        security:[{humanSession:[]},{agentBearer:[]}],parameters,
        ...(body||binary?{requestBody:{required:true,content:{[binary?'application/octet-stream':'application/json']:{schema:binary?{type:'string',format:'binary'}:ref(body!)}}}}:{}),
        responses:{'200':{description:route.url.endsWith('/events')?'Durable page, or text/event-stream when stream=true.':'Successful response.',...(response?{content:{'application/json':{schema:ref(response)}}}:{})},
          default:{description:'Validation, authorization, conflict, quota or unavailable error. A rejected Planning receipt is a 200 response; inspect its status.',content:{'application/json':{schema:ref('Problem')}}}},
        'x-response-schema':response?'declared':'see-resource-contract',
        'x-idempotency':idempotency?'required':write?'CAS, once-only secret, read query or naturally repeatable operation':'read'};
    }
  });
  const document=()=>({openapi:'3.1.0',info:{title:'Sprintique vNext API',version:'2.0.0-alpha.0',description:'Clean-start API. Dates and authors are server-owned. Custom refinements, tenant authorization, live credential checks and action-bound approvals are enforced at runtime. No arbitrary agent execution.'},
    servers:[{url:'/'}],paths,
    components:{
      securitySchemes:{humanSession:{type:'apiKey',in:'cookie',name:'__Host-sprintique'},agentBearer:{type:'http',scheme:'bearer'}},
      schemas:{...publicSchemas,Problem:{type:'object',required:['code','message','requestId'],properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string'}}}}
    }
  });
  app.get('/openapi.json',async()=>document());return document;
}
