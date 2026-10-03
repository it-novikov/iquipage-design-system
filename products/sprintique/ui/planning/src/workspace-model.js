/** A view of the loaded plan. Never changes a container's summary, order or task identity. */
export function filterPlan(containers,{scope='all',query=''}={}){
  const needle=query.trim().toLocaleLowerCase('ru-RU');
  const scoped=scope==='all'?containers:containers.filter(c=>c.id===scope);
  if(!needle)return {containers:scoped,matches:null,ancestorIds:new Set()};
  let matches=0;const ancestorIds=new Set();
  const result=scoped.map(c=>{
    const keep=new Set(),byId=new Map(c.rows.map(r=>[r.id,r]));
    for(const row of c.rows){
      if(!`${row.key} ${row.title}`.toLocaleLowerCase('ru-RU').includes(needle))continue;
      matches++;keep.add(row.id);
      const visited=new Set([row.id]);let parent=byId.get(row.parentId);
      while(parent&&!visited.has(parent.id)){visited.add(parent.id);keep.add(parent.id);ancestorIds.add(parent.id);parent=byId.get(parent.parentId);}
    }
    return {...c,rows:c.rows.filter(r=>keep.has(r.id))};
  }).filter(c=>c.rows.length);
  return {containers:result,matches,ancestorIds};
}
