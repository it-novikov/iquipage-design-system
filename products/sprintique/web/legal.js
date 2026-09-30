import '@iquipage/web/styles.css';
import './legal.css';
import {appearance} from './appearance.js';

const preferences=appearance();
const contents=document.querySelector('[data-legal-contents]');
if(contents && matchMedia('(max-width:42rem)').matches)contents.removeAttribute('open');
const themeButton=document.querySelector('[data-legal-theme]');
if(themeButton){
  themeButton.hidden=false;
  const sync=()=>themeButton.setAttribute('aria-pressed',String(document.documentElement.dataset.theme==='dark'));
  themeButton.addEventListener('click',()=>{preferences.toggleTheme();sync();});
  window.addEventListener('sprintique-appearance-change',sync);
  sync();
}
