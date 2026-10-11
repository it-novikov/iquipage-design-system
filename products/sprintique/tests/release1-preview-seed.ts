import {randomUUID} from 'node:crypto';
import type {TestApp} from './support/kotlin-app.js';

/** Synthetic Release 1 browser cases; never writes to the production database. */
export async function seedRelease1Preview(app:TestApp,projectId:string,headers:Record<string,string>){
  const base=`/api/v1/projects/${projectId}/`;
  async function call(method:string,path:string,payload?:object):Promise<any>{
    const r=await app.inject({method,url:base+path,headers:{...headers,'idempotency-key':randomUUID()},...(payload?{payload}:{})});
    if(r.statusCode!==200)throw Error(`Release preview ${method} ${path}: ${r.statusCode} ${r.body}`);
    return r.json();
  }
  async function apply(command:object){
    const p=await call('POST','planning/previews',command);
    const receipt=await call('POST','planning/commands',{planId:p.id,token:p.token});
    if(receipt.status!=='committed')throw Error('Preview command was not committed');
  }
  for(const [id,name] of [['preview-current','Релиз 1.0'],['preview-next','Релиз 1.1']] as const)
    await call('PUT','planning/releases/'+id,{baseRevision:0,value:{name,format:'flexible'}});
  for(const [id,title,status] of [
    ['preview-current-target','Проверить текущий релиз','ready'],
    ['preview-other-target','Проверить следующий релиз','ready'],
    ['preview-completed-target','Проверить завершённую задачу','ready_for_release'],
    ['preview-blocker','Подготовить данные для проверки','in_progress']
  ] as const){
    await call('PUT','tasks/'+id,{baseRevision:0,task:{title,status}});
    await apply({kind:'prepare',selection:{kind:'tasks',ids:[id]},preparation:'ready'});
    await apply({kind:'assign',selection:{kind:'tasks',ids:[id]},assignment:{mode:'assigned',releaseId:id==='preview-other-target'||id==='preview-blocker'?'preview-next':'preview-current'}});
  }
  await apply({kind:'prepare',selection:{kind:'tasks',ids:['work-preview']},preparation:'ready'});
  await apply({kind:'assign',selection:{kind:'tasks',ids:['work-preview']},assignment:{mode:'assigned',releaseId:'preview-current'}});
  await call('PUT','task-links/preview-block-link',{baseRevision:0,value:{kind:'depends',fromId:'work-preview',toId:'preview-blocker'}});
  await apply({kind:'start',releaseId:'preview-current'});
}
