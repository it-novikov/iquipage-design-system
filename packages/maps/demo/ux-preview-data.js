import {createTask} from '/src/tasks.js';
/** Opt-in synthetic browser preview only. Never called with the HTTP repository. */
export async function seedUXPreview(repository,project){
  if((await repository.list('tasks',project.id)).length)return;
  const previewId=id=>id+'-'+project.id;
  const tags=[{id:previewId('ux-design'),name:'Дизайн',tone:'blue'},{id:previewId('ux-web'),name:'Web',tone:'green'},{id:previewId('ux-research'),name:'Исследование',tone:'neutral'},...['Android','iOS','Доступность','Аналитика','Интерфейс','Документация'].map((name,i)=>({id:previewId('ux-tag-'+i),name,tone:'neutral'}))];
  for(const tag of tags)if(!(await repository.read('tags',tag.id,project.id)))await repository.write('tags',{...tag,projectId:project.id,revision:0},0);
  const release={id:previewId('ux-release'),projectId:project.id,revision:0,name:'Сентябрь · 0.5',status:'planned',targetDate:null};
  if(!(await repository.read('releases',release.id,project.id)))await repository.write('releases',release,0);
  const entries=[
    ['Упростить первый запуск проекта','ready','Анна','high','ux-design'],
    ['Собрать обратную связь по новой доске','ready','Мария','normal','ux-research'],
    ['Проверить адаптивную форму задачи','in_progress','Дмитрий','normal','ux-web'],
    ['Уточнить тексты ошибок загрузки','in_progress','Анна','normal','ux-design'],
    ['Согласовать пустые состояния','review','Мария','normal','ux-design'],
    ['Сохранить выбранный порядок задач','ready_for_release','Дмитрий','normal','ux-web']
  ];
  for(const [index,[title,status,owner,priority,tagId]] of entries.entries()){
    const task=createTask({projectId:project.id,title,status,owner,priority,description:'## Результат\n\nСделать ежедневную работу понятнее и сохранить привычный визуальный стиль.\n\n## Проверить\n\nСветлую и тёмную темы, клавиатуру и узкий экран.'});
    await repository.write('tasks',{...task,displayId:'SPR-'+(241+index),tagIds:[previewId(tagId)],releaseId:release.id,...(index===0?{checklists:[{id:previewId('ux-checklist'),title:'Критерии готовности',items:[{id:previewId('ux-check-1'),text:'Основные действия доступны с клавиатуры',done:true},{id:previewId('ux-check-2'),text:'Состояния проверены в обеих темах',done:false}]}]}:{})},0);
  }
}
