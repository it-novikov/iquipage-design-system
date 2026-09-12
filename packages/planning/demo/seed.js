import {createTask} from '../../maps/src/tasks.js';
import {createMap} from '../../maps/src/model.js';
import {project} from './fixture-projection.js';
export async function seed(repository){
  const s=await repository.fixtureSnapshot();if(s._pnFixture.some(x=>x.id==='seeded'))return;
  const releases=[{id:'pn-release-current',name:'Первая публичная версия',planningPhase:'active',targetDate:'2026-09-30'},{id:'pn-release-next',name:'Командная работа',planningPhase:'planned',targetDate:'2026-10-16'},{id:'pn-release-later',name:'Что сделаем дальше',planningPhase:'planned',targetDate:null}];
  for(const r of releases)await repository.write('releases',{...r,projectId:project.id,status:'planned',planningFormat:'flexible',planningStart:r.targetDate?'2026-09-14':null,revision:0},0);
  const titles=['Подготовить публичную версию','Удобное создание проекта','Проверить восстановление после обрыва','Проверить доступность интерфейса','Разобрать обратную связь первых пользователей','Совместная работа над проектом','Пригласить участника в пространство','Показать историю изменений','Провести исследование задач команды','Ускорить открытие больших проектов','Собрать примеры для первого запуска','Уточнить текст пустых состояний'];
  for(let i=0;i<titles.length;i++){
    const parent=i>=1&&i<=4?'pn-task-1':i>=6&&i<=8?'pn-task-6':null;
    const releaseId=i<5?'pn-release-current':i<9?'pn-release-next':null;
    const task={...createTask({projectId:project.id,title:titles[i],type:i===0||i===5?'epic':i===2?'bug':'task',owner:['Анна Волкова','Марк Ли','Денис Соколов',''][i%4],priority:i===2?'critical':i===0?'high':'normal',status:i===1?'review':i===2?'testing':'ready'}),id:'pn-task-'+(i+1),parentId:parent,releaseId,releaseAssignment:parent?'inherit':releaseId?'assigned':'none',preparation:i===4||i===8||i===10?'draft':'ready',planningAdmission:i<4,description:'Рабочая задача проекта.\n\n- [ ] Уточнить результат\n- [ ] Проверить основной сценарий',planningRank:i*1024,planningStart:i<4?'2026-09-'+String(15+i*2):null,planningEnd:i<4?'2026-09-'+String(18+i*2):null};
    // One child is explicitly planned for a later release, without copying the task.
    if(i===4){task.releaseId='pn-release-next';task.releaseAssignment='assigned';}
    await repository.write('tasks',task,0);
  }
  const map=createMap({projectId:project.id,title:'Планируем следующий шаг',kind:'permanent'});await repository.write('maps',map,0);
  await repository.fixtureTransaction((_s,put)=>put('_pnFixture',{id:'seeded',version:1}));
}
