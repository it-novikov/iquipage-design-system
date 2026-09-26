'use strict';
const {escapeHTML:esc,icon,mark}=require('./components.js');
const {safeAuthHref}=require('./auth-screen.js');
let sequence=0;
const TEXT=['product','heading','description','username-label','password-label','submit-label','pending-label'];
/** Credential form built from DS fields (iq-field, iq-input-shell, iq-check, iq-alert), with native submission
 *  or a cancelable host event. Never persists secrets. */
class IqAuthDialog extends HTMLElement {
 static get observedAttributes(){return ['error','pending',...TEXT];}
 connectedCallback(){
  if(this._mounted){this.update();return;}
  this._mounted=true;const id=`iq-auth-${++sequence}`;
  const action=safeAuthHref(this.getAttribute('action')),recovery=safeAuthHref(this.getAttribute('recovery-href')),registration=safeAuthHref(this.getAttribute('registration-href'));
  this._action=action;
  this.innerHTML=`<section class="iq-auth-dialog" aria-labelledby="${id}-title">
   <div class="iq-auth-dialog-brand">${mark()}<span data-auth-text="product"></span></div>
   <h1 id="${id}-title" data-auth-text="heading"></h1>
   <p class="iq-auth-dialog-description" data-auth-text="description"></p>
   <div class="iq-auth-error" role="alert" id="${id}-error" hidden></div>
   <form method="post" ${action?`action="${esc(action)}"`:''}>
    <div class="iq-field"><label class="iq-control-label" for="${id}-username" data-auth-text="username-label"></label><div class="iq-input-shell"><input id="${id}-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div></div>
    <div class="iq-field"><div class="iq-auth-label-row"><label class="iq-control-label" for="${id}-password" data-auth-text="password-label"></label>${recovery?`<a href="${esc(recovery)}">Забыли пароль?</a>`:''}</div><div class="iq-input-shell iq-auth-password"><input id="${id}-password" name="password" type="password" autocomplete="current-password" required><button class="iq-btn ghost icon sm" type="button" data-password-toggle aria-label="Показать пароль" aria-controls="${id}-password" aria-pressed="false">${icon('eye',18)}</button></div></div>
    ${this.hasAttribute('remember-me')?`<label class="iq-check iq-auth-remember"><input type="checkbox" name="rememberMe"><span class="iq-check-box">${icon('check',14)}</span><span>Запомнить меня</span></label>`:''}
    <button class="iq-btn primary lg iq-auth-submit" type="submit"></button>
    <p class="iq-auth-status" role="status"></p>
   </form>
   ${registration?`<p class="iq-auth-dialog-footer">Нет аккаунта? <a href="${esc(registration)}">Создать аккаунт</a></p>`:''}
  </section>`;
  const form=this.querySelector('form'),password=form.elements.password,toggle=this.querySelector('[data-password-toggle]');
  toggle.onclick=()=>{const shown=password.type==='password';password.type=shown?'text':'password';toggle.setAttribute('aria-label',shown?'Скрыть пароль':'Показать пароль');toggle.setAttribute('aria-pressed',String(shown));password.focus({preventScroll:true});};
  form.onsubmit=event=>{
   if(this.hasAttribute('pending')){event.preventDefault();return;}
   const intent=new CustomEvent('iq-auth-submit',{bubbles:true,composed:true,cancelable:true,detail:{username:form.elements.username.value,password:password.value,rememberMe:form.elements.rememberMe?.checked||false}});
   if(!this.dispatchEvent(intent)||!this._action)event.preventDefault();
  };
  this.update();
 }
 attributeChangedCallback(){if(this._mounted)this.update();}
 text(name){return this.getAttribute(name)||{product:'IQUIPAGE',heading:'Вход в аккаунт',description:'Введите данные своего аккаунта, чтобы продолжить.','username-label':'Логин или почта','password-label':'Пароль','submit-label':'Войти','pending-label':'Входим…'}[name]||'';}
 update(){
  for(const node of this.querySelectorAll('[data-auth-text]'))node.textContent=this.text(node.dataset.authText);
  const error=this.getAttribute('error')||'',pending=this.hasAttribute('pending'),alert=this.querySelector('[role=alert]'),form=this.querySelector('form');
  // The error is a DS alert; the role=alert container keeps its id for the fields' aria-describedby.
  alert.hidden=!error;alert.innerHTML=error?`<div class="iq-alert danger"><span class="message-emblem">${icon('x',20)}</span><div class="message-copy"><b>Не удалось войти</b><p>${esc(error)}</p></div></div>`:'';
  form.setAttribute('aria-busy',String(pending));
  const submit=this.querySelector('[type=submit]');submit.disabled=pending;submit.textContent=pending?this.text('pending-label'):this.text('submit-label');
  this.querySelector('[role=status]').textContent=pending?'Проверяем данные аккаунта.':'';
  for(const input of form.querySelectorAll('input:not([type=checkbox])')){
   // Keep any describedby the host added; only the error reference is toggled.
   const ids=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(v=>v&&v!==alert.id);
   if(error)ids.unshift(alert.id);
   input.setAttribute('aria-invalid',String(!!error));
   if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');
  }
 }
 clearPassword(){const field=this.querySelector('[name=password]');if(field){field.value='';field.type='password';const toggle=this.querySelector('[data-password-toggle]');toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','Показать пароль');}}
}
function registerAuthDialog(){if(!customElements.get('iq-auth-dialog'))customElements.define('iq-auth-dialog',IqAuthDialog);}
Object.assign(exports,{IqAuthDialog,registerAuthDialog});
