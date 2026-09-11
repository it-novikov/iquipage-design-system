'use strict';
const {safeMarkdown}=require('./markdown.js');
/** Read-only text projection. Setting value never requests or confirms an application action. */
class IqMarkdownViewer extends HTMLElement {
 static get observedAttributes(){return ['value','label','empty-text','heading-level','code-wrap','interactive-tasks'];}
 get interactiveTasks(){return this.hasAttribute('interactive-tasks')}
 set interactiveTasks(v){this.toggleAttribute('interactive-tasks',!!v)}
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
 bindTasks(){
  const source=this.value,marks=[...this.#article.querySelectorAll('.md-task-mark')],positions=[];
  let offset=0,fence=null;
  for(const line of source.split('\n')){
   const content=line.replace(/^\s*(?:>\s*)*/,''),f=/^(`{3,}|~{3,})/.exec(content);
   if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence=null;}
   else if(!fence){const m=/^(?:\s*>)*\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+/.exec(line);if(m)positions.push(offset+m[0].lastIndexOf('[')+1);}
   offset+=line.length+1;
  }
  // Never guess which source item a rendered control represents.
  if(positions.length!==marks.length)return;
  marks.forEach((mark,index)=>{const button=document.createElement('button');button.type='button';button.className=mark.className;button.textContent=mark.textContent;button.setAttribute('role','checkbox');button.setAttribute('aria-checked',String(source[positions[index]].toLowerCase()==='x'));button.setAttribute('aria-label',mark.parentElement.textContent.replace('✓','').trim());button.addEventListener('click',event=>{event.stopPropagation();if(this.value!==source||!this.interactiveTasks)return;const position=positions[index],checked=source[position].toLowerCase()!=='x';this.dispatchEvent(new CustomEvent('iq-task-toggle',{bubbles:true,composed:true,detail:{source,position,checked,value:source.slice(0,position)+(checked?'x':' ')+source.slice(position+1)}}));});mark.replaceWith(button);});
 }
 render(){
  if(!this.#article)return;
  this.#article.setAttribute('aria-label',this.getAttribute('label')||'Содержимое документа');
  this.#article.classList.toggle('md-wrap-code',this.hasAttribute('code-wrap'));
  if(!this.value.trim()){
   const empty=document.createElement('p');empty.className='md-empty';empty.textContent=this.getAttribute('empty-text')??'Пока нет содержимого.';this.#article.replaceChildren(empty);return;
  }
  try{this.#article.innerHTML=safeMarkdown(this.value,{headingLevel:this.headingLevel});if(this.interactiveTasks)this.bindTasks();}
  catch(error){const p=document.createElement('p');p.className='md-render-error';p.setAttribute('role','alert');p.textContent=error.message;this.#article.replaceChildren(p);}
 }
}
function registerMarkdownViewer(){if(!customElements.get('iq-markdown-viewer'))customElements.define('iq-markdown-viewer',IqMarkdownViewer);}
Object.assign(exports,{IqMarkdownViewer,registerMarkdownViewer});
