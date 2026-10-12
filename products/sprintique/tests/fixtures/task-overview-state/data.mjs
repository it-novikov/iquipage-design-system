// Explicit read scenarios, not an alternate work model or server state machine.
import {tasks,project} from '../tabs-geometry/repository.js';

export const literalResult='История «<em>готово</em> &amp; проверено» сохранена после обновления.';
// Independent Compact oracle: never derived through the product preview helper.
export const literalPreview='История «<em>готово</em> &amp; проверено» сохранена после…';
export const longResult='История остаётся доступной после обновления страницы. Запись «<готово> & проверено» и отметки критериев совпадают с исходным состоянием. Следующий участник видит принятые решения, автора каждого шага и ссылку на результат; передача работы остаётся отдельной проверкой.';

export function scenario(id){
  if(!['completed-rejected','completed-blocked','review-literal','question-no-answer','question-can-answer','genuine-complete','review-long'].includes(id))throw Error('Unknown overview scenario: '+id);
  const task={...structuredClone(tasks[0]),due:'2026-10-16',priority:'high'};
  const step={id:'S1',title:'Проверить сохранение истории',state:'done',approval:'pending',revision:3,
    what:'Повторно открыть задачу после обновления страницы.',how:'Сравнить историю с исходными записями.',why:'Следующий участник должен видеть сохранённую работу.',
    criteria:[{id:'C1',text:'История сохраняется после обновления страницы',done:true}],dependsOn:[],result:literalResult,evidence:[]};
  const work={schema:'bridge/1',revision:6,workPlan:{id:'plan-1',taskId:task.id,projectId:project.id,revision:6,status:'active',risk:'standard',
    goal:'Сохранить историю и передать работу следующему участнику.',scope:'Проверка сохранённого результата.',criteria:[],context:[],extraSections:[],
    steps:[step],questions:[],decisions:[],checkpoint:null,lease:null},
    sessions:[{id:'session-1',agentId:'agent-1',agentName:'Кодекс',mode:'external',state:'completed',
      goal:'Проверить сохранение истории.',summary:'История и передача проверены. Результат принят.',
      startedAt:'2026-10-12T07:00:00Z',endedAt:'2026-10-12T08:00:00Z',canHandoff:false,canStop:false}],
    requests:[],permissions:{canEdit:true,canAssign:false,canDecide:true,canAnswer:true,canStop:false},events:{items:[],nextCursor:null}};
  if(id==='completed-rejected'){
    step.approval='rejected';step.title='Повторить проверку сохранения';
    work.sessions[0].summary='Запуск завершён. Проверку сохранения нужно повторить.';
  }
  if(id==='completed-blocked'){
    step.state='blocked';step.approval='unreviewed';step.title='Получить ответ о передаче';step.result='';step.criteria[0].done=false;
    work.sessions[0].summary='Запуск завершён. Для продолжения нужен ответ.';
  }
  if(id==='genuine-complete')step.approval='approved';
  if(id==='question-no-answer'||id==='question-can-answer'){
    work.permissions.canAnswer=id==='question-can-answer';
    // The pending result deliberately remains: the real product gives the question precedence.
    work.workPlan.questions=[{id:'Q1',state:'open',title:'Кому передать следующий шаг?',
      context:'Сохранение истории проверено. Осталась проверка передачи.',options:[
        {id:'O1',label:'Передать другому участнику',description:'Продолжить по сохранённому состоянию.',recommended:true},
        {id:'O2',label:'Продолжить текущему агенту',description:'Проверить передачу в той же сессии.',recommended:false}],
      threadId:null,answer:'',decision:''}];
  }
  if(id==='review-long'){
    // Same long title/result strings as the earlier diagnostic, now rendered by unchanged PR90 Compact composition.
    task.title='Сохранить историю решений и передать её следующему участнику без потери контекста после обновления страницы';
    step.title='Проверить сохранение истории и отмеченных критериев после повторного открытия задачи';
    step.result=longResult;
  }
  return {id,task,work};
}
