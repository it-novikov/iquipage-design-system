/** A sprint is a timeboxed release. Inherited membership is the effective context. */
export const taskRelease = task => task && Object.hasOwn(task,'effectiveReleaseId') ? task.effectiveReleaseId : task?.releaseId ?? null;
export function linkCandidates(tasks,{excludeId,releaseId=null,query=''}){
  const q=String(query).trim().toLocaleLowerCase('ru');
  const current=[],other=[],completed=[];
  for(const task of tasks){
    if(task.id===excludeId||task.archivedAt)continue;
    const same=taskRelease(task)===releaseId;
    if(!same&&!q)continue;
    if(q&&!`${task.displayId||''} ${task.title||''}`.toLocaleLowerCase('ru').includes(q))continue;
    const done=task.result==='accepted'||task.status==='ready_for_release'||task.column==='ready_for_release';
    (done?completed:same?current:other).push(task);
  }
  completed.sort((a,b)=>Number(taskRelease(b)===releaseId)-Number(taskRelease(a)===releaseId));
  return {current,other,completed};
}
