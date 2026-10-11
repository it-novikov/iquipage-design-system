'use strict';
/** Compact page composition for persistent workspaces. A real h1, not a scaled marketing hero. */
const {escapeHTML:esc}=require('./components.js');
class IqWorkHeader extends HTMLElement {
 static get observedAttributes(){return ['title','description','eyebrow','density']}
 connectedCallback(){this.render()}
 attributeChangedCallback(){if(this.isConnected)this.render()}
 render(){const focused=this.contains(document.activeElement)?document.activeElement:null;const actions=[...this.querySelectorAll('[slot=actions]')],context=[...this.querySelectorAll('[slot=context]')],title=[...this.querySelectorAll('[slot=title]')],back=[...this.querySelectorAll('[slot=back]')];this.innerHTML=`<header class="iq-work-header ${this.getAttribute('density')==='comfortable'?'is-comfortable':'is-compact'}"><div class="iq-work-header-main">${this.getAttribute('eyebrow')?`<p class="iq-work-header-eyebrow">${esc(this.getAttribute('eyebrow'))}</p>`:''}<div class="iq-work-header-title">${title.length?'':`<h1>${esc(this.getAttribute('title')||'Рабочее пространство')}</h1>`}</div>${this.getAttribute('description')?`<p class="iq-work-header-description">${esc(this.getAttribute('description'))}</p>`:''}</div><div class="iq-work-header-actions"></div><div class="iq-work-header-context" ${context.length?'':'hidden'}></div></header>`;this.querySelector('.iq-work-header-title').append(...title);this.querySelector('.iq-work-header-main').prepend(...back);this.querySelector('.iq-work-header-actions').append(...actions);this.querySelector('.iq-work-header-context').append(...context);if(focused?.isConnected)focused.focus({preventScroll:true});}
}
function registerWorkHeader(){if(!customElements.get('iq-work-header'))customElements.define('iq-work-header',IqWorkHeader)}
Object.assign(exports,{IqWorkHeader,registerWorkHeader});
