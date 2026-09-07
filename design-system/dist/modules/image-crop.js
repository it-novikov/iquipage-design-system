import dep0 from './components.js';
import dep1 from './advanced-core.js';
const exports={};
const deps={"./components.js":dep0,"./advanced-core.js":dep1};
(function(exports,require){
'use strict';
const {icon}=require('./components.js'),C=require('./advanced-core.js'),{escape}=C;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
/** Source-pixel square crop. Shared by pointer, numeric controls and output. */
function cropRect(width,height,zoom=1,x=.5,y=.5){
 if(![width,height,zoom,x,y].every(Number.isFinite)||width<=0||height<=0)throw new TypeError('Некорректная геометрия изображения');
 const side=Math.min(width,height)/clamp(zoom,1,4);
 return{x:clamp(x,0,1)*(width-side),y:clamp(y,0,1)*(height-side),width:side,height:side};
}
class IqImageCrop extends HTMLElement{
 static get observedAttributes(){return ['disabled','readonly','eyebrow','title','subtitle','placeholder']}
 constructor(){super();this.image=null;this._source=null;this.zoom=1;this.x=.5;this.y=.5;this.loading=false;this.pending=false;this.message='';this.error='';this.epoch=0;this.decodeEpoch=0;this.controlled=false;this.frame=0}
 get disabled(){return this.hasAttribute('disabled')}set disabled(v){this.toggleAttribute('disabled',!!v)}
 get readonly(){return this.hasAttribute('readonly')}set readonly(v){this.toggleAttribute('readonly',!!v)}
 get locked(){return this.disabled||this.readonly||this.loading||this.pending||!this.image}
 get source(){return this._source}set source(file){this.load(file)}
 get value(){if(!this.image)return null;return cropRect(this.image.naturalWidth,this.image.naturalHeight,this.zoom,this.x,this.y)}
 set value(v){
  if(!this.image||!v||![v.x,v.y,v.width,v.height].every(Number.isFinite)||v.width<=0||Math.abs(v.width-v.height)>.01)throw new TypeError('Кадр: квадрат с конечными координатами');
  const w=this.image.naturalWidth,h=this.image.naturalHeight,z=Math.min(w,h)/v.width;
  if(z<1||z>4||v.x<0||v.y<0||v.x+v.width>w+.01||v.y+v.height>h+.01)throw new RangeError('Кадр выходит за изображение или допустимый масштаб');
  if(this.pending){this.epoch++;this.requestAbort?.abort();this.pending=false;}this.zoom=z;this.x=w===v.width?.5:v.x/(w-v.width);this.y=h===v.height?.5:v.y/(h-v.height);this.paint();
 }
 get content(){return {eyebrow:this.getAttribute('eyebrow')||'ИЗОБРАЖЕНИЕ',title:this.getAttribute('title')||'Выберите кадр',subtitle:this.getAttribute('subtitle')||'Переместите изображение и настройте масштаб. Оригинал не изменяется.',placeholder:this.getAttribute('placeholder')||'Выберите изображение'};}
 set content(v){if(!v||Object.entries(v).some(([k,s])=>!['eyebrow','title','subtitle','placeholder'].includes(k)||typeof s!=='string'))throw new TypeError('content: eyebrow/title/subtitle/placeholder');for(const[k,s]of Object.entries(v))this.setAttribute(k,s);}
 updateContent(){const c=this.content;for(const[k,sel]of Object.entries({eyebrow:'.iq-pro-eyebrow',title:'.iq-pro-toolbar h3',subtitle:'.iq-pro-subtitle',placeholder:'.iq-crop-placeholder b'})){const el=this.querySelector(sel);if(el)el.textContent=c[k];}}
 attributeChangedCallback(name){this.updateContent();if(['readonly','disabled'].includes(name)&&this.locked){this.stopGesture?.();if(this.pending){this.epoch++;this.requestAbort?.abort();this.pending=false;this.message='Ожидание отменено. Кадр сохранён.'}}this.paint()}
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();const signal=this.events.signal;
  this.render();this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(this.querySelector('.iq-crop-stage'));
  this.addEventListener('change',e=>{if(e.target.matches('[data-crop-file]')){const f=e.target.files?.[0];if(f)this.load(f)}},{signal});
  this.addEventListener('input',e=>{const k=e.target.dataset.cropRange;if(!k||this.locked)return;this[k]=Number(e.target.value);this.error='';this.paint();this.emit('iq-crop-change',{crop:this.value})},{signal});
  this.addEventListener('click',e=>{const b=e.target.closest('[data-crop-action]');if(!b||b.disabled)return;switch(b.dataset.cropAction){case'choose':this.querySelector('[data-crop-file]').click();break;case'reset':if(!this.locked){this.zoom=1;this.x=this.y=.5;this.paint();this.emit('iq-crop-change',{crop:this.value})}break;case'apply':this.request();break;case'cancel':this.epoch++;this.requestAbort?.abort();this.pending=false;this.message='Ожидание отменено. Кадр сохранён.';this.paint();this.emit('iq-crop-cancel');break}},{signal});
  this.addEventListener('keydown',e=>{if(!e.target.matches('.iq-crop-stage')||this.locked)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();const r=this.value,step=e.shiftKey?10:1;this.setPosition(r.x+d[0]*step,r.y+d[1]*step);this.paint();this.emit('iq-crop-change',{crop:this.value})},{signal});
  this.addEventListener('pointerdown',e=>this.startGesture(e),{signal});
  if(this._source&&!this.image)this.load(this._source);else this.paint();
 }
 disconnectedCallback(){this.events?.abort();this.resizeObserver?.disconnect();this.stopGesture?.();this.decodeEpoch++;this.epoch++;this.requestAbort?.abort();cancelAnimationFrame(this.frame);if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.image=null;this.loading=false;this.pending=false}
 emit(type,detail={},cancelable=false){return this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true,cancelable}))}
 async load(file){
  const id=++this.decodeEpoch;this.stopGesture?.();this.epoch++;this.requestAbort?.abort();this.pending=false;this.loading=false;
  if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.image=null;this._source=null;this.error='';this.message='';
  if(file===null){this.loading=false;this.paint();return false}
  if(!(file instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>10*1024*1024){this.error='Выберите PNG, JPEG или WebP размером до 10 МБ.';this.paint();return false}
  this.loading=true;this._source=file;this.paint();const url=URL.createObjectURL(file);this.url=url;
  try{const image=new Image();image.src=url;await image.decode();if(id!==this.decodeEpoch)return false;
   if(image.naturalWidth*image.naturalHeight>40000000||Math.min(image.naturalWidth,image.naturalHeight)<32)throw Error('Размер изображения: от 32 px, не более 40 мегапикселей.');
   this.image=image;this.zoom=1;this.x=this.y=.5;this.loading=false;this.paint();this.emit('iq-crop-load',{width:image.naturalWidth,height:image.naturalHeight});return true;
  }catch(error){if(id!==this.decodeEpoch)return false;this.loading=false;this.error=error.message==='The source image cannot be decoded.'?'Не удалось прочитать изображение. Выберите другой файл.':error.message;URL.revokeObjectURL(url);this.url=null;this._source=null;this.paint();return false}
 }
 setPosition(x,y){const r=this.value,w=this.image.naturalWidth,h=this.image.naturalHeight;this.x=w===r.width?.5:clamp(x/(w-r.width),0,1);this.y=h===r.height?.5:clamp(y/(h-r.height),0,1)}
 startGesture(e){
  if(e.button!==0||!e.target.closest('.iq-crop-stage')||this.locked)return;e.preventDefault();this.stopGesture?.();const stage=this.querySelector('.iq-crop-stage'),r=this.value,start={x:e.clientX,y:e.clientY},scale=r.width/stage.clientWidth;
  const gesture=new AbortController(),signal=gesture.signal;this.stopGesture=()=>{gesture.abort();this.stopGesture=null};
  window.addEventListener('pointermove',ev=>{if(ev.pointerId!==e.pointerId)return;this.setPosition(r.x-(ev.clientX-start.x)*scale,r.y-(ev.clientY-start.y)*scale);this.paint()},{signal});
  window.addEventListener('pointerup',ev=>{if(ev.pointerId!==e.pointerId)return;this.stopGesture?.();this.emit('iq-crop-change',{crop:this.value})},{signal});
  window.addEventListener('pointercancel',()=>{this.value=r;this.stopGesture?.()},{signal,once:true});
  window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();this.value=r;this.stopGesture?.()}},{signal,capture:true});
 }
 async export({size=512,type='image/png',quality=.92}={}){
  if(!this.image||this.loading)throw new Error('Сначала загрузите изображение');if(!Number.isInteger(size)||size<32||size>2048||!['image/png','image/jpeg','image/webp'].includes(type)||!Number.isFinite(quality)||quality<0||quality>1)throw new RangeError('Недопустимые параметры экспорта');
  const r=this.value,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(this.image,r.x,r.y,r.width,r.height,0,0,size,size);
  return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось подготовить изображение')),type,quality));
 }
 async request(){
  if(this.locked)return;const crop=this.value;const id=++this.epoch;this.requestAbort?.abort();this.requestAbort=new AbortController();this.pending=true;this.paint();
  try{const blob=await this.export();if(id!==this.epoch||!this.isConnected)return;let settled=false;const valid=()=>!settled&&id===this.epoch&&this.isConnected;
   const detail={blob,crop,signal:this.requestAbort.signal,accept:()=>{if(!valid())return false;settled=true;this.pending=false;this.message='Кадр принят приложением.';this.paint();this.emit('iq-crop-result',{blob,crop});return true},reject:message=>{if(!valid())return false;settled=true;this.pending=false;this.error=String(message||'Изменение не принято. Кадр сохранён.');this.paint();return true}};
   const allowed=this.emit('iq-crop-request',detail,true);if(!this.controlled&&allowed&&!settled){settled=true;this.pending=false;this.message='Кадр подготовлен. Отправка на сервер не выполнялась.';this.paint();this.emit('iq-crop-result',{blob,crop:detail.crop})}else if(!allowed&&!settled){settled=true;this.pending=false;this.paint()}
  }catch(error){if(id===this.epoch){this.pending=false;this.error=error.message;this.paint()}}
 }
 render(){this.innerHTML=`<section class="iq-pro iq-image-crop" aria-label="Кадрирование изображения"><header class="iq-pro-toolbar"><div><span class="iq-pro-eyebrow">${C.escape(this.content.eyebrow)}</span><h3>${C.escape(this.content.title)}</h3><p class="iq-pro-subtitle">${C.escape(this.content.subtitle)}</p></div></header><div class="iq-crop-layout"><div class="iq-crop-stage" tabindex="0" role="group" aria-label="Предпросмотр кадра. Стрелки перемещают на пиксель, Shift — на 10 пикселей."><canvas aria-hidden="true"></canvas><div class="iq-crop-mask" hidden></div><div class="iq-crop-placeholder">${icon('image',32)}<b>${C.escape(this.content.placeholder)}</b><span>PNG, JPEG или WebP</span></div></div><div class="iq-crop-controls"><button type="button" class="iq-btn secondary" data-crop-action="choose">Выбрать изображение ${icon('upload',17)}</button><input type="file" data-crop-file accept="image/png,image/jpeg,image/webp" hidden>${[['zoom','Масштаб',1,4,.01],['x','По горизонтали',0,1,.001],['y','По вертикали',0,1,.001]].map(([key,label,min,max,step])=>`<label class="iq-crop-range"><span>${label}<output data-crop-output="${key}"></output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${this[key]}" data-crop-range="${key}" aria-label="${label}"></label>`).join('')}<button type="button" class="iq-btn ghost sm" data-crop-action="reset">По центру ${icon('refresh',16)}</button><small>Результат — квадрат 512 × 512 px. Круг показывает вид аватара.</small></div></div><footer class="iq-crop-footer"><p data-crop-status role="status"></p><div class="iq-pro-actions"><button type="button" class="iq-btn secondary sm" data-crop-action="cancel" hidden>Отменить ожидание</button><button type="button" class="iq-btn primary sm" data-crop-action="apply">Использовать кадр ${icon('check',16)}</button></div></footer></section>`}
 paint(){if(!this.isConnected||!this.querySelector('canvas'))return;
  const stage=this.querySelector('.iq-crop-stage');stage.classList.toggle('has-image',!!this.image);stage.setAttribute('aria-busy',String(this.loading));
  this.querySelector('.iq-crop-placeholder').hidden=!!this.image;this.querySelector('.iq-crop-mask').hidden=!this.image;
  for(const input of this.querySelectorAll('[data-crop-range]')){input.disabled=this.locked||input.dataset.cropRange==='x'&&this.value?.width===this.image?.naturalWidth||input.dataset.cropRange==='y'&&this.value?.height===this.image?.naturalHeight;input.value=String(this[input.dataset.cropRange]);this.querySelector(`[data-crop-output="${input.dataset.cropRange}"]`).textContent=Math.round((input.dataset.cropRange==='zoom'?this.zoom:this[input.dataset.cropRange])*100)+'%'}
  this.querySelector('[data-crop-action=apply]').disabled=this.locked;this.querySelector('[data-crop-action=reset]').disabled=this.locked;this.querySelector('[data-crop-action=choose]').disabled=this.disabled||this.readonly||this.pending;this.querySelector('[data-crop-action=cancel]').hidden=!this.pending;
  const msg=this.querySelector('[data-crop-status]');msg.textContent=this.error||(this.loading?'Читаем изображение…':this.pending?'Ожидаем принятия кадра…':this.message||'Файл остаётся на устройстве.');msg.classList.toggle('iq-pro-error',!!this.error);msg.setAttribute('role',this.error?'alert':'status');this.draw();
 }
 draw(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>{if(!this.isConnected)return;const c=this.querySelector('canvas');if(!c)return;const size=Math.max(1,c.parentElement.clientWidth),dpr=Math.min(devicePixelRatio||1,2);c.width=c.height=Math.round(size*dpr);const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(this.image){const r=this.value;ctx.imageSmoothingQuality='high';ctx.drawImage(this.image,r.x,r.y,r.width,r.height,0,0,c.width,c.height)}})}
}
Object.assign(exports,{IqImageCrop,cropRect});


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
