// Synthetic responses at existing product adapter boundaries. No auth, server, user data or persisted writes.
export const person={id:'fixture-person',name:'Тестовый участник'};
export const project={id:'fixture-project',slug:'fixture',name:'Проверка вкладок',workspaceId:'fixture-workspace',workspaceName:'Синтетическая проверка',
  permissions:['tasks.read','tasks.write','threads.write']};
export const navigationContext={id:project.id,workspaceId:project.workspaceId,workspaceName:project.workspaceName,projectName:project.name};
const task=(id,displayId,title)=>({id,displayId,title,projectId:project.id,revision:1,type:'task',status:'in_progress',priority:'normal',
  result:'open',preparation:'ready',description:'## Ожидаемый результат\n\nПроверить содержание и продолжить работу с доской.',
  ownerId:person.id,parentId:null,releaseId:null,effectiveReleaseId:null,tagIds:[],due:null,estimate:null,attachmentIds:[],
  coverAttachmentId:null,coverCrop:null,createdAt:'2026-10-01T09:00:00Z',updatedAt:'2026-10-01T09:00:00Z',createdById:person.id,createdByName:person.name});
export const tasks=[task('task-1','TFX-101','Проверить результат и обсуждение'),task('task-2','TFX-102','Уточнить связанное решение')];
const links=[{id:'related-1-2',projectId:project.id,revision:1,kind:'related',fromId:'task-1',toId:'task-2',archivedAt:null}];
export const wikiPageId='page-1';
const page={id:wikiPageId,projectId:project.id,title:'Описание решения',body:'## Результат\n\nИсходный текст страницы.',parentId:null,revision:1,
  archivedAt:null,updatedAt:'2026-10-01T09:00:00Z',updatedBy:person.id};

export function syntheticRepository(){
  const reads=[],unsupported=[],attempts=[];
  const clone=value=>structuredClone(value),check=options=>options?.signal?.throwIfAborted();
  const unexpected=operation=>{unsupported.push(operation);throw Error('Unsupported synthetic operation: '+operation);};
  const inProject=id=>{if(id!==project.id)return unexpected('another project');};
  const repository={
    context:{actorId:person.id,workspaceId:project.workspaceId},attachmentAdapter:null,
    capabilities:{attachments:false,members:true,tags:true,releases:true,taskSettings:true,taskLinks:true,agentWork:true,aiAgents:false,
      storage:'memory',storageLabel:'Синтетическая проверка без записи'},
    async read(collection,id,projectId,options={}){
      check(options);inProject(projectId);reads.push({operation:'read',collection,id});
      if(collection==='tasks')return clone(tasks.find(row=>row.id===id||row.displayId===id)||null);
      return unexpected('read '+collection);
    },
    async list(collection,projectId,options={}){
      check(options);inProject(projectId);reads.push({operation:'list',collection});
      if(collection==='members')return [clone(person)];
      if(collection==='tasks')return clone(tasks);
      if(collection==='taskLinks')return clone(links);
      if(['tags','releases','taskSettings','threads'].includes(collection))return [];
      return unexpected('list '+collection);
    },
    async taskContext(projectId,options={}){check(options);inProject(projectId);return clone(tasks);},
    async viewSettings(projectId){inProject(projectId);return {estimateFormat:'time',hoursPerDay:8,hoursPerWeek:40};},
    subscribe(){return ()=>{};},
    async write(collection){return unexpected('write '+collection);},
    client:{async request(path,method='GET',_body,_key,signal){
      signal?.throwIfAborted();reads.push({operation:method,path});
      if(method==='GET'&&/^\/projects\/fixture-project\/tasks\/task-[12]\/work$/.test(path))
        return {workPlan:null,sessions:[],requests:[],permissions:{},events:{items:[],nextCursor:null}};
      return unexpected(method+' '+path);
    }},
    async listWikiPages(projectId,options={}){check(options);inProject(projectId);return [clone(page)];},
    async readWikiPage(projectId,id,options={}){
      check(options);inProject(projectId);if(id!==page.id)return unexpected('unknown wiki page');
      return clone(attempts.length?{...page,revision:2,body:'## Результат\n\nТекущий текст другого участника.'}:page);
    },
    async memberNames(projectId,options={}){check(options);inProject(projectId);return new Map([[person.id,clone(person)]]);},
    async listWikiBacklinks(projectId,_id,_cursor,options={}){check(options);inProject(projectId);return {items:[],nextCursor:null};},
    async listTaskWikiLinks(projectId,_id,options={}){check(options);inProject(projectId);return [];},
    async listTaskMaterials(_id,projectId,options={}){check(options);inProject(projectId);return [];},
    async putWikiPage(projectId,id,payload,options={}){
      check(options);inProject(projectId);if(id!==page.id)return unexpected('unknown wiki write');
      attempts.push({operation:'putWikiPage',id,baseRevision:payload.baseRevision,outcome:'synthetic-conflict-no-write'});
      throw Object.assign(Error('Синтетический конфликт версии: запись не выполнялась.'),{code:'CONFLICT'});
    },
  };
  return {repository,reads,unsupported,attempts};
}
