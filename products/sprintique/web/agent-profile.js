import {ui,enhance,escapeHTML as esc} from '@iquipage/web/core';
import {dialog,input} from '../ui/src/ui.js';
import {choose,explain,plural} from './access-ui.js';
import * as s from './settings-ui.js';

// «Агент» of a service account (docs/decisions/0005-ai-agents.md): the account can think with a language model of an
// AI connection of its workspace and work on tasks inside Sprintique — when a task is assigned to it, and when a person
// who may change a task starts it from the task. It acts with the account's rights and nothing more. Its owner and
// people who manage the workspace's people configure it; nobody else sees this section.
const providerNames={anthropic:'Anthropic',openai:'OpenAI',openai_compatible:'совместимый с OpenAI'};
/** The public creatable combobox keeps provider suggestions and an explicit custom model choice. */
function modelField(value,models){
  const options=[...new Set([value,...models].filter(Boolean))].map(value=>({value,label:value}));
  return `<iq-combobox name="model" label="Модель" value="${esc(value)}" options="${esc(JSON.stringify(options))}" creatable create-label="Использовать «{query}»" placeholder="Выберите или укажите модель"></iq-combobox>`;
}
/** When the agent starts, as one sentence: «Начинает работу, когда …, когда … и по кнопке в задаче». */
function startsWhen(p,name){
  const parts=[p.onAssignment?'когда на аккаунт назначают задачу':'',p.onMention!==false?`когда его упоминают в обсуждении (@${name})`:'','по кнопке в задаче'].filter(Boolean);
  return 'Начинает работу'+(parts.length>1?', ':' ')+(parts.length>1?parts.slice(0,-1).join(', ')+' и ':'')+parts.at(-1);
}
const number=(name,label,value,min,max)=>input(name,label,String(value),{type:'number',required:true,maxlength:7}).replace('<input ',`<input min="${min}" max="${max}" step="1" inputmode="numeric" `);

export async function mountAgentProfile(root,{client,account,track}){
  if(!root)return;
  let data;
  try{data=await client.request('/service-accounts/'+encodeURIComponent(account.id)+'/agent');}
  catch{root.replaceChildren();return;}// Not a manager of this account, or the feature is off: no section.
  if(!root.isConnected)return;
  const p=data.profile,connection=p&&data.connections.find(c=>c.id===p.connectionId);
  const summary=p?s.row({media:s.tile('spark'),title:p.enabled?'Агент включён':'Агент выключен',
      meta:[esc(connection?`${connection.name} · ${p.model}`:'ИИ-подключение удалено'),
        esc(startsWhen(p,account.name)),
        esc(`До ${plural(p.maxSteps,['шага','шагов','шагов'])} за запуск, не больше ${plural(p.runsPerHour,['запуска','запусков','запусков'])} в час`),
        p.runsLastHour?esc(`За последний час: ${plural(p.runsLastHour,['запуск','запуска','запусков'])}`):''],
      aside:p.enabled?s.badge('Включён','success'):s.badge('Выключен'),state:p.enabled?'':'muted'})
    :s.empty({title:'Агент не настроен',body:data.connections.length?'Выберите ИИ-подключение и модель: аккаунт сможет сам работать над задачами.':'Сначала добавьте ИИ-подключение в настройках пространства.',glyph:'spark'});
  const action=data.connections.length||p?ui.btn(p?'Настроить':'Настроить агента','secondary sm','settings','data-agent-configure'):'';
  root.innerHTML=s.group({title:'Агент',description:'Аккаунт сам работает над задачами с помощью языковой модели — только инструментами Sprintique и только в пределах своих прав в проекте. Ответ он пишет в обсуждение задачи.',
    actions:action,body:s.panel(summary)})+(data.available?'':s.lock('ИИ-подключения не настроены на сервере: агент не сможет работать.'));
  enhance(root);
  root.querySelector('[data-agent-configure]')?.addEventListener('click',()=>configure(data));

  function configure(current){
    const p=current.profile,defaults=current.defaults,options=current.connections.map(c=>[c.id,`${c.name} · ${providerNames[c.provider]||c.provider}`]);
    const first=p?.connectionId||options[0]?.[0]||'',connectionOf=id=>current.connections.find(c=>c.id===id);
    const models=id=>{const c=connectionOf(id);return [...new Set([c?.defaultModel,...(c?.models||[])].filter(Boolean))];};
    track(dialog({title:`Агент «${account.name}»`,description:'Агент читает задачу и действует инструментами Sprintique от имени этого аккаунта. Права — аккаунта в проекте, не шире; текст задачи для него только данные.',wide:true,
      body:`${ui.toggle('Агент включён',p?p.enabled:true,'name="enabled"')}
        ${options.length?choose('connectionId','ИИ-подключение',first,options,'data-agent-connection'):'<p class="iq-helper">В пространстве нет ИИ-подключений.</p>'}
        <div data-agent-model>${modelField(p?.model||connectionOf(first)?.defaultModel||'',models(first))}</div>
        ${ui.textarea('Инструкции',p?.instructions||'',{name:'instructions',maxlength:8000,help:'Как работать: роль, стиль, что делать с задачей. Они не расширяют права аккаунта.',placeholder:'Например: разбери задачу, уточни критерии приёмки и предложи план в обсуждении.'})}
        <section class="sq-agent-part" aria-label="Когда начинать"><h3>Когда начинать</h3>${ui.check('Когда на аккаунт назначают задачу',p?p.onAssignment:true,'name="onAssignment"')}${ui.check(`Когда аккаунт упоминают в обсуждении: @${account.name}`,p?p.onMention!==false:true,'name="onMention"')}<p class="iq-helper">По кнопке «Запустить агента» в задаче — всегда, пока агент включён. Назначить, упомянуть или запустить агента может тот, кто меняет задачи. Изменения и сообщения самого агента других агентов не запускают.</p></section>
        <section class="sq-agent-part" aria-label="Ограничения"><h3>Ограничения</h3><div class="sq-agent-limits">${number('maxSteps','Шагов за запуск',p?.maxSteps??defaults.maxSteps,1,50)}${number('maxOutputTokens','Токенов ответа за шаг',p?.maxOutputTokens??defaults.maxOutputTokens,256,32000)}${number('runsPerHour','Запусков в час',p?.runsPerHour??defaults.runsPerHour,1,200)}${number('maxRunTokens','Токенов за запуск',p?.maxRunTokens??defaults.maxRunTokens,10000,5000000)}</div><p class="iq-helper">Токены за запуск считают и вопрос, и ответ каждого шага: на этом бюджете агент останавливается, сколько бы шагов ни осталось.</p></section>`,
      submitLabel:'Сохранить',success:'Настройки агента сохранены',
      mount:el=>{el.addEventListener('iq-create',event=>{if(!event.target.matches('iq-combobox[name=model]'))return;const model=event.detail.label.trim();if(!model||model.length>200)return;event.target.options=[...event.target.options,{value:model,label:model}];event.target.value=model;});el.addEventListener('iq-change',event=>{
        if(!event.target.closest('[data-agent-connection]'))return;const id=event.detail?.value??event.target.value,box=el.querySelector('[data-agent-model]');
        const typed=String(box.querySelector('[name=model]').value||'').trim();box.innerHTML=modelField(typed||connectionOf(id)?.defaultModel||'',models(id));enhance(box);
      });},
      onSubmit:async(values,form)=>{
        const connectionId=String(form.querySelector('iq-select[name=connectionId]')?.value||values.get('connectionId')||'')||null;
        const model=String(values.get('model')||'').trim(),enabled=values.get('enabled')!==null;
        if(!model)throw Error('Укажите модель.');if(enabled&&!connectionId)throw Error('Выберите ИИ-подключение.');
        const limit=(name,min,max)=>{const n=Number(values.get(name));if(!Number.isInteger(n)||n<min||n>max)throw Error(`Проверьте ограничения: от ${min} до ${max}.`);return n;};
        const body={baseRevision:p?.revision||0,enabled,connectionId,model,instructions:String(values.get('instructions')||''),onAssignment:values.get('onAssignment')!==null,onMention:values.get('onMention')!==null,
          maxSteps:limit('maxSteps',1,50),maxOutputTokens:limit('maxOutputTokens',256,32000),runsPerHour:limit('runsPerHour',1,200),maxRunTokens:limit('maxRunTokens',10000,5000000)};
        try{await client.request('/service-accounts/'+encodeURIComponent(account.id)+'/agent','PUT',body);}catch(error){throw Error(explain(error));}
      }}));
  }
}
