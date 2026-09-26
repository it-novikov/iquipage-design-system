import type pg from 'pg';
import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {hash,secret} from '../backend/infrastructure/database.js';
import {DEV_ISSUER,DEV_NAME,DEV_SUBJECT} from '../backend/http/dev-login.js';

/** Synthetic workspaces for local debugging. Every value is invented; nothing comes from real users. */
type Tone='neutral'|'blue'|'purple'|'green'|'amber'|'red';
type Status='ready'|'in_progress'|'review'|'ready_for_testing'|'testing'|'ready_for_release';
interface TaskSeed {id:string;title:string;status?:Status;priority?:'low'|'normal'|'high'|'critical';type?:'task'|'bug'|'epic';tags?:string[];owner?:string;due?:string;parent?:string;description?:string;release?:'active'|'planned'|'draft'}
interface ProjectSeed {name:string;key:string;members:[string,'editor'|'reader'][];tags:[string,string,Tone][];active?:string;planned?:string;tasks:TaskSeed[];map?:string}

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

export async function seedDevData(app:FastifyInstance,admin:pg.Client,origin:string){
  const principal=async(name:string,issuer:string,subject:string)=>(await admin.query<{id:string}>(`INSERT INTO auth.principals(id,kind,name,issuer,subject) VALUES($1,'human',$2,$3,$4)
    ON CONFLICT(issuer,subject) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[randomUUID(),name,issuer,subject])).rows[0]!.id;
  const adminId=await principal(DEV_NAME,DEV_ISSUER,DEV_SUBJECT);
  const people=new Map<string,string>();for(const name of TEAM)people.set(name,await principal(name,DEV_ISSUER,'mock:'+name));
  // A short-lived seeding session; the browser signs in separately through /auth/dev-login.
  const token=secret(),csrf=secret();
  await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '10 minutes')",[randomUUID(),adminId,hash(token),csrf]);
  const headers={cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf};
  const call=async<T=unknown>(method:'GET'|'POST'|'PUT',url:string,payload?:unknown):Promise<T>=>{
    const response=await app.inject({method,url:'/api/v1'+url,headers:{...headers,'idempotency-key':randomUUID()},...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
    if(response.statusCode>=300)throw Error(`${method} ${url} → ${response.statusCode} ${response.body.slice(0,300)}`);
    return response.json<T>();
  };
  const summary:string[]=[];
  for(const space of WORKSPACES){
    const workspace=await call<{id:string}>('POST','/workspaces',{name:space.name});
    for(const spec of space.projects){
      const project=await call<{id:string}>('POST','/projects',{workspaceId:workspace.id,name:spec.name,slug:spec.key.toLowerCase(),key:spec.key});
      const P=`/projects/${project.id}/`;
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
      const first=spec.tasks.find(t=>!t.release);
      if(first)await call('POST',P+`tasks/${first.id}/threads`,{id:randomUUID(),messageId:randomUUID(),body:'Нужно решить до пятницы: делаем сейчас или переносим в следующий релиз?',requiresResolution:true});
      summary.push(`${space.name} / ${spec.name} (${spec.key}): задач — ${spec.tasks.length}`);
    }
  }
  return {adminId,summary};
}
