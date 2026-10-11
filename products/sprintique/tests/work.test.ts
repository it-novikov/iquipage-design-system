import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.js';
let f: Awaited<ReturnType<typeof fixture>>;
before(async()=>{f=await fixture({prefix:'WORK',settings:{SPRINTIQUE_AI_RUNNERS:'0'}});});
after(async()=>{await f?.close();});
const call=(method:string,url:string,payload?:object)=>f.app.inject({method,url,headers:{...f.alice.headers,'idempotency-key':randomUUID()},...(payload?{payload}:{})});
async function ok(p:ReturnType<typeof call>){const r=await p;assert.equal(r.statusCode,200,r.body);return r.json<any>();}
const path=(id:string)=>`/api/v1/projects/${f.first.id}/tasks/${id}`;
async function account(){
 const preset=(await f.admin.query("SELECT id FROM app.access_presets WHERE workspace_id=$1 AND key='service_tasks'",[f.first.workspaceId])).rows[0].id;
 return ok(call('POST','/api/v1/service-accounts',{name:'Проверяющий агент',workspaceId:f.first.workspaceId,projects:[{projectId:f.first.id,presetId:preset,granted:['work.write'],revoked:[]}]}));
}

test('work: AI terminal projection runs under real no-actor runtime finish and leaves no active session',async()=>{
 const a=await account();
 await ok(call('PUT',path('runtime'),{baseRevision:0,task:{title:'Закончить запуск'}}));
 await ok(call('PUT',path('runtime')+'/work-plan',{baseRevision:0,goal:'Проверить завершение'}));
 const actualTask=(await ok(call('GET',path('runtime')))).id;
 const run=randomUUID(),lease=randomUUID();
 await f.admin.query('BEGIN');
 try{
  await f.admin.query("SELECT set_config('app.actor_id',$1,true)",[f.alice.id]);
  await f.admin.query(`INSERT INTO app.ai_agent_runs(project_id,id,task_id,account_id,model,trigger,requested_by,state,max_steps,max_output_tokens,lease_token,lease_until,started_at)
   VALUES($1,$2,$3,$4,'test','manual',$5,'running',10,256,$6,now()+interval '5 minutes',now())`,[f.first.id,run,actualTask,a.id,f.alice.id,lease]);
  await f.admin.query('COMMIT');
 }catch(error){await f.admin.query('ROLLBACK');throw error;}
 const initial=await ok(call('GET',path('runtime')+'/work'));
 assert.equal(initial.sessions.find((s:any)=>s.runId===run)?.state,'running');
 const tx=await f.db.pool.connect();
 try{
  const completed=await tx.query("SELECT app.ai_run_finish($1::uuid,$2::uuid,'completed',NULL,NULL) AS ok",[run,lease]);
  assert.equal(completed.rows[0].ok,true);
  assert.equal((await tx.query("SELECT app.ai_run_finish($1::uuid,$2::uuid,'completed',NULL,NULL) AS ok",[run,lease])).rows[0].ok,false);
 }finally{tx.release();}
 const completed=await ok(call('GET',path('runtime')+'/work'));
 assert.equal(completed.sessions.find((s:any)=>s.runId===run)?.state,'completed');
 assert.equal((await f.admin.query('SELECT state FROM app.task_work_session WHERE project_id=$1 AND ai_run_id=$2',[f.first.id,run])).rows[0].state,'completed');
 assert.equal(completed.events.items.filter((e:any)=>e.kind==='session.completed').length,1);
 const directory=await ok(call('GET',`/api/v1/projects/${f.first.id}/work-agents`));
 assert.equal(directory.items.find((item:any)=>item.id===a.id).state,'available');
});

test('work: step progress cannot replace human acceptance and GET does not reveal a newer fence',async()=>{
 await ok(call('PUT',path('criteria'),{baseRevision:0,task:{title:'Защитить критерий'}}));
 let view=await ok(call('PUT',path('criteria')+'/work-plan',{baseRevision:0,goal:'Проверить результат',steps:[{id:'S1',title:'Проверить',criteria:[{id:'C1',text:'Исходный критерий'}]}]}));
 view=await ok(call('POST',path('criteria')+'/work-plan/lease',{baseRevision:view.revision,action:'claim'}));
 const token=view.workPlan.lease.leaseToken;
 assert.ok(token);
 const publicView=await ok(call('GET',path('criteria')+'/work'));
 assert.equal(publicView.workPlan.lease.leaseToken,undefined);
 const changed=await call('PATCH',path('criteria')+'/work-plan/steps/S1',{baseRevision:view.revision,leaseToken:token,state:'done',result:'Готово',evidence:['Проверено'],criteria:[{id:'C1',text:'Подменённый критерий',done:true}]});
 assert.equal(changed.statusCode,422,changed.body);
 assert.equal((await ok(call('GET',path('criteria')+'/work'))).workPlan.steps[0].criteria[0].text,'Исходный критерий');
});

test('work: skill versions reject unknown tools and remain immutable while sessions keep their pinned digest',async()=>{
 const a=await account();
 const skills=`/api/v1/projects/${f.first.id}/work-skills`;
 const invalid=await call('POST',skills,{baseRevision:0,id:'invalid-tool',name:'Проверка',version:'1',content:'Инструкция',requiredTools:['execute_shell']});
 assert.equal(invalid.statusCode,422,invalid.body);
 const first=await ok(call('POST',skills,{baseRevision:0,id:'skill-one',name:'Проверка',version:'1',content:'Прочитать план.',requiredTools:['get_work_plan']}));
 assert.ok(first.digest);
 const duplicate=await call('POST',skills,{baseRevision:0,id:'skill-one',name:'Проверка',version:'1',content:'Подмена инструкции.',requiredTools:['get_work_plan']});
 assert.equal(duplicate.statusCode,409,duplicate.body);
 assert.equal((await ok(call('GET',skills+'/skill-one'))).content,'Прочитать план.');
 await ok(call('POST',`/api/v1/projects/${f.first.id}/work-agents/${a.id}/skills`,{baseRevision:0,skillIds:['skill-one']}));
 await ok(call('PUT',path('skills'),{baseRevision:0,task:{title:'Проверить версии'}}));
 let view=await ok(call('PUT',path('skills')+'/work-plan',{baseRevision:0,goal:'Получить точную версию навыка'}));
 view=await ok(call('POST',path('skills')+'/work-plan/sessions',{baseRevision:view.revision,agentId:a.id,mode:'external',goal:'Прочитать план'}));
 const session=view.sessions.find((s:any)=>s.agentId===a.id);
 assert.equal(session.skills[0].digest,first.digest);
 const second=await ok(call('POST',skills,{baseRevision:0,id:'skill-two',name:'Проверка',version:'2',content:'Прочитать обновлённый план.',requiredTools:['get_work_card']}));
 await ok(call('POST',`/api/v1/projects/${f.first.id}/work-agents/${a.id}/skills`,{baseRevision:1,skillIds:['skill-two']}));
 const same=await ok(call('GET',path('skills')+'/work'));
 assert.equal(same.sessions.find((s:any)=>s.id===session.id).skills[0].digest,first.digest);
 view=await ok(call('PATCH',path('skills')+'/work-plan/sessions/'+session.id,{baseRevision:same.revision,state:'cancelled',summary:'Создать новое поручение.'}));
 view=await ok(call('POST',path('skills')+'/work-plan/sessions',{baseRevision:view.revision,agentId:a.id,mode:'external',goal:'Прочитать обновление'}));
 assert.equal(view.sessions.find((s:any)=>s.agentId===a.id&&s.state==='awaiting_agent').skills[0].digest,second.digest);
});

test('work: a question and its human answer share the task discussion atomically',async()=>{
 await ok(call('PUT',path('question'),{baseRevision:0,task:{title:'Получить решение'}}));
 let view=await ok(call('PUT',path('question')+'/work-plan',{baseRevision:0,goal:'Согласовать следующий шаг'}));
 view=await ok(call('POST',path('question')+'/work-plan/questions',{baseRevision:view.revision,id:'Q1',title:'Как продолжить?',context:'Нужно решение человека.',options:[{id:'yes',label:'Продолжить',recommended:true}]}));
 const linked=view.workPlan.questions[0].threadId;
 assert.ok(linked);
 let thread=await ok(call('GET',`/api/v1/projects/${f.first.id}/threads/${linked}`));
 assert.equal(thread.requiresResolution,true);
 assert.equal(thread.messages.length,1);
 view=await ok(call('PATCH',path('question')+'/work-plan/questions/Q1',{baseRevision:view.revision,answer:'Продолжайте проверку.',selectedOptionId:'yes',decision:'Продолжить.'}));
 assert.equal(view.workPlan.questions[0].status,'answered');
 thread=await ok(call('GET',`/api/v1/projects/${f.first.id}/threads/${linked}`));
 assert.equal(thread.resolved,true);
 assert.equal(thread.messages.length,2);
 assert.equal(thread.messages[1].authorId,f.alice.id);
 assert.match(thread.messages[1].body,/Продолжайте проверку/);
 const exported=await ok(call('GET',path('question')+'/work-plan/card'));
 assert.match(exported.card,/^status: draft$/m);
 assert.match(exported.card,/^- \*\*Q1\*\* \[answered\] Как продолжить\?$/m);
 assert.match(exported.card,/^  Ответ: Продолжайте проверку\.$/m);
 assert.match(exported.card,/^- \*\*D1\*\* Продолжить\.$/m);
 await ok(call('PUT',path('question')+'/work-plan/card',{baseRevision:exported.revision,card:exported.card}));
 const roundtrip=await ok(call('GET',path('question')+'/work-plan/card'));
 assert.equal(roundtrip.card,exported.card);
 assert.equal(roundtrip.revision,exported.revision+1);
 view=await ok(call('GET',path('question')+'/work'));
 assert.equal(view.workPlan.status,'draft');
 assert.equal(view.workPlan.questions[0].status,'answered');
 assert.equal(view.workPlan.questions[0].answer,'Продолжайте проверку.');
 assert.equal(view.workPlan.questions[0].threadId,linked);
 assert.equal(view.workPlan.decisions[0].text,'Продолжить.');
 view=await ok(call('POST',path('question')+'/work-plan/questions',{baseRevision:view.revision,id:'Q2',title:'Передать работу?',options:[]}));
 const secondLinked=view.workPlan.questions[1].threadId;
 view=await ok(call('PATCH',path('question')+'/work-plan/questions/Q2',{baseRevision:view.revision,answer:'Передать Клоду',decision:'Передать Клоду'}));
 const secondThread=await ok(call('GET',`/api/v1/projects/${f.first.id}/threads/${secondLinked}`));
 assert.equal(secondThread.messages[1].body,'Передать Клоду');
});

test('work: an external agent mention is an observable pending request without starting an API runtime',async()=>{
 const a=await account();
 await ok(call('PUT',path('external-mention'),{baseRevision:0,task:{title:'Обратиться к внешнему агенту'}}));
 await ok(call('POST',path('external-mention')+'/threads',{id:'external-thread',messageId:'external-message',body:`@[Проверяющий агент](user:${a.id}) Прочитайте результат.`,requiresResolution:false}));
 const view=await ok(call('GET',path('external-mention')+'/work'));
 assert.equal(view.sessions.length,0);
 assert.equal(view.requests.length,1);
 assert.equal(view.requests[0].state,'pending');
 assert.equal(view.requests[0].sessionId,null);
 assert.equal(view.requests[0].agentId,a.id);
});
