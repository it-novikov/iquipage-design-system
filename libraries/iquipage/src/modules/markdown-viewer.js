'use strict';
const {safeMarkdown}=require('./markdown.js');
let viewerSequence=0;
/** Read-only text projection. Setting value never requests or confirms an application action. */
class IqMarkdownViewer extends HTMLElement {
 static get observedAttributes(){return ['value','label','empty-text','heading-level','code-wrap','interactive-tasks'];}
 get interactiveTasks(){return this.hasAttribute('interactive-tasks')}
 /** vnext.37: 'compact' reads at the size, line height and heading scale of a compact editor's preview (task descriptions). */
 get density(){return this.getAttribute('density')==='compact'?'compact':'comfortable';}
 set density(value){if(!['compact','comfortable'].includes(value))throw new TypeError('Unsupported viewer density');this.setAttribute('density',value);}
 set interactiveTasks(v){this.toggleAttribute('interactive-tasks',!!v)}
 #value;
 #article;
 #mentions=null;
 #outline=[];
 #anchors=new Map();
 #namespace='iq-document-'+(++viewerSequence);
 get headings(){return this.#outline.map(item=>({...item}));}
 focusHeading(id,{scroll=true}={}){
  const node=this.#anchors.get(id);
  if(!this.isConnected||!node?.isConnected)return false;
  node.tabIndex=-1;node.focus({preventScroll:true});
  if(scroll)node.scrollIntoView({block:'start',behavior:'auto'});
  return true;
 }
 updateOutline(){
  const next=[];this.#anchors.clear();
  for(const node of this.#article.querySelectorAll('h1,h2,h3,h4,h5,h6')){
   const id='heading-'+(next.length+1);node.id=this.#namespace+'-'+id;
   next.push({id,level:Number(node.tagName[1]),text:node.textContent});this.#anchors.set(id,node);
  }
  if(JSON.stringify(next)===JSON.stringify(this.#outline))return;
  this.#outline=next;this.dispatchEvent(new CustomEvent('iq-outline-change',{bubbles:true,composed:true,detail:{headings:this.headings}}));
 }
 /** Members for mention tokens (vnext.29): an array of {id, name, kind?} or a function id → {name, kind?} | null. With
  *  members a token shows the member's current name and a token naming anyone else is plain text; null shows the
  *  stored label. */
 get mentions(){return this.#mentions;}
 set mentions(value){if(value!=null&&!Array.isArray(value)&&typeof value!=='function')throw new TypeError('mentions: an array, a function or null');this.#mentions=value??null;if(this.isConnected)this.render();}
 connectedCallback(){
  for(const name of ['value','mentions','density'])if(Object.prototype.hasOwnProperty.call(this,name)){const v=this[name];delete this[name];this[name]=v;}
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
   const empty=document.createElement('p');empty.className='md-empty';empty.textContent=this.getAttribute('empty-text')??'Пока нет содержимого.';this.#article.replaceChildren(empty);this.updateOutline();return;
  }
  try{this.#article.innerHTML=safeMarkdown(this.value,{headingLevel:this.headingLevel,mentions:this.#mentions??undefined});if(this.interactiveTasks)this.bindTasks();}
  catch(error){const p=document.createElement('p');p.className='md-render-error';p.setAttribute('role','alert');p.textContent=error.message;this.#article.replaceChildren(p);}
  this.updateOutline();
 }
}
function registerMarkdownViewer(){if(!customElements.get('iq-markdown-viewer'))customElements.define('iq-markdown-viewer',IqMarkdownViewer);}
Object.assign(exports,{IqMarkdownViewer,registerMarkdownViewer});
