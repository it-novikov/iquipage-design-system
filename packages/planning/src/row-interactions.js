import {bindRowDrag} from '@iquipage/work-list';
/** Product placement rules remain outside the generic DS interaction controller. */
export function planningDrop(controller,id,groupId,beforeId=null){
  const own=controller.groups.find(g=>g.rows.some(r=>r.taskId===id&&!r.contextOnly));
  const row=own?.rows.find(r=>r.taskId===id),target=controller.groups.find(g=>g.id===groupId);
  if(!row?.selectable||!target||['accepted','cancelled'].includes(row.outcome)||['closed','cancelled'].includes(target.state))return null;
  if(own.id!==target.id)return controller.capabilities.move?{groupId,beforeId:null,label:target.title+' — проверить состав'}:null;
  if(controller.filters.sort!=='planned'||!controller.capabilities.reorder)return null;
  const before=beforeId?target.rows.find(r=>r.taskId===beforeId&&!r.contextOnly):null;
  if(beforeId===id||beforeId&&(!before||(before.parentId||null)!==(row.parentId||null)))return null;
  return {groupId,beforeId:before?.taskId||null,label:before?'Перед '+before.key:'В конец задач этого уровня'};
}
export function mountPlanningDrag(root,scroll,controller,{locked,onDrop,onState}){
  let revision=null;
  return bindRowDrag({root,scrollRoot:scroll,
    source:id=>{if(locked())return null;const group=controller.groups.find(g=>g.rows.some(r=>r.taskId===id&&!r.contextOnly));const row=group?.rows.find(r=>r.taskId===id);
      return row?.selectable&&!['accepted','cancelled'].includes(row.outcome)?{id,label:row.key+' · '+row.title}:null;},
    resolve:(source,groupId,beforeId)=>locked()?null:planningDrop(controller,source.id,groupId,beforeId),
    targets:source=>controller.groups.flatMap(g=>{const positions=g.rows.filter(r=>!r.contextOnly).map(r=>r.taskId);positions.push(null);return positions.map(id=>planningDrop(controller,source.id,g.id,id)).filter(Boolean);}).filter((t,i,a)=>a.findIndex(x=>x.groupId===t.groupId&&x.beforeId===t.beforeId)===i),
    commit:(source,target)=>{const original=controller.groups.find(g=>g.rows.some(r=>r.taskId===source.id));if(!original)return;
      const intent=original.id===target.groupId?{kind:'reorder',taskIds:[source.id],beforeId:target.beforeId}:{kind:'move',taskIds:[source.id],groupId:target.groupId};
      onDrop({...intent,expectedProjectionRevision:revision});},
    onState:active=>{if(active)revision=controller.revision;onState(active);}
  });
}
