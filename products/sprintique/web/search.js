import {icon,escapeHTML as esc} from '@iquipage/web/core';

/** IQUIPAGE command-search composition with cancellable authorized server queries. */
/** Commands (actions and destinations) match locally and come first; server results follow. */
export function openSearch({client,onOpen,commands=[]}){
  const host=document.createElement('iq-dialog');let request=null,timer,generation=0,closed=false,items=[],cursor=null;
  host.innerHTML=`<h2 class="sr-only">Поиск по платформе</h2><div class="iq-command-input">${icon('search',22)}<input type="search" maxlength="200" placeholder="Найти задачу, карту, проект или действие…" aria-label="Поиск и команды" autocomplete="off"><kbd>esc</kbd></div><div class="iq-command-list" data-search-results></div><div class="iq-command-foot" role="status">↑ ↓ — выбрать · Enter — открыть · Esc — закрыть</div>`;
  document.body.append(host);host.show();const input=host.querySelector('input'),results=host.querySelector('[data-search-results]');
  const matching=()=>{const q=input.value.trim().toLocaleLowerCase('ru');return commands.filter(c=>!q||(c.label+' '+(c.keywords||'')).toLocaleLowerCase('ru').includes(q));};
  const commandList=()=>{const list=matching();return list.length?`<p class="iq-helper">Действия</p>${list.map(c=>`<button type="button" data-command="${esc(c.id)}">${icon(c.icon||'arrow',18)}<span>${esc(c.label)}${c.hint?`<small>${esc(c.hint)}</small>`:''}</span>${icon('arrow',15)}</button>`).join('')}`:'';};
  const message=text=>{results.innerHTML=commandList()+'<p class="iq-helper" data-search-note></p>';results.querySelector('[data-search-note]').textContent=text;};
  message('Введите название, номер задачи или слова из описания.');
  async function load(append=false){
    const q=input.value.trim();request?.abort();const epoch=++generation;if(!q){items=[];cursor=null;message('Введите название или номер задачи.');return;}
    if(q.length<2){items=[];cursor=null;message('Продолжайте вводить, чтобы искать задачи и карты.');return;}
    request=new AbortController();results.setAttribute('aria-busy','true');
    try{const query=new URLSearchParams({q});if(append&&cursor)query.set('cursor',cursor);
      const page=await client.request('/search?'+query,'GET',undefined,undefined,request.signal);if(closed||epoch!==generation)return;
      items=append?[...items,...page.items]:page.items;cursor=page.nextCursor;
      results.innerHTML=commandList()+(items.length?'<p class="iq-helper">Найдено</p>':'')+items.map((item,index)=>`<button type="button" data-result="${index}">${icon(item.kind==='task'?'file':'grid',18)}<span>${esc(item.title)}<small>${esc(item.key+' · '+item.projectName)}</small></span>${icon('arrow',15)}</button>`).join('');
      if(!items.length)message('Ничего не найдено. Измените запрос.');if(cursor)results.insertAdjacentHTML('beforeend','<button type="button" data-search-more>Показать ещё</button>');
    }catch(error){if(!closed&&epoch===generation&&error.name!=='AbortError')message(error.message);}
    finally{if(!closed&&epoch===generation)results.removeAttribute('aria-busy');}
  }
  input.addEventListener('input',()=>{request?.abort();generation++;clearTimeout(timer);timer=setTimeout(()=>load(),200);});
  host.addEventListener('keydown',event=>{
    const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();}
    if(event.key==='Enter'&&event.target===input){event.preventDefault();buttons[0]?.click();}
  });
  results.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-search-more')){await load(true);return;}
    const command=commands.find(c=>c.id===button.dataset.command);if(command){host.close(true);await command.run();return;}
    const item=items[Number(button.dataset.result)];if(!item)return;host.close(true);await onOpen(item);
  });
  host.addEventListener('iq-close',()=>{closed=true;generation++;clearTimeout(timer);request?.abort();items=[];host.remove();},{once:true});input.focus();return host;
}
