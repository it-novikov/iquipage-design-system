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
