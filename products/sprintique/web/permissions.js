/** Permission rules mirrored from the server (access/domain/Permissions.kt). Pure: no DOM, tested in node.
 *  The server checks every change again; these only keep the editor honest before it asks. */
export const TASKS_READ='tasks.read',PROJECT_ACCESS='project.access';
export const WORKSPACE_PERMISSIONS=['workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings'];
/** Derived project roles of an older session without permissions[]: the system presets they came from. */
const LEGACY={
  admin:['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write','finance.read','finance.write','approvals.decide','agents.manage','members.invite','members.manage','project.settings','project.access'],
  editor:['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write','finance.read','approvals.decide'],
  reader:['tasks.read','threads.write','maps.read','finance.read']};
export const projectPermissions=project=>Array.isArray(project?.permissions)?project.permissions:LEGACY[project?.role]||[];
export const can=(project,permission)=>projectPermissions(project).includes(permission);
export const canWorkspace=(project,permission)=>(project?.workspacePermissions||[]).includes(permission);
/** A string that changes whenever the person's permissions in the project change. */
export const accessSignature=project=>[...projectPermissions(project)].sort().join(',');

/** Catalog groups ({group,permissions:[{id,title,description,includes}]}) as one ordered index. */
export const catalogIndex=groups=>new Map((groups||[]).flatMap(g=>g.permissions.map(p=>[p.id,p])));
export const ordered=(index,ids)=>{const set=new Set(ids);return [...index.keys()].filter(id=>set.has(id));};
/** The permissions and everything they include, in catalog order. Unknown ids are dropped. */
export function closure(index,ids){
  const found=new Set(),add=id=>{if(found.has(id)||!index.has(id))return;found.add(id);for(const d of index.get(id).includes||[])add(d);};
  for(const id of ids)add(id);return new Set(ordered(index,found));
}
/** closure(base ∪ granted ∪ {tasks.read}) without every permission whose closure meets revoked ∪ forbidden. */
export function compile(index,{base=[],granted=[],revoked=[],forbidden=[]}={}){
  const removed=new Set([...revoked,...forbidden]);removed.delete(TASKS_READ);
  return new Set([...closure(index,[...base,...granted,TASKS_READ])].filter(p=>![...closure(index,[p])].some(x=>removed.has(x))));
}
/** Permissions of `within` that need `id` (itself included). */
export const dependents=(index,id,within)=>ordered(index,[...within].filter(p=>closure(index,[p]).has(id)));
/** Turning a permission on turns on what it includes. Returns the new set and what came along. */
export function enable(index,effective,id){
  const next=new Set(effective),also=[];
  for(const p of closure(index,[id])){if(!next.has(p)&&p!==id)also.push(p);next.add(p);}
  return {effective:new Set(ordered(index,next)),also};
}
/** Turning a permission off turns off everything that depends on it. «Видеть задачи» stays: it is membership. */
export function disable(index,effective,id){
  if(id===TASKS_READ)return {effective:new Set(effective),also:[]};
  const gone=dependents(index,id,effective);
  return {effective:new Set(ordered(index,[...effective].filter(p=>!gone.includes(p)))),also:gone.filter(p=>p!==id)};
}
export const toggle=(index,effective,id,on)=>on?enable(index,effective,id):disable(index,effective,id);
/** What turning `id` on would bring along, or turning it off would take away (for hints before the click). */
export const wouldEnable=(index,effective,id)=>[...closure(index,[id])].filter(p=>p!==id&&!effective.has(p));
export const wouldDisable=(index,effective,id)=>dependents(index,id,effective).filter(p=>p!==id);
/** Elements of `set` not included by another element: the fewest additions that give the whole set. */
const tops=(index,items)=>{const set=new Set(items);return ordered(index,[...set].filter(x=>![...set].some(y=>y!==x&&closure(index,[y]).has(x))));};
/** Elements of `set` that include nothing else of it: the fewest removals that take the whole set away. */
const roots=(index,items)=>{const set=new Set(items);return ordered(index,[...set].filter(x=>[...closure(index,[x])].every(y=>y===x||!set.has(y))));};
/** The personal change that turns a preset into `effective`, as the server stores it: few added, few removed. */
export function difference(index,preset,effective){
  const base=closure(index,[...preset,TASKS_READ]),target=new Set(effective);
  return {granted:tops(index,[...target].filter(p=>!base.has(p))),revoked:roots(index,[...base].filter(p=>!target.has(p)&&p!==TASKS_READ))};
}
/** Where a permission of the editor comes from: 'preset', 'added', 'removed' or '' (neither in preset nor given). */
export function source(index,preset,effective,id){
  const base=closure(index,[...preset,TASKS_READ]),on=effective.has(id);
  return on?(base.has(id)?'preset':'added'):(base.has(id)?'removed':'');
}
/** A preset is within someone's reach when everything it gives is theirs. */
export const within=(index,preset,held)=>{const own=new Set(held);return [...closure(index,[...preset,TASKS_READ])].every(p=>own.has(p));};
