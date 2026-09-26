'use strict';
const {escapeHTML:esc,icon}=require('./components.js');
let sequence=0;
/** Full-width settings workspace: the DS side navigation on the left, one left-aligned content column.
    `view="index|section"` chooses which half a phone shows. Slots retain their nodes and focus. */
class IqSettingsLayout extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'}).innerHTML=`<style>
 :host{display:block;min-height:100%;color:var(--iq-ink)}*{box-sizing:border-box}
 .layout{display:grid;grid-template-columns:var(--iq-settings-nav-width,264px) minmax(0,1fr);width:100%;min-height:100%;background:var(--iq-canvas)}
 aside{min-width:0;background:var(--iq-surface);border-right:1px solid var(--iq-line)}
 ::slotted([slot=navigation]){position:sticky;top:0;max-height:calc(100dvh - var(--iq-app-header-height,56px));overflow:auto;padding:var(--iq-space-6) 14px var(--iq-space-8)}
 .content{min-width:0;padding:var(--iq-space-6) var(--iq-space-10) var(--iq-space-16)}
 .measure{max-width:var(--iq-settings-measure,1120px)}
 ::slotted(*){min-width:0}::slotted([slot=heading]){margin-bottom:var(--iq-space-8)}
 @media(max-width:1100px){.layout{grid-template-columns:232px minmax(0,1fr)}.content{padding-inline:var(--iq-space-6)}}
 @media(max-width:760px){.layout{grid-template-columns:minmax(0,1fr)}aside{border-right:0}::slotted([slot=navigation]){position:static;max-height:none;overflow:visible;padding:var(--iq-space-5) var(--iq-space-2) var(--iq-space-8)}.content{padding:var(--iq-space-4) var(--iq-space-4) var(--iq-space-12)}
  :host([view=index]) .content,:host([view=section]) aside{display:none}:host(:not([view])) aside{border-bottom:1px solid var(--iq-line)}}
 </style><div class="layout" part="layout"><aside part="navigation"><slot name="navigation"></slot></aside><div class="content" part="content"><div class="measure"><slot name="heading"></slot><slot></slot></div></div></div>`;}
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
/** Settings navigation drawn with the DS side navigation (`.product-nav-*`): neutral current item, quiet group labels.
    Items: {id,label,icon,count?,countLabel?}. Only the list is returned, so a host search field keeps its focus. */
function settingsNavigation(groups,active){let n=0;return `<nav class="iq-settings-nav" aria-label="Разделы настроек">${groups.map(group=>{const id='iq-settings-group-'+(++sequence)+'-'+(++n);return `<div class="product-nav-section" role="group" aria-labelledby="${id}"><p class="product-nav-group-label" id="${id}">${esc(group.label)}</p>${group.items.map(item=>`<a class="product-nav-link" href="#settings/${encodeURIComponent(item.id)}" data-settings-section="${esc(item.id)}" ${item.id===active?'aria-current="page"':''}>${icon(item.icon||'sliders',19)}<span>${esc(item.label)}</span>${Number.isFinite(item.count)&&item.count>0?`<small class="nav-count" ${item.countLabel?`aria-label="${esc(item.countLabel)}"`:''}>${item.count}</small>`:''}</a>`).join('')}</div>`;}).join('')}</nav>`;}
function registerSettings(){if(!customElements.get('iq-settings-layout'))customElements.define('iq-settings-layout',IqSettingsLayout);if(!customElements.get('iq-visual-choice'))customElements.define('iq-visual-choice',IqVisualChoice);}
Object.assign(exports,{IqSettingsLayout,IqVisualChoice,settingsNavigation,registerSettings});
