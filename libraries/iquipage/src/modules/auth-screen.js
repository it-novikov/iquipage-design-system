"use strict";
const {escapeHTML:esc,icon,mark}=require('./components.js');
/** Provider-neutral screen. Credentials, redirects and sessions belong to the host. */
class IqAuthScreen extends HTMLElement {
 static get observedAttributes(){return ['product','heading','description','context-title','context-description','action-label','action-href','hint','error','pending','pending-label'];}
 connectedCallback(){this.render();}
 attributeChangedCallback(){if(this.isConnected)this.render();}
 render(){
  if(this._mounted){this.update();return;}
  const slots=['brand','tools','context','form','footer'];
  const retained=Object.fromEntries(slots.map(name=>[name,[...this.children].filter(child=>child.getAttribute('slot')===name)]));
  const text=(name,fallback='')=>esc(this.getAttribute(name)||fallback);
  const pending=this.hasAttribute('pending');
  const href=safeAuthHref(this.getAttribute('action-href'));
  this.innerHTML=`<div class="iq-auth-screen">
   <header class="iq-auth-header"><div data-auth-slot="brand" class="iq-auth-brand">${retained.brand.length?'':mark()+`<span data-auth-product>${text('product','IQUIPAGE')}</span>`}</div><div data-auth-slot="tools" class="iq-auth-tools"></div></header>
   <main class="iq-auth-main">
    <section class="iq-auth-context"><div><h2>${text('context-title','Всё, что важно. В одном пространстве.')}</h2><p>${text('context-description')}</p></div><div data-auth-slot="context"></div><span class="iq-auth-signature">IQUIPAGE</span></section>
    <section class="iq-auth-entry"><div class="iq-auth-content">
     <h1>${text('heading','Добро пожаловать')}</h1><p class="iq-auth-description">${text('description','Войдите, чтобы продолжить работу.')}</p>
     <div class="iq-auth-error" role="alert" ${this.getAttribute('error')?'':'hidden'}>${text('error')}</div>
     <div data-auth-slot="form" class="iq-auth-form" ${pending?'aria-busy="true"':''}></div>
     ${retained.form.length?'':href&&!pending?`<a class="iq-btn primary lg iq-auth-action" href="${esc(href)}">${text('action-label','Войти')}${icon('arrow',18)}</a>`:`<button class="iq-btn primary lg iq-auth-action" type="button" ${pending?'disabled aria-busy="true"':''}>${pending?text('pending-label','Подключаемся…'):text('action-label','Войти')}${pending?'':icon('arrow',18)}</button>`}
     <p class="iq-auth-hint" role="status">${pending?text('pending-label','Подключаемся…'):text('hint')}</p>
     <div data-auth-slot="footer" class="iq-auth-footer"></div>
    </div></section>
   </main>
  </div>`;
  for(const name of slots)this.querySelector(`[data-auth-slot="${name}"]`).append(...retained[name]);
  this._mounted=true;
  const action=this.querySelector('.iq-auth-action');
  if(action)action.onclick=event=>{if(this.hasAttribute('pending')){event.preventDefault();return;}if(!this.dispatchEvent(new CustomEvent('iq-auth-action',{bubbles:true,composed:true,cancelable:true})))event.preventDefault();};
 }

 update(){
  const value=(name,fallback='')=>this.getAttribute(name)||fallback;
  const texts={'[data-auth-product]':['product','IQUIPAGE'],'.iq-auth-context h2':['context-title','Всё, что важно. В одном пространстве.'],'.iq-auth-context p':['context-description'],'.iq-auth-content h1':['heading','Добро пожаловать'],'.iq-auth-description':['description','Войдите, чтобы продолжить работу.'],'.iq-auth-error':['error']};
  for(const [selector,args] of Object.entries(texts)){const node=this.querySelector(selector);if(node)node.textContent=value(...args);}
  this.querySelector('.iq-auth-error').hidden=!value('error');
  const pending=this.hasAttribute('pending'),href=safeAuthHref(value('action-href'));
  this.querySelector('.iq-auth-hint').textContent=pending?value('pending-label','Подключаемся…'):value('hint');
  this.querySelector('.iq-auth-form').setAttribute('aria-busy',String(pending));
  let action=this.querySelector('.iq-auth-action');
  if(!action)return;
  const tag=href?'A':'BUTTON';
  if(action.tagName!==tag){const next=document.createElement(tag);next.className=action.className;next.onclick=action.onclick;action.replaceWith(next);action=next;}
  if(tag==='A'){if(pending)action.removeAttribute('href');else action.setAttribute('href',href);action.setAttribute('aria-disabled',String(pending));}
  else {action.type='button';action.disabled=pending;}
  action.setAttribute('aria-busy',String(pending));
  action.innerHTML=esc(pending?value('pending-label','Подключаемся…'):value('action-label','Войти'))+(pending?'':icon('arrow',18));
 }
}
function safeAuthHref(value){
 if(!value||/[\\\u0000-\u0020\u007f]/.test(value))return '';
 if(value.startsWith('/')&&!value.startsWith('//'))return value;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function registerAuthScreen(){if(!customElements.get('iq-auth-screen'))customElements.define('iq-auth-screen',IqAuthScreen);}
Object.assign(exports,{IqAuthScreen,registerAuthScreen,safeAuthHref});
