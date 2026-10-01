import {ui,icon,escapeHTML as esc} from '@iquipage/web/core';
import {badgeText,bellLabel,rowMeta,kindGlyph} from './notification-model.js';

/** How often the count is refreshed while the page is visible. */
const POLL_MS=60000;

/**
 * The bell of the product header (docs/decisions/0006-notifications-telegram.md): the unread count when there is
 * one, and a DS menu with the person's notifications, newest first, twenty at a time. A row opens its task and is
 * read; «Прочитать все» reads everything up to the newest row shown. Quiet by design: no sound, no toast.
 */
export function mountNotificationBell(slot,{client,onOpen,onSettings}){
  const events=new AbortController();
  let items=[],next=null,unread=0,loading=false,disposed=false,timer=0;
  slot.innerHTML=`<iq-menu class="pn-bell"><button type="button" class="iq-btn ghost icon sm pn-bell-trigger" aria-label="Уведомления" title="Уведомления" data-bell>${icon('bell',18)}<span class="pn-bell-count" aria-hidden="true" hidden></span></button>`
    +`<div data-menu class="pn-bell-popup" aria-label="Уведомления"><div class="pn-bell-body" data-bell-body></div></div></iq-menu>`;
  const trigger=slot.querySelector('[data-bell]'),count=slot.querySelector('.pn-bell-count'),body=slot.querySelector('[data-bell-body]');
  const avatar=item=>item.actor?ui.personAvatar({id:item.actor.id,name:item.actor.name||'?',image:client.avatarUrl?.(item.actor.id,item.actor.avatarRevision)||undefined},{size:'sm'})
    :`<span class="pn-bell-glyph" aria-hidden="true">${icon(kindGlyph(item.kind),16)}</span>`;
  function showCount(){
    const text=badgeText(unread);count.textContent=text;count.hidden=!text;
    trigger.setAttribute('aria-label',bellLabel(unread));trigger.title=bellLabel(unread);
  }
  function render(){
    const head=`<div class="pn-bell-head" role="presentation"><span class="pn-bell-title">Уведомления</span>${items.some(i=>!i.read)?`<button type="button" role="menuitem" tabindex="-1" class="iq-btn ghost sm" data-bell-read-all>Прочитать все</button>`:''}</div>`;
    const rows=items.map(item=>`<button type="button" role="menuitem" tabindex="-1" class="pn-bell-item" data-action="notification:${esc(item.id)}"${item.read?'':' data-unread'}>`
      +`<span class="pn-bell-media">${avatar(item)}</span><span class="pn-bell-copy"><span class="pn-bell-text">${esc(item.text)}</span><span class="pn-bell-meta">${esc(rowMeta(item))}</span></span>`
      +(item.read?'':'<span class="pn-bell-dot"><span class="sr-only">Не прочитано</span></span>')+'</button>').join('');
    const empty=loading&&!items.length?'<p class="pn-bell-empty" role="status">Загружаем…</p>'
      :!items.length?'<p class="pn-bell-empty">Пока ничего нет. Здесь появятся назначения, упоминания, запросы и сроки ваших задач.</p>':'';
    const more=next?`<button type="button" role="menuitem" tabindex="-1" class="iq-btn ghost sm" data-bell-more${loading?' disabled aria-busy="true"':''}>Показать ещё</button>`:'';
    body.innerHTML=head+`<div class="pn-bell-list" role="presentation">${rows}${empty}</div>`
      +`<div class="pn-bell-foot" role="presentation">${more}<button type="button" role="menuitem" tabindex="-1" class="iq-btn ghost sm" data-action="notification-settings">${icon('settings',16)}<span>Настроить</span></button></div>`;
  }
  async function refreshCount(){
    if(disposed||document.visibilityState!=='visible')return;
    try{unread=(await client.request('/notifications/unread')).unread;showCount();}catch{/* The count waits for the next round. */}
  }
  async function load(more=false){
    if(loading)return;loading=true;if(!more)render();
    try{
      const page=await client.request('/notifications'+(more&&next?'?cursor='+encodeURIComponent(next):''));
      if(disposed)return;
      items=more?[...items,...page.items]:page.items;next=page.nextCursor;unread=page.unread;showCount();
    }catch(error){if(!more&&!items.length)body.innerHTML=`<p class="pn-bell-empty" role="alert">${esc(error.message||'Не удалось загрузить уведомления.')}</p>`;return;}
    finally{loading=false;}
    render();
  }
  async function markRead(payload){
    const result=await client.request('/notifications/read','POST',payload);unread=result.unread;showCount();
  }
  // Opening the menu loads the newest page; the menu itself owns focus, keys and closing.
  trigger.addEventListener('click',()=>{if(trigger.getAttribute('aria-expanded')==='true')void load();},{signal:events.signal});
  // Reading everything and the next page stay inside the open menu.
  body.addEventListener('click',event=>{
    if(event.target.closest('[data-bell-read-all]')){
      event.stopPropagation();const newest=items[0];if(!newest)return;
      items=items.map(i=>({...i,read:true}));render();
      void markRead({before:newest.createdAt}).catch(()=>void load());
      return;
    }
    if(event.target.closest('[data-bell-more]')){event.stopPropagation();void load(true);}
  },{signal:events.signal});
  slot.addEventListener('iq-action',event=>{
    const action=String(event.detail?.action||'');
    if(action!=='notification-settings'&&!action.startsWith('notification:'))return;
    event.stopPropagation();
    if(action==='notification-settings'){onSettings?.();return;}
    const item=items.find(i=>i.id===action.slice('notification:'.length));if(!item)return;
    if(!item.read){item.read=true;unread=Math.max(0,unread-1);showCount();void markRead({ids:[item.id]}).catch(()=>{});}
    void onOpen?.(item);
  },{signal:events.signal});
  document.addEventListener('visibilitychange',()=>void refreshCount(),{signal:events.signal});
  const poll=()=>{timer=setTimeout(async()=>{await refreshCount();if(!disposed)poll();},POLL_MS);};
  void refreshCount();poll();
  return {refresh:refreshCount,destroy(){disposed=true;clearTimeout(timer);events.abort();slot.replaceChildren();}};
}
