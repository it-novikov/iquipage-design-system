import {fixture,startApp} from './fixture.js';
import {randomUUID} from 'node:crypto';
import {watchParent} from '../scripts/cluster-guard.mjs';
// Synthetic settings preview: a temporary database and two fixture people, opened in a browser through the local
// artifact's /__preview/{role} route. PREVIEW_PORT picks the port (4383 by default).
const port=Number(process.env['PREVIEW_PORT']||4383),origin=`http://localhost:${port}`;
const f=await fixture({appOrigin:origin});
for(const [id,name,tone] of [['design','Дизайн','blue'],['research','Исследование','purple']]){
  const result=await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tags/${id}`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:{name,tone}}});
  if(result.statusCode!==200)throw Error(result.body);
}
const task=await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tasks/settings-demo`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},
  payload:{baseRevision:0,createInBoard:true,task:{title:'Проверить настройки команды',description:'Локальные демонстрационные данные.',tagIds:['design']}}});
if(task.statusCode!==200)throw Error(task.body);
for(const person of [f.alice,f.reader])await f.admin.query("UPDATE auth.credentials SET expires_at=now()+interval '24 hours' WHERE id=$1",[person.credential]);
await f.app.close();
const app=await startApp({origin,web:true,port,settings:{SPRINTIQUE_PREVIEW_SESSIONS:`admin:${f.alice.token},reader:${f.reader.token}`}});
console.log(`Synthetic settings preview: ${origin}/__preview/admin (reader: /__preview/reader). Temporary PostgreSQL; file storage not configured.`);
// Stop on a signal, a hang-up, or when the runner that owns the database is gone (re-parented).
await new Promise<void>(resolve=>{for(const signal of ['SIGTERM','SIGINT','SIGHUP'] as const)process.once(signal,()=>resolve());watchParent(resolve);});
await app.close();await f.db.close();await f.admin.end();
