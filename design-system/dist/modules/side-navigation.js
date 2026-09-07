import dep0 from './components.js';
const exports={};
const deps={"./components.js":dep0};
(function(exports,require){
'use strict';
/** Product navigation. Links retain native semantics; a router may cancel iq-navigate. */
const {icon, escapeHTML: esc, uid} = require('./components.js');
let navigationDefaults={sections:[],opened:[],workspace:'Рабочее пространство',person:'Пользователь',initials:'Я',active:''};exports.configureNavigationDefaults=v=>{navigationDefaults=v};
function safeHref(href) {return typeof href==='string' && /^(#|\/(?!\/)|https?:\/\/)/.test(href) ? href : '#';}
class IqSideNavigation extends HTMLElement {
 static observedAttributes=['active','collapsed','items','workspace','person','initials'];
 sections=structuredClone(navigationDefaults.sections); opened=new Set(navigationDefaults.opened); query=''; events; listId=uid();
 attributeChangedCallback(){if(this.isConnected && this.events)this.render();}
 get active(){return this.getAttribute('active')||navigationDefaults.active;}
 set active(v){this.setAttribute('active',v);}
 get collapsed(){return this.hasAttribute('collapsed');}
 set collapsed(v){this.toggleAttribute('collapsed',!!v);}
 get items(){return this.sections;}
 set items(v){this.setAttribute('items',JSON.stringify(v));}
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();this.render();
  const signal=this.events.signal;
  this.addEventListener('click', e=>{
   const toggle=e.target.closest('[data-nav-collapse]');
   if(toggle){this.collapsed=!this.collapsed;this.querySelector('[data-nav-collapse]')?.focus({preventScroll:true});this.dispatchEvent(new CustomEvent('iq-collapse',{bubbles:true,detail:{collapsed:this.collapsed}}));return;}
   const branch=e.target.closest('[data-nav-disclose]');
   if(branch){const id=branch.dataset.navDisclose;this.opened.has(id)?this.opened.delete(id):this.opened.add(id);this.render();this.querySelector(`[data-nav-disclose="${CSS.escape(id)}"]`)?.focus({preventScroll:true});return;}
   const link=e.target.closest('a[data-nav-id]');
   if(!link||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button>0)return;
   const event=new CustomEvent('iq-navigate',{bubbles:true,cancelable:true,detail:{id:link.dataset.navId,label:link.dataset.navLabel,href:link.getAttribute('href')}});
   if(!this.dispatchEvent(event))e.preventDefault();
   this.setAttribute('active',link.dataset.navId);
   this.querySelector(`[data-nav-id="${CSS.escape(link.dataset.navId)}"]`)?.focus({preventScroll:true});
  },{signal});
  this.addEventListener('input',e=>{if(!e.target.matches('[data-nav-search]'))return;this.query=e.target.value;this.renderItems();},{signal});
  this.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.matches('[data-nav-search]')&&this.query){this.query='';e.target.value='';this.renderItems();e.preventDefault();}},{signal});
 }
 disconnectedCallback(){this.events?.abort();}
 readItems(){
  if(!this.hasAttribute('items'))return structuredClone(navigationDefaults.sections);
  try{
   const raw=JSON.parse(this.getAttribute('items'));if(!Array.isArray(raw))return [];
   const used=new Set();let total=0;
   const clean=(items,depth=0)=>!Array.isArray(items)||depth>4?[]:items.flatMap(i=>{
    if(!i||typeof i.id!=='string'||typeof i.label!=='string'||used.has(i.id)||total++>500)return [];
    used.add(i.id);return [{id:i.id,label:i.label,icon:typeof i.icon==='string'?i.icon:'file',href:safeHref(i.href),count:Number.isFinite(i.count)?Math.max(0,i.count):null,children:clean(i.children,depth+1)}];
   });
   return raw.filter(g=>g&&typeof g.label==='string').map(g=>({label:g.label,items:clean(g.items)}));
  }catch{return [];}
 }
 render(){
  this.sections=this.readItems();const collapsed=this.collapsed;
  this.innerHTML=`<aside class="product-nav"><header class="product-nav-head"><a class="nav-workspace" href="#overview" aria-label="${esc(this.getAttribute('workspace')||navigationDefaults.workspace)}"><span class="nav-workspace-monogram">IQ</span><span class="nav-workspace-copy"><b>${esc(this.getAttribute('workspace')||navigationDefaults.workspace)}</b><small>Рабочее пространство</small></span></a><button type="button" class="iq-btn icon ghost sm" data-nav-collapse aria-label="${collapsed?'Развернуть':'Свернуть'} навигацию" aria-expanded="${!collapsed}" aria-controls="${this.listId}">${icon(collapsed?'chevron':'left',17)}</button></header><label class="product-nav-search">${icon('search',17)}<input type="search" value="${esc(this.query)}" placeholder="Найти раздел" aria-label="Найти раздел навигации" data-nav-search></label><nav class="product-nav-items" id="${this.listId}" aria-label="Рабочие разделы"></nav><footer class="product-nav-footer"><a class="product-nav-link nav-settings" data-nav-id="settings" data-nav-label="Настройки" href="#rules/implementation" ${this.active==='settings'?'aria-current="page"':''}>${icon('settings',19)}<span>Настройки</span></a><div class="product-nav-person"><span class="iq-avatar v1">${esc(this.getAttribute('initials')||navigationDefaults.initials)}</span><span><b>${esc(this.getAttribute('person')||navigationDefaults.person)}</b><small>Личное пространство</small></span></div></footer></aside>`;
  this.renderItems();
 }
 renderItems(){
  const q=this.query.trim().toLocaleLowerCase('ru');let visible=0;
  const matches=i=>i.label.toLocaleLowerCase('ru').includes(q)||i.children?.some(matches);
  const containsCurrent=i=>i.id===this.active||i.children?.some(containsCurrent);
  const render=(items,level=0)=>items.filter(i=>!q||matches(i)).map(i=>{
   visible++;const children=i.children?.length,open=this.opened.has(i.id)||!!q,selected=this.active===i.id,childId=this.listId+'-'+i.id;
   return `<div class="product-nav-entry" data-level="${level}"><div class="product-nav-item"><a class="product-nav-link" href="${esc(safeHref(i.href))}" data-nav-id="${esc(i.id)}" data-nav-label="${esc(i.label)}" title="${esc(i.label)}" ${selected?'aria-current="page"':''} ${children&&containsCurrent(i)?'data-contains-current':''}>${icon(i.icon||'file',19)}<span>${esc(i.label)}</span>${Number.isFinite(i.count)?`<small class="nav-count">${i.count}</small>`:''}</a>${children?`<button type="button" class="nav-disclosure" data-nav-disclose="${esc(i.id)}" aria-controls="${esc(childId)}" aria-expanded="${open}" aria-label="${open?'Свернуть':'Развернуть'} ${esc(i.label)}">${icon(open?'down':'chevron',14)}</button>`:''}</div>${children?`<div class="product-nav-children" id="${esc(childId)}" ${open?'':'hidden'}>${render(i.children,level+1)}</div>`:''}</div>`;
  }).join('');
  const html=this.sections.map(g=>{const items=render(g.items);return items?`<section class="product-nav-section"><h3>${esc(g.label)}</h3>${items}</section>`:'';}).join('');
  this.querySelector('.product-nav-items').innerHTML=html||'<p class="nav-no-results" role="status">Раздел не найден</p>';
 }
}
function registerSideNavigation(){
 if(!customElements.get('iq-side-navigation'))customElements.define('iq-side-navigation',IqSideNavigation);
}
exports.IqSideNavigation=IqSideNavigation;exports.registerSideNavigation=registerSideNavigation;


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
