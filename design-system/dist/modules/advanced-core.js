
const exports={};
const deps={};
(function(exports,require){
'use strict';
/** Pure contracts shared by the timeline, spatial canvas and charts. No demo data. */
const DAY = 86400000;
const clone = value => structuredClone(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function day(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
 const t=Date.parse(value+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value?t/DAY:NaN;
}
function iso(n){return new Date(Math.round(n)*DAY).toISOString().slice(0,10)}
function addDays(value,n){return iso(day(value)+n)}
const dateFormatters=new Map();
function dateLabel(value,options={day:'numeric',month:'short'}){
 const parsed=day(value);if(!Number.isFinite(parsed))return 'Нет даты';
 const key=JSON.stringify(options);let formatter=dateFormatters.get(key);
 if(!formatter){if(dateFormatters.size>=24)dateFormatters.clear();formatter=new Intl.DateTimeFormat('ru-RU',{...options,timeZone:'UTC'});dateFormatters.set(key,formatter)}
 return formatter.format(new Date(parsed*DAY));
}
function ids(items,label){const seen=new Set();for(const item of items){if(!item||typeof item.id!=='string'||!item.id.trim()||seen.has(item.id))throw new TypeError(`${label}: ID должны быть непустыми и уникальными`);seen.add(item.id)}return seen}
function validateRoadmap(value){
 if(!value||!Array.isArray(value.rows)||!Array.isArray(value.dependencies||[]))throw new TypeError('Нужны rows и dependencies');
 const data=clone(value);data.dependencies ||= [];if(data.rows.length>500||data.dependencies.length>1500)throw new RangeError('Не более 500 строк и 1500 зависимостей');ids(data.rows,'Задачи');ids(data.dependencies,'Связи');
 const byId=new Map(data.rows.map(r=>[r.id,r]));
 for(const r of data.rows){if(typeof r.title!=='string'||!r.title.trim())throw new TypeError('Задаче нужно название');if(!((r.start==null&&r.end==null)||(Number.isFinite(day(r.start))&&Number.isFinite(day(r.end))&&day(r.end)>=day(r.start))))throw new TypeError(`Некорректные даты: ${r.id}`);r.kind ||= 'task';if(!['goal','epic','task','milestone'].includes(r.kind))throw new TypeError('Неизвестный тип строки');if(r.kind==='milestone'&&r.start!==r.end)throw new TypeError('Веха должна иметь одну дату');if(r.progress!=null&&(!Number.isFinite(r.progress)||r.progress<0||r.progress>100))throw new TypeError('Прогресс: 0–100')}
 for(const r of data.rows){
  if(r.parentId&&(!byId.has(r.parentId)||r.parentId===r.id||!['goal','epic','task'].includes(byId.get(r.parentId).kind)))throw new TypeError('Родителем может быть цель, эпик или задача');
  const seen=new Set([r.id]);let parent=r.parentId;
  while(parent){if(seen.has(parent))throw new TypeError('Цикл иерархии строк');seen.add(parent);parent=byId.get(parent)?.parentId}
 }
 for(const d of data.dependencies){d.type ||= 'FS';d.lagDays ??= 0;if(!byId.has(d.from)||!byId.has(d.to)||d.from===d.to||!['FS','SS','FF','SF'].includes(d.type)||!Number.isInteger(d.lagDays))throw new TypeError('Некорректная зависимость')}
 const pairs=new Set();for(const d of data.dependencies){const key=d.from+'\0'+d.to+'\0'+d.type;if(pairs.has(key))throw new TypeError('Такая зависимость уже существует');pairs.add(key)}
 const indeg=new Map(data.rows.map(r=>[r.id,0]));data.dependencies.forEach(d=>indeg.set(d.to,indeg.get(d.to)+1));const q=[...indeg].filter(([,v])=>!v).map(([k])=>k);let count=0;
 while(q.length){const id=q.shift();count++;for(const e of data.dependencies.filter(e=>e.from===id)){indeg.set(e.to,indeg.get(e.to)-1);if(!indeg.get(e.to))q.push(e.to)}}
 if(count!==data.rows.length)throw new TypeError('Циклическая зависимость в плане');
 return data;
}
function roadmapConflicts(data){const by=new Map(data.rows.map(r=>[r.id,r]));return data.dependencies.flatMap(d=>{const a=by.get(d.from),b=by.get(d.to);if(!a||!b)return[];if(![a.start,a.end,b.start,b.end].every(v=>Number.isFinite(day(v))))return[{id:d.id,from:a.id,to:b.id,message:'Задайте даты для зависимости «'+a.title+' → '+b.title+'». '}];const edgeA=d.type[0]==='F'?day(a.end)+1:day(a.start),edgeB=d.type[1]==='F'?day(b.end)+1:day(b.start),bad=edgeB<edgeA+(d.lagDays||0);return bad?[{id:d.id,from:a.id,to:b.id,message:`${b.title}: нарушена связь ${d.type} с «${a.title}»`}]:[]})}
function graphData(value){
 if(!value||!Array.isArray(value.nodes)||!Array.isArray(value.edges))throw new TypeError('Нужны nodes и edges');const data=clone(value);const set=ids(data.nodes,'Объекты');ids(data.edges,'Связи');
 for(const n of data.nodes){n.kind ||= 'note';if(!['note','task','checklist','media','group'].includes(n.kind))throw new TypeError('Неизвестный тип узла');if(typeof n.title!=='string'||!n.title.trim())throw new TypeError('Объекту нужно название');n.x ??= 0;n.y ??= 0;n.width ??= n.kind==='group'?560:248;n.height ??= n.kind==='group'?340:164;if(![n.x,n.y,n.width,n.height].every(Number.isFinite)||n.width<180||n.height<100)throw new TypeError('Некорректная геометрия объекта');if(n.parentId&&(!set.has(n.parentId)||n.parentId===n.id||data.nodes.find(x=>x.id===n.parentId)?.kind!=='group'))throw new TypeError('Некорректная группа');if(n.items&&!Array.isArray(n.items))throw new TypeError('items должен быть массивом');if(n.items&&n.items.some(i=>!i||typeof i.label!=='string'||!i.label.trim()))throw new TypeError('Пункту чек-листа нужна подпись');if(n.items)n.items=n.items.map(i=>({...i,checked:!!i.checked}));if(Math.abs(n.x)>100000||Math.abs(n.y)>100000||n.width>20000||n.height>20000)throw new RangeError('Геометрия выходит за пределы рабочей области')}
 for(const n of data.nodes){let parent=n.parentId,seen=new Set([n.id]);while(parent){if(seen.has(parent))throw new TypeError('Цикл вложенности групп');seen.add(parent);parent=data.nodes.find(x=>x.id===parent)?.parentId}}
 for(const e of data.edges){if(!set.has(e.source)||!set.has(e.target)||e.source===e.target)throw new TypeError('Некорректные концы связи');e.kind ||= 'relates';if(!['relates','depends','supports'].includes(e.kind))throw new TypeError('Неизвестная семантика связи')}
 return data;
}
function layoutGraph(data){
 const next=graphData(data),nodes=next.nodes.filter(n=>!n.archived&&n.kind!=='group'),level=new Map(nodes.map(n=>[n.id,0])),incoming=new Map(nodes.map(n=>[n.id,0]));
 next.edges.forEach(e=>{if(incoming.has(e.target)&&incoming.has(e.source))incoming.set(e.target,incoming.get(e.target)+1)});
 const queue=[...incoming].filter(([,n])=>!n).map(([id])=>id),done=new Set();
 while(queue.length){const id=queue.shift();done.add(id);for(const e of next.edges.filter(e=>e.source===id&&incoming.has(e.target))){level.set(e.target,Math.max(level.get(e.target),level.get(id)+1));incoming.set(e.target,incoming.get(e.target)-1);if(!incoming.get(e.target))queue.push(e.target)}}
 if(done.size!==nodes.length)throw new TypeError('Авторазмещение требует граф без циклов. Ручная карта допускает циклы.');
 if(next.nodes.some(n=>!n.archived&&(n.readonly||n.status==='disabled')))throw new TypeError('Авторазмещение недоступно, пока на карте есть защищённые объекты.');
 const columns=new Map();
 for(const n of nodes){const l=level.get(n.id);if(!columns.has(l))columns.set(l,[]);columns.get(l).push(n)}
 let x=64;
 for(const l of [...columns.keys()].sort((a,b)=>a-b)){
  const col=columns.get(l);let y=80;for(const n of col){n.x=x;n.y=y;y+=n.height+64}x+=Math.max(...col.map(n=>n.width))+120;
 }
 const groups=next.nodes.filter(n=>n.kind==='group');
 const depth=n=>{let d=0,p=n.parentId;while(p){d++;p=groups.find(x=>x.id===p)?.parentId}return d};
 for(const g of groups.sort((a,b)=>depth(b)-depth(a))){const children=next.nodes.filter(n=>n.parentId===g.id&&!n.archived);if(children.length){const left=Math.min(...children.map(n=>n.x)),top=Math.min(...children.map(n=>n.y)),right=Math.max(...children.map(n=>n.x+n.width)),bottom=Math.max(...children.map(n=>n.y+n.height));Object.assign(g,{x:left-24,y:top-72,width:right-left+48,height:bottom-top+96})}}
 return next;
}

/** Three-way merge: replay only local changes on the incoming revision.
 * Applying a local edit to an object removed remotely is refused, not resurrected.
 */
function rebaseDraft(base, local, remote) {
 if(JSON.stringify(base)===JSON.stringify(local)) return clone(remote);
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)){
  const keyed=[...base,...local,...remote].every(x=>x&&typeof x==='object'&&typeof x.id==='string');
  if(!keyed)return clone(local);
  const b=new Map(base.map(x=>[x.id,x])), l=new Map(local.map(x=>[x.id,x])), r=new Map(remote.map(x=>[x.id,x]));
  const out=[];
  for(const rr of remote){
   if(b.has(rr.id)&&!l.has(rr.id))continue; // explicit local deletion
   if(!b.has(rr.id)||!l.has(rr.id)){out.push(clone(rr));continue}
   const ll=l.get(rr.id),bb=b.get(rr.id);
   if((rr.readonly||rr.blocked||rr.status==='disabled')&&JSON.stringify(bb)!==JSON.stringify(ll))throw Error('Объект «'+rr.id+'» защищён в новой версии. Загрузите новую версию.');
   out.push(rebaseDraft(bb,ll,rr));
  }
  for(const ll of local){
   if(r.has(ll.id))continue;
   if(!b.has(ll.id)){out.push(clone(ll));continue}
   if(JSON.stringify(ll)!==JSON.stringify(b.get(ll.id)))throw Error('Объект «'+ll.id+'» удалён в новой версии. Загрузите новую версию.');
  }
  return out;
 }
 if(base&&local&&remote&&typeof base==='object'&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(base)){
  const out=clone(remote);
  for(const key of new Set([...Object.keys(base),...Object.keys(local)])){
   if(key==='revision')continue;
   if(!(key in local)){delete out[key];continue}
   if(!(key in base)){out[key]=clone(local[key]);continue}
   if(JSON.stringify(base[key])!==JSON.stringify(local[key]))out[key]=rebaseDraft(base[key],local[key],remote[key]);
  }
  return out;
 }
 return clone(local);
}
class EditSession {
 constructor(value){this.base=clone(value);this.draft=null;this.remote=null;this.history=[];this.operation=null}
 get value(){return this.draft||this.base} get dirty(){return this.draft!==null} get conflict(){return this.remote!==null}
 preview(value,operation){this.draft=JSON.stringify(value)===JSON.stringify(this.base)?null:clone(value);this.operation=this.draft?operation:null;return this.value}
 load(value){const next=clone(value);if(this.dirty){if(JSON.stringify(next)!==JSON.stringify(this.base)){this.remote=next;return false}return !this.remote}if(JSON.stringify(this.base)!==JSON.stringify(next))this.history=[];this.base=next;this.draft=null;this.operation=null;return true}
 commit(){if(this.conflict)throw Error('Нужно разрешить конфликт версий');if(!this.draft)return this.base;this.record();this.base={...clone(this.draft),revision:typeof this.base.revision==='number'?this.base.revision+1:String(this.base.revision||'')+'*'};this.draft=null;this.operation=null;return this.base}
 record(){if(this.operation?.kind==='undo')this.history.pop();else this.history.push(clone(this.base));if(this.history.length>40)this.history.shift()}
 accept(value){this.record();this.base=clone(value);this.draft=null;this.remote=null;this.operation=null}
 cancel(){this.draft=null;this.operation=null;if(this.remote){this.base=this.remote;this.remote=null;this.history=[]}return this.base}
 resolve(strategy){if(!this.remote)return;if(strategy==='reload'){this.cancel();return}if(strategy!=='reapply')throw Error('Неизвестная стратегия');const result=rebaseDraft(this.base,this.draft,this.remote);result.revision=this.remote.revision;this.base=this.remote;this.remote=null;this.draft=result;this.history=[]}
 undo(){const previous=this.history.pop();if(previous){const revision=this.base.revision;this.base={...previous,revision:typeof revision==='number'?revision+1:String(revision)+'*'}}return this.base}
}
function chartData(value){if(!value||!Array.isArray(value.labels)||!Array.isArray(value.series))throw new TypeError('Нужны labels и series');if(value.labels.length>1000||value.series.length>12)throw new RangeError('Не более 1000 точек на ряд и 12 рядов');ids(value.series,'Ряды');let missing=0;const data={...clone(value),labels:value.labels.map(String),series:value.series.map(s=>{if(!Array.isArray(s.values)||s.values.length!==value.labels.length)throw new TypeError('Число значений должно совпадать с labels');return{...s,label:String(s.label||s.id),values:s.values.map(v=>{if(typeof v!=='number'||!Number.isFinite(v)){missing++;return null}return v})}})};return{data,missing}}
function safeMedia(url){if(typeof url!=='string')return '';if(/^https:\/\//i.test(url)||/^blob:/i.test(url)||/^data:image\/(png|jpeg|webp|gif);base64,/i.test(url))return url;return ''}
Object.assign(exports,{DAY,clone,escape,day,iso,addDays,dateLabel,validateRoadmap,roadmapConflicts,graphData,layoutGraph,EditSession,rebaseDraft,chartData,safeMedia});

// Component IDs are not credentials. randomUUID has a bounded local fallback for
// self-contained documents and non-secure development origins.
let generatedIds=0;
function newId(prefix='item'){
 let key;
 if(globalThis.crypto?.randomUUID)key=crypto.randomUUID();
 else if(globalThis.crypto?.getRandomValues){const a=new Uint32Array(4);crypto.getRandomValues(a);key=Array.from(a,n=>n.toString(16).padStart(8,'0')).join('')}
 else key=Date.now().toString(36)+'-'+(++generatedIds).toString(36);
 return prefix+'-'+key;
}
exports.newId=newId;


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
