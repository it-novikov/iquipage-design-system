import {captureDialog} from './capture-ui.js';
import {showCanvasInspector,leaveCanvasInspector} from './canvas-inspector.js';
import {motionReduced} from '../dist/vendor/core.js';
import {registerWhiteboard,validateWhiteboard} from '../dist/vendor/whiteboard.js';
import {createMap,transitionMap,forkMap,templateFromMap,remapDocument,insertDocument,clone,uid,now,requireValue,validateMap,extractSelection} from './model.js';
import {BUILTIN_TEMPLATES,filterTemplates} from './templates.js';
import {createMeetingFlow,flowScene,flowFromScene,validateFlow} from './workflow.js';
import {button,input,textarea,select,check,dialog as baseDialog,download,esc,icon,date,statusNames,previewDocument} from './ui.js';
import {agentContext,proposalDocument} from './agent.js';
import {installWorkflowUI} from './workflow-ui.js';
import {installAutomationUI} from './automation-ui.js';
import {CREATABLE_BOARD_OBJECT_TYPES,normalizeUiCapabilities,assertDocumentTypesAllowed} from './capabilities.js';

/** Reusable feature. Navigation, identity, data and external actions belong to the host. */
export async function mountMaps(root,config) {
  const controller=new MapsFeature(root,config);await controller.mount();return controller;
}
export class MapsFeature {
  constructor(root,config) {
    requireValue(root instanceof HTMLElement,'ROOT','Нужен контейнер карты.');
    requireValue(config?.project?.id&&config.repository,'CONFIG','Нужны проект и адаптер хранения.');
    this.root=root;this.config=config;this.repository=config.repository;this.project=config.project;this.runtime=config.runtime;
    this.permissions={read:false,edit:false,run:false,approve:false,manageAutomation:false,...config.permissions};
    this.uiCapabilities=normalizeUiCapabilities(config.uiCapabilities);
    this.context={workspaceId:'local-workspace',actorId:'local-user',...config.context};
    this.dialogs=new Set();this.dialog=options=>{const el=baseDialog(options);this.dialogs.add(el);el.addEventListener('iq-close',()=>this.dialogs.delete(el),{once:true});return el;};
    this.view='canvas';this.maps=[];this.positions=new Map();this.abort=new AbortController();this.pending=new Map();this.savingPromise=null;this.alive=true;
    installWorkflowUI(this);installAutomationUI(this);
  }
  async mount() {
    registerWhiteboard();this.root.innerHTML=`<section class="iq-maps" aria-label="Карты проекта"><header class="map-toolbar"></header><div class="map-subbar"></div><div class="map-notice" role="status" hidden></div><div class="map-content"><div class="map-surface"></div><aside class="map-inspector" aria-label="Свойства и результаты" hidden></aside></div><span class="sr-only" role="status" data-map-live></span></section>`;
    this.toolbar=this.root.querySelector('.map-toolbar');this.subbar=this.root.querySelector('.map-subbar');this.surface=this.root.querySelector('.map-surface');this.inspector=this.root.querySelector('.map-inspector');
    this.root.addEventListener('click',event=>{
      const control=event.target.closest('[data-map-action]');if(!control||control.disabled)return;
      event.preventDefault();this.handle(control.dataset.mapAction,control).catch(e=>this.message(e.message,true));
    },{signal:this.abort.signal});
    window.addEventListener('beforeunload',event=>{if(this.board?.dirty||this.savingPromise||this.canvasInspector?.dirty()){event.preventDefault();event.returnValue='';}},{signal:this.abort.signal});
    this.unsubscribe=this.repository.subscribe?.(event=>{
      if(event.collection==='maps'&&event.id===this.current?.id&&event.revision>this.current.revision)
        setTimeout(()=>this.externalUpdate(event).catch(e=>this.message(e.message,true)),0);
    });
    this.timer=setInterval(()=>this.updateTimer(),1000);
    if(!this.permissions.read){this.surface.innerHTML='<div class="map-empty"><h2>Карта недоступна</h2><p>У вашей роли нет разрешения на просмотр.</p></div>';this.renderChrome();return;}
    await this.reloadList();
    const initial=this.maps.find(m=>m.id===this.config.mapId)||this.maps.find(m=>m.status!=='archived');
    if(initial)await this.openMap(initial.id);else this.empty();
  }
  async reloadList(){this.maps=(await this.repository.list('maps',this.project.id)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  empty(){this.current=null;this.surface.innerHTML=`<div class="map-empty"><span class="map-empty-symbol">${icon('board',32)}</span><h2>Место для идей и решений</h2><p>${this.uiCapabilities.sessions?'Создайте постоянную карту для схем или сессию для совместного обсуждения.':'Создайте карту и начните с одной мысли.'}</p><div class="row">${this.uiCapabilities.templates?button('templates','Выбрать основу','grid','primary'):''}${button('new','Чистая карта','plus',this.uiCapabilities.templates?'secondary':'primary')}</div></div>`;this.renderChrome();}
  async readyToLeave() {
    if(!(await leaveCanvasInspector(this)))return false;
    if(!this.board)return true;this.board.flush();if(this.savingPromise)await this.savingPromise;
    if(this.board.dirty){this.message('Сначала сохраните изменение или экспортируйте свою копию. Исходная карта не закрыта.',true);return false;}
    return true;
  }
  async openMap(id) {
    requireValue(this.permissions.read,'READ_ONLY','Просмотр карт недоступен.');
    if(!(await this.readyToLeave()))return false;
    const map=await this.repository.read('maps',id,this.project.id);requireValue(map,'NOT_FOUND','Карта не найдена в этом проекте.');
    if(this.current&&this.board)this.positions.set(`${this.current.id}:${this.view}`,this.board.viewport);
    this.current=map;this.view='canvas';this.inspector.hidden=true;this.buildBoard();this.renderChrome();this.message('');
    this.config.onOpenMap?.({id:map.id,projectId:map.projectId});return true;
  }
  buildBoard() {
    if(this.board){this.board.cancelPending();this.board.remove();}
    const board=document.createElement('iq-whiteboard');board.surfaceMode='embedded';board.controlled=true;board.allowedCreateTypes=this.view==='canvas'?this.uiCapabilities.allowedCreateTypes:CREATABLE_BOARD_OBJECT_TYPES;
    if(this.view==='canvas')board.editorMode='host';
    board.data=this.view==='workflow'?flowScene(this.current.flow,this.current.title,this.current.revision):this.current.document;
    board.readOnly=!this.permissions.edit||this.current.status==='archived';board.saveStatus=this.storageLabel;
    this.surface.replaceChildren(board);this.board=board;
    board.addEventListener('iq-change-request',event=>{
      this.savingPromise=this.saveBoard(event.detail).finally(()=>{this.savingPromise=null;this.renderChrome();});
    });
    board.addEventListener('iq-change-cancel',event=>this.pending.get(event.detail.requestId)?.abort());
    board.addEventListener('iq-host-command',event=>this.handle(event.detail.command==='guide'?'help':event.detail.command).catch(e=>this.message(e.message,true)));
    board.addEventListener('iq-open-task',event=>{const target={ids:[event.detail.taskId],projectId:this.project.id,focusTaskId:event.detail.taskId};this.root.dispatchEvent(new CustomEvent('iq-open-tasks',{detail:target,bubbles:true,composed:true}));Promise.resolve().then(()=>this.config.onOpenTasks?.(target)).catch(error=>this.message(error.message,true));});
    board.addEventListener('iq-selection',()=>{if(this.view==='workflow'&&!this.inspector.hidden&&this.panel==='properties')this.renderProperties();if(this.view==='canvas'){this.inspectorQueue=(this.inspectorQueue||Promise.resolve()).then(()=>showCanvasInspector(this,board.selection)).catch(error=>this.message(error.message,true));}});
    board.addEventListener('iq-edit-object',event=>{if(this.view!=='canvas')return;board.select([event.detail.id],false);this.inspectorQueue=(this.inspectorQueue||Promise.resolve()).then(()=>showCanvasInspector(this,[event.detail.id],{focusText:true})).catch(error=>this.message(error.message,true));});
    board.addEventListener('iq-change',()=>this.renderChrome());
    const position=this.positions.get(`${this.current.id}:${this.view}`);
    requestAnimationFrame(()=>{if(board!==this.board||!board.isConnected)return;if(position)board.viewport=position;else board.fit();});
  }
  get storageLabel(){return this.config.storageLabel||this.repository.capabilities?.storageLabel||(this.repository.capabilities?.runtimeScope==='local-reference'&&this.repository.capabilities?.storage==='server'?'Сохранено на локальном сервере':this.repository.capabilities?.storage==='server'?'Изменения сохранены':this.repository.capabilities?.storage==='browser'?'Сохранено в этом браузере':'Только в памяти');}
  async saveBoard(request) {
    const board=this.board,mapId=this.current.id,controller=new AbortController();this.pending.set(request.requestId,controller);this.renderChrome('Сохраняем…');
    try{
      requireValue(this.permissions.edit&&this.current.status!=='archived','READ_ONLY','Карта доступна только для просмотра.');
      const next=clone(this.current);
      if(this.view==='workflow')next.flow=flowFromScene(next.flow,request.value);else{next.document=request.value;next.title=request.value.title;}
      const saved=await this.repository.write('maps',next,request.baseRevision,{signal:controller.signal});
      if(!this.alive||this.current.id!==mapId)return;
      this.current=saved;
      const accepted=request.accept(this.view==='workflow'?flowScene(saved.flow,saved.title,saved.revision):saved.document);
      board.saveStatus=this.storageLabel;
      if(!accepted){board.data=this.view==='workflow'?flowScene(saved.flow,saved.title,saved.revision):saved.document;this.message('Запись уже завершилась. Загружена подтверждённая версия.');}
    }catch(error){request.reject(error.message);this.message(error.message,true);}
    finally{this.pending.delete(request.requestId);}
  }
  async externalUpdate(event) {
    if(this.savingPromise)await this.savingPromise;
    if(!this.current||this.current.id!==event.id||event.revision<=this.current.revision)return;
    const next=await this.repository.read('maps',event.id,this.project.id);if(!next||next.revision<=this.current.revision)return;
    this.current=next;this.board.data=this.view==='workflow'&&next.flow?flowScene(next.flow,next.title,next.revision):next.document;
    this.board.readOnly=!this.permissions.edit||next.status==='archived';this.renderChrome();this.message('Получена новая версия из другой вкладки.');
  }
  async saveMetadata(next) {
    requireValue(this.permissions.edit&&this.current.status!=='archived','READ_ONLY','Карта доступна только для просмотра.');
    if(!(await this.readyToLeave()))throw Error('Есть несохранённое изменение.');
    requireValue(next.revision===this.current.revision,'CONFLICT','Карта изменилась. Повторите действие.');
    const saved=await this.repository.write('maps',next,this.current.revision);this.current=saved;
    this.board.data=this.view==='workflow'?flowScene(saved.flow,saved.title,saved.revision):saved.document;
    this.board.readOnly=!this.permissions.edit||saved.status==='archived';this.renderChrome();return saved;
  }
  renderChrome(override='') {
    const active=document.activeElement,focusAction=this.toolbar.contains(active)||this.subbar.contains(active)?active?.dataset.mapAction:null;
    const m=this.current,disabled=!this.permissions.edit||m?.status==='archived';
    const title=m?.title||'Карты проекта';
    const save=override||(this.board?.saving?'Сохраняем…':this.board?.dirty?'Есть несохранённые изменения':m?this.storageLabel:'Выберите или создайте карту');
    const heading=this.uiCapabilities.mapSwitcher?`<button type="button" class="map-switch" data-map-action="maps" aria-label="Выбрать карту: ${esc(title)}" title="${esc(title)}"><span>${esc(title)}</span>${icon('down',16)}</button>`:`<span class="map-switch map-switch-static"><span>${esc(title)}</span></span>`;
    const canAdd=this.view==='workflow';
    this.toolbar.innerHTML=`<div class="map-heading"><div class="map-title-wrap"><h1>${heading}</h1><span class="map-save-label" role="status">${m?`${m.kind==='session'?'Сессия':'Постоянная карта'} · `:''}${esc(save)}</span></div></div>${m&&this.uiCapabilities.workflow?`<div class="iq-segmented map-view-tabs" aria-label="Рабочая поверхность"><button type="button" data-map-action="canvas" aria-pressed="${this.view==='canvas'}">${icon('board',16)}<span>Карта</span></button><button type="button" data-map-action="workflow" aria-pressed="${this.view==='workflow'}">${icon('link',16)}<span>Сценарий действий</span></button></div>`:''}<div class="map-toolbar-actions">${this.uiCapabilities.templates?button('templates','Шаблоны','grid'):''}${m&&!disabled&&canAdd?button(this.view==='workflow'?'add-step':'add',this.view==='workflow'?'Добавить шаг':'Добавить объекты','plus','primary'):!m&&this.permissions.edit?button('new','Создать карту','plus','primary'):''}<button type="button" class="iq-btn ghost icon sm" data-map-action="more" aria-label="Меню карты">${icon('more',18)}</button></div>`;
    const session=this.uiCapabilities.sessions&&m?.kind==='session'&&m.status!=='archived';
    this.subbar.hidden=!m||(this.view==='canvas'&&m.status!=='archived');
    this.renderSessionCard();
    if(!m)return;
    const state=statusNames[m.status]||m.status;
    this.subbar.innerHTML=`<div class="map-view-group"><span class="map-state">${esc(state)}</span>${session?'<button type="button" class="map-timer-label" data-map-action="session" aria-label="Этап и таймер сессии"></button>':''}</div><div class="map-context-actions">${this.view==='workflow'?button('properties','Свойства','sliders')+button('validate','Проверить','check')+button('runs','Запуски','clock')+(this.uiCapabilities.automation?button('automations','Автоматизация','bolt'):'')+(this.permissions.run&&m.status!=='archived'?button('run','Тест и запуск','play','secondary'):''):''}${session&&!disabled?button(m.status==='draft'?'start':m.status==='paused'?'resume':'finish',m.status==='draft'?'Начать сессию':m.status==='paused'?'Продолжить':'Завершить сессию',m.status==='active'?'check':'play','secondary'):''}${m.status==='archived'&&this.uiCapabilities.mapSwitcher?button('continue','Создать продолжение','plus','secondary'):''}</div>`;
    this.updateTimer();
    if(focusAction&&!document.querySelector('dialog[open]'))this.root.querySelector(`[data-map-action="${focusAction}"]`)?.focus({preventScroll:true});
  }
  message(text,error=false) {
    const notice=this.root.querySelector('.map-notice');notice.hidden=!text;notice.classList.toggle('is-error',error);
    notice.innerHTML=text?`<span>${esc(text)}</span>${error&&this.current?button('export-draft','Сохранить копию','download'):''}${button('dismiss','Закрыть','x')}`:'';
  }
  renderSessionCard(){
    let card=this.root.querySelector('[data-session-card]');if(!card){card=document.createElement('aside');card.dataset.sessionCard='';card.className='map-session-card';card.setAttribute('aria-label','Сессия');this.root.querySelector('.map-content').append(card);}
    const m=this.current,visible=this.uiCapabilities.sessions&&m?.kind==='session'&&this.view==='canvas'&&m.status!=='archived';card.hidden=!visible;if(!visible)return;
    const changed=card.dataset.expanded!==String(!!this.sessionOpen),leaving=changed&&!this.sessionOpen&&!motionReduced()?card.querySelector('.map-session-content')?.cloneNode(true):null;card.dataset.expanded=String(!!this.sessionOpen);
    card.innerHTML=`<button type="button" class="iq-btn secondary sm map-session-toggle" data-map-action="toggle-session" aria-expanded="${!!this.sessionOpen}">${icon('users',16)}<span class="map-session-summary">Сессия</span>${icon(this.sessionOpen?'down':'chevron',14)}</button>${this.sessionOpen?`<div class="map-session-content"><div class="row between"><b>${statusNames[m.status]}</b><button type="button" class="iq-btn ghost icon sm" data-map-action="toggle-session" aria-label="Скрыть сессию">${icon('x',16)}</button></div><p class="map-session-timer"></p><button type="button" class="iq-btn secondary sm" data-map-action="session">Этап, таймер и голоса</button>${this.permissions.edit?button(m.status==='draft'?'start':m.status==='paused'?'resume':'finish',m.status==='draft'?'Начать сессию':m.status==='paused'?'Продолжить':'Завершить сессию',m.status==='active'?'check':'play','primary'):''}${m.status==='active'&&this.permissions.edit?button('pause','Пауза','pause'):''}<small class="iq-helper">Таймер и голоса сохраняются в этом макете.</small></div>`:''}`;
    if(leaving){leaving.inert=true;leaving.setAttribute('aria-hidden','true');Object.assign(leaving.style,{position:'absolute',right:'0',top:'36px',pointerEvents:'none'});card.append(leaving);leaving.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-8px)'}],{duration:180,easing:'ease-out'}).finished.catch(()=>{}).finally(()=>leaving.remove());}
    else if(changed&&!motionReduced())card.animate([{opacity:.35,transform:'translateY(-8px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});this.updateTimer();
  }
  async handle(action,control) {
    if(action==='toggle-session'){if(!(await leaveCanvasInspector(this)))return;this.sessionOpen=!this.sessionOpen;this.renderSessionCard();return;}
    requireValue(this.permissions.read||action==='help','READ_ONLY','Просмотр карт недоступен.');
    if(['maps','archive','continue'].includes(action))requireValue(this.uiCapabilities.mapSwitcher,'FEATURE_DISABLED','Выбор нескольких карт отключён приложением.');
    if(['templates','save-template','template-new','template-insert'].includes(action))requireValue(this.uiCapabilities.templates,'FEATURE_DISABLED','Шаблоны отключены приложением.');
    if(action==='workflow')requireValue(this.uiCapabilities.workflow,'FEATURE_DISABLED','Сценарии действий отключены приложением.');
    if(['session','start','resume','pause'].includes(action)||(action==='finish'&&this.current?.kind==='session'))requireValue(this.uiCapabilities.sessions,'FEATURE_DISABLED','Сессии отключены приложением.');
    if(action==='automations')requireValue(this.uiCapabilities.automation,'FEATURE_DISABLED','Автоматизация отключена приложением.');
    if(action==='agent')requireValue(this.uiCapabilities.agentProposals,'FEATURE_DISABLED','Предложения агента отключены приложением.');
    if(['add','bulk'].includes(action))requireValue(this.uiCapabilities.allowedCreateTypes.length>0,'CREATE_TYPE_DISABLED','Приложение не разрешило создание объектов.');
    const actions={maps:()=>this.mapBrowser(false),archive:()=>this.mapBrowser(true),templates:()=>this.templateBrowser(),new:()=>this.newMapDialog(),help:()=>this.help(),add:()=>captureDialog(this),bulk:()=>captureDialog(this),find:()=>this.board.command('search'),more:()=>this.more(),rename:()=>this.rename(),dismiss:()=>this.message(''),canvas:()=>this.switchView('canvas'),workflow:()=>this.switchView('workflow'),session:()=>this.sessionDialog(),finish:()=>this.finishDialog(),start:()=>this.changeSession('start'),resume:()=>this.changeSession('resume'),pause:()=>this.changeSession('pause'),continue:()=>this.continueMap(),export:()=>this.exportMap(false),'export-draft':()=>this.exportMap(true),'save-template':()=>this.saveTemplateDialog(),agent:()=>this.agentDialog(),import:()=>this.importMap(),fullscreen:()=>this.message('Карта уже занимает доступную область. Навигация платформы остаётся доступной.')};
    if(actions[action])return actions[action]();
    if(this.workflowActions?.[action])return this.workflowActions[action](control);
    if(this.automationActions?.[action])return this.automationActions[action](control);
  }
  async switchView(view) {
    if(view==='workflow')requireValue(this.uiCapabilities.workflow,'FEATURE_DISABLED','Сценарии действий отключены приложением.');
    if(!this.current||view===this.view)return;if(!(await this.readyToLeave()))return;
    if(view==='workflow'&&!this.current.flow){
      requireValue(this.permissions.edit&&this.current.status!=='archived','READ_ONLY','В архиве нельзя добавить сценарий. Создайте продолжение.');
      return this.dialog({title:'Добавить сценарий действий?',description:'Карта и сценарий остаются связанными, но независимыми. Заметки не превращаются в автоматизацию сами по себе.',body:`<ol class="map-flow-intro">${[['Собрать заметки','Взять выбранные мысли из карты.'],['Подготовить список','Собрать конкретные следующие действия.'],['Проверить и подтвердить','Отредактировать результат перед записью.'],['Создать задачи','Передать подтверждённый список в доску задач.'],['Сохранить результат','Вернуть ссылки и итог выполнения на карту.']].map(([title,text],i)=>`<li><span class="map-step-number">${i+1}</span><div><b>${title}</b><p>${text}</p></div></li>`).join('')}</ol><p class="map-flow-safety">${icon('lock',17)}<span>Сейчас создаётся только структура. Внешние сервисы не вызываются, задачи не создаются.</span></p>`,submitLabel:'Добавить сценарий',onSubmit:async()=>{await this.saveMetadata({...clone(this.current),flow:createMeetingFlow()});await this.switchView('workflow');}});
    }
    this.positions.set(`${this.current.id}:${this.view}`,this.board.viewport);this.view=view;this.inspector.hidden=true;this.buildBoard();this.renderChrome();
  }
  async newMapDialog(template=null) {
    if(!(await this.readyToLeave()))return;requireValue(this.permissions.edit,'READ_ONLY','Нет права создавать карты.');
    if(template)assertDocumentTypesAllowed(template.document,this.uiCapabilities,'Шаблон содержит типы объектов, отключённые приложением.');
    this.dialog({title:template?'Создать карту из шаблона':'Новая карта',body:`${input('title','Название',template?.title||'Новая карта',{required:true})}${this.uiCapabilities.sessions?select('kind','Как будем работать',template?.kind||'permanent',[['permanent','Постоянная — схемы и долгосрочная работа'],['session','Сессия — обсуждение с завершением']]):''}${template?`<p class="map-explanation">${esc(template.description||'')} Новая карта не меняет шаблон и другие карты.</p>`:''}`,submitLabel:'Создать карту',onSubmit:async values=>{
      const title=values.get('title').trim();const kind=this.uiCapabilities.sessions?values.get('kind'):'permanent';const map=createMap({projectId:this.project.id,title,kind,...(template?{document:remapDocument(template.document,{clearPersonal:true}),templateOrigin:{id:template.id,version:template.version},flow:this.uiCapabilities.workflow&&template.flowPreset?createMeetingFlow():null}:{})});
      const saved=await this.repository.write('maps',map,0);await this.reloadList();await this.openMap(saved.id);
    }});
  }
  help() {
    const shortcuts=[['Пробел + перетаскивание','Переместить карту'],['Shift + щелчок','Выбрать несколько объектов'],['Enter','Редактировать выбранный объект'],['Ctrl / ⌘ + Enter','Завершить редактирование'],['Escape','Отменить ввод или текущий инструмент'],['Ctrl / ⌘ + Z','Отменить изменение'],['Стрелки / Shift + стрелки','Сдвинуть объект на 1 / 10 пикселей'],['0','Показать всю карту']];
    return this.dialog({title:'Как работать с картами',description:'Начните с мысли. Структура и автоматизация подключаются, когда они нужны.',wide:true,body:`<div class="map-help-grid"><article><b>1. Добавьте объекты</b><p>Откройте «Добавить объекты». Для каждой карточки выберите заметку, задачу, текст, фигуру, область или изображение.</p></article><article><b>2. Соберите структуру</b><p>Объедините объекты в области и добавьте связи. Инструменты находятся внизу карты.</p></article><article><b>3. Договоритесь о действии</b><p>Превратите идею в задачу или откройте сценарий. Проверьте результат перед его выполнением.</p></article></div><div class="map-help-types"><p><b>Постоянная карта</b> — схемы, зависимости и решения. Она развивается вместе с проектом.</p><p><b>Сессия</b> — обсуждение с началом и завершением. Итоги остаются в архиве, продолжение создаётся отдельно.</p></div><details class="iq-accordion map-help-shortcuts"><summary>Клавиатура и перемещение ${icon('plus',16)}</summary><div><dl class="map-shortcuts">${shortcuts.map(([key,action])=>`<div><dt><kbd>${key}</kbd></dt><dd>${action}</dd></div>`).join('')}</dl><p class="map-explanation">Поиск и точный ввод положения позволяют работать без перетаскивания.</p></div></details><p class="map-explanation map-help-navigation">Навигация проекта находится над картой. Задачи, материалы и настройки не являются частью модуля и предоставляются платформой.</p>`});
  }
  async mapBrowser(archived=false) {
    await this.reloadList();const all=this.maps;
    const el=this.dialog({title:archived?'Архив карт':'Карты проекта',description:archived?'Итоги сохраняются неизменными. Любую карту можно открыть или продолжить новой копией.':'Постоянные карты и отдельные сессии одного проекта.',wide:true,body:`${input('query','Найти карту','',{placeholder:'Название или итог'})}<div class="map-library-results"></div>${!archived&&this.permissions.edit?button('new','Новая карта','plus','secondary'):''}`,mount:(el)=>{
      const draw=()=>{const q=el.querySelector('[name=query]').value.toLocaleLowerCase('ru');const rows=all.filter(m=>(m.status==='archived')===archived&&[m.title,m.summary].join(' ').toLocaleLowerCase('ru').includes(q));
        el.querySelector('.map-library-results').innerHTML=rows.length?rows.map(m=>`<button type="button" class="map-list-row" data-open-map="${m.id}"><span class="map-list-icon">${icon(m.kind==='session'?'clock':'map',20)}</span><span><b>${esc(m.title)}</b><small>${m.kind==='session'?'Сессия':'Постоянная карта'} · ${esc(statusNames[m.status])} · ${date(m.updatedAt)}</small>${m.summary?`<p>${esc(m.summary.slice(0,180))}</p>`:''}</span>${icon('chevron',17)}</button>`).join(''):'<p class="map-empty-copy">Пока нет подходящих карт.</p>';};
      el.querySelector('[name=query]').addEventListener('input',draw);draw();
      el.addEventListener('click',async e=>{const row=e.target.closest('[data-open-map]');if(row){el.close(true);await this.openMap(row.dataset.openMap);}if(e.target.closest('[data-map-action=new]')){el.close(true);this.newMapDialog();}});
    }});return el;
  }
  async templateBrowser() {
    const custom=await this.repository.list('templates',this.project.id),templates=[...BUILTIN_TEMPLATES,...custom].filter(template=>template.document.objects.every(object=>this.uiCapabilities.allowedCreateTypes.includes(object.type)));
    let category='Все',query='';const categories=['Все',...new Set(templates.map(t=>t.category))];
    return this.dialog({title:'С чего начнём?',description:'Выберите задачу, которую хотите решить. Все шаблоны можно изменить под себя.',wide:true,body:`${input('query','Поиск шаблонов','',{placeholder:'Например: итоги, архитектура, идеи'})}<div class="map-template-categories">${categories.map(c=>`<button type="button" data-category="${esc(c)}" aria-pressed="${c==='Все'}">${esc(c)}</button>`).join('')}</div><div class="map-template-grid"></div>`,mount:el=>{
      const draw=()=>{const found=filterTemplates(templates,{category,query});el.querySelector('.map-template-grid').innerHTML=found.length?found.map(t=>`<button type="button" class="map-template-card" data-template="${t.id}">${previewDocument(t.document)}<span class="map-template-copy"><small>${esc(t.category)}${t.scope!=='built-in'?' · Свой шаблон':''}</small><b>${esc(t.title)}</b><span>${esc(t.description||'Сохранённая структура карты.')}</span><span class="map-template-when"><strong>Когда:</strong> ${esc(t.when||'Когда нужна похожая структура.')}</span></span></button>`).join(''):'<p class="map-empty-copy">Ничего не найдено. Попробуйте другое название.</p>';};draw();
      el.querySelector('[name=query]').addEventListener('input',e=>{query=e.target.value;draw();});
      el.addEventListener('click',e=>{const cat=e.target.closest('[data-category]');if(cat){category=cat.dataset.category;el.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===cat)));draw();}
        const card=e.target.closest('[data-template]');if(card){const t=templates.find(x=>x.id===card.dataset.template);el.close(true);this.templateDetails(t);}});
    }});
  }
  templateDetails(template) {
    assertDocumentTypesAllowed(template.document,this.uiCapabilities,'Шаблон содержит типы объектов, отключённые приложением.');
    const allowed=this.current&&this.current.status!=='archived'&&this.permissions.edit&&this.view==='canvas';
    return this.dialog({title:template.title,description:template.description||'Ваша сохранённая структура.',wide:true,body:`<div class="map-template-detail">${previewDocument(template.document)}<div><h3>Когда использовать</h3><p>${esc(template.when||'Когда нужна похожая структура работы.')}</p><h3>Что внутри</h3><p>${template.document.objects.filter(o=>o.type==='frame').length} областей, ${template.document.objects.filter(o=>o.type!=='frame').length} объектов. ${template.kind==='session'?'Подходит для сессии с итогами.':'Подходит для постоянной карты.'}</p><p class="map-explanation">Применение создаёт независимую копию. Ваши другие карты не изменятся.</p></div></div><div class="row">${button('template-new','Создать новую карту','plus','primary',!this.permissions.edit?'disabled':'')}${allowed?button('template-insert','Добавить к открытой карте','grid','secondary'):''}${template.scope!=='built-in'?button('template-export','Экспортировать шаблон','download'):''}</div>`,mount:el=>el.addEventListener('click',async e=>{
      const action=e.target.closest('[data-map-action]')?.dataset.mapAction;
      if(action==='template-new'){el.close(true);this.newMapDialog(template);}
      if(action==='template-export')download('map-template.json',template);
      if(action==='template-insert'){try{if(!(await this.readyToLeave()))return;const doc=insertDocument(this.current.document,template.document,{offsetX:Math.max(0,...this.current.document.objects.map(o=>o.x+o.width))+80,offsetY:0});this.board.applyDocument(doc,this.current.revision,'template-insert');if(this.savingPromise)await this.savingPromise;el.close(true);this.board.fit();}catch(error){this.message(error.message,true);}}
    })});
  }
  saveTemplateDialog() {
    requireValue(this.permissions.edit,'READ_ONLY','Создание шаблонов недоступно.');
    const ids=this.view==='canvas'?this.board.selection:[];
    return this.dialog({title:'Сохранить свой шаблон',description:'Сохраняется структура, а не голоса, запуски или подключения. Назовите её по задаче пользователя.',body:`${input('title','Название шаблона','',{required:true,placeholder:'Например: подготовить встречу с клиентом'})}${textarea('description','Для чего он нужен','',2)}${textarea('when','Когда использовать','',2)}${select('scope','Кому доступен','project',[['personal','Только мне'],['project','В этом проекте'],['workspace','Во всём рабочем пространстве']])}${ids.length?check('selection','Только выбранный фрагмент',true):''}${check('includeContent','Сохранить текст заметок и изображения',false)}<p class="map-explanation">По умолчанию содержание заметок заменяется подсказками. Названия областей и фигур сохраняются — проверьте, нет ли в них личных данных.</p>`,submitLabel:'Сохранить шаблон',onSubmit:async values=>{
      if(!(await this.readyToLeave()))throw Error('Сначала завершите изменение карты.');
      const t=templateFromMap(this.current,{title:values.get('title'),description:values.get('description'),when:values.get('when'),scope:values.get('scope'),selectedIds:values.has('selection')?ids:null,includeContent:values.has('includeContent')});
      t.ownerId=this.context.actorId;t.workspaceId=this.context.workspaceId;await this.repository.write('templates',t,0);this.message('Шаблон добавлен в библиотеку.');
    }});
  }
  rename() {
    if(!this.current)return;return this.dialog({title:'Название карты',body:input('title','Название',this.current.title,{required:true}),submitLabel:'Сохранить',onSubmit:async values=>this.saveMetadata({...clone(this.current),title:values.get('title').trim()})});
  }
  more() {
    const m=this.current,edit=m&&m.status!=='archived'&&this.permissions.edit;
    const group=(title,content)=>`<section class="map-menu-section"><h3>${title}</h3><div class="map-action-menu">${content}</div></section>`;
    const maps=this.uiCapabilities.mapSwitcher?group('Карты проекта',button('maps','Все карты','board')+button('archive','Архив сессий и карт','folder')+(this.permissions.edit?button('new','Новая карта','plus'):'')):'';
    const opened=m?group('Открытая карта',(edit?button('rename','Переименовать','text')+(this.uiCapabilities.templates?button('save-template','Сохранить как шаблон','grid'):''):'')+(this.permissions.edit&&this.uiCapabilities.mapSwitcher?button('continue','Создать отдельную копию','copy'):'')+button('find','Найти объект','search')+button('export','Экспортировать карту','download')+(edit&&m.kind==='permanent'&&this.uiCapabilities.mapSwitcher?button('finish','Убрать в архив','folder'):'')):'';
    const tools=(this.permissions.edit?button('import','Импортировать карту или шаблон','upload'):'')+(m&&this.view==='canvas'&&this.uiCapabilities.agentProposals?button('agent','Предложение агента','spark'):'')+(this.uiCapabilities.templates?button('templates','Библиотека шаблонов','grid'):'')+button('help','Как работать с картами','info');
    return this.dialog({title:'Меню карты',body:maps+opened+group('Инструменты',tools),mount:el=>el.addEventListener('click',e=>{const action=e.target.closest('[data-map-action]')?.dataset.mapAction;if(action){el.close(true);this.handle(action).catch(error=>this.message(error.message,true));}})});
  }
  async changeSession(action){if(!(await this.readyToLeave()))return;await this.saveMetadata(transitionMap(this.current,action));}
  finishDialog() {
    return this.dialog({title:this.current.kind==='session'?'Завершить сессию':'Переместить карту в архив',description:'Карта останется доступна для просмотра. Новые изменения можно сделать в отдельном продолжении.',body:textarea('summary','Итоги и следующие шаги',this.current.summary,6),submitLabel:'Сохранить итоги и завершить',onSubmit:async values=>{
      if(!(await this.readyToLeave()))throw Error('Сначала сохраните изменения карты.');
      await this.saveMetadata(transitionMap(this.current,'archive',{summary:values.get('summary')}));this.message('Итоги сохранены. Карта находится в архиве.');
    }});
  }
  continueMap() {
    requireValue(this.permissions.edit,'READ_ONLY','Нет права создавать карты.');
    return this.dialog({title:'Продолжить отдельной картой',body:`${input('title','Название',`${this.current.title} — продолжение`,{required:true})}${select('kind','Формат',this.current.kind,[['permanent','Постоянная карта'],['session','Новая сессия']])}<p class="map-explanation">Исходная версия и её итоги не изменятся. Голоса, таймер, история запусков и ответственные не переносятся.</p>`,submitLabel:'Создать продолжение',onSubmit:async values=>{const next=forkMap(this.current,{title:values.get('title'),kind:values.get('kind')});const saved=await this.repository.write('maps',next,0);await this.reloadList();await this.openMap(saved.id);}});
  }
  updateTimer() {
    const target=this.subbar?.querySelector('.map-timer-label'),session=this.current?.session;if(!session)return;
    const remaining=session.timer.endsAt?Math.max(0,Math.ceil((Date.parse(session.timer.endsAt)-Date.now())/1000)):session.timer.remaining;
    const phase={collect:'Собираем мысли',discuss:'Обсуждаем',vote:'Выбираем',outcomes:'Подводим итоги'}[session.phase]||'Сессия';
    const time=`${Math.floor(remaining/60).toString().padStart(2,'0')}:${(remaining%60).toString().padStart(2,'0')}`;
    if(target)target.textContent=`${phase} · ${time}`;
    const summary=this.root.querySelector('.map-session-summary'),timer=this.root.querySelector('.map-session-timer');if(summary)summary.textContent=this.current.status==='active'?`${phase} · ${time}`:'Сессия';if(timer)timer.textContent=`${phase} · ${time}`;
  }
  sessionDialog() {
    if(!this.current?.session)return;const session=this.current.session,readonly=!this.permissions.edit||this.current.status==='archived';
    const candidates=this.current.document.objects.filter(o=>o.type==='sticky');
    return this.dialog({title:'Инструменты сессии',description:'В этой сборке таймер и голоса локальные. Совместный сервер не подключён.',body:`${select('phase','Этап',session.phase,[['collect','Собираем мысли'],['discuss','Обсуждаем'],['vote','Выбираем'],['outcomes','Подводим итоги']])}${input('minutes','Таймер, минут',String(Math.max(1,Math.ceil(session.timer.remaining/60))),{type:'number',required:true})}${check('timer','Запустить таймер после сохранения',!!session.timer.endsAt)}<details class="iq-accordion"><summary>Мои голоса (до ${session.voteLimit}) ${icon('plus',16)}</summary><div class="map-vote-list">${candidates.length?candidates.map(o=>`<label><span>${esc(o.text.slice(0,120))}</span><input type="number" name="vote-${o.id}" min="0" max="${session.voteLimit}" value="${session.votes[o.id]||0}" aria-label="Голосов: ${esc(o.text.slice(0,80))}"></label>`).join(''):'Сначала добавьте заметки.'}</div></details>${this.current.status==='active'&&!readonly?button('pause','Поставить сессию на паузу','pause','secondary'):''}`,submitLabel:readonly?'':'Сохранить',onSubmit:async values=>{
      if(!(await this.readyToLeave()))throw Error('Сначала сохраните карту.');
      const minutes=Number(values.get('minutes'));requireValue(Number.isInteger(minutes)&&minutes>=1&&minutes<=240,'TIMER','Укажите от 1 до 240 минут.');
      const votes=Object.fromEntries(candidates.map(o=>[o.id,Number(values.get(`vote-${o.id}`))||0]));requireValue(Object.values(votes).every(n=>Number.isInteger(n)&&n>=0)&&Object.values(votes).reduce((a,b)=>a+b,0)<=session.voteLimit,'VOTES','Используйте не более трёх голосов.');
      requireValue(!values.has('timer')||this.current.status==='active','SESSION_STATE','Сначала начните или продолжите сессию.');
      await this.saveMetadata({...clone(this.current),session:{...session,phase:values.get('phase'),votes,timer:{remaining:minutes*60,endsAt:values.has('timer')?new Date(Date.now()+minutes*60000).toISOString():null}}});
    },mount:el=>el.addEventListener('click',e=>{if(e.target.closest('[data-map-action=pause]')){el.close(true);this.changeSession('pause').catch(error=>this.message(error.message,true));}})});
  }
  exportMap(draft=false) {
    const data=clone(this.current);if(draft&&this.board){if(this.view==='workflow')data.flow=flowFromScene(data.flow,this.board.draftData);else data.document=this.board.draftData;data.exportedAs='unconfirmed-recovery-copy';}
    download(draft?'map-recovery.json':'map.json',data);
  }
  importMap() {
    requireValue(this.permissions.edit,'READ_ONLY','Нет права импортировать карты.');
    return this.dialog({title:'Импортировать файл',description:'Будет создана отдельная карта или новый шаблон. Открытая карта не заменяется.',body:'<label class="iq-field"><span class="iq-control-label">JSON-файл карты или шаблона</span><input type="file" name="file" accept=".json,application/json" required></label>',submitLabel:'Импортировать',onSubmit:async values=>{
      const file=values.get('file');requireValue(file?.size>0&&file.size<12000000,'FILE_LIMIT','Выберите JSON до 12 МБ.');const data=JSON.parse(await file.text());
      if(data.schema==='iquipage.template/1'){const document=validateWhiteboard(data.document);assertDocumentTypesAllowed(document,this.uiCapabilities,'Шаблон содержит типы объектов, отключённые приложением.');const t={schema:data.schema,id:uid('template'),projectId:this.project.id,revision:0,version:1,title:String(data.title||'Импортированный шаблон').slice(0,160),description:String(data.description||'').slice(0,3000),when:String(data.when||'').slice(0,3000),scope:'personal',ownerId:this.context.actorId,workspaceId:this.context.workspaceId,category:'Мои шаблоны',kind:data.kind==='session'&&this.uiCapabilities.sessions?'session':'permanent',document:remapDocument(document,{clearPersonal:true}),flow:null,createdAt:now()};await this.repository.write('templates',t,0);this.message('Шаблон импортирован в личную библиотеку.');return;}
      const source=data.schema==='iquipage.maps/1'?validateMap(data):{title:data.title||'Импортированная карта',kind:'permanent',document:validateWhiteboard(data),flow:null};
      assertDocumentTypesAllowed(source.document,this.uiCapabilities,'Файл содержит типы объектов, отключённые приложением.');
      const map=createMap({projectId:this.project.id,title:source.title,kind:source.kind,document:remapDocument(source.document,{clearPersonal:true}),flow:source.flow||null});
      const saved=await this.repository.write('maps',map,0);await this.openMap(saved.id);
    }});
  }
  getAgentContext(ids=this.board.selection){requireValue(this.uiCapabilities.agentProposals,'FEATURE_DISABLED','Предложения агента отключены приложением.');requireValue(this.permissions.read,'READ_ONLY','Просмотр недоступен.');return agentContext(this.current,{ids});}
  previewAgentProposal(proposal) {
    requireValue(this.uiCapabilities.agentProposals,'FEATURE_DISABLED','Предложения агента отключены приложением.');
    const prepared=proposalDocument(this.current,proposal,{canEdit:this.permissions.edit});
    if(prepared.changes.some(change=>change.before===null))requireValue(this.uiCapabilities.allowedCreateTypes.includes('sticky'),'CREATE_TYPE_DISABLED','Создание заметок отключено приложением.');
    requireValue(this.view==='canvas','VIEW','Предложения к карте применяются в режиме карты.');
    return this.dialog({title:'Проверить предложение агента',description:'Ни одно изменение ещё не применено. Принятие — один шаг истории карты.',wide:true,body:`<div class="map-agent-changes">${prepared.changes.map(c=>`<article><h3>${c.before===null?'Новая заметка':'Изменение текста'}</h3>${c.before===null?'':`<p><b>Было:</b> ${esc(c.before)}</p>`}<p><b>Станет:</b> ${esc(c.after)}</p></article>`).join('')}</div>`,submitLabel:'Применить изменения',onSubmit:async()=>{
      if(!(await this.readyToLeave()))throw Error('Сначала сохраните текущие изменения.');
      const validated=proposalDocument(this.current,proposal,{canEdit:this.permissions.edit});this.board.applyDocument(validated.document,proposal.baseRevision,'agent-proposal');if(this.savingPromise)await this.savingPromise;
      requireValue(!this.board.dirty,'SAVE_FAILED','Изменения не подтверждены хранилищем.');
    }});
  }
  agentDialog() {
    const context=this.getAgentContext();
    return this.dialog({title:'Предложение агента',description:'Агент работает со структурой карты, а изменения применяются только после вашего подтверждения.',body:`<p class="map-explanation">В контексте ${context.objects.length} объектов. Изображения, ключи и история запусков не передаются. Провайдер помощника в локальном стенде не подключён; можно проверить контракт готовым JSON-предложением.</p>${button('export-context','Экспортировать выбранный контекст','download','secondary')}${textarea('proposal','JSON-предложение','',8)}`,submitLabel:'Показать изменения',onSubmit:async(values,form,el)=>{const proposal=JSON.parse(values.get('proposal'));proposalDocument(this.current,proposal,{canEdit:this.permissions.edit});el.close(true);this.previewAgentProposal(proposal);return false;},mount:el=>el.querySelector('[data-map-action=export-context]').addEventListener('click',()=>download('agent-context.json',context))});
  }
  async destroy(){if(!(await this.readyToLeave()))return false;this.alive=false;this.dialogs.forEach(el=>el.close(true));this.abort.abort();this.unsubscribe?.();clearInterval(this.timer);this.pending.forEach(c=>c.abort());this.root.replaceChildren();return true;}
}
