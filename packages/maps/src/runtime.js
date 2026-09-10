import {clone,uid,now,DomainError,requireValue,assertSafeJSON,validText} from './common.js';
import {validateFlow,NODE_TYPES} from './workflow.js';
const TERMINAL=new Set(['succeeded','rejected','cancelled']);
function actionsOnly(value){
  requireValue(Array.isArray(value)&&value.length<=100,'OUTPUT_SCHEMA','Нужен список не более 100 действий.');
  return value.map(a=>{requireValue(a&&validText(a.title,240)&&a.title.trim(),'OUTPUT_SCHEMA','У каждого действия должно быть название до 240 символов.');return{title:a.title.trim(),...(a.owner?{owner:String(a.owner).slice(0,120)}:{})};});
}
export function normalizeInput(input){
  assertSafeJSON(input);requireValue(JSON.stringify(input).length<=250000,'INPUT_LIMIT','Входные данные слишком велики. Выберите фрагмент карты.');
  const notes=typeof input==='string'?input.split('\n'):input?.notes;
  requireValue(Array.isArray(notes)&&notes.length<=100&&notes.every(n=>validText(n)),'INPUT_SCHEMA','Передайте до 100 текстовых заметок.');
  return{notes:notes.map(x=>x.trim()).filter(Boolean)};
}
function assertPayload(type,data){
  assertSafeJSON(data);requireValue(JSON.stringify(data).length<=500000,'OUTPUT_LIMIT','Результат шага слишком велик.');
  if(type==='notes')return normalizeInput(data);
  if(type==='actions')return{actions:actionsOnly(data?.actions)};
  return clone(data);
}
async function withTimeout(operation,signal,ms=30000){
  const controller=new AbortController();const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();let timer;
  try{return await Promise.race([operation(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new DomainError('TIMEOUT','Шаг превысил время ожидания.'));controller.abort();},ms);controller.signal.addEventListener('abort',()=>reject(signal?.reason||new DomainError('CANCELLED','Запуск остановлен.')),{once:true});})]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
/** Reference executor. One active path, explicit conditions, durable store callbacks and approval stops. */
export class WorkflowRuntime {
  constructor(repository,adapters={}){this.repository=repository;this.adapters=adapters;this.locks=new Map();this.aborters=new Map();}
  async serial(id,fn){
    const before=this.locks.get(id)||Promise.resolve();const operation=before.catch(()=>{}).then(fn);this.locks.set(id,operation);
    try{return await operation;}finally{if(this.locks.get(id)===operation)this.locks.delete(id);}
  }
  save(run){return this.repository.write('runs',run,run.revision);}
  async start({flow,mapId,mapRevision,projectId,input,mode='test',actorId='local-user',id=uid('run'),trigger=null}){
    requireValue(['test','execute'].includes(mode),'RUN_MODE','Неизвестный режим запуска.');
    const issues=validateFlow(flow);requireValue(!issues.length,'INVALID_FLOW',issues.map(x=>x.message).join(' '));
    const existing=await this.repository.read('runs',id,projectId);if(existing)return existing;
    const run={schema:'iquipage.run/1',id,projectId,mapId,mapRevision,revision:0,flowSnapshot:clone(flow),currentNode:flow.nodes.find(n=>n.kind==='input').id,data:normalizeInput(input),input:normalizeInput(input),mode,actorId,trigger,status:'queued',steps:[],approvals:[],createdAt:now(),retries:0};
    try{await this.repository.write('runs',run,0);}catch(e){if(e.code==='CONFLICT')return this.repository.read('runs',id,projectId);throw e;}
    return this.advance(id,projectId);
  }
  async advance(id,projectId){return this.serial(id,async()=>{
    let run=await this.repository.read('runs',id,projectId);requireValue(run,'NOT_FOUND','Запуск не найден.');
    if(TERMINAL.has(run.status)||['awaiting_approval','failed','blocked','interrupted'].includes(run.status))return run;
    const controller=new AbortController();this.aborters.set(id,controller);const started=Date.now();
    try{
      while(run.currentNode){
        controller.signal.throwIfAborted();requireValue(Date.now()-started<120000,'RUN_TIMEOUT','Превышено время исполнения активной части.');
        const node=run.flowSnapshot.nodes.find(n=>n.id===run.currentNode);requireValue(node,'INVALID_FLOW','Шаг не найден в версии запуска.');
        const definition=NODE_TYPES[node.kind];let payload=assertPayload(definition.input==='none'?'notes':definition.input,run.data);
        const step={nodeId:node.id,title:node.title,kind:node.kind,status:'running',startedAt:now(),input:clone(payload),attempt:run.steps.filter(x=>x.nodeId===node.id).length+1};
        run.steps.push(step);run.status='running';run=await this.save(run);const current=run.steps[run.steps.length-1];
        if(node.kind==='approval'){
          current.status='awaiting_approval';run.status='awaiting_approval';run.approvalNodeId=node.id;return await this.save(run);
        }
        let branch=null;
        if(node.kind==='transform'){
          let titles=payload.notes.flatMap(x=>node.config.operation==='lines'?x.split('\n'):[x]).map(x=>x.trim()).filter(Boolean);
          if(node.config.operation==='unique')titles=[...new Map(titles.map(x=>[x.toLocaleLowerCase('ru'),x])).values()];
          payload={actions:titles.slice(0,100).map(title=>({title:title.slice(0,240)}))};
        }else if(node.kind==='condition'){
          branch=node.config.rule==='has-items'?!!(payload.actions?.length||payload.notes?.length):JSON.stringify(payload).toLocaleLowerCase('ru').includes(node.config.value.toLocaleLowerCase('ru'));
          current.branch=branch;
        }else if(node.kind==='llm'){
          if(run.mode==='test'){
            payload={actions:payload.notes.slice(0,20).map(x=>({title:`[Проверочный ответ] ${x}`.slice(0,240)}))};current.simulated=true;
          }else{
            requireValue(this.adapters.llm&&node.config.connectionRef,'LLM_NOT_CONNECTED','LLM не подключён. Укажите подключение платформы.');
            const result=await withTimeout(signal=>this.adapters.llm({input:payload,prompt:node.config.prompt,connectionRef:node.config.connectionRef,signal,runId:id,nodeId:node.id}),controller.signal);
            payload={actions:actionsOnly(result.actions)};if(result.usage)current.usage=clone(result.usage);
          }
        }else if(node.kind==='task'){
          if(run.mode==='test'){payload={wouldCreate:actionsOnly(payload.actions),taskIds:[]};current.simulated=true;}
          else{
            requireValue(this.adapters.createTasks,'TASKS_NOT_CONNECTED','Адаптер задач не подключён. Никаких задач не создано.');
            payload=await withTimeout(signal=>this.adapters.createTasks({actions:actionsOnly(payload.actions),projectId,runId:id,nodeId:node.id,idempotencyKey:`${id}:${node.id}`,signal}),controller.signal);
          }
        }
        controller.signal.throwIfAborted();payload=assertPayload(definition.output==='none'?'json':definition.output,payload);
        current.status='succeeded';current.finishedAt=now();current.output=clone(payload);run.data=payload;
        const edges=run.flowSnapshot.edges.filter(e=>e.source===node.id);
        const next=edges.find(e=>node.kind==='condition'?e.when===String(branch):e.when==='always');
        run.currentNode=next?.target||null;
        if(node.kind==='output'){run.currentNode=null;run.status='succeeded';run.finishedAt=now();run.result=clone(payload);}
        run=await this.save(run);
      }
      return run;
    }catch(error){
      const latest=await this.repository.read('runs',id,projectId);run=latest||run;
      if(TERMINAL.has(run.status))return run;
      run.status=controller.signal.aborted?'cancelled':String(error.code||'').endsWith('NOT_CONNECTED')?'blocked':'failed';
      run.error={code:error.code||'STEP_FAILED',message:error.message||'Ошибка исполнителя.'};
      const step=run.steps[run.steps.length-1];if(step&&step.status==='running'){step.status=run.status;step.error=clone(run.error);step.finishedAt=now();}
      return await this.save(run);
    }finally{this.aborters.delete(id);}
  });}
  async approve(id,projectId,{accepted,actions,actorId='local-user',baseRevision}){
    requireValue(typeof accepted==='boolean','APPROVAL_VALUE','Решение должно быть явно принято или отклонено.');
    const saved=await this.serial(id,async()=>{
      let run=await this.repository.read('runs',id,projectId);requireValue(run?.status==='awaiting_approval','APPROVAL_STATE','Этот запуск уже не ожидает подтверждения.');
      requireValue(run.revision===baseRevision,'CONFLICT','Результат изменился. Откройте актуальное подтверждение.');
      run.approvals.push({nodeId:run.approvalNodeId,actorId,accepted:!!accepted,at:now()});
      const step=run.steps[run.steps.length-1];step.finishedAt=now();step.status=accepted?'succeeded':'rejected';
      if(!accepted){run.status='rejected';run.finishedAt=now();return this.save(run);}
      run.data={actions:actionsOnly(actions)};step.output=clone(run.data);
      run.currentNode=run.flowSnapshot.edges.find(e=>e.source===run.approvalNodeId&&e.when==='always')?.target;run.status='queued';delete run.approvalNodeId;
      return this.save(run);
    });
    return saved.status==='queued'?this.advance(id,projectId):saved;
  }
  async cancel(id,projectId){this.aborters.get(id)?.abort(new DomainError('CANCELLED','Остановлено пользователем.'));return this.serial(id,async()=>{
    const run=await this.repository.read('runs',id,projectId);requireValue(run,'NOT_FOUND','Запуск не найден.');if(TERMINAL.has(run.status))return run;
    run.status='cancelled';run.finishedAt=now();const step=run.steps.at(-1);if(step&&['running','awaiting_approval'].includes(step.status)){step.status='cancelled';step.finishedAt=run.finishedAt;}return this.save(run);
  });}
  async retry(id,projectId){await this.serial(id,async()=>{
    const run=await this.repository.read('runs',id,projectId);requireValue(['failed','blocked','interrupted'].includes(run?.status),'RETRY_STATE','Повтор недоступен.');
    requireValue(run.retries<3,'RETRY_LIMIT','Лимит повторов исчерпан. Создайте новый запуск после проверки.');run.retries++;run.status='queued';delete run.error;return this.save(run);
  });return this.advance(id,projectId);}
}
export function localTasksAdapter(repository){return async({actions,projectId,runId,nodeId,signal})=>{
  const taskIds=[];
  for(const [index,action]of actions.entries()){
    signal?.throwIfAborted();const id=`task-${runId}-${nodeId}-${index}`;
    let task=await repository.read('tasks',id,projectId);
    if(!task)task=await repository.write('tasks',{id,projectId,revision:0,title:action.title,owner:action.owner||'',status:'planned',source:{runId,nodeId},createdAt:now()},0,{signal});taskIds.push(task.id);
  }
  return{taskIds,count:taskIds.length,scope:'local-reference'};
};}
export class HttpRuntime {
  constructor(repository){this.repository=repository;}
  start(payload){return this.repository.request('/runs',{method:'POST',body:payload});}
  approve(id,projectId,decision){return this.repository.request(`/runs/${id}/approve`,{method:'POST',body:{projectId,...decision}});}
  cancel(id,projectId){return this.repository.request(`/runs/${id}/cancel`,{method:'POST',body:{projectId}});}
  retry(id,projectId){return this.repository.request(`/runs/${id}/retry`,{method:'POST',body:{projectId}});}
}
