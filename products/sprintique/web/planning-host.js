import {operationDialog,formDialog} from '../ui/planning/src/dialog.js';
import {intentDialog,releaseFields,readReleaseFields} from '../ui/planning/src/release-dialogs.js';
import {openTaskDialog} from '../ui/src/board/task-dialog.js';
import {taskKey} from '../ui/src/board/task-route.js';

/** Shared host confirmation used by task forms on either surface. */
export function confirmPlanningChange(adapter,intent){
  return new Promise((resolve,reject)=>{
    let result=null;
    operationDialog({adapter,projectId:adapter.projectId,intent,title:'Проверить изменение задачи',onCommitted:r=>{result=r;},onClose:()=>result?resolve(result):reject(Error('Изменение не подтверждено. Данные формы сохранены.'))});
  });
}
export async function recoverPlanningAttempt(adapter){
  const pending=adapter.pending();if(!pending)return;
  return new Promise(resolve=>formDialog({title:'Проверим последнее изменение',body:'<p>Предыдущая отправка не получила подтверждённого результата. Проверим её перед новой работой.</p>',submitLabel:'Проверить результат',canClose:()=>!adapter.pending(),
    submit:async(_form,modal)=>{const result=await adapter.receipt({idempotencyKey:pending.key});if(result.state==='uncertain')throw Error('Результат пока неизвестен. Повторите проверку.');if(result.state==='rejected')modal.fail(result.message);return true;},onClose:resolve}));
}
export async function mountPlanningHost(root,{repository,adapter,project,onOpenBoard,viewState={}}){
  const {mountPlanning}=await import('../ui/planning/src/index.js');
  let closed=false,modal=null,mounted;
  const scoped=Object.create(repository);scoped.createInBoard=false;
  async function openTask(id,{onChanged=()=>mounted?.reload(),onClose=()=>{},groupId='backlog',fromRoute=false}={}){
    if(closed||modal)return false;
    const task=id?await repository.read('tasks',id,project.id):null;
    if(id&&!task)throw Error('Задача недоступна.');if(closed)return false;
    modal=await openTaskDialog(task,{repository:scoped,project,tasks:[],attachmentAdapter:repository.attachmentAdapter,canEdit:project.role!=='reader',canManage:project.role==='admin',initialValues:{releaseId:groupId==='backlog'?null:groupId},
      isActive:()=>!closed,onSaved:onChanged,onOpenTask:async next=>{if(await closeTask())await openTask(next);}});
    const opened=modal;if(task&&!fromRoute)history.pushState(null,'','#/task/'+encodeURIComponent(taskKey(task)));
    opened.addEventListener('iq-close',()=>{if(modal===opened)modal=null;if(/^#\/?task\//.test(location.hash))history.replaceState(null,'','#planning');onClose();},{once:true});
    return opened;
  }
  async function closeTask(){if(modal)return modal.taskController.close();return !mounted||mounted.readyToLeave();}
  mounted=await mountPlanning(root,{adapter,project,viewState,onOpenBoard,
    onOpenTask:(id,callbacks)=>openTask(id,callbacks),onCreateTask:options=>openTask(null,options),
    onCreateRelease:async({onChanged,onClose})=>{const defaults=await adapter.settings();return intentDialog({adapter,projectId:project.id,title:'Новый релиз',body:releaseFields(defaults),readIntent:form=>({kind:'createRelease',values:readReleaseFields(form)}),onCommitted:onChanged,onClose});}});
  return {openTask,closeTask,reload:()=>mounted.reload(),readyToLeave:()=>!modal&&mounted.readyToLeave(),destroy(){closed=true;modal?.close(true);modal=null;mounted.destroy({force:true});}};
}
