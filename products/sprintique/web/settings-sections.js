/** Settings sections by scope. Ids are the deep links (#settings/<id>) and stay stable when labels change. */
export const settingsGroups=[
 {id:'personal',label:'Для меня',items:[
  {id:'account',label:'Профиль',icon:'user',description:'Так вас видят в задачах, обсуждениях и списке участников.',keywords:'имя профиль роль мой'},
  {id:'appearance',label:'Внешний вид',icon:'sun',description:'Только для вас и только в этом браузере. Изменения применяются сразу.',keywords:'тема тёмная светлая акцент цвет плотность анимация'},
  {id:'service-accounts',label:'Сервисные аккаунты',icon:'bolt',description:'Приложения и скрипты работают как сервисный аккаунт, не от вашего имени: Claude, MCP-клиенты, токены API.',keywords:'api mcp claude токен коннектор приложение oauth доступ приложений сервисный аккаунт робот скрипт'}]},
 {id:'project',label:'Проект',items:[
  {id:'profile',label:'О проекте',icon:'folder',description:'Название, аватар и ссылки на задачи. Видят все участники проекта.',keywords:'название аватар префикс адрес ссылка'},
  {id:'members',label:'Участники',icon:'users',description:'Кто работает в проекте и что может делать.',keywords:'команда роли приглашение ссылка доступ'},
  {id:'tags',label:'Теги',icon:'palette',description:'Общие метки проекта: имя и цвет меняются сразу во всех задачах.',keywords:'теги метки цвета'},
  {id:'templates',label:'Шаблоны задач',icon:'file',description:'С какого описания начинаются новые задачи, баги и эпики.',keywords:'шаблон описание баг эпик критерии'},
  {id:'planning',label:'Спринты и релизы',icon:'calendar',description:'Как проект планирует работу: формат, длительность и часовой пояс новых релизов.',keywords:'планирование спринт релиз длительность часовой пояс'},
  {id:'agents',label:'Агенты',icon:'spark',description:'Внешние агенты с ограниченным доступом. Их изменения применяются только после решения человека.',keywords:'агент api токен секрет доступ предложения запуски'},
  {id:'operations',label:'Очистка файлов',icon:'refresh',admin:true,description:'Удалённые файлы и незавершённые загрузки очищаются автоматически.',keywords:'фоновые операции файлы очистка'}]},
 {id:'workspace',label:'Пространство',items:[
  {id:'workspace',label:'О пространстве',icon:'grid',description:'Пространство объединяет проекты и людей.',keywords:'общие настройки название часовой пояс'},
  {id:'workspace-members',label:'Участники пространства',icon:'users',workspaceAdmin:true,description:'Роль в пространстве не даёт доступа к задачам: он выдаётся в настройках проекта.',keywords:'пространство участники роли'}]}
];
export function visibleSettingsGroups(role,workspaceRole=''){return settingsGroups.map(g=>({...g,items:g.items.filter(i=>(!i.admin||role==='admin')&&(!i.workspaceAdmin||workspaceRole==='admin'))}));}
export function settingsSection(hash,role,workspaceRole=''){const match=String(hash).match(/^#settings\/([a-z-]+)$/);return visibleSettingsGroups(role,workspaceRole).flatMap(g=>g.items).some(i=>i.id===match?.[1])?match[1]:'appearance';}
/** Search matches names, descriptions and keywords (including former names). */
export function filterSettingsGroups(groups,query){const q=String(query).toLocaleLowerCase('ru').trim();if(!q)return groups;return groups.map(g=>({...g,items:g.items.filter(i=>[i.label,i.description,i.keywords||''].join(' ').toLocaleLowerCase('ru').includes(q))})).filter(g=>g.items.length);}
export const projectRoles=[['reader','Наблюдатель','Читает задачи, карты и обсуждения.'],['editor','Участник','Создаёт и меняет задачи и карты, решает по предложениям агентов.'],['admin','Администратор','Управляет доступом, тегами, шаблонами, планированием и агентами.']];
export const roleName=value=>projectRoles.find(r=>r[0]===value)?.[1]||value;
export const workspaceRoleName=value=>value==='admin'?'Администратор':'Участник';
