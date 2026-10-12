/** Narrative presentation only. Stored text stays intact in the work plan and its export. */
export function workText(value){
 return String(value||'').replace(/\r/g,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/`([^`]+)`/g,'$1').split(/\n\s*\n/).map(paragraph=>paragraph.split('\n').map(line=>line.trim().replace(/^#{1,6}\s+/,'').replace(/^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/,'')).filter(Boolean).join(' ')).filter(Boolean).join('\n\n');
}
export const workStates={awaiting_agent:'Ожидает агента',queued:'В очереди',running:'В работе',waiting:'Ждёт ответа',completed:'Работа завершена',failed:'Работа прервалась',cancelled:'Остановлен',handed_off:'Передан другому агенту'};
export const stepStates={todo:'Предстоит',doing:'В работе',done:'Готово',blocked:'Нужен ответ',dropped:'Снят'};
export const activeSession=s=>['awaiting_agent','queued','running','waiting'].includes(s?.state);
export function sessionSentence(s){
 if(!s)return '';
 const name=s.agentName||'Агент';
 if(s.stopRequested)return `${name} завершает текущий шаг. Запрошена остановка.`;
 if(s.state==='awaiting_agent')return `Поручение передано агенту «${name}». Он ещё не принял работу.`;
 if(s.state==='running')return `${name} работает над задачей.`;
 if(s.state==='queued')return `${name} начнёт работу, когда освободится исполнитель.`;
 if(s.state==='waiting')return `${name} ждёт ответа, чтобы продолжить.`;
 if(s.state==='completed')return `${name} завершил работу. Результат можно проверить.`;
 if(s.state==='cancelled')return `Работа агента «${name}» остановлена. Уже сохранённые изменения остались в задаче.`;
 if(s.state==='handed_off')return `${name} передал работу дальше.`;
 return `Работа агента «${name}» прервалась. Сохранённый результат доступен ниже.`;
}
export function uniqueEntries(previous,incoming){const seen=new Set(previous.map(x=>x.id));return [...previous,...incoming.filter(x=>!seen.has(x.id))];}

/** One next action; detail belongs in the plan, never in the task overview. */
export function workFocus(state){
 const plan=state?.workPlan;
 const question=plan?.questions?.find(q=>q.state==='open');if(question)return {kind:'question',item:question};
 const review=plan?.steps?.find(s=>s.state==='done'&&!['approved','rejected'].includes(s.approval));if(review)return {kind:'review',item:review};
 const step=plan?.steps?.find(s=>s.state==='doing'||s.state==='blocked'||s.approval==='rejected');if(step)return {kind:'step',item:step};
 const session=state?.sessions?.find(activeSession)||state?.sessions?.[0];
 if(session?.state==='completed')return {kind:'complete',text:workText(session.summary||plan?.checkpoint?.summary)||'Работа завершена.'};
 if(plan?.checkpoint?.nextStep)return {kind:'next',text:workText(plan.checkpoint.nextStep)};
 return {kind:plan?'ready':'empty'};
}

/** Literal start of a stored step result for the Task overview (PF04): never a summary, never HTML. */
export function workResultPreview(result,limit=160){
 const text=workText(result).replace(/\s+/g,' ').trim();
 if(!text)return {label:'Результат шага',text:'Описание результата не добавлено',empty:true,truncated:false};
 const chars=[...text];if(chars.length<=limit)return {label:'Результат шага',text,empty:false,truncated:false};
 let cut=chars.slice(0,limit).join('');const space=cut.lastIndexOf(' ');if(space>limit*0.6)cut=cut.slice(0,space);
 return {label:'Начало результата',text:cut.replace(/[\s.,;:–—-]+$/,'')+'…',empty:false,truncated:true};
}

/** Task overview excerpt budget (vt1-compact, PR #82): keeps due date and priority on the 390px first screen; not a line-count guarantee. */
export const OVERVIEW_RESULT_LIMIT=64;

/** Overview context is explicit even when a question takes precedence over the session status. */
export function workOverview(state){
 const focus=workFocus(state),session=state?.sessions?.find(activeSession)||state?.sessions?.[0],permissions=state?.permissions||{};
 const context=['Работа агента',session?.agentName].filter(Boolean).join(' · ');
 if(focus.kind==='question')return {context,headline:[permissions.canAnswer?'Нужно ваше решение':'Агент ждёт ответа',session?.agentName].filter(Boolean).join(' · '),status:permissions.canAnswer?'Нужно ваше решение':'Агент ждёт ответа',text:focus.item.title,action:'question:'+focus.item.id,label:permissions.canAnswer?'Ответить агенту':'Открыть вопрос',attention:!!permissions.canAnswer};
 if(focus.kind==='review')return {context,headline:['Результат на проверке',session?.agentName].filter(Boolean).join(' · '),status:'Результат на проверке',text:focus.item.title,result:workResultPreview(focus.item.result,OVERVIEW_RESULT_LIMIT),action:'review:'+focus.item.id,label:'Проверить результат',attention:true};
 if(!state?.workPlan)return {context,status:'',text:'Поручите агенту работу по этой задаче.',action:permissions.canAssign?'assign':'open',label:permissions.canAssign?'Поручить агенту':'Открыть работу',attention:false};
 return {context,status:session?workStates[session.state]||'Работа прервалась':'План готов',text:focus.kind==='step'?focus.item.title:'',action:'open',label:'Открыть работу',attention:false};
}

/** A draft keeps the revision first read by its author; polling never silently rebases it. */
export function createWorkAnswers(){
 const drafts=new Map();
 return {get:id=>drafts.get(id),entries:()=>[...drafts],
  edit(id,fields,revision){const draft={...fields,revision:drafts.get(id)?.revision??revision};drafts.set(id,draft);return draft;},
  review(id,question,revision){const draft=drafts.get(id);if(draft){draft.revision=revision;if(draft.selected!=='__other'&&!question?.options?.some(o=>o.id===draft.selected))draft.selected='';}},
  delete:id=>drafts.delete(id),dirty:()=>[...drafts.values()].some(d=>d.selected||d.answer?.trim())};
}

/** All entry points share a gate so a slow chooser or command cannot be opened twice. */
export function createWorkActionGate(){
 let pending=false;
 return {pending:()=>pending,async run(action){if(pending)return;pending=true;try{return await action();}finally{pending=false;}}};
}
