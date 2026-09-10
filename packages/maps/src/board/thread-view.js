import {icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {postMessage,resolveThread,threadOrder} from './thread-model.js';

export function mountThreads(root,{repository,task,readOnly=false}){
  let items=[],closed=false,limit=20,sequence=0,pendingNew=null;
  const drafts=new Map(),replyIds=new Map(),expanded=new Set(),busy=new Set(),abort=new AbortController();
  root.innerHTML=`<div class="row between"><h3>Обсуждения</h3><span class="iq-helper" data-thread-count></span></div>
    <p role="alert" class="map-form-error" data-thread-error hidden></p>
    <div data-thread-list></div>
    <button type="button" class="iq-btn ghost sm" data-more-threads hidden>Показать ещё</button>`;
  if(!readOnly)root.insertAdjacentHTML('beforeend',`<section class="thread-compose">
    <iq-markdown-editor label="Новое обсуждение" variant="minimal" name="new-discussion" maxlength="20000" submit-label="Опубликовать"></iq-markdown-editor>
    <label class="iq-check"><input type="checkbox" data-requires-resolution><span class="iq-check-box">${icon('check',14)}</span><span>Требует решения</span></label>
    <p class="iq-helper">Сообщения публикуются отдельно от изменений задачи.</p></section>`);
  const list=root.querySelector('[data-thread-list]'),error=root.querySelector('[data-thread-error]'),composer=root.querySelector('.thread-compose iq-markdown-editor');
  const fail=cause=>{if(closed)return;error.hidden=false;error.textContent=cause.message||'Сообщение не сохранено. Текст остаётся у вас.';};
  const label=thread=>thread.requiresResolution?(thread.resolved?'Решён':'Требует решения'):'Комментарий';
  const author=id=>id===(repository.context?.actorId||'local-user')?'Вы':id;
  const time=value=>new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  function capture(){
    list.querySelectorAll('[data-reply-editor]').forEach(editor=>drafts.set(editor.dataset.replyEditor,editor.value));
    list.querySelectorAll('[data-thread]').forEach(element=>element.open?expanded.add(element.dataset.thread):expanded.delete(element.dataset.thread));
  }
  function markup(thread){
    const id=esc(thread.id),resolution=thread.requiresResolution&&!readOnly?`<button type="button" class="iq-btn ghost sm" data-resolve="${id}">${thread.resolved?'Открыть снова':'Отметить решённым'}</button>`:'';
    const reply=readOnly?'':`<iq-markdown-editor data-reply-editor="${id}" label="Ответ" variant="minimal" name="reply-${id}" maxlength="20000" submit-label="Ответить"></iq-markdown-editor>`;
    return `<details class="iq-accordion task-thread" data-thread="${id}" ${expanded.has(thread.id)?'open':''}>
      <summary><span class="grow"><span class="thread-state ${thread.requiresResolution&&!thread.resolved?'unresolved':''}">${label(thread)}</span>
      <span class="thread-excerpt">${esc(thread.messages[0].body.slice(0,160))}</span>
      <small>${thread.messages.length} сообщ. · ${esc(time(thread.lastActivityAt))}</small></span>${icon('plus',16)}</summary>
      <div class="thread-body"><div data-thread-messages="${id}"></div>${resolution}${reply}</div></details>`;
  }
  function fill(thread){
    const element=list.querySelector(`[data-thread="${CSS.escape(thread.id)}"]`);
    if(!element?.open)return;
    const messages=element.querySelector('[data-thread-messages]');
    if(messages.dataset.revision!==String(thread.revision)){
      messages.innerHTML=thread.messages.map(message=>`<article class="thread-message"><header><b>${esc(author(message.authorId))}</b><time>${esc(time(message.createdAt))}</time></header><iq-markdown-viewer></iq-markdown-viewer></article>`).join('');
      messages.querySelectorAll('iq-markdown-viewer').forEach((viewer,index)=>{viewer.value=thread.messages[index].body;});
      messages.dataset.revision=String(thread.revision);
    }
    const editor=element.querySelector('[data-reply-editor]');
    if(editor&&!editor.dataset.initialized){editor.value=drafts.get(thread.id)||'';editor.dataset.initialized='true';}
  }
  function draw(){
    if(closed)return;capture();items.sort(threadOrder);
    const unresolved=items.filter(thread=>thread.requiresResolution&&!thread.resolved).length;
    root.querySelector('[data-thread-count]').textContent=unresolved?`Требуют решения: ${unresolved}`:'';
    list.innerHTML=items.slice(0,limit).map(markup).join('')||'<p class="iq-helper">Обсуждений пока нет.</p>';
    for(const thread of items.slice(0,limit))fill(thread);
    root.querySelector('[data-more-threads]').hidden=items.length<=limit;
  }
  async function reload(){const token=++sequence;try{const all=await repository.list('threads',task.projectId);if(!closed&&token===sequence){items=all.filter(thread=>thread.taskId===task.id);draw();}}catch(cause){fail(cause);}}
  root.addEventListener('toggle',event=>{const id=event.target.dataset.thread;if(id&&event.target.open){expanded.add(id);const thread=items.find(thread=>thread.id===id);if(thread)fill(thread);}},{capture:true,signal:abort.signal});
  root.addEventListener('iq-submit',async event=>{
    if(readOnly)return;event.stopPropagation();
    const editor=event.target,id=editor.dataset.replyEditor||'new';if(busy.has(id))return;
    busy.add(id);error.hidden=true;editor.disabled=true;
    try{
      const body=editor.value;
      if(id==='new'){
        pendingNew ||= {threadId:uid('thread'),messageId:uid('message')};
        const saved=await postMessage(repository,task,{...pendingNew,body,requiresResolution:root.querySelector('[data-requires-resolution]').checked});
        pendingNew=null;expanded.add(saved.id);
      }else{
        if(!replyIds.has(id))replyIds.set(id,uid('message'));
        await postMessage(repository,task,{threadId:id,messageId:replyIds.get(id),body});replyIds.delete(id);drafts.delete(id);
      }
      editor.value='';await reload();
    }catch(cause){fail(cause);}finally{busy.delete(id);if(editor.isConnected)editor.disabled=false;}
  },{signal:abort.signal});
  root.addEventListener('click',async event=>{
    if(event.target.closest('[data-more-threads]')){limit+=20;draw();}
    const button=event.target.closest('[data-resolve]');if(!button||readOnly)return;
    const id=button.dataset.resolve,thread=items.find(thread=>thread.id===id);if(!thread||busy.has(id))return;
    busy.add(id);button.disabled=true;error.hidden=true;
    try{const saved=await resolveThread(repository,thread,!thread.resolved);const details=button.closest('details');if(saved.resolved&&!details.querySelector('iq-markdown-editor')?.value)details.open=false;await reload();}
    catch(cause){fail(cause);}finally{busy.delete(id);if(button.isConnected)button.disabled=false;}
  },{signal:abort.signal});
  reload();
  return {reload,dirty(){capture();return !!composer?.value.trim()||[...drafts.values()].some(value=>value.trim());},isBusy:()=>busy.size>0,destroy(){closed=true;sequence++;abort.abort();}};
}
