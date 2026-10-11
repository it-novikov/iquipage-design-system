import {randomUUID,randomBytes,createHash} from 'node:crypto';
import type {TestApp} from './support/kotlin-app.js';
import type pg from 'pg';

/** Synthetic documentation for manual browser acceptance; no production access. */
export async function seedWikiPreview(app:TestApp,admin:pg.Client,actorId:string,origin:string){
  const project=(await admin.query("SELECT id FROM app.projects WHERE key='SPQ'")).rows[0].id;
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  await admin.query("INSERT INTO auth.credentials(id,principal_id,token_hash,kind,csrf,initiator_id,expires_at) VALUES($1,$2,$3,'session',$4,$2,now()+interval '15 minutes')",[randomUUID(),actorId,createHash('sha256').update(token).digest('hex'),csrf]);
  const headers={cookie:`__Host-sprintique=${token}`,origin,'x-csrf-token':csrf};
  const put=async(id:string,revision:number,title:string,body:string,parentId:string|null=null,archived=false)=>{
    const r=await app.inject({method:'PUT',url:`/api/v1/projects/${project}/wiki/${id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{baseRevision:revision,value:{title,body,parentId,archived}}});
    if(r.statusCode!==200)throw Error(r.body);return r.json().revision as number;
  };
  const body='# Начало работы\n\nДокументация проекта содержит принятые решения и рабочие инструкции.\n\n## Подготовка\n\n1. Откройте задачу.\n2. Уточните ожидаемый результат.\n3. Сохраните проверенное решение.\n\n[Пример ссылки](https://example.com/docs)\n\n```js\nconst answer = 42;\n```\n\n| Этап | Результат |\n| --- | --- |\n| Исследование | Понятные требования |\n| Проверка | Воспроизводимый сценарий |\n\n';
  await put('wiki-start',0,'Начало работы',body.repeat(3));
  await put('wiki-process',0,'Процесс работы','## Работа над задачей\n\nСохраняйте собственный текст и проверяйте изменения.','wiki-start');
  await put('wiki-decisions',0,'Решения проекта','## Решения\n\nЗдесь собраны проверенные договорённости.');
  let revision=0;for(let i=0;i<55;i++)revision=await put('wiki-history',revision,'История документа',`## Версия ${i+1}\n\nТекст версии ${i+1}.`);
  await put('wiki-archived',0,'Прежняя инструкция','Архивная инструкция.');await put('wiki-archived',1,'Прежняя инструкция','Архивная инструкция.',null,true);
  for(let i=0;i<53;i++)await put('wiki-search-'+String(i).padStart(2,'0'),0,`Справочник ${i+1}`,'Уникальный поиск по справочнику.');
  for(const task of ['spq-onboarding','spq-sync']){
    const r=await app.inject({method:'PUT',url:`/api/v1/projects/${project}/tasks/${task}/wiki-links/wiki-start`,headers:{...headers,'idempotency-key':randomUUID()},payload:{baseRevision:0,archived:false}});
    if(r.statusCode!==200)throw Error(r.body);
  }
  return project;
}
