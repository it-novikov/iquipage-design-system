import {icon,esc,dialog} from '../src/ui.js';
/** Host-owned navigation. Guest state is an explicit demo, never an API permission. */
export function installNavigation({standalone=false,guest=false,readyToLeave=async()=>true}={}){
  const nav=document.querySelector('.platform-navigation'),global=document.querySelector('.platform-global');
  nav.innerHTML='<a href="#tasks">Доска задач</a><a href="#maps">Карты</a>';
  document.querySelector('.platform-brand').href=guest?'#landing':standalone?'#maps':'#tasks';
  document.querySelector('.platform-brand').setAttribute('aria-label',guest?'Sprintique — главная':standalone?'IQUIPAGE Maps — карты':'Sprintique — доска задач');
  global.insertAdjacentHTML('beforeend',`<a class="iq-btn ghost sm" id="settings-link" href="#settings" aria-label="Настройки проекта">${icon('settings',17)}<span>Настройки</span></a><button type="button" class="iq-btn ghost icon sm" id="profile" aria-label="Профиль"><span class="iq-avatar v1">ЛП</span></button>`);
  const leave=async()=>{if(!(await readyToLeave()))return;const next=new URL(location.href);next.searchParams.set('guest','1');next.hash='landing';location.assign(next);};
  document.querySelector('#profile').addEventListener('click',()=>dialog({title:'Локальный профиль',description:'Демонстрационный вход. Настоящую авторизацию предоставляет платформа.',body:`<p>Рабочие данные сохраняются независимо от демонстрационного входа.</p><button type="button" class="iq-btn secondary sm" data-demo-exit>Выйти из демонстрации</button>`,mount:el=>el.querySelector('[data-demo-exit]').addEventListener('click',leave)}));
  if(guest){document.querySelector('.platform-nav-row').hidden=true;global.hidden=true;}
}
export function renderLanding(root){
  root.dataset.section='landing';root.hidden=false;
  root.innerHTML=`<section class="host-landing"><span class="iq-badge outline">Демонстрационный экран</span><h1>От идеи — к результату.</h1><p>Задачи и карты в одном рабочем пространстве.</p><button type="button" class="iq-btn primary" data-demo-login>Открыть рабочее пространство ${icon('arrow',17)}</button><p class="iq-helper">В этой сборке вход имитируется. Учётная запись не создаётся.</p></section>`;
  root.querySelector('[data-demo-login]').addEventListener('click',()=>{const next=new URL(location.href);next.searchParams.delete('guest');next.hash='tasks';location.assign(next);});
}
