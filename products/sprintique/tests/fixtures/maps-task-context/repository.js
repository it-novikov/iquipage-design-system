// Deterministic read responses at the existing frontend adapter boundary. No HTTP server, auth or persistence.
export const project={id:'fixture-project',slug:'fixture',name:'Проверка Maps',workspaceId:'fixture-workspace',workspaceName:'Синтетическая проверка',
  permissions:['tasks.read','tasks.write','threads.write','maps.read','maps.write']};
const person={id:'fixture-person',name:'Тестовый участник'};
const task=(id,displayId,title)=>({id,displayId,title,projectId:project.id,revision:1,type:'task',status:'in_progress',priority:'normal',
  result:'open',preparation:'ready',description:'## Ожидаемый результат\n\nОбсудить решение и продолжить ту же карту.',
  ownerId:person.id,parentId:null,releaseId:null,effectiveReleaseId:null,tagIds:[],due:null,estimate:null,attachmentIds:[],
  coverAttachmentId:null,coverCrop:null,createdAt:'2026-10-01T09:00:00Z',updatedAt:'2026-10-01T09:00:00Z',createdById:person.id,createdByName:person.name});
export const tasks=[task('task-1','MFX-101','Проверить решение на карте A'),task('task-2','MFX-102','Уточнить связанное решение')];
const object=(id,type,text,x,y,extra={})=>({id,type,text,x,y,width:240,height:150,color:'sand',...extra});
export const maps=[
  {id:'map-a',projectId:project.id,title:'Карта A — исходное обсуждение',kind:'permanent',status:'active',revision:1,
    createdAt:'2026-10-01T09:00:00Z',updatedAt:'2026-10-01T09:00:00Z',
    document:{schema:'iquipage.whiteboard/1',title:'Карта A — исходное обсуждение',revision:1,
      objects:[object('linked-a1','task','MFX-101 · Проверить решение',80,80,{externalTaskId:'task-1'}),
        object('context-a','sticky','Продолжить обсуждение с того же места',430,80,{color:'mint'})],connections:[]}},
  {id:'map-b',projectId:project.id,title:'Карта B — более новая',kind:'permanent',status:'active',revision:1,
    createdAt:'2026-10-02T09:00:00Z',updatedAt:'2026-10-02T09:00:00Z',
    document:{schema:'iquipage.whiteboard/1',title:'Карта B — более новая',revision:1,
      objects:[object('context-b','sticky','Эта карта не является местом возврата',80,80)],connections:[]}},
];
const links=[{id:'related-1-2',projectId:project.id,revision:1,kind:'related',fromId:'task-1',toId:'task-2',archivedAt:null}];

export function syntheticRepository(){
  const reads=[],unsupported=[],signalTasks=new WeakMap();
  let nextNull=null,nextSupport=null,pendingSupport=null;
  const clone=value=>structuredClone(value);
  const check=options=>options?.signal?.throwIfAborted();
  const unexpected=operation=>{unsupported.push(operation);throw Error('Unsupported synthetic operation: '+operation);};
  const repository={
    context:{actorId:person.id,workspaceId:project.workspaceId},attachmentAdapter:null,
    capabilities:{attachments:false,members:true,tags:true,releases:true,taskSettings:true,taskLinks:true,agentWork:true,aiAgents:false,
      storage:'memory',storageLabel:'Синтетические данные; запись не выполняется'},
    async read(collection,id,projectId,options={}){
      check(options);if(projectId!==project.id)return unexpected('read from another project');
      reads.push({operation:'read',collection,id});
      if(collection==='maps')return clone(maps.find(row=>row.id===id)||null);
      if(collection==='tasks'){
        const found=tasks.find(row=>row.id===id||row.displayId===id);
        if(options.signal&&found)signalTasks.set(options.signal,found.id);
        if(nextNull===found?.id){nextNull=null;return null;}
        return clone(found||null);
      }
      return unexpected('read '+collection);
    },
    async list(collection,projectId,options={}){
      check(options);if(projectId!==project.id)return unexpected('list from another project');
      reads.push({operation:'list',collection});
      if(collection==='maps')return clone(maps);
      if(collection==='members')return [clone(person)];
      if(collection==='taskLinks')return clone(links);
      if(collection==='taskSettings'&&nextSupport&&signalTasks.get(options.signal)===nextSupport.taskId){
        const fault=nextSupport;nextSupport=null;
        if(fault.kind==='reject')throw Error('Synthetic support read failed');
        // Deliberately ignores cancellation: the real host/dialog must suppress the released late completion.
        return new Promise(resolve=>{pendingSupport={taskId:fault.taskId,signal:options.signal,resolve};});
      }
      if(['tags','releases','taskSettings','threads'].includes(collection))return [];
      return unexpected('list '+collection);
    },
    async taskContext(projectId,options={}){check(options);if(projectId!==project.id)return unexpected('taskContext project');return clone(tasks);},
    async viewSettings(){return {};},
    subscribe(){return ()=>{};},
    async write(collection){return unexpected('write '+collection);},
    client:{async request(path,method='GET',_body,_key,signal){
      signal?.throwIfAborted();reads.push({operation:method,path});
      if(method==='GET'&&/^\/projects\/fixture-project\/tasks\/task-[12]\/work$/.test(path))
        return {workPlan:null,sessions:[],requests:[],permissions:{},events:{items:[],nextCursor:null}};
      return unexpected(method+' '+path);
    }},
  };
  const controls={
    nullNextTask(taskId='task-2'){nextNull=taskId;},
    rejectNextSupport(taskId='task-2'){nextSupport={taskId,kind:'reject'};},
    delayNextSupport(taskId='task-2'){nextSupport={taskId,kind:'delay'};},
    supportState(){return pendingSupport?{pending:true,taskId:pendingSupport.taskId,aborted:pendingSupport.signal.aborted}:{pending:false};},
    releaseSupport(){if(!pendingSupport)throw Error('No delayed support read');const gate=pendingSupport;pendingSupport=null;gate.resolve([]);},
  };
  return {repository,controls,reads,unsupported};
}
