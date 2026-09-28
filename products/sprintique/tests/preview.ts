import {fixture} from './fixture.js';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {S3ObjectStorage} from '../backend/infrastructure/object-storage.js';
import {seedDevData} from './dev-seed.js';
import {watchParent} from '../scripts/cluster-guard.mjs';
// Local debugging stand: synthetic data in an ephemeral database, sign-in with admin / admin.
// Object storage is optional here; without it attachments and covers are simply unavailable.
const config=await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8').catch(()=>null);
const storage=config?new S3ObjectStorage(JSON.parse(config)):undefined;
await storage?.ready();const f=await fixture({web:true,devLogin:true,...(storage?{storage}:{})});
await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tasks/demo-task`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,createInBoard:true,task:{title:'Проверить новую платформу',description:'## Готовность\n\n- [ ] Создать задачу\n- [ ] Проверить обсуждения'}}});
const seeded=await seedDevData(f.app,f.admin,'http://localhost:4311');
await f.app.listen({port:4311,host:'127.0.0.1'});
const state=join(process.env['TEST_FIXTURE_DIR']!,'browser-state.json');
await writeFile(state,JSON.stringify({cookies:[{name:'__Host-sprintique',value:f.alice.token,domain:'localhost',path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}],origins:[]}),{mode:0o600});
console.log('Sprintique local stand: http://localhost:4311 — вход admin / admin'+(storage?'':' (без файлового хранилища)'));
for(const line of seeded.summary)console.log('  '+line);
console.log('Browser storage state (fixture user): '+state);
// Stop on a signal, a hang-up, or when the runner that owns the database is gone (re-parented).
await new Promise<void>(resolve=>{for(const signal of ['SIGTERM','SIGINT','SIGHUP'] as const)process.once(signal,()=>resolve());watchParent(resolve);});await f.close();storage?.close();
