import type pg from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {TestApp} from './support/kotlin-app.js';
import {DEV_ISSUER,DEV_NAME,DEV_SUBJECT} from './support/dev-login.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');

/** Synthetic workspaces for local debugging. Every value is invented; nothing comes from real users. */
type Tone='neutral'|'blue'|'purple'|'green'|'amber'|'red';
type Status='ready'|'in_progress'|'review'|'ready_for_testing'|'testing'|'ready_for_release';
interface TaskSeed {id:string;title:string;status?:Status;priority?:'low'|'normal'|'high'|'critical';type?:'task'|'bug'|'epic';tags?:string[];owner?:string;due?:string;parent?:string;description?:string;release?:'active'|'planned'|'draft'}
/** A ledger entry: amounts in kopecks (cents for USD); `voided` voids it after creation with that reason. */
interface FinanceSeed {id:string;direction:'income'|'expense';state:'planned'|'posted';amount:number;date:number;category:string;description:string;counterparty?:string;reference?:string;currency?:string;voided?:string}
interface ProjectSeed {name:string;key:string;members:[string,'editor'|'reader'][];tags:[string,string,Tone][];active?:string;planned?:string;tasks:TaskSeed[];map?:string;finance?:FinanceSeed[]}

const TEAM=['Алиса Смирнова','Борис Петров','Вера Козлова','Григорий Орлов'];
const day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);

const WORKSPACES:{name:string;projects:ProjectSeed[]}[]=[
  {name:'Команда продукта',projects:[
    {name:'Sprintique',key:'SPQ',members:[['Алиса Смирнова','editor'],['Борис Петров','editor'],['Вера Козлова','reader']],
      tags:[['design','Дизайн','purple'],['backend','Backend','blue'],['frontend','Frontend','green'],['urgent','Срочно','red'],['research','Исследование','amber'],['debt','Техдолг','neutral']],
      active:'Релиз 2.4',planned:'Релиз 2.5',map:'Ретро спринта',
      tasks:[
        {id:'spq-epic',title:'Эпик: совместная работа',type:'epic',status:'in_progress',owner:'Алиса Смирнова',description:'Родительская задача для совместных сценариев.'},
        {id:'spq-onboarding',title:'Упростить первый вход',status:'in_progress',priority:'high',tags:['design'],owner:'Алиса Смирнова',parent:'spq-epic',due:day(5),
          description:'## Цель\n\nНовый участник понимает продукт за минуту.\n\n### Приёмка\n\n- [x] Черновик сценария\n- [ ] Проверить на трёх людях'},
        {id:'spq-sync',title:'Синхронизация статусов в реальном времени',status:'review',priority:'critical',tags:['backend','urgent'],owner:'Борис Петров',parent:'spq-epic',description:'Проверить SSE при переподключении.'},
        {id:'spq-login-bug',title:'Ошибка при истёкшей сессии',type:'bug',status:'ready_for_testing',priority:'high',tags:['backend'],owner:'Борис Петров',due:day(2)},
        {id:'spq-dark',title:'Тёмная тема для карт',status:'testing',tags:['frontend','design'],owner:'Вера Козлова'},
        {id:'spq-a11y',title:'Проверка доступности с клавиатуры',status:'ready',priority:'high',tags:['frontend']},
        {id:'spq-notes',title:'Заметки к релизу 2.4',status:'ready_for_release',tags:['design'],owner:'Алиса Смирнова'},
        {id:'spq-export',title:'Экспорт карты в PNG',release:'active',tags:['frontend'],owner:'Вера Козлова'},
        {id:'spq-filters',title:'Сохранённые фильтры доски',release:'active',priority:'normal',tags:['frontend'],owner:'Алиса Смирнова',due:day(9)},
        {id:'spq-search',title:'Поиск по всем проектам',release:'planned',priority:'low',tags:['backend']},
        {id:'spq-palette',title:'Палитра команд',release:'planned',tags:['frontend','research']},
        {id:'spq-audit',title:'Журнал действий в настройках',release:'planned',tags:['backend']},
        {id:'spq-cleanup',title:'Удалить устаревшие миграции',release:'draft',tags:['debt'],priority:'low'},
        {id:'spq-perf',title:'Ускорить загрузку планирования',release:'draft',tags:['backend','research'],owner:'Борис Петров'}
      ],
      finance:[
        {id:'fin-advance',direction:'income',state:'posted',amount:45000000,date:-15,category:'Оплата заказчика',description:'Аванс по договору',counterparty:'АО «Заказчик»',reference:'Договор 17/2026'},
        {id:'fin-hosting',direction:'expense',state:'posted',amount:1250000,date:-20,category:'Хостинг',description:'Серверы за месяц',counterparty:'ООО «Облако»',reference:'Счёт 1042'},
        {id:'fin-hosting-copy',direction:'expense',state:'posted',amount:1250000,date:-19,category:'Хостинг',description:'Серверы за месяц',counterparty:'ООО «Облако»',voided:'Платёж внесён дважды'},
        {id:'fin-design',direction:'expense',state:'posted',amount:9000000,date:-6,category:'Подрядчики',description:'Дизайн экранов онбординга',counterparty:'ИП Соколова'},
        {id:'fin-conference',direction:'expense',state:'posted',amount:35000,currency:'USD',date:-10,category:'Конференции',description:'Билет на конференцию'},
        {id:'fin-licenses',direction:'expense',state:'planned',amount:2400000,date:-2,category:'Лицензии',description:'Продление лицензий IDE'},
        {id:'fin-stage-two',direction:'income',state:'planned',amount:60000000,date:12,category:'Оплата заказчика',description:'Второй этап',counterparty:'АО «Заказчик»'}
      ]},
    {name:'Мобильное приложение',key:'MOB',members:[['Григорий Орлов','editor'],['Алиса Смирнова','reader']],
      tags:[['ios','iOS','blue'],['android','Android','green'],['crash','Сбой','red']],
      tasks:[
        {id:'mob-push',title:'Push-уведомления о назначении',status:'in_progress',tags:['ios','android'],owner:'Григорий Орлов'},
        {id:'mob-crash',title:'Сбой при повороте экрана',type:'bug',status:'ready',priority:'critical',tags:['android','crash']},
        {id:'mob-offline',title:'Офлайн-режим доски',status:'ready',priority:'normal',tags:['ios']},
        {id:'mob-store',title:'Скриншоты для магазина',status:'review',owner:'Григорий Орлов'}
      ]}
  ]},
  {name:'Маркетинг',projects:[
    {name:'Сайт и запуск',key:'WEB',members:[['Вера Козлова','editor']],
      tags:[['copy','Тексты','amber'],['visual','Визуал','purple']],map:'Структура лендинга',
      tasks:[
        {id:'web-hero',title:'Первый экран лендинга',status:'in_progress',priority:'high',tags:['copy','visual'],owner:'Вера Козлова',due:day(3)},
        {id:'web-pricing',title:'Страница тарифов',status:'ready',tags:['copy']},
        {id:'web-press',title:'Пресс-кит',status:'ready',priority:'low',tags:['visual']}
      ]},
    {name:'Исследования',key:'RSR',members:[['Алиса Смирнова','editor']],tags:[['interview','Интервью','blue']],
      tasks:[
        {id:'rsr-plan',title:'План интервью с командами',status:'ready',tags:['interview'],owner:'Алиса Смирнова'},
        {id:'rsr-synth',title:'Синтез результатов',status:'ready',priority:'normal'}
      ]}
  ]},
  {name:'Личное пространство',projects:[
    {name:'Идеи',key:'IDEA',members:[],tags:[],tasks:[{id:'idea-1',title:'Шаблоны для ретроспектив',status:'ready'}]}
  ]}
];

export async function seedDevData(app:TestApp,admin:pg.Client,origin:string){
  const principal=async(name:string,issuer:string,subject:string)=>(await admin.query<{id:string}>(`INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,$3,$4)
    ON CONFLICT(issuer,subject) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[randomUUID(),name,issuer,subject])).rows[0]!.id;
  const adminId=await principal(DEV_NAME,DEV_ISSUER,DEV_SUBJECT);
  const people=new Map<string,string>();for(const name of TEAM)people.set(name,await principal(name,DEV_ISSUER,'mock:'+name));
  // A short-lived seeding session; the browser signs in separately through /auth/dev-login.
  const token=secret(),csrf=secret();
  await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '10 minutes')",[randomUUID(),adminId,hash(token),csrf]);
  const headers={cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf};
  const call=async<T=unknown>(method:'GET'|'POST'|'PUT'|'PATCH',url:string,payload?:unknown):Promise<T>=>{
    const response=await app.inject({method,url:'/api/v1'+url,headers:{...headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
    if(response.statusCode>=300)throw Error(`${method} ${url} → ${response.statusCode} ${response.body.slice(0,300)}`);
    return response.json<T>();
  };
  const summary:string[]=[];const projectIds=new Map<string,string>();
  for(const space of WORKSPACES){
    const workspace=await call<{id:string}>('POST','/workspaces',{name:space.name});
    for(const spec of space.projects){
      const project=await call<{id:string}>('POST','/projects',{workspaceId:workspace.id,name:spec.name,slug:spec.key.toLowerCase(),key:spec.key});
      const P=`/projects/${project.id}/`;projectIds.set(spec.key,project.id);
      for(const [name,role] of spec.members){
        await admin.query("INSERT INTO app.workspace_members(workspace_id,principal_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[workspace.id,people.get(name)]);
        await admin.query('INSERT INTO app.project_members(project_id,principal_id,role) VALUES($1,$2,$3)',[project.id,people.get(name),role]);
      }
      for(const [id,name,tone] of spec.tags)await call('PUT',P+'tags/'+id,{baseRevision:0,value:{name,tone}});
      const release=async(id:string,name:string,start:number,end:number)=>{await call('PUT',P+'planning/releases/'+id,{baseRevision:0,value:{name,format:'timeboxed',plannedStart:day(start),plannedEnd:day(end),deadline:day(end)}});return id;};
      const active=spec.active?await release('active',spec.active,-5,9):null,planned=spec.planned?await release('planned',spec.planned,10,24):null;
      for(const t of spec.tasks){
        const task={title:t.title,status:t.status||'ready',priority:t.priority||'normal',type:t.type||'task',tagIds:t.tags||[],description:t.description||'',
          ownerId:t.owner?(t.owner==='admin'?adminId:people.get(t.owner)!):null,due:t.due||null,parentId:t.parent||null};
        await call('PUT',P+'tasks/'+t.id,{baseRevision:0,createInBoard:!t.release,task});
      }
      const plan=async(command:unknown)=>{const preview=await call<{id:string;token:string}>('POST',P+'planning/previews',command);await call('POST',P+'planning/commands',{planId:preview.id,token:preview.token});};
      const ids=(kind:TaskSeed['release'])=>spec.tasks.filter(t=>t.release===kind).map(t=>t.id);
      for(const [kind,releaseId] of [['active',active],['planned',planned]] as const){
        if(!releaseId||!ids(kind).length)continue;
        const selection={kind:'tasks',ids:ids(kind)};
        await plan({kind:'prepare',selection,preparation:'ready'});
        await plan({kind:'assign',selection,assignment:{mode:'assigned',releaseId}});
      }
      if(active)await plan({kind:'start',releaseId:active});
      if(spec.map){
        const obj=(id:string,type:string,text:string,x:number,y:number,extra:Record<string,unknown>={})=>({id,type,text,x,y,width:type==='frame'?520:200,height:type==='frame'?320:140,color:'sand',...extra});
        await call('PUT',P+'maps/map-main',{baseRevision:0,value:{title:spec.map,kind:'permanent',status:'active',summary:'Пример карты для отладки',document:{schema:'iquipage.whiteboard/1',title:spec.map,revision:0,
          objects:[obj('f1','frame','Что сработало',0,0),obj('s1','sticky','Быстрые ревью',30,60,{parentId:'f1'}),obj('s2','sticky','Понятный Гант',260,60,{parentId:'f1',color:'mint'}),
            obj('f2','frame','Что улучшить',600,0),obj('s3','sticky','Долгие сборки CI',630,60,{parentId:'f2',color:'rose'}),obj('k1','task','Ускорить CI',860,60,{parentId:'f2'})],
          connections:[{id:'c1',from:'s3',to:'k1',arrow:true}]}}});
      }
      // Categories are the project's own list: one per name, of the direction its entries have.
      const categoryIds=new Map<string,string>();
      for(const entry of spec.finance||[]){
        if(categoryIds.has(entry.category))continue;
        const id='cat-'+(categoryIds.size+1);categoryIds.set(entry.category,id);
        await call('PUT',P+'finance-categories/'+id,{baseRevision:0,value:{name:entry.category,direction:entry.direction}});
      }
      for(const entry of spec.finance||[]){
        const date=day(entry.date),value={direction:entry.direction,state:entry.state,amountMinor:entry.amount,currencyCode:entry.currency||'RUB',
          dueDate:entry.state==='planned'?date:null,postedDate:entry.state==='posted'?date:null,categoryId:categoryIds.get(entry.category),description:entry.description,
          counterparty:entry.counterparty||null,reference:entry.reference||null};
        const saved=await call<{revision:number}>('PUT',P+'finance-entries/'+entry.id,{baseRevision:0,value});
        if(entry.voided)await call('PATCH',P+`finance-entries/${entry.id}/state`,{state:'voided',baseRevision:saved.revision,voidReason:entry.voided});
      }
      const first=spec.tasks.find(t=>!t.release);
      if(first)await call('POST',P+`tasks/${first.id}/threads`,{id:randomUUID(),messageId:randomUUID(),body:'Нужно решить до пятницы: делаем сейчас или переносим в следующий релиз?',requiresResolution:true});
      summary.push(`${space.name} / ${spec.name} (${spec.key}): задач — ${spec.tasks.length}`);
    }
  }
  await seedWorkbench(app,admin,origin,{adminId,people,projectIds,call});
  summary.push('Рабочий стол: запросы всех видов, «В работе», «Жду», «Наблюдаю», изменения и неделя для администратора');
  return {adminId,summary};
}

/**
 * The administrator's Workbench (docs/workbench/design-v2.md §11): requests of every kind from teammates, active work,
 * work delegated to others ("Жду"), tasks the administrator participates in, colleagues' news, dates of the week.
 */
async function seedWorkbench(app:TestApp,admin:pg.Client,origin:string,{adminId,people,projectIds,call}:{adminId:string;people:Map<string,string>;
  projectIds:Map<string,string>;call:<T=unknown>(method:'GET'|'POST'|'PUT'|'PATCH',url:string,payload?:unknown)=>Promise<T>}){
  const as=async(name:string)=>{
    const id=people.get(name)!,token=secret(),csrf=secret();
    await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '10 minutes')",[randomUUID(),id,hash(token),csrf]);
    const headers={cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf};
    return async<T=any>(method:'GET'|'POST'|'PUT'|'PATCH',url:string,payload?:unknown):Promise<T>=>{
      const response=await app.inject({method,url:'/api/v1'+url,headers:{...headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
      if(response.statusCode>=300)throw Error(`${method} ${url} → ${response.statusCode} ${response.body.slice(0,300)}`);
      return response.json<T>();
    };
  };
  type Caller=(method:'GET'|'POST'|'PUT'|'PATCH',url:string,payload?:unknown)=>Promise<any>;
  const P=(key:string)=>`/projects/${projectIds.get(key)}/`;
  const edit=async(caller:Caller,key:string,id:string,changes:Record<string,unknown>)=>{
    const t=await caller('GET',P(key)+'tasks/'+id);
    const task={title:t.title,description:t.description,status:t.status,type:t.type,priority:t.priority,ownerId:t.ownerId,due:t.due,rank:t.rank,parentId:t.parentId,
      releaseId:t.releaseId,tagIds:t.tagIds,attachmentIds:t.attachmentIds??[],coverAttachmentId:t.coverAttachmentId??null,coverCrop:t.coverCrop??null,...changes};
    return caller('PUT',P(key)+'tasks/'+id,{baseRevision:t.revision,task});
  };
  const me=call as unknown as Caller;
  const participate=async(key:string,id:string)=>{const s=await me('GET',P(key)+`tasks/${id}/personal`);if(!s.participating)await me('PUT',P(key)+`tasks/${id}/personal/participation`,{baseRevision:s.participationRevision,participating:true});};
  const boris=await as('Борис Петров'),vera=await as('Вера Козлова'),grigory=await as('Григорий Орлов'),alice=await as('Алиса Смирнова');
  // «В работе»: assigned to the administrator in active stages, with dates and one blocked.
  await edit(me,'SPQ','spq-a11y',{ownerId:adminId,status:'in_progress',due:day(1)});
  await edit(me,'RSR','rsr-synth',{ownerId:adminId,status:'review'});
  await admin.query('UPDATE app.tasks SET planned_start=$3,planned_end=$4 WHERE project_id=$1 AND id=$2',[projectIds.get('RSR'),'rsr-synth',day(0),day(2)]);
  await edit(me,'WEB','web-pricing',{ownerId:adminId,status:'testing',due:day(4)});
  await edit(me,'SPQ','spq-search',{ownerId:adminId,status:'in_progress'});
  await boris('PUT',P('SPQ')+'task-links/wb-block',{baseRevision:0,value:{kind:'depends',fromId:'spq-search',toId:'spq-perf'}});
  // «Жду»: the administrator assigns work to colleagues (participating as the author or by joining).
  await participate('SPQ','spq-dark');await edit(me,'SPQ','spq-dark',{ownerId:people.get('Вера Козлова')});
  await participate('MOB','mob-offline');await edit(me,'MOB','mob-offline',{ownerId:people.get('Григорий Орлов')});
  const dark=await me('GET',P('SPQ')+'tasks/spq-dark/personal');await me('PUT',P('SPQ')+'tasks/spq-dark/personal/check-back',{baseRevision:dark.checkBackRevision,checkBackAt:day(0)});
  await participate('SPQ','spq-cleanup');await edit(me,'SPQ','spq-cleanup',{ownerId:people.get('Борис Петров')});
  await edit(boris,'SPQ','spq-cleanup',{status:'ready_for_release'});
  // «Наблюдаю»: tasks the administrator keeps on the Workbench.
  for(const [key,id] of [['SPQ','spq-onboarding'],['SPQ','spq-palette'],['WEB','web-press'],['IDEA','idea-1']] as const)await participate(key,id);
  // Requests of every kind, exact recipient.
  await boris('POST',P('SPQ')+'tasks/spq-sync/requests',{id:randomUUID(),recipientId:adminId,kind:'review',neededBy:day(1),note:'Проверь, пожалуйста, переподключение SSE.'});
  await vera('POST',P('WEB')+'tasks/web-hero/requests',{id:randomUUID(),recipientId:adminId,kind:'decision',neededBy:day(3),note:'Какой вариант первого экрана берём?'});
  await grigory('POST',P('MOB')+'tasks/mob-crash/requests',{id:randomUUID(),recipientId:adminId,kind:'answer'});
  const late=await alice('POST',P('SPQ')+'tasks/spq-export/requests',{id:randomUUID(),recipientId:adminId,kind:'do',neededBy:day(1),note:'Нужен ключ доступа к песочнице.'});
  // A request whose date has already passed (a new one cannot be dated in the past).
  await admin.query('UPDATE app.attention_requests SET needed_by=$3 WHERE project_id=$1 AND id=$2',[projectIds.get('SPQ'),late.id,day(-2)]);
  await boris('POST',P('SPQ')+'tasks/spq-login-bug/requests',{id:randomUUID(),recipientId:adminId,kind:'review'});
  // News from colleagues on tasks the administrator participates in.
  await edit(alice,'SPQ','spq-onboarding',{due:day(8)});
  await edit(vera,'WEB','web-press',{status:'in_progress'});
  await edit(grigory,'MOB','mob-offline',{status:'in_progress'});
  await participate('SPQ','spq-notes');await edit(alice,'SPQ','spq-notes',{status:'testing'});await edit(alice,'SPQ','spq-notes',{status:'ready_for_release'});
  await admin.query("INSERT INTO app.milestones(project_id,id,title,date) VALUES($1,'beta','Бета для команд',$2) ON CONFLICT DO NOTHING",[projectIds.get('SPQ'),day(4)]);
}
