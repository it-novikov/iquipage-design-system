import {clone,requireValue} from './common.js';
import {NODE_TYPES,createNode,validateFlow,flowScene} from './workflow.js';
import {button,input,textarea,select,dialog,esc,icon,date,pretty,statusNames} from './ui.js';

export function installWorkflowUI(feature) {
  feature.openPanel=(name,title,body)=>{
    feature.panel=name;feature.inspector.hidden=false;
    feature.inspector.innerHTML=`<header class="map-panel-head"><div><small>${name==='runs'?'ИСПОЛНЕНИЕ':'СЦЕНАРИЙ ДЕЙСТВИЙ'}</small><h2>${esc(title)}</h2></div>${button('close-panel','Закрыть','x','ghost','aria-label="Закрыть боковую панель"')}</header><div class="map-panel-body">${body}</div>`;
  };
  feature.leaveWorkflowDraft=async()=>{
    const draft=feature.workflowDraft;if(!draft)return true;if(draft.saving)return false;
    if(!draft.form.isConnected){feature.workflowDraft=null;return true;}
    if(draft.dirty()){
      let discard=false;const question=feature.dialog({title:'Оставить изменения шага?',description:'Параметры ещё не сохранены. Можно вернуться к редактированию.',submitLabel:'Не сохранять',onSubmit:async()=>{discard=true;}});
      await new Promise(resolve=>question.addEventListener('iq-close',resolve,{once:true}));if(!discard)return false;
    }
    if(feature.workflowDraft===draft)feature.workflowDraft=null;return true;
  };
  feature.renderProperties=()=>{
    feature.workflowEditQueue=(feature.workflowEditQueue||Promise.resolve()).then(async()=>{
      const selected=feature.board.selection,previous=feature.workflowDraft?.selection;
      if(previous&&JSON.stringify(previous)===JSON.stringify(selected))return;
      if(!(await feature.leaveWorkflowDraft())){if(previous)feature.board.select(previous,false);return;}
      if(feature.alive&&feature.view==='workflow')renderProperties(feature);
    }).catch(error=>feature.message(error.message,true));return feature.workflowEditQueue;
  };
  feature.workflowActions={
    'close-panel':async()=>{if(await feature.leaveWorkflowDraft())feature.inspector.hidden=true;},
    properties:()=>feature.renderProperties(),
    'add-step':()=>addStep(feature),
    'connect-step':()=>connectStep(feature),
    validate:()=>validate(feature),
    run:()=>runDialog(feature),
    runs:()=>showRuns(feature),
    'run-details':control=>runDetails(feature,control.dataset.runId),
    'goto-step':control=>{feature.board.select([control.dataset.nodeId]);feature.board.fit([control.dataset.nodeId]);return feature.renderProperties();}
  };
}
function editable(feature){return feature.permissions.edit&&feature.current?.status!=='archived';}
async function saveFlow(feature,flow){
  if(!(await feature.readyToLeave({skipWorkflowDraft:true})))throw Error('Сначала сохраните изменения карты.');
  return feature.saveMetadata({...clone(feature.current),flow:{...flow,version:(feature.current.flow.version||0)+1}},{fromWorkflowEditor:true});
}
function renderProperties(feature) {
  const flow=feature.current?.flow;if(!flow)return;
  const selected=feature.board.selection,node=flow.nodes.find(n=>selected.includes(n.id)),edge=flow.edges.find(e=>selected.includes(e.id));
  if(edge){
    feature.openPanel('properties','Переход между шагами',`<form class="map-properties-form">${select('source','Откуда',edge.source,flow.nodes.map(n=>[n.id,n.title]))}${select('target','Куда',edge.target,flow.nodes.map(n=>[n.id,n.title]))}${select('when','Когда переходить',edge.when,[['always','Всегда'],['true','Условие выполнено — Да'],['false','Условие не выполнено — Нет']])}<p class="map-explanation">Подпись стрелки только объясняет связь. Путь запуска определяется этим правилом.</p><p role="alert" class="map-form-error" hidden></p><div class="map-form-actions"><button type="submit" class="iq-btn primary sm" ${editable(feature)?'':'disabled'}>Сохранить переход</button><button type="button" class="iq-btn danger sm" data-delete-edge ${editable(feature)?'':'disabled'}>Удалить связь</button></div></form>`);
    wireForm(feature,async values=>{const next=clone(feature.current.flow),item=next.edges.find(e=>e.id===edge.id);requireValue(item,'STALE','Связь уже удалена.');item.source=values.get('source');item.target=values.get('target');item.when=values.get('when');await saveFlow(feature,next);});
    feature.inspector.querySelector('[data-delete-edge]').addEventListener('click',async()=>{try{await saveFlow(feature,{...clone(feature.current.flow),edges:feature.current.flow.edges.filter(e=>e.id!==edge.id)});renderProperties(feature);}catch(e){feature.message(e.message,true);}});
    return;
  }
  if(!node){
    feature.openPanel('properties','Шаги сценария',`<p class="map-explanation">Выберите шаг на карте, чтобы настроить данные и действие. Заметки и обычные фигуры остаются пояснениями, а не выполняемыми шагами.</p><div class="map-node-list">${flow.nodes.map(n=>`<button type="button" class="map-node-list-item" data-map-action="goto-step" data-node-id="${n.id}"><span>${icon('workflow',18)}</span><span><b>${esc(n.title)}</b><small>${esc(NODE_TYPES[n.kind]?.label||n.kind)}</small></span>${icon('chevron',15)}</button>`).join('')}</div>${editable(feature)?`<div class="map-action-menu">${button('add-step','Добавить шаг','plus','secondary')}${button('connect-step','Соединить шаги','link','secondary')}</div>`:''}`);return;
  }
  const definition=NODE_TYPES[node.kind],conf=node.config||{};
  const settings=node.kind==='transform'?select('operation','Подготовка списка',conf.operation,[['unique','Убрать одинаковые строки'],['lines','Каждая строка — отдельное действие']]):node.kind==='condition'?select('rule','Проверка',conf.rule,[['has-items','В данных есть записи'],['contains','Данные содержат текст']])+input('value','Текст для поиска',conf.value||''):node.kind==='llm'?textarea('prompt','Инструкция модели',conf.prompt||'',6)+input('connectionRef','Идентификатор подключения',conf.connectionRef||'',{placeholder:'Подключение из настроек платформы'})+'<p class="map-explanation">Секреты сюда не вводятся. Подключение и API-ключ хранит сервер. Без подключения настоящий запуск остановится.</p>':node.kind==='approval'?'<p class="map-explanation">Сценарий остановится и сохранит ожидание. Человек проверит и при необходимости изменит список. Только после подтверждения работа продолжится.</p>':node.kind==='task'?'<p class="map-explanation">Записываются только подтверждённые действия. Запись выполняет адаптер задач, предоставленный приложением. Локальный адаптер не подключён к рабочей платформе.</p>':'<p class="map-explanation">Этот шаг не требует дополнительных параметров.</p>';
  feature.openPanel('properties',node.title,`<div class="map-node-type">${icon(node.kind==='llm'?'sparkles':'workflow',20)}<span>${esc(definition.label)}</span></div><p>${esc(definition.description)}</p><div class="map-port-pair"><span>Вход <b>${esc(definition.input)}</b></span><span>Выход <b>${esc(definition.output)}</b></span></div><form class="map-properties-form">${input('title','Название',node.title,{required:true})}${select('kind','Тип шага',node.kind,Object.entries(NODE_TYPES).map(([id,d])=>[id,d.label]))}${settings}<p role="alert" class="map-form-error" hidden></p><div class="map-form-actions"><button type="submit" class="iq-btn primary sm" ${editable(feature)?'':'disabled'}>Сохранить шаг</button>${button('connect-step','Соединить','link','secondary',editable(feature)?'':'disabled')}</div></form>`);
  wireForm(feature,async values=>{
    const next=clone(feature.current.flow),n=next.nodes.find(n=>n.id===node.id);requireValue(n,'STALE','Шаг уже удалён.');n.title=values.get('title').trim();const kind=values.get('kind');
    if(kind!==n.kind){n.kind=kind;n.config=createNode(kind).config;}else if(kind==='transform')n.config={operation:values.get('operation')};else if(kind==='condition')n.config={rule:values.get('rule'),value:values.get('value')};else if(kind==='llm')n.config={prompt:values.get('prompt'),connectionRef:values.get('connectionRef').trim()};
    await saveFlow(feature,next);feature.board.select([n.id]);renderProperties(feature);
  });
}
function wireForm(feature,action) {
  const form=feature.inspector.querySelector('form'),revision=feature.current.revision;
  let baseline=JSON.stringify([...new FormData(form)]);
  const draft={form,selection:[...feature.board.selection],saving:false,dirty:()=>JSON.stringify([...new FormData(form)])!==baseline};feature.workflowDraft=draft;
  form.addEventListener('submit',async event=>{event.preventDefault();const b=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');if(b.disabled||draft.saving)return;b.disabled=true;error.hidden=true;draft.saving=true;
    try{if(feature.current.revision!==revision)throw Error('Сценарий изменился. Ваш ввод сохранён в форме; обновите параметры перед применением.');await action(new FormData(form));baseline=JSON.stringify([...new FormData(form)]);feature.message('Параметры сохранены. Перед запуском проверьте сценарий.');}
    catch(e){if(form.isConnected){error.textContent=e.message;error.hidden=false;}}
    finally{draft.saving=false;if(form.isConnected)b.disabled=!editable(feature);}});
}

function addStep(feature) {
  requireValue(editable(feature),'READ_ONLY','Карта доступна только для просмотра.');
  feature.dialog({title:'Добавить исполняемый шаг',description:'Тип определяет вход, результат и то, что произойдёт при запуске.',body:`${select('kind','Действие','transform',Object.entries(NODE_TYPES).map(([id,d])=>[id,d.label]))}${input('title','Название','',{placeholder:'Можно оставить пустым'})}`,submitLabel:'Добавить шаг',onSubmit:async values=>{
    const nodes=feature.current.flow.nodes,kind=values.get('kind'),node=createNode(kind,values.get('title').trim()||NODE_TYPES[kind].label,Math.max(60,...nodes.map(n=>n.x+n.width))+100,160);
    await saveFlow(feature,{...clone(feature.current.flow),nodes:[...nodes,node]});feature.board.select([node.id]);feature.board.fit();renderProperties(feature);
  }});
}
function connectStep(feature) {
  requireValue(editable(feature),'READ_ONLY','Карта доступна только для просмотра.');const flow=feature.current.flow,selected=flow.nodes.find(n=>feature.board.selection.includes(n.id));
  feature.dialog({title:'Соединить шаги',description:'Точный способ создать переход без перетаскивания.',body:`${select('source','Откуда',selected?.id||flow.nodes[0]?.id,flow.nodes.map(n=>[n.id,n.title]))}${select('target','Куда',flow.nodes.find(n=>n.id!==selected?.id)?.id,flow.nodes.map(n=>[n.id,n.title]))}${select('when','Когда','always',[['always','Всегда'],['true','Да — условие выполнено'],['false','Нет — условие не выполнено']])}`,submitLabel:'Добавить переход',onSubmit:async values=>{
    requireValue(values.get('source')!==values.get('target'),'EDGE','Выберите разные шаги.');
    requireValue(!feature.current.flow.edges.some(e=>e.source===values.get('source')&&e.target===values.get('target')),'DUPLICATE_EDGE','Эта связь уже существует.');
    const edge={id:`link-${crypto.randomUUID()}`,source:values.get('source'),target:values.get('target'),when:values.get('when')};await saveFlow(feature,{...clone(feature.current.flow),edges:[...feature.current.flow.edges,edge]});feature.board.select([edge.id]);renderProperties(feature);
  }});
}
function validate(feature) {
  const issues=validateFlow(feature.current.flow);
  feature.openPanel('validation',issues.length?'Что нужно исправить':'Структура проверена',issues.length?`<p class="map-explanation">Запуск недоступен, пока эти ошибки не исправлены. Черновик сохранён.</p><div class="map-validation-list">${issues.map(i=>`<article><b>${esc(i.message)}</b>${i.nodeId?button('goto-step','Показать шаг','arrow','ghost',`data-node-id="${i.nodeId}"`):''}</article>`).join('')}</div>`:`<div class="map-validation-ok">${icon('checkCircle',28)}<p>Шаги связаны, входы и выходы совместимы, запись защищена подтверждением.</p></div><p class="map-explanation">Проверка структуры не выполняет внешние вызовы. Доступность подключений проверяется исполнителем во время запуска.</p>${button('run','Открыть тест и запуск','play','secondary')}`);
  return issues;
}
function runDialog(feature) {
  requireValue(feature.runtime&&feature.permissions.run,'RUNTIME','Исполнитель не подключён или запуск недоступен вашей роли.');
  requireValue(feature.current.status!=='archived','ARCHIVED','Из архива нельзя запускать действия. Создайте продолжение.');
  if(validate(feature).length)return;
  const notes=feature.current.document.objects.filter(o=>['sticky','task'].includes(o.type)).map(o=>o.text).join('\n');
  const storage=feature.repository.capabilities?.runtimeScope==='local-reference'?'локальном сервере':feature.repository.capabilities?.storage==='browser'?'этом браузере':'сервере приложения';
  feature.dialog({title:'Тест и запуск сценария',description:'Каждый запуск сохраняет собственную версию сценария. Дальнейшие правки карты её не меняют.',body:`${select('mode','Режим','test',[['test','Проверочный — без внешних действий'],['execute','Исполнить — записать подтверждённый результат']])}${textarea('notes','Входные заметки — одна на строку',notes,8)}<p class="map-explanation">В проверочном режиме ответы LLM обозначаются как проверочные, а задачи не создаются. При исполнении задачи сохранятся через адаптер на ${storage}. Настоящий LLM вызывается только через настроенное серверное подключение.</p>`,submitLabel:'Начать',onSubmit:async values=>{
    if(!(await feature.readyToLeave()))throw Error('Сначала сохраните карту.');
    const run=await feature.runtime.start({projectId:feature.project.id,mapId:feature.current.id,mapRevision:feature.current.revision,flow:feature.current.flow,input:{notes:values.get('notes').split('\n').filter(x=>x.trim())},mode:values.get('mode'),actorId:feature.context.actorId});
    await runDetails(feature,run.id);
  }});
}
async function showRuns(feature) {
  const runs=(await feature.repository.list('runs',feature.project.id)).filter(r=>r.mapId===feature.current.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  feature.openPanel('runs','История запусков',`<p class="map-explanation">Результаты относятся к конкретной версии сценария. Проверочные запуски не создают задачи.</p>${runs.length?`<div class="map-run-list">${runs.map(r=>`<button type="button" class="map-list-row" data-map-action="run-details" data-run-id="${r.id}"><span><b>${esc(statusNames[r.status]||r.status)}</b><small>${r.mode==='test'?'Проверочный':'Исполнение'} · ${date(r.createdAt)}</small><small>Версия карты ${r.mapRevision}</small></span>${icon('chevron',16)}</button>`).join('')}</div>`:'<p class="map-empty-copy">У этой карты ещё нет запусков.</p>'}`);
}
async function runDetails(feature,id) {
  const run=await feature.repository.read('runs',id,feature.project.id);requireValue(run,'NOT_FOUND','Запуск не найден.');
  const waiting=run.status==='awaiting_approval';
  const approval=waiting?`<form class="map-approval-form">${textarea('actions','Проверьте действия — по одному на строке',(run.data.actions||[]).map(a=>a.title).join('\n'),6)}<p class="map-explanation">${run.mode==='test'?'Это проверка: задачи не будут созданы.':'После подтверждения исполнитель сможет записать эти действия.'}</p><p role="alert" class="map-form-error" hidden></p><div class="map-form-actions"><button type="submit" class="iq-btn primary sm" ${feature.permissions.approve?'':'disabled'}>Подтвердить и продолжить</button><button type="button" class="iq-btn danger sm" data-reject ${feature.permissions.approve?'':'disabled'}>Отклонить</button></div></form>`:'';
  feature.openPanel('runs',statusNames[run.status]||run.status,`<div class="map-run-meta"><span class="iq-badge ${run.mode==='test'?'outline':''}">${run.mode==='test'?'Проверочный запуск':'Исполнение'}</span><span>Версия карты ${run.mapRevision}</span></div><p class="map-explanation">${date(run.createdAt)}</p>${run.error?`<p class="map-form-error" role="alert">${esc(run.error.message)}</p>`:''}${approval}<ol class="map-run-steps">${run.steps.map(step=>`<li><details><summary><span class="map-step-indicator" data-status="${step.status}">${step.status==='succeeded'?icon('check',14):icon('clock',14)}</span><span><b>${esc(step.title)}</b><small>${esc(statusNames[step.status]||step.status)}${step.simulated?' · Проверочные данные':''}</small></span></summary><div><h4>Вход</h4>${pretty(step.input)}${step.output?`<h4>Результат</h4>${pretty(step.output)}`:''}${step.error?`<p class="map-form-error">${esc(step.error.message)}</p>`:''}${step.usage?`<h4>Использование модели</h4>${pretty(step.usage)}`:''}<p class="map-explanation">Попытка ${step.attempt} · ${step.finishedAt?Math.max(0,Date.parse(step.finishedAt)-Date.parse(step.startedAt))+' мс':'Ожидание'}</p></div></details></li>`).join('')}</ol>${run.result?`<h3>Итог</h3>${pretty(run.result)}${run.result.taskIds?.length?button('open-created-tasks','Открыть созданные задачи','checklist','secondary'):''}`:''}<p class="map-explanation">Остановка не отменяет уже выполненные действия. Перед новым запуском проверьте созданные задачи.</p><div class="map-form-actions"><button type="button" class="iq-btn secondary sm" data-refresh-run>Обновить</button>${['blocked','failed','interrupted'].includes(run.status)&&feature.permissions.run?'<button type="button" class="iq-btn secondary sm" data-retry>Повторить шаг</button>':''}${!['succeeded','cancelled','rejected'].includes(run.status)&&feature.permissions.run?'<button type="button" class="iq-btn ghost sm" data-cancel>Остановить запуск</button>':''}</div>`);
  const body=feature.inspector.querySelector('.map-panel-body');
  const perform=async fn=>{try{body.querySelectorAll('button').forEach(b=>b.disabled=true);await fn();await runDetails(feature,id);}catch(e){feature.message(e.message,true);body.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  body.querySelector('[data-refresh-run]').addEventListener('click',()=>runDetails(feature,id).catch(e=>feature.message(e.message,true)));
  body.querySelector('[data-retry]')?.addEventListener('click',()=>perform(()=>feature.runtime.retry(id,feature.project.id)));
  body.querySelector('[data-cancel]')?.addEventListener('click',()=>perform(()=>feature.runtime.cancel(id,feature.project.id)));
  body.querySelector('[data-map-action=open-created-tasks]')?.addEventListener('click',()=>feature.config.onOpenTasks?.({ids:run.result.taskIds,projectId:feature.project.id}));
  body.querySelector('[data-reject]')?.addEventListener('click',()=>perform(()=>feature.runtime.approve(id,feature.project.id,{accepted:false,actions:[],actorId:feature.context.actorId,baseRevision:run.revision})));
  body.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();if(!feature.permissions.approve)return;const form=event.target;const actions=new FormData(form).get('actions').split('\n').map(s=>s.trim()).filter(Boolean).map(title=>({title}));perform(()=>feature.runtime.approve(id,feature.project.id,{accepted:true,actions,actorId:feature.context.actorId,baseRevision:run.revision}));});
}
