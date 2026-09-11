/** Owner-approved v3 shared DS candidate. Patches only the copied build tree. */
export async function applyUXV3(patch){
  await patch('src/modules/board-motion.js',"card.querySelector('.task-card-footer').outerHTML","(card.querySelector('.task-card-footer')?.outerHTML||'')");
  await patch('src/modules/whiteboard-studio.js',' edit(id){',` edit(id){
  if(this.editorMode==='host'){const object=this.data.objects.find(o=>o.id===id);if(object)this.emit('iq-edit-object',{id,object:B.clone(object)});return;}`);
  await patch('src/modules/whiteboard-studio.js',' editConnection(id){const edge=',` editConnection(id){if(this.editorMode==='host'){this.emit('iq-edit-object',{id});return;}const edge=`);
  await patch('src/modules/whiteboard.js',"if(e.key==='0'){e.preventDefault();", "if(e.shiftKey&&(e.code==='Digit1'||e.code==='Digit2')){e.preventDefault();e.code==='Digit2'?this.fit(this.selection):this.fit();return;}if(e.key==='0'){e.preventDefault();");
  await patch('src/modules/image-crop.js','function cropRect(width,height,zoom=1,x=.5,y=.5){','function cropRect(width,height,zoom=1,x=.5,y=.5,aspectRatio=1){');
  await patch('src/modules/image-crop.js','const side=Math.min(width,height)/clamp(zoom,1,4);\n return{x:clamp(x,0,1)*(width-side),y:clamp(y,0,1)*(height-side),width:side,height:side};',`if(!Number.isFinite(aspectRatio)||aspectRatio<.1||aspectRatio>10)throw new RangeError('Соотношение сторон: 0.1–10');
 const cw=Math.min(width,height*aspectRatio)/clamp(zoom,1,4),ch=cw/aspectRatio;
 return{x:clamp(x,0,1)*(width-cw),y:clamp(y,0,1)*(height-ch),width:cw,height:ch};`);
  await patch('src/modules/image-crop.js',"static get observedAttributes(){return ['disabled','readonly','eyebrow','title','subtitle','placeholder']}",`static get observedAttributes(){return ['disabled','readonly','eyebrow','title','subtitle','placeholder','aspect-ratio']}
 get aspectRatio(){const v=Number(this.getAttribute('aspect-ratio')||1);return Number.isFinite(v)&&v>=.1&&v<=10?v:1}
 set aspectRatio(v){if(!Number.isFinite(v)||v<.1||v>10)throw new RangeError('aspectRatio: 0.1–10');this.setAttribute('aspect-ratio',String(v));}`);
  await patch('src/modules/image-crop.js','this.zoom,this.x,this.y)}','this.zoom,this.x,this.y,this.aspectRatio)}');
  await patch('src/modules/image-crop.js',"Math.abs(v.width-v.height)>.01)throw new TypeError('Кадр: квадрат с конечными координатами');","Math.abs(v.width/v.height-this.aspectRatio)>.001)throw new TypeError('Кадр: заданное соотношение сторон и конечные координаты');");
  await patch('src/modules/image-crop.js','z=Math.min(w,h)/v.width;','z=Math.min(w,h*this.aspectRatio)/v.width;');
  await patch('src/modules/image-crop.js','attributeChangedCallback(name){this.updateContent();',"attributeChangedCallback(name){if(name==='aspect-ratio'){this.zoom=1;this.x=this.y=.5;if(this.pending){this.epoch++;this.requestAbort?.abort();this.pending=false;}}this.updateContent();");
  await patch('src/modules/image-crop.js',"const r=this.value,c=document.createElement('canvas');c.width=c.height=size;","const r=this.value,c=document.createElement('canvas');c.width=Math.max(1,Math.round(size*Math.min(1,this.aspectRatio)));c.height=Math.max(1,Math.round(size/Math.max(1,this.aspectRatio)));");
  await patch('src/modules/image-crop.js','ctx.drawImage(this.image,r.x,r.y,r.width,r.height,0,0,size,size);','ctx.drawImage(this.image,r.x,r.y,r.width,r.height,0,0,c.width,c.height);');
  await patch('src/modules/image-crop.js',"const stage=this.querySelector('.iq-crop-stage');stage.classList",`const stage=this.querySelector('.iq-crop-stage');stage.style.aspectRatio=String(this.aspectRatio);
  this.querySelector('.iq-crop-mask').style.borderRadius=this.aspectRatio===1?'50%':'0';
  this.querySelector('.iq-crop-controls small').textContent=this.aspectRatio===1?'Результат — квадрат 512 × 512 px. Круг показывает вид аватара.':'Прямоугольный кадр. Оригинал останется без изменений.';
  stage.classList`);
  await patch('src/modules/image-crop.js','c.width=c.height=Math.round(size*dpr);','c.width=Math.round(size*dpr);c.height=Math.max(1,Math.round(size*dpr/this.aspectRatio));');
  await patch('src/modules/markdown-viewer.js',"return ['value','label','empty-text','heading-level','code-wrap'];","return ['value','label','empty-text','heading-level','code-wrap','interactive-tasks'];");
  await patch('src/modules/markdown-viewer.js',' #value;',` get interactiveTasks(){return this.hasAttribute('interactive-tasks')}
 set interactiveTasks(v){this.toggleAttribute('interactive-tasks',!!v)}
 #value;`);
  await patch('src/modules/markdown-viewer.js','try{this.#article.innerHTML=safeMarkdown(this.value,{headingLevel:this.headingLevel});}',`try{this.#article.innerHTML=safeMarkdown(this.value,{headingLevel:this.headingLevel});if(this.interactiveTasks)this.bindTasks();}`);
  await patch('src/modules/markdown-viewer.js',' render(){',` bindTasks(){
  const source=this.value,marks=[...this.#article.querySelectorAll('.md-task-mark')],positions=[];
  let offset=0,fence=null;
  for(const line of source.split('\\n')){
   const content=line.replace(/^\\s*(?:>\\s*)*/,''),f=/^(\u0060{3,}|~{3,})/.exec(content);
   if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence=null;}
   else if(!fence){const m=/^(?:\\s*>)*\\s*(?:[-+*]|\\d+[.)])\\s+\\[([ xX])\\]\\s+/.exec(line);if(m)positions.push(offset+m[0].lastIndexOf('[')+1);}
   offset+=line.length+1;
  }
  // Never guess which source item a rendered control represents.
  if(positions.length!==marks.length)return;
  marks.forEach((mark,index)=>{const button=document.createElement('button');button.type='button';button.className=mark.className;button.textContent=mark.textContent;button.setAttribute('role','checkbox');button.setAttribute('aria-checked',String(source[positions[index]].toLowerCase()==='x'));button.setAttribute('aria-label',mark.parentElement.textContent.replace('✓','').trim());button.addEventListener('click',event=>{event.stopPropagation();if(this.value!==source||!this.interactiveTasks)return;const position=positions[index],checked=source[position].toLowerCase()!=='x';this.dispatchEvent(new CustomEvent('iq-task-toggle',{bubbles:true,composed:true,detail:{source,position,checked,value:source.slice(0,position)+(checked?'x':' ')+source.slice(position+1)}}));});mark.replaceWith(button);});
 }
 render(){`);
}
