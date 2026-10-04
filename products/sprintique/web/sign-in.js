// Sign-in on the DS authentication screen: a code by e-mail first, then Google and Apple when the server has them.
// Only the ways in the server reports are offered; a provider that sends the browser back with an error lands here
// with ?sign-in-error=CODE, shown once and removed from the address. An invitation link shows what it invites to.
import {icon,escapeHTML as esc,formatDateTime} from '@iquipage/web/core';
import {invitationSummary,invitationState} from './invitation-model.js';
import {invitationFlow} from './invitation-flow.js';
const ERRORS={
  LOGIN_CANCELLED:'Вход отменён. Выберите способ входа ещё раз.',
  LOGIN_STATE:'Страница входа устарела. Начните вход заново.',
  LOGIN_INVALID:'Не удалось подтвердить вход. Попробуйте ещё раз.',
  ACCOUNT_DISABLED:'Аккаунт отключён. Обратитесь к администратору пространства.',
  PROVIDER_UNAVAILABLE:'Сервис входа сейчас недоступен. Попробуйте позже или войдите по почте.',
};
const RESEND_SECONDS=30;
// Provider marks as their brand guidelines draw them: Google's four-colour G, Apple's logo in the text colour.
const GOOGLE_MARK='<svg class="sign-in-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
const APPLE_MARK='<svg class="sign-in-mark" viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>';

/** Keeps a project invitation from the address across the sign-in, whichever way it goes. */
const keepInvitation=()=>{invitationFlow().keep();};
/** What an invitation link offers, asked anonymously; null when it cannot be asked now (the sign-in still works). */
export async function inspectInvitation(){
  const token=invitationFlow().fromAddress();if(!token)return null;
  try{
    const response=await fetch('/api/v1/invitations/inspect',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({token})});
    if(response.status===404)return {state:'invalid'};
    return response.ok?await response.json():null;
  }catch{return null;}
}

async function post(url,body){
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const answer=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(answer?.message||'Не удалось выполнить запрос. Повторите попытку.'),{code:answer?.code});
  return answer;
}

export function mountSignIn(root,methods,invitation=null){
  keepInvitation();
  const invited=invitation?.state==='pending',gone=invitation&&!invited?invitationState(invitation.state,invitation):null;
  // A spent link is explained once and forgotten: after sign-in nothing tries to accept it.
  if(gone)invitationFlow().drop();
  const intro=invited?{heading:'Войдите, чтобы принять',description:methods.email?'Войдите с адресом из письма любым способом. Пароль не нужен: пришлём код.':'Войдите с адресом из письма.'}
    :gone?{heading:gone[0],description:`${gone[1]} Войти в Sprintique можно как обычно.`}
    :{heading:'Вход в Sprintique',description:methods.email?'Введите почту — мы пришлём код для входа. Пароль не нужен.':'Выберите, как войти.'};
  const context=invited?{title:invitation.inviterName?`${invitation.inviterName} приглашает вас в «${invitation.workspaceName}»`:`Вас приглашают в «${invitation.workspaceName}»`,description:`${invitationSummary(invitation)}${invitation.presetHint?' '+invitation.presetHint:''}`}
    :{title:'Работа команды. В одном пространстве.',description:'От первой идеи до готового релиза: задачи, планы и финансы проекта связаны между собой.'};
  if(!methods.email&&!methods.google&&!methods.apple&&!methods.devLogin){
    root.innerHTML='<main class="iq-auth-stage"><section class="iq-auth-dialog"><h1>Вход не настроен</h1><p class="iq-auth-dialog-description">Администратору: настройте почту (SMTP) или вход через Google и Apple — см. раздел «Вход» в docs/operations.md.</p>'+legalLinks()+'</section></main>';
    return;
  }
  const providers=[
    methods.google?`<a class="iq-btn secondary lg sign-in-provider" href="/auth/login/google" data-provider>${GOOGLE_MARK}<span>Продолжить с Google</span></a>`:'',
    methods.apple?`<a class="iq-btn secondary lg sign-in-provider" href="/auth/login/apple" data-provider>${APPLE_MARK}<span>Продолжить с Apple</span></a>`:'',
  ].join('');
  root.innerHTML=`<iq-auth-screen layout="welcome" product="Sprintique" heading="${esc(intro.heading)}" description="${esc(intro.description)}"
      context-title="${esc(context.title)}" context-description="${esc(context.description)}">
    ${!invited?`<ul slot="context" class="iq-feature-list" aria-label="Возможности Sprintique"><li>${icon('check',22)}<div><strong>Понятно, что делать дальше</strong><small>Личные задачи и запросы команды на рабочем столе.</small></div></li><li>${icon('calendar',22)}<div><strong>Видно, к чему идём</strong><small>Спринты и релизы с общим составом задач.</small></div></li><li>${icon('chart',22)}<div><strong>План и результат рядом</strong><small>Доходы, расходы и отклонения по проекту.</small></div></li></ul>`:''}
    ${invited?`<div slot="context" class="sign-in-invite"><span class="iq-badge soft info">Приглашение</span><p>${icon('clock',16)}<span>Действует до ${esc(formatDateTime(invitation.expiresAt))}</span></p>${invitation.email?`<p>${icon('user',16)}<span>Для ${esc(invitation.email)}</span></p>`:''}</div>`:''}
    <div slot="form" class="sign-in">
      ${methods.email?`<form class="sign-in-step" data-step="email" novalidate>
        <div class="iq-field"><label class="iq-control-label" for="sign-in-email">Почта</label>
          <div class="iq-input-shell"><input id="sign-in-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required${invited?' aria-describedby="sign-in-email-help"':''}></div>
          ${invited?'<small class="iq-helper" id="sign-in-email-help">Адрес из приглашения. Если войдёте с другим, приглашение не примется.</small>':''}</div>
        <button class="iq-btn primary lg sign-in-submit" type="submit">Получить код</button>
      </form>
      <form class="sign-in-step" data-step="code" novalidate hidden>
        <div class="iq-field"><label class="iq-control-label" for="sign-in-code">Код из письма</label>
          <div class="iq-input-shell"><input id="sign-in-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="sign-in-code-help"></div>
          <small class="iq-helper" id="sign-in-code-help">Шесть цифр. Код действует 10 минут и только в этом браузере.</small></div>
        <button class="iq-btn primary lg sign-in-submit" type="submit">Войти</button>
        <div class="sign-in-actions"><button class="iq-btn ghost sm" type="button" data-resend disabled></button><button class="iq-btn ghost sm" type="button" data-change>Другая почта</button></div>
      </form>`:''}
      ${providers?`${methods.email?'<p class="sign-in-divider"><span>или</span></p>':''}<div class="sign-in-providers">${providers}</div>`:''}
      ${methods.devLogin?'<button class="iq-btn ghost sign-in-dev" type="button" data-dev-login>Локальный стенд: войти как admin</button>':''}
      <p class="iq-helper">Впервые здесь? Аккаунт создастся при входе.</p>
      ${legalLinks()}
    </div>
  </iq-auth-screen>`;
  const screen=root.querySelector('iq-auth-screen');
  const fail=message=>{screen.setAttribute('error',message);};
  const clear=()=>screen.removeAttribute('error');
  const error=new URLSearchParams(location.search).get('sign-in-error');
  if(error){
    fail(ERRORS[error]||ERRORS.LOGIN_INVALID);
    history.replaceState(null,'',location.pathname+location.hash);
  }
  for(const link of root.querySelectorAll('[data-provider]'))link.addEventListener('click',keepInvitation);
  root.querySelector('[data-dev-login]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;clear();
    try{await post('/auth/dev-login',{username:'admin',password:'admin'});location.reload();}
    catch(cause){button.disabled=false;fail(cause.message);}
  });
  if(!methods.email)return;

  const emailForm=root.querySelector('[data-step=email]'),codeForm=root.querySelector('[data-step=code]');
  const emailInput=emailForm.elements.email,codeInput=codeForm.elements.code,resend=codeForm.querySelector('[data-resend]');
  let address='',timer=0;
  const busy=(form,on)=>{for(const button of form.querySelectorAll('button'))button.disabled=on||(button===resend&&timer>0);form.setAttribute('aria-busy',String(on));};
  const invalid=(input,on)=>input.setAttribute('aria-invalid',String(on));
  function countdown(){
    let left=RESEND_SECONDS;clearInterval(timer);
    const show=()=>{resend.disabled=left>0;resend.textContent=left>0?`Отправить снова через ${left} с`:'Отправить код ещё раз';};
    show();timer=setInterval(()=>{left--;show();if(left<=0){clearInterval(timer);timer=0;}},1000);
  }
  function showStep(step){
    emailForm.hidden=step!=='email';codeForm.hidden=step!=='code';
    for(const node of root.querySelectorAll('.sign-in-divider,.sign-in-providers,.sign-in-dev'))node.hidden=step==='code';
    screen.setAttribute('heading',step==='code'?'Проверьте почту':intro.heading);
    screen.setAttribute('description',step==='code'?`Мы отправили код на ${address}.`:intro.description);
    (step==='code'?codeInput:emailInput).focus();
  }
  async function send(){
    await post('/auth/email/start',{email:address});
    codeInput.value='';invalid(codeInput,false);countdown();showStep('code');
  }
  emailForm.addEventListener('submit',async event=>{
    event.preventDefault();clear();
    if(!emailInput.checkValidity()){invalid(emailInput,true);fail('Проверьте адрес почты.');emailInput.focus();return;}
    invalid(emailInput,false);address=emailInput.value.trim();busy(emailForm,true);
    try{await send();}catch(cause){if(cause.code==='EMAIL_INVALID')invalid(emailInput,true);fail(cause.message);}
    finally{busy(emailForm,false);}
  });
  codeForm.addEventListener('submit',async event=>{
    event.preventDefault();clear();
    const code=codeInput.value.replace(/\D/g,'');
    if(code.length!==6){invalid(codeInput,true);fail('Введите шесть цифр из письма.');codeInput.focus();return;}
    busy(codeForm,true);
    try{await post('/auth/email/verify',{code});location.reload();}
    catch(cause){
      invalid(codeInput,true);fail(cause.message);busy(codeForm,false);codeInput.select();
      // A spent code cannot be retried: only a new one helps, so the resend button is the next step.
      if(cause.code==='EMAIL_CODE_EXPIRED'&&timer===0)resend.focus();
    }
  });
  // Six digits typed or pasted is the whole answer: no extra press needed.
  codeInput.addEventListener('input',()=>{
    codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,6);invalid(codeInput,false);
    if(codeInput.value.length===6)codeForm.requestSubmit();
  });
  resend.addEventListener('click',async()=>{
    clear();busy(codeForm,true);
    try{await send();}catch(cause){fail(cause.message);}finally{busy(codeForm,false);}
  });
  codeForm.querySelector('[data-change]').addEventListener('click',()=>{clear();clearInterval(timer);timer=0;showStep('email');emailInput.select();});
  emailInput.focus();
}

function legalLinks(){
  return '<p class="sign-in-legal"><a href="/about">О Sprintique</a> · <a href="/privacy">Конфиденциальность</a> · <a href="/terms">Условия</a><br>Входя, вы принимаете условия использования.</p>';
}
