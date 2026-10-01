import {ui,escapeHTML as esc,notify} from '@iquipage/web/core';
import {TELEGRAM_KINDS,telegramStatus} from './notification-model.js';
import * as s from './settings-ui.js';

/** While a link waits for /start in the chat, the section looks again this often, for the link's fifteen minutes. */
const WAIT_MS=3000,WAIT_LIMIT_MS=15*60*1000;

/**
 * Настройки → Для меня → Уведомления (docs/decisions/0006-notifications-telegram.md). In the product every
 * notification is shown; Telegram is linked here, per kind. Without Telegram on the server only the first part shows.
 */
export async function mountNotificationSettings(root,{repository}){
  const client=repository.client,events=new AbortController();
  let data=await client.request('/profile/notifications'),busy=false,waiting=0,waitUntil=0,link=null,closed=false;
  function render(){
    const status=telegramStatus(data.telegram);
    const inProduct=s.group({title:'В Sprintique',description:'Колокольчик в шапке показывает то, что ждёт вашего действия. Эти уведомления всегда включены.',
      body:s.panel(TELEGRAM_KINDS.map(k=>s.row({title:k.title,meta:[esc(k.hint)]})).join(''))});
    if(!status){root.innerHTML=inProduct;return;}
    const connectAction=status.connected?ui.btn('Отключить','ghost sm','','data-telegram-action="disconnect"')
      :ui.btn('Подключить Telegram','primary sm','send',`data-telegram-action="connect"${busy?' disabled aria-busy="true"':''}`);
    const waitNote=!status.connected&&link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Открыть Telegram ещё раз</a> · ждём «Запустить» в чате`:'';
    const telegram=s.group({title:'Telegram',description:'Бот пишет вам лично. Ссылка для подключения действует 15 минут и только один раз.',
      body:s.panel(s.row({media:s.tile('send'),title:status.title,meta:[esc(status.meta),waitNote],actions:connectAction,attrs:'data-telegram-status'}))});
    // What goes to Telegram is chosen once there is a chat to send to; until then the kinds are listed below.
    const kinds=status.connected?s.group({title:'Что приходит в Telegram',description:'Изменения сохраняются сразу.',
      body:s.panel(TELEGRAM_KINDS.map(k=>s.row({title:k.title,meta:[esc(k.hint)],
        actions:ui.toggle(k.title+' в Telegram',data.preferences.telegram[k.kind]!==false,`data-telegram-kind="${k.kind}"`,false)})).join(''))}):'';
    root.innerHTML=telegram+kinds+inProduct;
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
  root.addEventListener('change',async event=>{
    const toggle=event.target.closest('[data-telegram-kind]');if(!toggle)return;
    const telegram={...data.preferences.telegram,[toggle.dataset.telegramKind]:toggle.checked};toggle.disabled=true;
    try{data=await client.request('/profile/notifications','PUT',{telegram});}
    catch(error){toggle.checked=!toggle.checked;notify({tone:'danger',message:'Настройка не сохранена',description:error.message});}
    finally{toggle.disabled=false;}
  },{signal:events.signal});
  render();
  return {readyToLeave:()=>!busy,destroy(){closed=true;clearTimeout(waiting);events.abort();}};
}

/**
 * «Уведомления в Telegram» of a project (О проекте): on unless someone who configures the project switched it off.
 * Shown only when Telegram exists on the server. Returns nothing to tear down: the toggle saves at once.
 */
export async function mountProjectTelegram(slot,{client,project,lock=''}){
  if(!slot)return;
  const path='/projects/'+encodeURIComponent(project.id)+'/telegram';
  let data;try{data=await client.request(path);}catch{return;}
  if(!data.available||!slot.isConnected)return;
  const render=()=>{slot.innerHTML=s.group({title:'Уведомления в Telegram',
    description:'Участники, подключившие Telegram, получают туда уведомления о задачах этого проекта. В Sprintique уведомления видны всегда.',
    body:(data.canChange?'':lock)+s.panel(s.row({media:s.tile('send'),title:'Отправлять в Telegram',meta:[data.enabled?'Включено для всех участников проекта.':'Выключено: уведомления проекта остаются только в Sprintique.'],
      actions:ui.toggle('Отправлять в Telegram',data.enabled,`data-project-telegram${data.canChange?'':' disabled'}`,false)}))});};
  render();
  slot.addEventListener('change',async event=>{
    const toggle=event.target.closest('[data-project-telegram]');if(!toggle)return;toggle.disabled=true;
    try{data=await client.request(path,'PUT',{enabled:toggle.checked,baseRevision:data.revision});notify({tone:'success',message:data.enabled?'Уведомления проекта идут в Telegram':'Уведомления проекта больше не идут в Telegram'});}
    catch(error){notify({tone:'danger',message:'Настройка не сохранена',description:error.message});try{data=await client.request(path);}catch{/* keep the shown state */}}
    render();
  });
}
