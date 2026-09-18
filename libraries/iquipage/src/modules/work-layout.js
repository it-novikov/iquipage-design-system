'use strict';
/**
 * Public composition, not a resize transform or an app-specific CSS patch.
 * Slots retain consumer node identity and native event/focus behaviour.
 * Owns rhythm between blocks, never their data, navigation or business actions.
 */
const layoutStyle=`
:host{container-type:inline-size;container-name:iq-work;display:block;min-width:0;--_pad:var(--iq-work-comfortable-padding);--_gap:var(--iq-work-comfortable-gap);--_title:var(--iq-work-comfortable-title);--_row:var(--iq-work-comfortable-row);color:var(--iq-ink);background:var(--iq-canvas);font-family:var(--iq-font)}
:host([density=compact]){--_pad:var(--iq-work-compact-padding);--_gap:var(--iq-work-compact-gap);--_title:var(--iq-work-compact-title);--_row:var(--iq-work-compact-row)}
*,*::before,*::after{box-sizing:border-box}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--_gap);padding:var(--_pad);min-width:0}
:host([density=compact]) .layout{grid-template-columns:minmax(0,1fr) auto}
:host([density=compact]) .part:not(.navigation):not(.summary){grid-column:1/-1}
:host([density=compact]) .navigation{grid-column:1}
:host([density=compact]) .summary{grid-column:2;align-self:center}
.part{min-width:0;max-width:100%}.part[hidden]{display:none}
.header{background:var(--iq-canvas);z-index:3}
:host([sticky-header]) .header{position:sticky;top:var(--iq-work-sticky-offset,0px);padding-block:var(--iq-space-2)}
::slotted(iq-work-header){--iq-work-header-padding:0px;--iq-work-header-title:var(--_title);--iq-work-header-border:0px;--iq-work-header-gap:var(--iq-space-2);--iq-work-header-description-gap:var(--iq-space-1)}
::slotted(*){min-width:0;max-width:100%;--iq-work-row-min:var(--_row);--iq-work-section-gap:var(--_gap);--iq-work-control-size:var(--iq-control-sm)}
@media(max-width:820px){:host([density=compact]) .layout{grid-template-columns:minmax(0,1fr)}:host([density=compact]) .part.navigation,:host([density=compact]) .part.summary{grid-column:1}}
@media(max-width:640px){:host{--_pad:var(--iq-space-4);--_title:21px;--_gap:var(--iq-space-3)}:host([density=compact]){--_pad:var(--iq-space-4);--_title:21px;--_gap:var(--iq-space-3)}}
@media(max-height:500px){:host([sticky-header]) .header{position:static}}
@container iq-work (max-width:820px){.layout{grid-template-columns:minmax(0,1fr)!important}.part.navigation,.part.summary{grid-column:1!important}}
@container iq-work (max-width:640px){.layout{--_pad:var(--iq-space-4);--_gap:var(--iq-space-3);--_title:21px}}
@media print{:host([sticky-header]) .header{position:static}}
`;
class IqWorkLayout extends HTMLElement {
 static get observedAttributes(){return ['density','label'];}
 constructor(){super();this.attachShadow({mode:'open'}).innerHTML=`<style>${layoutStyle}</style><div class="layout">${['header','navigation','summary','toolbar','content','footer'].map(name=>`<div class="part ${name}" data-part="${name}"><slot${name==='content'?'':` name="${name}"`}></slot></div>`).join('')}</div>`;this.shadowRoot.addEventListener('slotchange',()=>this.syncSlots());}
 connectedCallback(){if(Object.prototype.hasOwnProperty.call(this,'density')){const d=this.density;delete this.density;this.density=d;}this.syncSlots();}
 attributeChangedCallback(){if(this.isConnected)this.syncSlots();}
 get density(){return this.getAttribute('density')==='compact'?'compact':'comfortable';}
 set density(value){if(!['compact','comfortable'].includes(value))throw new TypeError('density: compact | comfortable');this.setAttribute('density',value);}
 syncSlots(){
  for(const slot of this.shadowRoot.querySelectorAll('slot'))slot.parentElement.hidden=!slot.assignedNodes({flatten:true}).some(n=>n.nodeType===1||(n.nodeType===3&&n.textContent.trim()));
  // The layout is not an extra landmark. Applications keep ownership of main and navigation.
  if(this.hasAttribute('label'))this.setAttribute('aria-label',this.getAttribute('label'));
 }
}
function registerWorkLayout(){if(!customElements.get('iq-work-layout'))customElements.define('iq-work-layout',IqWorkLayout);}
Object.assign(exports,{IqWorkLayout,registerWorkLayout});
