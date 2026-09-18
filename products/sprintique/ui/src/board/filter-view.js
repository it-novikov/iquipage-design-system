import {dialog,select,icon,esc} from '../ui.js';
import {normalizeBoardFilters,ownerKey} from './filters.js';
export function mountBoardFilters(root,{initial={},onChange=()=>{}}={}){
  let value=normalizeBoardFilters(initial),data={tasks:[],tags:[],releases:[]};
  const abort=new AbortController(),names={owners:'Исполнитель',releases:'Релиз',tags:'Теги'};
  function options(field){
    if(field==='owners'){
      const people=new Map();
      for(const task of data.tasks)if(ownerKey(task)!=='none')people.set(ownerKey(task),{id:ownerKey(task),name:task.owner||task.ownerId});
      return [{id:'none',name:'Без исполнителя'},...people.values()];
    }
    if(field==='releases')return [{id:'none',name:'Без релиза'},...data.releases];
    return data.tags;
  }
  function draw(){
    const count=Object.keys(names).reduce((n,key)=>n+value[key].length,0);
    const summary=Object.keys(names).filter(key=>value[key].length).map(key=>`${names[key]}: ${value[key].map(id=>options(key).find(item=>item.id===id)?.name||'Недоступно').join(', ')}`).join('; ');
    root.innerHTML=`<button type="button" class="iq-btn ghost sm" data-open-filters aria-haspopup="dialog" title="${esc(summary||'Фильтры доски')}">${icon('filter',17)}<span>Фильтры${count?' · '+count:''}</span></button>${count?`<button type="button" class="iq-btn ghost icon sm" data-reset-filters aria-label="Сбросить все фильтры">${icon('x',15)}</button>`:''}`;
  }
  function commit(){draw();onChange(structuredClone(value));}
  function choose(){
    const draft=structuredClone(value);
    dialog({title:'Фильтры доски',body:`<label class="iq-search-small">${icon('search',16)}<input type="search" aria-label="Найти значение фильтра" placeholder="Найти исполнителя, релиз или тег"></label><p class="iq-helper">Условия разных групп действуют вместе.</p><div class="board-filter-fields">${Object.keys(names).map(field=>`<section class="task-edit-section"><div class="row between"><h3>${names[field]}</h3><button type="button" class="iq-btn ghost sm" data-clear-filter="${field}">Сбросить</button></div><div class="stack sm" data-filter-options="${field}"></div></section>`).join('')}</div>${select('tagMode','Совпадение тегов',value.tagMode,[['any','Любой выбранный тег'],['all','Все выбранные теги']])}`,submitLabel:'Применить',
      onSubmit:async values=>{value=normalizeBoardFilters({...draft,tagMode:values.get('tagMode')});commit();},
      mount:element=>{
        const search=element.querySelector('input[type=search]');
        function render(field){element.querySelector(`[data-filter-options=${field}]`).innerHTML=options(field).filter(item=>item.name.toLocaleLowerCase('ru').includes(search.value.trim().toLocaleLowerCase('ru'))).map(item=>`<label class="iq-check"><input type="checkbox" data-filter-field="${field}" value="${esc(item.id)}" ${draft[field].includes(item.id)?'checked':''}><span class="iq-check-box">${icon('check',14)}</span><span>${esc(item.name)}${item.archivedAt?' · в архиве':''}</span></label>`).join('')||'<p class="iq-helper">Нет значений.</p>';}
        search.addEventListener('input',()=>Object.keys(names).forEach(render));
        element.addEventListener('change',event=>{const field=event.target.dataset.filterField;if(!field)return;const next=new Set(draft[field]);event.target.checked?next.add(event.target.value):next.delete(event.target.value);draft[field]=[...next];});
        element.addEventListener('click',event=>{const clear=event.target.closest('[data-clear-filter]');if(clear){draft[clear.dataset.clearFilter]=[];render(clear.dataset.clearFilter);}});
        Object.keys(names).forEach(render);
      }
    });
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-open-filters]'))choose();
    if(event.target.closest('[data-reset-filters]')){value=normalizeBoardFilters({});commit();}
  },{signal:abort.signal});
  draw();
  return {value:()=>structuredClone(value),setData(next){data=next;draw();},destroy(){abort.abort();}};
}
