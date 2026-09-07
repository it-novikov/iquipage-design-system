import dep0 from './markdown.js';
const exports={};
const deps={"./markdown.js":dep0};
(function(exports,require){
'use strict';
const {safeMarkdown}=require('./markdown.js');
/** Read-only text projection. Setting value never requests or confirms an application action. */
class IqMarkdownViewer extends HTMLElement {
 static get observedAttributes(){return ['value','label','empty-text','heading-level','code-wrap'];}
 #value;
 #article;
 connectedCallback(){
  if(Object.prototype.hasOwnProperty.call(this,'value')){const v=this.value;delete this.value;this.value=v;}
  if(!this.#article){this.#article=document.createElement('article');this.#article.className='md-document iq-markdown-viewer-document';this.replaceChildren(this.#article);}
  this.render();
 }
 attributeChangedCallback(name,old,value){if(old===value)return;if(name==='value')this.#value=value??'';if(this.isConnected)this.render();}
 get value(){return this.#value??this.getAttribute('value')??'';}
 set value(value){const next=String(value??'');if(next===this.value)return;this.#value=next;if(this.isConnected)this.render();}
 get headingLevel(){const n=Number(this.getAttribute('heading-level')||2);return Number.isInteger(n)&&n>=1&&n<=6?n:2;}
 set headingLevel(value){if(!Number.isInteger(value)||value<1||value>6)throw new RangeError('headingLevel: 1–6');this.setAttribute('heading-level',String(value));}
 render(){
  if(!this.#article)return;
  this.#article.setAttribute('aria-label',this.getAttribute('label')||'Содержимое документа');
  this.#article.classList.toggle('md-wrap-code',this.hasAttribute('code-wrap'));
  if(!this.value.trim()){
   const empty=document.createElement('p');empty.className='md-empty';empty.textContent=this.getAttribute('empty-text')??'Пока нет содержимого.';this.#article.replaceChildren(empty);return;
  }
  try{this.#article.innerHTML=safeMarkdown(this.value,{headingLevel:this.headingLevel});}
  catch(error){const p=document.createElement('p');p.className='md-render-error';p.setAttribute('role','alert');p.textContent=error.message;this.#article.replaceChildren(p);}
 }
}
function registerMarkdownViewer(){if(!customElements.get('iq-markdown-viewer'))customElements.define('iq-markdown-viewer',IqMarkdownViewer);}
Object.assign(exports,{IqMarkdownViewer,registerMarkdownViewer});

})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
