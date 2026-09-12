import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../backend/migrate.js';
import {Database,hash,secret} from '../backend/infrastructure/database.js';
import {createApp} from '../backend/http/app.js';
import {serveWeb} from '../backend/http/static.js';
export const origin='http://localhost:4311';
export async function fixture({web=false,prefix=''}={}){
  await migrate(process.env['MIGRATION_DATABASE_URL']!,process.env['DATABASE_RUNTIME_ROLE']!);
  const admin=new pg.Client({connectionString:process.env['TEST_ADMIN_DATABASE_URL']!});await admin.connect();
  const db=new Database(process.env['DATABASE_URL']!);await db.checkRuntimeRole();
  const human=async(name:string)=>{
    const id=randomUUID(),token=secret(),csrf=secret(),credential=randomUUID();
    await admin.query("INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,'https://test.example',$1)",[id,name]);
    await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '1 hour')",[credential,id,hash(token),csrf]);
    return {id,token,csrf,credential,headers:{cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf}};
  };
  const alice=await human('Алиса'),bob=await human('Борис'),reader=await human('Наблюдатель');
  const app=await createApp({db,origin});
  if(web)serveWeb(app);
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
