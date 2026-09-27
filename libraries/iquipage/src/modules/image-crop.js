'use strict';
const {icon}=require('./components.js'),C=require('./advanced-core.js'),{escape}=C;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
/** Source-pixel crop of the given aspect ratio. zoom 1 fills the frame (the largest frame inside the image);
 *  with letterbox the zoom may go down to minZoom, where the frame contains the whole image on one axis.
 *  Per axis the frame lies inside the image or contains it; x and y are positions (0–1) within that range. */
function cropRect(width,height,zoom=1,x=.5,y=.5,aspectRatio=1,minZoom=1){
 if(![width,height,zoom,x,y].every(Number.isFinite)||width<=0||height<=0)throw new TypeError('Некорректная геометрия изображения');
 if(!Number.isFinite(aspectRatio)||aspectRatio<.1||aspectRatio>10)throw new RangeError('Соотношение сторон: 0.1–10');
 const cw=Math.min(width,height*aspectRatio)/clamp(zoom,Math.min(1,minZoom),4),ch=cw/aspectRatio;
 const place=(position,size,full)=>{const lo=Math.min(0,full-size),hi=Math.max(0,full-size);return lo+clamp(position,0,1)*(hi-lo);};
 return{x:place(x,cw,width),y:place(y,ch,height),width:cw,height:ch};
}
/** The zoom at which the frame just contains the whole image ("Вписать"). */
function fitZoom(width,height,aspectRatio){return Math.min(width,height*aspectRatio)/Math.max(width,height*aspectRatio);}
class IqImageCrop extends HTMLElement{
 static get observedAttributes(){return ['disabled','readonly','eyebrow','heading','description','title','subtitle','placeholder','aspect-ratio','appearance','letterbox','chooser']}
 get aspectRatio(){const v=Number(this.getAttribute('aspect-ratio')||1);return Number.isFinite(v)&&v>=.1&&v<=10?v:1}
 set aspectRatio(v){if(!Number.isFinite(v)||v<.1||v>10)throw new RangeError('aspectRatio: 0.1–10');this.setAttribute('aspect-ratio',String(v));}
 constructor(){super();this.image=null;this._source=null;this.zoom=1;this.x=.5;this.y=.5;this.loading=false;this.pending=false;this.message='';this.error='';this.epoch=0;this.decodeEpoch=0;this.controlled=false;this.frame=0;this.interacting=false;this.pointers=new Map()}
 get bare(){return this.getAttribute('appearance')==='bare'}
 get letterbox(){return this.hasAttribute('letterbox')}
 get disabled(){return this.hasAttribute('disabled')}set disabled(v){this.toggleAttribute('disabled',!!v)}
 get readonly(){return this.hasAttribute('readonly')}set readonly(v){this.toggleAttribute('readonly',!!v)}
 get locked(){return this.disabled||this.readonly||this.loading||this.pending||!this.image}
 get source(){return this._source}set source(file){this.load(file)}
 get minZoom(){return this.image&&this.letterbox?fitZoom(this.image.naturalWidth,this.image.naturalHeight,this.aspectRatio):1}
 get fitZoom(){return this.image?fitZoom(this.image.naturalWidth,this.image.naturalHeight,this.aspectRatio):1}
 get value(){if(!this.image)return null;return cropRect(this.image.naturalWidth,this.image.naturalHeight,this.zoom,this.x,this.y,this.aspectRatio,this.minZoom)}
 set value(v){
  if(!this.image||!v||![v.x,v.y,v.width,v.height].every(Number.isFinite)||v.width<=0||Math.abs(v.width/v.height-this.aspectRatio)>.001*this.aspectRatio)throw new TypeError('Кадр: заданное соотношение сторон и конечные координаты');
  const w=this.image.naturalWidth,h=this.image.naturalHeight,z=Math.min(w,h*this.aspectRatio)/v.width;
  const axis=(p,s,full)=>s<=full+.01?p>=-.01&&p+s<=full+.01:p<=.01&&p+s>=full-.01;
  if(z<this.minZoom-.001||z>4.001||!axis(v.x,v.width,w)||!axis(v.y,v.height,h))throw new RangeError('Кадр выходит за изображение или допустимый масштаб');
  if(this.pending){this.epoch++;this.requestAbort?.abort();this.pending=false;}
  this.zoom=clamp(z,this.minZoom,4);const pos=(p,s,full)=>{const lo=Math.min(0,full-s),hi=Math.max(0,full-s);return hi===lo?.5:clamp((p-lo)/(hi-lo),0,1);};
  this.x=pos(v.x,v.width,w);this.y=pos(v.y,v.height,h);this.paint();
 }
 /** The crop as fractions of the image; negative offsets and sizes above 1 mean the frame contains the image. */
 get normalizedValue(){const r=this.value;if(!r)return null;const w=this.image.naturalWidth,h=this.image.naturalHeight;return{x:r.x/w,y:r.y/h,width:r.width/w,height:r.height/h}}
 set normalizedValue(v){if(!this.image||!v)throw new TypeError('Сначала загрузите изображение');const w=this.image.naturalWidth,h=this.image.naturalHeight;this.value={x:v.x*w,y:v.y*h,width:v.width*w,height:v.width*w/this.aspectRatio};}
 /** fill: the frame is covered edge to edge; contain: the whole image is inside the frame; auto: fill when the image
  *  is within ±15% of the frame's aspect, otherwise contain (a screenshot or a logo arrives whole). */
 fit(mode='auto'){
  if(!this.image)return;const ratio=this.image.naturalWidth/this.image.naturalHeight,near=Math.abs(ratio/this.aspectRatio-1)<=.15;
  const contain=mode==='contain'||mode==='auto'&&!near;this.zoom=contain&&this.letterbox?this.minZoom:1;this.x=this.y=.5;this.paint();this.emit('iq-crop-change',this.changeDetail());
 }
 get mode(){if(!this.image)return null;if(Math.abs(this.zoom-1)<.005)return'fill';if(this.letterbox&&Math.abs(this.zoom-this.minZoom)<.005)return'contain';return null}
 changeDetail(){return{crop:this.value,normalized:this.normalizedValue,zoom:this.zoom,mode:this.mode}}
 get content(){return {eyebrow:this.getAttribute('eyebrow')||'ИЗОБРАЖЕНИЕ',title:this.getAttribute('heading')||'Выберите кадр',subtitle:this.getAttribute('description')||'Переместите изображение и настройте масштаб. Оригинал не изменяется.',placeholder:this.getAttribute('placeholder')||'Выберите изображение'};}
 /** heading/description, never the global HTML title (a title attribute would show as a native tooltip everywhere). */
 set content(v){if(!v||Object.entries(v).some(([k,s])=>!['eyebrow','title','subtitle','heading','description','placeholder'].includes(k)||typeof s!=='string'))throw new TypeError('content: eyebrow/heading/description/placeholder');for(const[k,s]of Object.entries(v))this.setAttribute({title:'heading',subtitle:'description'}[k]||k,s);}
 updateContent(){const c=this.content;for(const[k,sel]of Object.entries({eyebrow:'.iq-pro-eyebrow',title:'.iq-pro-toolbar h3',subtitle:'.iq-pro-subtitle',placeholder:'.iq-crop-placeholder b'})){const el=this.querySelector(sel);if(el)el.textContent=c[k];}}
 attributeChangedCallback(name,_old,value){
  if(name==='title'&&value!==null){console.warn('iq-image-crop: use heading, not title');this.removeAttribute('title');this.setAttribute('heading',value);return}
  if(name==='subtitle'&&value!==null){this.removeAttribute('subtitle');this.setAttribute('description',value);return}
  if(['appearance','letterbox','chooser'].includes(name)&&this.isConnected&&this.querySelector('.iq-crop-stage')){this.render();this.observe();}
  if(name==='aspect-ratio'){this.zoom=1;this.x=this.y=.5;if(this.pending){this.epoch++;this.requestAbort?.abort();this.pending=false;}}
  this.updateContent();if(['readonly','disabled'].includes(name)&&this.locked){this.stopGesture?.();if(this.pending){this.epoch++;this.requestAbort?.abort();this.pending=false;this.message='Ожидание отменено. Кадр сохранён.'}}this.paint()}
 observe(){this.resizeObserver?.disconnect();this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(this.querySelector('.iq-crop-stage'));}
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();const signal=this.events.signal;
  this.render();this.observe();
  this.addEventListener('change',e=>{if(e.target.matches('[data-crop-file]')){const f=e.target.files?.[0];if(f)this.load(f).then(ok=>{if(ok&&this.bare)this.fit('auto')})}},{signal});
  this.addEventListener('input',e=>{const k=e.target.dataset.cropRange;if(!k||this.locked)return;if(k==='zoom'&&this.bare)this.zoomTo(Number(e.target.value));else this[k]=Number(e.target.value);this.error='';this.paint();this.emit('iq-crop-change',this.changeDetail())},{signal});
  this.addEventListener('click',e=>{const b=e.target.closest('[data-crop-action]');if(!b||b.disabled)return;switch(b.dataset.cropAction){
   case'choose':this.querySelector('[data-crop-file]').click();break;
   case'reset':if(!this.locked){if(this.bare)this.fit('auto');else{this.zoom=1;this.x=this.y=.5;this.paint();this.emit('iq-crop-change',this.changeDetail())}}break;
   case'contain':case'fill':if(!this.locked)this.fit(b.dataset.cropAction);break;
   case'zoom-in':case'zoom-out':if(!this.locked){this.zoomTo(this.zoom*(b.dataset.cropAction==='zoom-in'?1.1:1/1.1));this.paint();this.emit('iq-crop-change',this.changeDetail())}break;
   case'apply':this.request();break;
   case'cancel':this.epoch++;this.requestAbort?.abort();this.pending=false;this.message='Ожидание отменено. Кадр сохранён.';this.paint();this.emit('iq-crop-cancel');break}},{signal});
  this.addEventListener('keydown',e=>{if(!e.target.matches('.iq-crop-stage')||this.locked)return;
   if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')this.fit('fill');else{this.zoomTo(this.zoom*(e.key==='-'?1/1.1:1.1));this.paint();this.emit('iq-crop-change',this.changeDetail())}return}
   const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();const r=this.value,step=this.bare?r.width*(e.shiftKey?.1:.01):e.shiftKey?10:1;this.setPosition(r.x+d[0]*step,r.y+d[1]*step);this.paint();this.emit('iq-crop-change',this.changeDetail())},{signal});
  this.addEventListener('pointerdown',e=>this.startGesture(e),{signal});
  this.addEventListener('wheel',e=>{if(!e.target.closest('.iq-crop-stage')||this.locked)return;e.preventDefault();const p=this.stagePoint(e);this.zoomTo(this.zoom*Math.exp(-e.deltaY*.0015),p);this.flash();this.paint();this.emit('iq-crop-change',this.changeDetail())},{signal,passive:false});
  this.addEventListener('dblclick',e=>{if(!e.target.closest('.iq-crop-stage')||this.locked||!this.letterbox)return;this.fit(this.mode==='fill'?'contain':'fill')},{signal});
  if(this._source&&!this.image)this.load(this._source);else this.paint();
 }
 disconnectedCallback(){this.events?.abort();this.resizeObserver?.disconnect();this.stopGesture?.();this.decodeEpoch++;this.epoch++;this.requestAbort?.abort();cancelAnimationFrame(this.frame);clearTimeout(this.guideTimer);if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.image=null;this.loading=false;this.pending=false}
 emit(type,detail={},cancelable=false){return this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true,cancelable}))}
 async load(file){
  const id=++this.decodeEpoch;this.stopGesture?.();this.epoch++;this.requestAbort?.abort();this.pending=false;this.loading=false;
  if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.image=null;this._source=null;this.error='';this.message='';
  if(file===null){this.loading=false;this.paint();return false}
  if(!(file instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>10*1024*1024){this.error='Выберите PNG, JPEG или WebP размером до 10 МБ.';this.paint();return false}
  this.loading=true;this._source=file;this.paint();const url=URL.createObjectURL(file);this.url=url;
  try{const image=new Image();image.src=url;await image.decode();if(id!==this.decodeEpoch)return false;
   if(image.naturalWidth*image.naturalHeight>40000000||Math.min(image.naturalWidth,image.naturalHeight)<32)throw Error('Размер изображения: от 32 px, не более 40 мегапикселей.');
   this.image=image;this.zoom=1;this.x=this.y=.5;this.loading=false;this.paint();this.emit('iq-crop-load',{width:image.naturalWidth,height:image.naturalHeight});this.emit('iq-crop-state',{ready:true,pending:false,error:''});return true;
  }catch(error){if(id!==this.decodeEpoch)return false;this.loading=false;this.error=error.message==='The source image cannot be decoded.'?'Не удалось прочитать изображение. Выберите другой файл.':error.message;URL.revokeObjectURL(url);this.url=null;this._source=null;this.paint();this.emit('iq-crop-state',{ready:false,pending:false,error:this.error});return false}
 }
 setPosition(x,y){const r=this.value,w=this.image.naturalWidth,h=this.image.naturalHeight;const pos=(p,s,full)=>{const lo=Math.min(0,full-s),hi=Math.max(0,full-s);return hi===lo?.5:clamp((p-lo)/(hi-lo),0,1);};this.x=pos(x,r.width,w);this.y=pos(y,r.height,h)}
 /** Zooms keeping the source point under a stage point (the pointer) fixed; snaps to fill and fit within 3%. */
 zoomTo(next,point=null){
  if(!this.image)return;let z=clamp(next,this.minZoom,4);for(const snap of [1,this.letterbox?this.minZoom:null])if(snap&&Math.abs(z/snap-1)<.03)z=snap;
  const before=this.value,g=this.geometry(),inside=point&&g;
  const fx=inside?(point.x-g.frame.x)/g.frame.width:.5,fy=inside?(point.y-g.frame.y)/g.frame.height:.5;
  const at={x:before.x+fx*before.width,y:before.y+fy*before.height};
  this.zoom=z;const after=this.value;this.setPosition(at.x-fx*after.width,at.y-fy*after.height);
 }
 stagePoint(e){const r=this.querySelector('.iq-crop-stage').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
 /** The frame inside the stage (bare: the whole image stays visible around it), in CSS pixels. */
 geometry(){
  const stage=this.querySelector('.iq-crop-stage');if(!stage||!this.image)return null;const W=stage.clientWidth,H=stage.clientHeight,r=this.value;
  if(!this.bare)return{W,H,frame:{x:0,y:0,width:W,height:H},scale:W/r.width};
  const inset=W<480?16:32,A=this.aspectRatio;let fw=W-2*inset,fh=fw/A;if(fh>H-2*inset){fh=H-2*inset;fw=fh*A;}
  const frame={x:(W-fw)/2,y:(H-fh)/2,width:fw,height:fh};return{W,H,frame,scale:fw/r.width};
 }
 flash(){this.interacting=true;clearTimeout(this.guideTimer);this.guideTimer=setTimeout(()=>{this.interacting=false;this.draw()},240)}
 startGesture(e){
  if(e.button!==0||!e.target.closest('.iq-crop-stage')||this.locked)return;e.preventDefault();
  this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size>1)return;
  this.stopGesture?.();this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const r=this.value,start={x:e.clientX,y:e.clientY},g=this.geometry(),scale=1/(g?.scale||1);let pinch=null;
  const gesture=new AbortController(),signal=gesture.signal;this.interacting=true;this.stopGesture=()=>{gesture.abort();this.stopGesture=null;this.pointers.clear();this.interacting=false;this.draw()};
  window.addEventListener('pointermove',ev=>{if(!this.pointers.has(ev.pointerId))return;this.pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
   if(this.pointers.size>1){const [a,b]=[...this.pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mid=this.stagePoint({clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2});if(!pinch)pinch={d,zoom:this.zoom};else{this.zoomTo(pinch.zoom*d/pinch.d,mid);this.paint()}return}
   if(ev.pointerId!==e.pointerId)return;this.setPosition(r.x-(ev.clientX-start.x)*scale,r.y-(ev.clientY-start.y)*scale);this.paint()},{signal});
  window.addEventListener('pointerup',ev=>{this.pointers.delete(ev.pointerId);if(this.pointers.size)return;this.stopGesture?.();this.emit('iq-crop-change',this.changeDetail())},{signal});
  window.addEventListener('pointercancel',()=>{this.value=r;this.stopGesture?.()},{signal,once:true});
  window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();this.value=r;this.stopGesture?.()}},{signal,capture:true});
 }
 async export({size=512,type='image/png',quality=.92}={}){
  if(!this.image||this.loading)throw new Error('Сначала загрузите изображение');if(!Number.isInteger(size)||size<32||size>2048||!['image/png','image/jpeg','image/webp'].includes(type)||!Number.isFinite(quality)||quality<0||quality>1)throw new RangeError('Недопустимые параметры экспорта');
  const r=this.value,c=document.createElement('canvas');c.width=Math.max(1,Math.round(size*Math.min(1,this.aspectRatio)));c.height=Math.max(1,Math.round(size/Math.max(1,this.aspectRatio)));const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const s=c.width/r.width;if(this.letterboxed(r))this.paintBackdrop(ctx,{x:0,y:0,width:c.width,height:c.height});
  ctx.drawImage(this.image,-r.x*s,-r.y*s,this.image.naturalWidth*s,this.image.naturalHeight*s);
  return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось подготовить изображение')),type,quality));
 }
 letterboxed(r){return r.x<-.5||r.y<-.5||r.x+r.width>this.image.naturalWidth+.5||r.y+r.height>this.image.naturalHeight+.5}
 /** A blurred, dimmed copy of the image fills the empty part of a letterboxed frame. */
 paintBackdrop(ctx,box){ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.width,box.height);ctx.clip();const w=this.image.naturalWidth,h=this.image.naturalHeight,s=Math.max(box.width/w,box.height/h)*1.16;ctx.filter=`blur(${Math.round(Math.max(12,box.width/40))}px) brightness(.92) saturate(1.1)`;ctx.drawImage(this.image,box.x+(box.width-w*s)/2,box.y+(box.height-h*s)/2,w*s,h*s);ctx.restore();}
 async request(){
  if(this.locked)return;const crop=this.value;const id=++this.epoch;this.requestAbort?.abort();this.requestAbort=new AbortController();this.pending=true;this.paint();this.emit('iq-crop-state',{ready:true,pending:true,error:''});
  try{const blob=await this.export();if(id!==this.epoch||!this.isConnected)return;let settled=false;const valid=()=>!settled&&id===this.epoch&&this.isConnected;
   const detail={blob,crop,normalized:this.normalizedValue,signal:this.requestAbort.signal,accept:()=>{if(!valid())return false;settled=true;this.pending=false;this.message='Кадр принят приложением.';this.paint();this.emit('iq-crop-result',{blob,crop});this.emit('iq-crop-state',{ready:true,pending:false,error:''});return true},reject:message=>{if(!valid())return false;settled=true;this.pending=false;this.error=String(message||'Изменение не принято. Кадр сохранён.');this.paint();this.emit('iq-crop-state',{ready:true,pending:false,error:this.error});return true}};
   const allowed=this.emit('iq-crop-request',detail,true);if(!this.controlled&&allowed&&!settled){settled=true;this.pending=false;this.message='Кадр подготовлен. Отправка на сервер не выполнялась.';this.paint();this.emit('iq-crop-result',{blob,crop:detail.crop})}else if(!allowed&&!settled){settled=true;this.pending=false;this.paint()}
  }catch(error){if(id===this.epoch){this.pending=false;this.error=error.message;this.paint()}}
 }
 render(){
  const stage=`<div class="iq-crop-stage" tabindex="0" role="group" aria-label="Кадр. Перетащите изображение; колесо или щипок меняют масштаб; стрелки двигают, плюс и минус меняют масштаб."><canvas aria-hidden="true"></canvas><div class="iq-crop-mask" hidden></div><div class="iq-crop-placeholder">${icon('image',32)}<b>${escape(this.content.placeholder)}</b><span>PNG, JPEG или WebP</span></div></div>`;
  if(this.bare){
   // Bare: only the stage and one toolbar row; the host dialog owns the title and the actions.
   const chooser=this.hasAttribute('chooser')?`<span class="iq-crop-spacer"></span><button type="button" class="iq-btn ghost sm" data-crop-action="choose">${icon('upload',16)}<span>Другое изображение</span></button><input type="file" data-crop-file accept="image/png,image/jpeg,image/webp" hidden>`:'';
   this.innerHTML=`<section class="iq-image-crop" data-appearance="bare" aria-label="Кадрирование изображения">${stage}<div class="iq-crop-toolbar">${this.letterbox?`<div class="iq-segmented sm iq-crop-mode" role="group" aria-label="Как расположить изображение"><button type="button" data-crop-action="contain" aria-pressed="false">Вписать</button><button type="button" data-crop-action="fill" aria-pressed="false">Заполнить</button></div>`:''}<div class="iq-crop-zoom"><button type="button" class="iq-btn ghost icon sm" data-crop-action="zoom-out" aria-label="Уменьшить">${icon('minus',16)}</button><input type="range" min="0" max="4" step=".001" data-crop-range="zoom" aria-label="Масштаб"><button type="button" class="iq-btn ghost icon sm" data-crop-action="zoom-in" aria-label="Увеличить">${icon('plus',16)}</button></div><button type="button" class="iq-btn ghost icon sm" data-crop-action="reset" aria-label="Вернуть исходный кадр">${icon('refresh',16)}</button>${chooser}</div><p class="iq-crop-status" data-crop-status role="status" hidden></p></section>`;
   return;
  }
  this.innerHTML=`<section class="iq-pro iq-image-crop" aria-label="Кадрирование изображения"><header class="iq-pro-toolbar"><div><span class="iq-pro-eyebrow">${escape(this.content.eyebrow)}</span><h3>${escape(this.content.title)}</h3><p class="iq-pro-subtitle">${escape(this.content.subtitle)}</p></div></header><div class="iq-crop-layout">${stage}<div class="iq-crop-controls"><button type="button" class="iq-btn secondary" data-crop-action="choose">Выбрать изображение ${icon('upload',17)}</button><input type="file" data-crop-file accept="image/png,image/jpeg,image/webp" hidden>${[['zoom','Масштаб',1,4,.01],['x','По горизонтали',0,1,.001],['y','По вертикали',0,1,.001]].map(([key,label,min,max,step])=>`<label class="iq-crop-range"><span>${label}<output data-crop-output="${key}"></output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${this[key]}" data-crop-range="${key}" aria-label="${label}"></label>`).join('')}<button type="button" class="iq-btn ghost sm" data-crop-action="reset">По центру ${icon('refresh',16)}</button><small>Результат — квадрат 512 × 512 px. Круг показывает вид аватара.</small></div></div><footer class="iq-crop-footer"><p data-crop-status role="status"></p><div class="iq-pro-actions"><button type="button" class="iq-btn secondary sm" data-crop-action="cancel" hidden>Отменить ожидание</button><button type="button" class="iq-btn primary sm" data-crop-action="apply">Использовать кадр ${icon('check',16)}</button></div></footer></section>`;
 }
 paint(){if(!this.isConnected||!this.querySelector('canvas'))return;
  const stage=this.querySelector('.iq-crop-stage');stage.classList.toggle('has-image',!!this.image);stage.setAttribute('aria-busy',String(this.loading));
  this.querySelector('.iq-crop-placeholder').hidden=!!this.image;
  const msg=this.querySelector('[data-crop-status]');
  if(this.bare){
   const range=this.querySelector('[data-crop-range=zoom]');if(range){range.min=String(this.minZoom);range.max='4';range.value=String(this.zoom);range.disabled=this.locked;range.setAttribute('aria-valuetext',`Масштаб ${Math.round(this.zoom*100)}%`);}
   for(const b of this.querySelectorAll('[data-crop-action]'))if(b.dataset.cropAction!=='choose')b.disabled=this.locked;
   for(const b of this.querySelectorAll('.iq-crop-mode [data-crop-action]'))b.setAttribute('aria-pressed',String(this.mode===b.dataset.cropAction));
   const choose=this.querySelector('[data-crop-action=choose]');if(choose)choose.disabled=this.disabled||this.readonly||this.pending;
   msg.textContent=this.error||(this.loading?'Читаем изображение…':this.pending?'Сохраняем кадр…':'');msg.classList.toggle('iq-pro-error',!!this.error);msg.setAttribute('role',this.error?'alert':'status');msg.hidden=!msg.textContent;
   this.draw();return;
  }
  stage.style.aspectRatio=String(this.aspectRatio);
  this.querySelector('.iq-crop-mask').style.borderRadius=this.aspectRatio===1?'50%':'0';
  this.querySelector('.iq-crop-controls small').textContent=this.aspectRatio===1?'Результат — квадрат 512 × 512 px. Круг показывает вид аватара.':'Прямоугольный кадр. Оригинал останется без изменений.';
  this.querySelector('.iq-crop-mask').hidden=!this.image;
  for(const input of this.querySelectorAll('[data-crop-range]')){input.disabled=this.locked||input.dataset.cropRange==='x'&&this.value?.width===this.image?.naturalWidth||input.dataset.cropRange==='y'&&this.value?.height===this.image?.naturalHeight;input.value=String(this[input.dataset.cropRange]);this.querySelector(`[data-crop-output="${input.dataset.cropRange}"]`).textContent=Math.round((input.dataset.cropRange==='zoom'?this.zoom:this[input.dataset.cropRange])*100)+'%'}
  this.querySelector('[data-crop-action=apply]').disabled=this.locked;this.querySelector('[data-crop-action=reset]').disabled=this.locked;this.querySelector('[data-crop-action=choose]').disabled=this.disabled||this.readonly||this.pending;this.querySelector('[data-crop-action=cancel]').hidden=!this.pending;
  msg.textContent=this.error||(this.loading?'Читаем изображение…':this.pending?'Ожидаем принятия кадра…':this.message||'Файл остаётся на устройстве.');msg.classList.toggle('iq-pro-error',!!this.error);msg.setAttribute('role',this.error?'alert':'status');this.draw();
 }
 draw(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>{if(!this.isConnected)return;const c=this.querySelector('canvas');if(!c)return;const dpr=Math.min(devicePixelRatio||1,2),ctx=c.getContext('2d');
  if(!this.bare){const size=Math.max(1,c.parentElement.clientWidth);c.width=Math.round(size*dpr);c.height=Math.max(1,Math.round(size*dpr/this.aspectRatio));ctx.clearRect(0,0,c.width,c.height);if(this.image){const r=this.value,s=c.width/r.width;ctx.imageSmoothingQuality='high';if(this.letterboxed(r))this.paintBackdrop(ctx,{x:0,y:0,width:c.width,height:c.height});ctx.drawImage(this.image,-r.x*s,-r.y*s,this.image.naturalWidth*s,this.image.naturalHeight*s)}return}
  const stage=c.parentElement,W=Math.max(1,stage.clientWidth),H=Math.max(1,stage.clientHeight);c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const g=this.geometry();if(!g)return;const r=this.value,{frame,scale}=g,iw=this.image.naturalWidth*scale,ih=this.image.naturalHeight*scale,ix=frame.x-r.x*scale,iy=frame.y-r.y*scale;
  ctx.imageSmoothingQuality='high';
  if(this.letterboxed(r))this.paintBackdrop(ctx,frame);
  ctx.drawImage(this.image,ix,iy,iw,ih);
  // Everything outside the frame stays visible under a scrim, so the user sees what is cut away.
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.rect(frame.x,frame.y,frame.width,frame.height);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fill('evenodd');ctx.restore();
  ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1;ctx.strokeRect(frame.x-1.5,frame.y-1.5,frame.width+3,frame.height+3);
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(frame.x,frame.y,frame.width,frame.height);
  if(this.interacting){ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=1;ctx.beginPath();for(const k of [1,2]){ctx.moveTo(frame.x+frame.width*k/3,frame.y);ctx.lineTo(frame.x+frame.width*k/3,frame.y+frame.height);ctx.moveTo(frame.x,frame.y+frame.height*k/3);ctx.lineTo(frame.x+frame.width,frame.y+frame.height*k/3);}ctx.stroke();}
 })}
}
Object.assign(exports,{IqImageCrop,cropRect,fitZoom});
