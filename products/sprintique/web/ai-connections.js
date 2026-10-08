import {ui,enhance,notify,escapeHTML as esc,formatDateTime} from '@iquipage/web/core';
import {dialog,input} from '../ui/src/ui.js';
import {choose,rowMenu,explain,plural} from './access-ui.js';
import * as s from './settings-ui.js';
import {failed} from '../ui/src/action-feedback.js';

// «ИИ-подключения» (Пространство): keys of language model providers that agents of service accounts think with
// (docs/decisions/0005-ai-agents.md). People with «Настраивать пространство» add, change, check and delete them; other
// members see names and models. A key is written once and never shown again: the server seals it and keeps its last
// four characters to tell keys apart. «Проверить» makes one minimal real call to the provider.
const placeholders={anthropic:'https://api.anthropic.com',openai:'https://api.openai.com/v1',openai_compatible:'https://openrouter.ai/api/v1'};
const keyHints={anthropic:'sk-ant-…',openai:'sk-…',openai_compatible:'sk-or-… или ключ вашего сервера'};
const keyField=(provider,label='Ключ API',placeholder=keyHints[provider]||'')=>{
  const html=input('apiKey',label,'',{type:'password',placeholder,maxlength:4096});
  // A key is never prefilled or remembered by the browser.
  return html.replace('<input ','<input autocomplete="off" spellcheck="false" ');
};

export async function mountAiConnections(root,{repository,project,tools}){
  const client=repository.client,abort=new AbortController(),base='/workspaces/'+encodeURIComponent(project.workspaceId)+'/ai-connections';
  let closed=false,modal=null,data=null,checking=new Set();
  if(tools)tools.innerHTML='';
  function track(element){modal=element;element.addEventListener('iq-close',()=>{if(modal===element)modal=null;void refresh().catch(fail);},{once:true});return element;}
  const show=options=>track(dialog(options));
  function fail(error){if(!closed)failed(error,{description:explain(error)});}
  const state=c=>!c.lastTest?s.badge('Не проверено'):c.lastTest.state==='connected'?s.badge('Работает','success'):s.badge('Ошибка','danger');
  function row(c){
    const meta=[esc(c.defaultModel?`Модель по умолчанию: ${c.defaultModel}`:'Модель выбирается у агента'),
      c.keyHint?`Ключ <code class="iq-settings-code">…${esc(c.keyHint)}</code>`:'',
      c.baseUrl?`<code class="iq-settings-code">${esc(c.baseUrl)}</code>`:'',
      c.lastTest?esc(c.lastTest.state==='connected'?`Проверено ${formatDateTime(c.lastTest.at)}`:`${c.lastTest.message||'Проверка не прошла'} (${formatDateTime(c.lastTest.at)})`):'',
      c.agents?esc(`Агентов: ${c.agents}`):''];
    const actions=data.canManage?ui.btn(checking.has(c.id)?'Проверяем…':'Проверить','ghost sm','refresh',`data-ai-check="${esc(c.id)}"${checking.has(c.id)?' disabled aria-busy="true"':''}`)
      +rowMenu(c.name,[{label:'Изменить',action:'ai-edit',glyph:'settings'},{label:'Удалить',action:'ai-delete',danger:true,glyph:'trash'}]):'';
    return s.row({media:s.tile('spark'),title:c.name,titleExtra:' '+s.badge(c.providerName||c.provider,'planned'),meta,aside:state(c),actions,
      state:c.lastTest?.state==='failed'?'muted':'',attrs:`data-ai-connection="${esc(c.id)}"`});
  }
  function render(){
    if(closed)return;
    const add=data.canManage&&data.available?ui.btn('Добавить подключение','primary sm','plus','data-ai-add'):'';
    root.innerHTML=`${data.available?'':s.lock('ИИ-подключения не настроены на сервере: нет ключа шифрования. Его задаёт администратор сервера.')}
      ${!data.canManage&&data.available?s.lock('Вы можете только просматривать. Подключения меняют те, кто настраивает пространство.'):''}
      ${s.group({title:'ИИ-подключения',count:data.items.length,description:'Агент сервисного аккаунта работает с правами своего аккаунта, не шире. Текст задач уходит провайдеру выбранного подключения.',actions:add,
        body:s.panel(data.items.map(row).join('')||s.empty({title:'Подключений нет',body:'Добавьте ключ Claude, ChatGPT или любого совместимого с OpenAI сервиса, например OpenRouter.',action:add?ui.btn('Добавить подключение','secondary sm','plus','data-ai-add'):'',glyph:'spark'}),'ul')})}
      ${s.group({title:'Как это устроено',body:s.panel(s.facts([
        ['Ключ','Показывается только при вводе. Сервер хранит его зашифрованным и не отдаёт обратно; видны последние четыре символа.'],
        ['Проверка','«Проверить» делает один настоящий запрос к провайдеру: список моделей или ответ в один токен.'],
        ['Адрес','Только https:// на публичном адресе. Локальные модели (vLLM, Ollama) разрешает администратор сервера.'],
        ['Агенты','Настраиваются у сервисного аккаунта в разделе «Агент». Удаление подключения выключает его агентов.']].map(([term,value])=>[term,esc(value)])))})}`;
    enhance(root);
  }
  async function refresh(){if(closed||modal)return;data=await client.request(base);render();}
  const current=id=>data.items.find(c=>c.id===id);
  function form(c){
    const provider=c?.provider||'anthropic';
    return input('name','Название',c?.name||'',{required:true,maxlength:100,placeholder:'Например, Claude для команды'})
      +(c?`<p class="iq-helper">${esc(c.providerName||c.provider)}. Тип подключения не меняется: создайте новое.</p>`
        :choose('provider','Провайдер',provider,[['anthropic','Anthropic (Claude)'],['openai','OpenAI (ChatGPT)'],['openai_compatible','Совместимый с OpenAI: OpenRouter, DeepSeek, свой сервер']],'data-ai-provider'))
      +input('baseUrl','Адрес API',c?.baseUrl||'',{maxlength:500,placeholder:placeholders[provider]})
      +`<p class="iq-helper" data-ai-base-hint>${provider==='openai_compatible'?'Обязателен: адрес, к которому добавляется /chat/completions.':'Можно оставить пустым: будет адрес провайдера.'}</p>`
      +keyField(provider,c?`Новый ключ API — текущий …${c.keyHint}`:'Ключ API',c?'Оставьте пустым, чтобы не менять':keyHints[provider])
      +input('defaultModel','Модель по умолчанию — необязательно',c?.defaultModel||'',{maxlength:200,placeholder:provider==='anthropic'?'claude-sonnet-4-5':provider==='openai'?'gpt-5':'anthropic/claude-sonnet-4.5'});
  }
  function values(raw){
    const text=name=>String(raw.get(name)||'').trim();
    const value={name:text('name'),baseUrl:text('baseUrl')||null,defaultModel:text('defaultModel')||null};
    if(!value.name)throw Error('Введите название.');
    return {...value,apiKey:text('apiKey')};
  }
  function add(){
    show({title:'Новое ИИ-подключение',description:'Ключ увидите только сейчас: после сохранения сервер хранит его зашифрованным и не показывает.',body:form(null),submitLabel:'Добавить',
      mount:el=>{el.addEventListener('iq-change',event=>{
        if(!event.target.closest('[data-ai-provider]'))return;const provider=event.detail?.value??event.target.value;
        el.querySelector('[name=baseUrl]').placeholder=placeholders[provider]||'';el.querySelector('[name=apiKey]').placeholder=keyHints[provider]||'';
        el.querySelector('[data-ai-base-hint]').textContent=provider==='openai_compatible'?'Обязателен: адрес, к которому добавляется /chat/completions.':'Можно оставить пустым: будет адрес провайдера.';
      });},
      onSubmit:async raw=>{
        const {apiKey,...value}=values(raw),provider=String(raw.get('provider')||'anthropic');
        if(!apiKey)throw Error('Введите ключ API.');
        let made;try{made=await client.request(base,'POST',{...value,provider,apiKey});}catch(error){throw Error(explain(error));}
        notify({tone:'success',message:`Подключение «${made.name}» добавлено`,description:'Нажмите «Проверить», чтобы убедиться, что ключ работает.'});
      }});
  }
  function edit(c){
    show({title:`Изменить «${c.name}»`,description:'Новый ключ заменит прежний. Смена адреса или ключа сбрасывает результат проверки.',body:form(c),submitLabel:'Сохранить',
      onSubmit:async raw=>{
        const {apiKey,...value}=values(raw);
        try{await client.request(base+'/'+encodeURIComponent(c.id),'PUT',{baseRevision:c.revision,...value,...(apiKey?{apiKey}:{})});}
        catch(error){throw Error(explain(error));}
        notify({tone:'success',message:'Подключение сохранено'});
      }});
  }
  function remove(c){
    show({title:`Удалить подключение «${c.name}»?`,description:'Ключ сотрётся сразу. Агенты, которые им пользуются, выключатся; их незаконченные запуски остановятся.',
      body:c.agents?s.panel(s.facts([['Агенты',esc(plural(c.agents,['агент выключится','агента выключатся','агентов выключатся']))]])):'',
      submitLabel:'Удалить',mount:el=>{el.querySelector('[type=submit]')?.classList.replace('primary','danger');},
      onSubmit:async()=>{try{await client.request(base+'/'+encodeURIComponent(c.id),'DELETE');}catch(error){throw Error(explain(error));}notify({tone:'success',message:`Подключение «${c.name}» удалено`});}});
  }
  async function check(c){
    if(checking.has(c.id))return;checking.add(c.id);render();
    try{
      const result=await client.request(base+'/'+encodeURIComponent(c.id)+'/check','POST',{});
      if(result.lastTest?.state==='connected')notify({tone:'success',message:`«${c.name}» работает`,description:result.models?.length?`Провайдер назвал моделей: ${result.models.length}.`:''});
      else notify({tone:'danger',message:`«${c.name}» не отвечает как нужно`,description:result.message||result.lastTest?.message||'',duration:10000});
    }catch(error){fail(error);}
    finally{checking.delete(c.id);}
    await refresh();
  }
  const onClick=event=>{void(async()=>{
    const target=event.target.closest('button');if(!target||target.disabled||modal)return;
    if(target.hasAttribute('data-ai-add'))return add();
    const c=current(target.dataset.aiCheck||target.closest('[data-ai-connection]')?.dataset.aiConnection);if(!c)return;
    if(target.dataset.aiCheck)return check(c);
    if(target.dataset.action==='ai-edit')return edit(c);
    if(target.dataset.action==='ai-delete')return remove(c);
  })().catch(fail);};
  root.addEventListener('click',onClick,{signal:abort.signal});
  await refresh();
  return {readyToLeave:()=>!modal&&!checking.size,destroy(){closed=true;abort.abort();modal?.close(true);root.replaceChildren();}};
}
