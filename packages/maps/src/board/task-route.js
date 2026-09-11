export const taskKey=task=>task.displayId||task.id;
export function taskURL(task){const url=new URL(location.href);url.searchParams.delete('task');url.searchParams.delete('map');url.hash='/task/'+encodeURIComponent(taskKey(task));return url.href;}
export function parseTaskRoute(hash){const match=/^#?\/?task\/([^/?#]+)$/.exec(hash);if(!match)return null;try{return decodeURIComponent(match[1]);}catch{return null;}}
export function allocateTaskKey(task,previous,tasks){
  if(previous?.displayId)return {...task,displayId:previous.displayId};
  if(task.displayId)return task;
  const peers=tasks.filter(t=>t.projectId===task.projectId),prefix=peers.map(t=>/^([A-Z][A-Z0-9]{1,11})-\d+$/.exec(t.displayId||'')?.[1]).find(Boolean)||'SPR';
  const number=peers.reduce((max,t)=>Math.max(max,Number(new RegExp('^'+prefix+'-(\\d+)$').exec(t.displayId||'')?.[1])||0),0)+1;
  return {...task,displayId:prefix+'-'+number};
}
