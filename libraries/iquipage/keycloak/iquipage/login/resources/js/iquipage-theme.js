/* Presentation only: Keycloak owns credentials, form actions and validation. */
let theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
try{const saved=localStorage.getItem('iquipage.theme');if(saved==='dark'||saved==='light')theme=saved;}catch{/* Storage can be unavailable. */}
document.documentElement.dataset.theme=theme;
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.createElement('button');button.type='button';button.className='iq-btn ghost iq-identity-theme';
 const label=()=>{const dark=document.documentElement.dataset.theme==='dark';button.textContent=dark?'Светлая тема':'Тёмная тема';};
 label();button.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('iquipage.theme',document.documentElement.dataset.theme);}catch{/* Preference only. */}label();};document.body.append(button);
});
