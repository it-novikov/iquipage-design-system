import Fastify from 'fastify';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import * as contract from '../../contracts/index.js';
import {Database,authorize} from '../infrastructure/database.js';
import type {Actor,Transaction,Credential} from '../infrastructure/database.js';
import {Problem,requireCondition} from '../domain/errors.js';
import {idempotent} from '../application/commands.js';
import * as tasks from '../application/tasks.js';
import * as discussions from '../application/discussions.js';
import * as identity from '../application/identity.js';
import {registerOidc,cookie,cookieValue,sessionCookie} from './oidc.js';
import type {OidcSettings} from './oidc.js';
import {registerCatalogRoutes} from './catalogs.js';
import {registerPlanningRoutes} from './planning.js';
import {registerPlanningViewRoutes} from './planning-view.js';
import {registerWorkspaceRoutes} from './workspace.js';
import {registerMembershipRoutes} from './membership.js';
import {registerLimits} from './limits.js';
import {registerAgentRoutes} from './agents.js';
import {registerOpenApi,publicSchemas} from './openapi.js';
import {checkSchema} from '../infrastructure/schema.js';
import {registerOperations} from './operations.js';
import {registerObservability} from './observability.js';
import {registerMapRoutes} from './maps.js';
import {registerMediaRoutes} from './media.js';
import type {ObjectStorage} from '../infrastructure/object-storage.js';
import {registerEventRoutes} from './events.js';
import {PlanningCommand,CommitPlan,ReleaseWrite,MilestoneWrite,ConstraintWrite,ApprovalDecision,PLANNING_POLICY} from '../../contracts/planning.js';
import {planningResponseSchemas} from '../../contracts/planning-responses.js';

/** trustProxy: hop count or exact proxy addresses in front of the API. Without it every request behind a
 *  TLS reverse proxy shares the proxy address, so per-address limits would throttle all users together. */
export interface AppOptions {db:Database;origin:string;oidc?:OidcSettings;logger?:boolean;storage?:ObjectStorage;metricsToken?:string;trustProxy?:number|string[]}
/** Normalized to one Fastify-accepted shape: hop count, or a comma-separated address list. */
const trustProxyOption=(value:AppOptions['trustProxy'])=>(address:string,hop:number)=>
  value===undefined?false:Array.isArray(value)?value.includes(address):hop<value;
export function getCredential(request:FastifyRequest):Credential{
  const authorization=request.headers.authorization;
  if(authorization){requireCondition(/^Bearer spr_[A-Za-z0-9_-]{43}$/.test(authorization),401,'UNAUTHENTICATED','Некорректный токен.');return {token:authorization.slice(7),kind:'agent'};}
  const token=cookie(request,sessionCookie);
  requireCondition(token&&/^[A-Za-z0-9_-]{43}$/.test(token),401,'UNAUTHENTICATED','Войдите в аккаунт.');return {token,kind:'session'};
}
export type Authenticated = <T>(request:FastifyRequest,fn:(tx:Transaction,actor:Actor)=>Promise<T>)=>Promise<T>;
export const params=(request:FastifyRequest)=>z.object({projectId:contract.Id,id:contract.Id.optional()}).parse(request.params);
export const mutationKey=(request:FastifyRequest)=>z.string().min(8).max(120).parse(request.headers['idempotency-key']);
export async function createApp({db,origin,oidc,logger=false,storage,metricsToken,trustProxy}:AppOptions){
  const app=Fastify({bodyLimit:128*1024,requestTimeout:15000,trustProxy:trustProxyOption(trustProxy),logger:logger?{redact:['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]'],level:'info'}:false,logController:new Fastify.LogController({disableRequestLogging:true})});
  const secureOrigin=new URL(origin).protocol==='https:';
  registerObservability(app,metricsToken);
  registerLimits(app);
  registerOpenApi(app);
  app.addHook('onSend',async(_request,reply)=>{
    if(!reply.hasHeader('Cache-Control'))reply.header('Cache-Control','no-store');
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin')
      .header('Cross-Origin-Opener-Policy','same-origin').header('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if(secureOrigin)reply.header('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  });
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof z.ZodError)return reply.code(400).send({code:'VALIDATION',message:'Проверьте поля запроса.',requestId:request.id});
    if(error instanceof Problem){if(error.status===429||error.code==='BUSY')reply.header('Retry-After',error.status===429?'60':'5');return reply.code(error.status).send({code:error.code,message:error.message,requestId:request.id,...(error.code==='PREVIEW_REQUIRED'?{action:{kind:'planning-preview',contractVersion:2}}:{})});}
    const pgCode=typeof error==='object'&&error!==null&&'code' in error?error.code:null;
    if(pgCode==='23505')return reply.code(409).send({code:'CONFLICT',message:'Такой объект уже существует.',requestId:request.id});
    if(pgCode==='23503'||pgCode==='23514')return reply.code(422).send({code:'REFERENCE_INVALID',message:'Связанные данные недоступны.',requestId:request.id});
    // Do not serialize SQL, credentials, provider responses or stack traces to clients/logs.
    const status=typeof error==='object'&&error!==null&&'statusCode' in error&&typeof error.statusCode==='number'&&error.statusCode<500?error.statusCode:503;
    app.log.error({requestId:request.id,code:typeof pgCode==='string'?pgCode:'INTERNAL'},'Request failed');
    return reply.code(status).send({code:status===503?'TEMPORARILY_UNAVAILABLE':'INVALID_REQUEST',message:status===503?'Сервис временно недоступен. Повторите позже.':'Некорректный запрос.',requestId:request.id});
  });
  const authenticated:Authenticated=(request,fn)=>db.authenticated(getCredential(request),async(tx,actor)=>{
    if(!['GET','HEAD','OPTIONS'].includes(request.method)&&actor.kind==='human'){
      requireCondition(request.headers.origin===origin&&request.headers['x-csrf-token']===actor.csrf,403,'CSRF','Обновите страницу перед изменением данных.');
    }
    return fn(tx,actor);
  });
  app.get('/health',async()=>({status:'ok',version:'2.0.0-alpha.0'}));
  // Readiness stays reachable for container probes, so anonymous traffic must not multiply into
  // database and object-storage work: concurrent probes share one dependency check, and the
  // per-address window in registerLimits also covers this route. Each new request still re-probes,
  // so a dependency failure is reported immediately rather than hidden behind a cached result.
  let readiness:Promise<void>|null=null;
  app.get('/ready',async()=>{
    const probe=readiness??=(async()=>{await db.checkRuntimeRole();await checkSchema(db);await storage?.ready();})()
      .finally(()=>{readiness=null;});
    await probe;return {status:'ready'};
  });
  app.get('/api/v1/session',request=>authenticated(request,identity.sessionInfo));
  app.post('/api/v1/logout',(request,reply)=>authenticated(request,async(tx,actor)=>{
    await tx.query('UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=$1',[actor.credentialId]);
    reply.header('Set-Cookie',cookieValue(sessionCookie,'',0));return {ok:true};
  }));
  app.post('/api/v1/workspaces',request=>authenticated(request,(tx,actor)=>{const input=contract.CreateWorkspace.parse(request.body);return identity.createWorkspace(tx,actor,input.name,input.timezone);}));
  app.get('/api/v1/workspaces',request=>authenticated(request,async(tx,actor)=>(await tx.query('SELECT w.id,w.name,m.role FROM app.workspaces w JOIN app.workspace_members m ON m.workspace_id=w.id AND m.principal_id=$1 ORDER BY w.name,w.id LIMIT 500',[actor.id])).rows));
  app.post('/api/v1/projects',request=>authenticated(request,(tx,actor)=>identity.createProject(tx,actor,contract.CreateProject.parse(request.body))));
  app.get('/api/v1/projects/:projectId/tasks',request=>authenticated(request,async(tx,actor)=>{
    const {projectId}=params(request);await authorize(tx,actor,projectId,'tasks:read');
    const {cursor}=z.object({cursor:z.coerce.number().int().min(0).default(0)}).parse(request.query);
    return tasks.listTasks(tx,projectId,cursor);
  }));
  app.get('/api/v1/projects/:projectId/tasks/:id',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'tasks:read');return tasks.readTask(tx,projectId,id!);
  }));
  app.put('/api/v1/projects/:projectId/tasks/:id',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request),input=contract.PutTask.parse(request.body);await authorize(tx,actor,projectId,'tasks:write');
    return idempotent(tx,actor,projectId,'task.put:'+id,mutationKey(request),input,()=>tasks.putTask(tx,actor,projectId,id!,input.baseRevision,input.task,input.createInBoard));
  }));
  app.patch('/api/v1/projects/:projectId/tasks/:id/position',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'tasks:write');
    const input=z.strictObject({baseRevision:contract.Revision,status:contract.TaskInput.shape.status,rank:contract.TaskInput.shape.rank}).parse(request.body);
    return idempotent(tx,actor,projectId,'task.position:'+id,mutationKey(request),input,async()=>{
      const current=await tasks.readTask(tx,projectId,id!);
      const content=contract.TaskInput.parse(Object.fromEntries(Object.keys(contract.TaskInput.shape).map(key=>[key,current[key as keyof contract.Task]])));
      return tasks.putTask(tx,actor,projectId,id!,input.baseRevision,{...content,status:input.status,rank:input.rank});
    });
  }));
  app.get('/api/v1/projects/:projectId/tasks/:id/threads',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'threads:read');
    const {cursor,limit}=z.object({cursor:z.string().max(2048).nullable().default(null),limit:z.coerce.number().int().min(1).max(50).default(20)}).parse(request.query);
    return discussions.pageThreads(tx,projectId,id!,cursor,limit);
  }));
  app.get('/api/v1/projects/:projectId/threads/:id',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'threads:read');return discussions.readThread(tx,projectId,id!);
  }));
  // The discussion use cases own the write fence and the retry ledger; the route only parses input.
  app.post('/api/v1/projects/:projectId/tasks/:id/threads',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);
    return discussions.createThread(tx,actor,projectId,id!,contract.CreateThread.parse(request.body),mutationKey(request));
  }));
  app.post('/api/v1/projects/:projectId/threads/:id/messages',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);
    return discussions.appendMessage(tx,actor,projectId,id!,contract.AppendMessage.parse(request.body),mutationKey(request));
  }));
  app.patch('/api/v1/projects/:projectId/threads/:id/resolution',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);
    return discussions.resolveThread(tx,actor,projectId,id!,contract.ResolveThread.parse(request.body),mutationKey(request));
  }));
  app.post('/api/v1/projects/:projectId/agents',request=>authenticated(request,async(tx,actor)=>{
    const {projectId}=params(request);await authorize(tx,actor,projectId,'agents:manage');return identity.issueAgent(tx,actor,projectId,contract.AgentGrant.parse(request.body));
  }));
  app.delete('/api/v1/projects/:projectId/agents/:id',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'agents:manage');return identity.revokeAgent(tx,actor,projectId,id!);
  }));
  app.get('/api/v1/contracts',request=>authenticated(request,async()=>({version:2,planningPolicy:PLANNING_POLICY,schemas:{...publicSchemas,...contract.jsonSchemas,
    ...Object.fromEntries(Object.entries({PlanningCommand,CommitPlan,ReleaseWrite,MilestoneWrite,ConstraintWrite,ApprovalDecision,...planningResponseSchemas}).map(([key,schema])=>[key,z.toJSONSchema(schema)]))}})));
  registerCatalogRoutes(app,authenticated);
  registerPlanningRoutes(app,authenticated);
  registerPlanningViewRoutes(app,authenticated);
  registerWorkspaceRoutes(app,authenticated);
  registerMembershipRoutes(app,authenticated);
  registerAgentRoutes(app,authenticated);
  registerOperations(app,authenticated);
  registerMapRoutes(app,authenticated);
  registerMediaRoutes(app,authenticated,storage);
  registerEventRoutes(app,db);
  await registerOidc(app,db,oidc);
  return app;
}
