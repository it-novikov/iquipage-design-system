import pg from 'pg';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {RuntimeDatabase} from './support/runtime-database.js';
import {startKotlinApp} from './support/kotlin-app.js';
import type {AppOptions,TestApp} from './support/kotlin-app.js';

// Every test talks to the Kotlin server over HTTP. The runner (scripts/test.mjs) built the local artifact, applied the
// migration ledger to an isolated cluster and passes its addresses in the environment. Direct SQL goes through the
// runtime-role helper, so the database policies themselves are what a test proves.
export const origin='http://localhost:4311';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');

/** A server process of its own, for scenarios that need other settings than the fixture's. */
export function startApp(options:AppOptions={}):Promise<TestApp>{return startKotlinApp(options);}

export async function fixture({web=false,prefix='',storage=false,appOrigin=origin,devLogin=false,port}:{web?:boolean;prefix?:string;storage?:boolean;appOrigin?:string;devLogin?:boolean;port?:number}={}){
  const admin=new pg.Client({connectionString:process.env['TEST_ADMIN_DATABASE_URL']!});await admin.connect();
  const db=new RuntimeDatabase(process.env['DATABASE_URL']!);
  const app=await startKotlinApp({origin:appOrigin,devLogin,web,storage,...(port?{port}:{})});
  const human=async(name:string)=>{
    const id=randomUUID(),token=secret(),csrf=secret(),credential=randomUUID();
    await admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,name]);
    await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
    return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin:appOrigin,'x-csrf-token':csrf}};
  };
  const alice=await human('Алиса'),bob=await human('Борис'),reader=await human('Наблюдатель');
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
