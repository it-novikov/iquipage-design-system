/** Interactive fixture implementing the consumer port. Never export this from the product package. */
import {project,revision,revisionInput,memberships,summaries,rows,page,PROTOCOL} from './fixture-projection.js';
export function createFixtureAdapter(repository){
  const port={fixture:true,calls:[],loseNextAck:false,failNextRead:false,readDelay:0};
  const plans=new Map();
  const guard=async({projectId,signal})=>{if(projectId!==project.id)throw Error('Проект недоступен.');if(port.readDelay)await new Promise(r=>setTimeout(r,port.readDelay));signal?.throwIfAborted();};
  port.listGroups=async options=>{await guard(options);port.calls.push({kind:'groups',query:options.query,cursor:options.cursor});if(port.failNextRead){port.failNextRead=false;throw Error('Тестовый сбой чтения. Повторите загрузку.');}const snapshot=await repository.fixtureSnapshot();return {protocol:PROTOCOL,projectId:project.id,revision:await revision(snapshot),...page(summaries(snapshot,options),options.cursor,40),capabilities:{createTask:true,createRelease:true,move:true,prepare:true,start:true,close:false}};};
  port.listRows=async options=>{await guard(options);port.calls.push({kind:'rows',groupId:options.groupId,cursor:options.cursor});const s=await repository.fixtureSnapshot(),p=page(rows(s,options),options.cursor,50);return {projectId:project.id,groupId:options.groupId,revision:await revision(s),rows:p.items,nextCursor:p.nextCursor};};
  port.destinations=async options=>{await guard(options);const s=await repository.fixtureSnapshot(),list=[{value:'backlog',label:'Без релиза — бэклог'},...s.releases.filter(r=>!r.archivedAt&&r.status!=='released').map(r=>({value:r.id,label:r.name,description:r.planningPhase==='active'?'Активный состав — потребуется подтверждение':'Запланирован'}))];return {options:page(list.filter(x=>x.label.toLocaleLowerCase('ru').includes(options.query.toLocaleLowerCase('ru'))),options.cursor,20).items,nextCursor:null};};
  port.preview=async({projectId,intent,signal})=>{
    await guard({projectId,signal});const s=await repository.fixtureSnapshot(),input=revisionInput(s),tasks=structuredClone(s.tasks),releases=structuredClone(s.releases),before=memberships(tasks),blockers=[];
    const chosen=new Set(intent.taskIds||[]),target=releases.find(r=>r.id===intent.groupId),updates=[];let summary='';
    if(intent.kind==='prepare'){
      if(!chosen.size||[...chosen].some(id=>!tasks.some(t=>t.id===id)))blockers.push('Одна из выбранных задач недоступна. Обновите список.');
      for(const task of tasks)if(chosen.has(task.id)){task.preparation='ready';updates.push({label:task.displayId||task.id,description:'Черновик → готова к работе'});}summary=`Подготовить ${chosen.size} задач. Рабочие статусы и исполнители не изменятся.`;
    }else if(intent.kind==='move'){
      if(!chosen.size||[...chosen].some(id=>!tasks.some(t=>t.id===id)))blockers.push('Выбор изменился. Обновите список.');
      if(intent.groupId!=='backlog'&&!target)blockers.push('Релиз назначения недоступен.');
      for(const task of tasks)if(chosen.has(task.id)){task.releaseId=target?.id||null;task.releaseAssignment=target?'assigned':'none';}
      const after=memberships(tasks);
      for(const task of tasks)if(chosen.has(task.id)||before.get(task.id)!==after.get(task.id)){
        const destination=releases.find(r=>r.id===after.get(task.id)),active=destination?.planningPhase==='active';
        if(active&&task.preparation==='draft')blockers.push(`${task.displayId||task.id}: сначала подготовьте задачу.`);
        task.planningAdmission=!!active;
        updates.push({label:task.displayId||task.id,description:`${releases.find(r=>r.id===before.get(task.id))?.name||'Бэклог'} → ${destination?.name||'Бэклог'}${chosen.has(task.id)?'':' (следует за родителем)'}${active?' · появится на доске':' · вне активной доски'}`});
      }
      summary=`Перенести ${chosen.size} выбранных задач. Всего затронуто: ${updates.length}. Рабочие статусы сохранятся.`;
    }else if(intent.kind==='start'){
      if(!target||target.planningPhase==='active')blockers.push('Релиз уже запущен или недоступен.');
      if(target?.planningFormat==='timeboxed'&&(!target.planningStart||!target.targetDate))blockers.push('Для спринта нужны даты начала и окончания.');
      for(const task of tasks)if(before.get(task.id)===intent.groupId){if(task.preparation==='draft')blockers.push(`${task.displayId||task.id}: задача ещё черновик.`);task.planningAdmission=true;updates.push({label:task.displayId||task.id,description:'Появится на доске в текущем рабочем статусе'});}
      if(target)target.planningPhase='active';summary=`Начать «${target?.name||'релиз'}». Задачи сохранят статусы и исполнителей.`;
    }else blockers.push('Этот сценарий ещё не подключён к тестовому адаптеру.');
    const changedTasks=tasks.filter((t,i)=>JSON.stringify(t)!==JSON.stringify(s.tasks[i])),changedReleases=releases.filter((r,i)=>JSON.stringify(r)!==JSON.stringify(s.releases[i]));
    const token=crypto.randomUUID(),expiresAt=new Date(Date.now()+180000).toISOString();
    const preview={token,expiresAt,summary,changes:updates.slice(0,30),moreChanges:Math.max(0,updates.length-30),blockers};
    plans.set(token,{preview,input,tasks:changedTasks,releases:changedReleases});return preview;
  };
  port.commit=async({projectId,token,idempotencyKey})=>{
    await guard({projectId});const plan=plans.get(token);
    const result=await repository.fixtureTransaction((s,put)=>{
      const existing=s._pnFixture.find(x=>x.id===idempotencyKey);
      if(existing){if(existing.token!==token)throw Object.assign(Error('Ключ операции уже использован.'),{definitive:true});return existing.result;}
      if(!plan||plan.preview.blockers.length||Date.parse(plan.preview.expiresAt)<=Date.now()||plan.input!==revisionInput(s))throw Object.assign(Error('Состав изменился. Проверьте последствия снова.'),{definitive:true});
      for(const task of plan.tasks)put('tasks',task,task.revision);
      for(const release of plan.releases)put('releases',release,release.revision);
      const result={state:'committed',operationId:idempotencyKey,message:'Сохранено в тестовом хранилище этого браузера.'};
      put('_pnFixture',{id:idempotencyKey,token,result});return result;
    });
    if(port.loseNextAck){port.loseNextAck=false;throw Error('Тест: ответ после сохранения потерян.');}return result;
  };
  port.receipt=async({projectId,idempotencyKey})=>{await guard({projectId});return(await repository.fixtureSnapshot())._pnFixture.find(x=>x.id===idempotencyKey)?.result||{state:'uncertain'};};
  port.subscribe=fn=>{let queued=false;return repository.subscribe(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;fn();});});};
  return port;
}
