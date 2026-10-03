import {ui,icon,escapeHTML as esc,notify} from '@iquipage/web/core';
import {badgeText,bellLabel,rowMeta,kindGlyph,undoRequest} from './notification-model.js';

/** How often the count is refreshed while the page is visible. */
const POLL_MS=60000;
const key=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);

/**
 * The bell of the product header (docs/decisions/0006-notifications-telegram.md, 0007-notification-channels.md): the
 * unread count when there is one, and a DS menu with the person's notifications, newest first, twenty at a time. A row
 * opens its task and is read. Under a row, the one-click answers the server offers to this person now («Взять в
 * работу», «Принять», «Вернуть», «Перенести на завтра», «Ответить» with a short field) and «Прочитано»; each is the
 * person's ordinary write, shown at once and taken back from the toast where that is possible. Every control is a
 * menu item: arrows move between them, Enter acts, Escape closes. Quiet by design: no sound.
 */
export function mountNotificationBell(slot,{client,onOpen,onSettings}){
  const events=new AbortController();
  let items=[],next=null,unread=0,loading=false,disposed=false,timer=0,replying=null;
  slot.innerHTML=`<iq-menu class="pn-bell"><button type="button" class="iq-btn ghost icon sm pn-bell-trigger" aria-label="Уведомления" title="Уведомления" data-bell>${icon('bell',18)}<span class="pn-bell-count" aria-hidden="true" hidden></span></button>`
    +`<div data-menu class="pn-bell-popup" aria-label="Уведомления"><div class="pn-bell-body" data-bell-body></div></div></iq-menu>`;
  const trigger=slot.querySelector('[data-bell]'),count=slot.querySelector('.pn-bell-count'),body=slot.querySelector('[data-bell-body]');
  const avatar=item=>item.actor?ui.personAvatar({id:item.actor.id,name:item.actor.name||'?',image:client.avatarUrl?.(item.actor.id,item.actor.avatarRevision)||undefined},{size:'sm'})
    :`<span class="pn-bell-glyph" aria-hidden="true">${icon(kindGlyph(item.kind),16)}</span>`;
  function showCount(){
    const text=badgeText(unread);count.textContent=text;count.hidden=!text;
    trigger.setAttribute('aria-label',bellLabel(unread));trigger.title=bellLabel(unread);
  }
  const find=id=>items.find(i=>i.id===id);
  /**
   * What can be done under a row. The main answer is a quiet button, the others are text buttons, and «Прочитано»
   * shows only while the row is hovered or focused (opening the row reads it anyway). While a reply is being written,
   * its field and send button take the place of the buttons; Escape brings them back.
   */
  function controls(item){
    if(item.pending||item.result)return '';
    const id=esc(item.id);
    if(replying===item.id)return `<form class="pn-bell-reply" data-reply-form="${id}"><label class="sr-only" for="pn-reply-${id}">Ответ в обсуждение</label>`
      +`<span class="iq-input-shell"><input id="pn-reply-${id}" name="text" maxlength="20000" autocomplete="off" placeholder="Ответ в обсуждение" required></span>`
      +`<button type="submit" class="iq-btn primary sm" role="menuitem" tabindex="-1">Отправить</button></form>`;
    const buttons=(item.actions||[]).map((a,index)=>ui.btn(esc(a.label),`ghost sm${index===0?' pn-bell-main':''}`,'',`role="menuitem" tabindex="-1" data-quick="${esc(a.action)}" data-id="${id}"`)).join('')
      +(item.read?'':ui.btn('Прочитано','ghost sm pn-bell-read','',`role="menuitem" tabindex="-1" data-mark-read="${id}"`));
    return buttons?`<div class="pn-bell-actions" role="presentation">${buttons}</div>`:'';
  }
  /** What was just done, inside the row in place of its buttons; the toast keeps «Отменить». */
  function outcome(item){
    if(item.pending)return `<span class="pn-bell-done" role="status">${esc(item.pending)}…</span>`;
    if(item.result)return `<span class="pn-bell-done" role="status">${icon('check',14)}<span>${esc(item.result)}</span></span>`;
    return '';
  }
  function render(){
    const head=`<div class="pn-bell-head" role="presentation"><span class="pn-bell-title">Уведомления</span>${items.some(i=>!i.read)?`<button type="button" role="menuitem" tabindex="-1" class="iq-btn ghost sm" data-bell-read-all>Прочитать все</button>`:''}</div>`;
    const rows=items.map(item=>`<div class="pn-bell-entry" role="presentation"${item.read?'':' data-unread'}>`
      +`<button type="button" role="menuitem" tabindex="-1" class="pn-bell-item" data-action="notification:${esc(item.id)}"${item.read?'':' data-unread'}>`
      +`<span class="pn-bell-media">${avatar(item)}</span><span class="pn-bell-copy"><span class="pn-bell-text">${esc(item.text)}</span>`
      +`<span class="pn-bell-task">${esc(item.task?.title||'')}</span><span class="pn-bell-meta">${esc(rowMeta(item))}</span>${outcome(item)}</span>`
      +(item.read?'':'<span class="pn-bell-dot"><span class="sr-only">Не прочитано</span></span>')+'</button>'
      +controls(item)+'</div>').join('');
    const empty=loading&&!items.length?'<p class="pn-bell-empty" role="status">Загружаем…</p>'
      :!items.length?'<p class="pn-bell-empty">Пока ничего нет. Здесь появятся назначения, упоминания, запросы и сроки ваших задач.</p>':'';
    const more=next?`<button type="button" role="menuitem" tabindex="-1" class="iq-btn ghost sm" data-bell-more${loading?' disabled aria-busy="true"':''}>Показать ещё</button>`:'';
    body.innerHTML=head+`<div class="pn-bell-list" role="presentation">${rows}${empty}</div>`
      +`<div class="pn-bell-foot" role="presentation">${more}<button type="button" role="menuitem" tabindex="-1" class="iq-btn ghost sm" data-action="notification-settings">${icon('settings',16)}<span>Настроить</span></button></div>`;
  }
  /** Re-renders and puts focus back on a control of the same row, so the keyboard stays where the person was. */
  function renderAndFocus(selector){render();const target=selector&&body.querySelector(selector);if(target)target.focus({preventScroll:true});}
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
  function readLocally(item){if(!item.read){item.read=true;unread=Math.max(0,unread-1);showCount();}}
  /** A quick action: the row says what is being done at once; the server's answer replaces it, or the row comes back. */
  async function act(item,action,extra={}){
    const label=(item.actions||[]).find(a=>a.action===action)?.label||'Отправляем';
    const row=`[data-action="notification:${CSS.escape(item.id)}"]`;
    const before={...item};item.pending=label;replying=null;renderAndFocus(row);
    try{
      const done=await client.request(`/notifications/${encodeURIComponent(item.id)}/actions`,'POST',{action,...extra},key());
      if(disposed)return;
      Object.assign(item,{pending:null,result:done.result,actions:[]});readLocally(item);renderAndFocus(row);
      const undo=undoRequest(item,done.undo);
      notify({tone:'success',message:done.result,...(undo?{action:{label:'Отменить',run:()=>void client.request(undo.path,undo.method,undo.body,key())
        .then(()=>load()).catch(error=>notify({tone:'danger',message:'Не удалось отменить',description:error.message}))}}:{})});
    }catch(error){
      Object.assign(item,before,{pending:null});renderAndFocus(row);
      notify({tone:'danger',message:'Не получилось',description:error.message});
      if(error.status===409)void load();
    }
  }
  // Opening the menu loads the newest page; the menu itself owns focus, keys and closing.
  trigger.addEventListener('click',()=>{if(trigger.getAttribute('aria-expanded')==='true')void load();},{signal:events.signal});
  // Everything inside a row stays in the open menu: this handler stops the click before the menu would close.
  body.addEventListener('click',event=>{
    if(event.target.closest('[data-bell-read-all]')){
      event.stopPropagation();const newest=items[0];if(!newest)return;
      items=items.map(i=>({...i,read:true}));render();
      void markRead({before:newest.createdAt}).catch(()=>void load());
      return;
    }
    if(event.target.closest('[data-bell-more]')){event.stopPropagation();void load(true);return;}
    const read=event.target.closest('[data-mark-read]');
    if(read){
      event.stopPropagation();const item=find(read.dataset.markRead);if(!item)return;
      readLocally(item);renderAndFocus(`[data-action="notification:${CSS.escape(item.id)}"]`);
      void markRead({ids:[item.id]}).catch(()=>void load());
      return;
    }
    const quick=event.target.closest('[data-quick]');
    if(quick){
      event.stopPropagation();const item=find(quick.dataset.id);if(!item)return;
      if(quick.dataset.quick==='reply'){replying=replying===item.id?null:item.id;renderAndFocus(`[data-reply-form="${CSS.escape(item.id)}"] input`);return;}
      void act(item,quick.dataset.quick);
      return;
    }
    if(event.target.closest('.pn-bell-reply')&&!event.target.closest('[type=submit]'))event.stopPropagation();
  },{signal:events.signal});
  // The reply field is ordinary text: the menu's arrows, letters and Tab do not apply inside it; Escape leaves it.
  body.addEventListener('keydown',event=>{
    const form=event.target.closest?.('.pn-bell-reply');if(!form)return;
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();const id=form.dataset.replyForm;replying=null;renderAndFocus(`[data-quick="reply"][data-id="${CSS.escape(id)}"]`);}
  },{signal:events.signal});
  // The submit button would close the menu like any item; the form's own submit sends the reply instead.
  body.addEventListener('click',event=>{
    const submit=event.target.closest('.pn-bell-reply [type=submit]');if(!submit)return;
    event.stopPropagation();event.preventDefault();submit.closest('form').requestSubmit();
  },{capture:true,signal:events.signal});
  body.addEventListener('submit',event=>{
    const form=event.target.closest('.pn-bell-reply');if(!form)return;
    event.preventDefault();event.stopPropagation();
    const item=find(form.dataset.replyForm),text=String(new FormData(form).get('text')||'').trim();
    if(item&&text)void act(item,'reply',{text});
  },{signal:events.signal});
  slot.addEventListener('iq-action',event=>{
    const action=String(event.detail?.action||'');
    if(action!=='notification-settings'&&!action.startsWith('notification:'))return;
    event.stopPropagation();
    if(action==='notification-settings'){onSettings?.();return;}
    const item=find(action.slice('notification:'.length));if(!item)return;
    if(!item.read){readLocally(item);void markRead({ids:[item.id]}).catch(()=>{});}
    void onOpen?.(item);
  },{signal:events.signal});
  document.addEventListener('visibilitychange',()=>void refreshCount(),{signal:events.signal});
  const poll=()=>{timer=setTimeout(async()=>{await refreshCount();if(!disposed)poll();},POLL_MS);};
  void refreshCount();poll();
  return {refresh:refreshCount,destroy(){disposed=true;clearTimeout(timer);events.abort();slot.replaceChildren();}};
}
