import {createThreadPager} from './thread-pager.js';
import {icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {postMessage,resolveThread,threadOrder} from './thread-model.js';

export function mountThreads(root,{repository,task,readOnly=false}){
  let items=[],closed=false,limit=Infinity,sequence=0,pendingNew=null,requiresResolution=false;
  let pager,unresolvedCount=0,pageLoading=false,canLoadMore=false;
  const fullThreads=new Map(),detailRequests=new Map();
  const drafts=new Map(),replyIds=new Map(),expanded=new Set(),busy=new Set(),abort=new AbortController();
  root.innerHTML=`<div class="row between"><h3>Обсуждения</h3><span class="iq-helper" data-thread-count></span></div>
    <p role="alert" class="map-form-error" data-thread-error hidden></p>
    <span class="iq-helper" role="status" data-thread-page-state></span><div data-thread-list></div>
    <button type="button" class="iq-btn ghost sm" data-more-threads hidden>Показать ещё</button>`;
  if(!readOnly)root.insertAdjacentHTML('beforeend',`<section class="thread-compose">
    <iq-markdown-editor label="Новое обсуждение" variant="minimal" density="compact" name="new-discussion" placeholder="Напишите сообщение или вопрос" maxlength="20000" submit-label="Опубликовать"></iq-markdown-editor>
    </section>`);
  const list=root.querySelector('[data-thread-list]'),error=root.querySelector('[data-thread-error]'),composer=root.querySelector('.thread-compose iq-markdown-editor');
  const syncComposer=()=>{if(composer)composer.footerActions=[{id:'requires-resolution',label:'Требует решения',pressed:requiresResolution,tone:'warning'}];};
  syncComposer();
  composer?.addEventListener('iq-editor-action',event=>{
    if(event.target!==composer||event.detail.id!=='requires-resolution'||readOnly||busy.has('new'))return;
    event.stopPropagation();requiresResolution=event.detail.pressed;syncComposer();
  },{signal:abort.signal});
  const fail=cause=>{if(closed)return;error.hidden=false;error.textContent=cause.message||'Не удалось загрузить обсуждения.';const retry=document.createElement('button');retry.type='button';retry.className='iq-btn ghost sm';retry.dataset.retryThreads='';retry.textContent='Повторить';error.append(retry);};
  const label=thread=>thread.requiresResolution?(thread.resolved?'Решён':'Требует решения'):'Комментарий';
  const stateClass=thread=>'iq-badge thread-state'+(thread.requiresResolution?(thread.resolved?' success':' warning unresolved'):'');
  const author=id=>id===(repository.context?.actorId||'local-user')?'Вы':id;
  const time=value=>new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  function capture(){
    list.querySelectorAll('[data-reply-editor]').forEach(editor=>drafts.set(editor.dataset.replyEditor,editor.value));
    list.querySelectorAll('[data-thread]').forEach(element=>element.open?expanded.add(element.dataset.thread):expanded.delete(element.dataset.thread));
  }
  function markup(thread){
    const id=esc(thread.id),resolution=thread.requiresResolution&&!readOnly?`<button type="button" class="iq-btn ghost sm" data-resolve="${id}">${thread.resolved?'Открыть снова':'Отметить решённым'}</button>`:'';
    const reply=readOnly?'':`<div data-reply-mount="${id}"></div>`;
    return `<details class="iq-accordion task-thread" data-thread="${id}" ${expanded.has(thread.id)?'open':''}>
      <summary><span class="grow"><span class="${stateClass(thread)}">${label(thread)}</span>
      <span class="thread-excerpt">${esc(thread.messages[0].body.slice(0,160))}</span>
      <small>${thread.messageCount??thread.messages.length} сообщ. · ${esc(time(thread.lastActivityAt))}</small></span>${icon('plus',16)}</summary>
      <div class="thread-body"><p class="iq-helper" role="status" data-thread-load-state></p><div data-thread-messages="${id}"></div>${resolution}${reply}</div></details>`;
  }
  function requestDetails(thread,element){
    const previous=detailRequests.get(thread.id);if(previous?.revision===thread.revision)return;
    previous?.controller.abort();const request={controller:new AbortController(),revision:thread.revision};detailRequests.set(thread.id,request);
    const status=element.querySelector('[data-thread-load-state]');status.textContent='Загрузка сообщений…';
    repository.read('threads',thread.id,task.projectId,{signal:request.controller.signal}).then(value=>{
      if(closed||request.controller.signal.aborted||detailRequests.get(thread.id)!==request)return;
      if(!value||value.taskId!==task.id||value.projectId!==task.projectId)throw Error('Обсуждение недоступно.');
      fullThreads.set(value.id,value);pager.remember(value);items=items.map(item=>item.id===value.id?value:item);
      status.textContent='';draw();
    }).catch(cause=>{
      if(closed||request.controller.signal.aborted)return;
      status.textContent=cause.message||'Не удалось загрузить сообщения.';
      const button=document.createElement('button');button.type='button';button.className='iq-btn ghost sm';button.dataset.retryThread=thread.id;button.textContent='Повторить';status.append(button);
    }).finally(()=>{if(detailRequests.get(thread.id)===request)detailRequests.delete(thread.id);});
  }
  function fill(thread){
    const element=list.querySelector(`[data-thread="${CSS.escape(thread.id)}"]`);
    if(!element?.open)return;
    if(thread.summary){const cached=fullThreads.get(thread.id);if(!cached||cached.revision!==thread.revision){requestDetails(thread,element);return;}thread=cached;}
    const messages=element.querySelector('[data-thread-messages]');
    if(messages.dataset.revision!==String(thread.revision)){
      messages.innerHTML=thread.messages.map(message=>`<article class="thread-message"><header><b>${esc(author(message.authorId))}</b><time>${esc(time(message.createdAt))}</time></header><iq-markdown-viewer></iq-markdown-viewer></article>`).join('');
      messages.querySelectorAll('iq-markdown-viewer').forEach((viewer,index)=>{viewer.value=thread.messages[index].body;});
      messages.dataset.revision=String(thread.revision);
    }
    const replyMount=element.querySelector('[data-reply-mount]');
    if(replyMount&&!replyMount.firstElementChild){
      const editor=document.createElement('iq-markdown-editor');
      editor.dataset.replyEditor=thread.id;editor.setAttribute('label','Ответ');editor.setAttribute('variant','minimal');editor.density='compact';
      editor.setAttribute('name','reply-'+thread.id);editor.setAttribute('placeholder','Напишите ответ в обсуждении');editor.setAttribute('maxlength','20000');editor.setAttribute('submit-label','Ответить');
      replyMount.append(editor);
    }
    const editor=element.querySelector('[data-reply-editor]');
    if(editor&&!editor.dataset.initialized){editor.value=drafts.get(thread.id)||'';editor.dataset.initialized='true';}
  }
  function draw(){
    if(closed)return;capture();items.sort(threadOrder);
    const unresolved=unresolvedCount;
    root.querySelector('[data-thread-count]').textContent=unresolved?`Требуют решения: ${unresolved}`:'';
    const visible=items.slice(0,limit),keep=new Set(visible.map(thread=>thread.id));
    const active=document.activeElement,selection=active?.tagName==='TEXTAREA'?{start:active.selectionStart,end:active.selectionEnd}:null;
    for(const node of [...list.children])if(!keep.has(node.dataset.thread))node.remove();
    let cursor=list.firstElementChild;
    for(const thread of visible){
      let node=list.querySelector(`[data-thread="${CSS.escape(thread.id)}"]`);
      if(!node){const template=document.createElement('template');template.innerHTML=markup(thread);node=template.content.firstElementChild;}
      if(node!==cursor){if(node.isConnected&&typeof list.moveBefore==='function')list.moveBefore(node,cursor);else list.insertBefore(node,cursor);}
      cursor=node.nextElementSibling;
      const state=node.querySelector('.thread-state');state.textContent=label(thread);state.className=stateClass(thread);
      node.querySelector('summary small').textContent=`${thread.messageCount??thread.messages.length} сообщ. · ${time(thread.lastActivityAt)}`;
      const resolve=node.querySelector('[data-resolve]');if(resolve)resolve.textContent=thread.resolved?'Открыть снова':'Отметить решённым';
      if(expanded.has(thread.id))node.open=true;
    }
    if(!visible.length)list.innerHTML=`<div class="thread-empty"><b>Начните обсуждение</b><p>${readOnly?'Здесь появятся вопросы, решения и комментарии команды.':'Задайте вопрос или поделитесь деталями задачи в сообщении ниже.'}</p></div>`;
    if(active?.isConnected&&document.activeElement!==active){active.focus({preventScroll:true});if(selection)active.setSelectionRange(selection.start,selection.end);}
    for(const thread of items.slice(0,limit))fill(thread);
    root.querySelector('[data-more-threads]').hidden=!canLoadMore;
    root.querySelector('[data-more-threads]').disabled=pageLoading;
    root.querySelector('[data-thread-page-state]').textContent=pageLoading?'Загрузка обсуждений…':'';
  }
  pager=createThreadPager(repository,task,{
    pinned:()=>{capture();return new Set([...expanded,...[...drafts].filter(([,text])=>text.trim()).map(([id])=>id),...busy]);},
    onChange:state=>{
      pageLoading=state.loading;canLoadMore=!!state.nextCursor;unresolvedCount=state.unresolved;
      root.querySelector('[data-thread-page-state]').textContent=pageLoading?'Загрузка обсуждений…':'';
      root.querySelector('[data-more-threads]').disabled=pageLoading;
      if(!pageLoading){items=state.items;draw();}
    },onError:fail
  });
  async function reload(){error.hidden=true;return pager.reload();}
  root.addEventListener('toggle',event=>{const id=event.target.dataset.thread;if(id&&event.target.open){expanded.add(id);const thread=items.find(thread=>thread.id===id);if(thread)fill(thread);}},{capture:true,signal:abort.signal});
  root.addEventListener('iq-submit',async event=>{
    if(readOnly)return;event.stopPropagation();
    const editor=event.target,id=editor.dataset.replyEditor||'new';if(busy.has(id))return;
    busy.add(id);error.hidden=true;editor.disabled=true;
    try{
      const body=editor.value;
      if(id==='new'){
        pendingNew ||= {threadId:uid('thread'),messageId:uid('message')};
        const saved=await postMessage(repository,task,{...pendingNew,body,requiresResolution});
        pendingNew=null;requiresResolution=false;syncComposer();expanded.add(saved.id);fullThreads.set(saved.id,saved);pager.remember(saved);
      }else{
        if(!replyIds.has(id))replyIds.set(id,uid('message'));
        const saved=await postMessage(repository,task,{threadId:id,messageId:replyIds.get(id),body});fullThreads.set(saved.id,saved);pager.remember(saved);replyIds.delete(id);drafts.delete(id);
      }
      editor.value='';await reload();
    }catch(cause){fail(cause);}finally{busy.delete(id);if(editor.isConnected)editor.disabled=false;}
  },{signal:abort.signal});
  root.addEventListener('click',async event=>{
    if(event.target.closest('[data-more-threads]')){error.hidden=true;await pager.more();}
    if(event.target.closest('[data-retry-threads]'))await reload();
    const retry=event.target.closest('[data-retry-thread]');if(retry){const item=items.find(item=>item.id===retry.dataset.retryThread);if(item)fill(item);}
    const button=event.target.closest('[data-resolve]');if(!button||readOnly)return;
    const id=button.dataset.resolve,thread=items.find(thread=>thread.id===id);if(!thread||busy.has(id))return;
    busy.add(id);button.disabled=true;error.hidden=true;
    try{const current=await repository.read('threads',id,task.projectId);if(!current)throw Error('Обсуждение недоступно.');const saved=await resolveThread(repository,{...current,revision:thread.revision},!thread.resolved);fullThreads.set(saved.id,saved);pager.remember(saved);const details=button.closest('details');if(saved.resolved&&!details.querySelector('iq-markdown-editor')?.value)details.open=false;await reload();}
    catch(cause){fail(cause);}finally{busy.delete(id);if(button.isConnected)button.disabled=false;}
  },{signal:abort.signal});
  const unsubscribe=repository.subscribe?.(event=>{if(event.collection==='threads'&&event.projectId===task.projectId&&!closed)reload();});
  reload();
  return {reload,dirty(){capture();return requiresResolution||!!composer?.value.trim()||[...drafts.values()].some(value=>value.trim());},isBusy:()=>busy.size>0,destroy(){closed=true;sequence++;unsubscribe?.();abort.abort();pager.destroy();for(const value of detailRequests.values())value.controller.abort();detailRequests.clear();fullThreads.clear();}};
}
