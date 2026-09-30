import {icon,enhance,escapeHTML as esc} from '@iquipage/web/core';
import {input,select} from '../ui/src/ui.js';
import * as s from './settings-ui.js';

// The consent screen of the OAuth flow (/oauth/authorize): an app such as Claude asks for access. It never acts as the
// person: the person picks one of their service accounts or makes a new one (a workspace and projects, never above
// their own role), sees the app's own name (as the app declared it), where the answer goes and what it may do, and
// can allow only reading. The server re-checks the whole request on the decision; this page never redirects to the app
// on its own, except with the answer the person chose.
const PENDING_KEY='sprintique.pending-authorization';
const SCOPES=[
  ['read','Читать','Задачи с обсуждениями, релизы, вехи и карты — только в проектах сервисного аккаунта.',true],
  ['write','Изменять','Создавать и менять задачи, менять статус, писать комментарии — в пределах прав аккаунта.',false]
];

/** Keeps the authorization request across the sign-in, whichever way it goes. */
export function keepAuthorization(){
  if(location.pathname==='/oauth/authorize'&&location.search.length>1)sessionStorage.setItem(PENDING_KEY,location.search);
}

/** After sign-in: back to the consent screen the person came from. Only a query string is ever restored. */
export function resumeAuthorization(){
  const pending=sessionStorage.getItem(PENDING_KEY);sessionStorage.removeItem(PENDING_KEY);
  if(!pending||!/^\?[\x21-\x7e]{1,4000}$/.test(pending)||location.pathname==='/oauth/authorize')return false;
  location.replace('/oauth/authorize'+pending);return true;
}

export async function mountConsent(root,{client,session}){
  const request=location.search.slice(1);
  sessionStorage.removeItem(PENDING_KEY);
  root.innerHTML=`<iq-auth-screen product="Sprintique" heading="Доступ для приложения" description="Проверяем запрос приложения…"
      context-title="Приложение будет работать как сервисный аккаунт."
      context-description="Не от вашего имени: у аккаунта свои проекты и роли, не больше ваших, а в истории видно, что сделал он. Отключить приложение или удалить аккаунт можно в любой момент: Настройки → Сервисные аккаунты.">
    <div slot="form" class="consent" data-consent></div>
  </iq-auth-screen>`;
  const screen=root.querySelector('iq-auth-screen'),body=root.querySelector('[data-consent]');
  const fail=(message,back)=>{
    screen.setAttribute('description','Приложение не получит доступ.');screen.setAttribute('error',message);
    let host='';try{host=new URL(back).host;}catch{back=null;}
    body.innerHTML=back?`<a class="iq-btn secondary lg" href="${esc(back)}" rel="noreferrer">Вернуться на ${esc(host)}</a>`:`<a class="iq-btn secondary lg" href="/">Открыть Sprintique</a>`;
  };
  let described;
  try{described=await client.request('/oauth/authorization?request='+encodeURIComponent(request));}
  catch(error){fail(error.message||'Запрос приложения некорректен.',error.action?.redirectTo);return;}
  const app=described.client,requested=new Set(described.scopes);
  screen.setAttribute('heading',`Разрешить доступ «${app.name}» с ${app.redirectHost}?`);
  screen.setAttribute('description',`Название указало само приложение. После ответа вы вернётесь на ${app.redirectHost}.`);
  const own=described.serviceAccounts||[],workspaces=described.workspaces||[];
  const preferred=own.find(a=>a.id===described.connectedAs)?.id||own[0]?.id||'new';
  const accountOptions=[...own.map(a=>[a.id,a.name,`${a.workspaceName} · проектов: ${a.projects}`]),['new','Новый сервисный аккаунт','Создадим его сейчас; управлять им будете вы']];
  body.innerHTML=`<form class="consent-form" novalidate>
    <dl class="consent-facts">
      <div><dt>Владелец</dt><dd>${esc(session.principal.name)}</dd></div>
      <div><dt>Адрес возврата</dt><dd><code>${esc(app.redirectUri)}</code></dd></div>
      ${described.connected?'<div><dt>Уже подключено</dt><dd>Новый доступ заменит прежний: старые токены приложения перестанут работать.</dd></div>':''}
    </dl>
    ${s.choiceList('account','Приложение будет работать как сервисный аккаунт',accountOptions,preferred)}
    <div class="consent-new" data-new hidden>
      ${input('accountName','Название сервисного аккаунта',app.name,{required:true,maxlength:100})}
      ${workspaces.length?select('workspace','Пространство',workspaces[0].id,workspaces.map(w=>[w.id,w.name]),'data-workspace'):'<p class="iq-helper">Вы пока не участник ни одного проекта.</p>'}
      <fieldset class="consent-scopes" data-projects><legend>Проекты</legend></fieldset>
    </div>
    <fieldset class="consent-scopes"><legend>Что приложение сможет делать</legend>
      ${SCOPES.filter(([id])=>requested.has(id)).map(([id,label,hint,fixed])=>`<label class="iq-check consent-scope"><input type="checkbox" name="scope" value="${id}" checked ${fixed?'disabled':''}><span class="iq-check-box">${icon('check',14)}</span><span><b>${label}</b><small>${hint}</small></span></label>`).join('')}
    </fieldset>
    <p class="iq-helper" data-new-preset hidden>Новый аккаунт получит в каждом проекте пресет «Сервис: задачи», если разрешено изменять и вы сами меняете задачи там, иначе — «Сервис: чтение». Уточнить права можно потом: Настройки → Сервисные аккаунты.</p>
    <p class="iq-helper">${icon('warning',16)} Сервисный аккаунт видит только выбранные проекты и никогда не получает больше прав, чем у вас. Разрешайте только приложениям, которым доверяете; текст задач приложение получает как данные.</p>
    <div class="consent-actions"><button class="iq-btn primary lg" type="submit" data-approve>Разрешить</button><button class="iq-btn secondary lg" type="button" data-deny>Отказать</button></div>
  </form>`;
  enhance(body);
  const form=body.querySelector('form'),fresh=form.querySelector('[data-new]'),projectList=form.querySelector('[data-projects]');
  const roleName={reader:'наблюдатель',editor:'редактор',admin:'администратор'};
  function showProjects(chosen){
    const workspace=workspaces.find(w=>w.id===(chosen||form.querySelector('[data-workspace]')?.value||workspaces[0]?.id));
    projectList.innerHTML='<legend>Проекты</legend>'+(workspace?.projects||[]).map(p=>`<label class="iq-check consent-scope"><input type="checkbox" name="project" value="${esc(p.id)}" checked><span class="iq-check-box">${icon('check',14)}</span><span><b>${esc(p.name)}</b><small>Ваша роль: ${esc(roleName[p.role]||p.role)} — аккаунт получит не больше</small></span></label>`).join('');
  }
  function showNew(){fresh.hidden=form.querySelector('[name=account]:checked')?.value!=='new';form.querySelector('[data-new-preset]').hidden=fresh.hidden;}
  form.addEventListener('iq-change',event=>{if(event.target.closest('[data-workspace]'))showProjects(event.detail?.value);});
  form.addEventListener('change',event=>{if(event.target.name==='account')showNew();});
  showProjects();showNew();
  async function decide(approve){
    const scopes=['read',...[...form.querySelectorAll('[name=scope]:checked:not([disabled])')].map(input=>input.value)];
    const chosen=form.querySelector('[name=account]:checked')?.value;
    const body={request,approve,scopes};
    if(approve&&chosen==='new'){
      const projectIds=[...form.querySelectorAll('[name=project]:checked')].map(input=>input.value);
      const name=String(form.querySelector('[name=accountName]')?.value||'').trim();
      const workspaceId=form.querySelector('[data-workspace]')?.value||workspaces[0]?.id;
      if(!name||!workspaceId||!projectIds.length){screen.setAttribute('error','Назовите сервисный аккаунт и выберите хотя бы один проект.');return;}
      body.newServiceAccount={name,workspaceId,projectIds};
    }else if(approve)body.serviceAccountId=chosen;
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    screen.setAttribute('pending','');screen.setAttribute('pending-label',approve?'Выдаём доступ…':'Отказываем…');screen.removeAttribute('error');
    try{const answer=await client.request('/oauth/authorizations','POST',body);location.assign(answer.redirectTo);}
    catch(error){screen.removeAttribute('pending');screen.setAttribute('error',error.message||'Не удалось ответить приложению.');for(const button of form.querySelectorAll('button'))button.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void decide(true);});
  form.querySelector('[data-deny]').addEventListener('click',()=>void decide(false));
}
