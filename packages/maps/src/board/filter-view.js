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
  function condition(field){
    const selected=value[field].map(id=>options(field).find(item=>item.id===id)?.name||'Недоступно');
    const caption=selected.length?`${names[field]}: ${selected[0]}${selected.length>1?' +'+(selected.length-1):''}`:names[field];
    const clear=selected.length?`<button type="button" class="iq-btn ghost icon sm" data-clear-filter="${field}" aria-label="Сбросить фильтр ${names[field]}">${icon('x',14)}</button>`:'';
    return `<span class="board-filter-condition"><button type="button" class="iq-btn ghost sm" data-filter="${field}" aria-pressed="${!!selected.length}" title="${esc(selected.join(', '))}">${esc(caption)}</button>${clear}</span>`;
  }
  function draw(){root.innerHTML=Object.keys(names).map(condition).join('');}
  function commit(){draw();onChange(structuredClone(value));}
  function choose(field){
    const draft=new Set(value[field]);
    const mode=field==='tags'?select('tagMode','Совпадение тегов',value.tagMode,[['any','Любой выбранный тег'],['all','Все выбранные теги']]):'';
    dialog({title:'Фильтр: '+names[field],body:`<label class="iq-search-small">${icon('search',16)}<input type="search" aria-label="Найти значение фильтра" placeholder="Найти"></label>${mode}<div class="stack sm" data-filter-options></div>`,submitLabel:'Применить',
      onSubmit:async values=>{value[field]=[...draft];if(field==='tags')value.tagMode=values.get('tagMode');commit();},
      mount:element=>{
        const list=element.querySelector('[data-filter-options]'),search=element.querySelector('input[type=search]');
        function render(){
          const query=search.value.toLocaleLowerCase('ru');
          list.innerHTML=options(field).filter(item=>item.name.toLocaleLowerCase('ru').includes(query)).map(item=>`<label class="iq-check"><input type="checkbox" value="${esc(item.id)}" ${draft.has(item.id)?'checked':''}><span class="iq-check-box">${icon('check',14)}</span><span>${esc(item.name)}${item.archivedAt?' · в архиве':''}</span></label>`).join('')||'<p class="iq-helper">Нет совпадений.</p>';
        }
        search.addEventListener('input',render);list.addEventListener('change',event=>{event.target.checked?draft.add(event.target.value):draft.delete(event.target.value);});render();
      }
    });
  }
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-filter]');if(open)choose(open.dataset.filter);
    const clear=event.target.closest('[data-clear-filter]');if(clear){value[clear.dataset.clearFilter]=[];commit();}
  },{signal:abort.signal});
  draw();
  return {value:()=>structuredClone(value),setData(next){data=next;draw();},destroy(){abort.abort();}};
}
