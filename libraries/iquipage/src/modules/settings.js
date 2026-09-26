'use strict';
const {escapeHTML:esc,icon}=require('./components.js');
let sequence=0;
/** Persistent two-column settings composition. Slots retain their nodes and focus. */
class IqSettingsLayout extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'}).innerHTML=`<style>
 :host{display:flex;flex-direction:column;min-height:100%;color:var(--iq-ink)}*{box-sizing:border-box}.layout{display:grid;grid-template-columns:252px minmax(0,1fr);flex:1 0 auto;width:100%;max-width:1440px;margin:auto;background:var(--iq-canvas)}
 aside{align-self:stretch;padding:var(--iq-space-8) var(--iq-space-5);border-right:1px solid var(--iq-line);background:var(--iq-surface)}
 ::slotted([slot=navigation]){position:sticky;top:var(--iq-space-8);max-height:calc(100dvh - 2 * var(--iq-space-8));overflow:auto}
.content{min-width:0;padding:var(--iq-space-10) clamp(24px,4vw,64px) var(--iq-space-16)}
 ::slotted(*){min-width:0}::slotted([slot=heading]){margin-bottom:var(--iq-space-8)}
 @media(max-width:760px){.layout{grid-template-columns:minmax(0,1fr)}::slotted([slot=navigation]){position:static;max-height:none;overflow:visible}aside{border-right:0;border-bottom:1px solid var(--iq-line);padding:var(--iq-space-4)}.content{padding:var(--iq-space-6) var(--iq-space-4) var(--iq-space-12)}}
 </style><div class="layout"><aside><slot name="navigation"></slot></aside><div class="content"><slot name="heading"></slot><slot></slot></div></div>`;}
}
/** Native radio group with optional visual previews. No host state is persisted here. */
class IqVisualChoice extends HTMLElement {
 static get observedAttributes(){return ['value','disabled'];}
 constructor(){super();this._options=[];this._name='iq-choice-'+(++sequence);}
 get options(){return this._options;}
 set options(value){this._options=Array.isArray(value)?value.filter(v=>v&&typeof v.value==='string'&&typeof v.label==='string'):[];if(this.isConnected)this.render();}
 get value(){return this.getAttribute('value')||'';}
 set value(value){this.setAttribute('value',String(value));}
 connectedCallback(){if(Object.prototype.hasOwnProperty.call(this,'options')){const value=this.options;delete this.options;this.options=value;}this.render();}
 attributeChangedCallback(){if(this.isConnected)this.sync();}
 render(){
  const previews=new Set(['light','dark','system','comfortable','compact']);
  this.innerHTML=`<div class="iq-visual-choices" role="radiogroup" aria-label="${esc(this.getAttribute('label')||'Выберите вариант')}">${this._options.map(option=>`<label class="iq-visual-choice">${previews.has(option.preview)?`<span class="iq-choice-preview" data-preview="${esc(option.preview)}" aria-hidden="true"><span class="iq-choice-preview-nav"></span><span class="iq-choice-preview-body"><i></i><b></b><b></b><b></b></span></span>`:''}<span class="iq-choice-label"><input type="radio" name="${this._name}" value="${esc(option.value)}"><span>${esc(option.label)}</span></span>${option.description?`<small>${esc(option.description)}</small>`:''}</label>`).join('')}</div>`;
  this.onchange=event=>{if(event.target.matches('input[type=radio]')){this.value=event.target.value;this.dispatchEvent(new CustomEvent('iq-change',{bubbles:true,detail:{value:this.value}}));}};this.sync();
 }
 sync(){for(const input of this.querySelectorAll('input')){input.checked=input.value===this.value;input.disabled=this.hasAttribute('disabled');}}
}
function settingsNavigation(groups,active){return `<nav class="iq-settings-navigation" aria-label="Разделы настроек">${groups.map(group=>`<section><h2>${esc(group.label)}</h2>${group.items.map(item=>`<a href="#settings/${encodeURIComponent(item.id)}" data-settings-section="${esc(item.id)}" ${item.id===active?'aria-current="page"':''}>${icon(item.icon||'sliders',18)}<span>${esc(item.label)}</span></a>`).join('')}</section>`).join('')}</nav>`;}
function registerSettings(){if(!customElements.get('iq-settings-layout'))customElements.define('iq-settings-layout',IqSettingsLayout);if(!customElements.get('iq-visual-choice'))customElements.define('iq-visual-choice',IqVisualChoice);}
Object.assign(exports,{IqSettingsLayout,IqVisualChoice,settingsNavigation,registerSettings});
