import {icon,escapeHTML as esc,registerCore} from '/dist/vendor/core.js';

/** Host-owned search over the active project's authorized repositories and routes. */
export function installQuickSearch({repository,project,projects=[project],onOpen,readyToOpen}){
  registerCore();
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='iq-btn ghost icon sm platform-search-trigger';
  trigger.setAttribute('aria-label','Поиск по платформе');trigger.setAttribute('aria-haspopup','dialog');
  trigger.title='Поиск по платформе · ⌘ / Ctrl K';trigger.setAttribute('aria-keyshortcuts','Meta+K Control+K');
  trigger.innerHTML=icon('search',18);
  document.querySelector('.platform-global').prepend(trigger);
  const modal=document.createElement('iq-dialog');
  modal.innerHTML=`<dialog class="iq-dialog platform-command"><h2 class="sr-only">Поиск по платформе</h2><div class="iq-command-input">${icon('search',22)}<input type="search" aria-label="Поиск по платформе" placeholder="Задачи, карты, разделы…" autocomplete="off"><button type="button" class="iq-btn ghost icon sm" data-close aria-label="Закрыть поиск">${icon('x',18)}</button></div><p class="platform-search-scope">${esc(project.name)} · задачи, карты и настройки</p><div class="iq-command-list" data-search-results></div><p class="platform-search-status iq-helper" role="status"></p><div class="iq-command-foot">↑ ↓ — выбрать &nbsp; Enter — открыть &nbsp; Esc — закрыть</div></dialog>`;
  document.body.append(modal);
  const input=modal.querySelector('input'),results=modal.querySelector('[data-search-results]'),status=modal.querySelector('[role=status]');
  modal.querySelector('.platform-search-scope').textContent='Доступные пространства · задачи, карты и разделы';
  const routes=[['tasks','Доска задач'],['maps','Карты'],['spaces','Пространства'],['projects','Проекты'],['help/shortcuts','Горячие клавиши'],['settings','Настройки проекта'],['settings/tags','Теги проекта'],['settings/releases','Релизы проекта']].map(([id,title])=>({kind:'route',id,title,label:'Раздел',glyph:'chevron'}));
  let records=[],shown=[],generation=0,opening=false;
  const abort=new AbortController(),signal=abort.signal;
  const normalize=text=>String(text||'').toLocaleLowerCase('ru').replaceAll('ё','е');
  function draw(){
    const query=normalize(input.value.trim());
    shown=(query?records.filter(item=>normalize([item.title,item.description,item.displayId,item.owner,item.id].join(' ')).includes(query)):routes).slice(0,40);
    results.innerHTML=shown.map((item,i)=>`<button type="button" data-search-index="${i}">${icon(item.glyph,18)}<span>${esc(item.title)}<small>${esc(item.label)}${item.displayId?' · '+esc(item.displayId):''}</small></span>${icon('upRight',16)}</button>`).join('');
    status.textContent=shown.length?'':query?'Ничего не найдено. Попробуйте другое название или номер задачи.':'Начните вводить название.';
  }
  async function open(){
    if(opening||!(await readyToOpen()))return;
    opening=true;const token=++generation;
    input.value='';records=routes;draw();modal.show();input.focus();status.textContent='Ищем доступные задачи и карты…';
    try{
      const batches=await Promise.all(projects.map(async p=>{
        const [tasks,maps]=await Promise.all(['tasks','maps'].map(name=>repository.list(name,p.id)));
        return [...tasks.filter(t=>!t.archivedAt).map(t=>({...t,kind:'task',label:'Задача · '+p.name,glyph:'checklist'})),...maps.filter(m=>m.status!=='archived').map(m=>({...m,kind:'map',label:'Карта · '+p.name,glyph:'grid'}))];
      }));
      if(token!==generation)return;
      records=[...batches.flat(),...routes];draw();
    }catch{if(token===generation){draw();status.textContent='Не удалось загрузить результаты. Закройте поиск и попробуйте ещё раз.';}}
    finally{opening=false;}
  }
  async function choose(index){
    const item=shown[index];if(!item)return;
    modal.close(true);
    try{await onOpen(item);}catch{modal.show();status.textContent='Не удалось открыть результат. Возможно, он изменился или стал недоступен. Повторите поиск.';input.focus();}
  }
  input.addEventListener('input',draw,{signal});
  results.addEventListener('click',event=>{const button=event.target.closest('[data-search-index]');if(button)void choose(Number(button.dataset.searchIndex));},{signal});
  modal.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();modal.close();return;}
    const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp'].includes(event.key)&&buttons.length){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
    if(event.key==='Enter'&&event.target===input&&buttons.length){event.preventDefault();void choose(0);}
  },{signal});
  modal.addEventListener('iq-close',()=>{generation++;},{signal});
  trigger.addEventListener('click',open,{signal});
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&!event.isComposing){event.preventDefault();if(!document.querySelector('dialog[open]'))void open();}},{signal});
  return {destroy(){generation++;abort.abort();modal.close(true);modal.remove();trigger.remove();}};
}
