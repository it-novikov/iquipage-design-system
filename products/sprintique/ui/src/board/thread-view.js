import {formatDateTime,ui,plural as pluralForms,mentionsHTML,mentionPlainText,FEEDBACK_TIMING} from '@iquipage/web/core';
import {createThreadPager} from './thread-pager.js';
import {icon,esc} from '../ui.js';
import {uid} from '../common.js';
import {background} from '../action-feedback.js';
import {postMessage,resolveThread,changeThreadKind} from './thread-model.js';
import {mentionCandidates,mentionNames,closeCutMention} from './mention-options.js';
const SUMMARY_TEXT=160;

/** Discussions read as a chat: open questions are pinned on top with one clear resolve action, comment threads and
 *  resolved questions follow in the order they happened, and the composer rests as one line. Space separates items;
 *  there are no dividers, fills or <summary> rows (their focus style was the "strange highlight"). */
const plural=(n,one,few,many)=>pluralForms(n,{one,few,many});
export const repliesLabel=n=>`${n} ${plural(n,'ответ','ответа','ответов')}`;
export const messagesLabel=n=>`${n} ${plural(n,'сообщение','сообщения','сообщений')}`;
const byCreated=(a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id));
const isOpen=thread=>thread.requiresResolution&&!thread.resolved;
const shape=thread=>thread.requiresResolution?(thread.resolved?'resolved':'open'):'comment';
const QUESTION_HINT='Вопрос будет вверху обсуждений, пока его не отметят решённым';
let sections=0;

export function mountThreads(root,{repository,task,readOnly=false,people=new Map(),actorId=repository.context?.actorId||'local-user'}){
  let items=[],closed=false,pendingNew=null,asQuestion=false,total=0,unresolved=0,pageLoading=false,canLoadMore=false,pager,pendingFocus=null;
  const fullThreads=new Map(),detailRequests=new Map(),detailErrors=new Map();
  const drafts=new Map(),replyIds=new Map(),resolveAfter=new Map(),expanded=new Set(),olderShown=new Set(),openReplies=new Set(),busy=new Set(),justChanged=new Set();
  const abort=new AbortController(),section=++sections;
  // A person carries their photo (when the repository serves one) over their initials.
  const photo=p=>repository.client?.avatarUrl?.(p.id,p.avatarRevision)||undefined;
  const person=id=>{const p=people.get(id)||(id&&id===actorId?{id,name:'Вы'}:{id,name:'Бывший участник'});return {...p,image:photo(p)};};
  const time=value=>value?formatDateTime(value):'';
  // «@» offers the project's members (not the author); mentions read with each member's current name.
  const candidates=mentionCandidates([...people.values()].filter(p=>p.id!==actorId),{image:photo}),names=mentionNames([...people.values()]);
  root.setAttribute('aria-labelledby',`threads-${section}-title`);
  root.innerHTML=`<div class="iq-section-head">${icon('message',16)}<h3 id="threads-${section}-title">Обсуждения</h3><span class="iq-section-count" data-thread-count></span><span class="iq-section-actions"><span class="iq-discussion-new-count" data-thread-new-count hidden></span><span class="iq-discussion-open-count" data-thread-open-count hidden></span></span></div>
    <p class="sr-only" role="status" aria-live="polite" data-thread-live></p>
    <div class="iq-discussion" data-thread-root aria-busy="false">
      <p class="iq-discussion-empty" data-thread-empty hidden></p>
      <div class="iq-discussion-questions" data-thread-questions></div>
      <button type="button" class="iq-btn ghost sm iq-discussion-more" data-more-threads hidden></button>
      <div class="iq-discussion-timeline" data-thread-timeline></div>
      <div class="iq-discussion-error" role="alert" data-thread-error hidden></div>
      ${readOnly?'':`<div class="iq-composer" data-thread-composer>${ui.personAvatar(person(actorId),{size:'sm'})}<iq-markdown-editor variant="chat" idle="line" name="new-discussion" label="Новое сообщение" placeholder="Написать комментарий или задать вопрос" maxlength="20000" submit-label="Отправить" cancel-label="Отмена"></iq-markdown-editor></div>`}
    </div>`;
  const discussion=root.querySelector('[data-thread-root]'),questionsRoot=root.querySelector('[data-thread-questions]'),timelineRoot=root.querySelector('[data-thread-timeline]');
  const errorRow=root.querySelector('[data-thread-error]'),live=root.querySelector('[data-thread-live]'),composer=root.querySelector('[data-thread-composer] iq-markdown-editor');
  const syncComposer=()=>{if(composer)composer.footerActions=[{id:'question',label:'Вопрос',icon:'help',appearance:'chip',tone:'warning',pressed:asQuestion,hint:QUESTION_HINT}];};
  syncComposer();
  if(composer)composer.mentions=candidates;
  const announce=text=>{live.textContent='';requestAnimationFrame(()=>{if(!closed)live.textContent=text;});};

  // "New" follows the person: the server keeps a read marker per thread and person. A repository without markers
  // (the local one) keeps them in this browser, where the first visit marks everything seen.
  const server=typeof repository.markThreadRead==='function',readAts=new Map();
  const seenKey=`sprintique.threads.seen.${actorId}.${task.id}`;let seen=null;
  if(!server){try{seen=JSON.parse(localStorage.getItem(seenKey)||'null');}catch{seen=null;}}
  const firstVisit=!server&&(!seen||typeof seen!=='object');if(!seen||typeof seen!=='object')seen={};
  const storeSeen=()=>{try{const entries=Object.entries(seen).sort((a,b)=>String(b[1]).localeCompare(String(a[1]))).slice(0,200);localStorage.setItem(seenKey,JSON.stringify(Object.fromEntries(entries)));}catch{}};
  const summaryOf=thread=>items.find(item=>item.id===thread.id)||thread;
  const seenAt=thread=>server?(readAts.has(thread.id)?readAts.get(thread.id):summaryOf(thread).readAt??null):(seen[thread.id]??(firstVisit?thread.lastActivityAt:null));
  const markSeen=thread=>{
    if(!thread)return;const at=summaryOf(thread).lastActivityAt||thread.lastActivityAt,previous=seenAt(thread);
    if(previous&&String(previous)>=String(at))return;
    if(!server){seen[thread.id]=at;storeSeen();return;}
    readAts.set(thread.id,at);
    background(()=>repository.markThreadRead(task.projectId,thread.id,at)).catch(()=>{if(readAts.get(thread.id)===at)readAts.delete(thread.id);});
  };
  const isNew=thread=>{const at=seenAt(thread);return !thread.resolved&&thread.lastAuthorId!==actorId&&(!at||String(thread.lastActivityAt)>String(at));};
  const messageIsNew=(thread,message)=>{const at=seenAt(thread);return message.authorId!==actorId&&!!at&&String(message.createdAt)>String(at);};

  const detailed=thread=>{const full=fullThreads.get(thread.id);return full&&(!thread.summary||full.revision===thread.revision)?full:(thread.summary?null:thread);};
  function messageMarkup(thread,message,index,{reply=false,full=false}={}){
    const known=!!message.authorId,who=person(message.authorId),id=`threads-${section}-${esc(thread.id)}-m${index}`,fresh=full&&messageIsNew(thread,message);
    const avatar=known?ui.personAvatar(who,{size:reply?'xs':'sm'}):`<span class="iq-avatar ${reply?'xs':'sm'} iq-skeleton" aria-hidden="true"></span>`;
    const meta=known?`<b class="iq-message-author" id="${id}-author">${esc(who.name)}</b>${message.createdAt?`<time class="iq-message-time" datetime="${esc(message.createdAt)}">${esc(time(message.createdAt))}</time>`:''}${fresh?'<span class="sr-only">новое</span>':''}`:'<span class="iq-skeleton iq-skeleton-line" data-width="short"></span>';
    const text=full?`<iq-markdown-viewer class="iq-message-text" data-viewer="${index}"></iq-markdown-viewer>`:`<p class="iq-message-text">${mentionsHTML(closeCutMention(message.body),names)}</p>`;
    return `<article class="iq-message"${reply?' data-size="reply"':''}${fresh?' data-new':''}${justChanged.has(message.id)?' data-just-changed':''} data-message="${esc(message.id||'first')}">${avatar}<div class="iq-message-main"><p class="iq-message-meta">${meta}</p>${text}</div></article>`;
  }
  const skeletonReply='<div class="iq-message" data-size="reply" data-state="loading" aria-hidden="true"><span class="iq-avatar xs iq-skeleton"></span><div class="iq-message-main"><span class="iq-skeleton iq-skeleton-line" data-width="short"></span><span class="iq-skeleton iq-skeleton-line"></span></div></div>';
  function repliesMarkup(thread,full,{limitOlder=false}={}){
    if(detailErrors.has(thread.id))return `<div class="iq-discussion-error" role="alert">${icon('warning',16)}<span>${esc(detailErrors.get(thread.id))}</span><button type="button" class="iq-btn ghost sm" data-retry-thread="${esc(thread.id)}">Повторить</button></div>`;
    if(!full)return (thread.messageCount??1)>1?skeletonReply:'';
    const replies=full.messages.slice(1).map((message,i)=>({message,index:i+1}));
    const hidden=limitOlder&&!olderShown.has(thread.id)&&replies.length>2?replies.length-2:0;
    return `${hidden?`<button type="button" class="iq-thread-toggle" data-older-replies="${esc(thread.id)}" aria-expanded="false">Показать ещё ${esc(repliesLabel(hidden))}</button>`:''}${replies.slice(hidden).map(({message,index})=>messageMarkup(thread,message,index,{reply:true,full:true})).join('')}`;
  }
  function contentMarkup(thread){
    const id=esc(thread.id),full=detailed(thread),first=(full||thread).messages[0]||{body:''},kind=shape(thread),count=thread.messageCount??thread.messages.length;
    const firstMessage=messageMarkup(thread,first,0,{full:!!full});
    if(kind==='open'){
      const replies=count>1?`<div class="iq-thread-replies" id="threads-${section}-${id}-replies">${repliesMarkup(thread,full,{limitOlder:true})}</div>`:'';
      const actions=readOnly?'':`<div class="iq-thread-actions"><span class="iq-thread-actions-group"><button type="button" class="iq-btn ghost sm" data-reply="${id}" aria-controls="threads-${section}-${id}-reply">${icon('message',16)}<span>Ответить</span></button><button type="button" class="iq-btn ghost sm" data-thread-kind="${id}" data-thread-kind-value="comment"${busy.has(thread.id)?' disabled':''}>Это не вопрос</button></span><button type="button" class="iq-btn secondary sm" data-resolve="${id}"${busy.has(thread.id)?' disabled aria-busy="true"':''}>${icon('check',16)}<span>Отметить решённым</span></button></div>`;
      return `<p class="iq-thread-flag">${icon('help',16)}<span>Открытый вопрос</span></p>${firstMessage}${replies}${actions}`;
    }
    if(kind==='resolved'){
      const open=expanded.has(thread.id),who=thread.resolution?person(thread.resolution.actorId).name:'';
      const at=thread.resolution?.at||thread.lastActivityAt;
      return `<button type="button" class="iq-thread-line" data-thread-toggle="${id}" aria-expanded="${open}" aria-controls="threads-${section}-${id}-body">${icon('checkCircle',16)}<span class="iq-thread-line-text">${esc(mentionPlainText(closeCutMention(first.body),names).replace(/\s+/g,' ').slice(0,160))}</span><span class="iq-thread-line-meta">Решён ${esc(time(at))}, ${esc(messagesLabel(count))}</span>${icon('chevron',16)}</button>
        <div class="iq-thread-body" id="threads-${section}-${id}-body"${open?'':' hidden'}>${open?`${firstMessage}${count>1?`<div class="iq-thread-replies">${repliesMarkup(thread,full)}</div>`:''}<div class="iq-thread-actions"><span class="iq-thread-resolution">Отмечен решённым${who?`: ${esc(who)}`:''}, ${esc(time(at))}</span>${readOnly?'':`<button type="button" class="iq-btn ghost sm" data-resolve="${id}"${busy.has(thread.id)?' disabled aria-busy="true"':''}>Открыть снова</button>`}</div>`:''}</div>`;
    }
    const open=expanded.has(thread.id),fresh=isNew(thread)&&!open;
    const repliers=(thread.participants||(full?[...new Set(full.messages.slice(1).map(m=>m.authorId).reverse())]:[])).filter(Boolean).slice(0,3).map(person);
    const toggle=count>1?`<button type="button" class="iq-thread-toggle" data-thread-toggle="${id}" aria-expanded="${open}" aria-controls="threads-${section}-${id}-replies">${repliers.length?ui.avatarGroup(repliers,{size:'xs',max:3,label:'Ответили'}):''}<span>${esc(repliesLabel(count-1))}</span><span class="iq-thread-toggle-meta">последний ${esc(time(thread.lastActivityAt))}</span><span class="iq-thread-new" aria-hidden="true"${fresh?'':' hidden'}></span>${fresh?'<span class="sr-only">есть новые</span>':''}</button>`:'';
    const reply=readOnly?'':`<button type="button" class="iq-btn ghost sm" data-reply="${id}" aria-controls="threads-${section}-${id}-reply">Ответить</button><button type="button" class="iq-btn ghost sm" data-thread-kind="${id}" data-thread-kind-value="question"${busy.has(thread.id)?' disabled':''}>${icon('help',16)}<span>Сделать вопросом</span></button>`;
    return `${firstMessage}${toggle||reply?`<div class="iq-thread-actions">${toggle}${reply}</div>`:''}${count>1?`<div class="iq-thread-replies" id="threads-${section}-${id}-replies"${open?'':' hidden'}>${open?repliesMarkup(thread,full):''}</div>`:''}`;
  }
  function signature(thread){
    const full=detailed(thread);
    return JSON.stringify([shape(thread),thread.revision,thread.messageCount,!!full,full?.revision,expanded.has(thread.id),olderShown.has(thread.id),busy.has(thread.id),detailErrors.get(thread.id)||'',isNew(thread),thread.participants||[],[...justChanged]]);
  }
  // Keyed nodes: a thread keeps its element (and its reply editor, draft and focus) across reloads; only its
  // content part is re-rendered when something it shows has changed.
  function threadNode(thread){
    const kind=shape(thread);
    let node=root.querySelector(`.iq-thread[data-thread="${CSS.escape(thread.id)}"]`);
    if(node&&node.dataset.shape!==kind){node.remove();node=null;}
    if(!node){
      node=document.createElement('article');node.className='iq-thread';node.dataset.thread=thread.id;node.dataset.shape=kind;
      node.dataset.kind=thread.requiresResolution?'question':'comment';if(thread.requiresResolution)node.dataset.state=thread.resolved?'resolved':'open';
      node.setAttribute('aria-labelledby',`threads-${section}-${thread.id}-m0-author`);
      node.innerHTML=`<div class="iq-thread-content"></div>${kind==='resolved'||readOnly?'':`<div class="iq-thread-reply" id="threads-${section}-${esc(thread.id)}-reply" hidden></div>`}`;
    }
    const content=node.querySelector('.iq-thread-content'),next=signature(thread);
    if(content.dataset.signature!==next){
      const active=document.activeElement,key=content.contains(active)?['data-thread-toggle','data-older-replies','data-reply','data-resolve','data-retry-thread'].find(name=>active.hasAttribute(name)):null;
      content.innerHTML=contentMarkup(thread);content.dataset.signature=next;
      const full=detailed(thread);
      content.querySelectorAll('iq-markdown-viewer[data-viewer]').forEach(viewer=>{viewer.mentions=names;viewer.value=full?.messages[Number(viewer.dataset.viewer)]?.body||'';});
      if(key)content.querySelector(`[${key}="${CSS.escape(thread.id)}"]`)?.focus({preventScroll:true});
    }
    return node;
  }
  function place(container,threads){
    const keep=new Set(threads.map(thread=>thread.id));
    for(const node of [...container.children])if(!keep.has(node.dataset.thread))node.remove();
    let cursor=container.firstElementChild;
    for(const thread of threads){
      const node=threadNode(thread);
      if(node!==cursor){if(node.isConnected&&typeof container.moveBefore==='function')container.moveBefore(node,cursor);else container.insertBefore(node,cursor);}
      cursor=node.nextElementSibling;
    }
  }
  // A summary carries the first message cut to 160 characters (Discussions.list): a longer one is read in full, or a
  // long comment (an agent's answer) would end mid-word.
  const clipped=thread=>[...(thread.messages?.[0]?.body||'')].length>=SUMMARY_TEXT;
  const needsDetails=thread=>thread.summary&&((thread.messageCount??1)>1&&(isOpen(thread)||expanded.has(thread.id))||clipped(thread));
  function requestDetails(thread){
    const cached=fullThreads.get(thread.id);if(cached&&cached.revision===thread.revision)return;
    if(detailErrors.has(thread.id))return;
    const previous=detailRequests.get(thread.id);if(previous?.revision===thread.revision)return;
    previous?.controller.abort();const request={controller:new AbortController(),revision:thread.revision};detailRequests.set(thread.id,request);
    repository.read('threads',thread.id,task.projectId,{signal:request.controller.signal}).then(value=>{
      if(closed||request.controller.signal.aborted||detailRequests.get(thread.id)!==request)return;
      if(!value||value.taskId!==task.id||value.projectId!==task.projectId)throw Error('Обсуждение недоступно.');
      fullThreads.set(value.id,value);draw();
    }).catch(cause=>{
      if(closed||request.controller.signal.aborted)return;
      detailErrors.set(thread.id,cause.message||'Не удалось загрузить сообщения.');draw();
    }).finally(()=>{if(detailRequests.get(thread.id)===request)detailRequests.delete(thread.id);});
  }
  function draw(){
    if(closed)return;
    const questions=items.filter(isOpen).sort(byCreated),timeline=items.filter(thread=>!isOpen(thread)).sort(byCreated);
    place(questionsRoot,questions);place(timelineRoot,timeline);
    root.querySelector('[data-thread-count]').textContent=total?String(total):'';
    const openCount=root.querySelector('[data-thread-open-count]');openCount.hidden=!unresolved;openCount.textContent=unresolved?`Открытые вопросы: ${unresolved}`:'';
    const fresh=items.filter(isNew).length,newCount=root.querySelector('[data-thread-new-count]');newCount.hidden=!fresh;newCount.textContent=fresh?`Новые: ${fresh}`:'';
    const empty=root.querySelector('[data-thread-empty]');empty.hidden=!!items.length||pageLoading;
    empty.textContent=readOnly?'Обсуждений пока нет.':'Задайте вопрос по задаче или оставьте комментарий. Открытые вопросы остаются вверху, пока их не решат.';
    const more=root.querySelector('[data-more-threads]'),rest=Math.max(0,total-items.length);
    more.hidden=!canLoadMore;more.disabled=pageLoading;more.textContent=rest?`Показать ещё ${rest}`:'Показать ещё';
    discussion.setAttribute('aria-busy',String(pageLoading));
    for(const thread of items)if(needsDetails(thread))requestDetails(thread);
    for(const thread of questions)markSeen(thread);
    if(firstVisit)for(const thread of items)if(seen[thread.id]===undefined){seen[thread.id]=thread.lastActivityAt;storeSeen();}
    if(server)for(const thread of items)if(thread.readAt&&(!readAts.has(thread.id)||String(readAts.get(thread.id))<String(thread.readAt)))readAts.set(thread.id,thread.readAt);
    if(pendingFocus){const target=root.querySelector(pendingFocus);if(target){target.focus({preventScroll:true});target.scrollIntoView?.({block:'nearest'});pendingFocus=null;}}
  }
  function fail(cause,retry='data-retry-threads'){
    if(closed)return;
    errorRow.hidden=false;errorRow.innerHTML=`${icon('warning',16)}<span></span>${retry?`<button type="button" class="iq-btn ghost sm" ${retry}>${cause?.code==='THREAD_CURSOR_STALE'?'Обновить':'Повторить'}</button>`:''}`;
    errorRow.querySelector('span').textContent=cause?.message||'Не удалось загрузить обсуждения.';
  }
  const clearError=()=>{errorRow.hidden=true;errorRow.replaceChildren();};
  const settle=messageId=>{justChanged.add(messageId);setTimeout(()=>{justChanged.delete(messageId);},1200);};
  function syncReplyActions(id){
    const editor=root.querySelector(`[data-reply-editor="${CSS.escape(id)}"]`),thread=items.find(item=>item.id===id);if(!editor)return;
    editor.footerActions=thread&&isOpen(thread)?[{id:'resolve-after',label:'Решить вопрос этим ответом',icon:'check',appearance:'chip',pressed:!!resolveAfter.get(id)}]:[];
  }
  function openReply(id){
    const slot=root.querySelector(`.iq-thread[data-thread="${CSS.escape(id)}"] .iq-thread-reply`);if(!slot)return;
    let editor=slot.querySelector('iq-markdown-editor');
    if(!editor){
      editor=document.createElement('iq-markdown-editor');editor.dataset.replyEditor=id;
      for(const [name,value] of [['variant','chat'],['name','reply-'+id],['label','Ответ в обсуждении'],['placeholder','Ответ'],['maxlength','20000'],['submit-label','Ответить'],['cancel-label','Отмена']])editor.setAttribute(name,value);
      editor.mentions=candidates;
      slot.append(editor);
      if(drafts.has(id))editor.value=drafts.get(id);
    }
    syncReplyActions(id);openReplies.add(id);slot.hidden=false;editor.expand?.();
  }
  function closeReply(id,{focus=true}={}){
    const node=root.querySelector(`.iq-thread[data-thread="${CSS.escape(id)}"]`),slot=node?.querySelector('.iq-thread-reply');
    drafts.delete(id);resolveAfter.delete(id);openReplies.delete(id);
    if(slot){slot.replaceChildren();slot.hidden=true;}
    if(focus)node?.querySelector(`[data-reply="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  }
  pager=createThreadPager(repository,task,{
    pinned:()=>new Set([...expanded,...openReplies,...[...drafts].filter(([,text])=>text.trim()).map(([id])=>id),...busy]),
    onChange:state=>{
      pageLoading=state.loading;canLoadMore=!!state.nextCursor;
      if(!pageLoading){items=state.items;total=state.total;unresolved=state.unresolved;}
      else if(!items.length)announce('Загрузка обсуждений');
      draw();
    },onError:cause=>fail(cause)
  });
  async function reload(){clearError();return pager.reload();}
  async function resolve(id,next){
    const thread=items.find(item=>item.id===id);if(!thread||busy.has(id))return;
    busy.add(id);draw();clearError();
    try{
      const cached=fullThreads.get(id),current=cached&&cached.revision===thread.revision?cached:await repository.read('threads',id,task.projectId);
      if(!current)throw Error('Обсуждение недоступно.');
      const saved=await resolveThread(repository,{...current,revision:thread.revision},next);
      fullThreads.set(saved.id,saved);pager.remember(saved);markSeen(saved);expanded.delete(id);resolveAfter.delete(id);
      pendingFocus=`.iq-thread[data-thread="${CSS.escape(id)}"] ${next?'[data-thread-toggle]':'[data-resolve]'}`;
      announce(next?'Вопрос отмечен решённым':'Вопрос снова открыт');
    }catch(cause){fail({message:next?'Не удалось отметить вопрос решённым.':'Не удалось открыть вопрос снова.'},null);}
    finally{busy.delete(id);await reload();}
  }
  // A comment that turns out to need an answer becomes a question (it moves up and gets "Отметить решённым");
  // a question that needs no decision becomes a comment. A resolved question keeps its kind.
  async function changeKind(id,question){
    const thread=items.find(item=>item.id===id);if(!thread||busy.has(id)||thread.resolved)return;
    busy.add(id);draw();clearError();
    try{
      const cached=fullThreads.get(id),current=cached&&cached.revision===thread.revision?cached:await repository.read('threads',id,task.projectId);
      if(!current)throw Error('Обсуждение недоступно.');
      const saved=await changeThreadKind(repository,{...current,revision:thread.revision},question);
      fullThreads.set(saved.id,saved);pager.remember(saved);
      pendingFocus=`.iq-thread[data-thread="${CSS.escape(id)}"] ${question?'[data-resolve]':'[data-reply]'}`;
      announce(question?'Комментарий стал вопросом':'Вопрос стал комментарием');
    }catch(cause){fail({message:cause.message||'Не удалось изменить тип обсуждения.'},null);}
    finally{busy.delete(id);await reload();}
  }
  root.addEventListener('iq-editor-action',event=>{
    if(readOnly)return;const editor=event.target;
    if(editor===composer&&event.detail.id==='question'){event.stopPropagation();asQuestion=event.detail.pressed;syncComposer();return;}
    const id=editor.dataset?.replyEditor;
    if(id&&event.detail.id==='resolve-after'){event.stopPropagation();resolveAfter.set(id,event.detail.pressed);syncReplyActions(id);}
  },{signal:abort.signal});
  root.addEventListener('iq-cancel',event=>{
    const id=event.target.dataset?.replyEditor;if(!id)return;
    event.preventDefault();event.stopPropagation();closeReply(id);
  },{signal:abort.signal});
  root.addEventListener('iq-change',event=>{const id=event.target.dataset?.replyEditor;if(id)drafts.set(id,event.target.value);},{signal:abort.signal});
  root.addEventListener('iq-submit',async event=>{
    if(readOnly)return;event.stopPropagation();
    const editor=event.target,id=editor.dataset.replyEditor||'new';if(busy.has(id))return;
    // Sending: a second Enter is ignored at once; the editor locks only after 150 ms, so a fast send never flickers,
    // and its send button shows the DS pending state meanwhile (action feedback, vnext.35).
    busy.add(id);clearError();editor.setAttribute('aria-busy','true');
    const lock=setTimeout(()=>{if(busy.has(id))editor.disabled=true;},FEEDBACK_TIMING.pending);
    try{
      const body=editor.value;
      if(id==='new'){
        pendingNew ||= {threadId:uid('thread'),messageId:uid('message')};
        const question=asQuestion,saved=await postMessage(repository,task,{...pendingNew,body,requiresResolution:question});
        settle(pendingNew.messageId);pendingNew=null;asQuestion=false;
        fullThreads.set(saved.id,saved);pager.remember(saved);markSeen(saved);
        editor.disabled=false;editor.reset();syncComposer();
        announce(question?'Вопрос опубликован':'Комментарий отправлен');
        requestAnimationFrame(()=>root.querySelector(`.iq-thread[data-thread="${CSS.escape(saved.id)}"]`)?.scrollIntoView?.({block:'nearest'}));
      }else{
        if(!replyIds.has(id))replyIds.set(id,uid('message'));
        const thread=items.find(item=>item.id===id),andResolve=!!thread&&isOpen(thread)&&(event.detail.alternate||!!resolveAfter.get(id));
        const saved=await postMessage(repository,task,{threadId:id,messageId:replyIds.get(id),body});
        settle(replyIds.get(id));fullThreads.set(saved.id,saved);pager.remember(saved);markSeen(saved);replyIds.delete(id);drafts.delete(id);
        editor.disabled=false;editor.value='';expanded.add(id);announce('Ответ отправлен');
        if(andResolve){busy.delete(id);closeReply(id,{focus:false});await resolve(id,true);return;}
        editor.expand?.();
      }
      await reload();
    }catch(cause){fail({message:`Не удалось отправить. Текст сохранён.${cause?.code==='NETWORK'?' Нет связи с сервером.':''}`},`data-retry-send="${esc(id)}"`);}
    finally{clearTimeout(lock);busy.delete(id);editor.removeAttribute('aria-busy');if(editor.isConnected)editor.disabled=false;}
  },{signal:abort.signal});
  root.addEventListener('click',async event=>{
    const target=event.target;
    if(target.closest('[data-more-threads]')){clearError();await pager.more();return;}
    if(target.closest('[data-retry-threads]')){await reload();return;}
    // «Повторить» after a failed send sends the kept text again, with the same message id (safe to repeat).
    const resend=target.closest('[data-retry-send]');
    if(resend){const id=resend.dataset.retrySend,editor=id==='new'?composer:root.querySelector(`[data-reply-editor="${CSS.escape(id)}"]`);
      clearError();editor?.dispatchEvent(new CustomEvent('iq-submit',{bubbles:true,detail:{}}));return;}
    const retry=target.closest('[data-retry-thread]');if(retry){detailErrors.delete(retry.dataset.retryThread);fullThreads.delete(retry.dataset.retryThread);draw();return;}
    const toggle=target.closest('[data-thread-toggle]');
    if(toggle){const id=toggle.dataset.threadToggle;if(expanded.has(id))expanded.delete(id);else{expanded.add(id);markSeen(items.find(item=>item.id===id));}draw();return;}
    const older=target.closest('[data-older-replies]');if(older){olderShown.add(older.dataset.olderReplies);draw();return;}
    const reply=target.closest('[data-reply]');if(reply&&!readOnly){openReply(reply.dataset.reply);return;}
    const kind=target.closest("[data-thread-kind]");if(kind&&!readOnly){await changeKind(kind.dataset.threadKind,kind.dataset.threadKindValue==="question");return;}
    const button=target.closest('[data-resolve]');if(!button||readOnly)return;
    const thread=items.find(item=>item.id===button.dataset.resolve);if(thread)await resolve(thread.id,!thread.resolved);
  },{signal:abort.signal});
  const unsubscribe=repository.subscribe?.(event=>{if(event.collection==='threads'&&event.projectId===task.projectId&&!closed)reload();});
  reload();
  return {reload,
    async open(id,messageId){
      let thread=items.find(item=>item.id===id);
      if(!thread||messageId){thread=await repository.read('threads',id,task.projectId,{signal:abort.signal});if(closed||!thread||thread.taskId!==task.id)return;fullThreads.set(id,thread);expanded.add(id);pager.remember(thread);await reload();}
      expanded.add(id);markSeen(thread);draw();
      const node=root.querySelector(`[data-thread="${CSS.escape(id)}"]`),message=messageId?node?.querySelector(`[data-message="${CSS.escape(messageId)}"]`):null;(message||node)?.scrollIntoView({block:'center'});node?.querySelector('button')?.focus({preventScroll:true});
    },
    dirty(){return asQuestion||!!composer?.value.trim()||[...drafts.values()].some(value=>value.trim());},
    isBusy:()=>busy.size>0,
    destroy(){closed=true;unsubscribe?.();abort.abort();pager.destroy();for(const value of detailRequests.values())value.controller.abort();detailRequests.clear();fullThreads.clear();}};
}
