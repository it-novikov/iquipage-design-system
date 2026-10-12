// Synthetic reads at existing product adapter boundaries. These are not saved server responses.
// H02 uses the result/criterion from tests/work-preview-seed.ts, with no open question in the review case.
export const person={id:'fixture-person',name:'Анна Морозова'};
export const project={id:'fixture-project',slug:'fixture',name:'Sprintique',workspaceId:'fixture-workspace',
  workspaceName:'Команда продукта',permissions:['tasks.read','tasks.write','threads.write']};
export const navigationContext={id:project.id,workspaceId:project.workspaceId,workspaceName:project.workspaceName,projectName:project.name};
const at='2026-10-12T08:00:00Z';
const task=(id,displayId,title)=>({id,displayId,title,projectId:project.id,revision:1,type:'task',status:'in_progress',
  priority:'high',result:'open',preparation:'ready',description:'',ownerId:person.id,parentId:null,
  releaseId:'release-1',effectiveReleaseId:'release-1',tagIds:['tag-1'],due:'2026-10-16',estimate:{value:3,unit:'h'},
  plannedStart:'2026-10-12',plannedEnd:'2026-10-15',attachmentIds:[],coverAttachmentId:null,coverCrop:null,
  createdAt:'2026-10-01T09:00:00Z',updatedAt:at,createdById:person.id,createdByName:person.name});
const permissions={canEdit:true,canAssign:true,canDecide:true,canAnswer:true,canStop:false};
const noWork=()=>({schema:'bridge/1',revision:0,workPlan:null,sessions:[],requests:[],permissions:{...permissions},events:{items:[],nextCursor:null}});
const reviewWork=()=>({schema:'bridge/1',revision:6,workPlan:{id:'plan-1',taskId:'task-1',projectId:project.id,
  revision:6,status:'active',risk:'high',goal:'Сохранить понятный ход работы и следующий шаг.',
  scope:'История шагов, решения и передача работы следующему участнику.',criteria:[],context:[],extraSections:[],
  steps:[
    {id:'S1',title:'Проверить сохранение истории',what:'Повторно открыть задачу после обновления страницы.',
      how:'Сравнить историю с записями до обновления.',why:'Следующий участник должен видеть сохранённый ход работы.',
      state:'done',approval:'pending',revision:3,dependsOn:[],
      criteria:[{id:'C1',text:'История сохраняется после обновления страницы',done:true}],
      result:'История остаётся доступной после обновления страницы.',evidence:['#task/SPT-101/work']},
    {id:'S2',title:'Проверить передачу работы',what:'Открыть сохранённое состояние другим участником.',how:'',why:'',
      state:'todo',approval:'unreviewed',revision:1,criteria:[],dependsOn:['S1'],result:'',evidence:[]},
  ],questions:[],decisions:[],checkpoint:{summary:'Сохранение истории проверено. Результат готов к проверке человеком.',
    nextStep:'Проверить передачу работы следующему участнику.',sessionId:'session-1'},lease:null,
  createdAt:'2026-10-11T09:00:00Z',updatedAt:at},
  sessions:[{id:'session-1',agentId:'agent-1',agentName:'Кодекс',mode:'external',state:'completed',
    goal:'Проверить сохранение истории.',summary:'Первый запуск завершён; передача работы ещё не проверена.',
    startedAt:'2026-10-12T07:00:00Z',endedAt:at,canHandoff:false,canStop:false}],
  requests:[],permissions:{...permissions},events:{items:[],nextCursor:null}});

export function scenario(id){
  if(!['ordinary','review','review-long','review-empty','question-no-answer'].includes(id))throw Error('Unknown fixture case: '+id);
  const ordinary=id==='ordinary',main=task('task-1','SPT-101',ordinary?'Подготовить очередь для поддержки':'Сохранить историю работы после обновления');
  main.description=ordinary
    ?'## Цель\n\nПоддержка принимает пять контрольных обращений: у каждого есть ответственный и срок. Начните со сверки очереди.\n\n## Что сделать\n\nСверить пять новых обращений с исходной очередью. Проверить назначение ответственных и согласованные сроки. Передать список дежурному сотруднику.\n\n## Критерии готовности\n\n- [ ] Все пять обращений доступны поддержке.\n- [ ] У каждого обращения есть ответственный и срок.\n- [ ] Дежурный подтвердил получение списка.'
    :'## Цель\n\nИстория шагов и решений остаётся доступной при повторном открытии задачи.\n\n## Что сделать\n\nПроверить сохранение истории после обновления, затем передать работу другому участнику.\n\n## Критерии готовности\n\n- [ ] Сохранённые шаги и решения видны после обновления.\n- [ ] Следующий участник может продолжить с указанного шага.';
  const parent={...task('task-2','SPT-100','Подготовить осеннее обновление'),type:'epic',status:'ready',releaseId:null,effectiveReleaseId:null};
  main.parentId=parent.id;
  const work=ordinary?noWork():reviewWork();
  if(id==='review-long'){
    main.title='Сохранить историю решений и передать её следующему участнику без потери контекста после обновления страницы';
    work.workPlan.steps[0].title='Проверить сохранение истории и отмеченных критериев после повторного открытия задачи';
    work.workPlan.steps[0].result='История остаётся доступной после обновления страницы. Запись «<готово> & проверено» и отметки критериев совпадают с исходным состоянием. Следующий участник видит принятые решения, автора каждого шага и ссылку на результат; передача работы остаётся отдельной проверкой.';
  }
  // Deliberately incomplete read edge: not a claim that a new done step without a result passes server commands.
  if(id==='review-empty')work.workPlan.steps[0].result='';
  if(id==='question-no-answer'){
    work.permissions.canAnswer=false;
    work.workPlan.questions=[{id:'Q1',title:'Кому передать следующий шаг?',state:'open',
      context:'Сохранение истории проверено. Осталась проверка передачи.',options:[
        {id:'O1',label:'Передать Клоду',description:'Другой участник продолжит по сохранённому состоянию.',recommended:true},
        {id:'O2',label:'Продолжить Кодексу',description:'Текущий участник выполнит оставшуюся проверку.',recommended:false},
      ],threadId:null,answer:'',decision:''}];
  }
  return {id,tasks:[main,parent],work,
    firstParagraph:main.description.split('\n\n')[1],
    tags:[{id:'tag-1',projectId:project.id,revision:1,name:'Передача',tone:'blue',archivedAt:null}],
    releases:[{id:'release-1',projectId:project.id,revision:1,name:'Осень 2026',status:'planned',targetDate:'2026-10-20',archivedAt:null}]};
}

export function syntheticRepository(data){
  const reads=[],unsupported=[],attempts=[],clone=value=>structuredClone(value);
  const check=options=>options?.signal?.throwIfAborted();
  const unexpected=operation=>{unsupported.push(operation);throw Error('Unsupported synthetic operation: '+operation);};
  const inProject=id=>{if(id!==project.id)unexpected('another project');};
  const write=operation=>{attempts.push({operation,outcome:'rejected-no-write'});return unexpected(operation);};
  const repository={
    context:{actorId:person.id,workspaceId:project.workspaceId},attachmentAdapter:null,
    capabilities:{attachments:false,members:true,tags:true,releases:true,taskSettings:true,taskLinks:true,agentWork:true,aiAgents:false,
      storage:'memory',storageLabel:'Синтетическая проверка без записи'},
    async read(collection,id,projectId,options={}){
      check(options);inProject(projectId);reads.push({operation:'read',collection,id});
      if(collection==='tasks')return clone(data.tasks.find(row=>row.id===id||row.displayId===id)||null);
      return unexpected('read '+collection);
    },
    async list(collection,projectId,options={}){
      check(options);inProject(projectId);reads.push({operation:'list',collection});
      if(collection==='tasks')return clone(data.tasks);
      if(collection==='members')return [clone(person)];
      if(collection==='tags')return clone(data.tags);
      if(collection==='releases')return clone(data.releases);
      if(['taskSettings','taskLinks','threads'].includes(collection))return [];
      return unexpected('list '+collection);
    },
    async taskContext(projectId,options={}){check(options);inProject(projectId);return clone(data.tasks);},
    async viewSettings(projectId){inProject(projectId);return {estimateFormat:'time',hoursPerDay:8,hoursPerWeek:40};},
    async listTaskWikiLinks(projectId,_id,options={}){check(options);inProject(projectId);return [];},
    async listTaskMaterials(_id,projectId,options={}){check(options);inProject(projectId);return [];},
    async memberNames(projectId,options={}){check(options);inProject(projectId);return new Map([[person.id,clone(person)]]);},
    subscribe(){return ()=>{};},
    async write(collection){return write('write '+collection);},
    async key(){return write('command key');},
    client:{async request(path,method='GET',_body,_key,signal){
      signal?.throwIfAborted();reads.push({operation:method,path});
      if(method==='GET'&&path==='/projects/fixture-project/tasks/task-1/work')return clone(data.work);
      if(method==='GET'&&path==='/projects/fixture-project/tasks/task-2/work')return noWork();
      return method==='GET'?unexpected(method+' '+path):write(method+' '+path);
    }},
    // No applyPlanningChange: the real Plan mount is read-only. Save acceptance needs a separate real adapter.
  };
  return {repository,reads,unsupported,attempts};
}
