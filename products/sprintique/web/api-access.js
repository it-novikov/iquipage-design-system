import {ui,enhance,escapeHTML as esc,formatDate,formatDateTime} from '@iquipage/web/core';
import {dialog,input,select,check} from '../ui/src/ui.js';
import * as s from './settings-ui.js';

// «Доступ приложений»: the apps a person connected by OAuth (Claude and other MCP clients) and the personal access
// tokens for scripts. Both act with the person's own rights; only this screen, with the person's session, can make or
// end them. A token is shown once.
const scopeNames=scopes=>scopes.includes('write')?'Чтение и изменения':'Только чтение';
const when=value=>value?formatDateTime(value):'';

export async function mountApiAccess(root,{repository,tools}){
  const client=repository.client,abort=new AbortController();
  let closed=false,modal=null,apps=[],tokens=[],mcpUrl='';
  if(tools)tools.innerHTML=ui.btn('Создать токен','primary sm','plus','data-token-create');
  function show(options){modal=dialog(options);modal.addEventListener('iq-close',()=>{modal=null;void refresh().catch(fail);},{once:true});return modal;}
  function fail(error){if(closed)return;if(modal){const el=modal.querySelector('[role=alert]');if(el){el.textContent=error.message;el.hidden=false;}}else show({title:'Не удалось загрузить данные',description:error.message});}
  const appRow=a=>s.row({media:s.tile('spark'),title:a.name,titleExtra:' '+s.badge('Название указало приложение'),
    meta:[esc(scopeNames(a.scopes)),a.redirectHost?`Возврат на ${esc(a.redirectHost)}`:'',`Подключено ${esc(when(a.createdAt))}`,a.lastUsedAt?`Последний запрос ${esc(when(a.lastUsedAt))}`:''],
    actions:ui.btn('Отключить','ghost sm','',`data-app-revoke="${esc(a.id)}"`)});
  const tokenRow=t=>s.row({media:s.tile('bolt'),title:t.name,
    meta:[esc(scopeNames(t.scopes)),`Действует до ${esc(formatDate(t.expiresAt))}`,t.lastUsedAt?`Последний запрос ${esc(when(t.lastUsedAt))}`:'Ещё не использовался'],
    actions:ui.btn('Отозвать','ghost sm','',`data-token-revoke="${esc(t.id)}"`)});
  function render(){
    if(closed)return;
    root.innerHTML=`${s.group({title:'Подключённые приложения',count:apps.length,description:'Claude и другие MCP-клиенты, которым вы разрешили работать от вашего имени. Отключение действует сразу.',
        body:s.panel(apps.map(appRow).join('')||s.empty({title:'Приложений нет',body:'Приложение попросит доступ само, когда вы подключите Sprintique как коннектор.',glyph:'spark'}))})}
      ${s.group({title:'Токены доступа',count:tokens.length,description:'Для своих скриптов и программ: REST API и MCP с вашими правами. Храните токен как пароль.',
        body:s.panel(tokens.map(tokenRow).join('')||s.empty({title:'Токенов нет',body:'Создайте токен, чтобы работать с API из скрипта.',action:ui.btn('Создать токен','secondary sm','plus','data-token-create'),glyph:'bolt'}))})}
      ${mcpUrl?s.group({title:'Как подключить Claude',description:'В Claude: Настройки → Коннекторы → Добавить свой коннектор, адрес ниже. Claude откроет эту страницу входа и попросит разрешение.',
        body:s.panel(s.facts([['Адрес MCP-сервера',s.copyValue(mcpUrl,'Скопировать адрес MCP-сервера')]]))}):''}`;
    enhance(root);
  }
  async function refresh(){
    if(closed||modal)return;
    const [a,t,resource]=await Promise.all([client.request('/connected-apps'),client.request('/personal-tokens'),
      fetch('/.well-known/oauth-protected-resource/mcp').then(r=>r.ok?r.json():null).catch(()=>null)]);
    if(closed||modal)return;apps=a.items;tokens=t.items;mcpUrl=resource?.resource||'';render();
  }
  function create(){
    show({title:'Создать токен доступа',description:'Токен действует от вашего имени и только в ваших проектах. Покажем его один раз.',
      body:input('name','Название','',{required:true,maxlength:100,placeholder:'Например, Отчёт по релизу'})+select('days','Срок действия','30',[['7','7 дней'],['30','30 дней'],['90','90 дней'],['365','1 год']])+check('write','Разрешить изменения: создавать и менять задачи, писать комментарии'),
      submitLabel:'Создать',onSubmit:async(values,_form,el)=>{
        const name=String(values.get('name')||'').trim();if(!name)throw Error('Введите название.');
        const token=await client.request('/personal-tokens','POST',{name,scopes:values.has('write')?['read','write']:['read'],expiresInDays:Number(values.get('days'))});
        const body=el.querySelector('.map-dialog-body');body.innerHTML=s.secret({label:'Токен доступа',value:token.token,note:'Токен покажем только сейчас. Передавайте его в заголовке Authorization: Bearer и не храните в коде, задачах и чатах.'});enhance(body);
        body.querySelector('input').select();el.querySelector('[type=submit]').remove();el.querySelector('.iq-dialog-footer [data-close]').textContent='Готово';return false;
      }});
  }
  const onClick=event=>{void(async()=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-token-create'))return create();
    if(target.dataset.tokenRevoke){const item=tokens.find(t=>t.id===target.dataset.tokenRevoke);return show({title:`Отозвать токен «${item?.name||''}»?`,description:'Скрипты с этим токеном сразу перестанут работать.',submitLabel:'Отозвать',success:'Токен отозван',onSubmit:()=>client.request('/personal-tokens/'+encodeURIComponent(target.dataset.tokenRevoke),'DELETE')});}
    if(target.dataset.appRevoke){const item=apps.find(a=>a.id===target.dataset.appRevoke);return show({title:`Отключить «${item?.name||'приложение'}»?`,description:'Приложение сразу потеряет доступ. Чтобы вернуть его, подключите приложение заново.',submitLabel:'Отключить',success:'Приложение отключено',onSubmit:()=>client.request('/connected-apps/'+encodeURIComponent(target.dataset.appRevoke),'DELETE')});}
  })().catch(fail);};
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await refresh();
  return {readyToLeave:()=>!modal,destroy(){closed=true;abort.abort();modal?.close(true);root.replaceChildren();}};
}
