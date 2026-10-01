import {ui,escapeHTML as esc,notify} from '@iquipage/web/core';
import {NOTIFICATION_KINDS,telegramStatus,emailStatus,hasChannels} from './notification-model.js';
import * as s from './settings-ui.js';

/** While a link waits for /start in the chat, the section looks again this often, for the link's fifteen minutes. */
const WAIT_MS=3000,WAIT_LIMIT_MS=15*60*1000;

/**
 * Настройки → Для меня → Уведомления (docs/decisions/0006-notifications-telegram.md, 0007-notification-channels.md).
 * In the product every notification is shown. Above, where else they go: the account's e-mail and Telegram, each with
 * its switch; below, which kinds go there. A channel the server does not offer is not shown; with none, only the bell.
 */
export async function mountNotificationSettings(root,{repository}){
  const client=repository.client,events=new AbortController();
  let data=await client.request('/profile/notifications'),busy=false,waiting=0,waitUntil=0,link=null,closed=false;
  function render(){
    const telegramState=telegramStatus(data.telegram),email=emailStatus(data.email),choice=data.preferences;
    // Plain sentences, no lists (DS copy rule): what the bell shows is said once.
    const inProduct=s.group({title:'В Sprintique',
      body:s.panel(s.row({title:'Колокольчик в шапке',meta:['Назначения, упоминания, запросы и сроки ваших задач. Эти уведомления всегда включены.']}))});
    if(!hasChannels(data)){root.innerHTML=inProduct;return;}
    const rows=[];
    if(email)rows.push(s.row({title:'Почта',meta:[`<b>${esc(email.address)}</b>`,esc(email.meta)],
      actions:ui.toggle('Уведомления на почту',choice.channels.email,'data-notification-channel="email"',false),attrs:'data-email-status'}));
    if(telegramState){
      const waitNote=!telegramState.connected&&link?`Ждём «Запустить» в чате. <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Открыть Telegram ещё раз</a>`:'';
      const actions=telegramState.connected
        ?ui.btn('Отключить','ghost sm','','data-telegram-action="disconnect"')+ui.toggle('Уведомления в Telegram',choice.channels.telegram,'data-notification-channel="telegram"',false)
        :ui.btn('Подключить Telegram','primary sm','send',`data-telegram-action="connect"${busy?' disabled aria-busy="true"':''}`);
      rows.push(s.row({title:'Telegram',meta:[esc(telegramState.meta),waitNote],actions,attrs:'data-telegram-status'}));
    }
    const channels=s.group({title:'Куда присылать',description:'Уведомления собираются и приходят вместе, одним сообщением или письмом. Изменения сохраняются сразу.',body:s.panel(rows.join(''))});
    const kinds=s.group({title:'О чём сообщать',description:'Для почты и Telegram. В колокольчике видно всё.',
      body:s.panel(NOTIFICATION_KINDS.map(k=>s.row({title:k.title,meta:[esc(k.hint)],
        actions:ui.toggle(k.title+' на почту и в Telegram',choice.kinds[k.kind]!==false,`data-notification-kind="${k.kind}"`,false)})).join(''))});
    root.innerHTML=channels+kinds+inProduct;
  }
  async function refresh(){data=await client.request('/profile/notifications');if(!closed)render();}
  function wait(){
    clearTimeout(waiting);
    if(closed||data.telegram.connection||Date.now()>waitUntil){link=data.telegram.connection?null:link;return;}
    waiting=setTimeout(async()=>{
      try{await refresh();if(data.telegram.connection){link=null;render();notify({tone:'success',message:'Telegram подключён'});return;}}catch{/* next round */}
      wait();
    },WAIT_MS);
  }
  root.addEventListener('click',async event=>{
    const action=event.target.closest('[data-telegram-action]')?.dataset.telegramAction;if(!action||busy)return;
    if(action==='connect'){
      // The window opens in the click itself, so the browser does not block it; it learns its address afterwards.
      const opened=window.open('about:blank','_blank');
      busy=true;render();
      try{
        const started=await client.request('/profile/telegram/link','POST',{});link=started.url;
        if(opened){opened.opener=null;opened.location.href=started.url;}
        waitUntil=Date.now()+WAIT_LIMIT_MS;wait();
      }catch(error){opened?.close();notify({tone:'danger',message:'Не удалось подключить Telegram',description:error.message});}
      finally{busy=false;if(!closed)render();}
      return;
    }
    if(action==='disconnect'){
      busy=true;
      try{data=await client.request('/profile/telegram','DELETE');notify({message:'Telegram отключён'});}
      catch(error){notify({tone:'danger',message:'Не удалось отключить Telegram',description:error.message});}
      finally{busy=false;if(!closed)render();}
    }
  },{signal:events.signal});
  // One switch at a time: the whole choice is saved with the new value; a refusal puts the switch back.
  root.addEventListener('change',async event=>{
    const toggle=event.target.closest('[data-notification-channel],[data-notification-kind]');if(!toggle)return;
    const current=data.preferences,channel=toggle.dataset.notificationChannel,kind=toggle.dataset.notificationKind;
    const body={channels:{...current.channels,...(channel?{[channel]:toggle.checked}:{})},kinds:{...current.kinds,...(kind?{[kind]:toggle.checked}:{})}};
    toggle.disabled=true;
    try{data=await client.request('/profile/notifications','PUT',body);}
    catch(error){toggle.checked=!toggle.checked;notify({tone:'danger',message:'Настройка не сохранена',description:error.message});}
    finally{toggle.disabled=false;}
  },{signal:events.signal});
  render();
  return {readyToLeave:()=>!busy,destroy(){closed=true;clearTimeout(waiting);events.abort();}};
}

/**
 * «Внешние уведомления» of a project (О проекте): whether its notifications may leave the product, to e-mail and
 * Telegram, for everyone who switched those on. On unless someone who configures the project switched it off. Shown
 * only when the server offers a channel. Returns nothing to tear down: the toggle saves at once.
 */
export async function mountProjectNotifications(slot,{client,project,lock=''}){
  if(!slot)return;
  const path='/projects/'+encodeURIComponent(project.id)+'/notifications';
  let data;try{data=await client.request(path);}catch{return;}
  if(!data.available||!slot.isConnected)return;
  const render=()=>{slot.innerHTML=s.group({title:'Внешние уведомления',
    description:'Участники получают уведомления о задачах этого проекта на почту и в Telegram, если включили их у себя. В Sprintique уведомления видны всегда.',
    body:(data.canChange?'':lock)+s.panel(s.row({title:'Отправлять на почту и в Telegram',meta:[data.enabled?'Включено для всех участников проекта.':'Выключено: уведомления проекта остаются только в Sprintique.'],
      actions:ui.toggle('Отправлять на почту и в Telegram',data.enabled,`data-project-notifications${data.canChange?'':' disabled'}`,false)}))});};
  render();
  slot.addEventListener('change',async event=>{
    const toggle=event.target.closest('[data-project-notifications]');if(!toggle)return;toggle.disabled=true;
    try{data=await client.request(path,'PUT',{enabled:toggle.checked,baseRevision:data.revision});notify({tone:'success',message:data.enabled?'Уведомления проекта снова уходят на почту и в Telegram':'Уведомления проекта остаются только в Sprintique'});}
    catch(error){notify({tone:'danger',message:'Настройка не сохранена',description:error.message});try{data=await client.request(path);}catch{/* keep the shown state */}}
    render();
  });
}
/** The name the project settings page imports. */
export {mountProjectNotifications as mountProjectTelegram};
