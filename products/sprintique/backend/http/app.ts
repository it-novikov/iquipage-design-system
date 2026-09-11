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

export interface AppOptions {db:Database;origin:string;oidc?:OidcSettings;logger?:boolean}
export function getCredential(request:FastifyRequest):Credential{
  const authorization=request.headers.authorization;
  if(authorization){requireCondition(/^Bearer spr_[A-Za-z0-9_-]{43}$/.test(authorization),401,'UNAUTHENTICATED','Некорректный токен.');return {token:authorization.slice(7),kind:'agent'};}
  const token=cookie(request,sessionCookie);
  requireCondition(token&&/^[A-Za-z0-9_-]{43}$/.test(token),401,'UNAUTHENTICATED','Войдите в аккаунт.');return {token,kind:'session'};
}
export type Authenticated = <T>(request:FastifyRequest,fn:(tx:Transaction,actor:Actor)=>Promise<T>)=>Promise<T>;
export const params=(request:FastifyRequest)=>z.object({projectId:contract.Id,id:contract.Id.optional()}).parse(request.params);
export const mutationKey=(request:FastifyRequest)=>z.string().min(8).max(120).parse(request.headers['idempotency-key']);
export async function createApp({db,origin,oidc,logger=false}:AppOptions){
  const app=Fastify({bodyLimit:128*1024,requestTimeout:15000,logger:logger?{redact:['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]'],level:'info'}:false,logController:new Fastify.LogController({disableRequestLogging:true})});
  app.addHook('onSend',async(_request,reply)=>{
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin');
  });
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof z.ZodError)return reply.code(400).send({code:'VALIDATION',message:'Проверьте поля запроса.',requestId:request.id});
    if(error instanceof Problem)return reply.code(error.status).send({code:error.code,message:error.message,requestId:request.id});
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
  app.get('/ready',async()=>{await db.checkRuntimeRole();await db.pool.query('SELECT 1 FROM public.schema_migrations LIMIT 1');return {status:'ready'};});
  app.get('/api/v1/session',request=>authenticated(request,identity.sessionInfo));
  app.post('/api/v1/logout',(request,reply)=>authenticated(request,async(tx,actor)=>{
    await tx.query('UPDATE auth.credentials SET revoked_at=clock_timestamp() WHERE id=$1',[actor.credentialId]);
    reply.header('Set-Cookie',cookieValue(sessionCookie,'',0));return {ok:true};
  }));
  app.post('/api/v1/workspaces',request=>authenticated(request,(tx,actor)=>identity.createWorkspace(tx,actor,contract.CreateWorkspace.parse(request.body).name)));
  app.get('/api/v1/workspaces',request=>authenticated(request,async tx=>(await tx.query('SELECT id,name FROM app.workspaces ORDER BY name')).rows));
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
    return idempotent(tx,actor,projectId,'task.put:'+id,mutationKey(request),input,()=>tasks.putTask(tx,actor,projectId,id!,input.baseRevision,input.task));
  }));
  app.get('/api/v1/projects/:projectId/tasks/:id/threads',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'threads:read');
    const {cursor,limit}=z.object({cursor:z.string().max(2048).nullable().default(null),limit:z.coerce.number().int().min(1).max(50).default(20)}).parse(request.query);
    return discussions.pageThreads(tx,projectId,id!,cursor,limit);
  }));
  app.get('/api/v1/projects/:projectId/threads/:id',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'threads:read');return discussions.readThread(tx,projectId,id!);
  }));
  app.post('/api/v1/projects/:projectId/tasks/:id/threads',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request),input=contract.CreateThread.parse(request.body);await authorize(tx,actor,projectId,'threads:write');
    return idempotent(tx,actor,projectId,'thread.create:'+id,mutationKey(request),input,()=>discussions.createThread(tx,actor,projectId,id!,input));
  }));
  app.post('/api/v1/projects/:projectId/threads/:id/messages',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request),input=contract.AppendMessage.parse(request.body);await authorize(tx,actor,projectId,'threads:write');
    return idempotent(tx,actor,projectId,'thread.append:'+id,mutationKey(request),input,()=>discussions.appendMessage(tx,actor,projectId,id!,input));
  }));
  app.patch('/api/v1/projects/:projectId/threads/:id/resolution',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request),input=contract.ResolveThread.parse(request.body);await authorize(tx,actor,projectId,'threads:write');
    return idempotent(tx,actor,projectId,'thread.resolve:'+id,mutationKey(request),input,()=>discussions.resolveThread(tx,actor,projectId,id!,input));
  }));
  app.post('/api/v1/projects/:projectId/agents',request=>authenticated(request,async(tx,actor)=>{
    const {projectId}=params(request);await authorize(tx,actor,projectId,'agents:manage');return identity.issueAgent(tx,actor,projectId,contract.AgentGrant.parse(request.body));
  }));
  app.delete('/api/v1/projects/:projectId/agents/:id',request=>authenticated(request,async(tx,actor)=>{
    const {projectId,id}=params(request);await authorize(tx,actor,projectId,'agents:manage');return identity.revokeAgent(tx,actor,projectId,id!);
  }));
  app.get('/api/v1/contracts',request=>authenticated(request,async()=>({version:1,schemas:contract.jsonSchemas})));
  registerCatalogRoutes(app,authenticated);
  await registerOidc(app,db,oidc);
  return app;
}
