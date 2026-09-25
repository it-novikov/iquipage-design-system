import {dialog,select,icon,esc} from '../ui.js';
import {normalizeBoardFilters,ownerKey} from './filters.js';
import {tagMarkup,tagTone} from './catalog-ui.js';
/** Board filters apply live. Active conditions stay visible as removable chips; tags keep their colour. */
export function mountBoardFilters(root,{initial={},onChange=()=>{},countMatches=null}={}){
  let value=normalizeBoardFilters(initial),data={tasks:[],tags:[],releases:[]},panel=null;
  const abort=new AbortController(),names={owners:'Исполнитель',releases:'Релиз',tags:'Теги'};
  function options(field){
    if(field==='owners'){
      const people=new Map();
      for(const task of data.tasks)if(ownerKey(task)!=='none')people.set(ownerKey(task),{id:ownerKey(task),name:task.owner||task.ownerId});
      return [{id:'none',name:'Без исполнителя'},...[...people.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))];
    }
    if(field==='releases')return [{id:'none',name:'Без релиза'},...data.releases];
    return data.tags;
  }
  const find=(field,id)=>options(field).find(item=>item.id===id);
  function draw(){
    const count=Object.keys(names).reduce((n,key)=>n+value[key].length,0);
    const chips=Object.keys(names).flatMap(field=>value[field].map(id=>{
      const item=find(field,id),name=item?.name||'Недоступно',tone=field==='tags'&&item?tagTone(item):'neutral';
      return `<button type="button" class="iq-tag" data-tone="${tone}" data-remove-filter="${field}" data-filter-id="${esc(id)}" aria-label="Убрать фильтр: ${esc(names[field])} — ${esc(name)}">${field==='tags'?'':`${esc(names[field])}: `}${esc(name)}${icon('x',12)}</button>`;
    })).join('');
    root.innerHTML=`<button type="button" class="iq-btn ghost sm" data-open-filters aria-haspopup="dialog">${icon('filter',17)}<span>Фильтры${count?' · '+count:''}</span></button>${chips?`<div class="board-filter-chips" aria-label="Активные фильтры">${chips}</div><button type="button" class="iq-btn ghost sm" data-reset-filters>Сбросить</button>`:''}`;
  }
  function commit(){draw();onChange(structuredClone(value));panel?.refresh();}
  function choose(){
    if(panel)return;
    const element=dialog({title:'Фильтры доски',body:`<label class="iq-search-small">${icon('search',16)}<input type="search" aria-label="Найти значение фильтра" placeholder="Найти исполнителя, релиз или тег"></label><p class="iq-helper" role="status" data-filter-count></p><div class="board-filter-fields">${Object.keys(names).map(field=>`<section class="task-edit-section"><div class="row between"><h3>${names[field]}</h3><button type="button" class="iq-btn ghost sm" data-clear-filter="${field}">Сбросить</button></div><div class="stack sm" data-filter-options="${field}"></div></section>`).join('')}</div>${select('tagMode','Совпадение тегов',value.tagMode,[['any','Любой выбранный тег'],['all','Все выбранные теги']])}`,
      mount:element=>{
        const search=element.querySelector('input[type=search]');
        const label=item=>item.tone!==undefined&&data.tags.includes(item)?tagMarkup(item):`<span>${esc(item.name)}${item.archivedAt?' · в архиве':''}</span>`;
        function render(field){element.querySelector(`[data-filter-options=${field}]`).innerHTML=options(field).filter(item=>item.name.toLocaleLowerCase('ru').includes(search.value.trim().toLocaleLowerCase('ru'))).map(item=>`<label class="iq-check"><input type="checkbox" data-filter-field="${field}" value="${esc(item.id)}" ${value[field].includes(item.id)?'checked':''}><span class="iq-check-box">${icon('check',14)}</span>${label(item)}</label>`).join('')||'<p class="iq-helper">Нет значений.</p>';}
        const counter=()=>{const n=countMatches?.(value);element.querySelector('[data-filter-count]').textContent=n==null?'Условия разных групп действуют вместе.':`Показано задач: ${n}. Условия разных групп действуют вместе.`;};
        panel={refresh(){Object.keys(names).forEach(render);counter();}};
        search.addEventListener('input',()=>Object.keys(names).forEach(render));
        element.addEventListener('change',event=>{const field=event.target.dataset.filterField;if(!field)return;const next=new Set(value[field]);event.target.checked?next.add(event.target.value):next.delete(event.target.value);value=normalizeBoardFilters({...value,[field]:[...next]});draw();onChange(structuredClone(value));counter();});
        element.addEventListener('iq-change',event=>{if(event.target.getAttribute('name')!=='tagMode')return;value=normalizeBoardFilters({...value,tagMode:event.target.value});commit();});
        element.addEventListener('click',event=>{const clear=event.target.closest('[data-clear-filter]');if(clear){value=normalizeBoardFilters({...value,[clear.dataset.clearFilter]:[]});commit();}});
        element.addEventListener('iq-close',()=>{panel=null;root.querySelector('[data-open-filters]')?.focus({preventScroll:true});},{once:true});
        panel.refresh();
      }
    });
    return element;
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-open-filters]'))choose();
    const chip=event.target.closest('[data-remove-filter]');
    if(chip){const field=chip.dataset.removeFilter;value=normalizeBoardFilters({...value,[field]:value[field].filter(id=>id!==chip.dataset.filterId)});commit();(root.querySelector('[data-remove-filter]')||root.querySelector('[data-open-filters]'))?.focus();}
    if(event.target.closest('[data-reset-filters]')){value=normalizeBoardFilters({});commit();root.querySelector('[data-open-filters]')?.focus();}
  },{signal:abort.signal});
  draw();
  return {value:()=>structuredClone(value),setData(next){data=next;draw();panel?.refresh();},destroy(){abort.abort();}};
}
