'use strict';
const {escapeHTML:esc,icon,mark}=require('./components.js');
const {safeAuthHref}=require('./auth-screen.js');
let sequence=0;
/** Credential form, with native submission or a cancelable host event. Never persists secrets. */
class IqAuthDialog extends HTMLElement {
 static get observedAttributes(){return ['error','pending'];}
 connectedCallback(){
  if(this._mounted){this.update();return;}
  this._mounted=true;const id=`iq-auth-${++sequence}`,text=(name,fallback)=>esc(this.getAttribute(name)||fallback);
  const action=safeAuthHref(this.getAttribute('action')),recovery=safeAuthHref(this.getAttribute('recovery-href')),registration=safeAuthHref(this.getAttribute('registration-href'));
  this.innerHTML=`<section class="iq-auth-dialog" aria-labelledby="${id}-title">
   <div class="iq-auth-dialog-brand">${mark()}<span>${text('product','IQUIPAGE')}</span></div>
   <h1 id="${id}-title">${text('heading','Вход в аккаунт')}</h1>
   <p class="iq-auth-dialog-description">${text('description','Введите данные своего аккаунта, чтобы продолжить.')}</p>
   <p class="iq-auth-error" role="alert" id="${id}-error" hidden></p>
   <form method="post" ${action?`action="${esc(action)}"`:''}>
    <div class="iq-auth-field"><label class="iq-control-label" for="${id}-username">${text('username-label','Логин или почта')}</label><input class="iq-auth-input" id="${id}-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
    <div class="iq-auth-field"><div class="iq-auth-label-row"><label class="iq-control-label" for="${id}-password">Пароль</label>${recovery?`<a href="${esc(recovery)}">Забыли пароль?</a>`:''}</div><div class="iq-auth-password"><input class="iq-auth-input" id="${id}-password" name="password" type="password" autocomplete="current-password" required><button class="iq-btn ghost icon" type="button" data-password-toggle aria-label="Показать пароль" aria-controls="${id}-password" aria-pressed="false">${icon('eye',18)}</button></div></div>
    ${this.hasAttribute('remember-me')?'<label class="iq-auth-remember"><input type="checkbox" name="rememberMe"> Запомнить меня</label>':''}
    <button class="iq-btn primary lg iq-auth-submit" type="submit">Войти</button>
    <p class="iq-auth-status" role="status"></p>
   </form>
   ${registration?`<p class="iq-auth-dialog-footer">Нет аккаунта? <a href="${esc(registration)}">Создать аккаунт</a></p>`:''}
  </section>`;
  const form=this.querySelector('form'),password=form.elements.password,toggle=this.querySelector('[data-password-toggle]');
  toggle.onclick=()=>{const shown=password.type==='password';password.type=shown?'text':'password';toggle.setAttribute('aria-label',shown?'Скрыть пароль':'Показать пароль');toggle.setAttribute('aria-pressed',String(shown));};
  form.onsubmit=event=>{
   if(this.hasAttribute('pending')){event.preventDefault();return;}
   const intent=new CustomEvent('iq-auth-submit',{bubbles:true,composed:true,cancelable:true,detail:{username:form.elements.username.value,password:password.value,rememberMe:form.elements.rememberMe?.checked||false}});
   if(!this.dispatchEvent(intent)||!action)event.preventDefault();
  };
  this.update();
 }
 attributeChangedCallback(){if(this._mounted)this.update();}
 update(){const error=this.getAttribute('error')||'',pending=this.hasAttribute('pending'),alert=this.querySelector('[role=alert]');alert.textContent=error;alert.hidden=!error;const form=this.querySelector('form');form.setAttribute('aria-busy',String(pending));this.querySelector('[type=submit]').disabled=pending;this.querySelector('[type=submit]').textContent=pending?'Входим…':'Войти';this.querySelector('[role=status]').textContent=pending?'Проверяем данные аккаунта.':'';
 for(const input of form.querySelectorAll('input:not([type=checkbox])')){input.setAttribute('aria-invalid',String(!!error));if(error)input.setAttribute('aria-describedby',alert.id);else input.removeAttribute('aria-describedby');}}
 clearPassword(){const field=this.querySelector('[name=password]');if(field){field.value='';field.type='password';const toggle=this.querySelector('[data-password-toggle]');toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','Показать пароль');}}
}
function registerAuthDialog(){if(!customElements.get('iq-auth-dialog'))customElements.define('iq-auth-dialog',IqAuthDialog);}
Object.assign(exports,{IqAuthDialog,registerAuthDialog});
