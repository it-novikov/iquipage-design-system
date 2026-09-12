/** Isolated fixture implementing the consumer port. Never exported as a backend. */
import {project,revision,revisionInput,memberships,summaries,rows,page,PROTOCOL} from './fixture-projection.js';
import {planChange, releaseOverview, descendants} from './planning-rules.js';
export function createFixtureAdapter(repository){
  const port={fixture:true,calls:[],loseNextAck:false,failNextRead:false,readDelay:0};
  const plans=new Map(),selections=new Map();
  const guard=async({projectId,signal})=>{if(projectId!==project.id)throw Error('Проект недоступен.');if(port.readDelay)await new Promise(r=>setTimeout(r,port.readDelay));signal?.throwIfAborted();};
  const capabilities={createTask:true,createRelease:true,move:true,prepare:true,start:true,close:true,cancel:true,editRelease:true,bulk:true,selection:true,reorder:true,timeline:true,milestone:true,temporal:true,settings:true,take:true};
  port.listGroups=async options=>{await guard(options);port.calls.push({kind:'groups',query:options.query,cursor:options.cursor});if(port.failNextRead){port.failNextRead=false;throw Error('Тестовый сбой чтения. Повторите загрузку.');}const s=await repository.fixtureSnapshot(),groups=summaries(s,options);return {protocol:PROTOCOL,projectId:project.id,revision:await revision(s),...page(groups,options.cursor,40),matchedTotal:groups.reduce((n,g)=>n+g.matched,0),capabilities};};
  port.listRows=async options=>{await guard(options);port.calls.push({kind:'rows',groupId:options.groupId,cursor:options.cursor});const s=await repository.fixtureSnapshot(),p=page(rows(s,options),options.cursor,50);return {projectId:project.id,groupId:options.groupId,revision:await revision(s),rows:p.items,nextCursor:p.nextCursor};};
  port.destinations=async options=>{await guard(options);const s=await repository.fixtureSnapshot(),list=[{value:'backlog',label:'Без релиза — бэклог'},...s.releases.filter(r=>!r.archivedAt&&!['closed','cancelled'].includes(r.planningPhase)&&r.status!=='released'&&r.id!==options.excludeId).map(r=>({value:r.id,label:r.name,description:r.planningPhase==='active'?'Активный состав — потребуется подтверждение':'Запланирован'}))];const p=page(list.filter(x=>x.label.toLocaleLowerCase('ru').includes((options.query||'').toLocaleLowerCase('ru'))),options.cursor,20);return {options:p.items,nextCursor:p.nextCursor};};
  port.describeRelease=async options=>{await guard(options);const o=releaseOverview(await repository.fixtureSnapshot(),options.groupId),r=o.release;return {id:r.id,title:r.name,state:r.planningPhase||'planned',format:r.planningFormat||'flexible',start:r.planningStart||null,end:r.targetDate||null,deadline:r.deadline||null,revision:r.revision,counts:o.counts,items:o.items,snapshot:o.snapshot};};
  port.settings=async options=>{await guard(options);const s=await repository.fixtureSnapshot();return s._pnFixture.find(x=>x.id==='planning-settings')||{format:'flexible',days:14,timeZone:'Europe/Moscow',revision:0};};
  port.options=async options=>{await guard(options);const s=await repository.fixtureSnapshot();let list;
    if(options.kind==='owner')list=[{value:'__none__',label:'Не назначен'},...[...new Set(s.tasks.map(t=>t.owner).filter(Boolean))].map(x=>({value:x,label:x}))];
    else if(options.kind==='tags')list=s.tags.filter(t=>!t.archivedAt).map(t=>({value:t.id,label:t.name}));
    else list=s.tasks.filter(t=>!t.archivedAt).map(t=>({value:t.id,label:(t.displayId||t.id)+' · '+t.title}));
    const p=page(list.filter(x=>x.label.toLocaleLowerCase('ru').includes((options.query||'').toLocaleLowerCase('ru'))),options.cursor,20);return {options:p.items,nextCursor:p.nextCursor};
  };
  port.selectMatching=async options=>{await guard(options);const s=await repository.fixtureSnapshot();let ids;
    if(options.taskIds)ids=[...descendants(s.tasks,options.taskIds)].filter(id=>s.tasks.some(t=>t.id===id&&!t.archivedAt));
    else ids=[...new Set(summaries(s,options).flatMap(g=>rows(s,{...options,groupId:g.id,collapsedTaskIds:[]}).filter(r=>r.selectable).map(r=>r.taskId)))];
    const token=crypto.randomUUID(),expiresAt=new Date(Date.now()+180000).toISOString(),v=await revision(s);selections.set(token,{ids,input:revisionInput(s),expiresAt});return {token,count:ids.length,expiresAt,revision:v};
  };
  port.preview=async({projectId,intent,signal})=>{
    await guard({projectId,signal});const s=await repository.fixtureSnapshot(),input=revisionInput(s);intent=structuredClone(intent);
    if(intent.expectedProjectionRevision&&intent.expectedProjectionRevision!==await revision(s))throw Error('План изменился. Обновите шкалу перед сохранением.');
    if(intent.selectionToken){const selection=selections.get(intent.selectionToken);if(!selection||selection.input!==input||Date.parse(selection.expiresAt)<=Date.now())throw Error('Выбранный набор устарел. Выберите задачи снова.');intent.taskIds=selection.ids;delete intent.selectionToken;}
    let plan;try{plan=planChange(s,intent,{projectId});}catch(error){plan={summary:'Изменение не может быть выполнено.',changes:[],blockers:[error.message],tasks:[],releases:[],meta:[],links:[]};}
    const token=crypto.randomUUID(),expiresAt=new Date(Date.now()+180000).toISOString();
    const preview={token,expiresAt,summary:plan.summary,changes:plan.changes.slice(0,100),moreChanges:Math.max(0,plan.changes.length-100),blockers:plan.blockers.slice(0,100)};
    plans.set(token,{...plan,preview,input});return preview;
  };
  port.commit=async({projectId,token,idempotencyKey})=>{
    await guard({projectId});const plan=plans.get(token);
    const result=await repository.fixtureTransaction((s,put)=>{
      const existing=s._pnFixture.find(x=>x.id===idempotencyKey);
      if(existing){if(existing.token!==token)throw Object.assign(Error('Ключ операции уже использован.'),{definitive:true});return existing.result;}
      if(!plan||plan.preview.blockers.length||Date.parse(plan.preview.expiresAt)<=Date.now()||plan.input!==revisionInput(s))throw Object.assign(Error('Состав изменился. Проверьте последствия снова.'),{definitive:true});
      // New recipient first, then tasks, then existing releases: all in one fixture transaction.
      for(const r of plan.releases.filter(r=>!s.releases.some(x=>x.id===r.id)))put('releases',r,0);
      for(const task of plan.tasks)put('tasks',task,task.revision);
      for(const r of plan.releases.filter(r=>r.revision>0))put('releases',r,r.revision);
      for(const link of plan.links||[])put('taskLinks',link,link.revision);
      for(const value of plan.meta)put('_pnFixture',value);
      const result={state:'committed',operationId:idempotencyKey,message:'Изменение сохранено в тестовом хранилище.',effect:plan.effect};
      put('_pnFixture',{id:idempotencyKey,kind:'receipt',token,result});return result;
    });
    if(port.loseNextAck){port.loseNextAck=false;throw Error('Тест: ответ после сохранения потерян.');}return result;
  };
  port.receipt=async({projectId,idempotencyKey})=>{await guard({projectId});return(await repository.fixtureSnapshot())._pnFixture.find(x=>x.id===idempotencyKey)?.result||{state:'uncertain'};};
  port.timeline=async options=>{await guard(options);const s=await repository.fixtureSnapshot(),member=memberships(s.tasks),groups=summaries(s,{...options,history:'current'}),included=new Set(groups.map(g=>g.id)),all=[];
    for(const g of groups){if(g.id!=='backlog'){const r=s.releases.find(x=>x.id===g.id);all.push({id:'release:'+r.id,entityId:r.id,entityKind:'release',title:r.name,kind:'goal',start:r.planningStart||null,end:r.targetDate||null,deadline:r.deadline||null,readonly:false});}
      for(const row of rows(s,{...options,groupId:g.id,collapsedTaskIds:[]})){if(row.contextOnly)continue;const t=s.tasks.find(t=>t.id===row.taskId);all.push({id:'task:'+t.id,entityId:t.id,entityKind:'task',title:(t.displayId||t.id)+' · '+t.title,kind:t.type==='epic'?'epic':'task',parentId:t.parentId&&member.get(t.parentId)===member.get(t.id)?'task:'+t.parentId:g.id!=='backlog'?'release:'+g.id:null,start:t.planningStart||null,end:t.planningEnd||null,deadline:t.due||null,readonly:['accepted','cancelled'].includes(t.planningOutcome),status:t.planningOutcome==='accepted'?'done':'ready'});}
    }
    for(const m of s._pnFixture.filter(x=>x.kind==='milestone'&&!x.removed&&(!x.releaseId||included.has(x.releaseId))))all.push({id:'milestone:'+m.id,entityId:m.id,entityKind:'milestone',releaseId:m.releaseId,title:m.title,kind:'milestone',parentId:m.releaseId?'release:'+m.releaseId:null,start:m.date,end:m.date,deadline:null,readonly:false});
    const p=page(all,options.cursor,200),ids=new Set(all.map(r=>r.id));
    const dependencies=s._pnFixture.filter(x=>x.kind==='constraint'&&!x.removed&&ids.has('task:'+x.fromId)&&ids.has('task:'+x.toId)).map(x=>({id:x.id,from:'task:'+x.fromId,to:'task:'+x.toId,type:x.type,lagDays:x.lagDays}));
    return {projectId:project.id,revision:await revision(s),rows:p.items,nextCursor:p.nextCursor,total:all.length,dependencies};
  };
  port.subscribe=fn=>{let queued=false;return repository.subscribe(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;fn();});});};
  return port;
}
