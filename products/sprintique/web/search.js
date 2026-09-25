import {icon,escapeHTML as esc,registerCore} from '@iquipage/web/core';

/** DS command dialog (iq-dialog kind="command"): focus stays in the field, arrows move the active row,
 *  Enter runs it. Commands match locally and come first; authorized server results follow. */
export function openSearch({client,onOpen,commands=[]}){
  registerCore();
  const host=document.createElement('iq-dialog'),listId='command-results-'+crypto.randomUUID();
  let request=null,timer,generation=0,closed=false,items=[],cursor=null,active=0,note='',busy=false;
  host.setAttribute('kind','command');
  host.innerHTML=`<h2 class="sr-only">Поиск и команды</h2><div class="iq-command-input">${icon('search',22)}<input type="search" maxlength="200" placeholder="Найти задачу, карту, проект или действие…" aria-label="Поиск и команды" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="${listId}" aria-autocomplete="list"><kbd>esc</kbd></div><div class="iq-command-list" id="${listId}" role="listbox" aria-label="Результаты"></div><div class="iq-command-foot" role="status" aria-live="polite">↑ ↓ — выбрать · Enter — открыть · Esc — закрыть</div>`;
  document.body.append(host);host.show();
  const input=host.querySelector('input'),list=host.querySelector('[role=listbox]'),foot=host.querySelector('.iq-command-foot');
  const query=()=>input.value.trim();
  const matching=()=>{const q=query().toLocaleLowerCase('ru');return commands.filter(c=>!q||(c.label+' '+(c.keywords||'')).toLocaleLowerCase('ru').includes(q));};
  /** One flat option list keeps keyboard order identical to the visual order. */
  function options(){
    const found=matching().map(c=>({kind:'command',id:c.id,glyph:c.icon||'arrow',title:c.label,sub:c.hint||''}));
    const results=items.map((item,index)=>({kind:'result',id:String(index),glyph:item.kind==='task'?'file':item.kind==='map'?'grid':'folder',title:item.title,sub:item.key+' · '+item.projectName}));
    return {found,results,all:[...found,...results,...(cursor?[{kind:'more',id:'more',glyph:'down',title:'Показать ещё',sub:''}]:[])]};
  }
  function render(){
    const {found,results,all}=options();active=Math.min(active,Math.max(0,all.length-1));
    let position=0;const row=o=>{const index=position++;return `<button type="button" role="option" id="${listId}-${index}" data-option="${index}" aria-selected="${index===active}" tabindex="-1">${icon(o.glyph,18)}<span>${esc(o.title)}${o.sub?`<small>${esc(o.sub)}</small>`:''}</span>${o.kind==='command'?'':icon('arrow',15)}</button>`;};
    list.innerHTML=(found.length?`<p class="iq-command-group" role="presentation">Действия</p>${found.map(row).join('')}`:'')
      +(results.length?`<p class="iq-command-group" role="presentation">Задачи, карты и проекты</p>${results.map(row).join('')}`:'')
      +(cursor?row(all.at(-1)):'')
      +(note?`<p class="iq-command-empty" role="presentation">${esc(note)}</p>`:'');
    list.setAttribute('aria-busy',String(busy));
    if(all.length)input.setAttribute('aria-activedescendant',`${listId}-${active}`);else input.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});
    foot.textContent=all.length?'↑ ↓ — выбрать · Enter — открыть · Esc — закрыть':'Esc — закрыть';
  }
  async function load(append=false){
    const q=query();request?.abort();const epoch=++generation;
    if(q.length<2){items=[];cursor=null;busy=false;note=q?'Продолжайте вводить, чтобы искать задачи и карты.':'Введите название, номер задачи или слова из описания.';render();return;}
    request=new AbortController();busy=true;note='Ищем…';render();
    try{
      const params=new URLSearchParams({q});if(append&&cursor)params.set('cursor',cursor);
      const page=await client.request('/search?'+params,'GET',undefined,undefined,request.signal);if(closed||epoch!==generation)return;
      items=append?[...items,...page.items]:page.items;cursor=page.nextCursor;note=items.length||matching().length?'':'Ничего не найдено. Измените запрос.';
    }catch(error){if(closed||epoch!==generation||error.name==='AbortError')return;note=error.message||'Поиск недоступен.';}
    busy=false;render();
  }
  async function run(index){
    const option=options().all[index];if(!option)return;
    if(option.kind==='more'){await load(true);return;}
    host.close(true);
    if(option.kind==='command')await commands.find(c=>c.id===option.id)?.run();
    else await onOpen(items[Number(option.id)]);
  }
  input.addEventListener('input',()=>{active=0;request?.abort();generation++;clearTimeout(timer);render();timer=setTimeout(()=>load(),200);});
  input.addEventListener('keydown',event=>{
    const count=options().all.length;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!count)return;active=(active+(event.key==='ArrowDown'?1:-1)+count)%count;render();}
    if(event.key==='Enter'){event.preventDefault();void run(active);}
  });
  // Hover moves the highlight in place; re-rendering under the pointer would fight the click.
  list.addEventListener('pointermove',event=>{const option=event.target.closest('[data-option]');if(!option||Number(option.dataset.option)===active)return;active=Number(option.dataset.option);for(const row of list.querySelectorAll('[data-option]'))row.setAttribute('aria-selected',String(row===option));input.setAttribute('aria-activedescendant',option.id);});
  list.addEventListener('click',event=>{const option=event.target.closest('[data-option]');if(option)void run(Number(option.dataset.option));});
  host.addEventListener('iq-close',()=>{closed=true;generation++;clearTimeout(timer);request?.abort();items=[];host.remove();},{once:true});
  note='Введите название, номер задачи или слова из описания.';render();input.focus();
  return host;
}
