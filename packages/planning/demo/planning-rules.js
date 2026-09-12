/** LOCAL FIXTURE RULES ONLY. Executable UX examples, not vNext server business logic.
 * The production adapter delegates these decisions to the backend owner's use cases.
 */
import {memberships, compare} from './fixture-projection.js';
import {interval, validDate, addDays} from '../src/date-value.js';
const copy = value => structuredClone(value);
const terminal = task => ['accepted','cancelled'].includes(task.planningOutcome);
const phase = release => release?.planningPhase || (release?.status === 'released' ? 'closed' : 'planned');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const date = value => { assert(value == null || value === '' || validDate(value), 'Некорректная дата.'); return value || null; };
export function descendants(tasks, ids) {
  const children = new Map(), found = new Set(ids), queue = [...found];
  for (const task of tasks) { const a = children.get(task.parentId) || []; a.push(task.id); children.set(task.parentId, a); }
  for (let i=0; i<queue.length; i++) for (const child of children.get(queue[i]) || []) if (!found.has(child)) {found.add(child);queue.push(child);}
  return found;
}
export function releaseOverview(snapshot, releaseId) {
  const tasks = snapshot.tasks.filter(t=>!t.archivedAt), member = memberships(tasks);
  const release = snapshot.releases.find(r=>r.id===releaseId);
  assert(release, 'Релиз недоступен.');
  const own = tasks.filter(t=>member.get(t.id)===releaseId);
  const children = new Map();
  for (const task of tasks) {const a=children.get(task.parentId)||[];a.push(task);children.set(task.parentId,a);}
  const eligible = task => task.preparation !== 'draft' && task.status === 'ready_for_release';
  return {release:copy(release), counts:{total:own.length, accepted:own.filter(terminal).length,
    candidates:own.filter(t=>!terminal(t)&&eligible(t)).length, unfinished:own.filter(t=>!terminal(t)&&!eligible(t)).length,
    drafts:own.filter(t=>t.preparation==='draft'&&!terminal(t)).length},
    items:own.map(t=>({id:t.id,key:t.displayId||t.id,title:t.title,parentId:t.parentId||null,
      outcome:terminal(t)?t.planningOutcome:eligible(t)?'candidate':'unfinished',
      openChildren:(children.get(t.id)||[]).filter(t=>!terminal(t)).length})),
    snapshot:copy(release.planningSnapshot||null)};
}
export function planChange(snapshot, intent, {projectId, now = new Date().toISOString(), newId = () => crypto.randomUUID()}={}) {
  assert(projectId, 'Проект не задан.');
  if(intent.kind==='batch') {
    assert(Array.isArray(intent.actions)&&intent.actions.length>0&&intent.actions.length<=100,'Некорректный пакет изменений.');
    let stage=copy(snapshot);const updates=[],metadata=new Map(),links=new Map();
    for(const action of intent.actions){assert(['schedule','temporal','removeTemporal'].includes(action.kind),'Этот вид изменения не допускается в пакете дат.');
      const part=planChange(stage,action,{projectId,now,newId});assert(!part.blockers.length,part.blockers[0]);updates.push(...part.changes);
      const replace=(list,changes)=>{const ids=new Set(changes.map(x=>x.id));return [...list.filter(x=>!ids.has(x.id)),...changes];};
      stage.tasks=replace(stage.tasks,part.tasks);stage.releases=replace(stage.releases,part.releases);stage._pnFixture=replace(stage._pnFixture,part.meta);stage.taskLinks=replace(stage.taskLinks||[],part.links||[]);
      for(const item of part.meta)metadata.set(item.id,item);for(const link of part.links||[])links.set(link.id,link);
    }
    const diff=name=>stage[name].filter(x=>JSON.stringify(x)!==JSON.stringify(snapshot[name].find(y=>y.id===x.id)));
    return {summary:'Сохранить изменения календарного плана одним действием. Дедлайны и соседние задачи не сдвигаются автоматически.',changes:updates,blockers:[],tasks:diff('tasks'),releases:diff('releases'),meta:[...metadata.values()],links:[...links.values()],effect:{kind:'batch'}};
  }

  const source=copy(snapshot), tasks=source.tasks, releases=source.releases;
  assert(tasks.every(t=>t.projectId===projectId)&&releases.every(r=>r.projectId===projectId), 'Неверная область тестового набора.');
  const before=memberships(tasks), updates=[], blockers=[], meta=[], links=[];
  const taskById=new Map(tasks.map(t=>[t.id,t]));
  const chosen=new Set(intent.taskIds||[]);
  const requireTasks=()=>{assert(chosen.size>0,'Выберите задачи.');assert([...chosen].every(id=>taskById.has(id)&&!taskById.get(id).archivedAt),'Выбор изменился. Обновите список.');};
  const releaseById=id=>{const r=releases.find(r=>r.id===id&&!r.archivedAt);assert(r,'Релиз недоступен.');return r;};
  const target=id=>{if(id==='backlog'||id==null)return null;const r=releaseById(id);assert(['planned','active'].includes(phase(r)),'Закрытый релиз нельзя назначить.');return r;};
  const describe=(task,description)=>updates.push({label:task.displayId||task.id,description});
  const disposition=(task,id)=>{const r=target(id);assert(!terminal(task),'Принятый результат не переносится обычной командой.');
    if(phase(r)==='active')assert(task.preparation!=='draft',`${task.displayId||task.id}: сначала подготовьте задачу.`);
    task.releaseAssignment=r?'assigned':'none';task.releaseId=r?.id||null;task.planningAdmission=phase(r)==='active';};
  let summary='', effect={kind:intent.kind};
  if(intent.kind==='prepare'||intent.kind==='unprepare'||intent.kind==='take'||intent.kind==='defer') {
    requireTasks();
    for(const id of chosen) { const task=taskById.get(id);assert(!terminal(task),'Принятый результат нельзя взять заново.');
      if(intent.kind==='prepare'){task.preparation='ready';describe(task,'Готова к работе; рабочий статус сохраняется');}
      if(intent.kind==='unprepare'){task.preparation='draft';task.planningAdmission=false;describe(task,'Черновик; работа покинет активную доску');}
      if(intent.kind==='take'){assert(task.preparation!=='draft','Сначала подготовьте задачу.');task.releaseId=null;task.releaseAssignment='none';task.planningAdmission=true;describe(task,'В работу без релиза; рабочий статус сохраняется');}
      if(intent.kind==='defer'){task.planningAdmission=false;describe(task,'Отложить работу; рабочий статус сохраняется');}
    }
    summary='Изменить подготовленность или допуск выбранных задач. Никакие рабочие статусы не сбрасываются.';
  } else if(intent.kind==='move') {
    requireTasks();const destination=target(intent.groupId);
    for(const id of chosen)disposition(taskById.get(id),destination?.id);
    const after=memberships(tasks);
    for(const task of tasks)if(chosen.has(task.id)||before.get(task.id)!==after.get(task.id)) {
      assert(!terminal(task),'Перенос затрагивает принятые дочерние результаты. Измените состав явно.');
      const r=target(after.get(task.id));if(phase(r)==='active')assert(task.preparation!=='draft',`${task.displayId||task.id}: сначала подготовьте задачу.`);
      task.planningAdmission=phase(r)==='active';
      describe(task,`${releases.find(r=>r.id===before.get(task.id))?.name||'Бэклог'} → ${r?.name||'Бэклог'}${chosen.has(task.id)?'':' (следует за родителем)'}${task.planningAdmission?' · на доске':' · вне активной доски'}`);
    }
    summary=`Перенести ${chosen.size} выбранных задач. Всего затронуто: ${updates.length}. Статусы сохранятся.`;
  } else if(intent.kind==='start') {
    const r=releaseById(intent.groupId);assert(phase(r)==='planned','Релиз уже запущен или закрыт.');
    if(r.planningFormat==='timeboxed'){assert(r.planningStart&&r.targetDate,'Для спринта нужны даты начала и окончания.');interval(r.planningStart,r.targetDate);}
    const own=tasks.filter(t=>before.get(t.id)===r.id&&!terminal(t)&&!t.archivedAt);
    for(const task of own) {
      if(task.preparation==='draft'){
        if(intent.draftHandling==='backlog'){task.releaseAssignment='none';task.releaseId=null;task.planningAdmission=false;describe(task,'Черновик остаётся в бэклоге');continue;}
        if(intent.draftHandling==='prepare'){task.preparation='ready';}
        else blockers.push(`${task.displayId||task.id}: задача ещё черновик.`);
      }
      task.planningAdmission=true;describe(task,'На доску в текущем рабочем статусе');
    }
    const after=memberships(tasks);for(const task of own)if(task.planningAdmission&&after.get(task.id)!==r.id){task.releaseAssignment='assigned';task.releaseId=r.id;describe(task,'Остаётся в релизе отдельно от отложенного родителя');}
    r.planningPhase='active';r.startedAt=now;r.scopeBaseline=own.filter(t=>t.planningAdmission).map(t=>({id:t.id,key:t.displayId,title:t.title,status:t.status}));
    summary=`Начать «${r.name}». Подготовленность меняется только выбранным действием; статусы и исполнители сохранятся.`;
  } else if(intent.kind==='close'||intent.kind==='cancel') {
    const r=releaseById(intent.groupId);assert(['active','planned'].includes(phase(r)),'Релиз уже закрыт.');
    assert(intent.kind!=='close'||phase(r)==='active','Сначала запустите релиз.');
    const own=tasks.filter(t=>before.get(t.id)===r.id&&!t.archivedAt), accept=new Set(intent.acceptAllCandidates?own.filter(t=>!terminal(t)&&t.preparation!=='draft'&&t.status==='ready_for_release').map(t=>t.id):intent.acceptTaskIds||[]);
    assert(intent.kind==='close'||accept.size===0,'Отмена релиза не принимает результаты задач.');
    for(const id of accept){const t=taskById.get(id);assert(t&&before.get(id)===r.id,'Принимается только работа этого релиза.');assert(t.status==='ready_for_release'&&t.preparation!=='draft',`${t.displayId||id}: результат ещё не готов к принятию.`);}
    for(const id of accept){const all=descendants(tasks,[id]);all.delete(id);assert([...all].every(id=>terminal(taskById.get(id))||accept.has(id)),`${taskById.get(id).displayId||id}: остались незавершённые подзадачи.`);}
    for(const task of own)if(accept.has(task.id)){task.planningOutcome='accepted';task.planningAdmission=false;task.acceptedAt=now;describe(task,'Принять результат; без объявления деплоя');}
    const remain=own.filter(t=>!terminal(t));let defaultTarget=intent.destinationId;
    if(remain.length&&intent.newRelease){
      const cfg=intent.newRelease,name=String(cfg.name||'').trim();assert(name&&name.length<=100,'Введите название следующего релиза.');
      assert(!releases.some(x=>x.name.trim().toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')),'Такой релиз уже существует.');
      interval(cfg.start,cfg.end);const id='pn-release-'+newId();releases.push({id,projectId,name,revision:0,status:'planned',planningPhase:'planned',planningFormat:cfg.format==='timeboxed'?'timeboxed':'flexible',planningStart:cfg.start||null,targetDate:cfg.end||null,deadline:date(cfg.deadline),previousReleaseId:r.id});defaultTarget=id;effect.createdReleaseId=id;
    }
    assert(!remain.length||defaultTarget||Object.keys(intent.destinations||{}).length,'Укажите, куда перенести незавершённую работу.');
    // Pin accepted descendants BEFORE moving their open ancestors. They remain in the old release.
    for(const task of own)if(terminal(task)){task.releaseId=r.id;task.releaseAssignment='assigned';task.planningAdmission=false;}
    for(const task of remain){const id=intent.destinations?.[task.id]||defaultTarget;assert(id&&id!==r.id,'Незавершённая работа должна покинуть закрываемый релиз.');disposition(task,id);describe(task,'Перенести в '+(releases.find(x=>x.id===task.releaseId)?.name||'бэклог'));}
    const after=memberships(tasks);assert(!tasks.some(t=>after.get(t.id)===r.id&&!terminal(t)&&!t.archivedAt),'Не распределена часть незавершённой работы.');
    // Descendants outside this release retain their own membership/identity.
    r.planningPhase=intent.kind==='cancel'?'cancelled':'closed';r.status='released';r.closedAt=now;
    r.planningSnapshot={closedAt:now,kind:r.planningPhase,name:r.name,format:r.planningFormat||'flexible',baseline:copy(r.scopeBaseline||[]),
      items:own.map(t=>({taskId:t.id,key:t.displayId||t.id,title:t.title,outcome:t.planningOutcome||'open',destinationId:after.get(t.id)||null,status:t.status})),accepted:own.filter(terminal).length,carried:remain.length};
    summary=`${intent.kind==='cancel'?'Отменить':'Завершить'} «${r.name}». Принятых/отменённых результатов: ${own.filter(terminal).length}; переносится: ${remain.length}. Задачи не удаляются и не архивируются.`;
    effect={...effect,closedReleaseId:r.id,accepted:own.filter(terminal).length,carried:remain.length};
  } else if(intent.kind==='editRelease') {
    const r=releaseById(intent.groupId);assert(['planned','active'].includes(phase(r)),'Исторический план неизменяем.');
    const v=intent.values||{},name=String(v.name||r.name).trim();assert(name&&name.length<=100,'Название релиза — до 100 символов.');
    assert(!releases.some(x=>x.id!==r.id&&x.name.trim().toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')),'Название уже используется.');
    const dates=interval(v.start,v.end),format=v.format==='timeboxed'?'timeboxed':'flexible';
    if(phase(r)==='active'&&format==='timeboxed')assert(dates.start&&dates.end,'Активному спринту нужны начало и окончание.');
    Object.assign(r,{name,planningFormat:format,planningStart:dates.start,targetDate:dates.end,deadline:date(v.deadline)});
    updates.push({label:r.name,description:'Изменятся только план и формат этого релиза. Даты задач и дедлайны не сдвигаются автоматически.'});summary='Сохранить план релиза'+(phase(r)==='active'?' и зафиксировать изменение активного плана.':'.');
  } else if(intent.kind==='bulk') {
    requireTasks();const {field,value}=intent;
    assert(['owner','priority','due','tags','archive'].includes(field),'Поле не поддерживается.');
    for(const id of chosen){const t=taskById.get(id);
      if(field==='owner'){assert(typeof value==='string'&&value.length<=120,'Некорректный исполнитель.');t.owner=value;}
      if(field==='priority'){assert(['low','normal','high','critical'].includes(value),'Некорректный приоритет.');t.priority=value;}
      if(field==='due')t.due=date(value);
      if(field==='tags'){assert(Array.isArray(value)&&value.every(id=>snapshot.tags.some(tag=>tag.id===id&&tag.projectId===projectId&&!tag.archivedAt)),'Недоступный тег.');t.tagIds=[...new Set([...(intent.mode==='replace'?[]:t.tagIds||[]),...value])];}
      if(field==='archive'){assert(terminal(t),'Архивируются только принятые/отменённые задачи.');assert([...descendants(tasks,[id])].every(x=>terminal(taskById.get(x))),'Есть открытые потомки.');t.archivedAt=now;t.planningAdmission=false;}
      describe(t,({owner:'Назначить исполнителя',priority:'Изменить приоритет',due:'Изменить срок',tags:'Изменить теги',archive:'Архивировать'})[field]);
    }
    summary=`Изменить ${chosen.size} задач одним действием. Остальные поля сохранятся.`;
  } else if(intent.kind==='reorder') {
    requireTasks();assert(chosen.size===1,'Переставляйте по одной строке.');
    const t=taskById.get([...chosen][0]);assert(!terminal(t),'Принятый результат защищён.');const siblings=tasks.filter(x=>!x.archivedAt&&x.id!==t.id&&(x.parentId||null)===(t.parentId||null)&&before.get(x.id)===before.get(t.id)).sort(compare('planned'));
    let pos=intent.beforeId?siblings.findIndex(x=>x.id===intent.beforeId):siblings.length;assert(pos>=0,'Выбранная позиция недоступна.');siblings.splice(pos,0,t);
    for(let i=0;i<siblings.length;i++)siblings[i].planningRank=(i+1)*1024;
    describe(t,'Новый порядок среди задач одного уровня. Родитель и порядок доски не изменятся.');summary='Сохранить порядок планирования.';
  } else if(intent.kind==='settings') {
    const v=intent.values||{};assert(['flexible','timeboxed'].includes(v.format),'Выберите формат.');assert(Number.isInteger(v.days)&&v.days>=1&&v.days<=3660,'Период — целое число от 1 до 3660 дней.');
    try{new Intl.DateTimeFormat('ru',{timeZone:v.timeZone}).format();}catch{throw Error('Неизвестный часовой пояс.');}
    meta.push({id:'planning-settings',kind:'settings',projectId,format:v.format,days:v.days,timeZone:v.timeZone,revision:(snapshot._pnFixture.find(x=>x.id==='planning-settings')?.revision||0)+1});
    summary='Сохранить настройки для новых релизов. Существующие периоды и история не изменятся.';
  } else if(intent.kind==='schedule') {
    const v=intent.values||{},dates=interval(v.start,v.end);date(v.deadline);
    if(intent.entityKind==='release'){const r=releaseById(intent.entityId);assert(['planned','active'].includes(phase(r)),'Исторический план неизменяем.');if(r.planningFormat==='timeboxed'&&phase(r)==='active')assert(dates.start&&dates.end,'Активному спринту нужны даты.');Object.assign(r,{planningStart:dates.start,targetDate:dates.end,...(Object.hasOwn(v,'deadline')?{deadline:v.deadline||null}:{})});updates.push({label:r.name,description:'Изменить интервал релиза, не меняя даты задач'});}
    else if(intent.entityKind==='task'){const t=taskById.get(intent.entityId);assert(t&&!terminal(t)&&!t.archivedAt,'Задача недоступна для изменения плана.');Object.assign(t,{planningStart:dates.start,planningEnd:dates.end,...(Object.hasOwn(v,'deadline')?{due:v.deadline||null}:{})});describe(t,'Изменить плановый интервал; дедлайн сохраняется, если не изменён явно');}
    else {const m=snapshot._pnFixture.find(x=>x.id===intent.entityId&&x.kind==='milestone');assert(m,'Событие недоступно.');if(m.releaseId)assert(['planned','active'].includes(phase(releaseById(m.releaseId))),'Событие закрытого релиза неизменяемо.');assert(dates.start,'Для события нужна дата.');meta.push({...m,date:dates.start,revision:m.revision+1});}
    summary='Сохранить календарное изменение. Соседние задачи не перепланируются автоматически.';
  } else if(intent.kind==='shiftDates') {
    const r=releaseById(intent.groupId);assert(['planned','active'].includes(phase(r)),'Закрытый план неизменяем.');assert(Number.isSafeInteger(intent.days)&&Math.abs(intent.days)<=3660,'Некорректное смещение.');
    for(const task of tasks)if(before.get(task.id)===r.id&&!terminal(task)&&!task.archivedAt&&task.planningStart&&task.planningEnd){task.planningStart=addDays(task.planningStart,intent.days);task.planningEnd=addDays(task.planningEnd,intent.days);describe(task,'Сдвинуть план на '+intent.days+' дн. Дедлайн не изменится.');}
    summary='Сдвинуть только заданные интервалы открытых задач. Работа без дат и принятые результаты остаются как есть.';
  } else if(intent.kind==='milestone') {
    const v=intent.values||{},title=String(v.title||'').trim();assert(title&&title.length<=240,'Введите название события.');assert(validDate(v.date),'Укажите дату события.');if(v.releaseId)target(v.releaseId);
    const id=intent.entityId||'pn-milestone-'+newId(),old=snapshot._pnFixture.find(x=>x.id===id);assert(!intent.entityId||old?.kind==='milestone','Событие недоступно.');
    meta.push({id,kind:'milestone',projectId,title,date:v.date,releaseId:v.releaseId||null,revision:(old?.revision||0)+1});summary='Сохранить событие. Оно не создаёт новую задачу и не публикует продукт.';
  } else if(intent.kind==='removeMilestone') {
    const old=snapshot._pnFixture.find(x=>x.id===intent.entityId&&x.kind==='milestone');assert(old,'Событие недоступно.');if(old.releaseId)target(old.releaseId);meta.push({...old,removed:true,revision:old.revision+1});summary='Убрать событие из текущего плана; сохранить историю.';
  } else if(intent.kind==='temporal') {
    const v=intent.values||{},from=taskById.get(v.fromId),to=taskById.get(v.toId);
    assert(from&&to&&from.id!==to.id,'Выберите две разные задачи.');assert(!terminal(from)&&!terminal(to),'Принятые результаты защищены.');
    assert(['FS','SS','FF','SF'].includes(v.type)&&Number.isInteger(v.lagDays)&&Math.abs(v.lagDays)<=3660,'Некорректное календарное условие.');
    const existing=snapshot._pnFixture.filter(x=>x.kind==='constraint'&&!x.removed&&x.id!==intent.entityId);
    assert(!existing.some(x=>x.fromId===v.fromId&&x.toId===v.toId),'Такая временная зависимость уже есть.');
    const adjacency=new Map();for(const e of [...existing,v]){const a=adjacency.get(e.fromId)||[];a.push(e.toId);adjacency.set(e.fromId,a);}
    const queue=[v.toId],seen=new Set();for(let i=0;i<queue.length;i++){const id=queue[i];assert(id!==v.fromId,'Зависимости не должны образовывать цикл.');if(seen.has(id))continue;seen.add(id);queue.push(...(adjacency.get(id)||[]));}
    const id=intent.entityId||'pn-constraint-'+newId(),old=snapshot._pnFixture.find(x=>x.id===id);assert(!intent.entityId||old?.kind==='constraint','Связь недоступна.');
    let relation=(snapshot.taskLinks||[]).find(x=>x.kind==='depends'&&!x.archivedAt&&x.fromId===v.toId&&x.toId===v.fromId);
    if(!relation){relation={id:'pn-link-'+newId(),projectId,kind:'depends',fromId:v.toId,toId:v.fromId,revision:0};links.push(relation);}
    meta.push({id,kind:'constraint',projectId,relationId:relation.id,fromId:v.fromId,toId:v.toId,type:v.type,lagDays:v.lagDays,revision:(old?.revision||0)+1});summary='Сохранить календарное условие. Даты задач не меняются автоматически.';
  } else if(intent.kind==='removeTemporal') {
    const old=snapshot._pnFixture.find(x=>x.id===intent.entityId&&x.kind==='constraint');assert(old,'Связь недоступна.');meta.push({...old,removed:true,revision:old.revision+1});summary='Удалить календарное ограничение, сохранив задачи.';
  } else throw new Error('Неподдерживаемое действие в тестовом адаптере.');
  const changed=(name,list)=>{const old=new Map(snapshot[name].map(x=>[x.id,JSON.stringify(x)]));return list.filter(x=>JSON.stringify(x)!==old.get(x.id));};
  return {summary,changes:updates,blockers,tasks:changed('tasks',tasks),releases:changed('releases',releases),meta,links,effect};
}
