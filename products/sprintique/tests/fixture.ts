import pg from 'pg';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import type {ObjectStorage} from '../backend/infrastructure/object-storage.js';
import {RuntimeDatabase} from './support/runtime-database.js';
import {startKotlinApp} from './support/kotlin-app.js';
import type {AppOptions,TestApp} from './support/kotlin-app.js';
import type {FastifyInstance} from 'fastify';
import type {Database} from '../backend/infrastructure/database.js';

// Types stay those of the TypeScript backend while both run: tests that reach into it are moved to Kotlin one by one
// (docs/test-parity.md). In the Kotlin run the app is an HTTP client with the same inject() and the database a
// runtime-role helper with the same authenticated() transaction.
export const origin='http://localhost:4311';
/** SPRINTIQUE_BACKEND=kotlin runs every test against the Kotlin server over HTTP; otherwise the TypeScript app. */
export const kotlin=process.env['SPRINTIQUE_BACKEND']==='kotlin';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
export async function startApp(options:AppOptions&{db?:unknown;storage?:ObjectStorage|boolean}={}):Promise<TestApp&Record<string,any>>{
  if(kotlin)return startKotlinApp({...options,storage:!!options.storage});
  const [{Database},{createApp}]=await Promise.all([import('../backend/infrastructure/database.js'),import('../backend/http/app.js')]);
  const db=(options.db as InstanceType<typeof Database>|undefined)??new Database(options.databaseUrl??process.env['DATABASE_URL']!);
  const app=await createApp({db,origin:options.origin??origin,devLogin:!!options.devLogin,...(options.metricsToken?{metricsToken:options.metricsToken}:{}),
    ...(options.storage&&typeof options.storage==='object'?{storage:options.storage}:{})});
  // A pool opened here belongs to this app and closes with it.
  const close=app.close.bind(app);
  return Object.assign(app,{url:'',close:async()=>{await close();if(!options.db)await db.close();}}) as unknown as TestApp&Record<string,any>;
}

export async function fixture({web=false,prefix='',storage,appOrigin=origin,settingsPreview=false,devLogin=false}:{web?:boolean;prefix?:string;storage?:ObjectStorage;appOrigin?:string;settingsPreview?:boolean;devLogin?:boolean}={}){
  const admin=new pg.Client({connectionString:process.env['TEST_ADMIN_DATABASE_URL']!});await admin.connect();
  // The two backends expose the same inject() shape; tests treat the app as that shape.
  let app:FastifyInstance,db:Database;
  if(kotlin){
    // The runner applied the Flyway ledger before any test; the TypeScript migrator must not run here.
    if(settingsPreview)throw Error('settingsPreview is served by the Kotlin local stand, not by the test fixture');
    db=new RuntimeDatabase(process.env['DATABASE_URL']!) as unknown as Database;
    app=await startKotlinApp({origin:appOrigin,devLogin,web,storage:!!storage}) as unknown as FastifyInstance;
  }else{
    const [{migrate},{Database},{createApp},{serveWeb}]=await Promise.all([import('../backend/migrate.js'),import('../backend/infrastructure/database.js'),
      import('../backend/http/app.js'),import('../backend/http/static.js')]);
    await migrate(process.env['MIGRATION_DATABASE_URL']!,process.env['DATABASE_RUNTIME_ROLE']!,process.env['DATABASE_WORKER_ROLE']);
    db=new Database(process.env['DATABASE_URL']!);await db.checkRuntimeRole();
    app=await createApp({db,origin:appOrigin,devLogin,...(storage?{storage}:{})});
    if(web)serveWeb(app);
  }
  const human=async(name:string)=>{
    const id=randomUUID(),token=secret(),csrf=secret(),credential=randomUUID();
    await admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,name]);
    await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
    return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin:appOrigin,'x-csrf-token':csrf}};
  };
  const alice=await human('Алиса'),bob=await human('Борис'),reader=await human('Наблюдатель');
  // Explicit synthetic preview only; this test helper is never compiled into the server.
  if(settingsPreview)app.get<{Params:{role:string}}>('/__preview/:role',async(request,reply)=>{
    const actor=request.params.role==='admin'?alice:request.params.role==='reader'?reader:null;
    if(!actor)return reply.code(404).send();
    await admin.query("UPDATE auth.credentials SET expires_at=now()+interval '24 hours' WHERE id=$1",[actor.credential]);
    reply.header('Set-Cookie',`__Host-sprintique=${actor.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    return reply.redirect('/#settings/appearance');
  });
  async function project(user:typeof alice,name:string,key:string){
    const workspace=(await app.inject({method:'POST',url:'/api/v1/workspaces',headers:user.headers,payload:{name}})).json<{id:string}>();
    const response=await app.inject({method:'POST',url:'/api/v1/projects',headers:user.headers,payload:{workspaceId:workspace.id,name,slug:key.toLowerCase(),key}});
    if(response.statusCode!==200)throw Error(response.body);
    return response.json<{id:string;workspaceId:string}>();
  }
  const first=await project(alice,'Команда продукта',prefix+'SPR'),second=await project(bob,'Другой проект',prefix+'OTH');
  await admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member')",[first.workspaceId,reader.id]);
  await admin.query("INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,'reader')",[first.id,reader.id]);
  return {db,admin,app,alice,bob,reader,first,second,async close(){await app.close();await db.close();await admin.end();}};
}
