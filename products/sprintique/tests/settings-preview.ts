import {fixture} from './fixture.js';
import {randomUUID} from 'node:crypto';
import {watchParent} from '../scripts/cluster-guard.mjs';
const f=await fixture({web:true,settingsPreview:true,appOrigin:'http://localhost:4383'});
for(const [id,name,tone] of [['design','Дизайн','blue'],['research','Исследование','purple']]){
 const result=await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tags/${id}`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,value:{name,tone}}});
 if(result.statusCode!==200)throw Error(result.body);
}
await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tasks/settings-demo`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,createInBoard:true,task:{title:'Проверить настройки команды',description:'Локальные демонстрационные данные. Изменения сохраняются только во временной базе.'}}});
await f.app.listen({port:4383,host:'127.0.0.1'});
console.log('Synthetic settings preview: http://localhost:4383/__preview/admin (reader: /__preview/reader). Temporary PostgreSQL; file storage not configured.');
// Stop on a signal, a hang-up, or when the runner that owns the database is gone (re-parented).
await new Promise<void>(resolve=>{for(const signal of ['SIGTERM','SIGINT','SIGHUP'] as const)process.once(signal,()=>resolve());watchParent(resolve);});await f.close();
