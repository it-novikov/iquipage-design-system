import {PROTOCOL} from '../src/model.js';
import {TASK_COLUMNS} from '../../maps/src/tasks.js';
export const project={id:'pn-project',name:'Sprintique · Новый продукт',key:'SPR'};
export const revisionInput=s=>JSON.stringify([s.tasks,s.releases].map(list=>list.map(x=>[x.id,x.revision]).sort((a,b)=>a[0].localeCompare(b[0]))));
export async function revision(s){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(revisionInput(s)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function memberships(tasks){
  const index=new Map(tasks.map(t=>[t.id,t])),cache=new Map();
  function find(task,seen=new Set()){
    if(cache.has(task.id))return cache.get(task.id);if(seen.has(task.id))throw Error('Цикл в тестовой иерархии.');seen.add(task.id);
    const mode=task.releaseAssignment||(task.releaseId?'assigned':task.parentId?'inherit':'none');
    const value=mode==='none'?null:mode==='assigned'?task.releaseId||null:task.parentId&&index.has(task.parentId)?find(index.get(task.parentId),seen):null;
    cache.set(task.id,value);return value;
  }
  for(const task of tasks)find(task);return cache;
}
const date=value=>value?new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'';
const priority={critical:0,high:1,normal:2,low:3};
export function compare(sort){return(a,b)=>(sort==='priority'?(priority[a.priority]-priority[b.priority]):sort==='date'?((a.due||'9999').localeCompare(b.due||'9999')):((a.planningRank??a.rank)-(b.planningRank??b.rank)))||a.id.localeCompare(b.id);}
export function matches(task,query,preparation,groupMatches=false){return (preparation==='all'||task.preparation===preparation)&&(!query||groupMatches||`${task.title} ${task.displayId||''} ${task.owner}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));}
export function summaries(snapshot,{query='',preparation='all'}={}){
  const tasks=snapshot.tasks.filter(t=>!t.archivedAt),member=memberships(tasks);
  const releases=snapshot.releases.filter(r=>!r.archivedAt&&r.status!=='released').sort((a,b)=>(a.planningPhase==='active'?0:1)-(b.planningPhase==='active'?0:1)||(a.targetDate||'9999').localeCompare(b.targetDate||'9999')||a.id.localeCompare(b.id));
  const groups=releases.map(r=>({id:r.id,title:r.name,state:r.planningPhase==='active'?'active':'planned',formatLabel:r.planningFormat==='timeboxed'?'Спринт':'',dateLabel:date(r.targetDate)}));
  groups.push({id:'backlog',title:'Без релиза — бэклог',state:'backlog',dateLabel:'',formatLabel:''});
  return groups.map(g=>{const owned=tasks.filter(t=>(member.get(t.id)||'backlog')===g.id),inTitle=!!query&&g.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'));return {...g,total:owned.length,matched:owned.filter(t=>matches(t,query,preparation,inTitle)).length};}).filter(g=>!query||g.matched>0||g.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
}
export function rows(snapshot,{groupId,query='',preparation='all',sort='planned',collapsedTaskIds=[]}){
  const tasks=snapshot.tasks.filter(t=>!t.archivedAt),index=new Map(tasks.map(t=>[t.id,t])),member=memberships(tasks),own=tasks.filter(t=>(member.get(t.id)||'backlog')===groupId),ownIds=new Set(own.map(t=>t.id));
  const release=snapshot.releases.find(r=>r.id===groupId),title=release?.name||'Без релиза — бэклог';
  const filter=!!query||preparation!=='all',groupMatches=!!query&&title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'));
  const matched=new Set(own.filter(t=>matches(t,query,preparation,groupMatches)).map(t=>t.id)),included=new Set(matched);
  for(const id of matched){let p=index.get(id)?.parentId;const seen=new Set();while(p&&ownIds.has(p)&&!seen.has(p)){seen.add(p);included.add(p);p=index.get(p)?.parentId;}}
  const children=new Map();for(const task of own){const parent=ownIds.has(task.parentId)?task.parentId:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(task);}
  for(const list of children.values())list.sort(compare(sort));
  const flat=[],collapsed=new Set(collapsedTaskIds),stack=(children.get(null)||[]).map(t=>({t,depth:0})).reverse();
  while(stack.length){const {t,depth}=stack.pop();if(!included.has(t.id))continue;const descendants=children.get(t.id)||[],contextOnly=!matched.has(t.id);
    flat.push({id:groupId+'/'+t.id,taskId:t.id,key:t.displayId||t.id,title:t.title,type:t.type||'task',priority:t.priority||'normal',preparation:t.preparation||'ready',statusLabel:TASK_COLUMNS.find(s=>s.id===t.status)?.label||t.status,ownerLabel:t.owner||'',dateLabel:date(t.due),depth,childrenCount:descendants.length,contextOnly,selectable:!contextOnly,parentContext:t.parentId&&!ownIds.has(t.parentId)&&index.has(t.parentId)?`Часть ${index.get(t.parentId).displayId||t.parentId} · в другом релизе`:null});
    if(filter||!collapsed.has(t.id))for(const child of [...descendants].reverse())stack.push({t:child,depth:depth+1});
  }
  return flat;
}
export function page(list,cursor,limit){const offset=cursor?Number(cursor):0;if(!Number.isSafeInteger(offset)||offset<0||offset>list.length)throw Error('Некорректная страница.');return {items:list.slice(offset,offset+limit),nextCursor:offset+limit<list.length?String(offset+limit):null};}
export {PROTOCOL};
