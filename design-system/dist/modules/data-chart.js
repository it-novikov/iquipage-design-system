import dep0 from './advanced-core.js';
import dep1 from './components.js';
const exports={};
const deps={"./advanced-core.js":dep0,"./components.js":dep1};
(function(exports,require){
 'use strict';
const C=require('./advanced-core.js'),{icon}=require('./components.js');
let serial=0;
const normalNumbers=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const scientificNumbers=new Intl.NumberFormat('ru-RU',{notation:'scientific',maximumFractionDigits:2});
function formatNumber(v){return (v!==0&&(Math.abs(v)>=1e7||Math.abs(v)<.01)?scientificNumbers:normalNumbers).format(v)}
function chartScale(values){
 const vmin=Math.min(0,...values),vmax=Math.max(0,...values),span0=vmax-vmin;
 if(span0>1e-290&&span0<1e290){
  const raw=span0/4,pow=10**Math.floor(Math.log10(raw)),ratio=raw/pow;
  const step=([1,2,2.5,5,10].find(n=>n>=ratio)||10)*pow,low=Math.floor(vmin/step)*step,high=Math.ceil(vmax/step)*step;
  const count=Math.round((high-low)/step);
  return{maximum:1,low,high,range:high-low||1,ticks:Array.from({length:Math.min(12,count+1)},(_,i)=>low+i*step)};
 }
 const maximum=Math.max(...values.map(Math.abs),0)||1;
 const normalized=values.map(v=>v/maximum),min=Math.min(0,...normalized),max=Math.max(0,...normalized);
 const span=max-min||1,raw=span/4,mag=10**Math.floor(Math.log10(raw)),step=Math.ceil(raw/mag)*mag;
 const low=Math.max(-1,Math.floor(min/step)*step),high=Math.min(1,Math.ceil((max===min?1:max)/step)*step);
 return{maximum,low,high,range:high-low||1,ticks:Array.from({length:5},(_,i)=>low+(high-low)*i/4)};
}
class IqDataChart extends HTMLElement {
 static get observedAttributes(){return ['type','state']}
 constructor(){
  super();this.uid='iq-chart-'+(++serial);this._data={title:'Диаграмма',labels:[],series:[]};this.missing=0;
  this.hiddenSeries=new Set();this.tableOpen=false;this.active={index:0,series:0};this._width=600;this.formatValue=formatNumber;
 }
 get data(){return C.clone(this._data)}
 set data(v){const result=C.chartData(v);this._data=result.data;this.missing=result.missing;this.hiddenSeries=new Set([...this.hiddenSeries].filter(id=>v.series.some(s=>s.id===id)));this.active={index:0,series:0};this.render()}
 get type(){return this.getAttribute('type')==='bar'?'bar':'line'}
 set type(v){if(!['bar','line'].includes(v))throw new TypeError('Вид: line или bar');this.setAttribute('type',v)}
 get state(){return this.getAttribute('state')||'ready'}
 set state(v){if(!['ready','loading','empty','error'].includes(v))throw new TypeError('Неизвестное состояние диаграммы');this.setAttribute('state',v)}
 attributeChangedCallback(){if(this.isConnected)this.render()}
 connectedCallback(){
  this.events?.abort();this.events=new AbortController();const signal=this.events.signal;
  this.addEventListener('click',e=>{
   const b=e.target.closest('[data-chart-action]');
   if(b&&!b.disabled){
    const action=b.dataset.chartAction;
    if(action==='table')this.tableOpen=!this.tableOpen;
    if(action==='legend'){const id=b.dataset.series;this.hiddenSeries.has(id)?this.hiddenSeries.delete(id):this.hiddenSeries.add(id)}
    if(action==='restore')this.hiddenSeries.clear();
    if(action==='retry')this.dispatchEvent(new CustomEvent('iq-retry',{bubbles:true,composed:true}));
    if(action==='type'){this.type=b.dataset.type;return}
    this.render();return;
   }
   const point=e.target.closest('[data-chart-index]');if(point)this.selectPoint(point,true);
  },{signal});
  this.addEventListener('pointerover',e=>{const p=e.target.closest('[data-chart-index]');if(p)this.selectPoint(p,false)},{signal});
  this.addEventListener('focusin',e=>{const p=e.target.closest('[data-chart-index]');if(p)this.selectPoint(p,false)},{signal});
  this.addEventListener('pointerleave',()=>{if(!document.activeElement?.matches?.('[data-chart-index]'))this.hideTooltip()},{signal});
  this.addEventListener('focusout',()=>queueMicrotask(()=>{if(!this.contains(document.activeElement))this.hideTooltip()}),{signal});
  this.addEventListener('keydown',e=>this.keys(e),{signal});
  this.resizeObserver=new ResizeObserver(([entry])=>{
   const w=Math.floor(entry.contentRect.width);
   if(w>0&&w!==this._width){this._width=w;this.render()}
  });this.resizeObserver.observe(this);this.render();
 }
 disconnectedCallback(){this.events?.abort();this.resizeObserver?.disconnect()}
 get series(){return this._data.series.filter(s=>!this.hiddenSeries.has(s.id))}
 render(){
  if(!this.isConnected)return;
  const previous=document.activeElement,focus=this.contains(previous)?{action:previous.dataset.chartAction,type:previous.dataset.type,series:previous.dataset.series,index:previous.dataset.chartIndex,s:previous.dataset.chartSeries}:null;
  this.classList.add('iq-pro-host');const d=this._data,values=this.series.flatMap(s=>s.values).filter(v=>v!==null);
  const ready=this.state==='ready',allHidden=d.series.length>0&&!this.series.length;
  const states={loading:['Загружаем данные','Диаграмма появится после получения рядов.'],error:['Не удалось получить данные','Повторите запрос. Предыдущие значения сейчас не показываются.'],empty:['Нет числовых данных','Передайте ряды с числовыми значениями.']};
  const empty=!values.length||this.state==='empty',st=states[this.state]||states.empty;
  const stateMarkup=!ready||empty?`<div class="iq-pro-state is-${this.state}" role="${this.state==='error'?'alert':'status'}" ${this.state==='loading'?'aria-busy="true"':''}><span class="iq-pro-state-icon">${icon(this.state==='error'?'xCircle':'chart',24)}</span><h3>${allHidden&&ready?'Все ряды скрыты':st[0]}</h3><p>${allHidden&&ready?'Включите ряд в легенде или покажите все.':st[1]}</p>${this.state==='error'?'<button type="button" class="iq-btn secondary sm" data-chart-action="retry">Повторить</button>':allHidden&&ready?'<button type="button" class="iq-btn secondary sm" data-chart-action="restore">Показать все ряды</button>':''}</div>`:'';
  this.innerHTML=`<section class="iq-pro iq-data-chart" aria-label="${C.escape(d.title||'Диаграмма')}"><header class="iq-pro-toolbar"><div class="iq-pro-heading"><span class="iq-pro-eyebrow">АНАЛИТИКА</span><h3>${C.escape(d.title||'Диаграмма')}</h3>${d.description?`<span class="iq-pro-subtitle">${C.escape(d.description)}</span>`:''}</div><div class="iq-pro-actions"><div class="iq-pro-segment" role="group" aria-label="Вид диаграммы">${['line','bar'].map(t=>`<button type="button" class="iq-btn secondary sm" data-chart-action="type" data-type="${t}" aria-pressed="${t===this.type}">${t==='line'?'Линии':'Столбцы'}</button>`).join('')}</div></div></header>
   ${ready?`<div class="iq-chart-legend" role="group" aria-label="Показать или скрыть ряды">${d.series.map((s,i)=>`<button type="button" data-chart-action="legend" data-series="${C.escape(s.id)}" aria-pressed="${!this.hiddenSeries.has(s.id)}"><span class="iq-series-swatch series-${i%6}" aria-hidden="true"></span><span>${C.escape(s.label)}</span>${this.hiddenSeries.has(s.id)?icon('eye',14):''}</button>`).join('')}</div>`:''}
   ${stateMarkup||this.svg(values)}
   <div class="iq-chart-bottom"><span class="iq-pro-subtitle">${C.escape(ready?(this.missing?`Пропущенных значений: ${this.missing}. Не заменяем нулями.`:d.unit||'Значения из входных данных'):'Числовые данные временно недоступны.')}</span><button type="button" class="iq-btn ghost sm" data-chart-action="table" aria-expanded="${this.tableOpen&&ready}" aria-controls="${this.uid}-table" ${!ready?'disabled':''}>${this.tableOpen&&ready?'Скрыть таблицу':'Таблица данных'}${icon('grid',16)}</button></div>
   <div class="iq-chart-table" id="${this.uid}-table" ${this.tableOpen&&ready?'':'hidden'}>${this.tableOpen&&ready?this.table():''}</div></section>`;
  if(focus){
   const target=[...this.querySelectorAll('[data-chart-action],[data-chart-index]')].find(e=>
    focus.action?e.dataset.chartAction===focus.action&&e.dataset.series===focus.series&&e.dataset.type===focus.type:e.dataset.chartIndex===focus.index&&e.dataset.chartSeries===focus.s);
   if(target&&!target.disabled)target.focus({preventScroll:true});
  }
 }
 table(){
  const d=this._data;return `<table><caption>${C.escape(d.title||'Данные диаграммы')}</caption><thead><tr><th scope="col">${C.escape(d.xLabel||'Период')}</th>${d.series.map(s=>`<th scope="col">${C.escape(s.label)}</th>`).join('')}</tr></thead><tbody>${d.labels.map((label,i)=>`<tr><th scope="row">${C.escape(label)}</th>${d.series.map(s=>`<td>${s.values[i]===null?'Нет данных':C.escape(this.formatValue(s.values[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 }
 svg(values){
  const d=this._data,series=this.series,w=Math.max(232,this._width-48),h=320,l=w<400?50:64,r=22,top=26,bottom=50;
  const scale=chartScale(values),plotW=w-l-r,plotH=h-top-bottom,n=d.labels.length,slot=plotW/Math.max(n,1);
  const y=v=>top+(scale.high-v/scale.maximum)/scale.range*plotH,x=i=>l+slot*(i+.5),baseline=y(0);
  this.geometry={w,h,l,r,top,bottom,x,y};
  const every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor(plotW/80)))),indices=[];
  for(let i=0;i<n;i+=every)indices.push(i);
  if(n>1&&indices.at(-1)!==n-1&&(n-1-indices.at(-1))*slot>60)indices.push(n-1);
  const paths=[],marks=[];let hasTab=false;
  series.forEach((s,j)=>{
   const color=d.series.findIndex(v=>v.id===s.id)%6;let path='',connected=false;
   s.values.forEach((v,i)=>{
    if(v===null){connected=false;return}const px=x(i),py=y(v);
    path+=(connected?'L':'M')+px+' '+py;connected=true;
    const first=!hasTab;hasTab=true;
    const attrs=`data-chart-index="${i}" data-chart-series="${j}" tabindex="${first?'0':'-1'}" role="button" aria-label="${C.escape(s.label+', '+d.labels[i]+', '+this.formatValue(v))}"`;
    if(this.type==='bar'){
     const bw=Math.max(.25,slot*.72/series.length),left=px-slot*.36+j*bw,width=Math.max(.25,bw-2),height=Math.max(1.5,Math.abs(baseline-py));
     marks.push(`<g class="iq-chart-value" ${attrs}><rect class="iq-chart-mark series-${color}" x="${left}" y="${Math.min(baseline,py)}" width="${width}" height="${height}" rx="${Math.min(3,width/3)}"/><rect class="iq-chart-hit" x="${left-3}" y="${Math.min(baseline,py)-4}" width="${width+6}" height="${height+8}" fill="transparent"/></g>`);
    }else marks.push(`<g class="iq-chart-value" ${attrs}><circle class="iq-chart-point series-${color}" cx="${px}" cy="${py}" r="4"/><circle class="iq-chart-hit" cx="${px}" cy="${py}" r="11" fill="transparent"/></g>`);
   });
   if(this.type==='line')paths.push(`<path class="iq-chart-series series-${color}" d="${path}" ${j>=6?'stroke-dasharray="6 3"':''}/>`);
  });
  return `<div class="iq-chart-plot"><svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${C.escape(d.title||'Диаграмма')}. Стрелки — точки и ряды; Enter — выбрать.">
   <g class="iq-data-grid">${scale.ticks.map(v=>{const val=v*scale.maximum,py=top+(scale.high-v)/scale.range*plotH;return `<line x1="${l}" x2="${w-r}" y1="${py}" y2="${py}"/><text x="${l-12}" y="${py+4}" text-anchor="end">${C.escape(this.formatValue(val))}</text>`}).join('')}</g>
   <g>${indices.map(i=>{const label=String(d.labels[i]),short=label.length>14?label.slice(0,12)+'…':label;return `<text class="iq-data-axis" x="${x(i)}" y="${h-18}" text-anchor="middle"><title>${C.escape(label)}</title>${C.escape(short)}</text>`}).join('')}</g>${paths.join('')}${marks.join('')}</svg><div class="iq-chart-tooltip" id="${this.uid}-tip" role="tooltip" hidden></div></div>`;
 }
 hideTooltip(){this.querySelector('.iq-chart-tooltip')?.setAttribute('hidden','')}
 selectPoint(point,emit){
  const index=+point.dataset.chartIndex,s=+point.dataset.chartSeries,series=this.series[s];if(!series||series.values[index]===null)return;
  this.active={index,series:s};
  for(const p of this.querySelectorAll('[data-chart-index]')){p.setAttribute('tabindex',p===point?'0':'-1');p.classList.toggle('is-current',p===point)}
  const tooltip=this.querySelector('.iq-chart-tooltip');
  if(tooltip){
   tooltip.hidden=false;tooltip.innerHTML=`<b>${C.escape(this._data.labels[index])}</b><span>${C.escape(series.label)} <strong>${C.escape(this.formatValue(series.values[index]))}</strong></span>`;
   const plot=this.querySelector('.iq-chart-plot').getBoundingClientRect(),rect=point.getBoundingClientRect();
   const left=Math.max(8,Math.min(plot.width-tooltip.offsetWidth-8,rect.left-plot.left+rect.width/2-tooltip.offsetWidth/2));
   const above=rect.top-plot.top-tooltip.offsetHeight-14;
   tooltip.style.left=left+'px';tooltip.style.top=Math.max(6,above>=6?above:Math.min(plot.height-tooltip.offsetHeight-6,rect.bottom-plot.top+12))+'px';
  }
  if(emit)this.dispatchEvent(new CustomEvent('iq-point-select',{detail:{index,seriesId:series.id,label:this._data.labels[index],value:series.values[index]},bubbles:true,composed:true}));
 }
 keys(e){
  const point=e.target.closest('[data-chart-index]');if(!point)return;
  if(['Enter',' '].includes(e.key)){e.preventDefault();this.selectPoint(point,true);return}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape'].includes(e.key))return;
  e.preventDefault();if(e.key==='Escape'){this.hideTooltip();return}
  let index=+point.dataset.chartIndex,s=+point.dataset.chartSeries;const step=e.key==='ArrowLeft'?-1:1;
  const enabled=s=>this.series[s].values.map((v,i)=>v===null?-1:i).filter(i=>i>=0);
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
   const dir=e.key==='ArrowUp'?-1:1;
   for(let j=s+dir;j>=0&&j<this.series.length;j+=dir){const choices=enabled(j);if(choices.length){s=j;index=choices.sort((a,b)=>Math.abs(a-index)-Math.abs(b-index))[0];break}}
  }else{const choices=enabled(s);if(e.key==='Home')index=choices[0];else if(e.key==='End')index=choices.at(-1);else{const candidates=choices.filter(i=>step>0?i>index:i<index);index=(step>0?candidates[0]:candidates.at(-1))??index}}
  this.querySelector(`[data-chart-index="${index}"][data-chart-series="${s}"]`)?.focus({preventScroll:true});
 }
}
Object.assign(exports,{IqDataChart,chartScale,formatNumber});


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
