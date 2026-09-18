'use strict';
const {icon,escapeHTML:esc} = require('./components.js');
const {registerSideNavigation}=require('./side-navigation.js');
const previews={
 tasks:{label:'Мои задачи',eyebrow:'ЛИЧНАЯ РАБОТА',summary:'Ближайшие действия в ваших проектах.',items:['Проверить сценарий приглашения','Согласовать материалы выпуска','Подготовить цифровой паспорт'],href:'#workspace/tasks'},
 inbox:{label:'Входящие',eyebrow:'ТРЕБУЕТ ВНИМАНИЯ',summary:'Три события, к которым можно вернуться.',items:['Мария добавила материалы','Александр предложил правку','Описание релиза готово к проверке'],href:'#workspace/tasks'},
 plan:{label:'План',eyebrow:'СРОКИ И РЕЗУЛЬТАТЫ',summary:'Вся работа в календаре команды.',items:['12 сентября — приглашения','18 сентября — новый релиз','25 сентября — паспорт изделия'],href:'#workspace/plan'},
 release:{label:'Выпуск 2.4',eyebrow:'ПРОЕКТ',summary:'Общее пространство команды.',items:['6 задач в работе проекта','2 результата завершены','Материалы и обсуждение рядом'],href:'#workspace/board'},
 'release-board':{label:'Доска выпуска',eyebrow:'ПРОЕКТ / ВЫПУСК 2.4',summary:'Одна задача — одно актуальное состояние.',items:['Запланировано','В работе','На проверке'],href:'#workspace/board'},
 'release-files':{label:'Материалы',eyebrow:'ПРОЕКТ / ВЫПУСК 2.4',summary:'Документы, связанные с результатом.',items:['Описание релиза.pdf','Критерии готовности.txt','Визуальные материалы'],href:'#components/file-item'},
 system:{label:'Дизайн-система',eyebrow:'БИБЛИОТЕКА',summary:'Общие компоненты, примеры и правила.',items:['Действия и выбор','Содержание и состояния','Навигация и контекст'],href:'#components/button'},
 objects:{label:'Коллекция',eyebrow:'ПРОДУКТЫ',summary:'Цифровые паспорта физических изделий.',items:['Происхождение','Параметры','История обслуживания'],href:'#objects'},
 settings:{label:'Настройки',eyebrow:'РАБОЧЕЕ ПРОСТРАНСТВО',summary:'Доступ, личные предпочтения и уведомления.',items:['Участники и роли','Тема и плотность','Сохранение изменений'],href:'#components/drawer'}
};
class IqNavigationDemo extends HTMLElement {
 events;
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();
  this.innerHTML='<div class="side-demo"><iq-side-navigation active="tasks"></iq-side-navigation><section class="side-demo-content" aria-label="Содержимое выбранного раздела"></section></div>';
  this.draw('tasks');
  this.addEventListener('iq-navigate',e=>{e.preventDefault();this.draw(e.detail.id);},{signal:this.events.signal});
 }
 disconnectedCallback(){this.events?.abort();}
 draw(id){const data=previews[id]||previews.tasks,area=this.querySelector('.side-demo-content');
  area.innerHTML=`<span class="sample-overline">${data.eyebrow}</span><h3 aria-live="polite">${data.label}</h3><p>${data.summary}</p><div class="nav-demo-work">${data.items.map((label,i)=>`<div><span class="nav-demo-index">0${i+1}</span><span>${esc(label)}</span></div>`).join('')}</div><div class="nav-demo-bottom"><span class="iq-badge sample">Навигационный пример</span><a class="text-action" href="${data.href}">Открыть раздел ${icon('arrow',16)}</a></div>`;
 }
}
function installSideNavigationStory(){registerSideNavigation();if(!customElements.get('iq-navigation-demo'))customElements.define('iq-navigation-demo',IqNavigationDemo);const s=require('./stories.js').stories.find(s=>s.id==='sidebar');
 Object.assign(s,{description:'Рабочее пространство, разделы и проекты — в одной спокойной навигации.',demo:()=>'<iq-navigation-demo></iq-navigation-demo>',usage:'Разделы — настоящие ссылки с URL и aria-current. Проекты раскрываются отдельной кнопкой, поиск фильтрует названия. Навигация сворачивается в узкую панель со значками. В этом локальном образце переключение меняет соседнее содержимое; ссылка «Открыть раздел» ведёт в рабочий пример.',keyboard:'Tab — переход между ссылками и контролами. Enter — открыть. Escape в поиске — очистить запрос. При сворачивании фокус остаётся на кнопке.'});
}

exports.installSideNavigationStory=installSideNavigationStory;

