import {fixture} from './fixture.js';
import {writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {seedDevData} from './dev-seed.js';
import {watchParent} from '../scripts/cluster-guard.mjs';
// Local debugging stand: synthetic data in an ephemeral database, sign-in with admin / admin or by a code by e-mail
// (letters land as files in output/local-mail). PREVIEW_PORT picks the port (4311 by default). PREVIEW_API_NAME=1
// gives the public API and the MCP server a name of their own, as api.iqui.page: the interface is then
// http://127.0.0.1:<port> and the API http://localhost:<port> (one process, told apart by Host).
// Object storage is optional here; without it attachments and covers are simply unavailable.
const storage=(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8').catch(()=>null))!==null;
const port=Number(process.env['PREVIEW_PORT']||4311),apiName=process.env['PREVIEW_API_NAME']==='1';
const origin=apiName?`http://127.0.0.1:${port}`:`http://localhost:${port}`,apiOrigin=`http://localhost:${port}`;
const mail=resolve('output/local-mail');
// PREVIEW_SMTP_PORT sends letters through a loopback SMTP relay (a Mailpit of your own) instead of the file drop.
const smtp=process.env['PREVIEW_SMTP_PORT'];
const api=apiName?{SPRINTIQUE_API_ORIGIN:apiOrigin}:{};
const f=await fixture({web:true,devLogin:true,storage,port,appOrigin:origin,...(smtp?{settings:{...api,SPRINTIQUE_SMTP_HOST:'127.0.0.1',SPRINTIQUE_SMTP_PORT:smtp,
  SPRINTIQUE_SMTP_SECURITY:'none',SPRINTIQUE_MAIL_FROM:'Sprintique <no-reply@iqui.page>'}}:{mailDrop:mail,settings:api})});
await f.app.inject({method:'PUT',url:`/api/v1/projects/${f.first.id}/tasks/demo-task`,headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,createInBoard:true,task:{title:'Проверить новую платформу',description:'## Готовность\n\n- [ ] Создать задачу\n- [ ] Проверить обсуждения'}}});
const seeded=await seedDevData(f.app,f.admin,origin);
if(process.env['PREVIEW_WORK']==='1'){
  const {seedWorkPreview}=await import('./work-preview-seed.js');
  console.log('Agent work preview: '+await seedWorkPreview(f.app,f.admin,seeded.adminId,origin));
}
if(process.env['PREVIEW_WIKI']==='1'){
  const {seedWikiPreview}=await import('./wiki-preview-seed.js');
  console.log('Wiki preview project: '+await seedWikiPreview(f.app,f.admin,seeded.adminId,origin));
}
const state=join(process.env['TEST_FIXTURE_DIR']!,'browser-state.json');
await writeFile(state,JSON.stringify({cookies:[{name:'__Host-sprintique',value:f.alice.token,domain:new URL(origin).hostname,path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}],origins:[]}),{mode:0o600});
console.log(`Sprintique local stand: ${origin} — вход admin / admin`+(storage?'':' (без файлового хранилища)'));
if(apiName)console.log(`API и MCP: ${apiOrigin}/api/v1, ${apiOrigin}/mcp`);
for(const line of seeded.summary)console.log('  '+line);
console.log('Browser storage state (fixture user): '+state);
console.log('Письма: '+(smtp?'SMTP 127.0.0.1:'+smtp:mail));
// Stop on a signal, a hang-up, or when the runner that owns the database is gone (re-parented).
await new Promise<void>(resolve=>{for(const signal of ['SIGTERM','SIGINT','SIGHUP'] as const)process.once(signal,()=>resolve());watchParent(resolve);});await f.close();
