import {icon,escapeHTML as esc} from '@iquipage/web/core';

// The consent screen of the OAuth flow (/oauth/authorize): an app such as Claude asks to act for the signed-in person.
// The person sees the app's own name (as the app declared it), where the answer goes and what it may do, and can
// allow only reading. The server re-checks the whole request on the decision; this page never redirects to the app
// on its own, except with the answer the person chose.
const PENDING_KEY='sprintique.pending-authorization';
const SCOPES=[
  ['read','Читать','Проекты, задачи с обсуждениями, релизы, вехи и карты — только там, где вы участник.',true],
  ['write','Изменять','Создавать и менять задачи, менять статус, писать комментарии — в пределах вашей роли.',false]
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
      context-title="Приложение будет работать от вашего имени."
      context-description="Оно увидит и изменит только то, что доступно вам самим. Отключить его можно в любой момент: Настройки → Доступ приложений.">
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
  body.innerHTML=`<form class="consent-form" novalidate>
    <dl class="consent-facts">
      <div><dt>Аккаунт</dt><dd>${esc(session.principal.name)}</dd></div>
      <div><dt>Адрес возврата</dt><dd><code>${esc(app.redirectUri)}</code></dd></div>
      ${described.connected?'<div><dt>Уже подключено</dt><dd>Новый доступ заменит прежний: старые токены приложения перестанут работать.</dd></div>':''}
    </dl>
    <fieldset class="consent-scopes"><legend>Что приложение сможет делать</legend>
      ${SCOPES.filter(([id])=>requested.has(id)).map(([id,label,hint,fixed])=>`<label class="iq-check consent-scope"><input type="checkbox" name="scope" value="${id}" checked ${fixed?'disabled':''}><span class="iq-check-box">${icon('check',14)}</span><span><b>${label}</b><small>${hint}</small></span></label>`).join('')}
    </fieldset>
    <p class="iq-helper">${icon('warning',16)} Разрешайте только приложениям, которым доверяете. Текст задач приложение получает как данные.</p>
    <div class="consent-actions"><button class="iq-btn primary lg" type="submit" data-approve>Разрешить</button><button class="iq-btn secondary lg" type="button" data-deny>Отказать</button></div>
  </form>`;
  const form=body.querySelector('form');
  async function decide(approve){
    const scopes=['read',...[...form.querySelectorAll('[name=scope]:checked:not([disabled])')].map(input=>input.value)];
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    screen.setAttribute('pending','');screen.setAttribute('pending-label',approve?'Выдаём доступ…':'Отказываем…');screen.removeAttribute('error');
    try{const answer=await client.request('/oauth/authorizations','POST',{request,approve,scopes});location.assign(answer.redirectTo);}
    catch(error){screen.removeAttribute('pending');screen.setAttribute('error',error.message||'Не удалось ответить приложению.');for(const button of form.querySelectorAll('button'))button.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void decide(true);});
  form.querySelector('[data-deny]').addEventListener('click',()=>void decide(false));
}
