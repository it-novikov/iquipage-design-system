/** Settings sections by scope. Ids are the deep links (#settings/<id>) and stay stable when labels change. */
export const settingsGroups=[
 {id:'personal',label:'Для меня',items:[
  {id:'account',label:'Профиль',icon:'user',description:'Так вас видят в задачах, обсуждениях и списке участников.',keywords:'имя профиль роль мой фото подтверждения релиз спрашивать'},
  {id:'notifications',label:'Уведомления',icon:'bell',description:'Колокольчик в шапке показывает то, что ждёт вашего действия. Здесь же почта и Telegram.',keywords:'уведомления колокольчик почта письма email telegram телеграм бот упоминания назначения запросы сроки отписаться'},
  {id:'appearance',label:'Внешний вид',icon:'sun',description:'Только для вас и только в этом браузере. Изменения применяются сразу.',keywords:'тема тёмная светлая акцент цвет плотность анимация'},
  {id:'service-accounts',label:'Сервисные аккаунты',icon:'bolt',description:'Приложения и скрипты работают как сервисный аккаунт, не от вашего имени: Claude, MCP-клиенты, токены API.',keywords:'api mcp claude токен коннектор приложение oauth доступ приложений сервисный аккаунт робот скрипт'}]},
 {id:'project',label:'Проект',items:[
  {id:'profile',label:'О проекте',icon:'folder',description:'Название и ссылки на задачи. Видят все участники проекта.',keywords:'название префикс адрес ссылка'},
  {id:'members',label:'Участники',icon:'users',description:'Кто работает в проекте и какие у кого права.',keywords:'команда роли пресет права приглашение ссылка'},
  {id:'access',label:'Доступ',icon:'lock',description:'Пресеты для новых участников и отличия от пресетов в этом проекте.',keywords:'доступ права пресет матрица администратор переопределение'},
  {id:'tags',label:'Теги',icon:'palette',description:'Общие метки проекта: имя и цвет меняются сразу во всех задачах.',keywords:'теги метки цвета'},
  {id:'templates',label:'Шаблоны задач',icon:'file',description:'С какого описания начинаются новые задачи, баги и эпики.',keywords:'шаблон описание баг эпик критерии'},
  {id:'planning',label:'Спринты и релизы',icon:'calendar',description:'Как проект планирует работу: формат, длительность и часовой пояс новых релизов.',keywords:'планирование спринт релиз длительность часовой пояс'},
  {id:'agents',label:'Агенты',icon:'spark',description:'Внешние агенты с ограниченным доступом. Их изменения применяются только после решения человека.',keywords:'агент api токен секрет доступ предложения запуски'},
  {id:'operations',label:'Очистка файлов',icon:'refresh',needs:'project.access',description:'Удалённые файлы и незавершённые загрузки очищаются автоматически.',keywords:'фоновые операции файлы очистка'}]},
 {id:'workspace',label:'Пространство',items:[
  {id:'workspace',label:'О пространстве',icon:'grid',description:'Пространство объединяет проекты и людей.',keywords:'общие настройки название часовой пояс'},
  {id:'workspace-members',label:'Участники пространства',icon:'users',workspaceNeeds:'workspace.people',description:'Роль в пространстве не даёт доступа к задачам: он выдаётся в настройках проекта.',keywords:'пространство участники роли гости владелец'},
  {id:'presets',label:'Пресеты прав',icon:'sliders',description:'Наборы прав, с которых начинается доступ человека в проекте.',keywords:'пресет права роли редактор наблюдатель гость'},
  {id:'invitations',label:'Приглашения',icon:'send',workspaceNeeds:'workspace.invite',description:'Кого позвали в пространство и что с письмами. Ссылки не хранятся: повторно показать их нельзя.',keywords:'приглашение письмо почта ссылка'}]}
];
/** Sections follow permissions: `needs` — in the project, `workspaceNeeds` — in the workspace. The API checks again. */
export function visibleSettingsGroups(permissions=[],workspacePermissions=[]){const own=new Set(permissions),space=new Set(workspacePermissions);return settingsGroups.map(g=>({...g,items:g.items.filter(i=>(!i.needs||own.has(i.needs))&&(!i.workspaceNeeds||space.has(i.workspaceNeeds)))}));}
export function settingsSection(hash,permissions=[],workspacePermissions=[]){const match=String(hash).match(/^#settings\/([a-z-]+)$/);return visibleSettingsGroups(permissions,workspacePermissions).flatMap(g=>g.items).some(i=>i.id===match?.[1])?match[1]:'appearance';}
/** Search matches names, descriptions and keywords (including former names). */
export function filterSettingsGroups(groups,query){const q=String(query).toLocaleLowerCase('ru').trim();if(!q)return groups;return groups.map(g=>({...g,items:g.items.filter(i=>[i.label,i.description,i.keywords||''].join(' ').toLocaleLowerCase('ru').includes(q))})).filter(g=>g.items.length);}
/** A project role derived by the server from permissions, named as the preset it matches. */
export const roleName=value=>({admin:'Администратор',editor:'Редактор',reader:'Наблюдатель'})[value]||value;
export const workspaceRoleName=value=>({owner:'Владелец',admin:'Администратор',member:'Участник',guest:'Гость'})[value]||value;
