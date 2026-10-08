// What a row's controls do (design-v2 §11.3). Each command goes to the server with the revision the row carries; the
// row then shows what happened with «Отменить» for 8 s (role=status), focus moves to the next row, and the view
// reloads. A conflict or a refusal is said in words on the row; nothing is changed on screen before the server agrees.
import {icon,escapeHTML as esc,notify,FEEDBACK_TIMING} from '@iquipage/web/core';
import {failed} from '../../ui/src/action-feedback.js';
import {dialog} from '../../ui/src/ui.js';
import {duePresets,localDay,snoozePresets,verbOf,doneWord} from './model.js';
import {focusRow} from './keyboard.js';
import {hold,isPending,release} from './pending.js';

const UNDO_MS=8000;

export function createActions({api,repository,view,projects,filter,openTask,openProject,announce}){
  const pending=new Map();// row key → timer of its undo line

  /**
   * The whole task written with the fields changed (the same write the drawer makes), against the revision the person
   * saw: when the task changed meanwhile, nothing is written and the row says so (CAS, review R4 F2).
   */
  async function writeTask(projectId,taskId,changes,expected){
    const project=projects.get(projectId);if(!project)throw Error('Проект недоступен.');
    const task=await repository.read('tasks',taskId,projectId);
    if(!task)throw Error('Задача недоступна.');
    if(task.revision!==expected)throw Object.assign(Error('Задачу уже изменили.'),{code:'CONFLICT'});
    const previous=Object.fromEntries(Object.keys(changes).map(k=>[k,task[k]]));
    const saved=await repository.write('tasks',{...task,...changes},expected);
    return {saved,previous};
  }
  function next(li){
    const list=li.closest('[data-list]'),rows=list?[...list.querySelectorAll(':scope > [data-row]')]:[];
    const i=rows.indexOf(li);return rows[i+1]||rows[i-1]||null;
  }
  /**
   * The row says what happened and offers «Отменить» for 8 s; the focus moves on. `undo` puts it back. The view
   * reloads when the time is over or after an undo.
   */
  /**
   * `commit`: an action that is only sent when the undo time is over (an approval cannot be taken back on the server,
   * so it waits here instead); leaving the view sends it at once.
   */
  function settle(li,{text,undo=null,commit=null,leave=null,requestId=null,tone='success'}){
    const key=li.dataset.key,following=next(li),wasFocused=li.dataset.hadFocus==='true'||li.contains(document.activeElement);
    const list=li.closest('[data-list]');
    const entry={text,undo:undo||(commit?()=>null:null),commit,requestId,tone,timer:null,node:li,section:list?.closest('section[id]')?.id||null,index:list?[...list.children].indexOf(li):-1};
    clearTimeout(pending.get(key)?.timer);
    // A waiting decision is sent once: by its timer, on leaving the view or the page, never twice.
    let sent=false;
    const send=async()=>{if(sent)return;sent=true;clearTimeout(entry.timer);pending.delete(key);if(requestId)release(requestId);
      if(commit)try{await commit();}catch(error){fail(li,error);}};
    entry.send=send;
    entry.timer=setTimeout(()=>void send().then(()=>view.reload()),UNDO_MS);
    pending.set(key,entry);
    // The drawer of the same task can take it back too (review R5 N3); leaving the page asks first (N2).
    if(requestId&&commit)hold(requestId,{leave:()=>{if(sent)return;sent=true;clearTimeout(entry.timer);pending.delete(key);return leave?.();},cancel:()=>{if(sent)return;sent=true;clearTimeout(entry.timer);pending.delete(key);announce('Отменено');void view.reload({focusKey:key});},commit:send});
    paint(li,key,entry);
    if(wasFocused)(following?focusRow(following):view.focusSection(li));
  }
  /** The row's "done" state and its line; painted again after any re-render while the undo is still open. */
  function paint(li,key,entry){
    li.dataset.state='done';li.removeAttribute('tabindex');li.querySelector('.dsk-row-done')?.remove();
    const line=document.createElement('div');line.className='dsk-row-done';line.setAttribute('role','status');line.dataset.tone=entry.tone;
    line.innerHTML=`${icon(entry.tone==='success'?'checkCircle':'info',16)}<span>${entry.text}</span>${entry.undo?'<button type="button" class="iq-btn ghost sm" data-undo>Отменить</button>':''}`;
    li.append(line);
    line.querySelector('[data-undo]')?.addEventListener('click',()=>void(async()=>{
      const open=pending.get(key);if(!open)return;
      clearTimeout(open.timer);pending.delete(key);if(open.requestId)release(open.requestId);line.querySelector('[data-undo]').disabled=true;
      try{if(!entry.commit)await entry.undo();announce('Отменено');}catch(error){fail(li,error);}
      await view.reload({focusKey:key});
    })());
  }
  function fail(li,error){
    const conflict=['CONFLICT','REQUEST_CHANGED','REQUEST_CLOSED'].includes(error?.code);
    // A plain failure is said next to the pressed control with «Повторить» (action feedback); a conflict stays a toast.
    if(conflict)notify({tone:'warning',message:'Уже изменено в другом месте',description:'Рабочий стол обновлён: посмотрите, что изменилось.'});
    else failed(error?.message?error:{message:'Сервер не ответил.'},{message:'Не получилось'});
    if(conflict)void view.reload({focusKey:li?.dataset.key});
  }
  async function run(li,body){
    // One command per row at a time: a second press (J twice, E and a click) waits for nothing and sends nothing.
    if(li.dataset.running||li.dataset.state==='done')return;li.dataset.running='';
    // The row looks busy only after 150 ms (action feedback): a fast answer never dims it. Disabling the pressed control
    // drops the focus: remember it, so the next row receives it afterwards.
    let controls=[];
    const dim=setTimeout(()=>{li.dataset.hadFocus=String(li.contains(document.activeElement));
      controls=[...li.querySelectorAll('button')].filter(c=>!c.disabled);for(const c of controls)c.disabled=true;li.setAttribute('aria-busy','true');},FEEDBACK_TIMING.pending);
    // On failure only the controls this command disabled come back; the ones disabled by their row stay so.
    try{await body();}catch(error){clearTimeout(dim);for(const c of controls)c.disabled=false;if(li.dataset.hadFocus==='true')focusRow(li);fail(li,error);}finally{clearTimeout(dim);li.removeAttribute('aria-busy');delete li.dataset.hadFocus;delete li.dataset.running;}
  }
  /** A date from a small form dialog; null when the person closes it. */
  const pickDate=(title,label)=>new Promise(resolve=>{
    let chosen=null;
    const el=dialog({title,body:`<iq-date-field name="date" label="${esc(label)}" required></iq-date-field>`,submitLabel:'Сохранить',
      onSubmit:async(_values,form)=>{const value=form.querySelector('iq-date-field[name=date]').value;if(!value)throw Error('Выберите дату.');chosen=value;}});
    el.addEventListener('iq-close',()=>resolve(chosen),{once:true});
  });

  return {
    /** The verb of a request: review, approve and do resolve here; a question or a decision opens the drawer. */
    verb(li,row){
      const verb=verbOf(row);
      if(!verb.inline){openTask(row,{answer:true});return;}
      return run(li,async()=>{
        if(row.action.kind==='approve'&&row.request.approvalId){
          if(isPending(row.request.id)){announce('Решение уже ждёт: отменить его можно в течение 8 секунд');return;}
          // Decided against the revision the request was made on (review R4 F3), after the undo time.
          const base=row.request.sourceRevision??(await api.approval(row.projectId,row.request.approvalId)).revision;
          settle(li,{text:`<b>${esc(doneWord.approve)}</b> · ${esc(row.displayId)}`,requestId:row.request.id,commit:()=>api.decide(row.projectId,row.request.approvalId,base,'approved'),
            leave:()=>api.decideOnLeave(row.projectId,row.request.approvalId,base,'approved')});return;
        }
        const resolved=await api.resolveRequest(row.projectId,row.request.id,row.request.revision);
        settle(li,{text:`<b>${esc(doneWord[row.action.kind]||'решено')}</b> · ${esc(row.displayId)} · запрос закрыт`,
          undo:()=>api.reopenRequest(row.projectId,row.request.id,resolved.revision)});
      });
    },
    snooze(li,row,index){
      const preset=snoozePresets(row.request?.neededBy)[index];if(!preset)return;
      return run(li,async()=>{
        const state=await api.personal(row.projectId,row.taskId);
        const saved=await api.snooze(row.projectId,row.taskId,state.snoozeRevision,preset.until.toISOString());
        settle(li,{text:`Отложено: ${esc(preset.label.toLowerCase())}`,tone:'info',undo:()=>api.snooze(row.projectId,row.taskId,saved.revision,null)});
      });
    },
    /** «Готово» / «На проверку»: the next stage of the workflow, by the task write; undo writes the stage back. */
    complete(li,row){
      const move=row.active?.transition;if(!move||row.active.cannotComplete)return;
      return run(li,async()=>{
        const {saved,previous}=await writeTask(row.projectId,row.taskId,{status:move.toStatusId},row.taskRevision);
        settle(li,{text:`<b>${esc(move.label)}</b> · ${esc(row.displayId)}`,undo:()=>writeTask(row.projectId,row.taskId,previous,saved.revision)});
      });
    },
    async due(li,row,choice){
      let date=null;
      if(choice==='pick'){date=await pickDate(`Срок ${row.displayId}`,'Новый срок');if(!date)return;}
      else if(choice!=='none')date=duePresets(localDay())[Number(choice)]?.date;
      return run(li,async()=>{
        const {saved,previous}=await writeTask(row.projectId,row.taskId,{due:date},row.taskRevision);
        settle(li,{text:date?`Срок перенесён на ${esc(date.slice(8,10)+'.'+date.slice(5,7))} · виден всем в проекте`:'Срок снят',tone:'info',
          undo:()=>writeTask(row.projectId,row.taskId,previous,saved.revision)});
      });
    },
    async checkBack(li,row,choice){
      let date=null;const today=localDay();
      if(choice==='pick'){date=await pickDate(`Проверить ${row.displayId}`,'Когда проверить');if(!date)return;}
      else if(choice==='today')date=today;
      else if(choice!=='none')date=duePresets(today)[Number(choice)]?.date;
      return run(li,async()=>{
        const saved=await api.checkBack(row.projectId,row.taskId,row.personal.checkBackRevision,date);
        announce(date?'Дата проверки сохранена':'Дата проверки снята');void saved;await view.reload({focusKey:row.key});
      });
    },
    /** «Принять»: the done result leaves «Жду»; its completion is taken as seen with it. */
    accept(li,row){
      return run(li,async()=>{
        const accepted=await api.accept(row.projectId,row.taskId,row.personal.acceptRevision,true);
        if(row.updates)await api.seen(row.projectId,row.taskId,row.personal.seenRevision,row.updates.latestSequence).catch(()=>null);
        settle(li,{text:`<b>Результат принят</b> · ${esc(row.displayId)} · вы наблюдаете дальше`,undo:()=>api.accept(row.projectId,row.taskId,accepted.revision,false)});
      });
    },
    rank(li,row,move){
      return run(li,async()=>{
        await api.rank(row.projectId,row.taskId,row.personal.rankRevision,move,filter());
        await view.reload({focusKey:row.key,focusControl:`[data-rank="${move}"]`});
        const moved=view.rowElement(row.key),list=moved?.closest('[data-list]');
        if(moved&&list){const rows=[...list.querySelectorAll(':scope > [data-row]')];announce(`${row.displayId} на позиции ${rows.indexOf(moved)+1} из ${rows.length}`);}
      });
    },
    seen(li,row){
      return run(li,async()=>{
        await api.seen(row.projectId,row.taskId,row.personal.seenRevision,row.updates?.latestSequence??row.latestSequence);
        settle(li,{text:`Просмотрено · ${esc(row.displayId)}`,tone:'info'});
      });
    },
    async seenAll(button,generatedAt){
      button.disabled=true;
      try{const result=await api.seenAll(generatedAt,filter());announce(`Просмотрено: ${result.marked}`);await view.reload();}
      catch(error){fail(null,error);}finally{button.disabled=false;}
    },
    /** Participation from a row: J on the row or «Перестать наблюдать» in its menu, with undo. */
    toggleParticipation(li,row){
      return run(li,async()=>{
        const joining=!row.personal.participating;
        const saved=await api.participation(row.projectId,row.taskId,row.personal.participationRevision,joining);
        if(joining){announce(`Вы наблюдаете: ${row.displayId}`);await view.reload({focusKey:row.key});return;}
        settle(li,{text:`Вы больше не наблюдаете · ${esc(row.displayId)}${row.group==='active'?' · назначенная вам задача остаётся «В работе»':''}`,tone:'info',
          undo:()=>api.participation(row.projectId,row.taskId,saved.revision,true)});
      });
    },
    open:row=>openTask(row),
    openProject:row=>openProject(row.projectId,row.taskId),
    pendingKeys:()=>[...pending.keys()],
    /** After a re-render: rows whose undo is still open show their line again (never lost to another reload). */
    restore(host){
      for(const [key,entry] of pending){
        let li=host.querySelector(`[data-row][data-key="${CSS.escape(key)}"]`);
        if(!li){
          // The row has left its list (a resolved request): its line stays where it was until the undo closes.
          const list=entry.section&&host.querySelector(`#${CSS.escape(entry.section)} [data-list]`);if(!list)continue;
          li=entry.node;list.insertBefore(li,list.children[entry.index]||null);
        }
        paint(li,key,entry);
      }
    },
    /** Leaving the view: the undo lines close, and a decision still waiting for its undo time is sent now. */
    destroy(){for(const entry of [...pending.values()]){clearTimeout(entry.timer);if(entry.commit)void entry.send();}pending.clear();},
  };
}
