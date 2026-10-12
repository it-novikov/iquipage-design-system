// Only public exact-package CSS and API. No product style or private component override.
import '@iquipage/web/styles.css';
import {registerCore,ui,version} from '@iquipage/web/core';
const params=new URLSearchParams(location.search);
Object.assign(document.documentElement.dataset,{theme:params.get('theme')||'light',density:params.get('density')||'comfortable'});
document.documentElement.style.fontSize=params.get('text')==='200'?'200%':'100%';
registerCore();
document.querySelector('#short-tabs').innerHTML=ui.tabs([
  {key:'task',label:'Задача',body:'Содержимое задачи'},
  {key:'work',label:'Работа агента',body:'Содержимое работы агента'},
],'label="Разделы задачи" value="task"');
document.querySelector('#long-tabs').innerHTML=ui.tabs([
  {key:'overview',label:'Обзор результата',body:'Обзор'},
  {key:'history',label:'История изменений',body:'История'},
  {key:'unavailable',label:'Недоступный раздел',body:'Недоступно'},
  {key:'materials',label:'Связанные материалы',body:'Материалы'},
  {key:'discussion',label:'Проверка и обсуждение',body:'Обсуждение'},
],'label="Длинные вкладки" value="overview"');
document.querySelector('[data-tab="unavailable"]').disabled=true;
const changes=[];
document.addEventListener('iq-change',event=>{if(event.target.matches('iq-tabs'))changes.push({label:event.target.getAttribute('label'),value:event.detail.value});});
await document.fonts.ready;
window.tabsGeometryProbe={ready:true,version,changes,unsupported:[],attempts:[]};
